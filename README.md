# ISO mDoc Academic Transcript & Qualification System

**Status**: Planning & Setup Phase  
**Created**: 2026-08-27

## Overview

A complete end-to-end system for issuing, storing, and verifying academic transcripts and qualifications using the ISO mDoc standard (ISO/IEC 18013-5:2021).

## Repository Structure

This is a monorepo containing all components:

```
Transcript/
├── issuer-service/          # Backend: Credential issuance & management (Node.js/Express)
├── issuer-frontend/         # Web UI: Admin portal for issuing credentials
├── verifier-service/        # Backend: Credential verification (Node.js/Express)
├── verifier-frontend/       # Web UI: Employer/verifier verification interface
├── mobile-wallet/           # Mobile App: Student wallet to store & share credentials (Kotlin Multiplatform)
├── docs/                    # Documentation & planning
├── .github/                 # GitHub workflows, issue templates
├── package.json             # Monorepo root (npm workspaces)
└── README.md                # This file
```

## System Components

### 1. **Issuer Service** (`issuer-service/`)
Node.js/Express backend for credential issuance.

**Responsibilities:**
- Define credential schemas (transcripts, qualifications)
- Generate mDoc credentials with ED25519 signatures
- Store issued credentials in database
- Manage credential revocation
- Provide credential distribution APIs
- Audit logging for compliance

**Tech Stack:** Node.js, Express, PostgreSQL, ED25519 signing

---

### 2. **Issuer Frontend** (`issuer-frontend/`)
Web UI for university admins to issue credentials.

**Responsibilities:**
- Keycloak-protected admin portal
- Single credential issuance form
- Bulk upload (CSV with student data)
- Credential preview before issuance
- QR code generation & download
- Credential distribution tracking

**Tech Stack:** React/Vue, Keycloak OIDC integration

---

### 3. **Verifier Service** (`verifier-service/`)
Node.js/Express backend for credential verification.

**Responsibilities:**
- Validate mDoc signatures (ED25519)
- Check revocation status
- Verify credential expiry
- Enforce verification policies
- Store verification audit logs (GDPR-compliant)
- Manage verifier registry

**Tech Stack:** Node.js, Express, PostgreSQL

---

### 4. **Verifier Frontend** (`verifier-frontend/`)
Web UI for employers/institutions to verify credentials.

**Responsibilities:**
- QR code scanner (wallet presentation)
- Verification result display
- Verification history & policy configuration
- Audit log review
- Verifier registration & profile management

**Tech Stack:** React/Vue, Keycloak OIDC integration

---

### 5. **Mobile Wallet** (`mobile-wallet/`)
Native mobile app for students to store and share credentials.

**Responsibilities:**
- QR code scanner for credential reception (issuer delivery)
- Encrypted local storage of credentials (device-bound)
- Biometric/PIN authentication
- Credential display & management
- QR presentation mode for sharing with verifiers
- Selective disclosure (choose which fields to share)
- Audit log of credential shares

**Tech Stack:** Kotlin Multiplatform Mobile (Android & iOS), encrypted device storage

---

## Technology Stack

### Backend
- **Runtime:** Node.js ≥18.17.0
- **Framework:** Express.js
- **Database:** PostgreSQL
- **Authentication:** Keycloak (OAuth2/OIDC)
- **Signing:** ED25519 keys (libsodium/tweetnacl.js)
- **Standards:** ISO/IEC 18013-5:2021 (mDoc), OpenID4VC (Phase 2)

### Frontend
- **Admin/Verifier UI:** React or Vue.js (TBD)
- **Authentication:** Keycloak OIDC
- **QR Scanning:** qr-scanner or jsQR library

### Mobile
- **Language:** Kotlin Multiplatform Mobile
- **Platforms:** iOS (via Swift) & Android
- **Storage:** Encrypted (Keystore/Keychain)
- **Camera:** Native QR scanner

### DevOps
- **Deployment:** Railway (existing infrastructure)
- **CI/CD:** GitHub Actions (TBD)
- **Version Control:** Git (GitHub)

---

## Getting Started

### Prerequisites
- Node.js ≥18.17.0
- npm ≥9.0.0
- PostgreSQL ≥13
- Keycloak instance (for local dev: docker-compose setup)
- Git

### Quick Start

```bash
# Clone repo and install all dependencies
git clone <repo-url>
cd Transcript
npm install

# Start development servers (all workspaces)
npm run dev

# Build all packages
npm run build

# Run tests
npm run test

# Lint & format
npm run lint && npm run format
```

### Environment Setup

Each service requires environment variables. See individual `README.md` files in each workspace for configuration details.

---

## Development Phases

### Phase 1: Core MVP (P0)
13 features across all components (~10-12 weeks)

**Key deliverables:**
- ✅ Credential schema definition
- ✅ Admin issuance portal
- ✅ mDoc generation & signing
- ✅ Wallet credential reception & storage
- ✅ Verifier QR scanning & validation
- ✅ Full end-to-end workflow

### Phase 2: Production-Ready (P1)
8 features (~4-6 weeks)

**Key deliverables:**
- ✅ Credential distribution channels
- ✅ Revocation system
- ✅ Selective disclosure
- ✅ Verification policies
- ✅ GDPR-compliant audit logging

### Phase 3: Advanced (P2)
Future enhancements (multi-issuer, SIS integration, etc.)

---

## Documentation

- **[System Plan](docs/ISO_MDOC_TRANSCRIPT_SYSTEM_PLAN.md)** - Complete architecture, features, roadmap
- **[GitHub Issues](docs/GITHUB_ISSUES_TEMPLATE.md)** - Issue templates for all stories (Phase 1 & 2)
- **[Architecture Decision Records](docs/adr/)** - Technical decisions & rationale (TBD)

---

## Contributing

### Git Workflow
- Always create feature branches (never commit to `main`)
- Feature branch naming: `feature/story-id-short-description` or `fix/issue-id`
- All changes go through Pull Requests with review/approval
- See `.github/workflows/` for CI/CD requirements

### Story-Gated Development
Development is organized by GitHub stories/issues. Before starting work:
1. Ensure a story exists in GitHub Projects
2. Link your branch to the story
3. Complete one story at a time (don't multitask across stories)
4. Mark complete when all acceptance criteria are met

### Code Quality
- [ ] Tests written for new features (minimum 70% coverage)
- [ ] Lint passes (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] No console.log or debug statements left in code
- [ ] Security audit passed (dependencies up to date)

---

## Security Considerations

### Key Management
- Issuer private keys stored securely (environment variables, HSM-ready)
- Public keys distributed to verifiers for signature validation
- Regular key rotation policy documented

### Credential Signing
- ED25519 signature scheme (EDDSA)
- Signatures immutable and tamper-evident
- Revocation checks performed during verification

### Data Protection
- Wallet credentials encrypted on device (AES-256)
- TLS 1.3 for all API communication
- Selective disclosure prevents unnecessary data exposure
- GDPR-compliant audit logging (minimal retention)

### Compliance
- FERPA (Family Educational Rights and Privacy Act)
- GDPR (General Data Protection Regulation)
- Regular security audits & penetration testing

---

## Support & Issues

- **Bug Reports:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Documentation:** See `docs/` folder

---

## License

ISC (see LICENSE file)

---

**Last Updated:** 2026-08-27  
**Maintainers:** Smart College team  
**Status:** Planning phase — ready for Phase 1 kickoff
