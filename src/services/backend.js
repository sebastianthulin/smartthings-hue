import { smartthings } from './smartthings.js';

const DEFAULT_BACKEND_PROVIDER_ID = 'smartthings';
const REQUIRED_BACKEND_PROVIDER_MEMBERS = [
  'hasToken',
  'authMode',
  'authConfigError',
  'pendingLoginMode',
  'hasPendingLogin',
  'sharedConfigEnabled',
  'setToken',
  'clearToken',
  'consumeAuthNotice',
  'resumePendingLogin',
  'maybeCompleteLoginFromRedirect',
  'maybeRefreshSession',
  'startLogin',
  'fetchLocations',
  'fetchRooms',
  'fetchDevices',
  'fetchHomeConfig',
  'saveHomeConfig',
  'fetchDeviceStatus',
  'fetchDeviceHealth',
  'sendCommand',
  'switchOn',
  'switchOff',
  'setLevel',
  'setColor',
  'setColorTemperature',
  'fetchScenes',
  'executeScene',
];

const backendProviders = new Map();

function validateBackendProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new TypeError('Backend provider must be an object.');
  }

  const missingMembers = REQUIRED_BACKEND_PROVIDER_MEMBERS.filter((member) => !(member in provider));

  if (missingMembers.length) {
    throw new TypeError(`Backend provider is missing required members: ${missingMembers.join(', ')}`);
  }

  return provider;
}

export function registerBackendProvider(providerId, provider) {
  const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : '';
  if (!normalizedProviderId) {
    throw new TypeError('Backend provider id must be a non-empty string.');
  }

  backendProviders.set(normalizedProviderId, validateBackendProvider(provider));
  return provider;
}

registerBackendProvider(DEFAULT_BACKEND_PROVIDER_ID, smartthings);

let activeBackendProvider = backendProviders.get(DEFAULT_BACKEND_PROVIDER_ID);

export function getBackendProvider() {
  return activeBackendProvider;
}

export function setBackendProvider(provider) {
  activeBackendProvider = validateBackendProvider(provider);
  return activeBackendProvider;
}

export function useBackendProvider(providerId) {
  const normalizedProviderId = typeof providerId === 'string' ? providerId.trim() : '';
  const provider = backendProviders.get(normalizedProviderId);

  if (!provider) {
    throw new Error(`Backend provider "${providerId}" is not registered.`);
  }

  return setBackendProvider(provider);
}

export function resetBackendProvider() {
  return useBackendProvider(DEFAULT_BACKEND_PROVIDER_ID);
}

export const backend = new Proxy({}, {
  get(_target, property) {
    const provider = getBackendProvider();
    const value = Reflect.get(provider, property, provider);
    return typeof value === 'function' ? value.bind(provider) : value;
  },
});
