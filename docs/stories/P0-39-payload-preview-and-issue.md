# P0-39: The payload, the preview, and issuing

**Status:** In progress - the file, its validation, the preview and issuing are built and exercised
end to end. The preview is rendered on the screen rather than through `renderSharePdf()`, so the
operator is shown the same fields and modules that will be signed but not yet the finished PDF.
**Components:** `issuer-service` (`src/request-payload.js`, `src/requests.js`), `quals-portal`
(the payload, preview and issue screens), `share-document.js` and `pdf.js` (for the PDF preview)
**Depends on:** P0-38 (an accepted decision)
**Blocks:** P0-40 (nothing is delivered until something is issued)

## The change

There is no way today for an institution to state the record for one holder from a file, and no way
to see what a set of claims would produce before signing it. The ordered path needs both, because
this is the moment the institution asserts the academic fact and Quals signs it.

| Step | Who | What |
| --- | --- | --- |
| 1 | registrar | uploads a CSV for the accepted request |
| 2 | issuer | validates every row, and refuses the whole file if any row fails |
| 3 | registrar | opens the preview: the documents these claims would produce |
| 4 | issuer | refuses to issue until the preview has been opened for this payload |
| 5 | registrar | presses **Issue** |
| 6 | issuer | creates an invitation for the holder and emails them the collection link |
| 7 | holder | collects through the existing page, the existing code step and the existing offer |

## Decisions taken

**The CSV is the institution's assertion, and it is the only source of claims in this path.** The
applicant's form never supplies an academic fact. This is ADR-3, and it is why the payload step is
the centre of this story rather than a convenience.

**All or nothing.** A file with one bad row is refused whole, with a per-row report. A partially
issued request is worse than a rejected file, because the holder would collect half a record.

**The preview is a gate, not a nicety.** Issue is refused until the preview has been rendered for the
current payload, so the operator cannot sign a document they have not seen. This is cheap to
enforce and it is the last place a mistake can be caught before it is cryptographically signed.

**The preview is built from the existing document layout.** `buildShareDocument()` is fed from the
payload's claims and `renderSharePdf()` renders it, so what the reviewer sees is the document the
holder will later be able to share. A second rendering path would drift from the first.

**Issuing produces an invitation.** The ordered path converges on the collection path that already
exists: the same page, the same 30-day window, the same offer. See ADR-2. A second collection
mechanism for ordered credentials is explicitly rejected.

**Issue is idempotent and audited.** Pressing it twice returns the existing invitation rather than
issuing a second credential, and the payload used is kept as the record of what was signed.

## What stays the same

- The single-credential `POST /credentials/issue`, the offer route, the QR, the wallet claim and
  revocation are untouched.
- `POST /issuance/invitations` keeps its contract; this story calls the same model rather than
  adding a parallel one.
- The 30-day expiry rule and its wording are unchanged for an ordered credential.
- The demo generator is not involved in this path at all, and remains fenced as a demo fixture.

## Acceptance criteria

- Uploading a valid CSV for an accepted request stores the claims exactly as sent, with the file
  name, the row count, who uploaded it and when.
- A file with any invalid row is refused whole, and the report names the row and the reason.
- The payload's address must match the request's delivery address; a mismatch is refused.
- The preview renders the documents from these claims, and shows the holder's name, the programme,
  the dates and the modules the claims carry.
- Issue is refused before an accepted decision, before a validated payload, and before a preview has
  been rendered for that payload.
- Issuing creates one invitation, emails the holder a Quals link, and stores the invitation id on the
  request; a second attempt returns the same invitation.
- The credential the holder receives is byte-for-byte the shape of one from the self-service path:
  same docType, same namespaces, same offer.
- Every step writes an event naming the actor and the time.

## Verification

- Unit tests: row validation per column, whole-file refusal, address mismatch, preview-gate refusal,
  idempotent issue, claims stored as sent.
- A pagination test with a record large enough to exceed one PDF page, using the existing document
  tests as the pattern.
- A scripted end-to-end from accepted request to collected credential against the test sites,
  asserting the wallet's claim succeeds and the request's status becomes collected.
- A test that the signed claims are the uploaded claims, not regenerated ones.
