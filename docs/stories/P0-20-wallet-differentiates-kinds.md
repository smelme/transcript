# P0-20: Wallet — differentiate qualification and transcript

**Priority:** P0 — the holder must see and choose the right credential
**Status:** Blocked on P0-15
**Components:** Android wallet (registry, list, detail, share, presentment)

## User story

As a holder, I want my qualification and transcript shown as different credentials, so I
know which one I am presenting or sharing and can choose deliberately.

## Scope

- Registry entries carry a kind derived from the credential's docType, with a readable
  label and, for a transcript, summary information (courses, credits).
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
