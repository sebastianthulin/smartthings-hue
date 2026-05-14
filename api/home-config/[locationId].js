import {
  getHomeConfig,
  getHomeConfigStoreError,
  isHomeConfigStoreConfigured,
  isValidHomeConfigLocationId,
  saveHomeConfig,
} from '../_lib/home-config-store.js';
import {
  readJson,
  sendJson,
  verifyCors,
} from '../_lib/smartthings-broker.js';

const SMARTTHINGS_API_BASE = 'https://api.smartthings.com/v1';
const SMARTTHINGS_REQUEST_TIMEOUT_MS = 15_000;

function resolveLocationId(req) {
  if (typeof req.query?.locationId === 'string') {
    return decodeURIComponent(req.query.locationId);
  }

  const url = new URL(req.url ?? '/', 'https://broker.local');
  return decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
}

function getBearerToken(req) {
  const rawHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const match = /^Bearer\s+(.+)$/i.exec(rawHeader ?? '');

  return match?.[1]?.trim() ?? '';
}

async function verifyLocationAccess(accessToken, locationId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SMARTTHINGS_REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(`${SMARTTHINGS_API_BASE}/locations/${encodeURIComponent(locationId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`SmartThings location lookup timed out after ${SMARTTHINGS_REQUEST_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if ([401, 403, 404].includes(response.status)) {
    return false;
  }

  if (!response.ok) {
    throw new Error(`SmartThings location lookup failed with HTTP ${response.status}.`);
  }

  return true;
}

export default async function handler(req, res) {
  const { handled, origin } = verifyCors(req, res);
  if (handled) {
    return;
  }

  if (!isHomeConfigStoreConfigured()) {
    sendJson(res, 503, { error: getHomeConfigStoreError() }, origin);
    return;
  }

  if (!['GET', 'PUT'].includes(req.method)) {
    sendJson(res, 404, { error: 'Not found.' }, origin);
    return;
  }

  const locationId = resolveLocationId(req);

  if (!isValidHomeConfigLocationId(locationId)) {
    sendJson(res, 400, { error: 'locationId is required.' }, origin);
    return;
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    sendJson(res, 401, { error: 'Authorization bearer token is required.' }, origin);
    return;
  }

  try {
    const hasAccess = await verifyLocationAccess(accessToken, locationId);

    if (!hasAccess) {
      sendJson(res, 403, { error: 'Location is not accessible with this SmartThings token.' }, origin);
      return;
    }

    if (req.method === 'GET') {
      const config = await getHomeConfig(locationId);
      sendJson(res, 200, { locationId, config }, origin);
      return;
    }

    const body = await readJson(req);
    const nextConfig = body?.config ?? body;

    if (!nextConfig || typeof nextConfig !== 'object' || Array.isArray(nextConfig)) {
      sendJson(res, 400, { error: 'config must be an object.' }, origin);
      return;
    }

    const config = await saveHomeConfig(locationId, nextConfig);
    sendJson(res, 200, { locationId, config }, origin);
  } catch (error) {
    sendJson(res, 500, { error: error?.message ?? 'Unexpected home config error.' }, origin);
  }
}