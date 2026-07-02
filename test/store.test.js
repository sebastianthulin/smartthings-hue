import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultHomeConfig,
  inferCachedMode,
  isValidTimeValue,
  normalizeHomeConfig,
  normalizeScenes,
  store,
} from '../src/services/store.js';
import { resetBackendProvider, setBackendProvider } from '../src/services/backend.js';
import { toasts } from '../src/services/toasts.ts';

function createTestBackendProvider(overrides = {}) {
  return {
    hasToken: false,
    authMode: 'oauth',
    authConfigError: '',
    pendingLoginMode: 'browser',
    hasPendingLogin: false,
    sharedConfigEnabled: true,
    setToken() {},
    clearToken() {},
    consumeAuthNotice() {
      return null;
    },
    async resumePendingLogin() {
      return false;
    },
    async maybeCompleteLoginFromRedirect() {
      return false;
    },
    async maybeRefreshSession() {
      return true;
    },
    async startLogin() {
      return null;
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
    ...overrides,
  };
}

test('normalizeHomeConfig falls back to defaults and sanitizes identifiers', () => {
  assert.deepEqual(normalizeHomeConfig('living-room', {
    updatedAt: 'not-a-number',
    mainRoutines: {
      turnOnConfirmEnabled: false,
      turnOnConfirmTime: ' 25:00 ',
      turnOnSceneId: ' scene-on ',
      turnOffSceneId: '   ',
    },
    hiddenRoomIds: [' kitchen ', 'kitchen', null, '', 'hall'],
    roomSettings: {
      kitchen: {
        hiddenLightIds: [' light-1 ', 'light-1', false, 'light-2'],
        routineSceneIds: [' scene-b ', '', 'scene-a', 'scene-b'],
      },
      invalid: [],
    },
  }), {
    schemaVersion: 1,
    locationId: 'living-room',
    updatedAt: null,
    mainRoutines: {
      turnOnConfirmEnabled: false,
      turnOnConfirmTime: '21:00',
      turnOnSceneId: 'scene-on',
      turnOffSceneId: null,
    },
    hiddenRoomIds: ['kitchen', 'hall'],
    roomSettings: {
      kitchen: {
        hiddenLightIds: ['light-1', 'light-2'],
        routineSceneIds: ['scene-b', 'scene-a'],
      },
      invalid: {
        hiddenLightIds: [],
        routineSceneIds: [],
      },
    },
  });
});

test('normalizeScenes removes invalid entries, de-duplicates by id, and sorts by name', () => {
  assert.deepEqual(normalizeScenes([
    { sceneId: ' scene-2 ', sceneName: 'Wake Up', locationId: 'loc-1' },
    { sceneId: 'scene-1', name: 'All Off', locationId: 'loc-1' },
    { sceneId: 'scene-2', sceneName: 'Duplicate should win', locationId: 'loc-2' },
    { sceneId: '   ', sceneName: 'Ignored' },
    null,
  ]), [
    {
      sceneId: 'scene-1',
      sceneName: 'All Off',
      locationId: 'loc-1',
    },
    {
      sceneId: 'scene-2',
      sceneName: 'Duplicate should win',
      locationId: 'loc-2',
    },
  ]);
});

test('time validation and cached mode inference handle legacy values', () => {
  assert.equal(isValidTimeValue('00:00'), true);
  assert.equal(isValidTimeValue('23:59'), true);
  assert.equal(isValidTimeValue('24:00'), false);
  assert.equal(isValidTimeValue('10:60'), false);

  assert.deepEqual(createDefaultHomeConfig('loc-1'), {
    schemaVersion: 1,
    locationId: 'loc-1',
    updatedAt: null,
    mainRoutines: {
      turnOnConfirmEnabled: true,
      turnOnConfirmTime: '21:00',
      turnOnSceneId: null,
      turnOffSceneId: null,
    },
    hiddenRoomIds: [],
    roomSettings: {},
  });

  assert.equal(inferCachedMode({ mode: 'mock', locationId: 'live-location' }), 'mock');
  assert.equal(inferCachedMode({ mode: 'live', locationId: 'mock-location' }), 'live');
  assert.equal(inferCachedMode({ locationId: 'mock-location' }), 'mock');
  assert.equal(inferCachedMode({ locationId: 'real-location' }), 'live');
});

test('executeMainRoutine updates lights optimistically and waits before checking backend state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fetchDevicesCalls = 0;
  let resolveSyncStarted = null;
  const syncStarted = new Promise((resolve) => {
    resolveSyncStarted = resolve;
  });

  try {
    setBackendProvider(createTestBackendProvider({
      async executeScene(sceneId, locationId) {
        assert.equal(sceneId, 'scene-off');
        assert.equal(locationId, 'test-location');
        return { ok: true };
      },
      async fetchRooms() {
        return [{ roomId: 'living', name: 'Living Room' }];
      },
      async fetchDevices() {
        fetchDevicesCalls += 1;
        resolveSyncStarted();
        return [{
          deviceId: 'light-1',
          label: 'Ceiling',
          roomId: 'living',
          components: [{ capabilities: [{ id: 'switch' }] }],
          status: {
            components: {
              main: {
                switch: {
                  switch: { value: 'on' },
                },
              },
            },
          },
        }];
      },
      async fetchHomeConfig() {
        return {
          mainRoutines: {
            turnOffSceneId: 'scene-off',
          },
        };
      },
    }));

    toasts.clear();
    localStorage.clear();
    store.clearCache();

    localStorage.setItem('st_home_state', JSON.stringify({
      rooms: [{
        id: 'living',
        name: 'Living Room',
        occupied: false,
        climate: null,
        lights: [{
          id: 'light-1',
          name: 'Ceiling',
          on: true,
        }],
      }],
      lastSync: Date.now(),
      locationId: 'test-location',
      mode: 'live',
      homeConfig: {
        mainRoutines: {
          turnOnConfirmEnabled: true,
          turnOnConfirmTime: '21:00',
          turnOnSceneId: null,
          turnOffSceneId: 'scene-off',
        },
        hiddenRoomIds: [],
        roomSettings: {},
      },
      scenes: [{
        sceneId: 'scene-off',
        sceneName: 'All Off',
        locationId: 'test-location',
      }],
      sharedConfigLastSync: Date.now(),
    }));

    assert.equal(store.rehydrate(), true);

    const runPromise = store.executeMainRoutine('turnOff');

    assert.equal(store.rooms[0].lights[0].on, false);
    assert.equal(toasts.items.length, 0);
    assert.equal(fetchDevicesCalls, 0);

    assert.equal(await runPromise, true);
    assert.equal(store.rooms[0].lights[0].on, false);
    assert.equal(fetchDevicesCalls, 0);
    assert.equal(toasts.items.length, 0);

    t.mock.timers.tick(999);
    assert.equal(fetchDevicesCalls, 0);
    assert.equal(store.rooms[0].lights[0].on, false);
    assert.equal(toasts.items.length, 0);

    const synced = new Promise((resolve) => {
      store.addEventListener('synced', resolve, { once: true });
    });
    t.mock.timers.tick(1);
    await syncStarted;
    await synced;
    await Promise.resolve();

    assert.equal(store.rooms[0].lights[0].on, true);
    assert.equal(fetchDevicesCalls, 1);
    assert.equal(toasts.items.length, 1);
    assert.equal(toasts.items[0].titleKey, 'home.toasts.mainRoutineCheckTitle');
    assert.equal(toasts.items[0].descriptionKey, 'home.toasts.mainRoutineTurnOffCheckDescription');
  } finally {
    toasts.clear();
    store.clearCache();
    localStorage.clear();
    resetBackendProvider();
  }
});
