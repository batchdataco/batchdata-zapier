# Zapier public-review checklist: BatchData (app 248744)

State as of **v0.4.0** (pushed to Zapier, private). Do **not** run `zapier-platform promote` or submit the Publish form until every item in section 2 is done.

## 1. Already done in code / via CLI

| Item | Status |
|---|---|
| `zapier-platform validate` | 16 checks passed, 0 failed, 0 publishing tasks, 2 general warnings. Both are T003 (date/time format needs a Zap) on the two native triggers `new_search_session` and `new_session_property`. They clear once each trigger has a successful live Zap (Zaps 27 and 28 below). |
| `npm test` | 86 tests: 66 pass, 0 fail, 20 live tests skipped by default (`npm run test:live` runs them, billed). |
| Property Monitor modules | Five modules hidden with `display.hidden: true` (`lib/modules.js`, `HIDDEN_MODULES`). Code kept intact. A test pins the hidden list and the visible count of 30. |
| Inputs ending in `_id` | Have dynamic dropdowns (D004). |
| Help text, trigger descriptions, sample data | On every module (samples/*.json). |
| Connection label | "Token ending XXXX". The key is never shown in full. |
| Metadata set through `zapier-platform register` | Title, description, homepage, audience private, role employee, category sales-crm, no marketing emails. |
| Logo | logo.png, 256x256 RGBA, uploaded with push. |
| Customer email | support@batchservice.com only. |

### 1.1 Hidden modules (follow-up, not part of this submission)

New Property Monitor and New Property Monitor Event (triggers), Get Property Monitor (search), Create Property Monitor and Delete Property Monitor (actions). The production token returns HTTP 403 on every `/api/v2/property-subscription` call. To bring them back: get the property-subscription permission enabled on a token, build a live Zap for each, delete the key from `HIDDEN_MODULES`, update the test (visible count 35), push a new version.

### 1.2 The 30 visible modules

- Triggers (2): New Search Session, New Property in Search Session (Billed)
- Searches (15): Find Properties, Look Up Property, Skip Trace Property Owner, Verify Address, Verify Phone Number, Check Do Not Call (DNC) Status, Check TCPA Litigator Status, Reverse Skip Trace (Phone or Email), Get Property Permits, Autocomplete Address, Geocode Address, Reverse Geocode (Find Nearby Addresses), Find Investors (Buy Box), Get Investor Properties, List Search Sessions
- Actions (13): Look Up Property, Skip Trace Property Owner, Verify Address, Verify Phone Number, Check Do Not Call (DNC) Status, Check TCPA Litigator Status, Batch Skip Trace Properties (V3), Batch Look Up Properties, Batch Verify Addresses, Create or Advance Search Session, Delete Search Session, Reverse Skip Trace (Phone or Email), API Request (Advanced)

## 2. Needs the Zapier web UI (https://developer.zapier.com / https://zapier.com), owner or browser operator

### 2.1 Integration settings (Settings tab) - verify these values, paste if different

- **Title:** `BatchData`
- **Description (125 chars):** `BatchData is a real estate data platform for property search, skip tracing, address verification and phone compliance checks.`
- **Homepage URL:** `https://batchdata.io`
- **Support email:** `support@batchservice.com`
- **Category:** Sales & CRM (`sales-crm`)
- **Role:** Employee of BatchData
- **Intended audience:** Private until review is submitted (the Publish form flips it)
- **Logo:** upload `logo.png` if the UI shows none (256x256)
- **API docs link (Publish form):** `https://developer.batchdata.com`
- **Terms of service:** `https://batchdata.io/terms-of-service`
- **Privacy policy:** `https://batchdata.io/privacy-policy`
- **Contact page:** `https://batchdata.io/contact-us`

### 2.2 Blocking items

1. **U001**: accept the Zapier Developer Terms (first login to the platform UI).
2. **M005 / publishing requirement 7.2**: add at least one admin team member whose email is on batchdata.io (or the company that owns the API). Team members -> Invite -> Admin. If no batchdata.io address is available, ask Zapier whether batchservice.com is acceptable.
3. **7.1 test account** for `integration-testing@zapier.com`: see section 3 (a BatchData admin has to do the provisioning step).
4. **A001**: connect a BatchData account in a Zap (an API token, section 4.1).
5. **S001**: at least 3 users with a live Zap. Invite two more testers (Sharing -> Invite users), so 3 distinct Zapier accounts each have a switched-on Zap with at least one successful run. The two extra users can each build Zap 3 (Verify Address) with a sandbox token (free).
6. **S002 / T001**: one switched-on Zap with one successful run for each of the 30 visible modules. Build them in the **admin** accounts (T001 reads their Zap History). Do not delete the Zaps or the runs. Plan in section 4.
7. **T004**: static sample keys must be a subset of the live response keys. Checked after Zaps run. If a module is flagged, regenerate that sample from the live output. Sandbox (mock) responses may carry other keys than the real API, so a flag on a sandbox-run module is likely. Regenerate from that run, or re-run it once with the production token.
8. **M007**: no other public app may be titled "BatchData". Search the app directory first.
9. Submit: Platform UI -> BatchData -> Integration Home -> **Publish** -> complete the form -> Submit for Review. Zapier replies within about a week. Promoting the version happens before or during this, and is the owner's step.

## 3. Test account for integration-testing@zapier.com (requirement 7.1)

Needs: non-expiring, password Zapier support can change, every needed feature on, no trial limits.

**Findings (BatchData Confluence, batchdata.io, developer.batchdata.com):**

- **Self-serve sign-up** at https://app.batchdata.com (email and password, or Google) creates a normal customer account. It gets only a small, non-renewing free allowance (for example 100 address verifications, 10 property lookups, 10 phone verifications, 10 DNC, 10 TCPA, 100 autocomplete, 25 geocode, 10 reverse geocode). Confluence page "Using Batchdata as a New User": a billing address **and a payment method are mandatory** before the account is usable, and the wallet needs funding (or sales must assign a subscription) to use the services. batchdata.io/pricing has no free tier. So self-serve is **not** a good fit: it needs a card (billing), and it would not be non-expiring or feature-complete. Nothing was created.
- **Sandbox API tokens are self-serve and free**, for any user that can open the dashboard: app.batchdata.com/dashboard -> key icon (API Tokens) -> Sandbox API Tokens -> Add New Token (shown once). They send `test=1`, never touch a wallet, never bill, and return mock data from the Stoplight mock servers. Permissions and rate limits equal production.
- **Internal provisioning** is the route for unmetered or partner access. The Admin App has a "Grant Unlimited Access" workflow (listed use cases: enterprise contract, promotional unlimited access, partner agreements) on the company detail page. Sales assigns subscriptions ("Assign a Subscription"). Unmetered tokens are free on their routes (CDE-5234: an unmetered flag on the token). There is also an existing internal cost-controlled test team, used for the MCP end-to-end tests.

**Recommended exact path (needs a BatchData admin or sales/support person, not code):**

1. A BatchData admin creates a **dedicated Zapier review company/team** in the Admin App (or uses the internal test team) with `integration-testing@zapier.com` as the owner login. Use a known initial password, and tell Zapier support in the Publish form that they may reset it.
2. In the Admin App, company detail: **Grant Unlimited Access** on the endpoints the modules use (skip trace V1 and V3, reverse skip trace, property lookup and search, permits, investor, DNC, TCPA, phone verification, address verification, autocomplete, geocode, reverse geocode, property search sessions). No expiry date. No card needed. A comped subscription from sales works as well.
3. Log in as that user (or have the admin do it), create a production API token with those permissions, plus a sandbox token. Put both in the Publish form notes.
4. If the admin prefers an existing paying team: invite `integration-testing@zapier.com` as a member of that company (Confluence: "Register as a member to an already existing Company"), so it inherits that wallet. Ask first, because Zapier reviewers will spend credits.

Open point: the property-subscription (monitor) permission is not needed for this submission, since those modules are hidden.

## 4. Plan: one live Zap per visible module (30 Zaps)

### 4.1 Ground rules (billing)

- Every live call can be billed. One call per module, smallest page size (`take` 1 or one row), and **one** public test address everywhere:
  - **Address:** `2800 N 24th St`, Phoenix, AZ 85008 (single line: `2800 N 24th St, Phoenix, AZ 85008`). It is the address used by `test/live.test.js`.
  - **Phone:** `6025550142` (reserved fictional 555-01xx number, nobody is called).
  - **Coordinates:** latitude `33.47865`, longitude `-112.03029`.
- **Skip trace and phone verification run once each on the production token** (Zap 13 Verify Phone Number search, Zap 22 Skip Trace search). Every other module that skip traces or verifies phones (Zaps 14, 23-26) uses a **sandbox token** (free, mock data).
- **Two connections** in the Zapier editor:
  - `BatchData production`: a production API token (section 3 account).
  - `BatchData sandbox`: a sandbox token (app.batchdata.com/dashboard -> key icon -> Sandbox API Tokens -> Add New Token; shown once).
  Each Zap below says P (production) or S (sandbox).
- The connection test posts an empty address batch. Production returns 400 (accepted by the app). The sandbox mock may return 200 or 400, both accepted. If the sandbox connect step fails, stop and report the status text.
- The editor's **Test step** calls BatchData too, and the real run calls it again. On billed modules (Zaps 13, 15, 16-22, 28, 29) choose **Skip test** if offered, publish the Zap, then fire the trigger once. Free modules can be tested in the editor.
- Never turn on a Zap that polls on a short interval and leave it running: see Zaps 27 and 28.

### 4.2 Trigger app for Zaps 1-26, 29, 30: Webhooks by Zapier -> Catch Hook

Each Zap = trigger **Webhooks by Zapier -> Catch Hook** (no child key, leave the pick-off field empty) + one BatchData step.

1. Create the Zap, trigger Webhooks by Zapier -> Catch Hook. Copy the webhook URL.
2. From a terminal send one request: `curl -s -X POST -H 'Content-Type: application/json' -d '{"go":1}' '<webhook url>'`. Back in the editor, Test trigger -> the request appears.
3. Add the BatchData step (module and inputs from the table), choose the connection (P or S), fill the inputs exactly as listed. Leave every field not listed empty.
4. Publish the Zap (switch it on). Send the same curl once more. This creates the real run.
5. Zapier -> Zap History: confirm status **Success** for that run and that the BatchData step shows output. Zap name = module name (for example `BatchData - Verify Address (search)`) so T001 matching is easy.
6. Fallbacks if Webhooks is not on the plan: **Schedule by Zapier** (Every Day, any time of day) - runs only at the scheduled hour, so set it for the next hour; or **Email by Zapier -> New Inbound Email** and send one email to the generated address. Both free. The BatchData step is identical.

If a search step returns nothing, Zapier halts the Zap with "no results". That is a failed run for T001. Re-check the inputs before re-running. Keep re-runs to a minimum on billed modules.

Searches need the "BatchData -> Find ..." step type; actions are "Create ..." steps. The step names equal the module labels.

### 4.3 Order and inputs

**Phase A - free or no-property-billing, production token, do these first**

| # | Module (kind) | Conn | Inputs |
|---|---|---|---|
| 1 | List Search Sessions (search) | P | Take = `1` |
| 2 | API Request (Advanced) (action) | P | Method = `GET`, Path = `/api/v2/property/search-sessions`, Query = `{"take": 1}`, Body empty |
| 3 | Verify Address (search) | P | Street = `2800 N 24th St`, City = `Phoenix`, State = `AZ`, Zip = `85008` |
| 4 | Verify Address (action) | P | same as Zap 3 |
| 5 | Batch Verify Addresses (action) | P | Addresses: one row. street `2800 N 24th St`, city `Phoenix`, state `AZ`, zip `85008` |
| 6 | Autocomplete Address (search) | P | Query = `2800 N 24th`, Take = `1` |
| 7 | Geocode Address (search) | P | Address = `2800 N 24th St, Phoenix, AZ 85008`, Request Ref = `zapier-review` |
| 8 | Reverse Geocode (Find Nearby Addresses) (search) | P | Latitude = `33.47865`, Longitude = `-112.03029`, Property Only empty |

**Phase B - compliance checks (small free allowance, then billed). One number.**

| # | Module (kind) | Conn | Inputs |
|---|---|---|---|
| 9 | Check Do Not Call (DNC) Status (search) | P | Phone Numbers = `6025550142` |
| 10 | Check Do Not Call (DNC) Status (action) | P | same as Zap 9 |
| 11 | Check TCPA Litigator Status (search) | P | Phone Numbers = `6025550142` |
| 12 | Check TCPA Litigator Status (action) | P | same as Zap 11 |
| 13 | Verify Phone Number (search) | **P, the one production run** | Phone Numbers = `6025550142` |
| 14 | Verify Phone Number (action) | S | Phone Numbers = `6025550142` |

**Phase C - property data, production, billed per record (take 1)**

| # | Module (kind) | Conn | Inputs |
|---|---|---|---|
| 15 | Look Up Property (search) | P | Identify By = `address`, Street = `2800 N 24th St`, City = `Phoenix`, State = `AZ`, Zip = `85008`, Datasets = `basic`, Include Skip Trace empty (do not set Yes) |
| 16 | Look Up Property (action) | S | same as Zap 15 |
| 17 | Batch Look Up Properties (action) | S | Addresses: one row, street `2800 N 24th St`, city `Phoenix`, state `AZ`, zip `85008`. Datasets = `basic` |
| 18 | Find Properties (search) | P | Query = `2800 N 24th St, Phoenix, AZ 85008`, Take = `1`, nothing else |
| 19 | Get Property Permits (search) | P | Street = `2800 N 24th St`, City = `Phoenix`, State = `AZ`, Zip = `85008`, Take = `1` |
| 20 | Find Investors (Buy Box) (search) | P | Street = `2800 N 24th St`, City = `Phoenix`, State = `AZ`, Zip = `85008`, Take = `1`. After the run, copy the investor ID from the step output (the field the module returns as the investor id). |
| 21 | Get Investor Properties (search) | P | Investor Ref = the ID copied from Zap 20 (type it in as fixed text), Ownership = `current`, Take = `1` |

**Phase D - skip trace. Production exactly once (Zap 22). The other four run on the sandbox token.**

| # | Module (kind) | Conn | Inputs |
|---|---|---|---|
| 22 | Skip Trace Property Owner (search) | **P, the one production run** | API Version = `v3`, Find By = `address`, Street = `2800 N 24th St`, City = `Phoenix`, State = `AZ`, Zip = `85008`, Include TCPA Flagged empty |
| 23 | Skip Trace Property Owner (action) | S | same as Zap 22 |
| 24 | Batch Skip Trace Properties (V3) (action) | S | Properties: one row, street `2800 N 24th St`, city `Phoenix`, state `AZ`, zip `85008` |
| 25 | Reverse Skip Trace (Phone or Email) (search) | S | Phone = `6025550142`, Email empty |
| 26 | Reverse Skip Trace (Phone or Email) (action) | S | Phone = `6025550142`, Email empty |

**Phase E - search sessions (do in this order)**

| # | Module (kind) | Conn | Trigger and inputs |
|---|---|---|---|
| 27 | **New Search Session** (trigger) | P | Trigger = BatchData -> New Search Session, no inputs. Action step: **Formatter by Zapier -> Text -> Capitalize** (free) on the session id from the trigger. **Build and switch this Zap ON first**, before Zaps 28 and 29. A polling trigger only runs on sessions that appear after it is on. Wait for the first run after Zap 29 runs, then leave it on or turn it off. |
| 28 | **New Property in Search Session (Billed)** (trigger) | P | Trigger = BatchData -> New Property in Search Session, Session ID = `zapier-review-trigger`, Query = `2800 N 24th St, Phoenix, AZ 85008`, Take = `1`. Action step: Formatter by Zapier -> Text -> Capitalize on the property address. Each poll bills one new property, so **turn the Zap OFF as soon as one Success run shows in Zap History**. Skip the editor test. |
| 29 | Create or Advance Search Session (action) | P | Session ID = `zapier-review-action`, Query = `2800 N 24th St, Phoenix, AZ 85008`, Take = `1`. Run once, after Zap 27 is on. |
| 30 | Delete Search Session (action) | P | ID = `zapier-review-action`. Run **last**, after Zaps 27 and 28 each show a Success run. Leave `zapier-review-trigger` in place or delete it later in the BatchData dashboard. |

Zaps 27 and 28 are the only two with the T003 warning in `validate`. After their first Success runs, re-run `zapier-platform validate`: expect 0 warnings.

### 4.4 Billed-call budget (production token)

Free or no property billing: Zaps 1-8 (address checks within the free allowance), 27. At most one record each: 15, 18, 19, 20, 21, 28, 29. Compliance: 9-13, one number each, within the free allowance of 10 per type for a new account (billed after that). Skip trace: Zap 22 only. Phone verification: Zap 13 only. Everything else that would skip trace or verify phones is on the sandbox token (Zaps 14, 16, 17, 23-26).

### 4.5 Open risks

- Rule 5.4 (production endpoints): sandbox tokens go to the production URL but return mock data. Zapier may expect real data in the public listing's Zap runs. If so, re-run Zaps 14, 16, 17, 23-26 on the production token one time each after the Zapier test account has funding or unlimited access (section 3). Do not do this on a card-funded personal account.
- T004 on sandbox-run modules (see 2.2 item 7).
- Zapier rule 5.1: the BatchData app itself must be publicly launched.

## 5. Reminders

- Do not promote the version or submit the Publish form from this repo or bot. That is the owner's step.
- The review form asks for a test account and the test Zaps. Keep them live. Do not delete runs.
- No competitor names appear in any metadata. Keep it that way.
