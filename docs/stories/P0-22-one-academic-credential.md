# P0-22: One academic credential per holder, not one per kind

**Priority:** P0. This is the shape of the credential itself; later changes to it cost more
**Status:** **In progress. Both decisions resolved 2026-09-18.** Increments 1-3 are implemented
(generator, issuer, wallet, academy app, portal); the disclosure test (criterion 3) and the
architecture-note rewrite are outstanding, and the end-to-end scenario suite has not been run
against the change yet
**Raised by:** the academy, 2026-09-18
**Supersedes:** the split introduced by P0-15 (`P0-15-transcript-credential-type-and-choice.md`)
**Components:** credential generator, issuer service, wallet, academy app, portal, e2e scripts,
architecture note

## What is being asked

Issue a holder's qualification and transcript as **one** credential - a single photo-ID document
carrying both academic namespaces - instead of two documents. Two cases must keep working:

- **A short course**: a certificate with no transcript, so a qualification on its own.
- **A programme in progress**: grades so far, with no award yet, so a transcript on its own.

## What the system does today

`requestedKinds('both')` returns `['qualification', 'transcript']` and the generator maps that to two
records, so "both" means two credentials, two claims, two offers and two statuses. That split came
from P0-15, whose stated goal was that *a relying party must never receive qualification claims it
did not ask for (or the reverse)*.

## Why the reasoning changes, not just the code

That goal is a property of **disclosure**, and the disclosure layer already guarantees it
independently of how many documents exist:

- The verifier asks for namespaces and the fields within them
  (`buildItemsRequestBytes`, `ACADEMIC_NAME_SPACES`).
- The wallet filters the stored mdoc to exactly the requested namespaces and fields
  (`MdocResponseBuilder.build`, step 4) - it never sends a namespace that was not asked for.

So splitting the document was one way to reach the goal, not the only way; the same guarantee holds
for a combined document, and it is testable in one place. Everything the split cost - two statuses,
two offers, two claims, a wallet holding overlapping records for one study - is then unnecessary.

The split also brought a benefit worth naming before we undo it: **independent revocation**. See
decision 2.

## The model that is proposed

| Case | Namespaces in the single document |
| --- | --- |
| Qualification only (short course, certificate) | photo-ID + qualification |
| Transcript only (study in progress) | photo-ID + transcript + academic record |
| Combined (the default for a completed programme) | photo-ID + qualification + transcript + academic record |

`include` keeps its meaning for the single-kind cases; `both` changes from "two documents" to "one
document holding both".

## What has to change

### 1. Credential generator - `issuer-service/src/credential-generator.js`

- `requestedKinds('both')` becomes one record rather than two. The record assembly at the end of
  `generateAcademicRecord` currently maps kinds to records and copies `spec.academicField`; a
  combined record copies both blocks plus `education_academic_record`.
- `CREDENTIAL_KINDS` gains the combined kind explicitly (`academic`) so labels and namespaces come
  from one table rather than being special-cased.
- `kindOfCredentialData` and `labelOfCredentialData` already return `academic` /
  "Qualification and transcript" for a document holding both, and `academicNamespacesOf` already
  returns every namespace a document holds. Both stay.
- `display.title` needs a combined form (today it is per-kind: "Academic transcript - Bachelor of
  Psychology" or the programme title).
- `academicNamespace` (singular), which the issuer passes around per record, becomes the list
  `academicNamespaces` end to end.

### 2. Issuer service - `issuer-service/src/index.js`

- The mdoc builder is already namespace-driven: `education_qualification`,
  `education_transcript` and `education_academic_record` each have their own mapper and each is
  optional, so a document carrying all three builds with no new encoding work.
- Per-record plumbing that assumes one namespace: `academicNamespace: record.academicNamespace`
  (the issuance paths) and the audit/statistics fields, which become lists.
- `findIssuanceSessionsFor` already matches by membership
  (`academicNamespacesOf(session.credentialData).includes(academicNamespace)`), so a claim link for
  either namespace finds a combined credential - which is what we want.
- The reuse rule ("reuse only what we would issue now") already compares whole claim sets, so a
  request for both will no longer reuse a qualification-only credential from an earlier visit.
- `GET /academy/credentials` returns one entry instead of two for `both`.

### 3. Wallet - no structural change, two presentation changes

Already correct and worth not touching: `AcademicNamespaces` has `KIND_BOTH = "academic"`, labels it
"Qualification and transcript", and `namespacesOf(KIND_BOTH)` returns all three namespaces, so
`PresentationEligibility.satisfies` already lets a combined credential answer a qualification-only
request *and* a transcript-only request.

- **The tile** (`ui/Screens.kt`): `isTranscript` currently decides between two layouts, so a combined
  credential takes the qualification branch and loses the module count and credits. It needs a third
  case showing programme, award, courses, credits, status and the issue date.
- **The detail screen** (`ui/Screens.kt`): same, plus the graduation date, which a combined
  credential now has.

### 4. Academy app - `issuer-frontend/app/claim/page.tsx`

The multi-select walk added on 2026-09-13 remains useful when a holder genuinely has several
credentials (a re-issued record, a short course plus a degree), but for `both` there is now one card,
so the "add 2 credentials" case disappears from the common path. Copy and the step-2 heading need
reviewing, and the qualification/transcript wording becomes "your academic credential".

### 5. Portal - `quals-portal`

The Kind column and its filter read the label from `labelOfCredentialData`, which already says
"Qualification and transcript" for a combined document. The by-kind counts need the combined kind
added to the list of known kinds.

### 6. Verifier - no change expected

It requests namespaces and maps claims from whichever namespaces come back
(`presentation-session-service.js`), with no assumption that a credential holds one academic
namespace. A combined credential produces a richer claim set for the same request, which is the
intended outcome. The pinned-issuer and status checks are per-document and unaffected.

### 7. Tests and scripts

- `issuer-service/scripts/test-academy-flow.mjs` asserts three times that `include: 'both'` yields
  two credentials; those become one, and a new check covers the two single-kind cases.
- Generator tests that count `records` for `both` (and the wallet tests around `kindOf`) are updated.
- **One new test is not optional**: presenting a combined credential to a verifier that asks only
  for the qualification namespace must disclose the qualification namespace **and nothing from the
  transcript**. This is the property the split used to guarantee structurally, and it is now the
  thing that could silently regress.

### 8. Documentation

- `docs/architecture/transcript-credential-architecture.md` lists this exact option as **Rejected**,
  with the reasoning above. That row is the record of a decision this story reverses, so it is
  rewritten to state the selected design and why disclosure, not document count, is what protects
  the relying party.
- `docs/stories/P0-15-...md` is marked superseded, pointing here.
- The US-conventions note and the P0-21 verification section both describe a per-kind credential and
  need a sentence each.

## Compatibility

- Credentials already issued keep working. The read paths (`kindOfCredentialData`,
  `academicNamespacesOf`, the wallet's `kindOf`, the verifier's claim mapping) are driven by which
  namespaces are present, so a document carrying one academic namespace and a document carrying
  three are both read correctly.
- Nothing is re-encoded and no key rotation is needed: an mdoc with three namespaces is ordinary
  ISO/IEC 18013-5.
- A holder who already has two separate documents keeps both until they are re-issued. Whether the
  system should offer to supersede them is decision 1.

## Trade-offs, stated plainly

- **One status covers both facts** (decision 2). Revoking a combined credential revokes the award
  and the transcript together. With two documents they could be revoked separately.
- **A re-issue is all-or-nothing**: correcting one mark in a transcript reissues the qualification
  too, with a new credential id and a new issue date.
- **`courses` remains one all-or-nothing element**, unchanged either way: a holder cannot disclose
  two modules from a transcript, because the course list is a single element.
- **A larger document**: a presentation that asks for qualification fields still carries the
  transcript bytes to the verifier (they are not disclosed, but they are in the response). This is
  the standard selective-disclosure trade-off and is worth a size check during implementation.

## Decisions needed

Answered by the academy on 2026-09-18:

1. **For a study in progress**: there will be an **operational flow to revoke the old credential**
   and issue the new combined one. So no automatic supersede: an operator revokes through the
   portal (which records a reason and makes verifiers reject it immediately) and the combined
   credential is then issued. The reuse logic therefore stays as it is, and a holder's wallet keeps
   the revoked transcript-only credential until they delete it or the combined one replaces it in
   a reissue.
2. **Revocation granularity**: revoking revokes the **document** - transcript, qualification and
   personal components together - not individual namespaces. This is the simpler design, and it is
   what the implementation assumes: one status per credential, carried in the signed MSO. The
   per-namespace alternative is explicitly not needed.

Consequences worth keeping in view: a re-issue is all-or-nothing, so correcting one mark reissues
both halves with a new credential id and issue date; and a holder who has had a credential revoked
will still see it in their wallet until they remove it, because the wallet cannot check status
offline.

## What has been implemented (2026-09-18)

- **Generator** (`credential-generator.js`): `CREDENTIAL_KINDS` now describes three shapes -
  `qualification`, `transcript`, `academic` - each declaring the claim blocks it copies
  (`dataFields`) and the academic namespaces it holds (`academicNamespaces`). `requestedKinds('both')`
  returns `['academic']`, so a request for both produces **one** record carrying the qualification,
  transcript and academic-record blocks. `academicNamespacesOf` now reads the blocks a credential
  actually carries, which also makes it agree with the wallet about the transcript's supplement.
- **Issuer** (`index.js`): the per-record `academicNamespace` is now `academicNamespaces`, both in
  the session plumbing and in the `/academy/requests` response (and therefore in the app's type).
  The session pre-filter uses the record's first namespace; the claim-set comparison remains what
  decides whether a credential is reusable.
- **Wallet**: a combined credential gets its own card and detail layout showing programme, award,
  courses, credits, outcome, graduation and issue date, and `entrySubtitle` describes it as
  "programme · Graduated date · courses · credits" without repeating the level.
- **Academy app**: the claim page filters by **namespace** rather than kind, which fixes a real bug
  the change would otherwise have introduced - a combined credential is no longer `kind:
  'transcript'`, so a student following a transcript link would have seen nothing. Copy updated.
- **Portal**: the combined kind is filterable and labelled "Qualification and transcript".
- **Scripts and tests**: `test-academy-flow.mjs` updated to the combined model (three checks that
  asserted two credentials now assert one holding both namespaces); issuer tests updated.

Outstanding: the disclosure test in criterion 3, the architecture-note decision row, marking P0-15
superseded, and a live run of the scenario suite and a device run.

## Follow-up: "there is only one kind now" (2026-09-18)

The academy's next instruction was that there is only one kind, so the transcript/qualification
distinction should go. Done so far, committed as `556b4e9`:

- The wallet card is titled by the holder, not by a kind label, and its detail screen has no Kind row.
- The system credential chooser entry is the holder's name: one kind means the prefix said nothing.
- The academy's claim card carries no kind badge (the claim link already selects by namespace).

**Decision taken while the academy was unavailable**, because the two readings differ in cost and one
of them is not safe:

- The **request-time input stays**, but it now means *what the record contains* rather than which kind
  to issue. It has to: the demo generator synthesises the award and the study from the student id, so
  without an input saying otherwise every credential would contain both halves - and the two cases the
  academy asked for (a short course with no transcript, a study in progress with no award) would stop
  being representable. Removing the input is only safe once the academy supplies real data that says
  whether an award exists and whether there are grades.
- The **two-type modelling goes**: kinds as types, their labels, the portal's Kind column and filter,
  and the `kind` field carried through the API, audit entries and statistics.

Remaining work, in order, with the files each touches:

1. **Generator** (`credential-generator.js`): delete the `CREDENTIAL_KINDS` table; keep an inclusion
   map from the input to the claim blocks it copies; drop `kind` from a record (it keeps
   `academicNamespaces` and a contents label); delete `kindOfCredentialData`, rename
   `labelOfCredentialData` to something that says "contents".
2. **Issuer** (`index.js`, `share-service.js`): the ~50 references to `kind`/`kindLabel` in audit
   entries, the portal listing, statistics and the share flow become `academicNamespaces` plus the
   contents label. Historical rows keep whatever they recorded; nothing is migrated.
3. **Portal**: remove the Kind column and its filter, and the by-kind counts.
4. **Scripts and tests**: `test-academy-flow.mjs` (17 assertions), `smoke-share-transcript.mjs`,
   `test-client-orgs.mjs`, and the issuer tests (37 references).
5. **Docs**: rewrite the architecture note's Rejected row for this option (it is now the selected
   design, and the note must say that disclosure, not document count, protects the relying party),
   mark P0-15 superseded, and add the sentence to the P0-21 verification section.
6. **The disclosure test** (criterion 3) and the live scenario run, which remain the two things that
   make the rest safe to trust.
3. **Scope of this story**: confirm that the short-course (qualification only) and in-progress
   (transcript only) cases stay exactly as they are, and that `both` is the default for a completed
   programme.
4. **Existing two-document holders**: leave them as they are and reissue on request, or actively
   offer a reissue?

## Acceptance criteria

1. A request for `both` creates **one** credential holding the photo-ID, qualification, transcript
   and academic-record namespaces, with one credential id, one status and one offer.
2. A request for `qualification` alone and for `transcript` alone behave exactly as they do today.
3. Presenting the combined credential to a relying party that asks only for qualification fields
   discloses the photo-ID and qualification namespaces and **no transcript field**; and the reverse
   for a transcript-only request. Asserted by test, not by inspection.
4. My Jobs and Trust University both accept the combined credential for their existing requests,
   with no change to what they ask for.
5. The wallet shows one card, labelled "Qualification and transcript", carrying programme, award,
   courses, credits, outcome, graduation and issue date, and the detail screen shows both.
6. The portal lists one credential with the combined kind, and the by-kind counts add up.
7. Credentials issued before this change still verify, still present and still appear correctly.
8. The academy flow script asserts one credential for `both` and passes end to end.

## Delivery increments

1. Generator and issuer: one combined record, `academicNamespaces` as a list, audit/statistics, and
   the generator and flow-script tests updated.
2. Wallet: the third tile and detail layout for the combined kind.
3. Academy app and portal: copy, the single-card claim path, and the combined kind in the counts.
4. Docs: the architecture decision row, P0-15 superseded, and the verification notes.
5. The disclosure test in criterion 3, run against the combined credential end to end.

## Non-goals

- No change to the identity document or to the photo-ID namespace.
- No change to selective disclosure itself, to the status list mechanism, or to the trust model.
- No migration of already-issued credentials, and no re-encoding of stored mdocs.

## Verification

Ready to run once agreed: 78 issuer tests, 61 verifier tests, 29 wallet tests, the nine end-to-end
scenario scripts, the two share smoke tests, and a device run presenting a combined credential to
both relying parties.
