'use strict';

// Runs the real app through zapier-platform-core's test harness with nock.
// Skipped automatically when the Zapier packages are not installed.
const test = require('node:test');
const assert = require('node:assert/strict');

let zapier;
let nock;
try {
  zapier = require('zapier-platform-core');
  nock = require('nock');
} catch (error) {
  zapier = undefined;
}

const skip = zapier ? false : 'zapier-platform-core / nock not installed';

test('zapier harness: authentication.test succeeds on HTTP 400 and fails on 401', { skip }, async () => {
  const App = require('../index');
  const appTester = zapier.createAppTester(App);
  const bundle = { authData: { api_key: 'test-token' } };

  nock('https://api.batchdata.com').post('/api/v1/address/verify', { requests: [] }).reply(400, { status: { code: 400, text: 'Bad Request', message: 'empty' } });
  assert.deepEqual(await appTester(App.authentication.test, bundle), { ok: true });

  nock('https://api.batchdata.com').post('/api/v1/address/verify').reply(401, { status: { code: 401, text: 'Unauthorized' } });
  await assert.rejects(appTester(App.authentication.test, bundle));
});

test('zapier harness: Find Properties through the app', { skip }, async () => {
  const App = require('../index');
  const appTester = zapier.createAppTester(App);
  const fixture = require('./fixtures/property-search.json');
  nock('https://api.batchdata.com', { reqheaders: { authorization: 'Bearer test-token' } })
    .post('/api/v1/property/search')
    .reply(200, fixture);
  const results = await appTester(App.searches.search_properties.operation.perform, {
    authData: { api_key: 'test-token' },
    inputData: { query: 'Phoenix, AZ', take: '2' },
  });
  assert.ok(Array.isArray(results) && results.length > 0);
});

test('zapier harness: App definition has the expected shape', { skip }, () => {
  const App = require('../index');
  assert.equal(Object.keys(App.searches).length, 16);
  assert.equal(Object.keys(App.creates).length, 15);
  assert.equal(Object.keys(App.triggers).length, 4);
});
