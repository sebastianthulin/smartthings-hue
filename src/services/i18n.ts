import { en } from '../lang/en.js';
import { sv } from '../lang/sv.js';

export const DEFAULT_LANGUAGE = 'en';

type TranslationValues = Record<string, unknown>;
type TranslationTree = {
  [key: string]: string | TranslationTree;
};

const LANGUAGES: Record<string, TranslationTree> = {
  en,
  sv,
};

function getDeviceLanguages(): string[] {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.filter(Boolean);
}

function resolveLanguage(language?: string): string {
  const baseLanguage = language?.toLowerCase().split('-')[0];
  return baseLanguage && LANGUAGES[baseLanguage] ? baseLanguage : DEFAULT_LANGUAGE;
}

function getMessage(messages: TranslationTree, key: string): string | TranslationTree | undefined {
  return key.split('.').reduce((value, segment) => value?.[segment], messages);
}

function interpolate(message: string, values: TranslationValues): string {
  return message.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

export class I18nService extends EventTarget {
  #language = DEFAULT_LANGUAGE;

  constructor() {
    super();
    this.#updateLanguage(false);
    window.addEventListener('languagechange', () => this.#updateLanguage(true));
  }

  get language(): string {
    return this.#language;
  }

  t(key: string, values: TranslationValues = {}): string {
    const messages = LANGUAGES[this.#language] ?? LANGUAGES[DEFAULT_LANGUAGE];
    const fallback = LANGUAGES[DEFAULT_LANGUAGE];
    const message = getMessage(messages, key) ?? getMessage(fallback, key) ?? key;
    return typeof message === 'string' ? interpolate(message, values) : key;
  }

  #updateLanguage(emitChange: boolean): void {
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

  #applyDocumentLanguage(): void {
    document.documentElement.lang = this.#language;
    document.title = this.t('app.title');
  }
}

export const i18n = new I18nService();
