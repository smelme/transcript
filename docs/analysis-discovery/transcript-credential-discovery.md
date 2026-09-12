# Transcript credentials — discovery

Scope: let a student hold a **qualification** credential, a **transcript** credential, or
both; let Smart Academy manage and issue them; let an academic relying party
(Trust University) request a transcript during registration; and let the holder share
a transcript by email through the same verification path as today.

## What already exists

| Area | State |
|---|---|
| Credential contents | One mdoc per issuance, docType `org.iso.23220.photoid.1`, carrying up to three namespaces: `org.iso.23220.photoid.1` (identity), `org.iso.23220.education.qualification.1`, `org.iso.23220.education.transcript.1` (student id, courses, total credits, status). |
| Transcript data | Fully modelled: `credential-generator.js` synthesises courses, credits and grades; `buildPhotoIDMdoc` encodes the transcript namespace, including a flat JSON `courses` string chosen for mdoc-debugger portability. |
| Issuance | `POST /academy/requests` generates **one** record containing qualification *and* transcript and creates **one** issuance session. The holder has no say in what is issued. |
| Status list | Per-credential status index, published and cryptographically enforced. Any new credential type inherits this unchanged. |
| Sharing | `share-service.js` already defines the `transcript` category mapped to the transcript namespace, and the portal already labels it. Sharing is one credential at a time. |
| Relying parties | `verifier-frontend` is the "My Jobs" portal (`relyingPartyId: 'myjob'`), creating sessions with **no** `docType`/`nameSpaces`, so it always receives the default academic request. `verifier-service` accepts `docType` and `nameSpaces` per session. |
| Wallet | `mobile-wallet` registry publishes credentials from its secure store; there is no notion of a credential *kind* beyond what the mdoc contains. |

## Gaps

1. **No transcript credential.** A holder who needs only a transcript must take the
   qualification too, and an academic RP has nothing specifically to request.
2. **No choice at issuance.** `generateAcademicRecord` returns one record; the
   academy flow creates one session.
3. **docType is hard-coded.** `buildPhotoIDMdoc`, `issueForSession` and
   `share-service.verifierCreateSession` all assume `org.iso.23220.photoid.1`, so a
   second credential type would be mislabelled on issue, in the registry, and in the
   verifier session it is shared through.
4. **Management view cannot tell types apart.** The portal lists credentials without a
   kind, so a Smart Academy administrator cannot see what was issued as what.
5. **No academic RP.** Trust University does not exist; nothing exercises a transcript
   request end to end.
6. **Wallet shows one undifferentiated list**, and its share flow is driven by
   categories that are not tied to a credential kind.

## Unknowns to settle before building

- **Identity in the transcript credential.** Settled: the transcript is issued as a
  photo-ID document, so it carries the same personal components as a qualification, with
  the grades in their own namespace (`org.iso.23220.education.transcript.1`).
- **`id-verifier` behaviour for a non-photoid docType**: whether it validates a
  transcript docType and returns its namespace claims unchanged (to be proven by the
  Trust University story, not assumed).
- **Android wallet claim path**: whether the claim flow rejects a docType it does not
  know (to be checked in the wallet story).

## Risks

- Changing the *existing* qualification credential's docType would invalidate
  credentials already in wallets and break the My Jobs RP. The design must be
  additive.
- Two credentials per student means two status indexes, two registry rows and two
  claims; tests that assume one credential per issuance session need updating.
- Sharing currently hard-codes the docType, so a transcript share would silently
  request the wrong credential until that is fixed.
