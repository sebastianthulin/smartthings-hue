const DEFAULT_AUTH_RELAY_TTL_MS = 5 * 60 * 1000;
const AUTH_SESSION_PREFIX = 'smarthue:auth:session:';
const memoryStore = globalThis.__SMART_HUE_AUTH_RELAY_STORE__ ??= new Map();

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
const AUTH_RELAY_TTL_MS = (() => {
  const value = Number(normalizeEnvValue(process.env.SMARTTHINGS_AUTH_RELAY_TTL_MS || ''));
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AUTH_RELAY_TTL_MS;
})();

function isProductionRuntime() {
  return Boolean(process.env.VERCEL);
}

function hasRedisStore() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

function shouldUseMemoryStore() {
  return !hasRedisStore() && !isProductionRuntime();
}

function getSessionKey(sessionId) {
  return `${AUTH_SESSION_PREFIX}${sessionId}`;
}

function pruneMemoryStore() {
  const now = Date.now();

  for (const [key, session] of memoryStore.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) {
      memoryStore.delete(key);
    }
  }
}

function parseSession(raw) {
  if (!raw) {
    return null;
  }

  try {
    const session = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!session?.sessionId || !session?.expiresAt || session.expiresAt <= Date.now()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
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
    throw new Error(payload.error || `Auth relay storage failed with HTTP ${response.status}.`);
  }

  return payload.result ?? null;
}

async function readSession(sessionId) {
  if (hasRedisStore()) {
    return parseSession(await runRedisCommand(['GET', getSessionKey(sessionId)]));
  }

  pruneMemoryStore();
  return parseSession(memoryStore.get(getSessionKey(sessionId)) ?? null);
}

async function writeSession(session) {
  if (hasRedisStore()) {
    const ttlSeconds = Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000));

    await runRedisCommand([
      'SET',
      getSessionKey(session.sessionId),
      JSON.stringify(session),
      'EX',
      ttlSeconds,
    ]);

    return session;
  }

  pruneMemoryStore();
  memoryStore.set(getSessionKey(session.sessionId), session);
  return session;
}

async function deleteSession(sessionId) {
  if (hasRedisStore()) {
    await runRedisCommand(['DEL', getSessionKey(sessionId)]);
    return;
  }

  memoryStore.delete(getSessionKey(sessionId));
}

export function isValidAuthSessionId(sessionId) {
  return typeof sessionId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId);
}

export function getAuthRelayTtlMs() {
  return AUTH_RELAY_TTL_MS;
}

export function isAuthRelayConfigured() {
  return hasRedisStore() || shouldUseMemoryStore();
}

export function getAuthRelayConfigError() {
  if (isAuthRelayConfigured()) {
    return '';
  }

  return 'SmartThings auth relay requires KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.';
}

export async function createPendingAuthSession({
  sessionId,
  origin = null,
  returnTo = null,
  locale = null,
  launchMode = 'browser',
}) {
  const now = Date.now();

  return writeSession({
    sessionId,
    status: 'pending',
    createdAt: now,
    expiresAt: now + AUTH_RELAY_TTL_MS,
    origin,
    returnTo,
    locale: typeof locale === 'string' ? locale : null,
    launchMode: launchMode === 'standalone' ? 'standalone' : 'browser',
  });
}

export async function getAuthSession(sessionId) {
  const session = await readSession(sessionId);

  if (!session) {
    await deleteSession(sessionId).catch(() => {});
    return null;
  }

  return session;
}

export async function completeAuthSession(sessionId, tokenPayload) {
  const session = await getAuthSession(sessionId);

  if (!session) {
    return null;
  }

  return writeSession({
    ...session,
    status: 'complete',
    completedAt: Date.now(),
    tokenPayload,
  });
}

export async function failAuthSession(sessionId, errorPayload) {
  const session = await getAuthSession(sessionId);

  if (!session) {
    return null;
  }

  return writeSession({
    ...session,
    status: 'error',
    completedAt: Date.now(),
    errorPayload,
  });
}

export async function consumeAuthSession(sessionId) {
  const session = await getAuthSession(sessionId);

  if (!session || session.status === 'pending') {
    return session;
  }

  await deleteSession(sessionId);
  return session;
}