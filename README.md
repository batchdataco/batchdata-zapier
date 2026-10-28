# BatchData for Zapier

Zapier integration for the [BatchData](https://batchdata.io) API: search properties, look up a property record, skip trace owners, verify addresses, and check phone numbers for reachability, Do Not Call (DNC) and TCPA litigator status.

Support: support@batchservice.com

> **Status: v0.1, not yet published.** The code passes its local tests with mocked HTTP. It has not been pushed to Zapier or run against the live BatchData API. See [Publishing](#publishing) and [What was and was not verified](#what-was-and-was-not-verified).

## Authentication

API key. The user pastes a BatchData API token; the app sends it as `Authorization: Bearer <token>`.

**Connection test.** The test posts an empty batch (`{"requests": []}`) to `POST /api/v1/address/verify`. A valid token gets HTTP 400 (empty batch, treated as success). An invalid token gets 401 or 403 (shown as an error). The 400 is rejected before any lookup, so no address is processed. That a rejected request is not billed is assumed, not confirmed in the API spec; the BatchData API team should confirm it, or name a zero-cost auth-check endpoint to use instead.

## What it does

Every operation is a **Search** ("Find ...") so it can feed later Zap steps. Operations that act on one input also have an **Action** with the same inputs, which returns a single object.

| Zapier module | Type | Endpoint | Billing (per the API docs) |
| --- | --- | --- | --- |
| Find Properties | Search | `POST /api/v1/property/search` | Per returned property record. A count-only request (Max Results = 0) is billed as one record. |
| Look Up Property | Search, Action | `POST /api/v1/property/lookup/all-attributes` | Per returned property record. "Include Contact Info" adds contact-enrichment cost. |
| Skip Trace Property Owner | Search, Action | `POST /api/v1/property/skip-trace` (V1) or `/api/v3/property/skip-trace` (V3) | Per matched result. |
| Verify Address | Search, Action | `POST /api/v1/address/verify` | Per submitted address. |
| Verify Phone Number | Search, Action | `POST /api/v1/phone/verification` | Per submitted phone number. |
| Check Do Not Call (DNC) Status | Search, Action | `POST /api/v1/phone/dnc` | Per submitted phone number. |
| Check TCPA Litigator Status | Search, Action | `POST /api/v1/phone/tcpa` | Per submitted phone number. |

Each run makes one API call. Find Properties adds `Search Meta Result Count` and `Search Meta Results Found` to each record. With Max Results = 0 it returns one record holding only those counts.

Find Properties is a Search only: an Action that returns up to 100 records does not fit a Zapier action's single-object result.

### Skip trace and the TCPA setting

BatchData's two skip trace versions differ: V1 leaves TCPA-flagged phone numbers out by default, V3 includes them. This app always sends `includeTCPABlacklistedPhones` explicitly, so both versions behave the same. **Include TCPA-Flagged Phones** is **off** by default. Turn it on only with a documented compliance basis. Flagged numbers carry `tcpa: true` in the result.

Searches return one record per person. The Action returns one object with `persons[]`, `personCount` and `matched`.

### Phone compliance

Phone results are a point-in-time answer. Re-check before each campaign. You are responsible for meeting TCPA, DNC and other calling rules in your jurisdiction.

## Not included in v0.1

- **Triggers.** BatchData's event delivery today is search sessions (billed per record while they drain a frozen result set, capped per team, and with no way to clean up when a Zap is turned off) and the V2 property-subscription webhook (payload not yet documented). Neither is safe to turn into a REST hook yet. A trigger is planned once there is a documented, cleanly cancellable event source.
- **Callback URLs** (`webhookUrl`, `errorWebhookUrl`). These apply only to BatchData's asynchronous requests, not the synchronous endpoints used here. They are never exposed and are removed from the Additional Search Criteria JSON.
- **Wallet and account-balance endpoints.** Never exposed.
- **Custom API call.** Zapier has no generic request module for a custom app. Use Zapier's own Webhooks or API Request step with a BatchData token for other endpoints.
- Reverse skip trace, permits, investor and monitor endpoints, and the asynchronous endpoints are follow-ups.

## Development

```bash
npm install
npm test            # node:test unit tests, plus the Zapier harness tests once packages are installed
npx zapier validate # schema and publishing checks
npx zapier test     # the same tests through the Zapier CLI
```

Layout:

```
index.js            app definition
authentication.js   API key auth and connection test
middleware.js       Bearer header and error mapping (401 reconnect, 429 throttle, 4xx/5xx messages)
lib/operations.js   the 7 operations: fields, request builders, response extraction
lib/builders.js     pure request body builders
lib/modules.js      turns operations into searches and actions
samples/            trimmed sample records (regenerate with `npm run samples`)
test/               mocked-HTTP tests; fixtures are derived from the BatchData OpenAPI schemas
```

`lib/builders.js` and `lib/common.js` mirror the n8n node's builders so the integrations behave the same.

## Publishing

1. Create a Zapier developer account with the BatchData company email.
2. Authenticate the Zapier CLI with that account (`npx zapier login`).
3. `npx zapier register "BatchData"`, then `npx zapier push`. Commit the generated `.zapierapprc`.
4. Add a logo (256x256 PNG) and the app description in the Zapier platform UI, add a test account, and submit for review (`npx zapier promote 0.1.0`).
5. Zapier's review needs a working test account, so BatchData must provide an API token for it.

## What was and was not verified

- Unit tests with mocked HTTP: request bodies, endpoints, response mapping, error mapping, and sample/outputFields consistency. These pass.
- `zapier validate` and `zapier test` have not been run, because the Zapier packages could not be installed in the build environment. The harness tests in `test/zapier-app.test.js` run only once the packages are installed. Run both before pushing.
- Nothing has been called against the live BatchData API. The mocked tests prove request shape and output mapping from the OpenAPI schemas, not live behavior.
