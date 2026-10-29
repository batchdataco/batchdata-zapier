'use strict';

const { InputError } = require('./common');
const { API_HOST } = require('./constants');

// Runs one operation: builds the request, calls BatchData once, extracts records.
const runOperation = async (z, bundle, op) => {
  let request;
  try {
    request = op.buildRequest(bundle.inputData || {});
  } catch (error) {
    if (error instanceof InputError) {
      throw new z.errors.Error(error.message, 'InvalidInput', 400);
    }
    throw error;
  }
  const response = await z.request({
    url: `${API_HOST}${request.path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: request.body,
  });
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  return op.extract(data, request);
};

// Shape returned by an action (create). Skip trace wraps its persons; the others return one record.
const toActionResult = (op, records) => {
  if (op.single === 'persons') {
    return {
      apiVersion: records.length > 0 ? records[0].apiVersion : null,
      matched: records.length > 0,
      personCount: records.length,
      persons: records.map((record) => record.person),
    };
  }
  return records.length > 0 ? records[0] : { matched: false };
};

const actionSample = (op) => {
  if (op.single === 'persons') {
    return {
      apiVersion: op.sample.apiVersion,
      matched: true,
      personCount: 1,
      persons: [op.sample.person],
    };
  }
  return op.sample;
};

module.exports = { runOperation, toActionResult, actionSample };
