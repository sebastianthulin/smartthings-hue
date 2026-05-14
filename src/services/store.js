/**
 * Home state store
 *
 * Responsibilities:
 *  - Maintain the normalized home model (Room[])
 *  - Cache to / rehydrate from localStorage
 *  - Sync with SmartThings in the background
 *  - Apply optimistic updates immediately
 *  - Emit 'update' events so components can react
 */

import { smartthings, AuthError } from './smartthings.js';
import { normalizeHome, sortHome } from './normalizer.js';

const CACHE_KEY    = 'st_home_state';
const SYNC_INTERVAL = 30_000; // ms
const HOME_CONFIG_SYNC_INTERVAL = 5 * 60_000; // ms
const BRIGHTNESS_DEBOUNCE_MS = 180;
const MOCK_LOCATION_ID = 'mock-location';

function createDefaultHomeConfig(locationId = null) {
  return {
    schemaVersion: 1,
    locationId,
    updatedAt: null,
    mainRoutines: {
      turnOnSceneId: null,
      turnOffSceneId: null,
    },
    roomSettings: {},
  };
}

function normalizeHomeConfig(locationId, homeConfig) {
  const config = homeConfig && typeof homeConfig === 'object' && !Array.isArray(homeConfig)
    ? homeConfig
    : {};
  const fallback = createDefaultHomeConfig(locationId);
  const updatedAt = Number(config.updatedAt);
  const roomSettings = config.roomSettings && typeof config.roomSettings === 'object' && !Array.isArray(config.roomSettings)
    ? Object.fromEntries(
      Object.entries(config.roomSettings).map(([roomId, value]) => [
        roomId,
        {
          routineSceneIds: Array.isArray(value?.routineSceneIds)
            ? [...new Set(value.routineSceneIds.filter(sceneId => typeof sceneId === 'string' && sceneId.trim()))]
            : [],
        },
      ])
    )
    : {};

  return {
    schemaVersion: 1,
    locationId,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : fallback.updatedAt,
    mainRoutines: {
      turnOnSceneId: typeof config.mainRoutines?.turnOnSceneId === 'string' && config.mainRoutines.turnOnSceneId.trim()
        ? config.mainRoutines.turnOnSceneId.trim()
        : null,
      turnOffSceneId: typeof config.mainRoutines?.turnOffSceneId === 'string' && config.mainRoutines.turnOffSceneId.trim()
        ? config.mainRoutines.turnOffSceneId.trim()
        : null,
    },
    roomSettings,
  };
}

function normalizeScenes(scenes) {
  if (!Array.isArray(scenes)) {
    return [];
  }

  const normalizedScenes = new Map();

  for (const scene of scenes) {
    const sceneId = typeof scene?.sceneId === 'string' ? scene.sceneId.trim() : '';
    if (!sceneId) {
      continue;
    }

    const sceneName = typeof scene?.sceneName === 'string' && scene.sceneName.trim()
      ? scene.sceneName.trim()
      : (typeof scene?.name === 'string' && scene.name.trim() ? scene.name.trim() : sceneId);

    normalizedScenes.set(sceneId, {
      sceneId,
      sceneName,
      locationId: typeof scene?.locationId === 'string' ? scene.locationId : null,
    });
  }

  return [...normalizedScenes.values()]
    .sort((left, right) => left.sceneName.localeCompare(right.sceneName));
}

function getCurrentCacheMode() {
  return smartthings.authMode === 'mock' ? 'mock' : 'live';
}

function inferCachedMode({ mode, locationId }) {
  if (mode === 'mock' || mode === 'live') {
    return mode;
  }

  return locationId === MOCK_LOCATION_ID ? 'mock' : 'live';
}

class HomeStore extends EventTarget {
  #rooms       = [];
  #syncing     = false;
  #syncTimer   = null;
  #lastSync    = null;
  #locationId  = null;
  #authError   = false;
  #homeConfig  = createDefaultHomeConfig();
  #scenes      = [];
  #sharedConfigEnabled = smartthings.sharedConfigEnabled;
  #sharedConfigLastSync = 0;
  #lightLevelTimers = new Map();
  #roomLevelTimers  = new Map();

  get rooms()     { return this.#snapshotRooms(); }
  get syncing()   { return this.#syncing; }
  get lastSync()  { return this.#lastSync; }
  get authError() { return this.#authError; }
  get homeConfig() { return this.#snapshotHomeConfig(); }
  get scenes() { return this.#snapshotScenes(); }
  get sharedConfigEnabled() { return this.#sharedConfigEnabled; }

  // ── Cache ──────────────────────────────────────────────────────────────────

  /** Load and emit cached home state immediately. Returns true if cache exists. */
  rehydrate() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const {
        rooms,
        lastSync,
        locationId,
        mode,
        homeConfig,
        scenes,
        sharedConfigLastSync,
      } = JSON.parse(raw);
      if (inferCachedMode({ mode, locationId }) !== getCurrentCacheMode()) {
        this.clearCache();
        return false;
      }

      this.#rooms      = sortHome(rooms ?? []);
      this.#lastSync   = lastSync   ?? null;
      this.#locationId = locationId ?? null;
      this.#sharedConfigEnabled = smartthings.sharedConfigEnabled;
      this.#homeConfig = normalizeHomeConfig(this.#locationId, homeConfig);
      this.#scenes = normalizeScenes(scenes);
      this.#sharedConfigLastSync = Number(sharedConfigLastSync) || 0;
      this.#emit();
      return true;
    } catch {
      return false;
    }
  }

  #save() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        rooms:      this.#rooms,
        lastSync:   this.#lastSync,
        locationId: this.#locationId,
        mode:       getCurrentCacheMode(),
        homeConfig: this.#homeConfig,
        scenes: this.#scenes,
        sharedConfigLastSync: this.#sharedConfigLastSync,
      }));
    } catch { /* storage full — silently ignore */ }
  }

  clearCache() {
    localStorage.removeItem(CACHE_KEY);
    this.#rooms = [];
    this.#locationId = null;
    this.#lastSync = null;
    this.#homeConfig = createDefaultHomeConfig();
    this.#scenes = [];
    this.#sharedConfigLastSync = 0;
    this.#sharedConfigEnabled = smartthings.sharedConfigEnabled;
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  /** Kick off background sync and keep it running. */
  startSync() {
    this.#syncOnce();
    this.#syncTimer = setInterval(() => this.#syncOnce(), SYNC_INTERVAL);
  }

  stopSync() {
    if (this.#syncTimer) {
      clearInterval(this.#syncTimer);
      this.#syncTimer = null;
    }
  }

  async #syncOnce() {
    if (this.#syncing) return;
    this.#syncing = true;
    this.#authError = false;
    this.dispatchEvent(new CustomEvent('syncing'));

    try {
      this.#sharedConfigEnabled = smartthings.sharedConfigEnabled;

      if (getCurrentCacheMode() === 'live' && this.#locationId === MOCK_LOCATION_ID) {
        this.#locationId = null;
      }

      const previousLocationId = this.#locationId;

      // Discover location on first sync
      if (!this.#locationId) {
        const locations = await smartthings.fetchLocations();
        if (!locations.length) throw new Error('No SmartThings locations found.');
        this.#locationId = locations[0].locationId;
      }

      const locationChanged = previousLocationId !== this.#locationId;

      if (locationChanged) {
        this.#homeConfig = normalizeHomeConfig(this.#locationId, null);
        this.#scenes = [];
        this.#sharedConfigLastSync = 0;
      }

      const sharedConfigPromise = this.#syncSharedHomeData({ force: locationChanged })
        .catch((error) => {
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
        });

      const [rawRooms, rawDevices] = await Promise.all([
        smartthings.fetchRooms(this.#locationId),
        smartthings.fetchDevices(this.#locationId),
      ]);

      // Fetch device statuses and health in parallel (best-effort)
      const [statusSettled, healthSettled] = await Promise.all([
        Promise.allSettled(
          rawDevices.map(d =>
            smartthings.fetchDeviceStatus(d.deviceId).then(s => [d.deviceId, s])
          )
        ),
        Promise.allSettled(
          rawDevices.map(d =>
            smartthings.fetchDeviceHealth(d.deviceId).then(h => [d.deviceId, h])
          )
        ),
      ]);

      const statusMap = {};
      for (const r of statusSettled) {
        if (r.status === 'fulfilled') {
          const [id, status] = r.value;
          statusMap[id] = status;
        }
      }

      const healthMap = {};
      for (const r of healthSettled) {
        if (r.status === 'fulfilled') {
          const [id, health] = r.value;
          healthMap[id] = health;
        }
      }

      this.#rooms    = normalizeHome(rawDevices, rawRooms, statusMap, healthMap);
      this.#lastSync = Date.now();
      this.#save();
      this.#emit();
      await sharedConfigPromise;
    } catch (err) {
      if (err instanceof AuthError) {
        this.#authError = true;
        this.stopSync();
      }
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    } finally {
      this.#syncing = false;
      this.dispatchEvent(new CustomEvent('synced'));
    }
  }

  // ── Optimistic updates ─────────────────────────────────────────────────────

  /** Toggle all lights in a room on/off. */
  async toggleRoom(roomId) {
    const room = this.#findRoom(roomId);
    if (!room) return;

    const anyOn = room.lights.some(l => l.on);
    const target = !anyOn;

    // Optimistic
    room.lights.forEach(l => (l.on = target));
    this.#emit();

    // Actual API — fire and forget
    await Promise.allSettled(
      room.lights.map(l =>
        target ? smartthings.switchOn(l.id) : smartthings.switchOff(l.id)
      )
    );
  }

  /** Toggle a single light. */
  async toggleLight(lightId) {
    const light = this.#findLight(lightId);
    if (!light) return;

    light.on = !light.on;
    this.#emit();

    await Promise.allSettled([
      light.on ? smartthings.switchOn(lightId) : smartthings.switchOff(lightId),
    ]);
  }

  /** Set brightness for a single light (0–100). */
  async setLightBrightness(lightId, brightness) {
    const light = this.#findLight(lightId);
    if (!light) return;

    const room = this.#findRoomByLight(lightId);
    if (room) {
      this.#clearRoomLevelTimer(room.id);
    }

    light.brightness = brightness;
    light.on = brightness > 0;
    this.#emit();

    this.#clearLightLevelTimer(lightId);
    this.#lightLevelTimers.set(lightId, setTimeout(async () => {
      this.#lightLevelTimers.delete(lightId);
      await Promise.allSettled([smartthings.setLevel(lightId, brightness)]);
    }, BRIGHTNESS_DEBOUNCE_MS));
  }

  /** Set brightness for all lights in a room. */
  async setRoomBrightness(roomId, brightness) {
    const room = this.#findRoom(roomId);
    if (!room) return;

    const activeLights = room.lights.filter(light => light.on);
    if (!activeLights.length) return;

    activeLights.forEach(light => {
      light.brightness = brightness;
      light.on = brightness > 0;
    });
    this.#emit();

    activeLights.forEach(light => this.#clearLightLevelTimer(light.id));
    this.#clearRoomLevelTimer(roomId);
    this.#roomLevelTimers.set(roomId, setTimeout(async () => {
      this.#roomLevelTimers.delete(roomId);
      await Promise.allSettled(
        activeLights.map(light => smartthings.setLevel(light.id, brightness))
      );
    }, BRIGHTNESS_DEBOUNCE_MS));
  }

  async updateMainRoutines(mainRoutines) {
    if (!this.#locationId || !this.#sharedConfigEnabled) {
      return this.#snapshotHomeConfig();
    }

    const nextConfig = normalizeHomeConfig(this.#locationId, {
      ...this.#homeConfig,
      mainRoutines: {
        ...this.#homeConfig.mainRoutines,
        ...mainRoutines,
      },
    });

    if (
      nextConfig.mainRoutines.turnOnSceneId === this.#homeConfig.mainRoutines.turnOnSceneId
      && nextConfig.mainRoutines.turnOffSceneId === this.#homeConfig.mainRoutines.turnOffSceneId
    ) {
      return this.#snapshotHomeConfig();
    }

    const savedConfig = await smartthings.saveHomeConfig(this.#locationId, nextConfig);
    this.#homeConfig = normalizeHomeConfig(this.#locationId, savedConfig);
    this.#sharedConfigLastSync = Date.now();
    this.#save();
    this.#emit();
    return this.#snapshotHomeConfig();
  }

  async executeMainRoutine(type) {
    if (!this.#locationId) {
      return false;
    }

    const sceneId = type === 'turnOn'
      ? this.#homeConfig.mainRoutines.turnOnSceneId
      : this.#homeConfig.mainRoutines.turnOffSceneId;

    if (!sceneId) {
      return false;
    }

    await smartthings.executeScene(sceneId, this.#locationId);
    void this.#syncOnce();
    return true;
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  async #syncSharedHomeData({ force = false } = {}) {
    if (!this.#sharedConfigEnabled || !this.#locationId) {
      return false;
    }

    const lastSyncAge = Date.now() - this.#sharedConfigLastSync;
    if (!force && this.#sharedConfigLastSync && lastSyncAge < HOME_CONFIG_SYNC_INTERVAL) {
      return false;
    }

    const [scenes, homeConfig] = await Promise.all([
      smartthings.fetchScenes(this.#locationId),
      smartthings.fetchHomeConfig(this.#locationId),
    ]);

    this.#scenes = normalizeScenes(scenes);
    this.#homeConfig = normalizeHomeConfig(this.#locationId, homeConfig);
    this.#sharedConfigLastSync = Date.now();
    this.#save();
    this.#emit();
    return true;
  }

  #findRoom(roomId) {
    return this.#rooms.find(r => r.id === roomId) ?? null;
  }

  #findLight(lightId) {
    for (const room of this.#rooms) {
      const light = room.lights.find(l => l.id === lightId);
      if (light) return light;
    }
    return null;
  }

  #findRoomByLight(lightId) {
    for (const room of this.#rooms) {
      if (room.lights.some(light => light.id === lightId)) {
        return room;
      }
    }
    return null;
  }

  #clearLightLevelTimer(lightId) {
    const timer = this.#lightLevelTimers.get(lightId);
    if (!timer) return;
    clearTimeout(timer);
    this.#lightLevelTimers.delete(lightId);
  }

  #clearRoomLevelTimer(roomId) {
    const timer = this.#roomLevelTimers.get(roomId);
    if (!timer) return;
    clearTimeout(timer);
    this.#roomLevelTimers.delete(roomId);
  }

  #snapshotRooms() {
    return this.#rooms.map(room => ({
      ...room,
      climate: room.climate ? { ...room.climate } : null,
      lights: room.lights.map(light => ({
        ...light,
        color: light.color ? { ...light.color } : undefined,
      })),
    }));
  }

  #snapshotHomeConfig() {
    return {
      ...this.#homeConfig,
      mainRoutines: {
        ...this.#homeConfig.mainRoutines,
      },
      roomSettings: Object.fromEntries(
        Object.entries(this.#homeConfig.roomSettings ?? {}).map(([roomId, value]) => [
          roomId,
          {
            routineSceneIds: [...(value.routineSceneIds ?? [])],
          },
        ])
      ),
    };
  }

  #snapshotScenes() {
    return this.#scenes.map(scene => ({ ...scene }));
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('update', {
      detail: {
        rooms: this.#snapshotRooms(),
        homeConfig: this.#snapshotHomeConfig(),
        scenes: this.#snapshotScenes(),
        sharedConfigEnabled: this.#sharedConfigEnabled,
      },
    }));
  }
}

/** Singleton store — import and use everywhere. */
export const store = new HomeStore();
