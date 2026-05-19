import {
  SUPPORTED_CAPABILITIES,
  isSupportedCapability,
  type SupportedCapability,
} from './capabilities';

export type LightColor = {
  hue: number;
  saturation: number;
};

export type Light = {
  id: string;
  name: string;
  on: boolean;
  brightness?: number;
  color?: LightColor;
  colorTemp?: number;
};

export type Climate = {
  temperature?: number;
  humidity?: number;
};

export type Room = {
  id: string;
  name: string;
  occupied: boolean;
  climate: Climate | null;
  lights: Light[];
};

type ClimateKey = keyof Climate;
type ClimateAccum = Partial<Record<ClimateKey, { sum: number; count: number }>>;

type RoomAccumulator = Room & {
  _climateAccum: ClimateAccum;
};

type RawCapability = {
  id?: string;
};

type RawComponent = {
  capabilities?: RawCapability[];
};

type RawDevice = {
  deviceId: string;
  label?: string;
  name?: string;
  roomId?: string;
  components?: RawComponent[];
};

type RawRoom = {
  roomId: string;
  name: string;
};

type RawStatus = {
  components?: {
    main?: Record<string, Record<string, { value?: unknown }>>;
  };
};

type RawHealth = {
  state?: string;
};

type ZoneState = {
  state?: string;
};

export function normalizeHome(
  rawDevices: RawDevice[],
  rawRooms: RawRoom[],
  statusMap: Record<string, RawStatus>,
  healthMap: Record<string, RawHealth> = {},
): Room[] {
  const roomMap = new Map<string, RoomAccumulator>();
  for (const r of rawRooms) {
    roomMap.set(r.roomId, makeRoom(r.roomId, r.name));
  }

  const unassigned = makeRoom('__unassigned', 'Home');

  for (const device of rawDevices) {
    const caps = getDeviceCaps(device);
    if (caps.size === 0) continue; // no supported capabilities → ignore
    if (isDeviceOffline(healthMap[device.deviceId])) continue;

    const status = statusMap[device.deviceId] ?? null;
    const room = (device.roomId && roomMap.get(device.roomId)) ?? unassigned;

    if (isLightDevice(caps)) {
      room.lights.push(normalizeLight(device, caps, status));
    }

    if (caps.has('temperatureMeasurement')) {
      const temp = readAttr<number>(status, 'temperatureMeasurement', 'temperature');
      if (temp !== null) aggregateClimate(room, 'temperature', temp);
    }

    if (caps.has('relativeHumidityMeasurement')) {
      const hum = readAttr<number>(status, 'relativeHumidityMeasurement', 'humidity');
      if (hum !== null) aggregateClimate(room, 'humidity', hum);
    }

    if (!room.occupied) {
      room.occupied = readOccupancy(status, caps);
    }
  }

  const allRooms = [...roomMap.values()];
  if (unassigned.lights.length > 0 || Object.keys(unassigned._climateAccum).length > 0) {
    allRooms.push(unassigned);
  }

  for (const room of allRooms) {
    finalizeClimate(room);
  }

  return sortHome(allRooms
    .filter((room) => room.lights.length > 0 || hasClimate(room))
    .map(({ _climateAccum: _ignored, ...room }) => room));
}

export function sortHome(rooms: Room[]): Room[] {
  return [...rooms]
    .map((room) => ({
      ...room,
      lights: [...(room.lights ?? [])].sort(compareByName),
    }))
    .sort(compareByName);
}

function compareByName<T extends { name?: string }>(left: T, right: T): number {
  return (left.name ?? '').localeCompare(right.name ?? '', undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function makeRoom(id: string, name: string): RoomAccumulator {
  return {
    id,
    name,
    occupied: false,
    _climateAccum: {},
    climate: null,
    lights: [],
  };
}

function hasClimate(room: Room): boolean {
  return room.climate && (room.climate.temperature != null || room.climate.humidity != null);
}

function aggregateClimate(room: RoomAccumulator, key: ClimateKey, value: number): void {
  if (!room._climateAccum[key]) {
    room._climateAccum[key] = { sum: 0, count: 0 };
  }
  room._climateAccum[key].sum += value;
  room._climateAccum[key].count += 1;
}

function finalizeClimate(room: RoomAccumulator): void {
  const accum = room._climateAccum;

  if (!Object.keys(accum).length) {
    room.climate = null;
    return;
  }

  room.climate = {};
  if (accum.temperature) {
    room.climate.temperature = Math.round(accum.temperature.sum / accum.temperature.count * 10) / 10;
  }
  if (accum.humidity) {
    room.climate.humidity = Math.round(accum.humidity.sum / accum.humidity.count);
  }
}

function getDeviceCaps(device: RawDevice): Set<SupportedCapability> {
    const caps = new Set<SupportedCapability>();
  for (const comp of device.components ?? []) {
    for (const cap of comp.capabilities ?? []) {
      if (isSupportedCapability(cap.id)) caps.add(cap.id);
    }
  }
  return caps;
}

function isLightDevice(caps: Set<SupportedCapability>): boolean {
  return caps.has('switch');
}

function isDeviceOffline(health?: RawHealth): boolean {
  return health?.state === 'OFFLINE';
}

function readOccupancy(status: RawStatus | null, caps: Set<SupportedCapability>): boolean {
  if (caps.has('occupancySensor') && readAttr<string>(status, 'occupancySensor', 'occupancy') === 'occupied') {
    return true;
  }

  if (caps.has('presenceSensor') && readAttr<string>(status, 'presenceSensor', 'presence') === 'present') {
    return true;
  }

  if (caps.has('motionSensor') && readAttr<string>(status, 'motionSensor', 'motion') === 'active') {
    return true;
  }

  if (caps.has('movementSensor') && isActiveMovement(readAttr<string>(status, 'movementSensor', 'movement'))) {
    return true;
  }

  if (caps.has('multipleZonePresence') && hasPresentZone(readAttr(status, 'multipleZonePresence', 'zoneState'))) {
    return true;
  }

  return false;
}

function isActiveMovement(value: string | null): boolean {
  return typeof value === 'string' && value !== 'inactive';
}

function hasPresentZone(value: unknown): boolean {
  const zones = parseZoneState(value);
  return zones.some((zone) => zone?.state === 'present' || zone?.state === 'occupied');
}

function parseZoneState(value: unknown): ZoneState[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeLight(
  device: RawDevice,
  caps: Set<SupportedCapability>,
  status: RawStatus | null,
): Light {
  const light: Light = {
    id: device.deviceId,
    name: device.label || device.name || 'Light',
    on: false,
    brightness: undefined,
    color: undefined,
    colorTemp: undefined,
  };

  if (!status) return light;

  light.on = readAttr<string>(status, 'switch', 'switch') === 'on';

  if (caps.has('switchLevel')) {
    const lvl = readAttr<number>(status, 'switchLevel', 'level');
    if (lvl !== null) light.brightness = lvl;
  }

  if (caps.has('colorControl')) {
    const hue = readAttr<number>(status, 'colorControl', 'hue');
    const sat = readAttr<number>(status, 'colorControl', 'saturation');
    if (hue !== null && sat !== null) light.color = { hue, saturation: sat };
  }

  if (caps.has('colorTemperature')) {
    const ct = readAttr<number>(status, 'colorTemperature', 'colorTemperature');
    if (ct !== null) light.colorTemp = ct;
  }

  return light;
}

function readAttr<T>(status: RawStatus | null, capability: string, attribute: string): T | null {
  try {
    const val = status?.components?.main?.[capability]?.[attribute]?.value;
    return (val ?? null) as T | null;
  } catch {
    return null;
  }
}
