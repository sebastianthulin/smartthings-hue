import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearHomeConfigCaches,
  describeBrokerError,
  describeOAuthRedirectError,
  describeRelayError,
  normalizeBaseUrl,
  readHomeConfigCache,
  swapSubdomain,
  writeHomeConfigCache,
} from '../src/services/smartthings.js';
import { MemoryStorage } from './setup.js';

test('base URL helpers normalize and swap expected SmartThings broker hosts', () => {
  assert.equal(normalizeBaseUrl(' https://auth.example.com/ '), 'https://auth.example.com');
  assert.equal(normalizeBaseUrl(''), '');
  assert.equal(swapSubdomain('https://service.example.com/path/', 'service', 'auth'), 'https://auth.example.com/path');
  assert.equal(swapSubdomain('https://api.example.com', 'service', 'auth'), '');
  assert.equal(swapSubdomain('not-a-url', 'service', 'auth'), '');
});

test('OAuth error descriptors map common redirect, broker, and relay failures', () => {
  assert.deepEqual(describeOAuthRedirectError('access_denied', 'user closed the window'), {
    key: 'tokenSetup.errors.oauthCanceled',
    values: undefined,
    detail: 'error=access_denied, description=user closed the window',
  });

  assert.deepEqual(describeBrokerError(503, 'broker_not_configured'), {
    key: 'tokenSetup.errors.oauthBrokerConfig',
    values: undefined,
    detail: 'status=503, message=broker_not_configured',
  });

  assert.deepEqual(describeRelayError({
    upstreamStatus: 400,
    upstreamErrorDescription: 'redirect_uri mismatch',
  }), {
    key: 'tokenSetup.errors.oauthRedirectMismatch',
    values: undefined,
    detail: JSON.stringify({
      upstreamStatus: 400,
      upstreamErrorDescription: 'redirect_uri mismatch',
    }, null, 2),
  });
});

test('home config cache reads, expires, and clears entries safely', () => {
  const storage = new MemoryStorage();
  const originalDateNow = Date.now;

  try {
    Date.now = () => 10_000;

    writeHomeConfigCache('loc-1', { enabled: true }, storage);
    assert.deepEqual(readHomeConfigCache('loc-1', storage), {
      hit: true,
      value: { enabled: true },
    });

    Date.now = () => 10_000 + (5 * 60 * 1000) + 1;
    assert.deepEqual(readHomeConfigCache('loc-1', storage), {
      hit: false,
      value: null,
    });

    writeHomeConfigCache('loc-1', { enabled: true }, storage);
    writeHomeConfigCache('loc-2', { enabled: false }, storage);
    storage.setItem('other-key', 'keep-me');
    clearHomeConfigCaches(storage);

    assert.equal(storage.getItem('other-key'), 'keep-me');
    assert.equal(storage.getItem('st_home_config_cache:loc-1'), null);
    assert.equal(storage.getItem('st_home_config_cache:loc-2'), null);
  } finally {
    Date.now = originalDateNow;
  }
});
