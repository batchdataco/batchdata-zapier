'use strict';
// Builds the trimmed sample records shipped in samples/*.json from the OpenAPI-derived fixtures.
// Usage: node scripts/make-samples.js ../fixtures
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || '../fixtures');
const load = (name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
const pick = (source, spec) => {
  const out = {};
  for (const [key, sub] of Object.entries(spec)) {
    if (source === undefined || source === null || !(key in source)) continue;
    out[key] = sub === true ? source[key] : pick(source[key], sub);
  }
  return out;
};
const write = (name, value) =>
  fs.writeFileSync(path.join(__dirname, '..', 'samples', `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);

const propertySpec = {
  _id: true,
  address: { street: true, city: true, state: true, zip: true, county: true, latitude: true, longitude: true, hash: true },
  owner: { fullName: true },
  valuation: { estimatedValue: true, equityPercent: true },
  listing: { status: true, bedroomCount: true, bathroomCount: true, yearBuilt: true },
  ids: { apn: true },
};
const search = load('property-search');
const searchRecord = pick(search.results.properties[0], propertySpec);
searchRecord.searchMeta = { resultCount: 1, resultsFound: 1 };
write('search_properties', searchRecord);

const lookup = load('property-lookup-all-attributes');
write(
  'lookup_property',
  pick(lookup.results.properties[0], {
    ...propertySpec,
    building: { livingAreaSquareFeet: true, yearBuilt: true, bedroomCount: true },
    general: { propertyTypeCategory: true, propertyTypeDetail: true },
    lot: { lotSizeAcres: true },
    tax: { taxAmount: true, taxYear: true },
  }),
);

const personPick = {
  name: { first: true, last: true },
  litigator: true,
  emails: true,
  phoneNumbers: true,
  propertyAddress: { street: true, city: true, state: true, zip: true },
};
const v1 = load('property-skip-trace');
write('skip_trace', {
  apiVersion: 'v1',
  propertyAddress: v1.results.persons[0].propertyAddress
    ? pick(v1.results.persons[0].propertyAddress, { street: true, city: true, state: true, zip: true })
    : null,
  person: pick(v1.results.persons[0], personPick),
});

const addr = load('address-verify');
write(
  'verify_address',
  pick(addr.results.addresses[0], {
    street: true, city: true, state: true, zip: true, zipPlus4: true, county: true,
    countyFipsCode: true, hash: true, latitude: true, longitude: true, vacant: true,
    carrierRoute: true, meta: { error: true, normalized: true },
  }),
);
const ph = load('phone-verification');
write('verify_phone', ph.results.phoneNumbers[0]);
write('check_dnc', load('phone-dnc').results.phoneNumbers[0]);
write('check_tcpa', load('phone-tcpa').results.phoneNumbers[0]);
console.log('samples written');
