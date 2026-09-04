# Issuer Frontend (Next.js)

Admin portal for issuing ISO 23220 Photo ID mDOC credentials.

## Tech Stack

- **Framework:** Next.js (React, App Router)
- **Language:** TypeScript
- **Runtime:** Node.js >= 20.9.0 (see `.nvmrc`)
- **API:** proxies `/api/*` to the issuer-service (`http://localhost:3000` by default, override with `ISSUER_API_URL`)

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3002

## Structure

```
app/
├── layout.tsx      # Root layout + metadata
├── page.tsx        # Issuance form + result display
├── globals.css     # Global styles
└── lib/
    └── api.ts      # Typed API client for the issuer-service
```

## Pages

- `/` — Single credential issuance (Photo ID) with live mdoc verification.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ISSUER_API_URL` | `http://localhost:3000` | Issuer-service base URL (used by rewrites) |

## Notes

- The mdoc payload returned by the issuer is held in-memory only with a
  configurable session timeout (default 10 minutes) — retrieve it via
  `GET /credentials/:id/mdoc` before it expires.
