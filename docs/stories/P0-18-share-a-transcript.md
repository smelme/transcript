# P0-18: Share a transcript by email

**Priority:** P0. The holder must be able to disclose a transcript outside an RP website
**Status:** In progress. Increments 1 and 2 are done and covered by
`issuer-service/scripts/smoke-share-transcript.mjs` and `smoke-share.mjs`. Increment 3, the wallet
share entry point, is implemented with P0-20 (the share screen offers only the sections the
credential holds, and its own academic section starts selected); what remains is a device run
**Components:** Issuer share flow, wallet share entry point, share recipient page

## User story

As a student, I want to email my transcript to a registrar or employer and have them
verify it exactly as they verify a shared qualification, so that I do not depend on the
recipient having an account anywhere.

## Scope

- The share session requests the docType of the credential being shared rather than a
  hard-coded photo-ID docType, and the transcript category maps to the transcript
  namespace (already defined).
- A transcript share can be created, opened by the recipient, OTP-verified and viewed
  through the existing flow, with the same revocation enforcement.
- The wallet offers sharing per credential kind and never mixes claims from two
  credentials in one share.

## Acceptance criteria

1. Sharing a transcript credential creates a session with the photo-ID docType and only
   transcript-category namespaces.
2. The recipient sees transcript elements (courses, credits, status) and only the identity
   elements the sender selected.
3. A revoked transcript cannot be shared or viewed; a revoked qualification behaves as
   today.
4. A transcript share of a credential issued **without** a status reference is refused
   (the status check is unchanged and fail-closed).
5. The share PDF and view page label the credential by kind.

## Explicit non-goals

- No new share transport, no change to recipient OTP handling, no share of two
  credentials at once.

## Dependencies and blockers

- Requires P0-15 for the transcript docType and for the share session to stop hard-coding
  `org.iso.23220.photoid.1`.
- The wallet's share entry point is delivered with P0-20.

## Delivery increments

1. **Done:** share session uses the credential's own namespaces and docType, and
   `smoke-share-transcript.mjs` shares a transcript to a registrar and checks that the grades
   arrive while no qualification claims are disclosed.
2. **Done:** the share records the credential's kind when it is created (the academic namespace
   decides it, since both kinds share the docType), and the recipient view, the PDF and the
   recipient email are labelled with it. A share created before this was recorded keeps the neutral
   title rather than being given a guess.
3. Wallet share entry point per kind (P0-20).

## Verification

- `issuer-service/scripts/smoke-share-transcript.mjs`. The recipient is told they have been sent an
  academic transcript (`kind: transcript`, `kindLabel: Academic transcript`), and the downloaded PDF
  carries that label in its bytes; the grades still arrive with no qualification claims disclosed.
- `issuer-service/scripts/smoke-share.mjs`. The qualification path is unchanged (claims, view and
  PDF all still pass).
- 66 issuer unit tests and 58 verifier tests pass; `issuer-frontend` type-checks clean.

## Definition of done

An end-to-end transcript share is demonstrated (create → email → OTP → view) with a
revoked-transcript negative case, and the change is submitted for review.
