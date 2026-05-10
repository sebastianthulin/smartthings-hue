const MOCK_LOCATION_ID = 'mock-location';

const MOCK_LOCATIONS = [
  { locationId: MOCK_LOCATION_ID, name: 'Demo Home' },
];

const SCENE_LIGHT_DEVICE_IDS = [
  'sofa-lamp',
  'ceiling-strip',
  'island-pendant',
  'bedside-left',
  'bedside-right',
];

const MOCK_ROOMS = [
  { roomId: 'living-room', locationId: MOCK_LOCATION_ID, name: 'Living Room' },
  { roomId: 'kitchen', locationId: MOCK_LOCATION_ID, name: 'Kitchen' },
  { roomId: 'bedroom', locationId: MOCK_LOCATION_ID, name: 'Bedroom' },
];

const MOCK_DEVICES = [
  makeDevice('sofa-lamp', 'Sofa Lamp', 'living-room', ['switch', 'switchLevel', 'colorControl', 'colorTemperature']),
  makeDevice('ceiling-strip', 'Ceiling Strip', 'living-room', ['switch', 'switchLevel', 'colorTemperature']),
  makeDevice('living-sensor', 'Living Sensor', 'living-room', ['temperatureMeasurement', 'relativeHumidityMeasurement', 'occupancySensor']),
  makeDevice('island-pendant', 'Island Pendant', 'kitchen', ['switch', 'switchLevel', 'colorTemperature']),
  makeDevice('kitchen-sensor', 'Kitchen Sensor', 'kitchen', ['temperatureMeasurement', 'relativeHumidityMeasurement', 'motionSensor']),
  makeDevice('bedside-left', 'Bedside Left', 'bedroom', ['switch', 'switchLevel', 'colorTemperature']),
  makeDevice('bedside-right', 'Bedside Right', 'bedroom', ['switch', 'switchLevel', 'colorTemperature']),
  makeDevice('bedroom-sensor', 'Bedroom Sensor', 'bedroom', ['temperatureMeasurement', 'relativeHumidityMeasurement']),
];

const MOCK_SCENES = [
  { sceneId: 'whole-house-on-off', locationId: MOCK_LOCATION_ID, sceneName: 'Whole House On/Off' },
  { sceneId: 'living-room-relax', locationId: MOCK_LOCATION_ID, sceneName: 'Living Room Relax' },
  { sceneId: 'living-room-bright', locationId: MOCK_LOCATION_ID, sceneName: 'Living Room Bright' },
  { sceneId: 'kitchen-cooking', locationId: MOCK_LOCATION_ID, sceneName: 'Kitchen Cooking' },
  { sceneId: 'bedroom-night', locationId: MOCK_LOCATION_ID, sceneName: 'Bedroom Night' },
  { sceneId: 'bedroom-reading', locationId: MOCK_LOCATION_ID, sceneName: 'Bedroom Reading' },
];

const INITIAL_STATUSES = {
  'sofa-lamp': makeStatus({
    switch: 'on',
    level: 78,
    hue: 18,
    saturation: 62,
    colorTemperature: 2600,
  }),
  'ceiling-strip': makeStatus({
    switch: 'on',
    level: 42,
    colorTemperature: 3000,
  }),
  'living-sensor': makeStatus({
    temperature: 21.4,
    humidity: 44,
    occupancy: 'occupied',
  }),
  'island-pendant': makeStatus({
    switch: 'off',
    level: 0,
    colorTemperature: 3500,
  }),
  'kitchen-sensor': makeStatus({
    temperature: 20.8,
    humidity: 41,
    motion: 'inactive',
  }),
  'bedside-left': makeStatus({
    switch: 'on',
    level: 24,
    colorTemperature: 2200,
  }),
  'bedside-right': makeStatus({
    switch: 'off',
    level: 0,
    colorTemperature: 2200,
  }),
  'bedroom-sensor': makeStatus({
    temperature: 19.9,
    humidity: 48,
  }),
};

const mockState = {
  statuses: clone(INITIAL_STATUSES),
};

export function isMockSmartThingsEnabled() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mock') === '1';
}

export async function handleMockSmartThingsRequest(path, options = {}) {
  const [pathname, search = ''] = path.split('?');
  const method = (options.method ?? 'GET').toUpperCase();

  if (method === 'GET' && pathname === '/locations') {
    return { items: clone(MOCK_LOCATIONS) };
  }

  if (method === 'GET' && pathname === `/locations/${MOCK_LOCATION_ID}/rooms`) {
    return { items: clone(MOCK_ROOMS) };
  }

  if (method === 'GET' && pathname === '/devices') {
    const params = new URLSearchParams(search);
    const locationId = params.get('locationId');
    const devices = locationId && locationId !== MOCK_LOCATION_ID
      ? []
      : MOCK_DEVICES;
    return { items: clone(devices) };
  }

  if (method === 'GET' && pathname === '/scenes') {
    return { items: clone(MOCK_SCENES) };
  }

  if (method === 'GET' && pathname.startsWith('/devices/') && pathname.endsWith('/status')) {
    const deviceId = pathname.split('/')[2];
    return clone(mockState.statuses[deviceId] ?? makeStatus({}));
  }

  if (method === 'POST' && pathname.startsWith('/devices/') && pathname.endsWith('/commands')) {
    const deviceId = pathname.split('/')[2];
    const body = JSON.parse(options.body ?? '{}');
    applyCommands(deviceId, body.commands ?? []);
    return { results: [{ id: `mock-${deviceId}`, status: 'ACCEPTED' }] };
  }

  if (method === 'POST' && pathname.startsWith('/scenes/') && pathname.endsWith('/execute')) {
    const sceneId = pathname.split('/')[2];
    applyScene(sceneId);
    return { status: 'SUCCESS' };
  }

  throw new Error(`Unsupported mock SmartThings request: ${method} ${path}`);
}

function makeDevice(deviceId, label, roomId, capabilities) {
  return {
    deviceId,
    name: label,
    label,
    roomId,
    components: [
      {
        id: 'main',
        capabilities: capabilities.map(id => ({ id })),
      },
    ],
  };
}

function makeStatus({
  switch: switchState,
  level,
  hue,
  saturation,
  colorTemperature,
  temperature,
  humidity,
  occupancy,
  motion,
}) {
  const main = {};

  if (switchState != null) {
    main.switch = { switch: { value: switchState } };
  }
  if (level != null) {
    main.switchLevel = { level: { value: level } };
  }
  if (hue != null || saturation != null) {
    main.colorControl = {
      hue: { value: hue ?? 0 },
      saturation: { value: saturation ?? 0 },
    };
  }
  if (colorTemperature != null) {
    main.colorTemperature = {
      colorTemperature: { value: colorTemperature },
    };
  }
  if (temperature != null) {
    main.temperatureMeasurement = {
      temperature: { value: temperature },
    };
  }
  if (humidity != null) {
    main.relativeHumidityMeasurement = {
      humidity: { value: humidity },
    };
  }
  if (occupancy != null) {
    main.occupancySensor = {
      occupancy: { value: occupancy },
    };
  }
  if (motion != null) {
    main.motionSensor = {
      motion: { value: motion },
    };
  }

  return { components: { main } };
}

function applyCommands(deviceId, commands) {
  const status = mockState.statuses[deviceId];
  if (!status) {
    console.warn(`Mock SmartThings device "${deviceId}" has no status payload.`);
    return;
  }

  for (const command of commands) {
    const main = status.components.main;

    if (command.capability === 'switch' && command.command === 'on') {
      main.switch = { switch: { value: 'on' } };
      if (main.switchLevel?.level?.value === 0) {
        main.switchLevel.level.value = 100;
      }
    }

    if (command.capability === 'switch' && command.command === 'off') {
      main.switch = { switch: { value: 'off' } };
    }

    if (command.capability === 'switchLevel' && command.command === 'setLevel') {
      const nextLevel = Math.max(0, Math.min(100, Number(command.arguments?.[0] ?? 0)));
      main.switchLevel = { level: { value: nextLevel } };
      main.switch = { switch: { value: nextLevel > 0 ? 'on' : 'off' } };
    }

    if (command.capability === 'colorControl' && command.command === 'setColor') {
      const nextColor = command.arguments?.[0] ?? {};
      main.colorControl = {
        hue: { value: Number(nextColor.hue ?? 0) },
        saturation: { value: Number(nextColor.saturation ?? 0) },
      };
    }

    if (command.capability === 'colorTemperature' && command.command === 'setColorTemperature') {
      main.colorTemperature = {
        colorTemperature: { value: Number(command.arguments?.[0] ?? 0) },
      };
    }
  }
}

function applyScene(sceneId) {
  if (sceneId === 'whole-house-on-off') {
    const anyOn = SCENE_LIGHT_DEVICE_IDS.some(deviceId =>
      mockState.statuses[deviceId]?.components?.main?.switch?.switch?.value === 'on'
    );
    const target = anyOn ? 'off' : 'on';
    for (const deviceId of SCENE_LIGHT_DEVICE_IDS) {
      const main = mockState.statuses[deviceId]?.components?.main;
      if (!main) continue;
      main.switch = { switch: { value: target } };
      if (main.switchLevel?.level) {
        main.switchLevel.level.value = target === 'on'
          ? Math.max(1, Number(main.switchLevel.level.value ?? 0))
          : 0;
      }
    }
    return;
  }

  if (sceneId === 'living-room-relax') {
    setLightState('sofa-lamp', { on: true, level: 38, colorTemperature: 2200 });
    setLightState('ceiling-strip', { on: true, level: 20, colorTemperature: 2500 });
    return;
  }

  if (sceneId === 'living-room-bright') {
    setLightState('sofa-lamp', { on: true, level: 100, colorTemperature: 3000 });
    setLightState('ceiling-strip', { on: true, level: 92, colorTemperature: 3200 });
    return;
  }

  if (sceneId === 'kitchen-cooking') {
    setLightState('island-pendant', { on: true, level: 100, colorTemperature: 4000 });
    return;
  }

  if (sceneId === 'bedroom-night') {
    setLightState('bedside-left', { on: true, level: 12, colorTemperature: 2200 });
    setLightState('bedside-right', { on: false, level: 0, colorTemperature: 2200 });
    return;
  }

  if (sceneId === 'bedroom-reading') {
    setLightState('bedside-left', { on: true, level: 48, colorTemperature: 2600 });
    setLightState('bedside-right', { on: true, level: 48, colorTemperature: 2600 });
    return;
  }
}

function setLightState(deviceId, { on, level, colorTemperature }) {
  const main = mockState.statuses[deviceId]?.components?.main;
  if (!main) return;

  main.switch = { switch: { value: on ? 'on' : 'off' } };

  if (main.switchLevel) {
    main.switchLevel.level.value = on ? Math.max(1, Number(level ?? 100)) : 0;
  }

  if (main.colorTemperature && colorTemperature !== null && colorTemperature !== undefined) {
    main.colorTemperature.colorTemperature.value = Number(colorTemperature);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
