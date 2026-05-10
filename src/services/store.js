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
import { normalizeHome } from './normalizer.js';

const CACHE_KEY    = 'st_home_state';
const SYNC_INTERVAL = 30_000; // ms
const BRIGHTNESS_DEBOUNCE_MS = 180;

class HomeStore extends EventTarget {
  #rooms       = [];
  #syncing     = false;
  #syncTimer   = null;
  #lastSync    = null;
  #locationId  = null;
  #authError   = false;
  #lightLevelTimers = new Map();
  #roomLevelTimers  = new Map();

  get rooms()     { return this.#snapshotRooms(); }
  get syncing()   { return this.#syncing; }
  get lastSync()  { return this.#lastSync; }
  get authError() { return this.#authError; }

  // ── Cache ──────────────────────────────────────────────────────────────────

  /** Load and emit cached home state immediately. Returns true if cache exists. */
  rehydrate() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const { rooms, lastSync, locationId } = JSON.parse(raw);
      this.#rooms      = rooms      ?? [];
      this.#lastSync   = lastSync   ?? null;
      this.#locationId = locationId ?? null;
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
      }));
    } catch { /* storage full — silently ignore */ }
  }

  clearCache() {
    localStorage.removeItem(CACHE_KEY);
    this.#rooms = [];
    this.#locationId = null;
    this.#lastSync = null;
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
      // Discover location on first sync
      if (!this.#locationId) {
        const locations = await smartthings.fetchLocations();
        if (!locations.length) throw new Error('No SmartThings locations found.');
        this.#locationId = locations[0].locationId;
      }

      const [rawRooms, rawDevices] = await Promise.all([
        smartthings.fetchRooms(this.#locationId),
        smartthings.fetchDevices(this.#locationId),
      ]);

      // Fetch device statuses in parallel (best-effort)
      const settled = await Promise.allSettled(
        rawDevices.map(d =>
          smartthings.fetchDeviceStatus(d.deviceId).then(s => [d.deviceId, s])
        )
      );

      const statusMap = {};
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          const [id, status] = r.value;
          statusMap[id] = status;
        }
      }

      this.#rooms    = normalizeHome(rawDevices, rawRooms, statusMap);
      this.#lastSync = Date.now();
      this.#save();
      this.#emit();
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

    room.lights.forEach(l => {
      l.brightness = brightness;
      l.on = brightness > 0;
    });
    this.#emit();

    room.lights.forEach(light => this.#clearLightLevelTimer(light.id));
    this.#clearRoomLevelTimer(roomId);
    this.#roomLevelTimers.set(roomId, setTimeout(async () => {
      this.#roomLevelTimers.delete(roomId);
      await Promise.allSettled(
        room.lights.map(light => smartthings.setLevel(light.id, brightness))
      );
    }, BRIGHTNESS_DEBOUNCE_MS));
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

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

  #emit() {
    this.dispatchEvent(new CustomEvent('update', { detail: { rooms: this.#snapshotRooms() } }));
  }
}

/** Singleton store — import and use everywhere. */
export const store = new HomeStore();
