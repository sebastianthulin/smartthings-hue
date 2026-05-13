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
const AUTHORIZE_URL = import.meta.env.VITE_SMARTTHINGS_AUTHORIZE_URL ?? 'https://api.smartthings.com/oauth/authorize';
const BROKER_BASE_URL = (import.meta.env.VITE_SMARTTHINGS_BROKER_URL ?? '').replace(/\/$/, '');
const OAUTH_CLIENT_ID = import.meta.env.VITE_SMARTTHINGS_CLIENT_ID ?? '';
const OAUTH_SCOPE = import.meta.env.VITE_SMARTTHINGS_SCOPES
  ?? 'r:locations:* r:devices:* x:devices:* r:scenes:* x:scenes:*';
const LEGACY_TOKEN_KEY = 'st_token';
const SESSION_KEY = 'st_oauth_session';
const STATE_KEY = 'st_oauth_state';
const REFRESH_LEEWAY_MS = 60_000;

const hasOAuthConfig = () => !!OAUTH_CLIENT_ID || !!BROKER_BASE_URL;

function createMessageDescriptor(key, values) {
  return { key, values };
}

function isUrlParseError(error) {
  return error instanceof TypeError && /failed to parse url/i.test(error.message);
}

function describeOAuthRedirectError(error, description) {
  if (error === 'access_denied') {
    return createMessageDescriptor('tokenSetup.errors.oauthCanceled');
  }

  if (/redirect_uri/i.test(description ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthRedirectMismatch');
  }

  if (/scope|permission/i.test(description ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthPermissions');
  }

  return createMessageDescriptor('tokenSetup.errors.invalid');
}

function describeBrokerError(status, message) {
  if (/scope|permission/i.test(message ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthPermissions');
  }

  if (/redirect_uri/i.test(message ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthRedirectMismatch');
  }

  if (status === 503 || /broker_not_configured|not configured/i.test(message ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthBrokerConfig');
  }

  return createMessageDescriptor('tokenSetup.errors.invalid');
}

export const SUPPORTED_CAPABILITIES = new Set([
  'switch',
  'switchLevel',
  'colorControl',
  'colorTemperature',
  'temperatureMeasurement',
  'relativeHumidityMeasurement',
  'occupancySensor',
  'motionSensor',
  'presenceSensor',
  'movementSensor',
  'multipleZonePresence',
]);

function readStorage(key, storage = localStorage) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value, storage = localStorage) {
  try {
    if (value == null) {
      storage.removeItem(key);
      return;
    }

    storage.setItem(key, value);
  } catch {
    // Ignore browsers that block storage.
  }
}

function createStateToken() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class SmartThingsAPI {
  #session = null;

  constructor() {
    this.#session = this.#readSession();

    const legacyToken = readStorage(LEGACY_TOKEN_KEY)?.trim();
    if (!this.#session && legacyToken) {
      this.#persistSession({
        accessToken: legacyToken,
        refreshToken: null,
        expiresAt: null,
        scope: '',
        tokenType: 'Bearer',
      });
    }
  }

  get hasToken() {
    return isMockSmartThingsEnabled() || !!this.#session?.accessToken;
  }

  get isConfigured() {
    return isMockSmartThingsEnabled() || (!!OAUTH_CLIENT_ID && !!BROKER_BASE_URL);
  }

  get authMode() {
    if (isMockSmartThingsEnabled()) {
      return 'mock';
    }

    return hasOAuthConfig() ? 'oauth' : 'token';
  }

  get authConfigError() {
    if (isMockSmartThingsEnabled()) {
      return '';
    }

    if (!hasOAuthConfig()) {
      return '';
    }

    if (!OAUTH_CLIENT_ID) {
      return createMessageDescriptor('tokenSetup.errors.oauthMissingClientId');
    }

    if (!BROKER_BASE_URL) {
      return createMessageDescriptor('tokenSetup.errors.oauthMissingBrokerUrl');
    }

    return '';
  }

  setToken(token) {
    const accessToken = token.trim();

    if (!accessToken) {
      this.clearToken();
      return;
    }

    this.#persistSession({
      accessToken,
      refreshToken: null,
      expiresAt: null,
      scope: '',
      tokenType: 'Bearer',
    });
  }

  clearToken() {
    this.#session = null;
    writeStorage(SESSION_KEY, null);
    writeStorage(LEGACY_TOKEN_KEY, null);
    writeStorage(STATE_KEY, null);
  }

  async maybeCompleteLoginFromRedirect() {
    if (isMockSmartThingsEnabled()) {
      return false;
    }

    const url = new URL(window.location.href);
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!error && !code) {
      return false;
    }

    this.#cleanupAuthParams(url);

    if (error) {
      throw new AuthError(errorDescription ?? error, {
        descriptor: describeOAuthRedirectError(error, errorDescription),
      });
    }

    const expectedState = readStorage(STATE_KEY);
    writeStorage(STATE_KEY, null);

    if (!code || !state || state !== expectedState) {
      throw new AuthError('SmartThings sign-in could not be verified. Please try again.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.oauthVerify'),
      });
    }

    const response = await this.#brokerRequest('/smartthings/exchange', {
      code,
      redirectUri: this.getRedirectUri(),
    });

    this.#persistSession(this.#normalizeTokenResponse(response));
    return true;
  }

  startLogin() {
    if (isMockSmartThingsEnabled()) {
      return;
    }

    if (!this.isConfigured) {
      const descriptor = this.authConfigError || createMessageDescriptor('tokenSetup.errors.oauthBrokerConfig');
      throw new ConfigError('SmartThings OAuth is not configured.', {
        descriptor,
      });
    }

    const state = createStateToken();
    // OAuth can return in a different browser context than the one that started it,
    // especially from installed PWAs on mobile. Persist state across that handoff.
    writeStorage(STATE_KEY, state);

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', OAUTH_CLIENT_ID);
    url.searchParams.set('scope', OAUTH_SCOPE);
    url.searchParams.set('redirect_uri', this.getRedirectUri());
    url.searchParams.set('state', state);

    window.location.assign(url.toString());
  }

  getRedirectUri() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async refreshSession() {
    if (!this.#session?.refreshToken) {
      throw new AuthError('SmartThings session has expired. Please sign in again.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.expired'),
      });
    }

    const response = await this.#brokerRequest('/smartthings/refresh', {
      refreshToken: this.#session.refreshToken,
    });

    this.#persistSession(this.#normalizeTokenResponse(response, {
      fallbackRefreshToken: this.#session.refreshToken,
    }));

    return this.#session.accessToken;
  }

  async #request(path, options = {}, canRetryAuth = true) {
    if (isMockSmartThingsEnabled()) {
      return handleMockSmartThingsRequest(path, options);
    }

    const accessToken = await this.#ensureAccessToken();

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (res.status === 401) {
      if (canRetryAuth && this.#session?.refreshToken) {
        try {
          await this.refreshSession();
        } catch {
          this.clearToken();
          throw new AuthError('SmartThings session is invalid or expired.', {
            descriptor: createMessageDescriptor('tokenSetup.errors.expired'),
          });
        }

        return this.#request(path, options, false);
      }

      this.clearToken();
      throw new AuthError('SmartThings session is invalid or expired.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.expired'),
      });
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

  /** Fetch full status for one device. */
  async fetchDeviceStatus(deviceId) {
    return this.#request(`/devices/${deviceId}/status`);
  }

  /** Fetch connectivity health for one device. */
  async fetchDeviceHealth(deviceId) {
    return this.#request(`/devices/${deviceId}/health`);
  }

  /**
   * Send commands to a device.
   * @param {string} deviceId
   * @param {Array<{component, capability, command, arguments?}>} commands
   */
  async sendCommand(deviceId, commands) {
    return this.#post(`/devices/${deviceId}/commands`, { commands });
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

  #readSession() {
    const raw = readStorage(SESSION_KEY);
    if (!raw) {
      return null;
    }

    try {
      const session = JSON.parse(raw);
      if (!session?.accessToken) {
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  #persistSession(session) {
    this.#session = session;
    writeStorage(SESSION_KEY, JSON.stringify(session));
    writeStorage(LEGACY_TOKEN_KEY, null);
  }

  #normalizeTokenResponse(payload, { fallbackRefreshToken = null } = {}) {
    const accessToken = (payload.access_token ?? payload.accessToken ?? '').trim();
    const refreshToken = (payload.refresh_token ?? payload.refreshToken ?? fallbackRefreshToken ?? '').trim();
    const expiresIn = Number(payload.expires_in ?? payload.expiresIn ?? 0);

    if (!accessToken) {
      throw new Error('SmartThings OAuth response did not include an access token.');
    }

    return {
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0
        ? Date.now() + (expiresIn * 1000)
        : null,
      scope: payload.scope ?? '',
      tokenType: payload.token_type ?? payload.tokenType ?? 'Bearer',
    };
  }

  async #ensureAccessToken() {
    if (!this.#session?.accessToken) {
      throw new Error('No SmartThings session configured.');
    }

    if (!this.#session.expiresAt) {
      return this.#session.accessToken;
    }

    if (this.#session.expiresAt > Date.now() + REFRESH_LEEWAY_MS) {
      return this.#session.accessToken;
    }

    if (!this.#session.refreshToken) {
      this.clearToken();
      throw new AuthError('SmartThings session has expired. Please sign in again.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.expired'),
      });
    }

    return this.refreshSession();
  }

  async #brokerRequest(path, payload) {
    if (!BROKER_BASE_URL) {
      throw new ConfigError('SmartThings OAuth broker URL is not configured.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.oauthMissingBrokerUrl'),
      });
    }

    const requestUrl = `${BROKER_BASE_URL}${path}`;
    let res;

    try {
      res = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (isUrlParseError(error)) {
        throw new ConfigError('SmartThings OAuth broker URL is invalid.', {
          descriptor: createMessageDescriptor('tokenSetup.errors.oauthBrokerConfig'),
        });
      }

      throw new AuthError('Could not reach the SmartThings OAuth broker.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.oauthBrokerUnavailable'),
      });
    }

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : { error: await res.text() };

    if (!res.ok) {
      const message = body.error_description ?? body.error ?? `SmartThings OAuth broker error ${res.status}.`;

      throw new AuthError(message, {
        descriptor: describeBrokerError(res.status, message),
      });
    }

    return body;
  }

  #cleanupAuthParams(url = new URL(window.location.href)) {
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');

    const search = url.searchParams.toString();
    const cleanUrl = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

export class AuthError extends Error {
  constructor(msg, { descriptor } = {}) {
    super(msg);
    this.name = 'AuthError';
    this.messageDescriptor = descriptor ?? null;
  }
}

export class ConfigError extends Error {
  constructor(msg, { descriptor } = {}) {
    super(msg);
    this.name = 'ConfigError';
    this.messageDescriptor = descriptor ?? null;
  }
}

export const smartthings = new SmartThingsAPI();
