# Zapier public-review checklist: BatchData (app 248744)

State as of v0.3.0 (pushed, private). Do **not** run `zapier-platform promote` or submit the Publish form until every item in section 2 is done.

## 1. Already done in code / via CLI

| Item | Status |
|---|---|
| `zapier-platform validate` | 0 errors, 0 publishing tasks. Only warning left: T003 on the 4 triggers, which clears once each trigger has a successful live Zap. |
| `npm test` | 85 tests: 65 pass, 0 fail, 20 live tests skipped by default (`npm run test:live` runs them, billed). |
| Inputs ending in `_id` | Have dynamic dropdowns (D004). |
| Help text, trigger descriptions, sample data | On every module (samples/*.json). |
| Connection label | "Token ending XXXX". The key is never shown in full. |
| Metadata set through `zapier-platform register` | Title, description, homepage, audience private, role employee, category sales-crm, no marketing emails. |
| Logo | logo.png, 256x256 RGBA, uploaded with push. |
| Customer email | support@batchservice.com only. |

## 2. Needs the Zapier web UI (https://developer.zapier.com), owner only

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
2. **M005 / publishing requirement 7.2**: add at least one admin team member whose email is on batchdata.io (or the company that owns the API). Team members -> Invite -> Admin. Our company mail is mostly batchservice.com; if no batchdata.io address exists, ask Zapier whether batchservice.com is acceptable.
3. **7.1 test account**: create a non-expiring BatchData account for `integration-testing@zapier.com` with the paid features needed (skip trace, phone verification, monitors) and Zapier-changeable password. Paste credentials in the Publish form.
4. **A001**: connect a BatchData account in a Zap (an API token from app.batchdata.com -> API).
5. **S001**: at least 3 users with a live Zap. Invite two more testers (Sharing -> Invite users), so 3 distinct Zapier accounts each have a switched-on Zap with at least one successful run.
6. **S002 / T001**: one switched-on Zap with one successful run for each visible module. Build the test Zaps in the **admin** accounts, because T001 reads their Zap History. Do not delete the Zaps or runs. There are 35 visible modules:
   - Triggers (4): New Search Session, New Property Monitor, New Property in Search Session (Billed), New Property Monitor Event
   - Searches (16): Find Properties, Look Up Property, Skip Trace Property Owner, Verify Address, Verify Phone Number, Check Do Not Call (DNC) Status, Check TCPA Litigator Status, Reverse Skip Trace (Phone or Email), Get Property Permits, Autocomplete Address, Geocode Address, Reverse Geocode (Find Nearby Addresses), Find Investors (Buy Box), Get Investor Properties, List Search Sessions, Get Property Monitor
   - Actions (15): Look Up Property, Skip Trace Property Owner, Verify Address, Verify Phone Number, Check Do Not Call (DNC) Status, Check TCPA Litigator Status, Batch Skip Trace Properties (V3), Batch Look Up Properties, Batch Verify Addresses, Create or Advance Search Session, Delete Search Session, Create Property Monitor (Stream Delivery), Delete Property Monitor, Reverse Skip Trace (Phone or Email), API Request (Advanced)
7. **T004**: static sample keys must be a subset of the live response keys. This is checked after Zaps run. If it flags a module, regenerate that sample from the live output.
8. **M007**: no other public app may be titled "BatchData". Search the app directory first.
9. Submit: Platform UI -> BatchData -> Integration Home -> **Publish** -> complete the form -> Submit for Review. Zapier replies within about a week. Promoting the version happens before or during this, and is the owner's step.

### 2.3 Ways to cut the live-Zap work (optional, needs a new version)

- Mark the lower-value modules `display.hidden: true` and push 0.4.0. Hidden modules need no live Zap. Candidates: the three batch actions, API Request (Advanced), Create/Delete Property Monitor, Delete Search Session, List Search Sessions.
- Run each skip-trace, phone-verify, DNC and TCPA test Zap once with a throwaway address or number. These calls are billed.

### 2.4 Known external blocker: monitor modules

The production token used for testing returns **HTTP 403** on every `/api/v2/property-subscription` call (list, create, delete, get). That blocks live Zaps for New Property Monitor, New Property Monitor Event, Get Property Monitor, Create Property Monitor and Delete Property Monitor. Fix: use a token with the subscription permission enabled, or hide those five modules (section 2.3). Zapier also requires production endpoints (rule 5.4). A BatchData sandbox token can be used for private testing but not for the public listing.

## 3. Reminders

- Zapier's rule 5.1 requires the BatchData app itself to be publicly launched, not invite-only or beta.
- The review form asks for a demo account and for the test Zaps. Keep them live.
- No competitor names appear in any metadata. Keep it that way.
