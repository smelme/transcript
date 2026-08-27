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

## Tech Stack

- Express.js
- PostgreSQL
- ED25519 (jose/tweetnacl)
- CBOR decoding

## Development

See main repository README and system plan for full context.
