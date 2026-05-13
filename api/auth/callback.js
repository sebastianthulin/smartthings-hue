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

function buildCallbackPage({ title, message, returnTo, openerOrigin, sessionId, status }) {
  const safeReturnTo = returnTo ? escapeHtml(returnTo) : '';
  const safeMessage = escapeHtml(message);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0d0d0d;
        color: #f5f5f5;
        font: 16px/1.5 system-ui, sans-serif;
        padding: 24px;
      }
      main {
        width: min(100%, 420px);
        background: #171717;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px;
        padding: 24px;
        box-sizing: border-box;
      }
      h1 { margin: 0 0 12px; font-size: 1.25rem; }
      p { margin: 0 0 16px; color: #d4d4d4; }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        background: #facc15;
        color: #111827;
        text-decoration: none;
        font-weight: 600;
      }
      small { display: block; margin-top: 16px; color: #a3a3a3; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${safeMessage}</p>
      ${safeReturnTo ? `<a href="${safeReturnTo}">Return to SmartHue</a>` : ''}
      ${safeReturnTo ? '<small>Returning to the app automatically…</small>' : '<small>You can close this window after returning to the app.</small>'}
    </main>
    <script>
      (() => {
        const openerOrigin = ${JSON.stringify(openerOrigin || '')};
        const returnTo = ${JSON.stringify(returnTo || '')};
        const payload = ${JSON.stringify({ source: 'smarthue-auth-relay', sessionId, status })};
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

        if (returnTo && (status === 'complete' || status === 'error')) {
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

    if (cors.handled) {
      return;
    }

    if (!isBrokerConfigured()) {
      sendMissingConfig(res, origin);
      return;
    }

    if (!isAuthRelayConfigured()) {
      sendHtml(res, 503, buildCallbackPage({
        title: 'SmartThings login is not available',
        message: getAuthRelayConfigError(),
        returnTo: null,
        openerOrigin: null,
        sessionId: null,
        status: 'error',
      }), origin);
      return;
    }

    if (req.method !== 'GET') {
      sendHtml(res, 404, buildCallbackPage({
        title: 'Not found',
        message: 'This SmartThings login endpoint only supports GET requests.',
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
        title: 'Login failed',
        message: 'The SmartThings login session is invalid or has expired.',
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
      sendHtml(res, 500, buildCallbackPage({
        title: 'Login failed',
        message: `The SmartThings login session could not be restored. ${sessionError?.message ?? ''}`.trim(),
        returnTo: null,
        openerOrigin: null,
        sessionId,
        status: 'error',
      }), origin);
      return;
    }

    if (!session) {
      sendHtml(res, 400, buildCallbackPage({
        title: 'Login expired',
        message: 'This SmartThings login session expired before it could be completed.',
        returnTo: null,
        openerOrigin: null,
        sessionId,
        status: 'error',
      }), origin);
      return;
    }

    const relayContext = {
      returnTo: session.returnTo,
      openerOrigin: session.origin,
      sessionId,
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
        title: 'Login canceled',
        message: 'SmartThings sign-in did not complete. Return to the app to see the error.',
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
        title: 'Login failed',
        message: 'SmartThings did not return an authorization code. Return to the app to see the error.',
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
          title: 'Login failed',
          message: 'SmartThings sign-in could not be completed. Return to the app to see the error.',
          ...relayContext,
          status: 'error',
        }), origin);
        return;
      }

      await completeAuthSession(sessionId, result.payload);

      sendHtml(res, 200, buildCallbackPage({
        title: 'Login successful',
        message: 'SmartThings is now connected. Return to the app to finish login.',
        ...relayContext,
        status: 'complete',
      }), origin);
    } catch (callbackError) {
      await failAuthSession(sessionId, {
        error: callbackError?.message ?? 'Unexpected relay callback error.',
        provider: 'relay',
      }).catch(() => {});

      sendHtml(res, 500, buildCallbackPage({
        title: 'Login failed',
        message: 'The SmartThings login callback failed. Return to the app to see the error.',
        ...relayContext,
        status: 'error',
      }), origin);
    }
  } catch (unexpectedError) {
    sendHtml(res, 500, buildCallbackPage({
      title: 'Login failed',
      message: `The SmartThings login callback crashed before completion. ${unexpectedError?.message ?? ''}`.trim(),
      returnTo: null,
      openerOrigin: null,
      sessionId: null,
      status: 'error',
    }), origin);
  }
}