'use strict';

// Opt-in smoke test against the real BatchData API. Skipped unless LIVE=1 and
// BATCHDATA_API_TOKEN are set. Every call can be billed, so each module is called once,
// with the smallest page size, against one public address. Run: LIVE=1 npm run test:live
const test = require('node:test');
const assert = require('node:assert/strict');

const skip = process.env.LIVE === '1' && process.env.BATCHDATA_API_TOKEN ? false : 'set LIVE=1 and BATCHDATA_API_TOKEN to run live checks';

const zapier = require('zapier-platform-core');
const App = require('../index');

const bundle = (inputData) => ({ authData: { api_key: process.env.BATCHDATA_API_TOKEN }, inputData });
const address = { street: '2800 N 24th St', city: 'Phoenix', state: 'AZ', zip: '85008' };
const run = (kind, key, inputData) => zapier.createAppTester(App)(App[kind][key].operation.perform, bundle(inputData));
const isArray = (value) => assert.ok(Array.isArray(value), 'expected an array');

test('live: authentication.test', { skip }, async () => {
  assert.deepEqual(await zapier.createAppTester(App)(App.authentication.test, bundle({})), { ok: true });
});
test('live: trigger new_search_session', { skip }, async () => isArray(await run('triggers', 'new_search_session', {})));
// Needs the property subscription permission. A token without it gets a clear 403 from BatchData.
test('live: trigger new_monitor (a 403 means the token lacks the monitor permission)', { skip }, async () => {
  try {
    isArray(await run('triggers', 'new_monitor', {}));
  } catch (error) {
    assert.match(String(error.message), /"status":403|permission/);
  }
});
test('live: search verify_address', { skip }, async () => isArray(await run('searches', 'verify_address', address)));
test('live: search autocomplete_address', { skip }, async () => isArray(await run('searches', 'autocomplete_address', { query: '2800 N 24th', take: 1 })));
test('live: search geocode_address', { skip }, async () => isArray(await run('searches', 'geocode_address', { address: '2800 N 24th St, Phoenix, AZ 85008', request_ref: 'zapier-live-ref' })));
test('live: search reverse_geocode', { skip }, async () => isArray(await run('searches', 'reverse_geocode', { latitude: 33.47865, longitude: -112.03029 })));
test('live: search search_properties', { skip }, async () => isArray(await run('searches', 'search_properties', { query: '2800 N 24th St, Phoenix, AZ 85008', take: 1 })));
test('live: search lookup_property', { skip }, async () => isArray(await run('searches', 'lookup_property', { identify_by: 'address', ...address, datasets: 'basic' })));
test('live: search get_permits', { skip }, async () => isArray(await run('searches', 'get_permits', { ...address, take: 1 })));
test('live: search investor_buybox', { skip }, async () => isArray(await run('searches', 'investor_buybox', { street: address.street, city: address.city, state: address.state, zip: address.zip, take: 1 })));
test('live: search investor_properties', { skip }, async () => isArray(await run('searches', 'investor_properties', { investor_id: 'bd-smoke-nonexistent', take: 1 })));
test('live: search list_search_sessions', { skip }, async () => isArray(await run('searches', 'list_search_sessions', { take: 1 })));
test('live: search check_dnc', { skip }, async () => isArray(await run('searches', 'check_dnc', { phone_numbers: '6025550142' })));
test('live: search check_tcpa', { skip }, async () => isArray(await run('searches', 'check_tcpa', { phone_numbers: '6025550142' })));
test('live: search verify_phone (billed, once)', { skip }, async () => isArray(await run('searches', 'verify_phone', { phone_numbers: '6025550142' })));
test('live: search skip_trace (billed, once)', { skip }, async () => isArray(await run('searches', 'skip_trace', { api_version: 'v3', find_by: 'address', ...address })));
test('live: search reverse_skip_trace', { skip }, async () => isArray(await run('searches', 'reverse_skip_trace', { phone: '6025550142' })));
test('live: action verify_address_action', { skip }, async () => assert.equal(typeof (await run('creates', 'verify_address_action', address)), 'object'));
test('live: action create_search_session, trigger new_session_property, action delete_search_session', { skip }, async () => {
  const id = `zapier-live-${Date.now()}`;
  const query = '2800 N 24th St, Phoenix, AZ 85008';
  assert.equal(typeof (await run('creates', 'create_search_session', { session_id: id, query, take: 1 })), 'object');
  try {
    isArray(await run('triggers', 'new_session_property', { session_id: id, query, take: 1 }));
  } finally {
    await run('creates', 'delete_search_session', { id });
  }
});
