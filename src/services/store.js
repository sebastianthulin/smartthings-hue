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

class HomeStore extends EventTarget {
  #rooms       = [];
  #scenes      = [];
  #syncing     = false;
  #syncTimer   = null;
  #lastSync    = null;
  #locationId  = null;
  #authError   = false;

  get rooms()     { return this.#rooms; }
  get scenes()    { return this.#scenes; }
  get syncing()   { return this.#syncing; }
  get lastSync()  { return this.#lastSync; }
  get authError() { return this.#authError; }

  // ── Cache ──────────────────────────────────────────────────────────────────

  /** Load and emit cached home state immediately. Returns true if cache exists. */
  rehydrate() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const { rooms, scenes, lastSync, locationId } = JSON.parse(raw);
      this.#rooms      = rooms      ?? [];
      this.#scenes     = scenes     ?? [];
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
        scenes:     this.#scenes,
        lastSync:   this.#lastSync,
        locationId: this.#locationId,
      }));
    } catch { /* storage full — silently ignore */ }
  }

  clearCache() {
    localStorage.removeItem(CACHE_KEY);
    this.#rooms = [];
    this.#scenes = [];
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

      const [rawRooms, rawDevices, rawScenes] = await Promise.all([
        smartthings.fetchRooms(this.#locationId),
        smartthings.fetchDevices(this.#locationId),
        smartthings.fetchScenes().catch(err => {
          console.warn('SmartThings scenes could not be synced.', err);
          return [];
        }),
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
      this.#scenes   = normalizeScenes(rawScenes, this.#locationId);
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

    light.brightness = brightness;
    light.on = brightness > 0;
    this.#emit();

    await Promise.allSettled([smartthings.setLevel(lightId, brightness)]);
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

    await Promise.allSettled(
      room.lights.map(l => smartthings.setLevel(l.id, brightness))
    );
  }

  async executeScene(sceneId) {
    if (!sceneId) return;
    await smartthings.executeScene(sceneId);
    await this.#syncOnce();
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

  #emit() {
    this.dispatchEvent(new CustomEvent('update', {
      detail: {
        rooms: this.#rooms,
        scenes: this.#scenes,
      },
    }));
  }
}

/** Singleton store — import and use everywhere. */
export const store = new HomeStore();

function normalizeScenes(rawScenes, locationId) {
  return (rawScenes ?? [])
    .filter(scene => !locationId || !scene.locationId || scene.locationId === locationId)
    .map(scene => ({
      id: scene.sceneId,
      name: scene.sceneName || scene.name || 'Scene',
    }))
    .filter(scene => scene.id && scene.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
