const HOME_CONFIG_SCHEMA_VERSION = 1;
const HOME_CONFIG_PREFIX = 'smarthue:home:config:';
const HOME_CONFIG_CACHE_TTL_MS = 30_000;
const memoryStore = globalThis.__SMART_HUE_HOME_CONFIG_STORE__ ??= new Map();
const cacheStore = globalThis.__SMART_HUE_HOME_CONFIG_CACHE__ ??= new Map();

function normalizeEnvValue(value = '') {
  const normalized = (value ?? '').trim();

  if (!normalized) {
    return '';
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

const REDIS_URL = normalizeEnvValue(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '');
const REDIS_TOKEN = normalizeEnvValue(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '');

function isProductionRuntime() {
  return Boolean(process.env.VERCEL);
}

function hasRedisStore() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

function shouldUseMemoryStore() {
  return !hasRedisStore() && !isProductionRuntime();
}

function getHomeConfigKey(locationId) {
  return `${HOME_CONFIG_PREFIX}${locationId}`;
}

function getDefaultHomeConfig(locationId) {
  return {
    schemaVersion: HOME_CONFIG_SCHEMA_VERSION,
    locationId,
    updatedAt: null,
    mainRoutines: {
      turnOnSceneId: null,
      turnOffSceneId: null,
    },
    hiddenRoomIds: [],
    roomSettings: {},
  };
}

function sanitizeSceneId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function sanitizeHiddenRoomIds(hiddenRoomIds) {
  if (!Array.isArray(hiddenRoomIds)) {
    return [];
  }

  return [...new Set(hiddenRoomIds.map(sanitizeSceneId).filter(Boolean))];
}

function sanitizeRoomSettings(roomSettings) {
  if (!roomSettings || typeof roomSettings !== 'object' || Array.isArray(roomSettings)) {
    return {};
  }

  const normalized = {};

  for (const [roomId, rawRoomSetting] of Object.entries(roomSettings)) {
    const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : '';

    if (!normalizedRoomId) {
      continue;
    }

    const routineSceneIds = Array.isArray(rawRoomSetting?.routineSceneIds)
      ? [...new Set(rawRoomSetting.routineSceneIds.map(sanitizeSceneId).filter(Boolean))]
      : [];

    const hiddenLightIds = Array.isArray(rawRoomSetting?.hiddenLightIds)
      ? [...new Set(rawRoomSetting.hiddenLightIds.map(sanitizeSceneId).filter(Boolean))]
      : [];

    normalized[normalizedRoomId] = {
      hiddenLightIds,
      routineSceneIds,
    };
  }

  return normalized;
}

function normalizeHomeConfig(locationId, rawConfig = {}) {
  const fallback = getDefaultHomeConfig(locationId);
  const config = rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)
    ? rawConfig
    : {};

  const updatedAt = Number(config.updatedAt);

  return {
    schemaVersion: HOME_CONFIG_SCHEMA_VERSION,
    locationId,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : fallback.updatedAt,
    mainRoutines: {
      turnOnSceneId: sanitizeSceneId(config.mainRoutines?.turnOnSceneId),
      turnOffSceneId: sanitizeSceneId(config.mainRoutines?.turnOffSceneId),
    },
    hiddenRoomIds: sanitizeHiddenRoomIds(config.hiddenRoomIds),
    roomSettings: sanitizeRoomSettings(config.roomSettings),
  };
}

function parseStoredConfig(locationId, rawConfig) {
  if (!rawConfig) {
    return getDefaultHomeConfig(locationId);
  }

  try {
    const parsed = typeof rawConfig === 'string'
      ? JSON.parse(rawConfig)
      : rawConfig;

    return normalizeHomeConfig(locationId, parsed);
  } catch {
    return getDefaultHomeConfig(locationId);
  }
}

function readCachedConfig(locationId) {
  const cached = cacheStore.get(getHomeConfigKey(locationId));

  if (!cached || cached.expiresAt <= Date.now()) {
    cacheStore.delete(getHomeConfigKey(locationId));
    return null;
  }

  return normalizeHomeConfig(locationId, cached.value);
}

function writeCachedConfig(locationId, config) {
  cacheStore.set(getHomeConfigKey(locationId), {
    expiresAt: Date.now() + HOME_CONFIG_CACHE_TTL_MS,
    value: normalizeHomeConfig(locationId, config),
  });
}

async function runRedisCommand(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Home config storage failed with HTTP ${response.status}.`);
  }

  return payload.result ?? null;
}

export function isValidHomeConfigLocationId(locationId) {
  return typeof locationId === 'string'
    && locationId.trim() === locationId
    && locationId.length > 0
    && locationId.length <= 200;
}

export function isHomeConfigStoreConfigured() {
  return hasRedisStore() || shouldUseMemoryStore();
}

export function getHomeConfigStoreError() {
  if (isHomeConfigStoreConfigured()) {
    return '';
  }

  return 'Shared home config requires KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.';
}

export async function getHomeConfig(locationId) {
  const cached = readCachedConfig(locationId);

  if (cached) {
    return cached;
  }

  let config;

  if (hasRedisStore()) {
    config = parseStoredConfig(locationId, await runRedisCommand(['GET', getHomeConfigKey(locationId)]));
  } else {
    config = parseStoredConfig(locationId, memoryStore.get(getHomeConfigKey(locationId)) ?? null);
  }

  writeCachedConfig(locationId, config);
  return config;
}

export async function saveHomeConfig(locationId, nextConfig) {
  const config = normalizeHomeConfig(locationId, {
    ...nextConfig,
    updatedAt: Date.now(),
  });

  if (hasRedisStore()) {
    await runRedisCommand([
      'SET',
      getHomeConfigKey(locationId),
      JSON.stringify(config),
    ]);
  } else {
    memoryStore.set(getHomeConfigKey(locationId), config);
  }

  writeCachedConfig(locationId, config);
  return config;
}