# P0-36: Asking for a credential

**Status:** In progress - the case, its states and its audit trail are built; the wizard is not
**Components:** `issuer-service` (request domain: `db.js`, `src/requests.js`), `quals-frontend` (`/request`
wizard), Didit integration
**Depends on:** P0-35 (the door that leads here)
**Blocks:** P0-37, P0-38, P0-39, P0-40

## The change

There is nowhere in Quals to record that somebody has asked for a credential. No table, no state,
no queue, no owner. This story creates the case, and gives the applicant the two things they must do
before anyone can look at it: prove who they are, and say what they need.

| Step | Who | What |
| --- | --- | --- |
| 1 | Quals | opens a request: school, what is wanted, contact details, delivery address |
| 2 | Quals | sends the applicant to the identity check: photo ID, selfie, liveness |
| 3 | Didit | returns a decision and the document's details; the evidence is stored against the request |
| 4 | issuer | keeps the extracted name, date of birth and document reference, and the evidence under its own retention clock |
| 5 | Quals | shows what it holds back to the applicant, so a typo is caught before the institution is asked |
| 6 | issuer | a request exists in a named state with an owner, or the applicant is told exactly what is missing |

## Decisions taken

**The request lives in the issuer service, beside invitations.** Issuing has to be able to refuse,
so the case must live where issuing happens. See ADR-1.

**Identity is done server-side, at Quals.** The academy's `didit-service.js` is the working
integration and its shape is reused, but the session is created and the callback handled in the
issuer service, because the applicant is Quals's to look after. Nothing about the existing academy
KYC flow changes.

**The evidence is kept under its own clock, not the case's.** The extracted fields are what the
reviewer reads; the document images are the liability. Default retention is 90 days after the
decision, or immediately on a declined-and-refunded request. See ADR-6.

**No account is required to start, but the address is verified before payment.** The applicant is
free to begin, and by the time money moves we know the delivery address is theirs — which is what
makes the collection link trustworthy later.

**A request asks for what the applicant wants, and the payload decides what exists.** The wizard
records qualification, transcript or both. The institution may still issue what it holds.

## What stays the same

- The academy's own registration and KYC journeys are untouched.
- The invitations API is untouched. This story adds a table and a wizard, not a second way to issue.
- Nothing about the wallet, the offer or collection changes.

## Acceptance criteria

- A request exists as a record with a state, a creation time, a school and an owner, and every
  change to it writes an event naming an actor and a time.
- The wizard collects school, what is wanted, email, phone and delivery address, and refuses to
  submit with any of them missing.
- Identity cannot be skipped, and a request cannot reach review without a verified identity and a
  verified address.
- Extracted identity fields are shown back to the applicant before submission.
- Evidence is stored with a hash and captured time, is never returned to the applicant, is served to
  a reviewer through one audited route, and is deleted on the retention rule.
- Abandoned requests do not accumulate: a draft with no progress expires and is pruned.
- Three failed identity attempts move the request to manual review rather than a dead end.
- The wizard is usable on a phone at 360px, with the identity check opening from the same flow and
  returning to it.

## Verification

- Unit tests: state transitions and their refusals, retention deletion, evidence access logging, the
  unverified-identity block.
- A scripted end-to-end against the test sites with Didit in mock mode: open, verify, capture,
  review the extracted fields, confirm the block on submitting unpaid.
- A negative test that a request cannot be submitted with an unverified address or a failed
  identity.
- The evidence route checked for organisation scoping: one institution's administrator cannot read
  another's case.
