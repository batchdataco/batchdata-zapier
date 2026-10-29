'use strict';

const path = require('path');
const { addBearerToken, handleErrors } = require('../middleware');

class ZError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'Error';
    this.code = code;
    this.status = status;
  }
}
class ExpiredAuthError extends ZError {}
class ThrottledError extends ZError {}

const fixture = (name) => require(path.join(__dirname, 'fixtures', `${name}.json`));

// A minimal stand-in for Zapier's `z` that runs the app's real middleware.
const makeZ = (bundle, respond) => {
  const calls = [];
  const z = {
    errors: { Error: ZError, ExpiredAuthError, ThrottledError },
    request: async (options) => {
      const request = addBearerToken({ ...options, headers: { ...(options.headers || {}) } }, z, bundle);
      calls.push(request);
      const { status = 200, data = {} } = await respond(request);
      return handleErrors({ status, data, request }, z);
    },
  };
  return { z, calls };
};

module.exports = { makeZ, fixture, ZError, ExpiredAuthError, ThrottledError };
