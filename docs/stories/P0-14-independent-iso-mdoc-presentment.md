# P0-14: Independent ISO mdoc Digital Credentials Presentment

**Priority:** P0 — protocol-completion prerequisite  
**Status:** In progress  
**Components:** Android wallet, independent verifier API, MyJob relying-party website  
**Protocol:** W3C Digital Credentials API `org-iso-mdoc`; ISO/IEC 18013-5 mdoc

## User story

As a student, I want to approve a MyJob request to share the minimum academic claims from my locally stored mdoc using my Android wallet, so that an employer can verify them without either component connecting to Smart College or Multipaz at runtime.

## Scope

- The independent verifier API creates a short-lived, one-time `org-iso-mdoc` presentation request for the four academic claims: full name, institution, degree level, and graduation date.
- The MyJob relying-party website invokes the W3C Digital Credentials API and submits its response to the independent verifier API.
- The Android wallet can receive an eligible presentation request, require biometric or device-credential authentication, clearly disclose the verifier and requested claims, and permit cancellation.
- The verifier validates the complete ISO mdoc `DeviceResponse`, including response encryption, issuer authentication, device authentication, reader authentication, session transcript, request/response correlation, expiry, and replay prevention.
- Only verified, requested claims are returned to the relying party. Raw CBOR, mdoc, and device-response bytes are never rendered in the relying-party UI or retained in presentation/audit records.

## Acceptance criteria

1. The RP uses `navigator.credentials.get()` with protocol `org-iso-mdoc`; it does not use OpenID4VP as the primary flow.
2. Request sessions are random, single-use, expire within five minutes, and cannot be replayed.
3. The verifier request is reader-authenticated and carries an encryption public key and `dcapi` session transcript binding.
4. The wallet will not disclose a credential before biometric or device-credential authentication and explicit consent.
5. Wallet disclosure is limited to requested academic claim identifiers.
6. The verifier rejects malformed CBOR, expired/replayed sessions, wrong transcript/nonce, unauthenticated readers, encrypted-response failures, invalid device signatures, issuer signature/digest failures, untrusted issuer certificates, and unexpected claim disclosure.
7. The RP displays only server-verified claim values, a status, and a timestamp; it has loading, unavailable, cancellation, and error states.
8. Automated tests cover request construction/session state and verifier rejection paths. Android compilation succeeds; an Android device exchange is marked complete only after it has been run successfully with a compatible credential-provider environment.

## Explicit non-goals

- No runtime integration, imports, or API calls to Smart College or Multipaz.
- No client upload of the mdoc storage blob as a replacement for a `DeviceResponse`.
- No issuer changes, database persistence, OpenID4VP flow, or QR proximity transport in this story.
- No claim values stored in verifier logs, analytics, or browser local storage.

## Dependencies and blockers

- A compatible Android digital-credentials provider integration is required for physical-device interoperability.
- Verifier cryptography now uses `id-verifier` (the same vetted library the Smart College verifier uses) for HPKE, session-transcript, device-authentication, IssuerAuth, and claim-digest verification; the previous hand-written Node CBOR/COSE path is removed.
- Reader authentication (`readerAuth`) remains pending: `id-verifier` ships it empty (same as the Smart College verifier) and it requires a configured reader signing key/certificate chain.
- Issuer trust is explicit: the verifier accepts pinned academic issuer certificate fingerprints via `TRUSTED_ACADEMIC_ISSUER_SHA256` (fail-closed when set); it is not trust supplied by a wallet response.

## Delivery increments

1. **Contract and request-session foundation:** complete — session lifecycle, `org-iso-mdoc` request, frontend flow, API tests, and documentation.
2. **Conformant verifier cryptography:** complete for decryption/verification — the encrypted `DeviceResponse` path (HPKE, session transcript, device auth, IssuerAuth, claim digests) is implemented via `id-verifier` and covered by an end-to-end test wallet plus negative tests; reader authentication and a pinned issuer certificate for production remain.
3. **Android holder provider:** implemented — an exported, non-launcher `PresentationActivity` fulfills `org-iso-mdoc` requests via Android Credential Manager, verifies the caller origin, discloses requested claims, requires biometric authentication, filters IssuerSigned fields to the request, builds the device-signed + HPKE-encrypted `DeviceResponse` with the non-exportable Keystore key, and returns only requested claims. Android compilation succeeds. Remaining: physical-device exchange.
4. **Compatibility validation:** execute an independent physical-device presentation (Android provider + browser) and record the compatible Android/browser/provider versions.

## Definition of done

All acceptance criteria are verified, no runtime dependency on the reference systems exists, the implementation is documented, and changes are submitted through a pull request for review before merge.