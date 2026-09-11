# P0-16: Smart Academy app — student chooses what to claim

**Priority:** P0 — makes the choice usable by a holder
**Status:** Blocked on P0-15
**Components:** Smart Academy app (issuer-frontend), issuer service academy API

## User story

As an applicant, I want to choose whether to receive my qualification, my transcript, or
both, so that my wallet holds what I actually need and I understand what each credential
contains.

## Scope

- The request page offers the three options with a one-line description of what each
  credential shows.
- The claim page lists every credential waiting for the applicant, labelled by kind, and
  claims them individually or together.
- Confirmation shows which credentials were added and which failed, without hiding a
  partial success.

## Acceptance criteria

1. The three options are offered, with `both` as an explicit choice rather than a
   side effect of selecting two.
2. Requesting the same option twice does not create duplicate credentials.
3. The claim page lists each waiting credential with its kind, institution and graduation
   date, and marks the ones already in the wallet.
4. Claiming is per credential and idempotent; a second attempt reports "already in wallet"
   rather than issuing again.
5. A failure for one kind does not prevent the other from being claimed, and the failure
   is reported in plain language.
6. Keyboard and screen-reader users can reach every option and see the current selection.

## Explicit non-goals

- No change to the issuer's credential contents (P0-15) or to the management portal
  (P0-17).
- No self-service re-issue of an already claimed kind.

## Dependencies and blockers

- Requires P0-15 for the `include` parameter and the `kind`/`docType` fields.

## Delivery increments

1. Choice on the request page, passed through to `/academy/requests`.
2. Kind-aware claim list and per-credential claim.
3. End-to-end check that choosing `both` results in two credentials in the wallet.

## Definition of done

Acceptance criteria are demonstrated against a running academy app and issuer, including
the `both` path, and the change is submitted for review on a feature branch.
