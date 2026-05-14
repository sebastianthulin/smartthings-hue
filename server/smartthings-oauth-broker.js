import { createServer } from 'node:http';
import rootHandler from '../api/api/index.js';
import callbackHandler from '../api/auth/callback.js';
import startHandler from '../api/auth/start.js';
import statusHandler from '../api/auth/status/[sessionId].js';
import healthHandler from '../api/health.js';
import homeConfigHandler from '../api/home-config/[locationId].js';
import exchangeHandler from '../api/smartthings/exchange.js';
import refreshHandler from '../api/smartthings/refresh.js';

const PORT = Number(process.env.SMARTTHINGS_BROKER_PORT ?? 8787);

function resolveHandler(url) {
  if (url.pathname === '/') {
    return rootHandler;
  }

  if (url.pathname === '/health') {
    return healthHandler;
  }

  if (url.pathname === '/auth/start') {
    return startHandler;
  }

  if (url.pathname === '/auth/callback') {
    return callbackHandler;
  }

  if (url.pathname.startsWith('/auth/status/')) {
    return statusHandler;
  }

  if (url.pathname === '/smartthings/exchange') {
    return exchangeHandler;
  }

  if (url.pathname === '/smartthings/refresh') {
    return refreshHandler;
  }

  if (url.pathname.startsWith('/home-config/')) {
    return homeConfigHandler;
  }

  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const handler = resolveHandler(url);

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found.' }));
    return;
  }

  try {
    await handler(req, res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: error?.message ?? 'Unexpected broker error.' }));
  }
});

server.listen(PORT, () => {
  console.log(`SmartThings OAuth broker listening on http://localhost:${PORT}`);
});