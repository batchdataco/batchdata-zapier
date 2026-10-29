'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { searches, creates } = require('../lib/modules');
const authentication = require('../authentication');

const root = path.join(__dirname, '..');
const allModules = [...Object.values(searches), ...Object.values(creates)];

const get = (obj, key) => {
  // Resolve "a__b" and "a[]b" output field keys against a sample.
  let current = obj;
  for (const part of key.replace(/\[\]/g, '__').split('__')) {
    if (Array.isArray(current)) current = current[0];
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
};

test('module inventory: 16 searches, 15 actions, 4 triggers', () => {
  assert.equal(Object.keys(searches).length, 16);
  assert.equal(Object.keys(creates).length, 15);
  assert.equal(Object.keys(require('../lib/modules').triggers).length, 4);
});

test('every module has labels, input fields with keys, and outputFields present in the sample', () => {
  for (const module of allModules) {
    assert.ok(module.key && module.noun && module.display.label && module.display.description, module.key);
    const keys = new Set();
    for (const field of module.operation.inputFields) {
      assert.ok(field.key && field.label, `${module.key} field`);
      assert.ok(!keys.has(field.key), `${module.key} duplicate field ${field.key}`);
      keys.add(field.key);
    }
    for (const field of module.operation.outputFields) {
      assert.notEqual(get(module.operation.sample, field.key), undefined, `${module.key} outputField ${field.key} not in sample`);
    }
    assert.ok(JSON.stringify(module.operation.sample).length < 5000, `${module.key} sample too large`);
  }
});

test('no callback fields and no wallet endpoints are exposed', () => {
  for (const module of allModules) {
    for (const field of module.operation.inputFields) {
      assert.ok(!/webhook|callback/i.test(field.key), field.key);
    }
  }
  const source = ['lib/operations.js', 'lib/builders.js', 'lib/execute.js'].map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  assert.ok(!/wallet/i.test(source.replace(/webhookUrl/g, '')));
});

test('billing is disclosed on every module description', () => {
  for (const module of allModules) {
    assert.match(module.display.description, /bill/i, module.key);
  }
});

test('skip trace exposes the TCPA toggle, off by default', () => {
  const field = searches.skip_trace.operation.inputFields.find((f) => f.key === 'include_tcpa_flagged');
  assert.equal(field.type, 'boolean');
  assert.notEqual(field.default, 'true');
});

test('authentication is a custom API key with a test function', () => {
  assert.equal(authentication.type, 'custom');
  assert.equal(authentication.fields[0].key, 'api_key');
  assert.equal(authentication.fields[0].type, 'password');
  assert.equal(typeof authentication.test, 'function');
});

test('repository text never mentions retired or sold product names', () => {
  const banned = [/batch\s*leads/i, /batch\s*dialer/i];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (['node_modules', '.git'].includes(entry.name)) return [];
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(root)) {
    if (file.endsWith('structure.test.js') || file.includes(`${path.sep}fixtures${path.sep}`)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) assert.ok(!pattern.test(text), `${file} matches ${pattern}`);
  }
});
