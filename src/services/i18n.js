import { en } from '../lang/en.js';
import { sv } from '../lang/sv.js';

export const DEFAULT_LANGUAGE = 'en';

const LANGUAGES = {
  en,
  sv,
};

function getDeviceLanguages() {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.filter(Boolean);
}

function resolveLanguage(language) {
  const baseLanguage = language?.toLowerCase().split('-')[0];
  return baseLanguage && LANGUAGES[baseLanguage] ? baseLanguage : DEFAULT_LANGUAGE;
}

function getMessage(messages, key) {
  return key.split('.').reduce((value, segment) => value?.[segment], messages);
}

function interpolate(message, values) {
  return message.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

class I18nService extends EventTarget {
  #language = DEFAULT_LANGUAGE;

  constructor() {
    super();
    this.#updateLanguage(false);
    window.addEventListener('languagechange', () => this.#updateLanguage(true));
  }

  get language() {
    return this.#language;
  }

  t(key, values = {}) {
    const messages = LANGUAGES[this.#language] ?? LANGUAGES[DEFAULT_LANGUAGE];
    const fallback = LANGUAGES[DEFAULT_LANGUAGE];
    const message = getMessage(messages, key) ?? getMessage(fallback, key) ?? key;
    return typeof message === 'string' ? interpolate(message, values) : key;
  }

  #updateLanguage(emitChange) {
    const nextLanguage = getDeviceLanguages()
      .map(resolveLanguage)
      .find(Boolean) ?? DEFAULT_LANGUAGE;

    if (nextLanguage === this.#language && emitChange) {
      this.#applyDocumentLanguage();
      return;
    }

    this.#language = nextLanguage;
    this.#applyDocumentLanguage();

    if (emitChange) {
      this.dispatchEvent(new CustomEvent('change', {
        detail: { language: this.#language },
      }));
    }
  }

  #applyDocumentLanguage() {
    document.documentElement.lang = this.#language;
    document.title = this.t('app.title');
  }
}

export const i18n = new I18nService();
