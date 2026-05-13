function normalizeEnvValue(value, fallback = '') {
  const normalized = (value ?? fallback).trim();

  if (!normalized) {
    return fallback;
  }

  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    const unquoted = normalized.slice(1, -1).trim();
    return unquoted || fallback;
  }

  return normalized;
}

const AUTHORIZE_URL = normalizeEnvValue(
  process.env.SMARTTHINGS_AUTHORIZE_URL,
  'https://api.smartthings.com/oauth/authorize',
);
const TOKEN_URL = normalizeEnvValue(
  process.env.SMARTTHINGS_TOKEN_URL,
  'https://api.smartthings.com/oauth/token',
);
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;
const CLIENT_ID = normalizeEnvValue(process.env.SMARTTHINGS_CLIENT_ID);
const CLIENT_SECRET = normalizeEnvValue(process.env.SMARTTHINGS_CLIENT_SECRET);
const BROKER_STATUS_HEADER = 'X-SmartThings-Broker-Status';
const ALLOWED_ORIGINS = (process.env.SMARTTHINGS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export function getCorsOrigin(origin) {
  if (!origin) {
    return ALLOWED_ORIGINS.length === 0 ? '*' : null;
  }

  if (ALLOWED_ORIGINS.length === 0) {
    return '*';
  }

  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

export function writeCorsHeaders(res, origin) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  if (ALLOWED_ORIGINS.length > 0) {
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export function sendJson(res, status, payload, origin) {
  writeCorsHeaders(res, origin);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function sendHtml(res, status, html, origin) {
  writeCorsHeaders(res, origin);
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

export function getRequestBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(',')[0]?.trim()
    || 'https';
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(',')[0]?.trim()
    || req.headers.host;

  return `${protocol}://${host}`;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return req.body ? JSON.parse(req.body) : {};
  }

  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 64_000) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });

    req.on('error', reject);
  });
}

export function verifyCors(req, res) {
  const origin = getCorsOrigin(req.headers.origin);

  if (req.method === 'OPTIONS') {
    if (ALLOWED_ORIGINS.length > 0 && !origin) {
      res.statusCode = 403;
      res.end();
      return { handled: true, origin: null };
    }

    writeCorsHeaders(res, origin);
    res.statusCode = 204;
    res.end();
    return { handled: true, origin };
  }

  if (ALLOWED_ORIGINS.length > 0 && req.headers.origin && !origin) {
    sendJson(res, 403, { error: 'Origin is not allowed.' }, null);
    return { handled: true, origin: null };
  }

  return { handled: false, origin };
}

export function isBrokerConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function getBrokerClientId() {
  return CLIENT_ID;
}

export function getAuthorizeUrl() {
  return AUTHORIZE_URL;
}

function getValidatedTokenUrl() {
  try {
    return new URL(TOKEN_URL).toString();
  } catch {
    throw new Error(`SMARTTHINGS_TOKEN_URL is invalid: ${JSON.stringify(TOKEN_URL)}`);
  }
}

export function sendMissingConfig(res, origin) {
  res.setHeader(BROKER_STATUS_HEADER, 'needs-configuration');

  sendJson(res, 503, {
    configured: false,
    error: 'Broker is not configured.',
    message: 'Set SMARTTHINGS_CLIENT_ID and SMARTTHINGS_CLIENT_SECRET to enable the SmartThings OAuth broker.',
  }, origin);
}

export async function requestToken(params) {
  const tokenUrl = getValidatedTokenUrl();
  const body = new URLSearchParams(params);
  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`SmartThings token request timed out after ${TOKEN_REQUEST_TIMEOUT_MS}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `SmartThings OAuth returned HTTP ${response.status}.` };
  }

  if (!response.ok) {
    const upstreamError = payload.error ?? '';
    const upstreamDescription = payload.error_description ?? '';
    const fallbackMessage = `SmartThings OAuth returned HTTP ${response.status}.`;
    const message = [upstreamError, upstreamDescription].filter(Boolean).join(': ') || fallbackMessage;

    return {
      ok: false,
      status: response.status >= 400 && response.status < 500 ? 400 : 502,
      payload: {
        error: message,
        upstreamStatus: response.status,
        upstreamError: upstreamError || null,
        upstreamErrorDescription: upstreamDescription || null,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    payload,
  };
}