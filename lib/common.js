'use strict';

const { FORBIDDEN_BODY_KEYS } = require('./constants');

class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InputError';
  }
}

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlank = (value) => value === undefined || value === null || value === '';

// Deep merge where `override` wins on conflict. Arrays are replaced.
const deepMerge = (base, override) => {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

// Remove webhookUrl / errorWebhookUrl at any depth.
const stripForbiddenKeys = (value) => {
  if (Array.isArray(value)) return value.map(stripForbiddenKeys);
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_BODY_KEYS.includes(key)) continue;
      out[key] = stripForbiddenKeys(entry);
    }
    return out;
  }
  return value;
};

const removeEmpty = (value) => {
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isBlank(entry)) continue;
    if (isPlainObject(entry)) {
      const nested = removeEmpty(entry);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
      continue;
    }
    out[key] = entry;
  }
  return out;
};

const parseJsonObject = (raw, label) => {
  if (isBlank(raw)) return {};
  if (isPlainObject(raw)) return raw;
  let parsed;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new InputError(`${label} is not valid JSON`);
    }
  }
  if (!isPlainObject(parsed)) {
    throw new InputError(`${label} must be a JSON object`);
  }
  return parsed;
};

const splitPhoneNumbers = (raw) =>
  (Array.isArray(raw) ? raw.join(',') : String(raw === undefined || raw === null ? '' : raw))
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const toDateOnly = (value) => {
  if (isBlank(value)) return undefined;
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (!match) throw new InputError(`"${text}" is not a valid date. Use YYYY-MM-DD.`);
  return match[1];
};

const asList = (value) => {
  if (isBlank(value)) return [];
  if (Array.isArray(value)) return value.filter((entry) => !isBlank(entry));
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

module.exports = {
  InputError,
  isPlainObject,
  isBlank,
  deepMerge,
  stripForbiddenKeys,
  removeEmpty,
  parseJsonObject,
  splitPhoneNumbers,
  toDateOnly,
  asList,
};
