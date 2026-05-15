/**
 * SmartThings API service
 * Handles all direct communication with the SmartThings REST API.
 * Only exposes whitelisted capabilities; all internals stay here.
 */

import {
  getMockHomeConfig,
  handleMockSmartThingsRequest,
  isMockSmartThingsEnabled,
  saveMockHomeConfig,
} from './smartthings.mock.js';
import { i18n } from './i18n.js';

const API_BASE = 'https://api.smartthings.com/v1';
const LEGACY_BROKER_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_SMARTTHINGS_BROKER_URL ?? '');
const EXPLICIT_AUTH_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_SMARTTHINGS_AUTH_URL ?? '');
const EXPLICIT_SERVICE_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_SMARTTHINGS_SERVICE_URL ?? '');
const AUTH_BASE_URL = EXPLICIT_AUTH_BASE_URL
  || swapSubdomain(EXPLICIT_SERVICE_BASE_URL, 'service', 'auth')
  || LEGACY_BROKER_BASE_URL;
const SERVICE_BASE_URL = EXPLICIT_SERVICE_BASE_URL
  || swapSubdomain(EXPLICIT_AUTH_BASE_URL || LEGACY_BROKER_BASE_URL, 'auth', 'service')
  || AUTH_BASE_URL;
const OAUTH_CLIENT_ID = import.meta.env.VITE_SMARTTHINGS_CLIENT_ID ?? '';
const OAUTH_SCOPE = import.meta.env.VITE_SMARTTHINGS_SCOPES
  ?? 'r:locations:* r:devices:* x:devices:* r:scenes:* x:scenes:*';
const LEGACY_TOKEN_KEY = 'st_token';
const SESSION_KEY = 'st_oauth_session';
const STATE_KEY = 'st_oauth_state';
const PENDING_AUTH_KEY = 'st_oauth_pending';
const AUTH_NOTICE_KEY = 'st_auth_notice';
const REFRESH_LEEWAY_MS = 60_000;
const AUTH_RELAY_TTL_MS = 5 * 60 * 1000;
const AUTH_RELAY_POLL_INTERVAL_MS = 2_000;
const HOME_CONFIG_CACHE_KEY_PREFIX = 'st_home_config_cache:';
const HOME_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

const hasOAuthConfig = () => !!OAUTH_CLIENT_ID || !!AUTH_BASE_URL;

function normalizeBaseUrl(value) {
  return (value ?? '').trim().replace(/\/$/, '');
}

function swapSubdomain(baseUrl, fromSubdomain, toSubdomain) {
  if (!baseUrl) {
    return '';
  }

  try {
    const url = new URL(baseUrl);
    const hostParts = url.hostname.split('.');

    if (hostParts.length < 3 || hostParts[0] !== fromSubdomain) {
      return '';
    }

    hostParts[0] = toSubdomain;
    url.hostname = hostParts.join('.');
    return normalizeBaseUrl(url.toString());
  } catch {
    return '';
  }
}

function createMessageDescriptor(key, values, detail = '') {
  return { key, values, detail };
}

function isUrlParseError(error) {
  return error instanceof TypeError && /failed to parse url/i.test(error.message);
}

function describeOAuthRedirectError(error, description) {
  if (error === 'access_denied') {
    return createMessageDescriptor(
      'tokenSetup.errors.oauthCanceled',
      undefined,
      `error=${error}${description ? `, description=${description}` : ''}`,
    );
  }

  if (/redirect_uri/i.test(description ?? '')) {
    return createMessageDescriptor(
      'tokenSetup.errors.oauthRedirectMismatch',
      undefined,
      `error=${error}${description ? `, description=${description}` : ''}`,
    );
  }

  if (/scope|permission/i.test(description ?? '')) {
    return createMessageDescriptor(
      'tokenSetup.errors.oauthPermissions',
      undefined,
      `error=${error}${description ? `, description=${description}` : ''}`,
    );
  }

  return createMessageDescriptor(
    'tokenSetup.errors.invalid',
    undefined,
    `error=${error}${description ? `, description=${description}` : ''}`,
  );
}

function describeBrokerError(status, message) {
  if (/scope|permission/i.test(message ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthPermissions', undefined, `status=${status}, message=${message}`);
  }

  if (/redirect_uri/i.test(message ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthRedirectMismatch', undefined, `status=${status}, message=${message}`);
  }

  if (status === 503 || /broker_not_configured|not configured/i.test(message ?? '')) {
    return createMessageDescriptor('tokenSetup.errors.oauthBrokerConfig', undefined, `status=${status}, message=${message}`);
  }

  return createMessageDescriptor('tokenSetup.errors.invalid', undefined, `status=${status}, message=${message}`);
}

function describeRelayError(payload) {
  if (payload?.error === 'access_denied') {
    return {
      ...describeOAuthRedirectError(payload.error, payload.errorDescription),
      detail: formatDebugDetail(payload),
    };
  }

  if (payload?.upstreamStatus || payload?.upstreamError || payload?.upstreamErrorDescription) {
    return {
      ...describeBrokerError(
        payload.upstreamStatus ?? 400,
        payload.upstreamErrorDescription ?? payload.upstreamError ?? payload.error ?? 'SmartThings OAuth failed.',
      ),
      detail: formatDebugDetail(payload),
    };
  }

  return {
    ...createMessageDescriptor('tokenSetup.errors.invalid'),
    detail: formatDebugDetail(payload),
  };
}

function formatDebugDetail(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
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

function getHomeConfigCacheKey(locationId) {
  return `${HOME_CONFIG_CACHE_KEY_PREFIX}${locationId}`;
}

function readHomeConfigCache(locationId, storage = localStorage) {
  if (!locationId) {
    return { hit: false, value: null };
  }

  const rawValue = readStorage(getHomeConfigCacheKey(locationId), storage);

  if (!rawValue) {
    return { hit: false, value: null };
  }

  try {
    const payload = JSON.parse(rawValue);

    if (!payload || payload.expiresAt <= Date.now()) {
      writeStorage(getHomeConfigCacheKey(locationId), null, storage);
      return { hit: false, value: null };
    }

    return { hit: true, value: payload.value ?? null };
  } catch {
    writeStorage(getHomeConfigCacheKey(locationId), null, storage);
    return { hit: false, value: null };
  }
}

function writeHomeConfigCache(locationId, value, storage = localStorage) {
  if (!locationId) {
    return;
  }

  writeStorage(getHomeConfigCacheKey(locationId), JSON.stringify({
    expiresAt: Date.now() + HOME_CONFIG_CACHE_TTL_MS,
    value: value ?? null,
  }), storage);
}

function clearHomeConfigCaches(storage = localStorage) {
  try {
    for (let storageIndex = storage.length - 1; storageIndex >= 0; storageIndex -= 1) {
      const key = storage.key(storageIndex);

      if (key?.startsWith(HOME_CONFIG_CACHE_KEY_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Ignore browsers that block storage.
  }
}

function createStateToken() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isStandaloneDisplayMode() {
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
}

function buildAuthWindowMarkup({ language, badge, title, message }) {
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
        background:
          radial-gradient(circle at top, rgba(245, 197, 66, 0.18), transparent 40%),
          linear-gradient(180deg, #09131a, #121923);
        color: #f8fafc;
        font: 16px/1.5 system-ui, sans-serif;
      }
      main {
        width: min(100%, 440px);
        padding: 28px;
        box-sizing: border-box;
        border-radius: 28px;
        background: rgba(18, 26, 36, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(18px);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #cbd5e1;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .eyebrow::before {
        content: '';
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #f5c542;
        box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.04);
      }
      h1 {
        margin: 18px 0 12px;
        font-size: clamp(1.4rem, 4vw, 1.9rem);
        line-height: 1.15;
        letter-spacing: -0.03em;
      }
      p {
        margin: 0;
        color: #cbd5e1;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="eyebrow">${badge}</span>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`;
}

function writeAuthPopupPlaceholder(popup) {
  if (!popup || popup.closed) {
    return;
  }

  try {
    popup.document.write(buildAuthWindowMarkup({
      language: i18n.language,
      badge: i18n.t('authRelay.badge'),
      title: i18n.t('authRelay.placeholder.title'),
      message: i18n.t('authRelay.placeholder.message'),
    }));
    popup.document.close();
  } catch {
    // Ignore popup placeholder rendering failures.
  }
}

class SmartThingsAPI {
  #session = null;
  #pendingLoginPromise = null;
  #refreshSessionPromise = null;
  #homeConfigRequests = new Map();

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
    return isMockSmartThingsEnabled() || !!AUTH_BASE_URL;
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

    if (!AUTH_BASE_URL) {
      return createMessageDescriptor('tokenSetup.errors.oauthMissingBrokerUrl');
    }

    return '';
  }

  get sharedConfigEnabled() {
    return isMockSmartThingsEnabled() || !!SERVICE_BASE_URL;
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
    writeStorage(AUTH_NOTICE_KEY, null);
    clearHomeConfigCaches();
    this.#clearPendingAuth();
  }

  get hasPendingLogin() {
    return !!this.#readPendingAuth();
  }

  get pendingLoginMode() {
    return this.#readPendingAuth()?.launchMode ?? '';
  }

  consumeAuthNotice() {
    const raw = readStorage(AUTH_NOTICE_KEY);

    if (!raw) {
      return null;
    }

    writeStorage(AUTH_NOTICE_KEY, null);

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async resumePendingLogin({ forceRestart = false } = {}) {
    if (isMockSmartThingsEnabled()) {
      return false;
    }

    const pending = this.#readPendingAuth();
    if (!pending) {
      return false;
    }

    return this.#waitForPendingLogin(pending, { forceRestart });
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

  async startLogin() {
    if (isMockSmartThingsEnabled()) {
      return false;
    }

    if (!this.isConfigured) {
      const descriptor = this.authConfigError || createMessageDescriptor('tokenSetup.errors.oauthBrokerConfig');
      throw new ConfigError('SmartThings OAuth is not configured.', {
        descriptor,
      });
    }

    const prefersExternalHandoff = isStandaloneDisplayMode();
    const popup = prefersExternalHandoff ? null : window.open('', '_blank');

    if (!prefersExternalHandoff) {
      writeAuthPopupPlaceholder(popup);
    }

    const sessionId = createStateToken();
    let start;

    try {
      start = await this.#brokerRequest('/auth/start', {
        sessionId,
        returnTo: this.getRedirectUri(),
        scope: OAUTH_SCOPE,
        locale: i18n.language,
        launchMode: prefersExternalHandoff ? 'standalone' : 'browser',
      });
    } catch (error) {
      popup?.close?.();
      throw error;
    }

    const pending = {
      sessionId,
      expiresAt: Number(start.expiresAt) || (Date.now() + AUTH_RELAY_TTL_MS),
      launchMode: prefersExternalHandoff ? 'standalone' : 'browser',
    };

    this.#writePendingAuth(pending);

    if (prefersExternalHandoff || !popup || popup.closed) {
      window.location.assign(start.authorizationUrl);
      return {
        handoff: prefersExternalHandoff ? 'standalone' : 'redirect',
        pending: true,
      };
    }

    popup.location.replace(start.authorizationUrl);
    popup.focus?.();
    return this.#waitForPendingLogin(pending);
  }

  getRedirectUri() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  async refreshSession() {
    if (this.#refreshSessionPromise) {
      return this.#refreshSessionPromise;
    }

    if (!this.#session?.refreshToken) {
      throw new AuthError('SmartThings session has expired. Please sign in again.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.expired'),
      });
    }

    this.#refreshSessionPromise = (async () => {
      const response = await this.#brokerRequest('/smartthings/refresh', {
        refreshToken: this.#session.refreshToken,
      });

      this.#persistSession(this.#normalizeTokenResponse(response, {
        fallbackRefreshToken: this.#session.refreshToken,
      }));

      return this.#session.accessToken;
    })();

    try {
      return await this.#refreshSessionPromise;
    } finally {
      this.#refreshSessionPromise = null;
    }
  }

  async maybeRefreshSession({ force = false } = {}) {
    if (isMockSmartThingsEnabled() || this.authMode !== 'oauth' || !this.#session?.accessToken) {
      return false;
    }

    if (!this.#session.expiresAt) {
      return false;
    }

    if (!force && this.#session.expiresAt > Date.now() + REFRESH_LEEWAY_MS) {
      return false;
    }

    await this.refreshSession();
    return true;
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
  async fetchDevices(locationId, options = {}) {
    const params = new URLSearchParams();
    if (locationId) {
      params.set('locationId', locationId);
    }
    if (options.includeStatus) {
      params.set('includeStatus', 'true');
    }
    if (options.includeHealth) {
      params.set('includeHealth', 'true');
    }

    const qs = params.size ? `?${params.toString()}` : '';
    const data = await this.#request(`/devices${qs}`);
    return data.items ?? [];
  }

  /** Fetch all scenes (optionally scoped to a location). */
  async fetchScenes(locationId) {
    const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    const data = await this.#request(`/scenes${qs}`);
    return data.items ?? [];
  }

  /** Execute a scene for the current location. */
  async executeScene(sceneId, locationId) {
    const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
    return this.#post(`/scenes/${encodeURIComponent(sceneId)}/execute${qs}`, {});
  }

  /** Fetch the shared home config for a location from the broker service. */
  async fetchHomeConfig(locationId) {
    if (isMockSmartThingsEnabled()) {
      return getMockHomeConfig(locationId);
    }

    if (!SERVICE_BASE_URL || !locationId) {
      return null;
    }

    const cached = readHomeConfigCache(locationId);
    if (cached.hit) {
      return cached.value;
    }

    const pendingRequest = this.#homeConfigRequests.get(locationId);
    if (pendingRequest) {
      return pendingRequest;
    }

    const request = (async () => {
      const response = await this.#serviceFetch(`/home-config/${encodeURIComponent(locationId)}`, {
        method: 'GET',
      });
      const config = response.config ?? null;
      writeHomeConfigCache(locationId, config);
      return config;
    })();

    this.#homeConfigRequests.set(locationId, request);

    try {
      return await request;
    } finally {
      this.#homeConfigRequests.delete(locationId);
    }
  }

  /** Persist the shared home config for a location through the broker service. */
  async saveHomeConfig(locationId, config) {
    if (isMockSmartThingsEnabled()) {
      return saveMockHomeConfig(locationId, config);
    }

    const response = await this.#serviceFetch(`/home-config/${encodeURIComponent(locationId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config }),
    });

    const nextConfig = response.config ?? null;
    writeHomeConfigCache(locationId, nextConfig);
    return nextConfig;
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
    this.#clearPendingAuth();
  }

  #readPendingAuth() {
    const raw = readStorage(PENDING_AUTH_KEY);
    if (!raw) {
      return null;
    }

    try {
      const pending = JSON.parse(raw);
      if (!pending?.sessionId || !pending?.expiresAt || pending.expiresAt <= Date.now()) {
        writeStorage(PENDING_AUTH_KEY, null);
        return null;
      }

      return {
        ...pending,
        launchMode: pending.launchMode === 'standalone' ? 'standalone' : 'browser',
      };
    } catch {
      writeStorage(PENDING_AUTH_KEY, null);
      return null;
    }
  }

  #writePendingAuth(pending) {
    writeStorage(PENDING_AUTH_KEY, JSON.stringify(pending));
  }

  #writeAuthNotice(notice) {
    writeStorage(AUTH_NOTICE_KEY, JSON.stringify(notice));
  }

  #clearPendingAuth() {
    this.#pendingLoginPromise = null;
    writeStorage(PENDING_AUTH_KEY, null);
  }

  async #waitForPendingLogin(pending, { forceRestart = false } = {}) {
    if (forceRestart) {
      this.#pendingLoginPromise = null;
    }

    if (this.#pendingLoginPromise) {
      return this.#pendingLoginPromise;
    }

    this.#pendingLoginPromise = this.#pollPendingLogin(pending)
      .finally(() => {
        this.#pendingLoginPromise = null;
      });

    return this.#pendingLoginPromise;
  }

  async #pollPendingLogin(pending) {
    while (pending.expiresAt > Date.now()) {
      const result = await this.#brokerGet(`/auth/status/${encodeURIComponent(pending.sessionId)}`);

      if (result.status === 'pending') {
        await delay(AUTH_RELAY_POLL_INTERVAL_MS);
        continue;
      }

      if (result.status === 'expired') {
        this.#clearPendingAuth();
        throw new AuthError('SmartThings login timed out.', {
          descriptor: createMessageDescriptor('tokenSetup.errors.oauthTimeout'),
        });
      }

      if (result.status === 'error') {
        this.#clearPendingAuth();
        throw new AuthError(result.errorDescription ?? result.error ?? 'SmartThings sign-in failed.', {
          descriptor: describeRelayError(result),
        });
      }

      if (result.status === 'complete') {
        if (pending.launchMode === 'standalone') {
          this.#writeAuthNotice({ type: 'oauth-standalone-complete' });
        }

        this.#persistSession(this.#normalizeTokenResponse(result));
        return true;
      }

      await delay(AUTH_RELAY_POLL_INTERVAL_MS);
    }

    this.#clearPendingAuth();
    throw new AuthError('SmartThings login timed out.', {
      descriptor: createMessageDescriptor('tokenSetup.errors.oauthTimeout'),
    });
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
    return this.#brokerFetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async #brokerGet(path) {
    return this.#brokerFetch(path, {
      method: 'GET',
    });
  }

  async #brokerFetch(path, init) {
    if (!AUTH_BASE_URL) {
      throw new ConfigError('SmartThings OAuth broker URL is not configured.', {
        descriptor: createMessageDescriptor('tokenSetup.errors.oauthMissingBrokerUrl'),
      });
    }

    const requestUrl = `${AUTH_BASE_URL}${path}`;
    let res;

    try {
      res = await fetch(requestUrl, {
        ...init,
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
      const descriptor = describeBrokerError(res.status, message);

      throw new AuthError(message, {
        descriptor: {
          ...descriptor,
          detail: formatDebugDetail({
            status: res.status,
            body,
          }),
        },
      });
    }

    return body;
  }

  async #serviceFetch(path, init) {
    if (!SERVICE_BASE_URL) {
      throw new Error('Shared home config service URL is not configured.');
    }

    const accessToken = await this.#ensureAccessToken();
    const requestUrl = `${SERVICE_BASE_URL}${path}`;
    let res;

    try {
      res = await fetch(requestUrl, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...init?.headers,
        },
      });
    } catch (error) {
      if (isUrlParseError(error)) {
        throw new Error('Shared home config service URL is invalid.');
      }

      throw new Error('Could not reach the shared home config service.');
    }

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : { error: await res.text() };

    if (!res.ok) {
      throw new Error(body.error ?? `Shared home config request failed with HTTP ${res.status}.`);
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
