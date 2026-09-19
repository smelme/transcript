# P0-16: Smart Academy app. Student chooses what to claim

**Priority:** P0. Makes the choice usable by a holder
**Status:** Done. The choice, the kind-labelled claim list and repeat-request reuse are
implemented and covered. Not verified: a click-through in a browser (this repo has no browser
driver in its test suite) and a real wallet claim of a transcript (_P0-20_)
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

## Accepted criteria, as implemented

**Reuse is claim-aware (added after a device test).** A prepared credential is reused only when it
carries the claims this issuer would produce *now*, compared by value and independent of key order.
Reusing one whose claims have since changed is how a student ends up presenting a record the issuer
no longer produces. In the reported case, marks on a scale that had been replaced and none of the
programme context, so every derived field showed a dash. So:

- same claims → the same session comes back (a repeat request still creates nothing new);
- a **prepared** credential with older claims → replaced (`status: 'superseded'`), since it was
  never claimed and nothing is taken from the holder; it also stops being offered and its link says
  so rather than issuing the old record;
- a **claimed** credential with older claims → left alone in the wallet, and a current credential is
  prepared alongside it, because a holder cannot undo a claim and may legitimately want the new one.

**The choice drives the claiming step.** The claim link now carries what was asked for
(`/claim?email=…&include=transcript`), and the claim page shows that rather than every credential the
account happens to hold from earlier requests, with a "show everything on my account" button beside
it. Before this, a second request showed the previous requests' credentials too, which is confusing
in use and worse when testing.

## Verification
- `issuer-service/scripts/test-academy-flow.mjs`. 43 checks pass against a running issuer,
  including the chosen kind reflected in the response, the offer and the wallet list; asking twice
  reusing the same sessions with `reused: true` and no duplicate created; asking for a subset
  touching only that kind; and the wallet being offered two credentials rather than four.
- `issuer-service/tests/issuer-service.test.js`. Four unit tests for reuse: the same sessions come
  back in the same order, the namespace decides which credential is reused, a credential already in
  the wallet is reported rather than re-issued, and linking a session attaches the account without
  disturbing the offer the holder already has.
- Academy app: `/get-credentials` renders the three choices as a labelled radio group, with a
  default selection and a one-line description each; `/claim` renders each waiting credential with
  its kind label, institution and graduation date, as a radio group whose selection names the kind
  on the button. Confirmed by fetching the rendered HTML; the signed-in state needs a browser.
- **Pre-existing, not caused by this story:** `next build` fails on Next's internal
  `/_global-error` page (`Cannot read properties of null (reading 'useContext')`). Reproduced with
  this change stashed, and captured as `P1-01`.
