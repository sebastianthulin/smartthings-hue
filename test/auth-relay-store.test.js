import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completeAuthSession,
  consumeAuthSession,
  createPendingAuthSession,
  failAuthSession,
  getAuthSession,
  getAuthRelayTtlMs,
  isAuthRelayConfigured,
  isValidAuthSessionId,
} from '../api/_lib/auth-relay-store.js';

test.beforeEach(() => {
  globalThis.__SMART_HUE_AUTH_RELAY_STORE__?.clear();
});

test('auth relay accepts valid session ids and uses the in-memory store in local development', () => {
  assert.equal(isValidAuthSessionId('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(isValidAuthSessionId('not-a-session-id'), false);
  assert.equal(isAuthRelayConfigured(), true);
  assert.equal(getAuthRelayTtlMs() > 0, true);
});

test('completed auth sessions can be consumed once and are then removed', async () => {
  const sessionId = '123e4567-e89b-12d3-a456-426614174000';

  const pending = await createPendingAuthSession({
    sessionId,
    origin: 'https://example.com',
    returnTo: 'https://example.com/app',
    locale: 'en',
    launchMode: 'standalone',
  });

  assert.equal(pending.status, 'pending');
  assert.equal(pending.launchMode, 'standalone');

  const completed = await completeAuthSession(sessionId, { access_token: 'token-1' });
  assert.equal(completed.status, 'complete');
  assert.deepEqual(completed.tokenPayload, { access_token: 'token-1' });

  const consumed = await consumeAuthSession(sessionId);
  assert.equal(consumed.status, 'complete');
  assert.equal((await getAuthSession(sessionId)), null);
});

test('failed auth sessions are persisted until they are consumed', async () => {
  const sessionId = '123e4567-e89b-12d3-a456-426614174001';

  await createPendingAuthSession({ sessionId });
  const failed = await failAuthSession(sessionId, { error: 'access_denied' });

  assert.equal(failed.status, 'error');
  assert.deepEqual(failed.errorPayload, { error: 'access_denied' });

  const consumed = await consumeAuthSession(sessionId);
  assert.equal(consumed.status, 'error');
  assert.equal((await getAuthSession(sessionId)), null);
});
