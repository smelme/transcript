# DEVELOPMENT SETUP GUIDE

## Prerequisites

- Node.js ≥18.17.0
- npm ≥9.0.0 (or yarn/pnpm)
- PostgreSQL ≥13 (local or Docker)
- Git
- Docker & Docker Compose (optional, for local Keycloak)

## Quick Start (All Services)

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd Transcript
npm install
```

This installs dependencies for all workspaces (issuer-service, issuer-frontend, verifier-service, verifier-frontend).

### 2. Environment Variables

Create `.env` files in each service directory:

**issuer-service/.env**
```
NODE_ENV=development
PORT=3002
DATABASE_URL=postgresql://user:password@localhost:5432/transcript_issuer
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=transcript
KEYCLOAK_CLIENT_ID=issuer-service
KEYCLOAK_CLIENT_SECRET=<secret>
JWT_SECRET=<your-secret-key>
ISSUER_KEY_PATH=./keys/issuer-private.pem
```

**issuer-frontend/.env**
```
VITE_API_URL=http://localhost:3002
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=transcript
VITE_KEYCLOAK_CLIENT_ID=issuer-frontend
```

**verifier-service/.env**
```
NODE_ENV=development
PORT=3003
DATABASE_URL=postgresql://user:password@localhost:5432/transcript_verifier
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=transcript
KEYCLOAK_CLIENT_ID=verifier-service
KEYCLOAK_CLIENT_SECRET=<secret>
JWT_SECRET=<your-secret-key>
ISSUER_PUBLIC_KEY_PATH=./keys/issuer-public.pem
```

**verifier-frontend/.env**
```
VITE_API_URL=http://localhost:3003
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=transcript
VITE_KEYCLOAK_CLIENT_ID=verifier-frontend
```

### 3. Database Setup

```bash
# Create databases
createdb transcript_issuer
createdb transcript_verifier

# Run migrations (Phase 1: TBD)
# cd issuer-service && npm run migrate
# cd ../verifier-service && npm run migrate
```

Or use Docker:

```bash
docker-compose up -d postgres
```

### 4. Keycloak Setup (Local)

```bash
# Start Keycloak via Docker
docker-compose up -d keycloak

# Access: http://localhost:8080
# Default credentials: admin / admin
```

Then:
1. Create realm: `transcript`
2. Create clients: `issuer-service`, `issuer-frontend`, `verifier-service`, `verifier-frontend`
3. Add users: admin, test-issuer, test-verifier, test-student

### 5. Generate Keys

```bash
# Generate issuer ED25519 keypair
openssl genpkey -algorithm ed25519 -out issuer-service/keys/issuer-private.pem
openssl pkey -in issuer-service/keys/issuer-private.pem -pubout -out verifier-service/keys/issuer-public.pem
```

### 6. Start Development Servers

**Terminal 1: Issuer Backend**
```bash
cd issuer-service
npm run dev
```

**Terminal 2: Issuer Frontend**
```bash
cd issuer-frontend
npm run dev
# Opens http://localhost:5173
```

**Terminal 3: Verifier Backend**
```bash
cd verifier-service
npm run dev
```

**Terminal 4: Verifier Frontend**
```bash
cd verifier-frontend
npm run dev
# Opens http://localhost:5174
```

Or use `npm run dev` from root to start all workspaces.

---

## Development Workflow

### Running Tests

```bash
npm run test --workspaces
```

### Linting & Formatting

```bash
npm run lint --workspaces
npm run format --workspaces
```

### Building for Production

```bash
npm run build --workspaces
```

---

## Docker Compose (Optional)

For complete local environment:

```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Keycloak (port 8080)
- Redis (port 6379, optional)

---

## Project Structure Reference

```
Transcript/
├── issuer-service/         # Node.js/Express backend
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── models/
│   │   └── services/
│   ├── tests/
│   ├── keys/               # ED25519 keys (gitignored)
│   └── package.json
├── issuer-frontend/        # React/Vite admin UI
│   ├── src/
│   │   ├── main.jsx
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   ├── tests/
│   └── package.json
├── verifier-service/       # Node.js/Express backend
├── verifier-frontend/      # React/Vite verifier UI
├── mobile-wallet/          # Kotlin Multiplatform mobile app
├── docs/                   # Documentation
├── .github/                # GitHub workflows, issue templates
├── docker-compose.yml
├── .gitignore
├── package.json            # Monorepo root
└── README.md
```

---

## Common Issues

### "Database connection failed"
- Ensure PostgreSQL is running: `docker-compose up -d postgres`
- Check `DATABASE_URL` in `.env`

### "Keycloak authentication failed"
- Ensure Keycloak is running: `docker-compose up -d keycloak`
- Check realm, client, and credentials

### "Port already in use"
- Change ports in `.env` (3002, 3003, 5173, 5174)
- Kill existing processes: `lsof -ti:3002 | xargs kill -9`

### Node modules issues
- Clear cache: `npm cache clean --force`
- Reinstall: `rm -rf node_modules package-lock.json && npm install`

---

## Next Steps

1. Complete environment setup above
2. Run tests: `npm run test --workspaces`
3. Start dev servers: `npm run dev`
4. Begin Phase 1 stories (see SYSTEM_PLAN.md)

---

**Last Updated**: 2026-08-27  
**Questions?** See README.md or docs/SYSTEM_PLAN.md
