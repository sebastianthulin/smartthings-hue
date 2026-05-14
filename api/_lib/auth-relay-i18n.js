import { en } from '../../src/lang/en.js';
import { sv } from '../../src/lang/sv.js';

const DEFAULT_LANGUAGE = 'en';

const LANGUAGES = {
  en,
  sv,
};

function getMessage(messages, key) {
  return key.split('.').reduce((value, segment) => value?.[segment], messages);
}

function interpolate(message, values = {}) {
  return message.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function normalizeLanguageCandidate(value = '') {
  return value
    .trim()
    .split(';')[0]
    ?.toLowerCase()
    .split('-')[0] ?? '';
}

export function resolveAuthRelayLanguage(...values) {
  for (const value of values) {
    const candidates = String(value ?? '').split(',');

    for (const candidate of candidates) {
      const language = normalizeLanguageCandidate(candidate);

      if (language && LANGUAGES[language]) {
        return language;
      }
    }
  }

  return DEFAULT_LANGUAGE;
}

export function createAuthRelayTranslator({ language, acceptLanguage } = {}) {
  const resolvedLanguage = resolveAuthRelayLanguage(language, acceptLanguage);

  return {
    language: resolvedLanguage,
    t(key, values = {}) {
      const message = getMessage(LANGUAGES[resolvedLanguage], key)
        ?? getMessage(LANGUAGES[DEFAULT_LANGUAGE], key)
        ?? key;

      return typeof message === 'string' ? interpolate(message, values) : key;
    },
  };
}