'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSearchBody,
  buildLookupBody,
  buildSkipTraceBody,
  buildPhoneBody,
  buildAddressVerifyBody,
  skipTracePath,
  extractSkipTraceRecords,
} = require('../lib/builders');
const { InputError } = require('../lib/common');
const { fixture } = require('./helpers');

test('search: structured fields become searchCriteria and options', () => {
  const body = buildSearchBody({
    query: 'Phoenix, AZ',
    quick_lists: ['absentee-owner'],
    excluded_quick_lists: ['vacant'],
    or_quick_lists: ['tax-default', 'preforeclosure'],
    bedrooms_min: '3',
    estimated_value_max: '400000',
    last_sale_date_from: '2020-01-05T00:00:00.000Z',
    owner_occupied: 'no',
    take: '10',
  });
  assert.deepEqual(body, {
    searchCriteria: {
      query: 'Phoenix, AZ',
      quickLists: ['absentee-owner', 'not-vacant'],
      orQuickLists: ['tax-default', 'preforeclosure'],
      building: { bedroomCount: { min: 3 } },
      valuation: { estimatedValue: { max: 400000 } },
      sale: { lastSaleDate: { minDate: '2020-01-05' } },
      owner: { ownerOccupied: { equals: false } },
    },
    options: { take: 10 },
  });
});

test('search: dedicated field wins over JSON blob and callbacks are stripped', () => {
  const body = buildSearchBody({
    query: 'Tempe, AZ',
    additional_criteria: JSON.stringify({ query: 'ignored', building: { yearBuilt: { min: 1990 } }, webhookUrl: 'https://x.test' }),
  });
  assert.equal(body.searchCriteria.query, 'Tempe, AZ');
  assert.deepEqual(body.searchCriteria.building, { yearBuilt: { min: 1990 } });
  assert.ok(!JSON.stringify(body).includes('webhookUrl'));
  assert.equal(body.options.take, 25);
});

test('search: validates take and JSON', () => {
  assert.throws(() => buildSearchBody({ take: '101' }), InputError);
  assert.throws(() => buildSearchBody({ additional_criteria: '[1]' }), InputError);
  assert.throws(() => buildSearchBody({ additional_criteria: '{oops' }), InputError);
  assert.equal(buildSearchBody({ take: '0' }).options.take, 0);
});

test('lookup: sends exactly one identifier', () => {
  const byAddress = buildLookupBody({ identify_by: 'address', street: '1 Main St', city: 'Phoenix', state: 'AZ', zip: '85001', property_id: 'ignored' });
  assert.deepEqual(byAddress, { requests: [{ address: { street: '1 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' } }] });
  const byApn = buildLookupBody({ identify_by: 'apn', apn: '123', county_fips_code: '04013', datasets: ['owner'], include_skip_trace: 'yes' });
  assert.deepEqual(byApn, { requests: [{ apn: '123', countyFipsCode: '04013' }], options: { skipTrace: true, datasets: ['owner'] } });
});

test('lookup: rejects basic+core and unknown datasets', () => {
  assert.throws(() => buildLookupBody({ identify_by: 'hash', address_hash: 'h', datasets: ['basic', 'core'] }), InputError);
  assert.throws(() => buildLookupBody({ identify_by: 'hash', address_hash: 'h', datasets: ['nope'] }), InputError);
});

test('skip trace: TCPA option is always explicit and defaults to excluded', () => {
  for (const version of ['v1', 'v3']) {
    const body = buildSkipTraceBody({ api_version: version, street: '1 Main St', city: 'Phoenix', state: 'AZ', zip: '85001' });
    assert.equal(body.options.includeTCPABlacklistedPhones, false);
  }
  const on = buildSkipTraceBody({ street: '1 Main St', include_tcpa_flagged: true });
  assert.equal(on.options.includeTCPABlacklistedPhones, true);
  assert.equal(buildSkipTraceBody({ street: 'x', include_tcpa_flagged: 'false' }).options.includeTCPABlacklistedPhones, false);
});

test('skip trace: paths and name/mailing mapping', () => {
  assert.equal(skipTracePath('v1'), '/api/v1/property/skip-trace');
  assert.equal(skipTracePath('v3'), '/api/v3/property/skip-trace');
  const body = buildSkipTraceBody({ street: '1 Main', owner_first_name: 'Ann', owner_last_name: 'Lee', mailing_street: 'PO Box 1', mailing_zip: '85001', request_id: 'r1' });
  assert.deepEqual(body.requests[0].name, { first: 'Ann', last: 'Lee' });
  assert.deepEqual(body.requests[0].mailingAddress, { street: 'PO Box 1', zip: '85001' });
  assert.equal(body.requests[0].requestId, 'r1');
});

test('skip trace: V1 and V3 responses become one record per person', () => {
  const v1 = extractSkipTraceRecords('v1', fixture('property-skip-trace'));
  assert.ok(v1.length >= 1);
  assert.equal(v1[0].apiVersion, 'v1');
  assert.ok(v1[0].person.name);
  const v3 = extractSkipTraceRecords('v3', fixture('v3-property-skip-trace'));
  assert.ok(v3.length >= 1);
  assert.equal(v3[0].apiVersion, 'v3');
  assert.ok(v3[0].person.name);
  assert.deepEqual(extractSkipTraceRecords('v3', {}), []);
});

test('phone and address bodies', () => {
  assert.deepEqual(buildPhoneBody({ phone_numbers: ['6027828692', '4805551212'] }), { requests: ['6027828692', '4805551212'] });
  assert.deepEqual(buildPhoneBody({ phone_numbers: '6027828692, 4805551212;1' }), { requests: ['6027828692', '4805551212', '1'] });
  assert.throws(() => buildPhoneBody({ phone_numbers: '' }), InputError);
  assert.deepEqual(buildAddressVerifyBody({ street: '1 Main', city: '', zip: '85001' }), { requests: [{ street: '1 Main', zip: '85001' }] });
});
