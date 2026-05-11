/**
 * Normalizer — converts raw SmartThings API data into the clean internal model.
 *
 * Internal model:
 *   Room { id, name, occupied, climate, lights[] }
 *   Light { id, name, on, brightness?, color? }
 *
 * The frontend never sees SmartThings capabilities, attributes, or payloads.
 */

import { SUPPORTED_CAPABILITIES } from './smartthings.js';

/**
 * Build a normalized Room[] from raw SmartThings data.
 *
 * @param {Array}  rawDevices  - /devices response items
 * @param {Array}  rawRooms    - /locations/{id}/rooms response items
 * @param {Object} statusMap   - { [deviceId]: deviceStatusResponse }
 * @param {Object} healthMap   - { [deviceId]: deviceHealthResponse }
 * @returns {Room[]}
 */
export function normalizeHome(rawDevices, rawRooms, statusMap, healthMap = {}) {
  // Build room stubs keyed by roomId
  const roomMap = new Map();
  for (const r of rawRooms) {
    roomMap.set(r.roomId, makeRoom(r.roomId, r.name));
  }

  // Fallback bucket for unassigned devices
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
      const temp = readAttr(status, 'temperatureMeasurement', 'temperature');
      if (temp !== null) aggregateClimate(room, 'temperature', temp);
    }

    if (caps.has('relativeHumidityMeasurement')) {
      const hum = readAttr(status, 'relativeHumidityMeasurement', 'humidity');
      if (hum !== null) aggregateClimate(room, 'humidity', hum);
    }

    if (!room.occupied) {
      room.occupied = readOccupancy(status, caps);
    }
  }

  // Finalize climate averages
  const allRooms = [...roomMap.values()];
  if (unassigned.lights.length > 0 || hasClimate(unassigned)) {
    allRooms.push(unassigned);
  }

  for (const room of allRooms) {
    finalizeClimate(room);
  }

  // Return only rooms with something to show
  return sortHome(allRooms.filter(r => r.lights.length > 0 || hasClimate(r)));
}

export function sortHome(rooms) {
  return [...rooms]
    .map(room => ({
      ...room,
      lights: [...(room.lights ?? [])].sort(compareByName),
    }))
    .sort(compareByName);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function compareByName(left, right) {
  return (left.name ?? '').localeCompare(right.name ?? '', undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

function makeRoom(id, name) {
  return {
    id,
    name,
    occupied: false,
    _climateAccum: {},   // internal accumulator, removed after finalization
    climate: null,
    lights: [],
  };
}

function hasClimate(room) {
  return room.climate && (room.climate.temperature != null || room.climate.humidity != null);
}

function aggregateClimate(room, key, value) {
  if (!room._climateAccum[key]) {
    room._climateAccum[key] = { sum: 0, count: 0 };
  }
  room._climateAccum[key].sum += value;
  room._climateAccum[key].count += 1;
}

function finalizeClimate(room) {
  const accum = room._climateAccum;
  delete room._climateAccum;

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

/** Return the intersection of device capabilities and our whitelist. */
function getDeviceCaps(device) {
  const caps = new Set();
  for (const comp of device.components ?? []) {
    for (const cap of comp.capabilities ?? []) {
      if (SUPPORTED_CAPABILITIES.has(cap.id)) caps.add(cap.id);
    }
  }
  return caps;
}

/** A device is a "light" if it can be switched on/off. */
function isLightDevice(caps) {
  return caps.has('switch');
}

function isDeviceOffline(health) {
  return health?.state === 'OFFLINE';
}

function readOccupancy(status, caps) {
  if (caps.has('occupancySensor') && readAttr(status, 'occupancySensor', 'occupancy') === 'occupied') {
    return true;
  }

  if (caps.has('presenceSensor') && readAttr(status, 'presenceSensor', 'presence') === 'present') {
    return true;
  }

  if (caps.has('motionSensor') && readAttr(status, 'motionSensor', 'motion') === 'active') {
    return true;
  }

  if (caps.has('movementSensor') && isActiveMovement(readAttr(status, 'movementSensor', 'movement'))) {
    return true;
  }

  if (caps.has('multipleZonePresence') && hasPresentZone(readAttr(status, 'multipleZonePresence', 'zoneState'))) {
    return true;
  }

  return false;
}

function isActiveMovement(value) {
  return typeof value === 'string' && value !== 'inactive';
}

function hasPresentZone(value) {
  const zones = parseZoneState(value);
  return zones.some(zone => zone?.state === 'present' || zone?.state === 'occupied');
}

function parseZoneState(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeLight(device, caps, status) {
  const light = {
    id: device.deviceId,
    name: device.label || device.name || 'Light',
    on: false,
    brightness: undefined,
    color: undefined,
    colorTemp: undefined,
  };

  if (!status) return light;

  light.on = readAttr(status, 'switch', 'switch') === 'on';

  if (caps.has('switchLevel')) {
    const lvl = readAttr(status, 'switchLevel', 'level');
    if (lvl !== null) light.brightness = lvl;
  }

  if (caps.has('colorControl')) {
    const hue = readAttr(status, 'colorControl', 'hue');
    const sat = readAttr(status, 'colorControl', 'saturation');
    if (hue !== null && sat !== null) light.color = { hue, saturation: sat };
  }

  if (caps.has('colorTemperature')) {
    const ct = readAttr(status, 'colorTemperature', 'colorTemperature');
    if (ct !== null) light.colorTemp = ct;
  }

  return light;
}

/** Safely read a single attribute value from a raw status payload. */
function readAttr(status, capability, attribute) {
  try {
    const val = status?.components?.main?.[capability]?.[attribute]?.value;
    return val ?? null;
  } catch {
    return null;
  }
}
