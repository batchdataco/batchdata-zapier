'use strict';

const { version } = require('./package.json');
const { version: platformVersion } = require('zapier-platform-core');

const authentication = require('./authentication');
const { addBearerToken, handleErrors } = require('./middleware');
const { searches, creates, triggers } = require('./lib/modules');

module.exports = {
  version,
  platformVersion,
  flags: { cleanInputData: false },
  authentication,
  beforeRequest: [addBearerToken],
  afterResponse: [handleErrors],
  triggers,
  searches,
  creates,
};
