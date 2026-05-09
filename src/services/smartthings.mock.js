const MOCK_LOCATION_ID = 'mock-location';

const MOCK_LOCATIONS = [
  { locationId: MOCK_LOCATION_ID, name: 'Demo Home' },
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
