'use strict';

const { SUPPORT_EMAIL } = require('./lib/constants');

const addBearerToken = (request, z, bundle) => {
  const token = bundle.authData && bundle.authData.api_key;
  if (token) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
};

const messageFrom = (response) => {
  const data = response.data;
  const status = data && typeof data === 'object' ? data.status : undefined;
  if (status && typeof status === 'object' && status.message) return String(status.message);
  if (status && typeof status === 'object' && status.text) return String(status.text);
  return undefined;
};

const handleErrors = (response, z) => {
  if (response.request && response.request.skipThrowForStatus) return response;
  const code = response.status;
  if (code < 400) return response;

  const detail = messageFrom(response);
  if (code === 401) {
    throw new z.errors.ExpiredAuthError(
      'The BatchData API token was rejected. Reconnect BatchData with a valid token.',
    );
  }
  if (code === 403) {
    throw new z.errors.Error(
      `${detail || 'Access denied.'} This token may not have access to this endpoint. Contact ${SUPPORT_EMAIL} for help.`,
      'Forbidden',
      403,
    );
  }
  if (code === 429) {
    throw new z.errors.ThrottledError('BatchData rate limit reached. The task will be retried.');
  }
  if (code === 400 || code === 422) {
    throw new z.errors.Error(detail || 'BatchData rejected the request. Check the input fields.', 'InvalidInput', code);
  }
  if (code >= 500) {
    // Let Zapier surface a retryable server error without exposing internals.
    throw new z.errors.Error(
      `BatchData had a temporary problem (HTTP ${code}). Try again, or contact ${SUPPORT_EMAIL} if it continues.`,
      'ServerError',
      code,
    );
  }
  throw new z.errors.Error(detail || `BatchData returned HTTP ${code}.`, 'ApiError', code);
};

module.exports = { addBearerToken, handleErrors };
