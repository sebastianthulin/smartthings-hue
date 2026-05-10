/**
 * SmartThings API service
 * Handles all direct communication with the SmartThings REST API.
 * Only exposes whitelisted capabilities; all internals stay here.
 */

import {
  handleMockSmartThingsRequest,
  isMockSmartThingsEnabled,
} from './smartthings.mock.js';

const API_BASE = 'https://api.smartthings.com/v1';

export const SUPPORTED_CAPABILITIES = new Set([
  'switch',
  'switchLevel',
  'colorControl',
  'colorTemperature',
  'temperatureMeasurement',
  'relativeHumidityMeasurement',
  'occupancySensor',
  'motionSensor',
]);

class SmartThingsAPI {
  #token = null;

  constructor() {
    this.#token = localStorage.getItem('st_token');
  }

  get hasToken() {
    return isMockSmartThingsEnabled() || !!this.#token;
  }

  setToken(token) {
    this.#token = token.trim();
    localStorage.setItem('st_token', this.#token);
  }

  clearToken() {
    this.#token = null;
    localStorage.removeItem('st_token');
  }

  async #request(path, options = {}) {
    if (isMockSmartThingsEnabled()) {
      return handleMockSmartThingsRequest(path, options);
    }

    if (!this.#token) throw new Error('No SmartThings token configured.');

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (res.status === 401) {
      throw new AuthError('SmartThings token is invalid or expired.');
    }
    if (!res.ok) {
      throw new Error(`SmartThings API error ${res.status}: ${res.statusText}`);
    }

    return res.json();
  }

  async #post(path, body) {
    return this.#request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /** Fetch all locations for this token. */
  async fetchLocations() {
    const data = await this.#request('/locations');
    return data.items ?? [];
  }

  /** Fetch rooms for a specific location. */
  async fetchRooms(locationId) {
    const data = await this.#request(`/locations/${locationId}/rooms`);
    return data.items ?? [];
  }

  /** Fetch all devices (optionally scoped to a location). */
  async fetchDevices(locationId) {
    const qs = locationId ? `?locationId=${locationId}` : '';
    const data = await this.#request(`/devices${qs}`);
    return data.items ?? [];
  }

  /** Fetch available scenes/routines for this location. */
  async fetchScenes(locationId) {
    const data = await this.#request('/scenes');
    const items = data.items ?? [];

    return items
      .filter(scene => !locationId || !scene.locationId || scene.locationId === locationId)
      .map(scene => ({
        id: scene.sceneId ?? scene.id ?? '',
        name: scene.sceneName ?? scene.name ?? 'Scene',
      }))
      .filter(scene => scene.id);
  }

  /** Fetch full status for one device. */
  async fetchDeviceStatus(deviceId) {
    return this.#request(`/devices/${deviceId}/status`);
  }

  /**
   * Send commands to a device.
   * @param {string} deviceId
   * @param {Array<{component, capability, command, arguments?}>} commands
   */
  async sendCommand(deviceId, commands) {
    return this.#post(`/devices/${deviceId}/commands`, { commands });
  }

  async executeScene(sceneId) {
    return this.#request(`/scenes/${sceneId}/execute`, {
      method: 'POST',
    });
  }

  // ── Convenience command helpers ────────────────────────────────────────────

  async switchOn(deviceId) {
    return this.sendCommand(deviceId, [
      { component: 'main', capability: 'switch', command: 'on' },
    ]);
  }

  async switchOff(deviceId) {
    return this.sendCommand(deviceId, [
      { component: 'main', capability: 'switch', command: 'off' },
    ]);
  }

  async setLevel(deviceId, level) {
    return this.sendCommand(deviceId, [
      {
        component: 'main',
        capability: 'switchLevel',
        command: 'setLevel',
        arguments: [Math.round(Math.max(0, Math.min(100, level)))],
      },
    ]);
  }

  async setColor(deviceId, hue, saturation) {
    return this.sendCommand(deviceId, [
      {
        component: 'main',
        capability: 'colorControl',
        command: 'setColor',
        arguments: [{ hue, saturation }],
      },
    ]);
  }

  async setColorTemperature(deviceId, kelvin) {
    return this.sendCommand(deviceId, [
      {
        component: 'main',
        capability: 'colorTemperature',
        command: 'setColorTemperature',
        arguments: [kelvin],
      },
    ]);
  }
}

export class AuthError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'AuthError';
  }
}

export const smartthings = new SmartThingsAPI();
