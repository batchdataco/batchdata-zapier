'use strict';
// Catalog engine shared (copied) by the Zapier app and the Make test-suite. The n8n node has a typed port
// of the same logic in nodes/BatchData/catalogEngine.ts. Pure functions, no I/O.

const FORBIDDEN_KEYS = ['webhookUrl', 'errorWebhookUrl'];

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

const isPlain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

const deepMerge = (base, override) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlain(out[k]) && isPlain(v) ? deepMerge(out[k], v) : v;
  }
  return out;
};

const strip = (v) => {
  if (Array.isArray(v)) return v.map(strip);
  if (isPlain(v)) {
    const out = {};
    for (const [k, e] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.some((f) => f.toLowerCase() === k.toLowerCase())) continue;
      out[k] = strip(e);
    }
    return out;
  }
  return v;
};

const removeEmpty = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    if (isPlain(v)) {
      const n = removeEmpty(v);
      if (Object.keys(n).length === 0) continue;
      out[k] = n;
    } else out[k] = v;
  }
  return out;
};

const getPath = (obj, path) => {
  let cur = obj;
  for (const seg of path.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[seg];
  }
  return cur;
};

const setPath = (obj, path, value) => {
  const segs = path.split('.');
  let cur = obj;
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (last) {
      cur[seg] = value;
      return;
    }
    if (!isPlain(cur[seg]) && !Array.isArray(cur[seg])) cur[seg] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    cur = cur[seg];
  });
};

const toBoolean = (v) => {
  if (v === true || v === 'true' || v === 'yes' || v === 'Yes' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 'no' || v === 'No' || v === 0 || v === '0') return false;
  return undefined;
};

const asList = (v) => {
  if (Array.isArray(v)) return v.map((e) => String(e).trim()).filter(Boolean);
  if (isBlank(v)) return [];
  return String(v).split(/[\n,]+/).map((e) => e.trim()).filter(Boolean);
};

const parseJsonObject = (v, label) => {
  if (isBlank(v)) return undefined;
  if (isPlain(v)) return v;
  let parsed;
  try {
    parsed = JSON.parse(String(v));
  } catch (e) {
    throw new InputError(`${label} is not valid JSON`);
  }
  if (!isPlain(parsed)) throw new InputError(`${label} must be a JSON object`);
  return parsed;
};

const coerce = (field, raw) => {
  if (isBlank(raw) && raw !== false) return undefined;
  switch (field.type) {
    case 'string':
    case 'text':
    case 'password':
      return String(raw).trim();
    case 'integer':
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n) || (field.type === 'integer' && !Number.isInteger(n))) {
        throw new InputError(`${field.label} must be a ${field.type === 'integer' ? 'whole ' : ''}number`);
      }
      if (field.min !== undefined && n < field.min) throw new InputError(`${field.label} must be at least ${field.min}`);
      if (field.max !== undefined && n > field.max) throw new InputError(`${field.label} must be at most ${field.max}`);
      return n;
    }
    case 'boolean': {
      const b = toBoolean(raw);
      if (b === undefined) throw new InputError(`${field.label} must be yes or no`);
      return b;
    }
    case 'choice': {
      const v = String(raw).trim();
      if (field.choices && !field.choices.some((c) => c.value === v)) throw new InputError(`${field.label}: "${v}" is not an allowed value`);
      return v;
    }
    case 'list': {
      const l = asList(raw);
      return l.length ? l : undefined;
    }
    case 'date': {
      const s = String(raw).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new InputError(`${field.label} must look like 2026-01-31`);
      return s;
    }
    case 'json':
      return parseJsonObject(raw, field.label);
    default:
      return raw;
  }
};

const resolveInput = (field, input) => {
  const raw = input[field.key];
  if (isBlank(raw) && raw !== false && field.default !== undefined) return field.default;
  return raw;
};

const buildRows = (field, rows) => {
  let list = rows;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch (e) { throw new InputError(`${field.label} must be a list of rows`); }
  }
  if (isPlain(list)) list = [list];
  if (!Array.isArray(list)) list = [];
  const out = [];
  for (const row of list) {
    if (!isPlain(row)) continue;
    const item = {};
    for (const rf of field.rowFields) {
      const v = coerce(rf, row[rf.key]);
      if (v !== undefined) setPath(item, rf.path, v);
    }
    const cleaned = removeEmpty(item);
    if (Object.keys(cleaned).length > 0) out.push(cleaned);
  }
  if (out.length === 0 && field.required) throw new InputError(`${field.label}: add at least one row`);
  if (field.max && out.length > field.max) throw new InputError(`${field.label}: at most ${field.max} rows per call (got ${out.length})`);
  return out;
};

// Build the HTTP request for a catalog op or trigger.
const buildRequest = (op, input = {}) => {
  const fields = op.fields || [];
  const body = {};
  const qs = Object.assign({}, op.fixedQuery || {});
  let path = op.http.path;
  const resolved = {};
  for (const f of fields) resolved[f.key] = resolveInput(f, input);
  const wire = fields.filter((f) => !f.local);

  if (op.requireOneOf && !op.requireOneOf.some((k) => !isBlank(resolved[k]))) {
    const labels = op.requireOneOf.map((k) => (fields.find((f) => f.key === k) || { label: k }).label);
    throw new InputError(`Fill in at least one of: ${labels.join(', ')}`);
  }

  const ordered = [...wire.filter((f) => f.first), ...wire.filter((f) => !f.first)];
  for (const f of ordered) {
    if (f.when && String(resolved[f.when.field]) !== String(f.when.equals)) continue;
    if (f.type === 'rows') {
      body && setPath(body, f.path, buildRows(f, resolved[f.key]));
      continue;
    }
    const v = coerce(f, resolved[f.key]);
    if (v === undefined) {
      if (f.required) throw new InputError(`${f.label} is required`);
      continue;
    }
    if (f.pattern && !new RegExp(f.pattern).test(String(v))) throw new InputError(`${f.label} has an invalid format`);
    if (f.in === 'path') {
      path = path.replace(/\{[^}]+\}/, encodeURIComponent(String(v)));
    } else if (f.in === 'query') {
      qs[f.qs || f.key] = v;
    } else if (f.type === 'json') {
      const existing = getPath(body, f.path);
      setPath(body, f.path, deepMerge(v, isPlain(existing) ? existing : {}));
    } else {
      setPath(body, f.path, v);
    }
  }
  for (const fx of op.fixed || []) setPath(body, fx.path, fx.value);
  const method = op.http.method;
  const hasBody = method !== 'GET' && method !== 'DELETE';
  return { method, path, qs, body: hasBody ? strip(body) : undefined };
};

// Turn an API response into a list of result records.
const extractResult = (op, response, input = {}) => {
  const r = op.result || {};
  const resp = isPlain(response) ? response : {};
  const attach = (item) => {
    for (const [k, p] of Object.entries(r.attach || {})) {
      const v = getPath(resp, p);
      if (v !== undefined) item[k] = v;
    }
    for (const [k, from] of Object.entries(r.idFrom || {})) {
      if (item[from] !== undefined) item[k] = item[from];
    }
    return item;
  };
  if (r.compose) {
    const out = {};
    for (const [k, p] of Object.entries(r.compose)) {
      const v = getPath(resp, p);
      out[k] = v === undefined ? null : v;
    }
    return [out];
  }
  if (r.static) {
    const out = { ...r.static };
    for (const [k, from] of Object.entries(r.echo || {})) out[k] = input[from];
    return [out];
  }
  if (r.item) {
    const v = getPath(resp, r.item);
    return isPlain(v) ? [attach({ ...v })] : [];
  }
  let arr = getPath(resp, r.list);
  if (!Array.isArray(arr)) arr = [];
  if (r.filter) arr = arr.filter((e) => getPath(e, r.filter.path) === r.filter.equals);
  return arr.map((e) => attach(isPlain(e) ? { ...e } : { value: e }));
};

// Guard for the generic API request action.
const checkApiRequest = (guard, method, rawPath) => {
  const path = String(rawPath || '').trim();
  const bad = (why) => new InputError(`That path is not allowed here (${why}).`);
  if (!path.startsWith(guard.mustStartWith)) throw bad(`it must start with ${guard.mustStartWith}`);
  if (/[?#\\%]/.test(path) || path.includes('..') || path.includes('//')) throw bad('no query string, encoding or relative segments');
  const lower = path.toLowerCase();
  for (const word of guard.blockedPathContains) if (lower.includes(word)) throw bad('account balance and billing endpoints are blocked');
  const segs = lower.split('/');
  for (const seg of guard.blockedPathSegments) if (segs.includes(seg)) throw bad('asynchronous callback endpoints are blocked');
  for (const w of guard.blockedWrites) {
    if (lower.includes(w.pathContains) && w.methods.includes(String(method).toUpperCase())) {
      throw bad('create monitors with the dedicated Create Property Monitor action or the New Property Monitor Event trigger');
    }
  }
  return path;
};

module.exports = {
  FORBIDDEN_KEYS, InputError, isPlain, isBlank, deepMerge, strip, removeEmpty, getPath, setPath, toBoolean, asList,
  parseJsonObject, coerce, buildRequest, extractResult, checkApiRequest,
};
