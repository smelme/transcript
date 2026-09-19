# P0-27 — Credential offer over DCAPI, or the standard underneath it

## Problem

The offer travels by our own QR code and custom scheme, and the claim happens at our own
`POST /wallet/issuance`. That works, but the contract is ours alone: no other wallet can claim from
Smart Academy, and branding and claim labels live in the wallet instead of coming from the issuer.

The ask: transfer the offer via DCAPI instead of the QR code.

## Finding

There is **no settled standard for issuance over DCAPI**. The W3C Digital Credentials API draft
covers issuance (`navigator.credentials.create()`, protocol id `openid4vci-v1`) but its own protocol
table points at *"OpenID4VCI 1.0 § Coming Soon — ISSUE: API Integration"* — the payload is not yet
defined. OpenID4VCI 1.0 (final, 16 Sept 2025) defines offers by value and by reference, and says
outright that communicating them directly to a wallet is out of scope.

What *is* final is the protocol beneath: OpenID4VCI's metadata, token endpoint, credential endpoint
and notification endpoint. We implement the hard part (mdoc, device binding, status lists) and are
missing the OAuth-shaped envelope around it.

Full assessment, including the offer-payload differences and the standards-aligned display metadata:
`docs/analysis-discovery/dcapi-issuance.md`.

## Decision

Sequence it the other way round from the ask:

1. **Phase 1 — conform to OpenID4VCI 1.0.** Issuer metadata, a real Credential Offer, a Token
   Endpoint, a Credential Endpoint with `proofs.jwt`, and the Notification Endpoint. Keep the
   existing `/wallet/issuance` path while the wallet moves across. Final spec, testable today, and
   it is a prerequisite for Phase 2 regardless.
2. **Phase 2 — offer transfer over DCAPI**, behind a flag, with the QR kept as a first-class path
   rather than a nominal fallback. The draft's payload definition is isolated behind one adapter so
   it can be re-pointed without touching claim logic.

## Acceptance criteria

- An conformant OpenID4VCI wallet can discover the issuer, take a Credential Offer, exchange the
  pre-authorized code, and receive the mdoc — without any Smart College-specific endpoint.
- The offer the academy issues is a valid Credential Offer (`credential_configuration_ids`,
  `nonce` not in the grant), and the re-issue marker survives as an extension parameter.
- Institution card name, colours, logo and claim labels come from issuer metadata, so the wallet's
  hard-coded institution table becomes a fallback rather than the source.
- The wallet notifies `credential_accepted`, and the issuer records it against the session.
- With DCAPI unavailable (any browser today), the QR and app-link paths behave exactly as now.

## Blocked / unknown

- The DC API issuance `data` payload is an **open issue in the W3C draft**.
- Whether user agents will support issuance: RECOMMENDED, not required.
- **Android-side issuance API unverified** — the two `developer.android.com` pages for issuance
  404'd, so `CreateDigitalCredentialRequest` availability in the wallet's `androidx.credentials`
  version and the Android version it needs are both unchecked. Resolve before estimating Phase 2.
