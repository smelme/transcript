# Getting Started with Transcript System

Welcome! This guide will get you up and running in under 30 minutes.

## Quick Links
- 📋 **Full Setup**: See [SETUP.md](SETUP.md)
- 📚 **System Plan**: See [docs/SYSTEM_PLAN.md](docs/SYSTEM_PLAN.md)
- 🤝 **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)
- 📦 **Tech Stack**: Node.js, Kotlin, React, PostgreSQL, Keycloak

---

## 5-Minute Setup

### 1. Prerequisites
```bash
# Check Node version (need ≥18.17.0)
node --version

# Check npm version (need ≥9.0.0)
npm --version
```

### 2. Install & Start
```bash
# Clone and navigate
git clone <repo-url>
cd Transcript

# Install all dependencies
npm install

# Start Docker services (PostgreSQL, Keycloak)
docker-compose up -d

# Start development servers
npm run dev
```

### 3. Access Services
| Service | URL | Credentials |
|---------|-----|-------------|
| **Issuer Frontend** | http://localhost:5173 | Use Keycloak login |
| **Verifier Frontend** | http://localhost:5174 | Use Keycloak login |
| **Issuer Backend** | http://localhost:3002 | - |
| **Verifier Backend** | http://localhost:3003 | - |
| **Keycloak** | http://localhost:8080 | admin / admin |
| **PostgreSQL** | localhost:5432 | transcript_user / transcript_password |

---

## Project Structure

```
Transcript/ (monorepo)
├── issuer-service/         # Backend: Credential issuance (Node.js/Express)
├── issuer-frontend/        # Admin UI (React)
├── verifier-service/       # Backend: Verification (Node.js/Express)
├── verifier-frontend/      # Verifier UI (React)
├── mobile-wallet/          # Mobile app (Kotlin Multiplatform)
├── docs/                   # Documentation
├── .github/                # GitHub workflows
├── SETUP.md               # Detailed setup guide
├── CONTRIBUTING.md        # Development guidelines
└── README.md              # This project overview
```

---

## Development Workflow

### 1. Create Feature Branch
```bash
# Story: issuer-define-transcript-schema (ID: P0-1)
git checkout -b feature/P0-1-transcript-schema
```

### 2. Make Changes
```bash
# Edit code in your chosen workspace
# Run tests frequently during development
npm run test --workspaces

# Check code style
npm run lint --workspaces
npm run format --workspaces
```

### 3. Commit & Push
```bash
# Commit with story reference
git commit -m "[P0-1] Define mDoc credential schema

- Add namespace definition
- Add field validation
- Add unit tests

Closes #123"

git push origin feature/P0-1-transcript-schema
```

### 4. Create Pull Request
- Go to GitHub
- Open PR against `main`
- Link to GitHub story/issue
- Get review approval
- Merge via GitHub

---

## Common Commands

```bash
# Install dependencies (all workspaces)
npm install

# Start development (all services)
npm run dev

# Run tests
npm run test --workspaces

# Run linter
npm run lint --workspaces

# Format code
npm run format --workspaces

# Build for production
npm run build --workspaces

# Docker: Start PostgreSQL + Keycloak
docker-compose up -d

# Docker: Stop services
docker-compose down
```

---

## Phase 1 Focus (Next 12 Weeks)

We're implementing the **core MVP** with 13 key features:

**Issuer Service**
1. Define credential schema
2. Admin issuance portal UI
3. mDoc generation & signing
4. Credential storage

**Wallet App**
5. QR scanning & credential reception
6. Credential display UI
7. Mobile authentication (biometric/PIN)

**Verifier Service**
8. QR scanning interface
9. Signature validation & revocation checks
10. Result display UI
11. Verifier registry

**Protocol/Infrastructure**
12. ISO mDoc protocol implementation
13. Key management system

See [docs/SYSTEM_PLAN.md](docs/SYSTEM_PLAN.md) for full details.

---

## Need Help?

### Setup Issues
- Check [SETUP.md](SETUP.md) troubleshooting section
- Ensure Docker services are running: `docker-compose ps`
- Verify environment variables in `.env` files

### Development Questions
- Read [CONTRIBUTING.md](CONTRIBUTING.md)
- Check [docs/SYSTEM_PLAN.md](docs/SYSTEM_PLAN.md) for architecture
- Review README.md in each service folder

### Bug Reports
- Open GitHub issue
- Include error message and steps to reproduce

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   Issuer Portal                          │
│              (Admin issues credentials)                  │
│                    React UI                              │
│              issuer-frontend:5173                        │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                 Issuer Service                           │
│          (Credential generation & storage)               │
│            Node.js/Express:3002                          │
└──────────┬──────────────────────────────────────────────┘
           │
           ├─────────┬──────────────────┬──────────────────┐
           │         │                  │                  │
           ▼         ▼                  ▼                  ▼
        Student   Wallet App       QR Code            Database
        receives  (Kotlin MP)       (ISO18013-5)       (PostgreSQL)
        QR code   stores cred      for sharing
        via email
           │
           │  Scans QR at
           ▼  verification
        ┌──────────────────────────────────────────────────┐
        │             Wallet App                           │
        │      (Mobile credential storage)                 │
        │   Kotlin MP (iOS & Android)                      │
        │  - Encrypted local storage                       │
        │  - Biometric/PIN auth                            │
        │  - Generate presentation QR                      │
        └──────────┬──────────────────────────────────────┘
                   │
                   │  Student shares
                   │  presentation QR
                   ▼
        ┌──────────────────────────────────────────────────┐
        │           Verifier Portal                        │
        │      (Employer verifies credential)              │
        │                React UI                          │
        │           verifier-frontend:5174                 │
        └──────────┬──────────────────────────────────────┘
                   │
                   ▼
        ┌──────────────────────────────────────────────────┐
        │          Verifier Service                        │
        │   (Signature & revocation checks)                │
        │          Node.js/Express:3003                    │
        │  - Validate ED25519 signature                    │
        │  - Check revocation list                         │
        │  - Verify expiry                                 │
        │  - Check policies                                │
        └──────────────────────────────────────────────────┘
```

---

## Next Steps

1. ✅ Complete setup above
2. ✅ Run `npm run test --workspaces` to verify everything works
3. 📖 Read [docs/SYSTEM_PLAN.md](docs/SYSTEM_PLAN.md) for architecture details
4. 📋 Check GitHub Projects for Phase 1 stories
5. 🚀 Pick a P0 story and start implementing

---

## Key Resources

- [Full System Plan](docs/SYSTEM_PLAN.md)
- [Setup Guide](SETUP.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [ISO 18013-5:2021](https://www.iso.org/standard/69084.html) - mDoc standard
- [waltid Reference Implementation](https://github.com/walt-id)
- [Keycloak Documentation](https://www.keycloak.org/documentation)

---

**Status**: 🟢 Ready for Phase 1 Development  
**Last Updated**: 2026-08-27  
**Questions?** Check SETUP.md or open an issue
