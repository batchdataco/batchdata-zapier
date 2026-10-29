'use strict';

const { isPlainObject } = require('./common');

const labelFor = (key) =>
  key
    .replace(/\[\]/g, '__')
    .split('__')
    .filter(Boolean)
    .map((part) => part.replace(/^_/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const typeOf = (value) => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return 'string';
};

// Flatten a sample record into Zapier outputFields (nested keys use "__", arrays use "[]").
const outputFieldsFromSample = (sample) => {
  const fields = [];
  const walk = (value, prefix) => {
    if (isPlainObject(value)) {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, prefix ? `${prefix}__${key}` : key);
      }
    } else if (Array.isArray(value)) {
      const first = value[0];
      if (isPlainObject(first)) {
        for (const [key, entry] of Object.entries(first)) {
          if (!isPlainObject(entry) && !Array.isArray(entry)) {
            fields.push({ key: `${prefix}[]${key}`, label: labelFor(`${prefix}[]${key}`), type: typeOf(entry) });
          }
        }
      }
    } else if (value !== null && value !== undefined) {
      fields.push({ key: prefix, label: labelFor(prefix), type: typeOf(value) });
    }
  };
  walk(sample, '');
  return fields;
};

module.exports = { outputFieldsFromSample, labelFor };
