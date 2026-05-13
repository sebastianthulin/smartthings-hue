import {
  getAuthRelayConfigError,
  getAuthSession,
  isAuthRelayConfigured,
  isValidAuthSessionId,
} from '../../_lib/auth-relay-store.js';
import {
  isBrokerConfigured,
  sendJson,
  sendMissingConfig,
  verifyCors,
} from '../../_lib/smartthings-broker.js';

function resolveSessionId(req) {
  if (typeof req.query?.sessionId === 'string') {
    return req.query.sessionId;
  }

  const url = new URL(req.url ?? '/', 'https://relay.local');
  return url.pathname.split('/').filter(Boolean).at(-1) ?? '';
}

export default async function handler(req, res) {
  const { handled, origin } = verifyCors(req, res);
  if (handled) {
    return;
  }

  if (!isBrokerConfigured()) {
    sendMissingConfig(res, origin);
    return;
  }

  if (!isAuthRelayConfigured()) {
    sendJson(res, 503, { error: getAuthRelayConfigError() }, origin);
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 404, { error: 'Not found.' }, origin);
    return;
  }

  const sessionId = resolveSessionId(req);

  if (!isValidAuthSessionId(sessionId)) {
    sendJson(res, 400, { error: 'sessionId must be a valid UUID.' }, origin);
    return;
  }

  const session = await getAuthSession(sessionId);

  if (!session) {
    sendJson(res, 200, { status: 'expired' }, origin);
    return;
  }

  if (session.status === 'pending') {
    sendJson(res, 200, { status: 'pending' }, origin);
    return;
  }

  if (session.status === 'complete') {
    sendJson(res, 200, {
      status: 'complete',
      ...session.tokenPayload,
    }, origin);
    return;
  }

  sendJson(res, 200, {
    status: 'error',
    ...session.errorPayload,
  }, origin);
}