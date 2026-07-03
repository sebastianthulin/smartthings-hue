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

import { backend } from './backend.js';
import { AuthError } from './smartthings.js';
import { normalizeHome, sortHome } from './normalizer.ts';
import { toasts } from './toasts.ts';

const CACHE_KEY    = 'st_home_state';
const SYNC_INTERVAL = 30_000; // ms
const HOME_CONFIG_SYNC_INTERVAL = 5 * 60_000; // ms
const BRIGHTNESS_DEBOUNCE_MS = 180;
const COLOR_DEBOUNCE_MS = 120;
const MAIN_ROUTINE_SYNC_GRACE_PERIOD_MS = 3_000;
const DEFAULT_TURN_ON_CONFIRM_TIME = '21:00';
const MOCK_LOCATION_ID = 'mock-location';
const TIME_VALUE_PATTERN = /^\d{2}:\d{2}$/;

function createDefaultHomeConfig(locationId = null) {
  return {
    schemaVersion: 1,
    locationId,
    updatedAt: null,
    mainRoutines: {
      turnOnConfirmEnabled: true,
      turnOnConfirmTime: DEFAULT_TURN_ON_CONFIRM_TIME,
      turnOnSceneId: null,
      turnOffSceneId: null,
    },
    hiddenRoomIds: [],
    roomSettings: {},
  };
}

function normalizeStringIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
  )];
}

function normalizeHiddenRoomIds(hiddenRoomIds) {
  return normalizeStringIds(hiddenRoomIds);
}

function normalizeTimeValue(value, fallback = DEFAULT_TURN_ON_CONFIRM_TIME) {
  const normalizedValue = typeof value === 'string' ? value.trim() : '';
  if (isValidTimeValue(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = typeof fallback === 'string' ? fallback.trim() : '';
  return isValidTimeValue(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_TURN_ON_CONFIRM_TIME;
}

function isValidTimeValue(value) {
  if (!TIME_VALUE_PATTERN.test(value)) {
    return false;
  }

  const parts = value.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
}

function normalizeRoomSettings(roomSettings) {
  if (!roomSettings || typeof roomSettings !== 'object' || Array.isArray(roomSettings)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(roomSettings).map(([roomId, value]) => [
      roomId,
      {
        hiddenLightIds: normalizeStringIds(value?.hiddenLightIds),
        routineSceneIds: normalizeStringIds(value?.routineSceneIds),
      },
    ])
  );
}

function normalizeHomeConfig(locationId, homeConfig) {
  const config = homeConfig && typeof homeConfig === 'object' && !Array.isArray(homeConfig)
    ? homeConfig
    : {};
  const fallback = createDefaultHomeConfig(locationId);
  const updatedAt = Number(config.updatedAt);
  const roomSettings = normalizeRoomSettings(config.roomSettings);

  return {
    schemaVersion: 1,
    locationId,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : fallback.updatedAt,
    mainRoutines: {
      turnOnConfirmEnabled: typeof config.mainRoutines?.turnOnConfirmEnabled === 'boolean'
        ? config.mainRoutines.turnOnConfirmEnabled
        : fallback.mainRoutines.turnOnConfirmEnabled,
      turnOnConfirmTime: normalizeTimeValue(
        config.mainRoutines?.turnOnConfirmTime,
        fallback.mainRoutines.turnOnConfirmTime
      ),
      turnOnSceneId: typeof config.mainRoutines?.turnOnSceneId === 'string' && config.mainRoutines.turnOnSceneId.trim()
        ? config.mainRoutines.turnOnSceneId.trim()
        : null,
      turnOffSceneId: typeof config.mainRoutines?.turnOffSceneId === 'string' && config.mainRoutines.turnOffSceneId.trim()
        ? config.mainRoutines.turnOffSceneId.trim()
        : null,
    },
    hiddenRoomIds: normalizeHiddenRoomIds(config.hiddenRoomIds),
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

function readEmbeddedDeviceStatus(device) {
  const status = device?.status;
  return status?.components ? status : null;
}

function readEmbeddedDeviceHealth(device) {
  if (device?.healthState?.state) {
    return {
      deviceId: device.deviceId,
      state: device.healthState.state,
      lastUpdatedDate: device.healthState.lastUpdatedDate ?? null,
    };
  }

  if (device?.health?.state) {
    return {
      deviceId: device.deviceId,
      state: device.health.state,
      lastUpdatedDate: device.health.lastUpdatedDate ?? null,
    };
  }

  return null;
}

function getCurrentCacheMode() {
  return backend.authMode === 'mock' ? 'mock' : 'live';
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
  #sharedConfigEnabled = backend.sharedConfigEnabled;
  #sharedConfigLastSync = 0;
  #lightColorTimers = new Map();
  #lightColorTemperatureTimers = new Map();
  #lightLevelTimers = new Map();
  #roomLevelTimers  = new Map();
  #mainRoutineSyncTimer = null;

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
      this.#sharedConfigEnabled = backend.sharedConfigEnabled;
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
    this.#sharedConfigEnabled = backend.sharedConfigEnabled;
    if (this.#mainRoutineSyncTimer) {
      clearTimeout(this.#mainRoutineSyncTimer);
      this.#mainRoutineSyncTimer = null;
    }
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  /** Kick off background sync and keep it running. */
  startSync() {
    if (this.#syncTimer) {
      this.#syncOnce();
      return;
    }

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
      this.#sharedConfigEnabled = backend.sharedConfigEnabled;

      if (getCurrentCacheMode() === 'live' && this.#locationId === MOCK_LOCATION_ID) {
        this.#locationId = null;
      }

      const previousLocationId = this.#locationId;

      // Discover location on first sync
      if (!this.#locationId) {
        const locations = await backend.fetchLocations();
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
        backend.fetchRooms(this.#locationId),
        backend.fetchDevices(this.#locationId, {
          includeStatus: true,
          includeHealth: true,
        }),
      ]);

      const statusMap = {};
      const healthMap = {};
      const missingStatusIds = [];
      const missingHealthIds = [];

      for (const device of rawDevices) {
        const status = readEmbeddedDeviceStatus(device);
        if (status) {
          statusMap[device.deviceId] = status;
        } else {
          missingStatusIds.push(device.deviceId);
        }

        const health = readEmbeddedDeviceHealth(device);
        if (health) {
          healthMap[device.deviceId] = health;
        } else {
          missingHealthIds.push(device.deviceId);
        }
      }

      if (missingStatusIds.length || missingHealthIds.length) {
        const [statusSettled, healthSettled] = await Promise.all([
          Promise.allSettled(
            missingStatusIds.map(deviceId =>
              backend.fetchDeviceStatus(deviceId).then(status => [deviceId, status])
            )
          ),
          Promise.allSettled(
            missingHealthIds.map(deviceId =>
              backend.fetchDeviceHealth(deviceId).then(health => [deviceId, health])
            )
          ),
        ]);

        for (const result of statusSettled) {
          if (result.status === 'fulfilled') {
            const [deviceId, status] = result.value;
            statusMap[deviceId] = status;
          }
        }

        for (const result of healthSettled) {
          if (result.status === 'fulfilled') {
            const [deviceId, health] = result.value;
            healthMap[deviceId] = health;
          }
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
        target ? backend.switchOn(l.id) : backend.switchOff(l.id)
      )
    );
  }

  async setRoomPower(roomId, on) {
    const room = this.#findRoom(roomId);
    if (!room) return;

    const target = Boolean(on);
    if (room.lights.every(light => light.on === target)) {
      return;
    }

    room.lights.forEach(light => {
      light.on = target;
    });
    this.#emit();

    await Promise.allSettled(
      room.lights.map(light =>
        target ? backend.switchOn(light.id) : backend.switchOff(light.id)
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
      light.on ? backend.switchOn(lightId) : backend.switchOff(lightId),
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
      await Promise.allSettled([backend.setLevel(lightId, brightness)]);
    }, BRIGHTNESS_DEBOUNCE_MS));
  }

  async setLightColor(lightId, hue, saturation) {
    const light = this.#findLight(lightId);
    if (!light) return;

    const nextHue = Math.max(0, Math.min(100, Number(hue ?? 0)));
    const nextSaturation = Math.max(0, Math.min(100, Number(saturation ?? light.color?.saturation ?? 100)));

    light.color = {
      hue: nextHue,
      saturation: nextSaturation,
    };
    light.on = true;
    this.#emit();

    this.#clearLightColorTimer(lightId);
    this.#lightColorTimers.set(lightId, setTimeout(async () => {
      this.#lightColorTimers.delete(lightId);
      await Promise.allSettled([backend.setColor(lightId, nextHue, nextSaturation)]);
    }, COLOR_DEBOUNCE_MS));
  }

  async setLightColorTemperature(lightId, kelvin) {
    const light = this.#findLight(lightId);
    if (!light) return;

    const nextKelvin = Math.max(1500, Math.min(6500, Number(kelvin ?? light.colorTemp ?? 2700)));

    light.colorTemp = nextKelvin;
    light.on = true;
    this.#emit();

    this.#clearLightColorTemperatureTimer(lightId);
    this.#lightColorTemperatureTimers.set(lightId, setTimeout(async () => {
      this.#lightColorTemperatureTimers.delete(lightId);
      await Promise.allSettled([backend.setColorTemperature(lightId, nextKelvin)]);
    }, COLOR_DEBOUNCE_MS));
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
        activeLights.map(light => backend.setLevel(light.id, brightness))
      );
    }, BRIGHTNESS_DEBOUNCE_MS));
  }

  async ensureSharedHomeData({ force = false } = {}) {
    if (!this.#locationId || !this.#sharedConfigEnabled) {
      return false;
    }

    return this.#syncSharedHomeData({ force: force || this.#scenes.length === 0 });
  }

  async updateMainRoutines(mainRoutines) {
    return this.updateSharedSettings({ mainRoutines });
  }

  async updateSharedSettings({ mainRoutines, hiddenRoomIds, roomSettings } = {}) {
    if (!this.#locationId || !this.#sharedConfigEnabled) {
      return this.#snapshotHomeConfig();
    }

    const nextConfig = normalizeHomeConfig(this.#locationId, {
      ...this.#homeConfig,
      mainRoutines: {
        ...this.#homeConfig.mainRoutines,
        ...mainRoutines,
      },
      hiddenRoomIds: hiddenRoomIds ?? this.#homeConfig.hiddenRoomIds,
      roomSettings: roomSettings ?? this.#homeConfig.roomSettings,
    });

    if (
      nextConfig.mainRoutines.turnOnConfirmEnabled === this.#homeConfig.mainRoutines.turnOnConfirmEnabled
      && nextConfig.mainRoutines.turnOnConfirmTime === this.#homeConfig.mainRoutines.turnOnConfirmTime
      && nextConfig.mainRoutines.turnOnSceneId === this.#homeConfig.mainRoutines.turnOnSceneId
      && nextConfig.mainRoutines.turnOffSceneId === this.#homeConfig.mainRoutines.turnOffSceneId
      && JSON.stringify(nextConfig.hiddenRoomIds) === JSON.stringify(this.#homeConfig.hiddenRoomIds)
      && JSON.stringify(nextConfig.roomSettings) === JSON.stringify(this.#homeConfig.roomSettings)
    ) {
      return this.#snapshotHomeConfig();
    }

    const savedConfig = await backend.saveHomeConfig(this.#locationId, nextConfig);
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

    const target = type === 'turnOn';
    let didChange = false;

    for (const room of this.#rooms) {
      for (const light of room.lights) {
        if (light.on !== target) {
          light.on = target;
          didChange = true;
        }
      }
    }

    if (didChange) {
      this.#emit();
    }

    try {
      await backend.executeScene(sceneId, this.#locationId);
    } catch (error) {
      void this.#syncOnce();
      throw error;
    }

    if (this.#mainRoutineSyncTimer) {
      clearTimeout(this.#mainRoutineSyncTimer);
    }

    this.#mainRoutineSyncTimer = setTimeout(async () => {
      this.#mainRoutineSyncTimer = null;
      await this.#syncOnce();

      if (this.#rooms.some(room => room.lights.some(light => light.on !== target))) {
        toasts.show({
          tone: 'info',
          titleKey: 'home.toasts.mainRoutineCheckTitle',
          descriptionKey: target
            ? 'home.toasts.mainRoutineTurnOnCheckDescription'
            : 'home.toasts.mainRoutineTurnOffCheckDescription',
        });
      }
    }, MAIN_ROUTINE_SYNC_GRACE_PERIOD_MS);

    return true;
  }

  async updateRoomSettings(roomId, roomSettings) {
    if (!roomId) {
      return this.#snapshotHomeConfig();
    }

    const currentRoomSettings = this.#homeConfig.roomSettings?.[roomId] ?? {
      hiddenLightIds: [],
      routineSceneIds: [],
    };

    const nextRoomSettings = normalizeRoomSettings({
      ...this.#homeConfig.roomSettings,
      [roomId]: {
        hiddenLightIds: roomSettings?.hiddenLightIds ?? currentRoomSettings.hiddenLightIds,
        routineSceneIds: roomSettings?.routineSceneIds ?? currentRoomSettings.routineSceneIds,
      },
    });

    return this.updateSharedSettings({ roomSettings: nextRoomSettings });
  }

  async executeRoomRoutine(sceneId) {
    if (!this.#locationId || !sceneId) {
      return false;
    }

    await backend.executeScene(sceneId, this.#locationId);
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
      backend.fetchScenes(this.#locationId),
      backend.fetchHomeConfig(this.#locationId),
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

  #clearLightColorTimer(lightId) {
    const timer = this.#lightColorTimers.get(lightId);
    if (!timer) return;
    clearTimeout(timer);
    this.#lightColorTimers.delete(lightId);
  }

  #clearLightColorTemperatureTimer(lightId) {
    const timer = this.#lightColorTemperatureTimers.get(lightId);
    if (!timer) return;
    clearTimeout(timer);
    this.#lightColorTemperatureTimers.delete(lightId);
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
      hiddenRoomIds: [...(this.#homeConfig.hiddenRoomIds ?? [])],
      roomSettings: Object.fromEntries(
        Object.entries(this.#homeConfig.roomSettings ?? {}).map(([roomId, value]) => [
          roomId,
          {
            hiddenLightIds: [...(value.hiddenLightIds ?? [])],
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

export {
  createDefaultHomeConfig,
  inferCachedMode,
  isValidTimeValue,
  normalizeHomeConfig,
  normalizeRoomSettings,
  normalizeScenes,
  normalizeStringIds,
  normalizeTimeValue,
};
