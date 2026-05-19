import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeHome, sortHome } from '../src/services/normalizer.js';

test('normalizeHome keeps supported devices, aggregates climate, and sorts output', () => {
  const rooms = [
    { roomId: 'kitchen', name: 'Kitchen' },
    { roomId: 'living', name: 'Living Room' },
  ];
  const devices = [
    {
      deviceId: 'light-2',
      label: 'Lamp 10',
      roomId: 'living',
      components: [{ capabilities: [{ id: 'switch' }, { id: 'switchLevel' }] }],
    },
    {
      deviceId: 'light-1',
      label: 'Lamp 2',
      roomId: 'living',
      components: [{ capabilities: [{ id: 'switch' }, { id: 'colorTemperature' }] }],
    },
    {
      deviceId: 'sensor-1',
      label: 'Kitchen Sensor',
      roomId: 'kitchen',
      components: [{
        capabilities: [
          { id: 'temperatureMeasurement' },
          { id: 'relativeHumidityMeasurement' },
          { id: 'occupancySensor' },
        ],
      }],
    },
    {
      deviceId: 'sensor-2',
      label: 'Outdoor Sensor',
      components: [{ capabilities: [{ id: 'temperatureMeasurement' }] }],
    },
    {
      deviceId: 'offline-light',
      label: 'Offline Light',
      roomId: 'living',
      components: [{ capabilities: [{ id: 'switch' }] }],
    },
    {
      deviceId: 'ignored-device',
      label: 'Ignored',
      roomId: 'living',
      components: [{ capabilities: [{ id: 'audioVolume' }] }],
    },
  ];
  const statusMap = {
    'light-1': { components: { main: { switch: { switch: { value: 'on' } }, colorTemperature: { colorTemperature: { value: 2700 } } } } },
    'light-2': { components: { main: { switch: { switch: { value: 'off' } }, switchLevel: { level: { value: 45 } } } } },
    'sensor-1': {
      components: {
        main: {
          temperatureMeasurement: { temperature: { value: 21.4 } },
          relativeHumidityMeasurement: { humidity: { value: 44 } },
          occupancySensor: { occupancy: { value: 'occupied' } },
        },
      },
    },
    'sensor-2': {
      components: {
        main: {
          temperatureMeasurement: { temperature: { value: 18.2 } },
        },
      },
    },
    'offline-light': { components: { main: { switch: { switch: { value: 'on' } } } } },
  };
  const healthMap = {
    'offline-light': { state: 'OFFLINE' },
  };

  assert.deepEqual(normalizeHome(devices, rooms, statusMap, healthMap), [
    {
      id: '__unassigned',
      name: 'Home',
      occupied: false,
      climate: {
        temperature: 18.2,
      },
      lights: [],
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      occupied: true,
      climate: {
        temperature: 21.4,
        humidity: 44,
      },
      lights: [],
    },
    {
      id: 'living',
      name: 'Living Room',
      occupied: false,
      climate: null,
      lights: [
        {
          id: 'light-1',
          name: 'Lamp 2',
          on: true,
          brightness: undefined,
          color: undefined,
          colorTemp: 2700,
        },
        {
          id: 'light-2',
          name: 'Lamp 10',
          on: false,
          brightness: 45,
          color: undefined,
          colorTemp: undefined,
        },
      ],
    },
  ]);
});

test('sortHome sorts rooms and light names using numeric-aware comparison', () => {
  assert.deepEqual(sortHome([
    {
      id: 'b',
      name: 'Room 10',
      lights: [{ id: '2', name: 'Lamp 10' }, { id: '1', name: 'Lamp 2' }],
    },
    {
      id: 'a',
      name: 'Room 2',
      lights: [],
    },
  ]), [
    {
      id: 'a',
      name: 'Room 2',
      lights: [],
    },
    {
      id: 'b',
      name: 'Room 10',
      lights: [{ id: '1', name: 'Lamp 2' }, { id: '2', name: 'Lamp 10' }],
    },
  ]);
});
