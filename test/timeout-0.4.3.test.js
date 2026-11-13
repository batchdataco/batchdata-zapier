'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zapier = require('zapier-platform-core');
const nock = require('nock');
const constants = require('../lib/constants');
const App = require('../index');

const appTester = zapier.createAppTester(App);
const HOST = 'https://api.batchdata.com';
const address = { street: '1 A St', city: 'Phoenix', state: 'AZ', zip: '85001' };
const bundle = () => ({ authData: { api_key: 'test-token' }, inputData: { ...address } });

const withTimeout = async (ms, fn) => {
  const previous = constants.REQUEST_TIMEOUT_MS;
  constants.REQUEST_TIMEOUT_MS = ms;
  try {
    return await fn();
  } finally {
    constants.REQUEST_TIMEOUT_MS = previous;
  }
};

const isTimeoutError = (error) => {
  const parsed = JSON.parse(error.message.split('\nWhat happened:')[0]);
  assert.equal(parsed.code, 'Timeout');
  assert.equal(parsed.status, 504);
  assert.match(parsed.message, /^BatchData did not respond within \d+ seconds\./);
  assert.match(parsed.message, /may still have been processed \(and billed\)/);
  assert.match(parsed.message, /support@batchservice\.com/);
  return true;
};

test.afterEach(() => nock.cleanAll());

test('every request gets a 25 second timeout unless one is already set', () => {
  const { setRequestTimeout } = require('../middleware');
  assert.equal(constants.REQUEST_TIMEOUT_MS, 25000);
  assert.equal(setRequestTimeout({}).timeout, 25000);
  assert.equal(setRequestTimeout({ timeout: 5 }).timeout, 5);
  assert.ok(setRequestTimeout({}).signal instanceof AbortSignal);
  const signal = AbortSignal.timeout(1000);
  assert.equal(setRequestTimeout({ signal }).signal, signal);
  assert.ok(App.beforeRequest.includes(setRequestTimeout));
});

test('hanging verify address search fails with a clear Timeout error', async () => {
  nock(HOST).post('/api/v1/address/verify').delay(2000).reply(200, {});
  const started = Date.now();
  await withTimeout(150, () =>
    assert.rejects(appTester(App.searches.verify_address.operation.perform, bundle()), isTimeoutError),
  );
  assert.ok(Date.now() - started < 1500);
});

test('hanging verify address action fails with a clear Timeout error', async () => {
  nock(HOST).post('/api/v1/address/verify').delay(2000).reply(200, {});
  const started = Date.now();
  await withTimeout(150, () =>
    assert.rejects(appTester(App.creates.verify_address_action.operation.perform, bundle()), isTimeoutError),
  );
  assert.ok(Date.now() - started < 1500);
});

test('a response body that stalls after headers still fails within the total timeout', async () => {
  nock(HOST).post('/api/v1/address/verify').delay({ head: 250, body: 2000 }).reply(200, {});
  const started = Date.now();
  await withTimeout(300, () =>
    assert.rejects(appTester(App.searches.verify_address.operation.perform, bundle()), isTimeoutError),
  );
  assert.ok(Date.now() - started < 450, `took ${Date.now() - started} ms`);
});

test('hanging catalog module and connection test fail with a clear Timeout error', async () => {
  nock(HOST).post('/api/v1/property/search').delay(2000).reply(200, {});
  await withTimeout(150, () =>
    assert.rejects(
      appTester(App.searches.search_properties.operation.perform, {
        authData: { api_key: 'test-token' },
        inputData: { query: 'Phoenix, AZ', take: '1' },
      }),
      isTimeoutError,
    ),
  );

  nock(HOST).post('/api/v1/address/verify').delay(2000).reply(400, {});
  await withTimeout(150, () =>
    assert.rejects(appTester(App.authentication.test, { authData: { api_key: 'test-token' } }), isTimeoutError),
  );
});

test('non-timeout errors are unchanged', async () => {
  nock(HOST).post('/api/v1/address/verify').reply(402, {});
  await assert.rejects(appTester(App.searches.verify_address.operation.perform, bundle()), (error) => {
    const parsed = JSON.parse(error.message.split('\nWhat happened:')[0]);
    assert.equal(parsed.code, 'InsufficientFunds');
    assert.equal(parsed.status, 402);
    return true;
  });
});

test('a normal 200 still returns results', async () => {
  nock(HOST).post('/api/v1/address/verify').reply(200, require('./fixtures/address-verify.json'));
  const results = await appTester(App.searches.verify_address.operation.perform, bundle());
  assert.ok(Array.isArray(results));
});
