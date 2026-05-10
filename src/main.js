import '@fontsource-variable/material-symbols-outlined';
import { registerSW } from 'virtual:pwa-register';
import './styles/globals.scss';
import './components/app-shell.js';

const PWA_RESET_QUERY = 'reset-pwa';
const PWA_MIGRATION_KEY = 'pwa-migration-2026-05-10';

const readMigrationFlag = () => {
  try {
    return localStorage.getItem(PWA_MIGRATION_KEY) === 'done';
  } catch {
    return false;
  }
};

const writeMigrationFlag = () => {
  try {
    localStorage.setItem(PWA_MIGRATION_KEY, 'done');
  } catch {
    // Ignore browsers that block localStorage.
  }
};

const hasForcedPwaReset = () => new URLSearchParams(window.location.search).get(PWA_RESET_QUERY) === '1';

const getPwaScopeUrl = () => new URL(import.meta.env.BASE_URL, window.location.href).href;

const getResetRedirectUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete(PWA_RESET_QUERY);
  return url.toString();
};

const resetLegacyPwaState = async ({ force = false } = {}) => {
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    return false;
  }

  if (!force && readMigrationFlag()) {
    return false;
  }

  const scopeUrl = getPwaScopeUrl();
  const expectedSwPath = new URL('./sw.js', scopeUrl).pathname;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const scopedRegistrations = registrations.filter((registration) => {
    const scriptUrls = [
      registration.active?.scriptURL,
      registration.waiting?.scriptURL,
      registration.installing?.scriptURL,
    ].filter(Boolean);

    return registration.scope.startsWith(scopeUrl)
      || scopeUrl.startsWith(registration.scope)
      || scriptUrls.some((scriptUrl) => {
        const url = new URL(scriptUrl);
        return url.origin === window.location.origin
          && (url.pathname === expectedSwPath || url.pathname.endsWith('/sw.js'));
      });
  });
  const cacheNames = await caches.keys();

  if (!force && scopedRegistrations.length === 0 && cacheNames.length === 0) {
    writeMigrationFlag();
    return false;
  }

  await Promise.all(scopedRegistrations.map((registration) => registration.unregister().catch(() => false)));
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName).catch(() => false)));

  writeMigrationFlag();
  window.location.replace(force ? getResetRedirectUrl() : window.location.href);
  return true;
};

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  registerSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      if (!swUrl || !registration) {
        return;
      }

      const refreshRegistration = () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {
            // Ignore transient update polling failures.
          });
        }
      };

      registration.update().catch(() => {
        // Ignore transient update polling failures.
      });
      document.addEventListener('visibilitychange', refreshRegistration);
    },
    onRegisterError(error) {
      console.error('PWA registration failed.', error);
    }
  });
};

const lockPortraitOrientation = async () => {
  try {
    await screen.orientation?.lock?.('portrait');
  } catch {
    // Ignore unsupported browsers and contexts where the lock is not allowed.
  }
};

const bootstrap = async () => {
  try {
    const resetTriggered = await resetLegacyPwaState({ force: hasForcedPwaReset() });

    if (resetTriggered) {
      return;
    }
  } catch (error) {
    console.warn('PWA cache reset failed.', error);
  }

  registerServiceWorker();
  lockPortraitOrientation();
};

bootstrap();
