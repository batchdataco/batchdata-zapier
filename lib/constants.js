'use strict';

const API_HOST = 'https://api.batchdata.com';
const SUPPORT_EMAIL = 'support@batchservice.com';

const QUICKLISTS = [
  'absentee-owner',
  'active-auction',
  'active-listing',
  'canceled-listing',
  'cash-buyer',
  'corporate-owned',
  'expired-listing',
  'failed-listing',
  'fix-and-flip',
  'free-and-clear',
  'for-sale-by-owner',
  'has-hoa',
  'has-hoa-fees',
  'high-equity',
  'inherited',
  'involuntary-lien',
  'in-state-absentee-owner',
  'listed-below-market-price',
  'low-equity',
  'mailing-address-vacant',
  'notice-of-default',
  'notice-of-lis-pendens',
  'notice-of-sale',
  'on-market',
  'out-of-state-absentee-owner',
  'out-of-state-owner',
  'owner-occupied',
  'pending-listing',
  'preforeclosure',
  'recently-sold',
  'same-property-and-mailing-address',
  'senior-owner',
  'tax-default',
  'tired-landlord',
  'trust-owned',
  'unknown-equity',
  'vacant',
  'vacant-lot',
];

const LOOKUP_DATASETS = [
  'basic',
  'comps',
  'batchrank',
  'contact',
  'core',
  'deed',
  'demographic',
  'foreclosure',
  'listing',
  'mortgage-liens',
  'owner',
  'parcel-boundary',
  'permit',
  'quicklist',
  'valuation',
];

const FORBIDDEN_BODY_KEYS = ['webhookUrl', 'errorWebhookUrl'];

module.exports = {
  API_HOST,
  SUPPORT_EMAIL,
  QUICKLISTS,
  LOOKUP_DATASETS,
  FORBIDDEN_BODY_KEYS,
};
