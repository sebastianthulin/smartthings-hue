import {
  isBrokerConfigured,
  sendJson,
  sendMissingConfig,
  verifyCors,
} from '../_lib/smartthings-broker.js';
import { isAuthRelayConfigured } from '../_lib/auth-relay-store.js';

export default async function handler(req, res) {
  const { handled, origin } = verifyCors(req, res);
  if (handled) {
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 404, { error: 'Not found.' }, origin);
    return;
  }

  if (!isBrokerConfigured()) {
    sendMissingConfig(res, origin);
    return;
  }

  sendJson(res, 200, {
    ok: true,
    configured: true,
    relayConfigured: isAuthRelayConfigured(),
    endpoints: {
      health: '/health',
      authStart: '/auth/start',
      authCallback: '/auth/callback',
      authStatus: '/auth/status/:sessionId',
      exchange: '/smartthings/exchange',
      refresh: '/smartthings/refresh',
      homeConfig: '/home-config/:locationId',
    },
  }, origin);
}