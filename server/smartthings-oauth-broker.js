import { createServer } from 'node:http';

const PORT = Number(process.env.SMARTTHINGS_BROKER_PORT ?? 8787);
const TOKEN_URL = process.env.SMARTTHINGS_TOKEN_URL ?? 'https://api.smartthings.com/oauth/token';
const CLIENT_ID = process.env.SMARTTHINGS_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SMARTTHINGS_CLIENT_SECRET ?? '';
const ALLOWED_ORIGINS = (process.env.SMARTTHINGS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function getCorsOrigin(origin) {
  if (!origin) {
    return ALLOWED_ORIGINS.length === 0 ? '*' : null;
  }

  if (ALLOWED_ORIGINS.length === 0) {
    return '*';
  }

  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function writeCorsHeaders(res, origin) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  if (ALLOWED_ORIGINS.length > 0) {
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(res, status, payload, origin) {
  writeCorsHeaders(res, origin);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
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

async function requestToken(params) {
  const body = new URLSearchParams({
    ...params,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || `SmartThings OAuth returned HTTP ${response.status}.` };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status >= 400 && response.status < 500 ? 400 : 502,
      payload: {
        error: payload.error_description ?? payload.error ?? `SmartThings OAuth returned HTTP ${response.status}.`,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    payload,
  };
}

const server = createServer(async (req, res) => {
  const origin = getCorsOrigin(req.headers.origin);

  if (req.method === 'OPTIONS') {
    if (ALLOWED_ORIGINS.length > 0 && !origin) {
      res.writeHead(403);
      res.end();
      return;
    }

    writeCorsHeaders(res, origin);
    res.writeHead(204);
    res.end();
    return;
  }

  if (ALLOWED_ORIGINS.length > 0 && req.headers.origin && !origin) {
    sendJson(res, 403, { error: 'Origin is not allowed.' }, null);
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      configured: Boolean(CLIENT_ID && CLIENT_SECRET),
    }, origin);
    return;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    sendJson(res, 500, {
      error: 'Broker is not configured. Set SMARTTHINGS_CLIENT_ID and SMARTTHINGS_CLIENT_SECRET.',
    }, origin);
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found.' }, origin);
    return;
  }

  try {
    const body = await readJson(req);

    if (url.pathname === '/smartthings/exchange') {
      if (!body.code || !body.redirectUri) {
        sendJson(res, 400, { error: 'code and redirectUri are required.' }, origin);
        return;
      }

      const result = await requestToken({
        grant_type: 'authorization_code',
        code: body.code,
        redirect_uri: body.redirectUri,
      });

      sendJson(res, result.status, result.payload, origin);
      return;
    }

    if (url.pathname === '/smartthings/refresh') {
      if (!body.refreshToken) {
        sendJson(res, 400, { error: 'refreshToken is required.' }, origin);
        return;
      }

      const result = await requestToken({
        grant_type: 'refresh_token',
        refresh_token: body.refreshToken,
      });

      sendJson(res, result.status, result.payload, origin);
      return;
    }

    sendJson(res, 404, { error: 'Not found.' }, origin);
  } catch (error) {
    sendJson(res, 500, {
      error: error?.message ?? 'Unexpected broker error.',
    }, origin);
  }
});

server.listen(PORT, () => {
  console.log(`SmartThings OAuth broker listening on http://localhost:${PORT}`);
});