'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { searches, creates, actionKey } = require('../lib/modules');
const authentication = require('../authentication');
const { makeZ, fixture, ZError, ExpiredAuthError, ThrottledError } = require('./helpers');

const bundleFor = (inputData) => ({ authData: { api_key: 'test-token' }, inputData });

const cases = [
  { key: 'search_properties', fixture: 'property-search', path: '/api/v1/property/search', input: { query: 'Phoenix, AZ', take: '2' } },
  { key: 'lookup_property', fixture: 'property-lookup-all-attributes', path: '/api/v1/property/lookup/all-attributes', input: { identify_by: 'address', street: '1 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' } },
  { key: 'skip_trace', fixture: 'property-skip-trace', path: '/api/v1/property/skip-trace', input: { street: '1011 Rosegold St', city: 'Franklin Square', state: 'NY', zip: '11010' } },
  { key: 'verify_address', fixture: 'address-verify', path: '/api/v1/address/verify', input: { street: '2800 N 24th St', city: 'Phoenix', state: 'AZ', zip: '85008' } },
  { key: 'verify_phone', fixture: 'phone-verification', path: '/api/v1/phone/verification', input: { phone_numbers: ['6462467560'] } },
  { key: 'check_dnc', fixture: 'phone-dnc', path: '/api/v1/phone/dnc', input: { phone_numbers: '6027828692' } },
  { key: 'check_tcpa', fixture: 'phone-tcpa', path: '/api/v1/phone/tcpa', input: { phone_numbers: ['2024561111'] } },
];

for (const c of cases) {
  test(`search ${c.key}: one POST with bearer token, returns records`, async () => {
    const { z, calls } = makeZ(bundleFor(c.input), async () => ({ data: fixture(c.fixture) }));
    const result = await searches[c.key].operation.perform(z, bundleFor(c.input));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, `https://api.batchdata.com${c.path}`);
    assert.equal(calls[0].headers.Authorization, 'Bearer test-token');
    assert.ok(Array.isArray(result));
    assert.ok(result.length >= 1, 'expected at least one record');
  });
}

for (const c of cases.filter((entry) => entry.key !== 'search_properties')) {
  test(`action ${c.key}: returns a single object`, async () => {
    const { z } = makeZ(bundleFor(c.input), async () => ({ data: fixture(c.fixture) }));
    const result = await creates[actionKey({ key: c.key })].operation.perform(z, bundleFor(c.input));
    assert.ok(result && typeof result === 'object' && !Array.isArray(result));
    if (c.key === 'skip_trace') {
      assert.equal(result.matched, true);
      assert.ok(result.persons.length >= 1);
    }
  });
}

test('search_properties: attaches count meta to each record and handles count-only', async () => {
  const body = fixture('property-search');
  const { z } = makeZ(bundleFor({}), async () => ({ data: body }));
  const records = await searches.search_properties.operation.perform(z, bundleFor({ query: 'x' }));
  assert.equal(records.length, body.results.properties.length);
  assert.equal(records[0].searchMeta.resultsFound, body.results.meta.results.resultsFound);

  const countOnly = { results: { properties: [], meta: { results: { resultCount: 0, resultsFound: 1234 } } } };
  const { z: z2 } = makeZ(bundleFor({}), async () => ({ data: countOnly }));
  const only = await searches.search_properties.operation.perform(z2, bundleFor({ query: 'x', take: '0' }));
  assert.deepEqual(only, [{ searchMeta: { resultCount: 0, resultsFound: 1234 } }]);
});

test('search_properties: sends the expected body', async () => {
  const { z, calls } = makeZ(bundleFor({}), async () => ({ data: fixture('property-search') }));
  await searches.search_properties.operation.perform(z, bundleFor({ query: 'Phoenix, AZ', quick_lists: ['vacant'], take: '5' }));
  assert.deepEqual(calls[0].body, { searchCriteria: { query: 'Phoenix, AZ', quickLists: ['vacant'] }, options: { take: 5 } });
});

test('skip_trace: V3 endpoint and explicit TCPA exclusion', async () => {
  const input = { api_version: 'v3', street: '1011 Rosegold St', city: 'Franklin Square', state: 'NY', zip: '11010' };
  const { z, calls } = makeZ(bundleFor(input), async () => ({ data: fixture('v3-property-skip-trace') }));
  const records = await searches.skip_trace.operation.perform(z, bundleFor(input));
  assert.equal(calls[0].url, 'https://api.batchdata.com/api/v3/property/skip-trace');
  assert.equal(calls[0].body.options.includeTCPABlacklistedPhones, false);
  assert.equal(records[0].apiVersion, 'v3');
});

test('no match returns an empty search result and matched:false action result', async () => {
  const empty = { results: { persons: [] } };
  const input = { street: '1 Nowhere' };
  const { z } = makeZ(bundleFor(input), async () => ({ data: empty }));
  assert.deepEqual(await searches.skip_trace.operation.perform(z, bundleFor(input)), []);
  const action = await creates.skip_trace_action.operation.perform(z, bundleFor(input));
  assert.equal(action.matched, false);
  assert.equal(action.personCount, 0);
});

test('V1 no-match placeholder entries (meta.matched:false) are not returned as persons', async () => {
  const placeholder = { results: { persons: [{ propertyAddress: { street: '1 Nowhere' }, name: {}, phoneNumbers: [], emails: [], meta: { matched: false, error: false } }] } };
  const input = { street: '1 Nowhere', api_version: 'v1' };
  const { z } = makeZ(bundleFor(input), async () => ({ data: placeholder }));
  assert.deepEqual(await searches.skip_trace.operation.perform(z, bundleFor(input)), []);
  const action = await creates.skip_trace_action.operation.perform(z, bundleFor(input));
  assert.equal(action.matched, false);
});

test('invalid input becomes a user-facing z.errors.Error before any request', async () => {
  const { z, calls } = makeZ(bundleFor({}), async () => ({ data: {} }));
  await assert.rejects(
    searches.check_dnc.operation.perform(z, bundleFor({ phone_numbers: '' })),
    (error) => error instanceof ZError && /at least one phone/i.test(error.message),
  );
  assert.equal(calls.length, 0);
});

test('HTTP errors map to Zapier errors', async () => {
  const run = async (status) => {
    const { z } = makeZ(bundleFor({}), async () => ({ status, data: { status: { code: status, message: 'nope' } } }));
    return searches.check_dnc.operation.perform(z, bundleFor({ phone_numbers: '6027828692' }));
  };
  await assert.rejects(run(401), (e) => e instanceof ExpiredAuthError);
  await assert.rejects(run(403), (e) => e.status === 403 && e.message.includes('support@batchservice.com'));
  await assert.rejects(run(429), (e) => e instanceof ThrottledError);
  await assert.rejects(run(400), (e) => e.code === 'InvalidInput' && e.message === 'nope');
  await assert.rejects(run(503), (e) => e.status === 503 && !/nope/.test(e.message));
});

test('authentication test: 400 or 2xx is valid; 401/403 is invalid', async () => {
  const probe = async (status) => {
    const { z, calls } = makeZ(bundleFor({}), async () => ({ status, data: {} }));
    const outcome = await authentication.test(z, bundleFor({}));
    return { outcome, calls };
  };
  const ok = await probe(400);
  assert.deepEqual(ok.outcome, { ok: true });
  assert.deepEqual(ok.calls[0].body, { requests: [] });
  assert.equal(ok.calls[0].url, 'https://api.batchdata.com/api/v1/address/verify');
  assert.equal(ok.calls[0].headers.Authorization, 'Bearer test-token');
  assert.deepEqual((await probe(200)).outcome, { ok: true });
  await assert.rejects(probe(401), (e) => e.status === 401);
  await assert.rejects(probe(403), (e) => e.status === 403);
  await assert.rejects(probe(500), (e) => e.status === 500);
});
