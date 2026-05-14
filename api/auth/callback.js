import {
  createAuthRelayTranslator,
} from '../_lib/auth-relay-i18n.js';
import {
  completeAuthSession,
  failAuthSession,
  getAuthRelayConfigError,
  getAuthSession,
  isAuthRelayConfigured,
  isValidAuthSessionId,
} from '../_lib/auth-relay-store.js';
import {
  getRequestBaseUrl,
  isBrokerConfigured,
  requestToken,
  sendHtml,
  sendMissingConfig,
  verifyCors,
} from '../_lib/smartthings-broker.js';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildCallbackPage({
  copy,
  title,
  message,
  detail = '',
  returnTo,
  openerOrigin,
  sessionId,
  status,
  launchMode = 'browser',
}) {
  const safeReturnTo = returnTo ? escapeHtml(returnTo) : '';
  const safeMessage = escapeHtml(message);
  const safeDetail = detail ? escapeHtml(detail) : '';
  const isStandaloneHandoff = launchMode === 'standalone';
  const actionLabel = isStandaloneHandoff
    ? copy.t('authRelay.callback.actions.openBrowser')
    : copy.t('authRelay.callback.actions.return');
  const helperText = safeReturnTo
    ? (isStandaloneHandoff
      ? copy.t(
        status === 'complete'
          ? 'authRelay.callback.hints.standaloneComplete'
          : 'authRelay.callback.hints.standaloneError',
      )
      : copy.t('authRelay.callback.hints.autoReturn'))
    : copy.t('authRelay.callback.hints.closeAfterReturn');
  const statusClass = status === 'complete' ? 'success' : 'error';

  return `<!doctype html>
<html lang="${escapeHtml(copy.language)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-top: #081218;
        --bg-bottom: #121923;
        --surface: rgba(18, 26, 36, 0.86);
        --surface-border: rgba(255, 255, 255, 0.09);
        --text-primary: #f8fafc;
        --text-secondary: #cbd5e1;
        --text-dim: #8ea0b4;
        --accent: #f5c542;
        --accent-strong: #fbbf24;
        --success: #38b26b;
        --error: #ff7a6b;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(245, 197, 66, 0.18), transparent 38%),
          linear-gradient(180deg, var(--bg-top), var(--bg-bottom));
        color: var(--text-primary);
        font: 16px/1.5 system-ui, sans-serif;
        padding: 24px;
        box-sizing: border-box;
      }
      main {
        width: min(100%, 460px);
        background: var(--surface);
        border: 1px solid var(--surface-border);
        border-radius: 28px;
        padding: 28px;
        box-sizing: border-box;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(18px);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 7px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--text-secondary);
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .eyebrow::before {
        content: '';
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: ${status === 'complete' ? 'var(--success)' : 'var(--accent)'};
        box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.04);
      }
      h1 {
        margin: 18px 0 12px;
        font-size: clamp(1.4rem, 4vw, 1.9rem);
        line-height: 1.15;
        letter-spacing: -0.03em;
      }
      p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 1rem;
      }
      .status {
        margin: 22px 0 0;
        padding: 18px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .status.success {
        border-color: rgba(56, 178, 107, 0.35);
        background: rgba(56, 178, 107, 0.1);
      }
      .status.error {
        border-color: rgba(255, 122, 107, 0.28);
        background: rgba(255, 122, 107, 0.1);
      }
      .status p {
        color: var(--text-primary);
      }
      pre {
        margin: 18px 0 0;
        padding: 14px;
        border-radius: 16px;
        overflow: auto;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.06);
        color: var(--text-secondary);
        font: 0.82rem/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .detail-label {
        display: inline-block;
        margin: 18px 0 8px;
        color: var(--text-dim);
        font-size: 0.74rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 22px;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), var(--accent-strong));
        color: #101828;
        text-decoration: none;
        font-weight: 600;
        box-shadow: 0 12px 30px rgba(245, 197, 66, 0.2);
      }
      small {
        display: block;
        margin-top: 16px;
        color: var(--text-dim);
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="eyebrow">${escapeHtml(copy.t('authRelay.badge'))}</span>
      <h1>${escapeHtml(title)}</h1>
      <div class="status ${statusClass}">
        <p>${safeMessage}</p>
      </div>
      ${safeDetail ? `<span class="detail-label">${escapeHtml(copy.t('authRelay.callback.detailLabel'))}</span><pre>${safeDetail}</pre>` : ''}
      ${safeReturnTo ? `<div class="actions"><a href="${safeReturnTo}">${escapeHtml(actionLabel)}</a></div>` : ''}
      <small>${escapeHtml(helperText)}</small>
    </main>
    <script>
      (() => {
        const openerOrigin = ${JSON.stringify(openerOrigin || '')};
        const returnTo = ${JSON.stringify(returnTo || '')};
        const launchMode = ${JSON.stringify(launchMode || 'browser')};
        const payload = ${JSON.stringify({ source: 'smarthue-auth-relay', sessionId, status })};
        const shouldAutoReturn = Boolean(returnTo) && launchMode !== 'standalone' && (status === 'complete' || status === 'error');
        let closeAttempted = false;

        if (window.opener && openerOrigin) {
          try {
            window.opener.postMessage(payload, openerOrigin);
            closeAttempted = true;
            setTimeout(() => window.close(), 250);
          } catch {
            // Ignore opener handoff failures.
          }
        }

        if (shouldAutoReturn) {
          setTimeout(() => {
            if (!closeAttempted || !window.closed) {
              try {
                window.location.replace(returnTo);
              } catch {
                // Ignore auto-return failures.
              }
            }
          }, closeAttempted ? 600 : 1200);
        }
      })();
    </script>
  </body>
</html>`;
}

export default async function handler(req, res) {
  let origin = null;

  try {
    const cors = verifyCors(req, res);
    origin = cors.origin;
    const requestCopy = createAuthRelayTranslator({
      acceptLanguage: req.headers['accept-language'],
    });

    if (cors.handled) {
      return;
    }

    if (!isBrokerConfigured()) {
      sendMissingConfig(res, origin);
      return;
    }

    if (!isAuthRelayConfigured()) {
      sendHtml(res, 503, buildCallbackPage({
        copy: requestCopy,
        title: requestCopy.t('authRelay.callback.unavailableTitle'),
        message: requestCopy.t('authRelay.callback.unavailableMessage'),
        detail: getAuthRelayConfigError(),
        returnTo: null,
        openerOrigin: null,
        sessionId: null,
        status: 'error',
      }), origin);
      return;
    }

    if (req.method !== 'GET') {
      sendHtml(res, 404, buildCallbackPage({
        copy: requestCopy,
        title: requestCopy.t('authRelay.callback.notFoundTitle'),
        message: requestCopy.t('authRelay.callback.notFoundMessage'),
        returnTo: null,
        openerOrigin: null,
        sessionId: null,
        status: 'error',
      }), origin);
      return;
    }

    const url = new URL(req.url ?? '/', getRequestBaseUrl(req));
    const sessionId = url.searchParams.get('state');

    if (!isValidAuthSessionId(sessionId)) {
      sendHtml(res, 400, buildCallbackPage({
        copy: requestCopy,
        title: requestCopy.t('authRelay.callback.invalidTitle'),
        message: requestCopy.t('authRelay.callback.invalidMessage'),
        returnTo: null,
        openerOrigin: null,
        sessionId,
        status: 'error',
      }), origin);
      return;
    }

    let session;

    try {
      session = await getAuthSession(sessionId);
    } catch (sessionError) {
      const sessionCopy = createAuthRelayTranslator({
        language: session?.locale,
        acceptLanguage: req.headers['accept-language'],
      });

      sendHtml(res, 500, buildCallbackPage({
        copy: sessionCopy,
        title: sessionCopy.t('authRelay.callback.restoreTitle'),
        message: sessionCopy.t('authRelay.callback.restoreMessage'),
        detail: sessionError?.message ?? '',
        returnTo: null,
        openerOrigin: null,
        sessionId,
        status: 'error',
      }), origin);
      return;
    }

    if (!session) {
      sendHtml(res, 400, buildCallbackPage({
        copy: requestCopy,
        title: requestCopy.t('authRelay.callback.expiredTitle'),
        message: requestCopy.t('authRelay.callback.expiredMessage'),
        returnTo: null,
        openerOrigin: null,
        sessionId,
        status: 'error',
      }), origin);
      return;
    }

    const copy = createAuthRelayTranslator({
      language: session.locale,
      acceptLanguage: req.headers['accept-language'],
    });

    const relayContext = {
      copy,
      returnTo: session.returnTo,
      openerOrigin: session.origin,
      sessionId,
      launchMode: session.launchMode,
    };
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error) {
      await failAuthSession(sessionId, {
        error,
        errorDescription: errorDescription || null,
        provider: 'smartthings',
      });

      sendHtml(res, 200, buildCallbackPage({
        title: copy.t('authRelay.callback.canceledTitle'),
        message: copy.t('authRelay.callback.canceledMessage'),
        ...relayContext,
        status: 'error',
      }), origin);
      return;
    }

    const code = url.searchParams.get('code');

    if (!code) {
      await failAuthSession(sessionId, {
        error: 'missing_code',
        errorDescription: 'SmartThings did not provide an authorization code.',
        provider: 'relay',
      });

      sendHtml(res, 200, buildCallbackPage({
        title: copy.t('authRelay.callback.missingCodeTitle'),
        message: copy.t('authRelay.callback.missingCodeMessage'),
        ...relayContext,
        status: 'error',
      }), origin);
      return;
    }

    try {
      const result = await requestToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${getRequestBaseUrl(req)}/auth/callback`,
      });

      if (!result.ok) {
        await failAuthSession(sessionId, {
          provider: 'smartthings',
          ...result.payload,
        });

        sendHtml(res, 200, buildCallbackPage({
          title: copy.t('authRelay.callback.failedTitle'),
          message: copy.t('authRelay.callback.failedMessage'),
          ...relayContext,
          status: 'error',
        }), origin);
        return;
      }

      await completeAuthSession(sessionId, result.payload);

      sendHtml(res, 200, buildCallbackPage({
        title: copy.t('authRelay.callback.successTitle'),
        message: copy.t('authRelay.callback.successMessage'),
        ...relayContext,
        status: 'complete',
      }), origin);
    } catch (callbackError) {
      await failAuthSession(sessionId, {
        error: callbackError?.message ?? 'Unexpected relay callback error.',
        provider: 'relay',
      }).catch(() => {});

      sendHtml(res, 500, buildCallbackPage({
        title: copy.t('authRelay.callback.callbackFailedTitle'),
        message: copy.t('authRelay.callback.callbackFailedMessage'),
        detail: callbackError?.message ?? '',
        ...relayContext,
        status: 'error',
      }), origin);
    }
  } catch (unexpectedError) {
    const copy = createAuthRelayTranslator();

    sendHtml(res, 500, buildCallbackPage({
      copy,
      title: copy.t('authRelay.callback.crashedTitle'),
      message: copy.t('authRelay.callback.crashedMessage'),
      detail: unexpectedError?.message ?? '',
      returnTo: null,
      openerOrigin: null,
      sessionId: null,
      status: 'error',
    }), origin);
  }
}