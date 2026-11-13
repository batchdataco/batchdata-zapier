# CLAUDE.md

Zapier integration for the BatchData API. zapier-platform-core 19.2.1, Node 22 or newer. See README.md.

## Checks

- `npm test` runs the unit tests (node --test, nock).
- `npx zapier-platform validate` must show no errors.

## Conventions

- Every `z.request` goes through the central timeout: the `setRequestTimeout` beforeRequest middleware and `translateTimeouts` in `middleware.js` (`REQUEST_TIMEOUT_MS` in `lib/constants.js`). Do not set a timeout at a call site. Wrap every new perform function with `translateTimeouts`.
- Never auto-retry billed endpoints. Do not throw `ThrottledError` for a timeout or any error after BatchData may have processed the request.
- Never call live APIs in unit tests. Use nock. Live tests run only with `npm run test:live`.
- Never commit tokens, `.env` files, or Zapier deploy keys.
