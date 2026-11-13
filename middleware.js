'use strict';

const constants = require('./lib/constants');

const { SUPPORT_EMAIL } = constants;

const addBearerToken = (request, z, bundle) => {
  const token = bundle.authData && bundle.authData.api_key;
  if (token) {
    request.headers = request.headers || {};
    request.headers.Authorization = `Bearer ${token}`;
  }
  return request;
};

const setRequestTimeout = (request) => {
  if (request.timeout === undefined) request.timeout = constants.REQUEST_TIMEOUT_MS;
  // node-fetch restarts its timeout for the response body, so a signal enforces one total deadline.
  if (request.signal === undefined) request.signal = AbortSignal.timeout(constants.REQUEST_TIMEOUT_MS);
  return request;
};

const TIMEOUT_TYPES = new Set(['request-timeout', 'body-timeout', 'aborted']);

// A timed-out call may have been processed and billed, so it is never retried automatically.
const translateTimeouts = (perform) => async (z, bundle) => {
  try {
    return await perform(z, bundle);
  } catch (error) {
    if (!error || !TIMEOUT_TYPES.has(error.type)) throw error;
    const seconds = Math.round(constants.REQUEST_TIMEOUT_MS / 1000);
    throw new z.errors.Error(
      `BatchData did not respond within ${seconds} seconds. The request may still have been processed (and billed); check your BatchData account before replaying this task. If this keeps happening, contact ${SUPPORT_EMAIL}.`,
      'Timeout',
      504,
    );
  }
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
  if (code === 402) {
    throw new z.errors.Error(
      `${detail || 'Your BatchData account balance is too low for this request.'} Add funds in your BatchData account, then retry. Contact ${SUPPORT_EMAIL} for help.`,
      'InsufficientFunds',
      402,
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

module.exports = { addBearerToken, handleErrors, setRequestTimeout, translateTimeouts };
