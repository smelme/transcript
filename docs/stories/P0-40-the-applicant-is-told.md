# P0-40: The applicant is told

**Status:** Built - the confirmation, the queue notice and the decision email go out, and the
applicant has a status page carrying the same five states and the period, reachable with the
reference alone. A slipped promise is not yet notified unprompted.
**Components:** `issuer-service` (confirmation and status emails, request status route),
`quals-frontend` (status page and the ordered-path entry on `/issue`)
**Depends on:** P0-36 (a request exists), P0-37 (a payment was taken)
**Blocks:** nothing, but the flow is not honest without it

## The change

The ordered path involves waiting, and a person waiting with no information will telephone. This
story is the applicant's half of the flow: what they are told when they submit, what they can check
while they wait, and what they receive at each outcome — in the same words on the page and in the
email, so the two can never disagree.

| Step | Who | What |
| --- | --- | --- |
| 1 | Quals | on submit: what happens next, the period, the reference, and where the credential will arrive |
| 2 | issuer | emails the same thing, to the verified address, and emails the operator separately |
| 3 | applicant | can open the status page with the reference and the code step, and see one of five short states |
| 4 | issuer | emails at acceptance and at issue, and at decline with the reason and the refund |
| 5 | Quals | on issue, the status page and the email point at the same collection link as the self-service path |
| 6 | issuer | if the promise slips, tells the applicant before they ask |

## Decisions taken

**Page and email say the same thing, from one source.** The wording lives in one place and both
render it, because the fastest way to lose trust is a page and an email that disagree about the
period.

**Five states, no theatre.** *Received*, *being checked*, *accepted and being prepared*, *sent to
you*, *declined with the refund*. No percentages, no progress bars, no countdowns — the same rule we
already applied when we removed the automatic redirect from the hand-over screen.

**The period is stated where a person owns it.** "Up to 10 working days" appears only where the
institution is doing the work, and never as a date the system computes, because the system cannot
know.

**A slipped promise is communicated, not discovered.** When a request passes the promise, the
applicant is told before they ask, with the reason if one is known.

**Declining is explained within the institution's limits.** The applicant is told the outcome and
the refund, and the reason the institution allows to be shared — not the reviewer's note.

## What stays the same

- The collection page, the code step, the selection, the single terms acknowledgement and the QR
  sequence are untouched. An ordered credential arrives there like any other.
- The existing credentials-ready email keeps its wording and its 30-day expiry sentence.
- The self-service path gains no new steps.

## Acceptance criteria

- The confirmation screen and the confirmation email carry: what happens next, the period, the
  reference, the delivery address and the refund rule — and match word for word on the period.
- The applicant can check their status with the reference without a password, and cannot see any
  other request.
- Each of the five states has a distinct, plain description, and none of them implies progress that
  has not happened.
- At issue, the email contains the collection link and the expiry wording the self-service path uses.
- At decline, the email states the outcome, the refund and the next step available to the applicant.
- A request beyond the promise triggers a notification without being asked.
- The status page is readable at 360px and does not expose names, dates of birth or document numbers
  without the code step.

## Verification

- Unit tests: the shared wording source, the five state descriptions, the period sentence appearing
  identically in both renderings.
- A scripted end-to-end asserting each email is sent once, at the right transition, to the verified
  address.
- A negative test that a status request with a wrong or foreign reference reveals nothing.
- A manual walk of the whole ordered path on a phone, which is where these words will actually be
  read.
