export const SUPPORTED_CAPABILITY_LIST = [
  'switch',
  'switchLevel',
  'colorControl',
  'colorTemperature',
  'temperatureMeasurement',
  'relativeHumidityMeasurement',
  'occupancySensor',
  'motionSensor',
  'presenceSensor',
  'movementSensor',
  'multipleZonePresence',
] as const;

export type SupportedCapability = (typeof SUPPORTED_CAPABILITY_LIST)[number];

export const SUPPORTED_CAPABILITIES = new Set<SupportedCapability>(SUPPORTED_CAPABILITY_LIST);

export function isSupportedCapability(value: unknown): value is SupportedCapability {
  return typeof value === 'string' && SUPPORTED_CAPABILITIES.has(value as SupportedCapability);
}
