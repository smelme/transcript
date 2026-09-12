# P0-20: Wallet — differentiate qualification and transcript

**Priority:** P0 — the holder must see and choose the right credential
**Status:** In progress — the data layer, the list and detail screens, the share categories and
presentment eligibility are implemented and covered by 26 wallet unit tests. Not verified: a
device demonstration (storing both kinds, the chooser, presenting to Trust University, sharing by
email), which needs the app installed on a phone
**Components:** Android wallet (registry, list, detail, share, presentment)

## User story

As a holder, I want my qualification and transcript shown as different credentials, so I
know which one I am presenting or sharing and can choose deliberately.

## Scope

- Registry entries carry a kind derived from the academic namespace the credential holds
  (both kinds share the photo-ID docType), with a readable label and, for a transcript,
  summary information (courses, credits).
- The credential list and detail screens distinguish the two kinds visually and in text
  without inventing new decoration.
- Sharing and presentment act on a single credential of a chosen kind; the share UI offers
  the categories that credential actually contains.
- A credential of an unknown docType is still stored and shown by its raw docType rather
  than dropped.

## Acceptance criteria

1. Both kinds in the store appear as separate entries with distinct, accurate labels.
2. A transcript entry shows its course count and total credits; a qualification entry shows
   programme, level and graduation date.
3. Presenting or sharing selects exactly one credential; the request's docType and
   namespaces decide which is eligible.
4. An unknown docType does not break registration of the other entries (the registry keeps
   publishing the credentials it can build).
5. Selection state and biometric gating behave the same for both kinds.

## Explicit non-goals

- No new credential storage format, no migration of existing stored credentials.
- No UI redesign beyond labelling and summary.

## Dependencies and blockers

- Requires P0-15; P0-18 depends on the share entry point delivered here.
- Unproven: whether the claim flow rejects an unfamiliar docType; confirmed or fixed here.

## Delivery increments

1. Kind-aware registry entries and labels, with unit tests for both kinds.
2. List and detail presentation.
3. Share and presentment per kind, with the categories the credential contains.

## Definition of done

Both kinds are demonstrated on a device: stored, distinguished, presented to Trust
University and shared by email, and the change is submitted for review.

## Verification

- `MdocParserTest` — six tests: a transcript is read as a transcript with its course count,
  credits and status; a qualification with its level, field and graduation date; a credential
  holding both as both; a credential holding no academic namespace is given no kind; an
  unreadable course list counts as no courses without changing what the credential is; and an
  unreadable mdoc yields no summary rather than a wrong one.
- `PresentationEligibilityTest` — six tests for the rule that decides which credential may answer
  a request: a transcript request is answered only by a transcript (and the reverse), a
  credential holding both answers either, a two-namespace request needs both, a credential with
  no academic namespace answers no academic request, and empty requirements constrain nothing.
- `CredentialRegistryTest` — the chooser entry is now led by the kind, so the two kinds cannot be
  confused; a transcript entry is described by its courses and credits because it holds no award
  date; a credential whose kind is unknown is labelled as an academic credential rather than
  attributed to a kind it does not have. All six pass.
- 26 wallet unit tests pass (`gradlew :app:testDebugUnitTest`).

## What the change consists of

- One rule, in one place: `AcademicNamespaces` maps namespaces to a kind, its label and the
  namespaces it holds, mirroring the issuer, so the wallet and the server label a credential the
  same way.
- A summary written before kinds existed is re-read from the mdoc once and saved, so older
  credentials are not stuck as unlabelled.
- Presentment: when the chooser names no credential, the first one that can answer the request is
  chosen - decided by the namespaces asked for, since both kinds share the photo-ID docType - and
  when nothing can answer it the app fails with "None of your stored credentials can answer this
  request" rather than presenting a credential that would disclose nothing.
- Share: only the sections the credential actually holds are offered, and its own academic section
  starts selected, so the holder cannot pick something the issuer would refuse.

## Remaining

- A device run: store both kinds, present a transcript to Trust University (_P0-19_) and share one
  by email (_P0-18_ increment 3), with the chooser showing two distinct entries.
