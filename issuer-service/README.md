# Issuer Service

Backend service for credential issuance and management.

## Overview

The Issuer Service is responsible for:
- Defining credential schemas (transcripts, qualifications)
- Generating mDoc credentials with ED25519 signatures
- Storing issued credentials with audit trail
- Managing credential revocation
- Providing credential distribution APIs

## Quick Start

```bash
npm install
npm run dev
```

Environment variables: See `.env.example`

## API Endpoints

(TBD - see Phase 1 stories for implementation details)

- `POST /api/admin/credentials/issue` - Issue new credential
- `GET /api/admin/credentials/:id` - Get credential details
- `DELETE /api/admin/credentials/:id` - Revoke credential
- `GET /api/revocation-list` - Get revocation list (public)

## Tech Stack

- Express.js
- PostgreSQL
- ED25519 (jose/tweetnacl)
- CBOR encoding

## Development

See main repository README and system plan for full context.
