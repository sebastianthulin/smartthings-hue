import test from 'node:test';
import assert from 'node:assert/strict';

import {
  backend,
  getBackendProvider,
  registerBackendProvider,
  resetBackendProvider,
  setBackendProvider,
  useBackendProvider,
} from '../src/services/backend.js';
import { smartthings } from '../src/services/smartthings.js';

function createTestBackendProvider() {
  return {
    hasToken: false,
    authMode: 'oauth',
    authConfigError: '',
    pendingLoginMode: 'browser',
    hasPendingLogin: false,
    sharedConfigEnabled: true,
    lastToken: null,
    setToken(token) {
      this.lastToken = token;
    },
    clearToken() {},
    consumeAuthNotice() {
      return { type: 'test-notice' };
    },
    async resumePendingLogin() {
      return { resumed: true };
    },
    async maybeCompleteLoginFromRedirect() {
      return false;
    },
    async maybeRefreshSession() {
      return true;
    },
    async startLogin() {
      return { pending: true, handoff: 'browser' };
    },
    async fetchLocations() {
      return [{ locationId: 'test-location' }];
    },
    async fetchRooms() {
      return [];
    },
    async fetchDevices() {
      return [];
    },
    async fetchHomeConfig() {
      return null;
    },
    async saveHomeConfig(_locationId, config) {
      return config;
    },
    async fetchDeviceStatus() {
      return {};
    },
    async fetchDeviceHealth() {
      return {};
    },
    async sendCommand() {
      return { ok: true };
    },
    async switchOn() {
      return { ok: true };
    },
    async switchOff() {
      return { ok: true };
    },
    async setLevel() {
      return { ok: true };
    },
    async setColor() {
      return { ok: true };
    },
    async setColorTemperature() {
      return { ok: true };
    },
    async fetchScenes() {
      return [];
    },
    async executeScene() {
      return { ok: true };
    },
  };
}

test('backend defaults to SmartThings and can swap to another registered provider', async () => {
  const testProvider = createTestBackendProvider();

  try {
    assert.equal(getBackendProvider(), smartthings);
    assert.equal(backend.authMode, smartthings.authMode);

    registerBackendProvider('test-provider', testProvider);
    useBackendProvider('test-provider');

    assert.equal(getBackendProvider(), testProvider);
    assert.equal(backend.authMode, 'oauth');

    backend.setToken('test-token');
    assert.equal(testProvider.lastToken, 'test-token');
    assert.deepEqual(await backend.startLogin(), {
      pending: true,
      handoff: 'browser',
    });
    assert.deepEqual(await backend.fetchLocations(), [{ locationId: 'test-location' }]);
  } finally {
    resetBackendProvider();
  }

  assert.equal(getBackendProvider(), smartthings);
});

test('setting an invalid backend provider fails fast', () => {
  assert.throws(() => {
    setBackendProvider({});
  }, /missing required members/i);
});
