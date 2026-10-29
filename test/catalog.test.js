'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { makeZ, ZError } = require('./helpers');
const { searches, creates, triggers } = require('../lib/modules');
const catalog = require('../lib/catalog.json');
const engine = require('../lib/engine');

const bundleFor = (inputData, extra = {}) => ({ authData: { api_key: 'test-token' }, inputData, ...extra });
const run = async (module, input, response, extra) => {
  const bundle = bundleFor(input, extra);
  const { z, calls } = makeZ(bundle, async () => ({ data: response }));
  const result = await module.operation.perform(z, bundle);
  return { result, calls };
};

test('vendored catalog matches its recorded hash (drift check against shared/catalog.json)', () => {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'lib', 'catalog.json'), 'utf8');
  const recorded = fs.readFileSync(path.join(__dirname, '..', 'lib', 'catalog.sha256'), 'utf8').trim();
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), recorded);
});

test('copy lint: one contact, no other product names, no callback fields, billing everywhere', () => {
  const all = [...Object.values(searches), ...Object.values(creates), ...Object.values(triggers)];
  const text = JSON.stringify(all.map((m) => [m.display, m.operation.inputFields]));
  assert.ok(!new RegExp(['batch' + 'leads', 'batch\\s*' + 'dialer'].join('|'), 'i').test(text));
  for (const m of all) for (const f of m.operation.inputFields) assert.ok(!/webhookurl|errorwebhookurl|^url$/i.test(f.key), `${m.key}.${f.key}`);
  for (const email of text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []) assert.equal(email, 'support@batchservice.com');
  for (const m of all) assert.match(m.display.description, /bill/i, m.key);
});

test('skip-trace-like operations always send includeTCPABlacklistedPhones, default false', async () => {
  const batch = await run(creates.batch_skip_trace, { properties: [{ street: '1 A St', city: 'X', state: 'AZ', zip: '85001' }] }, { result: { data: [] } });
  assert.equal(batch.calls[0].body.options.includeTCPABlacklistedPhones, false);
  assert.equal(batch.calls[0].url, 'https://api.batchdata.com/api/v3/property/skip-trace');
  const rev = await run(searches.reverse_skip_trace, { phone: '6025550142' }, { result: { data: [] } });
  assert.equal(rev.calls[0].body.options.includeTCPABlacklistedPhones, false);
  const on = await run(searches.reverse_skip_trace, { email: 'a@example.com', include_tcpa_flagged: true }, { result: { data: [] } });
  assert.equal(on.calls[0].body.options.includeTCPABlacklistedPhones, true);
});

test('reverse skip trace: no match yields no record, a match yields one', async () => {
  const none = await run(searches.reverse_skip_trace, { phone: '6025550142' }, { result: { data: [{ input: {}, persons: [], meta: { matched: false } }] } });
  assert.deepEqual(none.result, []);
  const hit = await run(searches.reverse_skip_trace, { phone: '6025550142' }, { result: { data: [{ input: {}, persons: [{ name: { first: 'A' } }], meta: { matched: true } }] } });
  assert.equal(hit.result.length, 1);
});

test('reverse skip trace needs a phone or an email and sends nothing otherwise', async () => {
  const bundle = bundleFor({});
  const { z, calls } = makeZ(bundle, async () => ({ data: {} }));
  await assert.rejects(searches.reverse_skip_trace.operation.perform(z, bundle), (e) => e instanceof ZError && /at least one of/i.test(e.message));
  assert.equal(calls.length, 0);
});

test('batch operations cap at 100 rows and need at least one row', async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ street: `${i} Main St` }));
  const bundle = bundleFor({ addresses: rows });
  const { z, calls } = makeZ(bundle, async () => ({ data: {} }));
  await assert.rejects(creates.batch_verify_address.operation.perform(z, bundle), /at most 100/);
  await assert.rejects(creates.batch_verify_address.operation.perform(z, bundleFor({ addresses: [] })), /at least one row/);
  assert.equal(calls.length, 0);
});

test('permits: one record per permit with the property attached; address and filters map to the request', async () => {
  const response = { result: { permits: [{ permitNumber: 'A1' }, { permitNumber: 'A2' }], property: { address: { street: '1 A St' } }, meta: { results: { resultCount: 2, resultsFound: 2 } } } };
  const { result, calls } = await run(searches.get_permits, { street: '1 A St', city: 'X', state: 'AZ', zip: '85001', permit_status: 'final', tags: ['solar', 'roofing'], issued_from: '2025-01-01T00:00:00Z' }, response);
  assert.equal(result.length, 2);
  assert.equal(result[0].property.address.street, '1 A St');
  assert.equal(calls[0].url, 'https://api.batchdata.com/api/v2/property/get-property-permits');
  assert.deepEqual(calls[0].body.request.allTags, { inList: ['solar', 'roofing'] });
  assert.equal(calls[0].body.request.issueDate.minDate, '2025-01-01');
  assert.equal(calls[0].body.options.take, 25);
});

test('investor buybox and properties map their envelopes', async () => {
  const box = await run(searches.investor_buybox, { street: '1 A St', city: 'X', state: 'AZ', zip: '85001' }, { result: { investors: [{ id: 'i1' }], meta: { results: { resultCount: 1 } } } });
  assert.equal(box.result[0].id, 'i1');
  assert.equal(box.calls[0].body.searchCriteria.compAddress.street, '1 A St');
  const props = await run(searches.investor_properties, { investor_id: 'i1', take: '5' }, { result: { properties: [{ propertyId: 'p1' }], resultsFound: 9, nextPageCursor: 'c2' } });
  assert.equal(props.result[0].nextPageCursor, 'c2');
  assert.equal(props.calls[0].body.options.take, 5);
});

test('autocomplete, geocode and reverse geocode', async () => {
  const ac = await run(searches.autocomplete_address, { query: '2800 N 24th' }, { result: { suggestions: [{ name: 'a' }, { name: 'b' }] } });
  assert.equal(ac.result.length, 2);
  assert.equal(ac.calls[0].body.options.take, 5);
  const geo = await run(searches.geocode_address, { address: '1 A St, X, AZ' }, { result: { addresses: [{ latitude: 1, longitude: 2 }] } });
  assert.equal(geo.calls[0].body.requests[0].address, '1 A St, X, AZ');
  const rev = await run(searches.reverse_geocode, { latitude: '33.4', longitude: '-112.0' }, { result: { addresses: [{ street: 's' }] } });
  assert.deepEqual(rev.calls[0].body.request, { latitude: 33.4, longitude: -112 });
});

test('search sessions: list uses query params, create forces cursor pagination, delete uses the path', async () => {
  const list = await run(searches.list_search_sessions, { take: 7 }, { results: { sessions: [{ id: 's1' }] } });
  assert.equal(list.calls[0].method, 'GET');
  assert.equal(list.calls[0].params.take, 7);
  assert.equal(list.calls[0].body, undefined);
  const created = await run(creates.create_search_session, { session_id: 'my-session_1', query: 'Phoenix, AZ' }, { results: { properties: [{ _id: 'p' }], searchSessionMeta: { totalDelivered: 1, isNewSession: true } } });
  assert.equal(created.calls[0].body.options.useCursorPagination, true);
  assert.equal(created.calls[0].body.options.searchSession.id, 'my-session_1');
  assert.equal(created.calls[0].body.options.take, 1);
  assert.equal(created.result.session.isNewSession, true);
  const del = await run(creates.delete_search_session, { id: 'my session/1' }, { results: { deleted: true, id: 'my session/1' } });
  assert.equal(del.calls[0].method, 'DELETE');
  assert.equal(del.calls[0].url, 'https://api.batchdata.com/api/v2/property/search-sessions/my%20session%2F1');
  assert.deepEqual(del.result, { deleted: true, id: 'my session/1' });
});

test('session ids are validated before any request', async () => {
  const bundle = bundleFor({ session_id: 'bad id!', query: 'x' });
  const { z, calls } = makeZ(bundle, async () => ({ data: {} }));
  await assert.rejects(creates.create_search_session.operation.perform(z, bundle), /invalid format/);
  assert.equal(calls.length, 0);
});

test('create monitor: stream delivery only, never a user callback URL', async () => {
  const input = { query: 'Phoenix, AZ', delivery_type: 'kinesis', kinesis_stream_name: 's', kinesis_region: 'us-west-2', kinesis_access_key_id: 'k', kinesis_secret_access_key: 'v', event_hub_name: 'ignored' };
  const { result, calls } = await run(creates.create_monitor, input, { result: { subscriptionId: 'sub1' } });
  assert.equal(calls[0].body.deliveryConfig.type, 'kinesis');
  assert.equal(calls[0].body.deliveryConfig.eventHub, undefined);
  assert.deepEqual(result, { subscriptionId: 'sub1' });
  const fields = creates.create_monitor.operation.inputFields.map((f) => f.key);
  assert.ok(!fields.some((k) => /url|webhook/i.test(k)));
  const types = creates.create_monitor.operation.inputFields.find((f) => f.key === 'delivery_type').choices.map((c) => c.value);
  assert.deepEqual(types.sort(), ['event-hub', 'kinesis']);
});

test('callback keys inside JSON criteria are stripped from the request', async () => {
  const { calls } = await run(creates.create_search_session, { session_id: 's1', additional_criteria: '{"query":"x","options":{"webhookUrl":"https://evil.example"},"errorWebhookUrl":"https://evil.example"}' }, { results: { properties: [] } });
  assert.ok(!JSON.stringify(calls[0].body).toLowerCase().includes('webhook'));
});

test('delete monitor and get monitor use the path id', async () => {
  const del = await run(creates.delete_monitor, { id: 'abc' }, {});
  assert.equal(del.calls[0].url, 'https://api.batchdata.com/api/v2/property-subscription/abc');
  const got = await run(searches.get_monitor, { id: 'abc' }, { result: { id: 'abc', searchCriteria: {} } });
  assert.equal(got.result[0].id, 'abc');
});

test('polling triggers return records with an id, newest first', async () => {
  const sessions = await run(triggers.new_search_session, {}, { results: { sessions: [{ id: 'a', createdAt: '2026-01-01' }, { id: 'b', createdAt: '2026-02-01' }] } });
  assert.deepEqual(sessions.result.map((r) => r.id), ['b', 'a']);
  assert.equal(sessions.calls[0].params.take, 100);
  const props = await run(triggers.new_session_property, { session_id: 's1', query: 'Phoenix' }, { results: { properties: [{ _id: 'p1' }, { _id: 'p2' }] } });
  assert.deepEqual(props.result.map((r) => r.id), ['p1', 'p2']);
  assert.equal(props.calls[0].body.options.useCursorPagination, true);
  assert.match(triggers.new_session_property.display.description, /billed|bills/i);
  const monitors = await run(triggers.new_monitor, {}, { results: { subscriptions: [{ id: 'm1' }] } });
  assert.equal(monitors.result[0].id, 'm1');
});

test('hook trigger: subscribe creates a webhook monitor to the platform hook URL, unsubscribe deletes it', async () => {
  const op = triggers.monitor_event.operation;
  const sub = bundleFor({ query: 'Phoenix, AZ', include_property: true }, { targetUrl: 'https://hooks.zapier.com/hooks/standard/1/abc/' });
  const s = makeZ(sub, async () => ({ data: { result: { subscriptionId: 'sub9' } } }));
  const out = await op.performSubscribe(s.z, sub);
  assert.deepEqual(out, { subscriptionId: 'sub9' });
  assert.equal(s.calls[0].method, 'POST');
  assert.deepEqual(s.calls[0].body.deliveryConfig, { type: 'webhook', url: 'https://hooks.zapier.com/hooks/standard/1/abc/' });
  assert.equal(s.calls[0].body.searchCriteria.query, 'Phoenix, AZ');
  assert.equal(JSON.stringify(s.calls[0].body).includes('include_property'), false);

  const un = bundleFor({}, { subscribeData: { subscriptionId: 'sub9' } });
  const u = makeZ(un, async () => ({ data: {} }));
  assert.deepEqual(await op.performUnsubscribe(u.z, un), { removed: true });
  assert.equal(u.calls[0].method, 'DELETE');
  assert.equal(u.calls[0].url, 'https://api.batchdata.com/api/v2/property-subscription/sub9');
});

test('hook trigger: event payload becomes a record keyed by eventId; hydration is opt-in and billed', async () => {
  const op = triggers.monitor_event.operation;
  const event = { eventId: 'e1', propertyId: 'p1', addedToSubscriptionIds: ['sub9'], removedFromSubscriptionIds: [], propertyChangedAt: '2026-10-28T00:00:00Z' };
  const plain = bundleFor({ query: 'x' }, { cleanedRequest: event });
  const a = makeZ(plain, async () => ({ data: {} }));
  const records = await op.perform(a.z, plain);
  assert.equal(records[0].id, 'e1');
  assert.equal(a.calls.length, 0);

  const hydrated = bundleFor({ query: 'x', include_property: true }, { cleanedRequest: event });
  const b = makeZ(hydrated, async () => ({ data: { results: { properties: [{ _id: 'p1', address: { street: '1 A St' } }] } } }));
  const full = await op.perform(b.z, hydrated);
  assert.equal(full[0].property.address.street, '1 A St');
  assert.deepEqual(b.calls[0].body, { requests: [{ propertyId: 'p1' }] });

  const nokey = bundleFor({}, { cleanedRequest: { propertyId: 'p2' } });
  const c = makeZ(nokey, async () => ({ data: {} }));
  const [r1] = await op.perform(c.z, nokey);
  const [r2] = await op.perform(c.z, nokey);
  assert.equal(r1.id, r2.id);
  assert.equal((await op.performList()).length, 1);
});

test('generic API request: allows normal paths, blocks wallet, async, encoded and monitor creation', async () => {
  const ok = await run(creates.api_request, { method: 'POST', path: '/api/v1/address/verify', body: '{"requests":[],"options":{"webhookUrl":"x"}}' }, { status: { code: 200 } });
  assert.equal(ok.calls[0].url, 'https://api.batchdata.com/api/v1/address/verify');
  assert.ok(!JSON.stringify(ok.calls[0].body).includes('webhook'));
  assert.equal(ok.result.statusCode, 200);
  for (const [method, p] of [
    ['GET', '/api/v1/wallet/balance'], ['GET', '/api/v1/Wallet/consumption-report'], ['POST', '/api/v1/property/search/async'],
    ['POST', '/api/v2/property-subscription'], ['GET', '/api/v1/%77allet/balance'], ['GET', '/v1/address/verify'],
    ['GET', '/api/v1/../v1/wallet'], ['GET', '/api/v1/x?y=1'], ['POST', '/api/v3/property/skip-trace/async'],
  ]) {
    const bundle = bundleFor({ method, path: p });
    const { z, calls } = makeZ(bundle, async () => ({ data: {} }));
    await assert.rejects(creates.api_request.operation.perform(z, bundle), ZError, `${method} ${p}`);
    assert.equal(calls.length, 0, `${method} ${p} must not call the API`);
  }
  const get = await run(creates.api_request, { method: 'GET', path: '/api/v2/property-subscription' }, { results: {} });
  assert.equal(get.calls[0].method, 'GET');
});

test('engine: every catalog op builds a request from its sample-free required inputs', () => {
  for (const op of catalog.ops) {
    const input = {};
    for (const f of op.fields) {
      if (!f.required || f.default !== undefined) continue;
      input[f.key] = f.type === 'rows' ? [Object.fromEntries(f.rowFields.map((r) => [r.key, 'x']))] : f.key === 'session_id' ? 'abc' : f.type === 'number' || f.type === 'integer' ? 1 : 'x';
    }
    if (op.requireOneOf) input[op.requireOneOf[0]] = 'x';
    const request = engine.buildRequest(op, input);
    assert.ok(request.path.startsWith('/api/'), op.key);
    assert.ok(!/wallet|async/.test(request.path), op.key);
  }
});
