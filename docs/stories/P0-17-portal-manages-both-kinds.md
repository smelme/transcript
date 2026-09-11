# P0-17: Management portal — Smart Academy manages both credential kinds

**Priority:** P0 — the organisation must see what it issued
**Status:** Blocked on P0-15
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

1. Each row states its kind, derived from the credential's docType, never from a guess
   about its contents.
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
