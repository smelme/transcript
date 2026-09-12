# P0-19: Trust University — transcript at registration

**Priority:** P0 — the academic relying party this feature exists for
**Status:** In progress — the session, the relying-party page and the verifier's transcript claim
mapping are done and verified at the API level, and with P0-21's programme context the page now
shows the institution, programme, award, credits and average. What remains is a real presentation
from the Android wallet, which needs P0-20 on a device
**Components:** Verifier frontend (new relying party), verifier service, wallet presentment

## User story

As a prospective postgraduate student, I want to register with Trust University by
presenting my transcript from my wallet, so that my academic record is verified by the
university without me sending documents or the university contacting Smart Academy.

## Scope

- A Trust University registration page alongside the existing My Jobs portal, sharing the
  same verifier service and the same one-time session model.
- The session requests the photo-ID docType (`org.iso.23220.photoid.1`) with the
  transcript namespace, plus the name elements a registrar needs to identify the applicant.
- The page renders only server-verified claims: applicant name, institution, programme,
  courses with credits, total credits and completion status, with a clear verified state.

## Acceptance criteria

1. The relying party is identified as Trust University in the session (`relyingPartyId`),
   and the request names the photo-ID docType with the transcript namespace - the namespace
   is what limits it to the transcript credential.
2. A wallet holding both kinds is asked for the transcript and discloses only the
   requested namespaces.
3. The verifier validates the DeviceResponse, resolves status from the signed MSO and
   returns only requested claims; the page never renders raw mdoc bytes.
4. An unreachable status list, a revoked transcript, a missing status reference, a replayed
   session and a cancelled request all fail closed with a plain-language message.
5. The registration page has loading, success, cancellation and error states, and states
   which claims were verified and when.
6. My Jobs behaviour is unchanged: it still receives a qualification request.

## Explicit non-goals

- No admissions workflow, no storage of transcript data beyond the session, no change to
  the verifier's cryptography or to Smart Academy's systems.
- No new transport: the W3C Digital Credentials API `org-iso-mdoc` path is used as-is.

## Dependencies and blockers

- Requires P0-15 (transcript credentials exist) and P0-20 (wallet discloses a transcript).
- Unproven: whether `id-verifier` handles a non-photoid docType unchanged. This story
  proves or refutes it; if it refutes it, the blocker and its fix are recorded here.

## Delivery increments

1. Session creation with an explicit docType and namespace set.
2. Registration page with the verified-claims view.
3. Negative tests for status, replay and cancellation; a wallet-held end-to-end run.

## Definition of done

A real presentation from the Android wallet to the Trust University page is completed and
recorded, negative paths are covered by automated checks, and the change is submitted for
review.

## Verification so far

- **The request names the transcript and only the transcript** — verified live against a running
  verifier: the session's `deviceRequest`, decoded, carries docType `org.iso.23220.photoid.1` and
  exactly two namespaces, `org.iso.23220.photoid.1` and `org.iso.23220.education.transcript.1`,
  with no qualification namespace at all, which is what stops a qualification credential being
  presented for a transcript request.
- `verifier-service/tests/e2e-presentation.test.js` — two new tests: the request composition above,
  and a transcript presentation that verifies and reports `studentId`, `totalCredits`,
  `completionStatus` and the course list while `degreeLevel` and `graduationDate` come back `null`
  rather than invented. 60 verifier tests pass.
- `verifier-service/src/presentation-session-service.js` now maps the study's fields into `claims`
  alongside the award fields, so a relying party does not have to read `allClaims` to find them.
- `verifier-frontend`: `/trust-university` renders (verified in the running app), requests only the
  registrar's namespaces, and shows the verified claims, the module table, the verification time
  and distinct loading, cancelled and error states.

## Blocked on

- **A device run**: a real presentation from the Android wallet needs P0-20 installed on a phone.
- The verifier's handling of a non-photoid docType is no longer unproven in the sense this story
  feared: the transcript presentation above is a photo-ID document carrying only the transcript
  namespace, and it verifies and status-checks unchanged.
- **Institution and programme** were waiting on P0-21's programme context and now arrive: the page
  renders `institution`, `programmeTitle`, `awardTitle`, `creditsEarned`, `gpa` with `gpaScaleId`,
  and the module table.
