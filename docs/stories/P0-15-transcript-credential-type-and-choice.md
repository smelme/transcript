# P0-15: Transcript credential type and issuance choice

**Priority:** P0 — foundation for every other transcript story
**Status:** Done — issuer, generator, registry, offer and share session all report the kind,
verified by the unit suite, `scripts/test-academy-flow.mjs` and
`scripts/smoke-share-transcript.mjs`. Deliverable pending: none.
**Components:** Issuer service, credential generator, issuance sessions, share session creation
**Protocol:** ISO/IEC 18013-5 mdoc; W3C Digital Credentials API `org-iso-mdoc`

## User story

As a student, I want to be issued a qualification credential, a transcript credential, or
both, so that I hold exactly what I need and a registrar can ask for my transcript
without receiving qualification claims I did not offer.

## Scope

- Both kinds are issued as a photo-ID document (`org.iso.23220.photoid.1`) carrying the
  holder's personal components; the academic namespace decides the kind:
  `org.iso.23220.education.qualification.1` or `org.iso.23220.education.transcript.1`
  (the grades). The existing qualification credential is unchanged.
- Namespace assembly follows the record: a qualification credential never carries the
  grades, and a transcript credential never carries qualification claims.
- `POST /academy/requests` accepts `include`: `qualification` (default), `transcript`, or
  `both`, and creates one issuance session per requested kind.
- The kind is reported explicitly (`kind`, `label`, `academicNamespaces`) because the
  docType is shared, and it is recorded on the credential.
- `GET /academy/credentials` reports `kind`, `label`, `docType` and `academicNamespaces`
  per entry.

## Acceptance criteria

1. Requesting `transcript` yields exactly one mdoc with docType
   `org.iso.23220.photoid.1` containing the personal namespace and the transcript
   namespace, and **no** qualification namespace.
2. Requesting `qualification` yields today's credential in structure (personal +
   qualification namespaces).
3. Requesting `both` yields two credentials, each with its own status index, registry row
   and independent revocation.
4. An unknown or absent `include` behaves as `qualification`.
5. `POST /credentials/issue` rejects a body whose docType is not a known document type.
6. The registry row, the returned `kind`, the credential offer and the share session all
   name the credential's actual document type and kind.
7. Revocation and status-list behaviour are unchanged for both kinds.
8. A credential holding both academic namespaces (issued before the choice existed) is
   reported as `academic` rather than mislabelled as one kind.

## Explicit non-goals

- No change to the existing qualification docType or to credentials already issued.
- No academy, portal, relying-party or wallet UI work (P0-16 … P0-20).
- No change to the verifier service.

## Dependencies and blockers

- None. This story unblocks the others.

## Delivery increments

1. Generator returns one record per kind, each with its own docType, display metadata and
   kind label.
2. Per-kind namespace assembly in the mdoc builder; docType threaded through issue, claim
   and share.
3. Academy request accepts and validates the choice, creating one session per kind.
4. Tests: generator, per-kind mdoc contents, both-kinds revocation independence, and the
   existing academy flow updated to assert the docType it receives.

## Definition of done

All acceptance criteria are verified by unit tests and the end-to-end academy flow, the
documented choice is visible in the API response and the emitted email, and the change is
committed on a feature branch for pull-request review.
