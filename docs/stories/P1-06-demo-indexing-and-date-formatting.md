# P1-06: Demo sites are indexable, and dates are shown in two shapes

**Priority:** P1. Small, visible, and both are read as bugs by reviewers
**Status:** Resolved. Noindex on all four apps, and one date shape where a person reads one
**Components:** `issuer-frontend`, `verifier-frontend`, `quals-portal`, `trust-university-frontend`

## What was done

**Indexing.** `X-Robots-Tag: noindex, nofollow` joined the shared header policy in
`shared-web/security-headers.mjs`, so there is one place to change, and each app serves a `robots.txt`
through a metadata route. The academy allows `/.well-known/` so Android's App Links association file
stays reachable. Verified by fetching all four hosts: every page and every `robots.txt` returns the
header, and the academy's file allows `/.well-known/` before disallowing the rest.

**Dates.** The portal was already consistent. Every timestamp goes through one helper. The mixed
shapes were elsewhere: a shared document printed `2022-08-29`, `20220829` or a JavaScript `Date`
according to which decoder produced it, and the two verification screens printed full timestamps with
seconds in the browser's own locale, so the same fact looked different on two machines. Date-shaped
claim values are now rendered the same way wherever a person reads them. The share view, the shared
PDF, and the verification result. While every other value is passed through untouched, because a
matriculation number must not be reformatted.

Related, and also fixed: the verifier's date claims are normalised to `YYYY-MM-DD` at the API
boundary (`toDateString` in `presentation-session-service.js`). A dependency refresh showed that the
decoder can hand back a `Date` for CBOR tag 1004, which leaked into the API as a full timestamp and
is not a contract anyone should depend on.

## Problem 1. Demo sites can be crawled

None of the four applications ships a `robots.txt` and none sets a `noindex` directive. The
deployment therefore exposes a fictional university, a demo portal that accepts real-looking personal
data, and sample transcripts to search engines.

## Problem 2. Dates are rendered in two shapes

In the same tables, some timestamps are locale-formatted and others are printed as stored ISO
strings (`2026-02-14T09:31:00.000Z`), and the wallet-facing claim dates keep their `YYYYMMDD`
machine form. Nothing tells the reader which is which.

## Acceptance criteria

**Indexing**

- Each app serves a `robots.txt` disallowing all user agents.
- Each app sends `X-Robots-Tag: noindex, nofollow` (add it to the shared header policy in
  `shared-web/security-headers.mjs` so there is one place to change).
- A short note in the README records that these deployments are demos, so the headers are
  intentional, and states what to remove before a production deployment.

**Dates**

- One helper formats every human-facing date in a single documented style, and all four apps use it.
- Machine-readable values that must stay machine-readable (claim dates used by the wallet, and any
  value compared as a string) are labelled or kept out of human-facing tables.
- The portal's audit and credentials tables, the academy's claim and share views, and the My Jobs
  verification result all render consistently.

## Notes

- `noindex` interacts with App Links verification on the academy: the `/.well-known/assetlinks.json`
  route must stay reachable, so scope the robots rules rather than blocking the whole host.
