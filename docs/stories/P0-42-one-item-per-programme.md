# P0-42: One item per programme

**Status:** ✅ Done — 2026-09-27 (issuer: `npm run test`, 8 tests over the listing rule)
**Components:** `issuer-service` (the two listing routes), `quals-frontend` (the chooser)
**Depends on:** P0-41 (the academy publishes the record it holds)
**Blocks:** nothing

## The problem

The chooser listed the same programme twice:

```
Academic transcript — Master of Data Science   Master · Graduated 30 Jul 2024 · 19 credits · 5 courses  Issued to S Melese
Academic transcript — Master of Data Science   Master · Graduated 30 Jul 2024 · 18 credits · 5 courses  Issued to Priya Moreau  [In your wallet]
```

Both rows are real sessions for the same person and the same programme. A session becomes `issued`
when the holder collects it, and a copy in a wallet is never superseded — the institution cannot
take back a document the holder already has — so a later publish leaves the collected copy **and**
the new one side by side. Publishing again is therefore normal use, and it produced a screen that
invites somebody to add a programme they already hold, twice.

The two rows also disagree: 19 credits against 18, and two different names. That is the demonstration
generator, which fills the holder's name from a fixture (`FIRST_NAMES` / `LAST_NAMES` in
`credential-generator.js`) when one is not supplied, and computes credits from a seed. It is a
reminder that a duplicate is not only untidy: two rows describing one programme, differently, is
two answers to a question that has one.

## The rule

**One row per programme, and the row is the one the issuer would hand over now.**

- Group by `display.programmeCode` where the record carries one, falling back to the title; scoped
  by institution, so two institutions sharing a code do not collapse into each other.
- A `pending` session outranks an `issued` one: a prepared credential is what the issuer would give
  the holder today, and the copy in the wallet is an older print of it.
- Among equals, the newest wins.
- `inWallet` becomes a statement about the **programme** rather than about the row: it is true when
  any session in the group is in a wallet, so a row can say *In your wallet* while still offering
  the current version.
- `superseded` sessions stay out of the list, as they already did.

The rule lives in one place — `issuance-items.js` — and both listing routes use it, because the
holder's list must not depend on which door they came through.

## What changed

| Where | What |
| --- | --- |
| `issuer-service/src/issuance-items.js` | **New.** `programmeKeyOf` and `oneItemPerProgramme`, as plain functions so the rule can be checked without a server |
| `issuer-service/src/index.js` | `GET /academy/credentials` and `GET /issuance/invitations/:id/items` both collapse before replying |
| `quals-frontend/app/issue/page.tsx` | No change to the listing: the page renders what it is given, which is the point. One line of copy: with nothing chosen the button said *Add 0 to wallet*, which is not an instruction, so a count of nought now reads *Add to wallet* — it is disabled either way |

## What is *not* changed

The sessions themselves. Both copies stay in the database, both stay resolvable by their own id, and
a holder who opens an older link still sees an offer for it. The collapse is about the list a person
is asked to choose from, not about deleting the institution's history — and P0-43 is where the
credential *document* is finally let go of, after the holder says it has arrived.
