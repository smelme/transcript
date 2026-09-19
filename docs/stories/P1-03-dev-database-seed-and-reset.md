# P1-03: Development database has no seed or reset path

**Priority:** P1. Testers chase credentials the database believes are already claimed
**Status:** Resolved — `npm run db:reset` and `npm run db:seed` implement it
**Components:** `scripts/dev-database.mjs`, `package.json`, `data/transcript.db` (better-sqlite3)

## What was built

`npm run db:reset` deletes the database (and its `-wal`/`-shm` siblings) and recreates an empty
schema. `npm run db:seed` creates the two demo client organisations and an administrator for each,
idempotently. A second run reports "Admin already present" rather than duplicating or failing.

Both refuse to run when `NODE_ENV=production`, and when `DATABASE_PATH` points outside the
repository's `data/` directory, so a developer who aimed the variable at something real cannot lose
it by running a command from a README. Both guards were exercised, not just written.

**Deliberately not seeded:** credentials and wallet accounts. A credential is only real once the
issuer has signed it, so seeded credential rows would be metadata pretending to be a credential —
precisely the confusion this story exists to remove. Wallets enrol themselves, and credentials are
issued through the academy flow so the mdoc bytes are genuine.

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
