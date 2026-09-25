# P0-38: Quals reviews a request

**Status:** Not started
**Components:** `quals-portal` (new Manual requests section), `issuer-service` (queue, detail,
decision, evidence access, notifications)
**Depends on:** P0-36, P0-37
**Blocks:** P0-39 (nothing is issued without an accepted decision)

## The change

The Quals portal today manages credentials, sharing, wallet accounts, API keys and audit. There is
nowhere to see that a person has asked for something, and nowhere to record that the institution
agreed. This story adds the queue, the case, the decision, and the notification that says there is
work to do.

| Step | Who | What |
| --- | --- | --- |
| 1 | issuer | emails the operator when a request is submitted: a link to the case, not a spreadsheet |
| 2 | operator | opens **Manual requests** and sees the queue: status, age, school, applicant, fee |
| 3 | operator | opens one case: identity result and evidence, personal details, what was asked for, the fee and the events |
| 4 | operator | records **accepted** or **declined** with a reason, and the decision names who decided and when |
| 5 | issuer | tells the applicant, and either moves the case to the payload step or starts the refund |

## Decisions taken

**The queue is a section of the existing portal, not a new application.** It uses the portal's
session, its shell, its navigation and its proxy, and it is scoped to the administrator's
organisation exactly as credentials and API keys already are. A new app would mean a second sign-in
for the same person.

**The decision is recorded, not inferred.** `reviewed_by`, `reviewed_at`, the reason and the note are
stored on the request, in the same spirit as the academy's `admissions_decisions`. Issuing reads that
decision; it does not read a status that somebody could set by hand in another system.

**Evidence is opened through one audited route.** Every view writes an event with the administrator's
identity, because looking at somebody's passport is a thing that should be recorded. Evidence is
never bundled into the case payload.

**Ageing is part of the queue, not a report.** A request sitting in review is the queue's failure,
so the queue shows age by default and reminders go to the owner at two and five working days.

**Declining is a complete outcome.** A declined request tells the applicant, returns the fee, and
closes. It is not a limbo state and it is not a silent stop.

## What stays the same

- Every existing portal section behaves as before, including its scoping and its audit trail.
- The portal's proxy is a pass-through, so no route allowlist has to be maintained.
- Credentials, sharing, revocation and API keys are untouched.

## Acceptance criteria

- A submitted request appears in the queue within one page refresh, with its age in working days.
- An administrator of one institution cannot see or act on another institution's requests, on the
  list or on the detail, including by guessing an id.
- The case shows: identity outcome, the extracted fields, the evidence, the applicant's details, what
  was asked for, the fee and its state, and the full event history.
- A decision requires a reason, records the administrator and the time, and cannot be recorded
  twice: the second attempt is refused.
- Accepting moves the case to the payload step and tells the applicant; declining returns the fee
  and tells the applicant.
- A request in review beyond the promise is visible as overdue, and reminders are sent to the owner.
- Evidence access is written to the event history, naming the administrator and the file.

## Verification

- Unit tests: decision requires a reason, one decision per request, scoping refused for a foreign
  request id, evidence access logged.
- A scripted end-to-end: submit, notify, list, open, decide, and assert the applicant's email and the
  refund path.
- A negative test for cross-institution access on both the list and the detail route.
- A manual walk of the queue on a phone, since a reviewer will open it on one.
