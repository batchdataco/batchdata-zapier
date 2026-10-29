# BatchData for Zapier

Zapier integration for the [BatchData](https://batchdata.io) API. It covers property search and lookup, skip tracing (V1 and V3), reverse skip trace, address tools, phone checks (reachability, DNC, TCPA), permits, investor buy box, search sessions and property monitors, with polling and instant (REST hook) triggers and a generic API request action.

Support: support@batchservice.com

> **Status: v0.4.0, pushed to Zapier as a private integration (app 248744), not yet submitted for public review.** It passes `zapier-platform validate` with no errors or warnings and its local tests. Most operations were smoke-tested live; monitors and the instant trigger were not (see [What was and was not verified](#what-was-and-was-not-verified)).

![BatchData](logo.png)

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

## Added in v0.2

Searches (return records to later steps) and actions (change something or send a batch):

| Zapier module | Type | Endpoint | Billing |
| --- | --- | --- | --- |
| Reverse Skip Trace (Phone or Email) | Search, Action | `POST /api/v3/property/reverse-skip-trace` | Per matched result. Flagged-phone setting always sent explicitly (default off). |
| Get Property Permits | Search | `POST /api/v2/property/get-property-permits` | Per the plan; see the module description. |
| Batch Skip Trace Properties (V3) | Action | `POST /api/v3/property/skip-trace` | Per matched result, up to 100 rows. |
| Batch Look Up Properties | Action | `POST /api/v1/property/lookup/all-attributes` | Per returned record, up to 100 rows. |
| Batch Verify Addresses | Action | `POST /api/v1/address/verify` | Per submitted address, up to 100 rows. |
| Autocomplete, Geocode, Reverse Geocode | Search | `POST /api/v1/address/...` | This call does not bill property records. |
| Find Investors (Buy Box), Get Investor Properties | Search | `POST /api/v2/investor/...` | See the module description. |
| List / Create or Advance / Delete Search Session | Search, Action | `/api/v2/property/search-sessions`, `POST /api/v1/property/search` | Creating or advancing a session bills each record delivered. Sessions are capped per team and need the search-sessions token ability. |
| Get / Create / Delete Property Monitor | Search, Action | `/api/v2/property-subscription` | Billed according to your plan (support@batchservice.com). |
| API Request (Advanced) | Action | any `/api/...` path | Depends on the endpoint called. |

Triggers:

| Trigger | Type | Notes |
| --- | --- | --- |
| New Search Session | Polling | Lists sessions. Free. |
| New Property Monitor | Polling | Lists monitors. |
| New Property in Search Session (Billed) | Polling | Advances a cursor-paginated session and returns the new records. Each record is billed. |
| New Property Monitor Event | Instant (REST hook) | See below. |

### Instant trigger: property monitor events

Turning the Zap on creates a V2 property subscription (monitor) whose delivery is `{type: "webhook", url: <the Zap's own hook URL>}`; turning it off deletes that subscription (`DELETE /api/v2/property-subscription/{id}`). The user cannot enter a callback URL anywhere. Each event is `{eventId, propertyId, parcelHash, addressHash, addedToSubscriptionIds, removedFromSubscriptionIds, propertyChangedAt, sentAt}`; `eventId` is the dedupe key. The event carries IDs only. Turn on **Include Property Record (Billed)** (off by default) to add the full record through a Property Lookup, which bills per matched property.

Monitor limits (also in every monitor module description): up to 5 monitors per team, monitors cannot be edited after creation, a new monitor can take up to 7 days to start delivering, and delivery is best effort (4 attempts per event). Because of the 5-monitor limit, avoid many Zaps that each create a monitor.

**Create Property Monitor** is limited to stream delivery (Kinesis or Azure Event Hubs). The webhook delivery option is used only by the trigger above.

### API Request (Advanced)

Sends any `/api/...` request with the connected token. It refuses, before any call is made: paths containing `wallet` (account balance and billing), asynchronous (`async`) endpoints, creating a monitor (use the dedicated module), non-`/api/` paths, traversal and encoded variants. `webhookUrl` and `errorWebhookUrl` keys are removed from the body at any depth.

## Not exposed

- **Callback URLs** (`webhookUrl`, `errorWebhookUrl`) on asynchronous requests. Never exposed and stripped from JSON inputs.
- **Wallet and billing endpoints.** Never exposed.
- **Asynchronous endpoints.** Not exposed.
- A **custom monitor webhook URL.** Only the trigger's own hook URL is ever used.

## Development

```bash
# Node 22 or newer is required by the Zapier CLI
npm install
npm test                      # node:test unit tests with mocked HTTP
npx zapier-platform validate  # schema and publishing checks
```

Layout:

```
index.js            app definition
authentication.js   API key auth and connection test
middleware.js       Bearer header and error mapping (401 reconnect, 429 throttle, 4xx/5xx messages)
lib/operations.js   the 7 operations: fields, request builders, response extraction
lib/builders.js     pure request body builders
lib/modules.js      turns operations into searches and actions, merges the catalog modules
lib/catalog.json    shared declarative catalog (v0.2 modules), identical in the n8n and Make repos
lib/catalog-modules.js  turns catalog entries into searches, creates and triggers
lib/engine.js       catalog request builder and response extractor (copy of shared/engine.cjs)
samples/            trimmed sample records (regenerate with `npm run samples`)
test/               mocked-HTTP tests; fixtures are derived from the BatchData OpenAPI schemas
```

`lib/builders.js` and `lib/common.js` mirror the n8n node's builders so the integrations behave the same.

## Publishing

Exact steps (the CLI needs Node 22 or newer). Use the Zapier developer account that will own the app. A deploy key is enough; no GitHub repository is needed.

```bash
cd batchdata-zapier
npm install
npx zapier-platform login               # interactive; or export ZAPIER_DEPLOY_KEY=<deploy key> for non-interactive use
npx zapier-platform register "BatchData"   # first time only; creates .zapierapprc (commit it)
npx zapier-platform validate
npm test
npx zapier-platform push                # uploads the version in package.json (0.4.0)
npx zapier-platform invite you@example.com   # optional: test with a few users first
npx zapier-platform promote 0.4.0       # starts review for public listing
```

Before promoting: add a test account (a sandbox API token from app.batchdata.com, which returns mock data at no cost), and review the listing text in the Zapier editor. The icon is `logo.png` (256x256, from the official BatchData logo). The first push must use a version that is not already live.

## What was and was not verified

Verified live against the production API with the real token (1 record per call): property search, lookup, skip trace V1 and V3, reverse skip trace (no match), address verify, DNC, permits, investor buy box and properties, geocode, reverse geocode, autocomplete, and the search-session create, list and delete lifecycle.

Not verified live (mocked only): property monitors and the instant trigger. The production token used gets 403 on the subscription endpoints. A sandbox token or a token with that ability is needed to verify create, list, delete and event delivery. The webhook delivery shape follows the BatchData product documentation.

Tests: unit tests with mocked HTTP cover request shape, response mapping, guards and hooks (`npm test`). An opt-in live smoke test calls each module once against the real API (`BATCHDATA_API_TOKEN=... npm run test:live`; calls are billed). `zapier-platform validate` passes with no errors, publishing tasks or warnings. See PUBLISH-CHECKLIST.md for the steps that need the Zapier web UI.

**Connection test.** `POST /api/v1/address/verify` with an empty `requests` array returns HTTP 400 ("The requests field is required.") for a valid token. Whether a rejected request is billed could not be proven; there is no zero-cost check for production tokens.

## License

The code in this repository is released under the MIT License (see `LICENSE`). The BatchData API and the data it returns are proprietary to BatchData (batchdata.io) and are subject to BatchData's terms of service; the MIT License does not cover them. Support: support@batchservice.com
