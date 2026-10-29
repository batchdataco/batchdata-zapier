'use strict';

const { API_HOST, SUPPORT_EMAIL } = require('./lib/constants');

// The connection test posts an EMPTY address batch. A valid token gets HTTP 400
// (empty batch rejected before any lookup). An invalid token gets 401 or 403.
// The claim that a rejected empty batch is not billed is assumed, not confirmed.
const test = async (z) => {
  const response = await z.request({
    url: `${API_HOST}/api/v1/address/verify`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: { requests: [] },
    skipThrowForStatus: true,
  });
  const status = response.status;
  if (status === 400 || (status >= 200 && status < 300)) {
    return { ok: true };
  }
  if (status === 401) {
    throw new z.errors.Error(
      'The API token was not accepted. Check the token in your BatchData account settings.',
      'AuthenticationError',
      401,
    );
  }
  if (status === 403) {
    throw new z.errors.Error(
      `This token is not allowed to use the BatchData API. Contact ${SUPPORT_EMAIL} if you think this is a mistake.`,
      'AuthenticationError',
      403,
    );
  }
  if (status === 429) {
    throw new z.errors.ThrottledError('BatchData rate limit reached. Try again shortly.');
  }
  throw new z.errors.Error(
    `BatchData returned an unexpected status (${status}) while testing the connection.`,
    'UnexpectedStatus',
    status,
  );
};

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'api_key',
      label: 'API Token',
      type: 'password',
      required: true,
      helpText:
        'Create an API token in your BatchData account (BatchData dashboard > API). Use a token with access to the endpoints you plan to use. Each request is billed to your account.',
    },
  ],
  test,
};
