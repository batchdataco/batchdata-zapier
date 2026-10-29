'use strict';

const {
  InputError,
  asList,
  deepMerge,
  isBlank,
  isPlainObject,
  parseJsonObject,
  removeEmpty,
  splitPhoneNumbers,
  stripForbiddenKeys,
  toDateOnly,
} = require('./common');
const { LOOKUP_DATASETS } = require('./constants');

const range = (min, max) => {
  const out = {};
  if (!isBlank(min)) out.min = Number(min);
  if (!isBlank(max)) out.max = Number(max);
  return Object.keys(out).length > 0 ? out : undefined;
};

const dateRange = (from, to) => {
  const out = {};
  const minDate = toDateOnly(from);
  const maxDate = toDateOnly(to);
  if (minDate) out.minDate = minDate;
  if (maxDate) out.maxDate = maxDate;
  return Object.keys(out).length > 0 ? out : undefined;
};

const setIf = (target, key, value) => {
  if (value !== undefined) target[key] = value;
};

const toBoolean = (value) => {
  if (value === true || value === 'true' || value === 'yes') return true;
  if (value === false || value === 'false' || value === 'no') return false;
  return undefined;
};

const buildSearchBody = (input) => {
  const building = {};
  setIf(building, 'bedroomCount', range(input.bedrooms_min, input.bedrooms_max));
  setIf(building, 'bathroomCount', range(input.bathrooms_min, input.bathrooms_max));
  setIf(building, 'yearBuilt', range(input.year_built_min, input.year_built_max));
  setIf(building, 'livingAreaSquareFeet', range(input.living_area_min, input.living_area_max));

  const general = {};
  if (!isBlank(input.property_type_category)) {
    general.propertyTypeCategory = { equals: String(input.property_type_category) };
  }
  if (!isBlank(input.property_type_detail)) {
    general.propertyTypeDetail = { equals: String(input.property_type_detail) };
  }

  const lot = {};
  setIf(lot, 'lotSizeAcres', range(input.lot_size_acres_min, input.lot_size_acres_max));

  const valuation = {};
  setIf(valuation, 'estimatedValue', range(input.estimated_value_min, input.estimated_value_max));
  setIf(valuation, 'equityPercent', range(input.equity_percent_min, input.equity_percent_max));

  const sale = {};
  setIf(sale, 'lastSaleDate', dateRange(input.last_sale_date_from, input.last_sale_date_to));

  const owner = {};
  const ownerOccupied = toBoolean(input.owner_occupied);
  if (ownerOccupied !== undefined) owner.ownerOccupied = { equals: ownerOccupied };

  const quickLists = [
    ...asList(input.quick_lists),
    ...asList(input.excluded_quick_lists).map((entry) => `not-${entry}`),
  ];
  const orQuickLists = asList(input.or_quick_lists);

  const structured = {};
  if (!isBlank(input.query)) structured.query = String(input.query);
  if (quickLists.length > 0) structured.quickLists = quickLists;
  if (orQuickLists.length > 0) structured.orQuickLists = orQuickLists;
  if (Object.keys(building).length > 0) structured.building = building;
  if (Object.keys(general).length > 0) structured.general = general;
  if (Object.keys(lot).length > 0) structured.lot = lot;
  if (Object.keys(valuation).length > 0) structured.valuation = valuation;
  if (Object.keys(sale).length > 0) structured.sale = sale;
  if (Object.keys(owner).length > 0) structured.owner = owner;

  const extra = parseJsonObject(input.additional_criteria, 'Additional search criteria');
  const searchCriteria = deepMerge(extra, structured);

  const take = isBlank(input.take) ? 25 : Number(input.take);
  if (!Number.isInteger(take) || take < 0 || take > 100) {
    throw new InputError('Max results must be a whole number from 0 to 100');
  }
  const options = { take };
  if (!isBlank(input.skip) && Number(input.skip) > 0) options.skip = Number(input.skip);

  return stripForbiddenKeys({ searchCriteria, options });
};

const buildLookupBody = (input) => {
  const identifyBy = input.identify_by || 'address';
  const request = {};
  switch (identifyBy) {
    case 'address':
      request.address = removeEmpty({
        street: input.street,
        city: input.city,
        state: input.state,
        zip: input.zip,
      });
      break;
    case 'propertyId':
      request.propertyId = input.property_id;
      break;
    case 'hash':
      request.hash = input.address_hash;
      break;
    case 'apn':
      request.apn = input.apn;
      request.countyFipsCode = input.county_fips_code;
      break;
    default:
      throw new InputError(`Unknown identifier type "${identifyBy}"`);
  }
  if (!isBlank(input.request_id)) request.requestId = String(input.request_id);

  const datasets = asList(input.datasets);
  const unknown = datasets.filter((entry) => !LOOKUP_DATASETS.includes(entry));
  if (unknown.length > 0) throw new InputError(`Unknown dataset: ${unknown.join(', ')}`);
  if (datasets.includes('basic') && datasets.includes('core')) {
    throw new InputError('The "basic" and "core" datasets cannot be combined');
  }
  const options = {};
  if (toBoolean(input.include_skip_trace) === true) options.skipTrace = true;
  if (datasets.length > 0) options.datasets = datasets;

  const body = { requests: [removeEmpty(request)] };
  if (Object.keys(options).length > 0) body.options = options;
  return body;
};

const skipTracePath = (version) =>
  version === 'v3' ? '/api/v3/property/skip-trace' : '/api/v1/property/skip-trace';

const buildSkipTraceBody = (input) => {
  const request = {};
  if ((input.find_by || 'address') === 'address') {
    request.propertyAddress = removeEmpty({
      street: input.street,
      city: input.city,
      state: input.state,
      zip: input.zip,
    });
  } else {
    request.apn = input.apn;
    if (!isBlank(input.county_fips_code)) request.countyFipsCode = input.county_fips_code;
    if (!isBlank(input.county)) request.county = input.county;
    if (!isBlank(input.apn_state)) request.state = input.apn_state;
  }
  if (!isBlank(input.owner_first_name) || !isBlank(input.owner_last_name)) {
    request.name = removeEmpty({ first: input.owner_first_name, last: input.owner_last_name });
  }
  const mailing = removeEmpty({
    street: input.mailing_street,
    city: input.mailing_city,
    state: input.mailing_state,
    zip: input.mailing_zip,
  });
  if (Object.keys(mailing).length > 0) request.mailingAddress = mailing;
  if (!isBlank(input.request_id)) request.requestId = String(input.request_id);

  // Always explicit: the raw API default differs between V1 (exclude) and V3 (include).
  const options = {
    includeTCPABlacklistedPhones: toBoolean(input.include_tcpa_flagged) === true,
  };
  const prioritize = toBoolean(input.prioritize_mobile_phones);
  if (prioritize !== undefined) options.prioritizeMobilePhones = prioritize;
  return { requests: [removeEmpty(request)], options };
};

const extractSkipTraceRecords = (version, response) => {
  if (version === 'v3') {
    const data =
      isPlainObject(response.result) && Array.isArray(response.result.data)
        ? response.result.data
        : [];
    const records = [];
    for (const entry of data) {
      const persons = Array.isArray(entry.persons) ? entry.persons : [];
      for (const person of persons) {
        records.push({
          apiVersion: 'v3',
          input: entry.input || null,
          property: entry.property || null,
          person,
        });
      }
    }
    return records;
  }
  const persons =
    isPlainObject(response.results) && Array.isArray(response.results.persons)
      ? response.results.persons
      : [];
  // The live V1 API returns an empty placeholder entry (meta.matched:false) for a property with no match.
  return persons
    .filter((person) => !(person.meta && person.meta.matched === false))
    .map((person) => ({
    apiVersion: 'v1',
    propertyAddress: person.propertyAddress || null,
    person,
  }));
};

const buildAddressVerifyBody = (input) => ({
  requests: [
    removeEmpty({ street: input.street, city: input.city, state: input.state, zip: input.zip }),
  ],
});

const buildPhoneBody = (input) => {
  const numbers = splitPhoneNumbers(input.phone_numbers);
  if (numbers.length === 0) throw new InputError('Enter at least one phone number');
  return { requests: numbers };
};

module.exports = {
  buildSearchBody,
  buildLookupBody,
  buildSkipTraceBody,
  skipTracePath,
  extractSkipTraceRecords,
  buildAddressVerifyBody,
  buildPhoneBody,
  toBoolean,
};
