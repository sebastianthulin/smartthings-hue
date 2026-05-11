import {
  isBrokerConfigured,
  readJson,
  requestToken,
  sendJson,
  sendMissingConfig,
  verifyCors,
} from '../_lib/smartthings-broker.js';

export default async function handler(req, res) {
  const { handled, origin } = verifyCors(req, res);
  if (handled) {
    return;
  }

  if (!isBrokerConfigured()) {
    sendMissingConfig(res, origin);
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 404, { error: 'Not found.' }, origin);
    return;
  }

  try {
    const body = await readJson(req);

    if (!body.code || !body.redirectUri) {
      sendJson(res, 400, { error: 'code and redirectUri are required.' }, origin);
      return;
    }

    const result = await requestToken({
      grant_type: 'authorization_code',
      code: body.code,
      redirect_uri: body.redirectUri,
    });

    sendJson(res, result.status, result.payload, origin);
  } catch (error) {
    sendJson(res, 500, { error: error?.message ?? 'Unexpected broker error.' }, origin);
  }
}