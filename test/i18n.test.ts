import test from 'node:test';
import assert from 'node:assert/strict';

import { I18nService } from '../src/services/i18n.ts';

test('I18nService resolves device language and interpolates values', () => {
  navigator.language = 'sv-SE';
  navigator.languages = ['sv-SE'];
  document.documentElement.lang = 'en';
  document.title = '';

  const service = new I18nService();

  assert.equal(service.language, 'sv');
  assert.equal(service.t('tokenSetup.errors.connection', { status: 503 }), 'Anslutningsfel (503). Försök igen.');
  assert.equal(document.documentElement.lang, 'sv');
  assert.equal(document.title, 'SmartHue');
});
