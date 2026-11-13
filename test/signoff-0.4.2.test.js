'use strict';

// Regression tests for the 0.4.2 sign-off fixes (Claude review + live run, Nov 9 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeZ } = require('./helpers');
const { searches, creates, triggers } = require('../lib/modules');

const bundleFor = (inputData, extra = {}) => ({ authData: { api_key: 'test-token' }, inputData, ...extra });

test('billed session trigger: dedupe population makes no API call', async () => {
  const bundle = bundleFor({ session_id: 's1', query: 'Phoenix, AZ' }, { meta: { isPopulatingDedupe: true } });
  const { z, calls } = makeZ(bundle, async () => ({ data: {} }));
  assert.deepEqual(await triggers.new_session_property.operation.perform(z, bundle), []);
  assert.equal(calls.length, 0);
});

test('billed session trigger: loading a sample fetches one record only', async () => {
  const bundle = bundleFor({ session_id: 's1', query: 'Phoenix, AZ', take: 25 }, { meta: { isLoadingSample: true } });
  const { z, calls } = makeZ(bundle, async () => ({ data: { results: { properties: [{ _id: 'p1' }] } } }));
  await triggers.new_session_property.operation.perform(z, bundle);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.options.take, 1);
});

test('billed session trigger and searches default to a small Max Results', () => {
  const take = (m) => m.operation.inputFields.find((f) => f.key === 'take').default;
  assert.equal(take(triggers.new_session_property), '5');
  for (const key of ['search_properties', 'get_permits', 'investor_buybox', 'investor_properties']) assert.equal(take(searches[key]), '1', key);
});

test('row-level Your Reference ID reaches the request in batch modules', async () => {
  for (const key of ['batch_lookup_property', 'batch_skip_trace']) {
    const rowsField = creates[key].operation.inputFields.find((f) => f.children);
    const refKey = rowsField.children.find((c) => /_ref$/.test(c.key)).key;
    const row = { street: '1 A St', city: 'X', state: 'AZ', zip: '85001', [refKey]: 'ROW-1' };
    const bundle = bundleFor({ [rowsField.key]: [row] });
    const { z, calls } = makeZ(bundle, async () => ({ data: { results: { properties: [] }, result: { data: [] } } }));
    await creates[key].operation.perform(z, bundle);
    assert.ok(JSON.stringify(calls[0].body).includes('ROW-1'), `${key} dropped the row reference`);
  }
});

test('402 gives a clear insufficient-funds error', async () => {
  const bundle = bundleFor({ street: '1 A St', city: 'X', state: 'AZ', zip: '85001' });
  const { z } = makeZ(bundle, async () => ({ status: 402, data: {} }));
  await assert.rejects(searches.verify_address.operation.perform(z, bundle), (e) => e.status === 402 && /balance/i.test(e.message));
});

test('skip trace output fields label both V1 and V3 record shapes', () => {
  const keys = searches.skip_trace.operation.outputFields.map((f) => f.key);
  assert.ok(keys.includes('propertyAddress__street'));
  assert.ok(keys.includes('property__address__street'));
  assert.ok(keys.some((k) => k.startsWith('person__phones[]')));
});
