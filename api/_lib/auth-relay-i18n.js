const DEFAULT_LANGUAGE = 'en';

const en = {
  authRelay: {
    badge: 'SmartThings sign-in',
    callback: {
      unavailableTitle: 'SmartThings login is not available',
      unavailableMessage: 'The SmartThings sign-in relay is not configured yet.',
      notFoundTitle: 'Not found',
      notFoundMessage: 'This SmartThings login page only supports GET requests.',
      invalidTitle: 'Login failed',
      invalidMessage: 'The SmartThings login session is invalid or has expired.',
      restoreTitle: 'Login failed',
      restoreMessage: 'The SmartThings login session could not be restored.',
      expiredTitle: 'Login expired',
      expiredMessage: 'This SmartThings login session expired before it could be completed.',
      canceledTitle: 'Login canceled',
      canceledMessage: 'The SmartThings sign-in was canceled before setup finished.',
      missingCodeTitle: 'Login failed',
      missingCodeMessage: 'SmartThings did not return an authorization code.',
      failedTitle: 'Login failed',
      failedMessage: 'The SmartThings sign-in did not finish correctly.',
      successTitle: 'SmartThings is connected',
      successMessage: 'You can go back to SmartHue and finish setup.',
      callbackFailedTitle: 'Login failed',
      callbackFailedMessage: 'The SmartThings login callback failed.',
      crashedTitle: 'Login failed',
      crashedMessage: 'The SmartThings login callback crashed before completion.',
      detailLabel: 'Technical details',
      actions: {
        return: 'Return to SmartHue',
        openBrowser: 'Open SmartHue in browser',
      },
      hints: {
        autoReturn: 'SmartHue should reopen automatically in a moment…',
        closeAfterReturn: 'You can close this tab after you return to SmartHue.',
        standaloneComplete: 'If you started from the installed app, switch back to SmartHue to finish. If it still says it is connecting, close and reopen SmartHue once.',
        standaloneError: 'Switch back to SmartHue to review the result. If nothing changes, close and reopen the app, then try again.',
      },
    },
  },
};

const sv = {
  authRelay: {
    badge: 'SmartThings-inloggning',
    callback: {
      unavailableTitle: 'SmartThings-inloggningen är inte tillgänglig',
      unavailableMessage: 'Inloggningsreläet för SmartThings är inte konfigurerat ännu.',
      notFoundTitle: 'Hittades inte',
      notFoundMessage: 'Den här SmartThings-inloggningssidan stöder bara GET-förfrågningar.',
      invalidTitle: 'Inloggningen misslyckades',
      invalidMessage: 'SmartThings-inloggningssessionen är ogiltig eller har gått ut.',
      restoreTitle: 'Inloggningen misslyckades',
      restoreMessage: 'Det gick inte att återställa SmartThings-inloggningssessionen.',
      expiredTitle: 'Inloggningen gick ut',
      expiredMessage: 'SmartThings-inloggningssessionen gick ut innan den hann slutföras.',
      canceledTitle: 'Inloggningen avbröts',
      canceledMessage: 'SmartThings-inloggningen avbröts innan konfigurationen hann bli klar.',
      missingCodeTitle: 'Inloggningen misslyckades',
      missingCodeMessage: 'SmartThings returnerade ingen auktoriseringskod.',
      failedTitle: 'Inloggningen misslyckades',
      failedMessage: 'SmartThings-inloggningen slutfördes inte korrekt.',
      successTitle: 'SmartThings är anslutet',
      successMessage: 'Du kan gå tillbaka till SmartHue och slutföra konfigurationen.',
      callbackFailedTitle: 'Inloggningen misslyckades',
      callbackFailedMessage: 'Callbacken för SmartThings-inloggningen misslyckades.',
      crashedTitle: 'Inloggningen misslyckades',
      crashedMessage: 'Callbacken för SmartThings-inloggningen kraschade innan den slutfördes.',
      detailLabel: 'Tekniska detaljer',
      actions: {
        return: 'Gå tillbaka till SmartHue',
        openBrowser: 'Öppna SmartHue i webbläsaren',
      },
      hints: {
        autoReturn: 'SmartHue bör öppnas igen automatiskt om en liten stund…',
        closeAfterReturn: 'Du kan stänga den här fliken när du har återvänt till SmartHue.',
        standaloneComplete: 'Om du startade från den installerade appen ska du växla tillbaka till SmartHue för att slutföra. Om det fortfarande står att den ansluter, stäng och öppna SmartHue en gång.',
        standaloneError: 'Växla tillbaka till SmartHue för att se resultatet. Om inget förändras, stäng och öppna appen igen och försök sedan på nytt.',
      },
    },
  },
};

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