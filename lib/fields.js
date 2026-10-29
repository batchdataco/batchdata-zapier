'use strict';

const { QUICKLISTS, LOOKUP_DATASETS } = require('./constants');

const addressFields = (prefix = '', labelPrefix = '') => [
  { key: `${prefix}street`, label: `${labelPrefix}Street`, type: 'string', helpText: 'Street address including house number, for example 2800 N 24th St.' },
  { key: `${prefix}city`, label: `${labelPrefix}City`, type: 'string' },
  { key: `${prefix}state`, label: `${labelPrefix}State`, type: 'string', helpText: 'Two-letter state code, for example AZ.' },
  { key: `${prefix}zip`, label: `${labelPrefix}ZIP Code`, type: 'string' },
];

const requestIdField = {
  key: 'request_id',
  label: 'Your Reference ID',
  type: 'string',
  helpText: 'Optional. Echoed back in the result so you can match it to your own record.',
};

const quickListChoices = QUICKLISTS;
const datasetChoices = LOOKUP_DATASETS.filter((entry) => entry !== 'parcel-boundary');

const yesNoAny = (key, label, helpText) => ({
  key,
  label,
  type: 'string',
  choices: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
  ],
  helpText: helpText || 'Leave empty to not filter on this.',
});

const rangeFields = (base, label, type = 'number') => [
  { key: `${base}_min`, label: `${label} (Min)`, type },
  { key: `${base}_max`, label: `${label} (Max)`, type },
];

module.exports = {
  addressFields,
  requestIdField,
  quickListChoices,
  datasetChoices,
  yesNoAny,
  rangeFields,
};
