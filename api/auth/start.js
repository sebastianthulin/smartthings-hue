import {
  createPendingAuthSession,
  getAuthRelayConfigError,
  getAuthRelayTtlMs,
  isAuthRelayConfigured,
  isValidAuthSessionId,
} from '../_lib/auth-relay-store.js';
import {
  getAuthorizeUrl,
  getBrokerClientId,
  getRequestBaseUrl,
  isBrokerConfigured,
  readJson,
  sendJson,
  sendMissingConfig,
  verifyCors,
} from '../_lib/smartthings-broker.js';

const DEFAULT_SCOPE = 'r:locations:* r:devices:* x:devices:* r:scenes:* x:scenes:*';

function validateReturnTo(returnTo, origin) {
  if (!returnTo) {
    return origin || null;
  }

  const url = new URL(returnTo);

  if (origin && url.origin !== origin) {
    throw new Error('returnTo must match the requesting origin.');
  }

  url.search = '';
  url.hash = '';
  return url.toString();
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

  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found.' }, origin);
    return;
  }

  try {
    const body = await readJson(req);
    const sessionId = body.sessionId ?? body.session_id;

    if (!isValidAuthSessionId(sessionId)) {
      sendJson(res, 400, { error: 'sessionId must be a valid UUID.' }, origin);
      return;
    }

    const returnTo = validateReturnTo(body.returnTo, req.headers.origin);
    const scope = typeof body.scope === 'string' && body.scope.trim()
      ? body.scope.trim()
      : DEFAULT_SCOPE;

    const session = await createPendingAuthSession({
      sessionId,
      origin: req.headers.origin ?? null,
      returnTo,
    });

    const authorizeUrl = new URL(getAuthorizeUrl());
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', getBrokerClientId());
    authorizeUrl.searchParams.set('scope', scope);
    authorizeUrl.searchParams.set('redirect_uri', `${getRequestBaseUrl(req)}/auth/callback`);
    authorizeUrl.searchParams.set('state', sessionId);

    sendJson(res, 200, {
      authorizationUrl: authorizeUrl.toString(),
      sessionId,
      expiresAt: session.expiresAt,
      pollIntervalMs: 2000,
      ttlMs: getAuthRelayTtlMs(),
    }, origin);
  } catch (error) {
    sendJson(res, 400, { error: error?.message ?? 'Could not start auth relay.' }, origin);
  }
}