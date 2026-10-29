'use strict';
// Builds the Zapier searches, creates and triggers for the shared catalog (see lib/catalog.json).

const crypto = require('crypto');
const catalog = require('./catalog.json');
const engine = require('./engine');
const { API_HOST } = require('./constants');
const { outputFieldsFromSample } = require('./outputFields');

const { InputError, buildRequest, extractResult, checkApiRequest } = engine;

// Zapier requires {value, sample, label} for labelled choices.
const normalizeChoices = (choices) =>
  choices.map((choice) =>
    typeof choice === 'string' ? choice : { value: choice.value, sample: choice.value, label: choice.label || choice.value },
  );

const toInputField = (field, op) => {
  const out = { key: field.key, label: field.label };
  switch (field.type) {
    case 'rows':
      out.children = field.rowFields.map((child) => toInputField(child, op));
      break;
    case 'integer':
      out.type = 'integer';
      break;
    case 'number':
      out.type = 'number';
      break;
    case 'boolean':
      out.type = 'boolean';
      break;
    case 'password':
      out.type = 'password';
      break;
    case 'json':
    case 'text':
      out.type = 'text';
      break;
    case 'list':
      out.type = 'string';
      out.list = true;
      break;
    default:
      out.type = 'string';
  }
  if (field.required) out.required = true;
  if (field.default !== undefined) out.default = String(field.default);
  if (field.choices) out.choices = normalizeChoices(field.choices);
  const extra = [];
  if (field.help) extra.push(field.help);
  if (field.type === 'date') extra.push('Format: YYYY-MM-DD.');
  if (field.type === 'json') extra.push('Enter a JSON object.');
  if (field.type === 'list' && !field.choices) extra.push('Enter one value per line or separate values with commas.');
  if (field.type === 'rows') out.label = `${field.label} (one row each, up to ${field.max})`;
  else if (extra.length > 0) out.helpText = extra.join(' ');
  if (field.dynamic) out.dynamic = field.dynamic;
  if (field.type === 'rows') {
    out.required = Boolean(field.required);
  }
  return out;
};

const inputFieldsFor = (op) =>
  op.fields.map((field) => {
    const converted = toInputField(field, op);
    if (op.dynamic && field.in === 'path') converted.dynamic = `${op.dynamic}.id.id`;
    return converted;
  });

const wrap = (z, error) => {
  if (error instanceof InputError) return new z.errors.Error(error.message, 'InvalidInput', 400);
  return error;
};

// One API call for a catalog op. Returns the extracted records.
const callCatalogOp = async (z, bundle, op) => {
  const input = bundle.inputData || {};
  let request;
  try {
    request = buildRequest(op, input);
  } catch (error) {
    throw wrap(z, error);
  }
  const options = {
    url: `${API_HOST}${request.path}`,
    method: request.method,
    headers: { Accept: 'application/json' },
    params: request.qs,
  };
  if (request.body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = request.body;
  }
  const response = await z.request(options);
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  return extractResult(op, data, input);
};

const outputFieldsOf = (op) => outputFieldsFromSample(op.sample);

const searchFor = (op) => ({
  key: op.key,
  noun: op.noun,
  display: { label: op.label, description: op.description },
  operation: {
    inputFields: inputFieldsFor(op),
    perform: (z, bundle) => callCatalogOp(z, bundle, op),
    sample: op.sample,
    outputFields: outputFieldsOf(op),
  },
});

const createFor = (op) => ({
  key: op.key === 'reverse_skip_trace' ? `${op.key}_action` : op.key,
  noun: op.noun,
  display: { label: op.label, description: op.description },
  operation: {
    inputFields: inputFieldsFor(op),
    perform: async (z, bundle) => {
      const records = await callCatalogOp(z, bundle, op);
      return records.length > 0 ? records[0] : { matched: false };
    },
    sample: op.sample,
    outputFields: outputFieldsOf(op),
  },
});

// ------------------------------------------------------------------ polling triggers
const sortNewestFirst = (records, key) =>
  key ? [...records].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || ''))) : records;

const pollingTrigger = (op) => ({
  key: op.key,
  noun: op.noun,
  display: { label: op.label, description: op.description },
  operation: {
    type: 'polling',
    inputFields: inputFieldsFor(op),
    perform: async (z, bundle) => {
      const records = await callCatalogOp(z, bundle, op);
      return sortNewestFirst(records, op.sortDesc).map((record) => ({
        ...record,
        id: record.id !== undefined ? record.id : record._id,
      }));
    },
    sample: op.sample,
    outputFields: outputFieldsOf(op),
  },
});

// ------------------------------------------------------------------ REST hook trigger
const eventId = (body) => {
  if (body && typeof body === 'object') {
    for (const key of ['id', 'eventId', 'event_id']) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== '') return String(body[key]);
    }
  }
  return crypto.createHash('sha1').update(JSON.stringify(body || {})).digest('hex');
};

const hookTrigger = (op) => ({
  key: op.key,
  noun: op.noun,
  display: { label: op.label, description: op.description },
  operation: {
    type: 'hook',
    inputFields: inputFieldsFor(op),
    performSubscribe: async (z, bundle) => {
      const subscribeOp = {
        ...op,
        fields: op.fields,
        http: { method: 'POST', path: op.http.path },
        fixed: [
          { path: 'deliveryConfig.type', value: 'webhook' },
          { path: 'deliveryConfig.url', value: bundle.targetUrl },
        ],
        result: { compose: { subscriptionId: op.http.idPath } },
      };
      const [created] = await callCatalogOp(z, { inputData: bundle.inputData }, subscribeOp).catch((error) => {
        throw error;
      });
      return { subscriptionId: created.subscriptionId };
    },
    performUnsubscribe: async (z, bundle) => {
      const id = bundle.subscribeData && bundle.subscribeData.subscriptionId;
      if (!id) return {};
      const response = await z.request({
        url: `${API_HOST}${op.http.deletePath.replace('{id}', encodeURIComponent(String(id)))}`,
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        skipThrowForStatus: true,
      });
      return { removed: response.status < 300 || response.status === 404 };
    },
    perform: async (z, bundle) => {
      const body = bundle.cleanedRequest || bundle.rawRequest || {};
      const data = typeof body === 'object' && body !== null ? body : {};
      const record = { ...data, id: eventId(data) };
      const wanted = engine.toBoolean((bundle.inputData || {}).include_property) === true;
      if (wanted && op.hydrate && data[op.hydrate.idField]) {
        try {
          const response = await z.request({
            url: `${API_HOST}${op.hydrate.path}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: { requests: [{ propertyId: String(data[op.hydrate.idField]) }] },
          });
          const found = engine.getPath(response.data || {}, op.hydrate.listPath);
          if (Array.isArray(found) && found.length > 0) record[op.hydrate.into] = found[0];
        } catch (error) {
          record.propertyLookupError = String(error && error.message ? error.message : error).slice(0, 300);
        }
      }
      return [record];
    },
    performList: () => [{ ...op.sample }],
    sample: op.sample,
    outputFields: outputFieldsOf(op),
  },
});

// ------------------------------------------------------------------ generic API request
const apiRequestCreate = () => {
  const spec = catalog.apiRequest;
  return {
    key: spec.key,
    noun: spec.noun,
    display: { label: spec.label, description: spec.description },
    operation: {
      inputFields: [
        { key: 'method', label: 'Method', type: 'string', required: true, default: 'GET', choices: normalizeChoices(spec.methods.map((value) => ({ value, label: value }))) },
        { key: 'path', label: 'Path', type: 'string', required: true, helpText: 'Starts with /api/, for example /api/v2/property/search-sessions.' },
        { key: 'query', label: 'Query Parameters (JSON)', type: 'text', helpText: 'Optional JSON object, for example {"take": 5}.' },
        { key: 'body', label: 'Request Body (JSON)', type: 'text', helpText: 'Optional JSON object. Callback URL keys are removed.' },
      ],
      perform: async (z, bundle) => {
        const input = bundle.inputData || {};
        let path;
        let qs;
        let body;
        try {
          path = checkApiRequest(spec.guard, input.method, input.path);
          qs = engine.parseJsonObject(input.query, 'Query Parameters');
          body = engine.parseJsonObject(input.body, 'Request Body');
        } catch (error) {
          throw wrap(z, error);
        }
        const method = String(input.method || 'GET').toUpperCase();
        const options = { url: `${API_HOST}${path}`, method, headers: { Accept: 'application/json' }, params: engine.strip(qs || {}) };
        if (body && method !== 'GET' && method !== 'DELETE') {
          options.headers['Content-Type'] = 'application/json';
          options.body = engine.strip(body);
        }
        const response = await z.request(options);
        return { statusCode: response.status, body: response.data };
      },
      sample: spec.sample,
      outputFields: [{ key: 'statusCode', label: 'Status Code', type: 'integer' }],
    },
  };
};

const toMap = (list) => list.reduce((acc, item) => ({ ...acc, [item.key]: item }), {});

const searches = toMap(catalog.ops.filter((op) => op.kind === 'search' && !op.noZapier).map(searchFor));
const creates = toMap([
  ...catalog.ops.filter((op) => op.kind === 'action').map(createFor),
  ...catalog.ops.filter((op) => op.kind === 'search' && op.action).map(createFor),
  apiRequestCreate(),
]);
const triggers = toMap(
  catalog.triggers.map((trigger) => (trigger.mode === 'hook' ? hookTrigger(trigger) : pollingTrigger(trigger))),
);

module.exports = { searches, creates, triggers, callCatalogOp, eventId, catalog };
