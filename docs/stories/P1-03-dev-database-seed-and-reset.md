# P1-03: Development database has no seed or reset path

**Priority:** P1 — testers chase credentials the database believes are already claimed
**Status:** Open, reproduced during UAT (see `docs/analysis-discovery/uat-transcript-flow.md`, UAT-011)
**Components:** `data/transcript.db` (better-sqlite3), `issuer-service`, `scripts/`

## Problem

The demo runs against a single development database that accumulates every issuance session,
credential and share created during testing. Issuance sessions record which wallet claimed a
credential, so after a few test runs the academy's claim list contains entries that a freshly
installed wallet never held, and the portal reports credentials as "In wallet" for a device that has
never seen them.

This already cost time once: during device testing the dashes and duplicate-looking entries in the
wallet were partly the result of leftover sessions from an earlier run, not of the code under test.

## Expected behaviour

A tester can return to a known state in one command, and can seed a documented set of credentials for
a demo without going through the issuance flow by hand.

## Acceptance criteria

- `npm run db:reset` (or equivalent) removes the development database and recreates the schema.
- `npm run db:seed` creates a documented fixture set: at least one qualification, one transcript and
  one academic record for each demo institution, with stable student identifiers.
- Both scripts refuse to run when `NODE_ENV=production` or when `DATABASE_PATH` points outside the
  repository's `data/` directory.
- The scripts are documented in `README.md` and in `docs/E2E_WALLET_ISSUANCE.md` where the manual
  flow is described.
- A note in the same place explains that claimable sessions are per-email and that testing two
  students at once needs two addresses.

## Notes

- Keep the fixtures in the credential generator's vocabulary (US conventions, recognition block) so
  seeded data looks exactly like issued data.
- Do not seed wallet-side state: the wallet must still claim through the normal flow.
