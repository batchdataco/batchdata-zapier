'use strict';

const { operations } = require('./operations');
const { runOperation, toActionResult, actionSample } = require('./execute');
const { outputFieldsFromSample } = require('./outputFields');

const searchFor = (op) => ({
  key: op.key,
  noun: op.noun,
  display: { label: op.label, description: op.description },
  operation: {
    inputFields: op.inputFields,
    perform: (z, bundle) => runOperation(z, bundle, op),
    sample: op.sample,
    outputFields: op.outputFields,
  },
});

const actionKey = (op) => `${op.key}_action`;

const createFor = (op) => {
  const sample = actionSample(op);
  return {
    key: actionKey(op),
    noun: op.noun,
    display: { label: op.createLabel, description: op.description },
    operation: {
      inputFields: op.inputFields,
      perform: async (z, bundle) => toActionResult(op, await runOperation(z, bundle, op)),
      sample,
      outputFields: outputFieldsFromSample(sample),
    },
  };
};

const toMap = (list, keyOf) =>
  list.reduce((acc, module) => {
    acc[keyOf(module)] = module;
    return acc;
  }, {});

const searches = toMap(operations.map(searchFor), (m) => m.key);
const creates = toMap(
  operations.filter((op) => op.createLabel).map(createFor),
  (m) => m.key,
);

const catalogModules = require('./catalog-modules');

// Zapier's publishing check (D004) wants every input key that ends in "_id" to be a dynamic
// dropdown. Session IDs can be picked from the account's search sessions. The other "_id"
// inputs are free-form values the user maps from an earlier step or types (a BatchData property
// ID, an investor ID, their own reference, a cloud credential ID), and no list exists for them.
// Those inputs use a "_ref" key in Zapier. The perform functions translate the key back, so the
// request that goes to BatchData is unchanged. The original key is still accepted.
// Help text for inputs whose label alone is not enough. Applied only when a field has none.
const FIELD_HELP = {
  property_type_detail: 'Optional. A more specific property type, for example Single Family. Leave empty to include all types in the category.',
  bedrooms_min: 'Minimum number of bedrooms. Leave empty for no minimum.',
  bedrooms_max: 'Maximum number of bedrooms. Leave empty for no maximum.',
  bathrooms_min: 'Minimum number of bathrooms. Leave empty for no minimum.',
  bathrooms_max: 'Maximum number of bathrooms. Leave empty for no maximum.',
  year_built_min: 'Earliest year built, for example 1980.',
  year_built_max: 'Latest year built, for example 2020.',
  living_area_min: 'Minimum living area in square feet.',
  living_area_max: 'Maximum living area in square feet.',
  lot_size_acres_min: 'Minimum lot size in acres, for example 0.25.',
  lot_size_acres_max: 'Maximum lot size in acres.',
  estimated_value_min: 'Minimum estimated property value in US dollars.',
  estimated_value_max: 'Maximum estimated property value in US dollars.',
  equity_percent_min: 'Minimum owner equity as a percent of value, from 0 to 100.',
  equity_percent_max: 'Maximum owner equity as a percent of value, from 0 to 100.',
  last_sale_date_from: 'Earliest last-sale date. Format: YYYY-MM-DD.',
  last_sale_date_to: 'Latest last-sale date. Format: YYYY-MM-DD.',
  city: 'City name, for example Phoenix. Optional when the ZIP code is given.',
  zip: '5-digit ZIP code, for example 85008.',
  property_id: 'The BatchData property ID, for example from a Find Properties step. Use it instead of an address.',
  address_hash: 'The BatchData address hash for the property. Use it instead of an address.',
  apn: 'Assessor parcel number. Use it together with the county FIPS code.',
  find_by: 'Choose how to identify the property: by address, by APN, or by owner name and mailing address.',
  county_fips_code: '5-digit county FIPS code, for example 04013 for Maricopa County, AZ.',
  county: 'County name, for example Maricopa.',
  apn_state: 'Two-letter state code of the parcel, for example AZ.',
  owner_last_name: 'Last name of the property owner.',
  owner_first_name: 'First name of the property owner.',
  mailing_city: 'City of the owner mailing address.',
  mailing_zip: '5-digit ZIP code of the owner mailing address.',
  email: 'The email address to look up.',
  permit_status: 'Only return permits with this status, for example Final or Issued. Leave empty for all.',
  permit_type: 'Only return permits whose type contains this text, for example Roofing.',
  description_contains: 'Only return permits whose description contains this text.',
  tags: 'Only return permits with any of these tags. Enter one value per line or separate values with commas.',
  job_value_min: 'Minimum permit job value in US dollars.',
  job_value_max: 'Maximum permit job value in US dollars.',
  usps_verified_only: 'Choose Yes to return only addresses that USPS has verified.',
  request_id: 'Optional. Echoed back in the result so you can match it to your own record.',
  latitude: 'Latitude in decimal degrees, for example 33.47865.',
  longitude: 'Longitude in decimal degrees, for example -112.03029.',
  property_only: 'Choose Yes to return only addresses that are properties.',
  investor_id: 'The BatchData investor ID, for example from a Find Investors (Buy Box) step.',
  include_child_entities: 'Choose Yes to also include properties held by entities related to this investor.',
  take: 'Maximum number of results to return. Use a small number to limit cost and task usage.',
  skip: 'Number of results to skip before returning results. Use it to page through a long list.',
  properties: 'Add one row per property, with its address or other identifying details. You are billed for each row.',
  addresses: 'Add one row per address. You are billed for each row.',
  street: 'Street address including house number, for example 2800 N 24th St.',
  state: 'Two-letter state code, for example AZ.',
  delivery_type: 'Where BatchData sends monitor events. Only stream delivery is supported here.',
  kinesis_stream_name: 'Name of your Amazon Kinesis data stream.',
  kinesis_access_key_id: 'Access key ID of the IAM user that is allowed to write to the stream.',
  kinesis_secret_access_key: 'Secret access key for that IAM user. It is sent to BatchData to deliver events.',
  event_hub_name: 'Name of your Azure Event Hub.',
  event_hub_namespace: 'Fully qualified namespace, for example example.servicebus.windows.net.',
  event_hub_client_id: 'Client ID of your Microsoft Entra application.',
  event_hub_tenant_id: 'Tenant ID of your Microsoft Entra directory.',
  event_hub_client_secret: 'Client secret of your Microsoft Entra application. It is sent to BatchData to deliver events.',
  method: 'The HTTP method to use.',
};

const DROPDOWN_FIELDS = { session_id: 'new_search_session.id.id' };
const renamedKey = (key) => (/_id$/.test(key) ? key.replace(/_id$/, '_ref') : key);

const restoreKeys = (inputData, renames) => {
  const out = { ...(inputData || {}) };
  for (const [from, to] of renames) {
    if (Object.prototype.hasOwnProperty.call(out, from)) {
      if (out[to] === undefined || out[to] === '' || out[to] === null) out[to] = out[from];
      delete out[from];
    }
  }
  return out;
};

const normalizeAll = (map) => {
  for (const module of Object.values(map)) {
    const renames = [];
    const walk = (fields) => (fields || []).forEach((field) => {
      if (Array.isArray(field.choices)) {
        field.choices = field.choices.map((choice) =>
          typeof choice === 'string' ? choice : { value: choice.value, sample: choice.sample || choice.value, label: choice.label || choice.value });
      }
      if (!field.helpText && !field.children && FIELD_HELP[field.key]) field.helpText = FIELD_HELP[field.key];
      if (DROPDOWN_FIELDS[field.key] && !field.dynamic) field.dynamic = DROPDOWN_FIELDS[field.key];
      if (!field.dynamic && !field.children && /_id$/.test(field.key)) {
        const next = renamedKey(field.key);
        renames.push([next, field.key]);
        field.key = next;
      }
      if (field.children) walk(field.children);
    });
    walk(module.operation.inputFields);
    if (renames.length > 0) {
      for (const name of ['perform', 'performSubscribe']) {
        const original = module.operation[name];
        if (typeof original === 'function') {
          module.operation[name] = (z, bundle) => original(z, { ...bundle, inputData: restoreKeys(bundle.inputData, renames) });
        }
      }
    }
  }
  return map;
};

module.exports = {
  searches: normalizeAll({ ...searches, ...catalogModules.searches }),
  creates: normalizeAll({ ...creates, ...catalogModules.creates }),
  triggers: normalizeAll(catalogModules.triggers),
  actionKey,
};
