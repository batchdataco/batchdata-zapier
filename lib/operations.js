'use strict';

const { API_HOST, SUPPORT_EMAIL } = require('./constants');
const {
  buildAddressVerifyBody,
  buildLookupBody,
  buildPhoneBody,
  buildSearchBody,
  buildSkipTraceBody,
  extractSkipTraceRecords,
  skipTracePath,
} = require('./builders');
const {
  addressFields,
  datasetChoices,
  quickListChoices,
  rangeFields,
  requestIdField,
  yesNoAny,
} = require('./fields');
const { isPlainObject } = require('./common');
const { outputFieldsFromSample } = require('./outputFields');

const sample = (name) => require(`../samples/${name}.json`);

const phoneField = {
  key: 'phone_numbers',
  label: 'Phone Number(s)',
  type: 'string',
  required: true,
  list: true,
  helpText:
    'One or more US phone numbers. A single field value can also hold several numbers separated by commas. You are billed for each phone number you submit.',
};

const phoneComplianceNote =
  ' This is a point-in-time answer from BatchData. You are responsible for meeting TCPA, DNC and other calling rules in your jurisdiction.';

const listOf = (response, ...path) => {
  let node = response;
  for (const segment of path) {
    if (!isPlainObject(node)) return [];
    node = node[segment];
  }
  return Array.isArray(node) ? node : [];
};

const phoneOp = ({ key, noun, label, description, endpoint, sampleName }) => ({
  key,
  noun,
  label,
  description: `${description} Billed per phone number submitted.${phoneComplianceNote}`,
  single: true,
  createLabel: label,
  inputFields: [phoneField],
  buildRequest: (input) => ({ path: endpoint, body: buildPhoneBody(input) }),
  extract: (response) => listOf(response, 'results', 'phoneNumbers'),
  sample: sample(sampleName),
});

const operations = [
  {
    key: 'search_properties',
    noun: 'Property',
    label: 'Find Properties',
    description:
      'Searches BatchData property records with filters. Billed per property record returned; a count-only request (Max Results = 0) is billed as one record. Each result includes the total number found in the "Search Meta" fields.',
    single: false,
    createLabel: null,
    inputFields: [
      { key: 'query', label: 'Location Query', type: 'string', helpText: 'City, county, ZIP code or address text, for example "Phoenix, AZ".' },
      { key: 'quick_lists', label: 'Quick Lists (Include)', type: 'string', list: true, choices: quickListChoices, helpText: 'Properties must match ALL selected lists.' },
      { key: 'or_quick_lists', label: 'Quick Lists (Match Any)', type: 'string', list: true, choices: quickListChoices, helpText: 'Properties must match AT LEAST ONE selected list.' },
      { key: 'excluded_quick_lists', label: 'Quick Lists (Exclude)', type: 'string', list: true, choices: quickListChoices, helpText: 'Properties on any selected list are left out.' },
      { key: 'property_type_category', label: 'Property Type Category', type: 'string', helpText: 'For example "Single Family" or "Multi-Family".' },
      { key: 'property_type_detail', label: 'Property Type Detail', type: 'string' },
      ...rangeFields('bedrooms', 'Bedrooms', 'integer'),
      ...rangeFields('bathrooms', 'Bathrooms'),
      ...rangeFields('year_built', 'Year Built', 'integer'),
      ...rangeFields('living_area', 'Living Area (sq ft)'),
      ...rangeFields('lot_size_acres', 'Lot Size (acres)'),
      ...rangeFields('estimated_value', 'Estimated Value (USD)'),
      ...rangeFields('equity_percent', 'Equity Percent'),
      { key: 'last_sale_date_from', label: 'Last Sale Date (From)', type: 'datetime' },
      { key: 'last_sale_date_to', label: 'Last Sale Date (To)', type: 'datetime' },
      yesNoAny('owner_occupied', 'Owner Occupied'),
      { key: 'take', label: 'Max Results', type: 'integer', default: '25', helpText: 'From 0 to 100. Default 25. You are billed per record returned.' },
      { key: 'skip', label: 'Skip (Offset)', type: 'integer', helpText: 'Number of results to skip, for paging.' },
      { key: 'additional_criteria', label: 'Additional Search Criteria (JSON)', type: 'text', helpText: 'Optional JSON object merged into searchCriteria. Fields above win on conflict. webhookUrl and errorWebhookUrl are ignored.' },
    ],
    buildRequest: (input) => ({ path: '/api/v1/property/search', body: buildSearchBody(input) }),
    extract: (response) => {
      const results = isPlainObject(response.results) ? response.results : {};
      const meta = isPlainObject(results.meta) && isPlainObject(results.meta.results) ? results.meta.results : {};
      const searchMeta = {
        resultCount: meta.resultCount === undefined ? null : meta.resultCount,
        resultsFound: meta.resultsFound === undefined ? null : meta.resultsFound,
      };
      const properties = Array.isArray(results.properties) ? results.properties : [];
      if (properties.length === 0 && meta.resultsFound !== undefined && meta.resultsFound !== null) {
        return [{ searchMeta }];
      }
      return properties.map((property) => ({ ...property, searchMeta }));
    },
    sample: sample('search_properties'),
  },
  {
    key: 'lookup_property',
    noun: 'Property',
    label: 'Look Up Property',
    description:
      'Returns the full record for one property, identified by address, BatchData property ID, address hash, or APN plus county FIPS code. Billed per property record returned; adding contact info adds enrichment cost.',
    single: true,
    createLabel: 'Look Up Property',
    inputFields: [
      {
        key: 'identify_by',
        label: 'Identify Property By',
        type: 'string',
        required: true,
        default: 'address',
        choices: [
          { value: 'address', label: 'Address' },
          { value: 'propertyId', label: 'BatchData Property ID' },
          { value: 'hash', label: 'Address Hash' },
          { value: 'apn', label: 'APN + County FIPS Code' },
        ],
        helpText: 'Fill in only the fields for the option you choose here. Exactly one identifier is sent.',
      },
      ...addressFields(),
      { key: 'property_id', label: 'BatchData Property ID', type: 'string' },
      { key: 'address_hash', label: 'Address Hash', type: 'string' },
      { key: 'apn', label: 'APN', type: 'string' },
      { key: 'county_fips_code', label: 'County FIPS Code', type: 'string', helpText: 'Required with APN.' },
      { key: 'datasets', label: 'Datasets', type: 'string', list: true, choices: datasetChoices, helpText: 'Optional. Limits the response to these datasets. "basic" and "core" cannot be combined.' },
      yesNoAny('include_skip_trace', 'Include Contact Info (Skip Trace)', 'Leave empty or No to skip. Yes adds contact-enrichment cost.'),
      requestIdField,
    ],
    buildRequest: (input) => ({ path: '/api/v1/property/lookup/all-attributes', body: buildLookupBody(input) }),
    extract: (response) => listOf(response, 'results', 'properties'),
    sample: sample('lookup_property'),
  },
  {
    key: 'skip_trace',
    noun: 'Skip Trace Result',
    label: 'Skip Trace Property Owner',
    description:
      'Finds owner contact details (phones and emails) for a property. Billed per matched result. TCPA-flagged phone numbers are left out unless you turn on "Include TCPA-Flagged Phones". Each result is one person.',
    single: 'persons',
    createLabel: 'Skip Trace Property Owner',
    inputFields: [
      {
        key: 'api_version',
        label: 'API Version',
        type: 'string',
        default: 'v1',
        choices: [
          { value: 'v1', label: 'V1 (persons list)' },
          { value: 'v3', label: 'V3 (up to 3 persons per property, more detail)' },
        ],
        helpText: 'Both versions behave the same for the TCPA setting below because it is always sent explicitly.',
      },
      {
        key: 'find_by',
        label: 'Find Property By',
        type: 'string',
        default: 'address',
        choices: [
          { value: 'address', label: 'Property Address' },
          { value: 'apn', label: 'APN + County' },
        ],
      },
      ...addressFields(),
      { key: 'apn', label: 'APN', type: 'string' },
      { key: 'county_fips_code', label: 'County FIPS Code', type: 'string' },
      { key: 'county', label: 'County', type: 'string' },
      { key: 'apn_state', label: 'State (for APN)', type: 'string' },
      { key: 'owner_first_name', label: 'Owner First Name', type: 'string', helpText: 'Optional. Helps match the right person.' },
      { key: 'owner_last_name', label: 'Owner Last Name', type: 'string' },
      ...addressFields('mailing_', 'Mailing '),
      {
        key: 'include_tcpa_flagged',
        label: 'Include TCPA-Flagged Phones',
        type: 'boolean',
        helpText:
          'Off by default: phone numbers flagged as TCPA litigators are left out. Turn on only if you have a documented compliance basis. Flagged numbers carry "tcpa": true in the result.',
      },
      yesNoAny('prioritize_mobile_phones', 'Prioritize Mobile Phones'),
      requestIdField,
    ],
    buildRequest: (input) => {
      const version = input.api_version === 'v3' ? 'v3' : 'v1';
      return { path: skipTracePath(version), body: buildSkipTraceBody(input), version };
    },
    extract: (response, request) => extractSkipTraceRecords(request.version, response),
    sample: sample('skip_trace'),
  },
  {
    key: 'verify_address',
    noun: 'Address',
    label: 'Verify Address',
    description:
      'Standardizes and validates a US address, returning the corrected address, county, coordinates and delivery details. Billed per address submitted.',
    single: true,
    createLabel: 'Verify Address',
    inputFields: addressFields().map((field) => ({ ...field, required: field.key === 'street' })),
    buildRequest: (input) => ({ path: '/api/v1/address/verify', body: buildAddressVerifyBody(input) }),
    extract: (response) => listOf(response, 'results', 'addresses'),
    sample: sample('verify_address'),
  },
  phoneOp({
    key: 'verify_phone',
    noun: 'Phone Verification',
    label: 'Verify Phone Number',
    description: 'Checks whether a phone number is reachable and returns its carrier, line type, DNC and TCPA flags.',
    endpoint: '/api/v1/phone/verification',
    sampleName: 'verify_phone',
  }),
  phoneOp({
    key: 'check_dnc',
    noun: 'DNC Status',
    label: 'Check Do Not Call (DNC) Status',
    description: 'Checks phone numbers against the Do Not Call registry.',
    endpoint: '/api/v1/phone/dnc',
    sampleName: 'check_dnc',
  }),
  phoneOp({
    key: 'check_tcpa',
    noun: 'TCPA Status',
    label: 'Check TCPA Litigator Status',
    description: 'Checks phone numbers against TCPA (Telephone Consumer Protection Act) litigator lists.',
    endpoint: '/api/v1/phone/tcpa',
    sampleName: 'check_tcpa',
  }),
];

for (const op of operations) {
  op.outputFields = outputFieldsFromSample(op.sample);
  op.supportEmail = SUPPORT_EMAIL;
  op.host = API_HOST;
}

module.exports = { operations };
