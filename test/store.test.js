import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultHomeConfig,
  inferCachedMode,
  isValidTimeValue,
  normalizeHomeConfig,
  normalizeScenes,
} from '../src/services/store.js';

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
