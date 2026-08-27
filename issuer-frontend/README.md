# Issuer Frontend

Admin portal for university administrators to issue academic credentials.

## Overview

The Issuer Frontend provides:
- Keycloak-protected admin interface
- Single credential issuance form
- Bulk upload (CSV import)
- Credential preview
- QR code generation & download
- Distribution tracking

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Pages

(TBD - see Phase 1 stories for implementation details)

- `/dashboard` - Admin dashboard
- `/issue` - Single credential issuance
- `/bulk-upload` - Bulk CSV upload
- `/credentials` - View issued credentials
- `/history` - Issuance audit log

## Tech Stack

- React 18
- Vite
- Keycloak OIDC
- Axios

## Development

See main repository README and system plan for full context.
