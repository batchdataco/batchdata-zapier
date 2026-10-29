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
const normalizeAll = (map) => {
  for (const module of Object.values(map)) {
    const walk = (fields) => (fields || []).forEach((field) => {
      if (Array.isArray(field.choices)) {
        field.choices = field.choices.map((choice) =>
          typeof choice === 'string' ? choice : { value: choice.value, sample: choice.sample || choice.value, label: choice.label || choice.value });
      }
      if (field.children) walk(field.children);
    });
    walk(module.operation.inputFields);
  }
  return map;
};

module.exports = {
  searches: normalizeAll({ ...searches, ...catalogModules.searches }),
  creates: normalizeAll({ ...creates, ...catalogModules.creates }),
  triggers: normalizeAll(catalogModules.triggers),
  actionKey,
};
