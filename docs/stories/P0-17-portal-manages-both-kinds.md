# P0-17: Management portal — Smart Academy manages both credential kinds

**Priority:** P0 — the organisation must see what it issued
**Status:** Done — the kind is derived by the issuer and travels with the credential list, the
statistics and the audit trail; the portal labels and filters on it. Not verified: a signed-in
click-through (no browser driver in this repo's test suite)
**Components:** Quals management portal, issuer admin API

## User story

As a Smart Academy administrator, I want to see which credential kind each entry is, and
filter and revoke accordingly, so that I can answer "did this student get a transcript?"
and act on it.

## Scope

- The credentials list shows the kind (Qualification or Transcript) as a first-class
  column, with a filter.
- The overview counts are split by kind, or clearly labelled as a combined total.
- Revocation is per credential and continues to be refused across organisations.
- The audit log records the kind, so events are readable without a lookup.

## Acceptance criteria

1. Each row states its kind, derived from the academic namespace the credential holds
   (both kinds share the docType), never from a guess about its contents.
2. Filtering by kind returns only that kind, and the count matches the filter.
3. The organisation's own credentials only; a cross-organisation revoke is refused with the
   existing 403.
4. Overview statistics remain correct for an organisation that holds both kinds.
5. Unknown or legacy docTypes are shown as their raw docType rather than mislabelled.

## Explicit non-goals

- No bulk issuance, no editing of credential contents, no new organisation-admin UI.
- No change to the platform operator's views beyond the same labels.

## Dependencies and blockers

- Requires P0-15 so that docType is correct on the registry row.

## Delivery increments

1. Kind column and filter on the credentials page.
2. Split counts on the overview.
3. Audit entries carrying the kind.

## Definition of done

Verified against a store holding both kinds for Smart Academy, and submitted for review on
a feature branch.

## Verification

- `issuer-service/tests/issuer-service.test.js` — four tests: the list states each kind derived
  from the namespace while the shared docType proves the namespace is what distinguishes them; a
  credential holding no academic namespace is reported as `credential` and its raw docType is what
  the portal shows; the organisation's counts split by kind and a revoked transcript drops out of
  the active split while remaining in the all-time one; and the audit trail records the kind with
  both the issuance and the revocation.
- Live against the running issuer: all 50 sampled credentials carry `kind`, `kindLabel` and
  `academicNamespaces`; `/statistics` returns
  `byKind: {academic: 37, credential: 167, qualification: 8, transcript: 2}` for the dev store,
  which is the honest split — the `credential` rows are identity-only credentials from earlier
  work that hold no academic namespace, and the `academic` rows are the combined credentials issued
  before the choice existed; and the audit trail shows `credential_issued:Qualification` and
  `credential_revoked:Qualification`.
- **Gap the tests found, now fixed:** credentials issued through the academy session path recorded
  no issuance audit event at all, so the credentials a student claims were invisible to the
  organisation that issued them. `issueForSession` now writes one, carrying the kind and the
  session id.
- `quals-portal` type-checks clean and compiles (`Compiled successfully`); the build then fails on
  the pre-existing `/_global-error` prerender error, which also affects `issuer-frontend` —
  recorded as `P1-01`.
