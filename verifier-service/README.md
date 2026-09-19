# Verifier Service

Backend service for credential verification and validation.

## Overview

The Verifier Service is responsible for:
- Validating mDoc signatures (ED25519)
- Checking credential revocation status
- Verifying credential expiry
- Enforcing verification policies
- Storing verification audit logs (GDPR-compliant)
- Managing verifier registry

## Quick Start

```bash
npm install
npm run dev
```

Environment variables: See `.env.example`

## API Endpoints

(TBD - see Phase 1 stories for implementation details)

- `POST /api/verify` - Verify credential from wallet
- `GET /api/revocation/list` - Get revocation list
- `GET /api/verifier/profile` - Get verifier profile
- `POST /api/policies` - Create verification policy
- `GET /api/audit-logs` - Get verification logs

## org-iso-mdoc presentation (W3C Digital Credentials API)

The reusable verifier exposes a one-time, replay-protected presentation flow backed
by the same library the Smart College verifier uses (`id-verifier`):

- `POST /presentation/sessions`. Creates a short-lived session and an
  `org-iso-mdoc` request (`deviceRequest` + `encryptionInfo`) for
  `navigator.credentials.get()`.
- `POST /presentation/sessions/:id/response`. Decrypts and verifies the wallet's
  encrypted Annex C `DeviceResponse` (HPKE + device signature + issuer signature
  + claim digests), consumes the session, and returns only server-verified claims:
  `name`, `institution`, `degreeLevel`, `graduationDate`.

### Issuer trust

- By default, trust follows `id-verifier`'s `trusted-issuer-registry` (same as the
  Smart College verifier).
- For fail-closed pinned trust, set `TRUSTED_ACADEMIC_ISSUER_SHA256` to a
  comma-separated list of hex SHA-256 fingerprints of the DER-encoded issuer
  certificates allowed to sign academic credentials:

  ```bash
  # openssl x509 -in issuer.pem -outform DER | sha256sum
  TRUSTED_ACADEMIC_ISSUER_SHA256=abc123...,def456...
  ```

  When set, any presented credential whose IssuerAuth leaf certificate does not
  match a pin is rejected.

## Tech Stack

- Express.js
- PostgreSQL
- `id-verifier` (HPKE, device auth, issuer auth, claim digest verification)
- `cbor2`

## Development

See main repository README and system plan for full context.
