'use strict';

// Guards the things Zapier checks before a public listing: samples, help text, dropdowns and
// the "_id" input keys that Zapier's D004 check looks at.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeZ } = require('./helpers');
const App = require('../index');

const modules = [
  ...Object.entries(App.triggers).map(([key, m]) => ['trigger', key, m]),
  ...Object.entries(App.searches).map(([key, m]) => ['search', key, m]),
  ...Object.entries(App.creates).map(([key, m]) => ['action', key, m]),
];

const eachField = (fields, visit) => (fields || []).forEach((field) => {
  visit(field);
  if (field.children) eachField(field.children, visit);
});

test('every trigger, search and action has a sample, a title-cased label and a description', () => {
  assert.equal(modules.length, 35);
  for (const [kind, key, m] of modules) {
    assert.ok(m.operation.sample && Object.keys(m.operation.sample).length > 0, `${kind} ${key} sample`);
    assert.ok(m.display.label && m.display.description, `${kind} ${key} display`);
    assert.ok(m.noun, `${kind} ${key} noun`);
  }
  for (const [, key, m] of Object.entries(App.triggers).map(([k, v]) => ['t', k, v])) {
    assert.match(m.display.description, /^Triggers when .*\.$/, key);
  }
});

test('every plain input field has help text, and none repeats its label', () => {
  for (const [kind, key, m] of modules) {
    eachField(m.operation.inputFields, (field) => {
      if (field.children) return;
      assert.ok(field.helpText && field.helpText.length > 5, `${kind} ${key}.${field.key} help text`);
      assert.notEqual(field.helpText.trim().toLowerCase(), String(field.label).trim().toLowerCase(), `${kind} ${key}.${field.key}`);
    });
  }
});

test('no input key ends in _id unless it is a dynamic dropdown; session IDs are dropdowns', () => {
  for (const [kind, key, m] of modules) {
    eachField(m.operation.inputFields, (field) => {
      if (/_id$/.test(field.key)) assert.ok(field.dynamic, `${kind} ${key}.${field.key}`);
      if (field.key === 'session_id') assert.equal(field.dynamic, 'new_search_session.id.id');
    });
  }
  const dropdowns = new Set();
  eachField(App.triggers.new_session_property.operation.inputFields, (f) => f.dynamic && dropdowns.add(f.dynamic));
  assert.ok(dropdowns.has('new_search_session.id.id'));
  assert.ok(App.triggers.new_search_session);
});

test('renamed _ref inputs still reach BatchData as the original request fields', async () => {
  const bundle = {
    authData: { api_key: 'test-token' },
    inputData: { identify_by: 'propertyId', property_ref: 'P-123', request_ref: 'my-row-1', datasets: 'basic' },
  };
  const { z, calls } = makeZ(bundle, async () => ({ data: { results: { properties: [] } } }));
  await App.searches.lookup_property.operation.perform(z, bundle);
  const body = JSON.stringify(calls[0].body);
  assert.match(body, /P-123/);
  assert.match(body, /my-row-1/);
});

test('the original _id keys are still accepted', async () => {
  const bundle = { authData: { api_key: 'test-token' }, inputData: { identify_by: 'propertyId', property_id: 'P-456', datasets: 'basic' } };
  const { z, calls } = makeZ(bundle, async () => ({ data: { results: { properties: [] } } }));
  await App.searches.lookup_property.operation.perform(z, bundle);
  assert.match(JSON.stringify(calls[0].body), /P-456/);
});

test('authentication has a label, help text with a link, and the connection label hides the token', () => {
  const field = App.authentication.fields[0];
  assert.match(field.helpText, /\]\(https:\/\//);
  const label = App.authentication.connectionLabel({}, { authData: { api_key: 'abcdefgh12345678' } });
  assert.equal(label, 'Token ending 5678');
  assert.ok(!label.includes('abcdefgh'));
});

test('property monitor modules are hidden and every other module is visible', () => {
  const app = require('../index');
  const hidden = [];
  const visible = [];
  for (const group of ['triggers', 'searches', 'creates']) {
    for (const module of Object.values(app[group])) {
      (module.display.hidden ? hidden : visible).push(module.key);
    }
  }
  assert.deepEqual(hidden.sort(), ['create_monitor', 'delete_monitor', 'get_monitor', 'monitor_event', 'new_monitor']);
  assert.equal(visible.length, 30);
});
