# Phase 1 (P0) GitHub Issues - Ready to Create

Copy/paste each issue into GitHub or use GitHub CLI: `gh issue create -t "..." -b "..." -l "P0,phase-1,component"`

---

## P0-1: Define mDoc Credential Schema for Academic Transcripts

**Title**: Define mDoc Credential Schema for Academic Transcripts  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Issuer Service  
**Effort**: M (Medium - 1 week)  
**Labels**: `P0`, `phase-1`, `issuer`, `schema`

### Description
Define the mDoc namespace and credential schema for academic transcripts and qualifications. This is the foundational data model for the entire system.

### Acceptance Criteria
- [ ] mDoc namespace defined: `org.smartcollege.academic`
- [ ] Credential schema includes: studentId, name, institution, courses (array with name, code, grade, credits), GPA, issueDate, expiryDate
- [ ] Schema validation logic implemented (TypeScript/Node.js)
- [ ] Schema versioning strategy documented
- [ ] Database migration created for credential_schemas table
- [ ] Unit tests for schema validation (minimum 80% coverage)
- [ ] Documentation: Schema definition with examples
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Use JSON Schema for schema definition
- Store in PostgreSQL as JSONB
- Consider future extensibility for additional credential types
- Reference: ISO/IEC 18013-5 mDoc specification

### Dependencies
None (blocking other stories)

### Related Issues
- P0-2: issuer-admin-issuance-portal
- P0-3: issuer-generate-mdoc-credentials
- P0-4: issuer-credential-storage

---

## P0-2: Build Admin Portal for Credential Issuance

**Title**: Build Admin Portal for Credential Issuance  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Issuer Frontend  
**Effort**: L (Large - 2 weeks)  
**Labels**: `P0`, `phase-1`, `issuer-frontend`, `ui`

### Description
Create a Keycloak-protected web interface for university admins to issue credentials. This is the primary interface for admins to interact with the system.

### Acceptance Criteria
- [ ] Admin interface protected by Keycloak role (`issuer_admin`)
- [ ] Single issuance form: upload student data (JSON), preview, issue
- [ ] Bulk upload via CSV: student records with transcripts
- [ ] Preview screen: shows credential data before issuance
- [ ] Confirmation dialog with audit info (who, when)
- [ ] Success screen with credential ID and QR code download option
- [ ] Error handling for invalid/incomplete data
- [ ] Form validation (client-side + server-side)
- [ ] UI responsive on desktop/tablet
- [ ] Loading states and error messages
- [ ] Unit tests for form logic (minimum 70% coverage)
- [ ] E2E tests for happy path
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Use React with Vite
- Keycloak OIDC integration for authentication
- File upload handling for CSV
- Real-time form validation
- API calls to issuer-service backend

### Dependencies
- P0-1: issuer-define-transcript-schema
- P0-3: issuer-generate-mdoc-credentials (API endpoint)

### Related Issues
- P0-3: issuer-generate-mdoc-credentials
- P0-4: issuer-credential-storage

---

## P0-3: Implement mDoc Credential Generation Engine

**Title**: Implement mDoc Credential Generation Engine  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Issuer Service  
**Effort**: L (Large - 2 weeks)  
**Labels**: `P0`, `phase-1`, `issuer`, `core`

### Description
Generate signed mDoc credentials and QR codes for wallet request. This is the core credential generation logic.

### Acceptance Criteria
- [ ] Parse credential schema and student data
- [ ] Generate mDoc structure (ISO 18013-5 compliant)
- [ ] Sign credential with issuer's ED25519 key
- [ ] Generate wallet request QR code (ISO 18013-5 device engagement format)
- [ ] Store credential in issued_credentials table
- [ ] Validate ED25519 signature (unit tests)
- [ ] QR code encodes: issuer endpoint, credential data, nonce
- [ ] Error handling: invalid data, signature failures
- [ ] API endpoint: POST /api/admin/credentials/issue
- [ ] Credential ID generation (UUID)
- [ ] Timestamp recording (issued_at, expires_at)
- [ ] CBOR encoding of mDoc structure
- [ ] Unit tests for generation logic (minimum 80% coverage)
- [ ] Integration tests with wallet-receive-credentials
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Use `cbor2` library for CBOR encoding
- Use `jose` or `tweetnacl.js` for ED25519 signing
- Store issuer private key securely (env var)
- QR code library: `qr-code` or `qrcode`
- Nonce generation for replay protection
- Reference: waltid implementation

### Dependencies
- P0-1: issuer-define-transcript-schema
- P0-13: protocol-key-management
- P0-12: protocol-mdoc-request-response

### Related Issues
- P0-4: issuer-credential-storage
- P0-5: wallet-receive-credentials

---

## P0-4: Design and Implement Credential Storage Database

**Title**: Design and Implement Credential Storage Database  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Issuer Service  
**Effort**: M (Medium - 1 week)  
**Labels**: `P0`, `phase-1`, `issuer`, `database`

### Description
Database schema and ORM for storing issued credentials with audit trail.

### Acceptance Criteria
- [ ] Database tables created: credential_schemas, issued_credentials, revocation_list, issuance_audit_log
- [ ] ORM models (Sequelize or TypeORM) for all tables
- [ ] Audit logging: every credential action (created, read, updated, deleted) logged
- [ ] Indexes on student_id, status, issued_at for performance
- [ ] Foreign key relationships enforced
- [ ] Timestamps (created_at, updated_at) on all tables
- [ ] Database migrations automated (Flyway or Knex)
- [ ] Queries optimized for common filters
- [ ] Database connection pooling configured
- [ ] Unit tests for ORM models (minimum 70% coverage)
- [ ] Integration tests with live DB
- [ ] Backup/restore tested
- [ ] Documentation: ER diagram
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- PostgreSQL ≥13
- Use migrations for schema versioning
- Consider encryption at rest for sensitive fields
- Performance queries: GetCredentialsByStudentId, GetByStatus
- Soft deletes for audit compliance

### Dependencies
- P0-1: issuer-define-transcript-schema

### Related Issues
- P0-3: issuer-generate-mdoc-credentials
- P0-9: verifier-signature-validation

---

## P0-5: Implement Credential Reception in Wallet App

**Title**: Implement Credential Reception in Wallet App  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Mobile Wallet  
**Effort**: L (Large - 2 weeks)  
**Labels**: `P0`, `phase-1`, `wallet`, `core`

### Description
QR code scanner and credential reception from issuer in the mobile wallet.

### Acceptance Criteria
- [ ] QR code scanner UI (camera integration, Kotlin Multiplatform)
- [ ] Parse ISO 18013-5 wallet request QR codes
- [ ] Establish connection with issuer (HTTPS)
- [ ] Request credential from issuer endpoint
- [ ] Receive credential data and signature
- [ ] Validate signature (using issuer's public key)
- [ ] Store credential encrypted on device (Keystore/Keychain)
- [ ] Show success/error dialog
- [ ] Handle network errors gracefully
- [ ] Handle camera permission requests (iOS/Android)
- [ ] Display credential info after reception
- [ ] Unit tests for QR parsing and validation
- [ ] Integration tests with issuer-generate-mdoc-credentials
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Kotlin Multiplatform Mobile (iOS + Android)
- Use `CameraX` or native camera APIs
- QR scanning library compatible with Kotlin MP
- HTTPS certificate pinning
- Device key generation and storage
- Reference: multipaz wallet implementation

### Dependencies
- P0-3: issuer-generate-mdoc-credentials (API)
- P0-12: protocol-mdoc-request-response
- P0-13: protocol-key-management

### Related Issues
- P0-6: wallet-display-credentials
- P0-7: wallet-mobile-authentication

---

## P0-6: Build Credential Display and Management UI

**Title**: Build Credential Display and Management UI  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Mobile Wallet  
**Effort**: M (Medium - 1-2 weeks)  
**Labels**: `P0`, `phase-1`, `wallet`, `ui`

### Description
Display stored credentials with detail views and management in the mobile wallet.

### Acceptance Criteria
- [ ] Home screen: List all credentials (thumbnail/card layout)
- [ ] Card shows: credential type, institution, issue date, expiry
- [ ] Detail view: Full credential data, formatted nicely
- [ ] Sorting: By credential type, institution, date
- [ ] Search/Filter: Find credentials by keyword
- [ ] Delete action: Remove credential from wallet (confirmation dialog)
- [ ] Offline support: Display credentials without network
- [ ] Responsive layout (iOS/Android)
- [ ] Accessibility: Text labels, colors, touch targets (WCAG 2.1)
- [ ] Performance: Load 100+ credentials smoothly
- [ ] Empty state: Message when no credentials
- [ ] Refresh action: Manually refresh credential list
- [ ] Unit tests for UI logic (minimum 70% coverage)
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Kotlin Multiplatform Compose or native frameworks
- Lazy loading for large credential lists
- Local caching of decrypted credentials (session)
- Dark mode support
- Haptic feedback on interactions

### Dependencies
- P0-5: wallet-receive-credentials

### Related Issues
- P0-7: wallet-mobile-authentication
- P0-10: wallet-qr-presentation

---

## P0-7: Implement Mobile Wallet Authentication (Biometric/PIN)

**Title**: Implement Mobile Wallet Authentication (Biometric/PIN)  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Mobile Wallet  
**Effort**: M (Medium - 1-2 weeks)  
**Labels**: `P0`, `phase-1`, `wallet`, `security`

### Description
Local authentication to unlock wallet on device using biometric or PIN.

### Acceptance Criteria
- [ ] Biometric auth: Fingerprint/Face recognition (native iOS/Android)
- [ ] PIN fallback: 6-digit PIN if biometric unavailable
- [ ] Session management: Auto-lock after 5 minutes inactivity
- [ ] Lock screen UI: Shows lock icon, biometric prompt
- [ ] Credential encryption: Wallet data encrypted with device key
- [ ] Secure key storage: Use Keystore (Android) / Keychain (iOS)
- [ ] Error handling: Failed auth attempts tracked (max 5, then lockout)
- [ ] Lockout duration: 15 minutes after max failed attempts
- [ ] Settings: Allow user to change PIN, disable/enable biometric
- [ ] Recovery: Forgot PIN flow with security questions (optional Phase 2)
- [ ] Unit tests: Auth flow, session timeout, encryption
- [ ] Integration tests: Full login/logout flow
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Kotlin Multiplatform support for iOS/Android
- Use BiometricPrompt API (Android) / LocalAuthentication (iOS)
- AES-256 encryption with device-bound keys
- Secure random PIN generation
- No PIN stored in plaintext

### Dependencies
- P0-5: wallet-receive-credentials
- P0-6: wallet-display-credentials

### Related Issues
- P0-11: wallet-qr-presentation

---

## P0-8: Implement QR Scanning in Verifier Service

**Title**: Implement QR Scanning in Verifier Service  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Verifier Frontend  
**Effort**: M (Medium - 1-2 weeks)  
**Labels**: `P0`, `phase-1`, `verifier`, `ui`

### Description
Web interface for verifiers to scan wallet presentation QR codes.

### Acceptance Criteria
- [ ] Web interface: Keycloak-protected (verifier role)
- [ ] QR code scanner: Live camera feed or file upload
- [ ] Parse presentation QR code (ISO 18013-5)
- [ ] Establish device engagement with wallet
- [ ] Request credential from wallet
- [ ] Receive credential data and signature
- [ ] Validate signature (using issuer's public key)
- [ ] Store received credential data (temporary, for this verification only)
- [ ] Error handling: Invalid QR, timeout, signature failure
- [ ] Accessibility: Camera permissions, error messages
- [ ] Loading state: Show "Waiting for wallet..." during device engagement
- [ ] Timeout handling: 60-second timeout with retry option
- [ ] Unit tests for QR parsing (minimum 70% coverage)
- [ ] Integration tests: Full scanning flow
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- React frontend with Vite
- QR Scanner library compatible with React
- HTTPS connection to verifier-service backend
- Real-time status updates (WebSocket or polling)
- Responsive design for desktop/mobile

### Dependencies
- P0-12: protocol-mdoc-request-response
- P0-13: protocol-key-management

### Related Issues
- P0-9: verifier-signature-validation
- P0-10: verifier-result-display

---

## P0-9: Implement Credential Signature Validation

**Title**: Implement Credential Signature Validation  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Verifier Service  
**Effort**: L (Large - 2 weeks)  
**Labels**: `P0`, `phase-1`, `verifier`, `core`

### Description
Cryptographic validation of mDoc signatures and revocation checks.

### Acceptance Criteria
- [ ] Load issuer's public key (from key registry)
- [ ] Validate ED25519 signature on credential
- [ ] Check credential not revoked (query revocation_list)
- [ ] Check credential not expired (compare issueDate, expiryDate)
- [ ] Verify issuer identity (optional: cert chain validation)
- [ ] Return detailed verification result (valid/invalid/revoked/expired)
- [ ] Log verification attempt (verifier_id, credential_id, result, timestamp)
- [ ] Performance: Verification < 2 seconds
- [ ] Caching: Cache issuer public keys (1 hour TTL)
- [ ] Caching: Cache revocation list (5 minute TTL)
- [ ] API endpoint: POST /api/verify
- [ ] Error handling: Invalid signature, missing issuer key
- [ ] Unit tests: Signature validation, revocation checks, expiry
- [ ] Integration tests with issuer-credential-storage
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- Use `jose` or `tweetnacl.js` for ED25519 verification
- CBOR decoding of mDoc structure
- Database queries optimized for performance
- Revocation list caching strategy
- Public key registry in database

### Dependencies
- P0-4: issuer-credential-storage (for revocation list)
- P0-13: protocol-key-management (public key registry)

### Related Issues
- P0-10: verifier-result-display
- P0-8: verifier-qr-scanning

---

## P0-10: Build Verification Result UI

**Title**: Build Verification Result UI  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Verifier Frontend  
**Effort**: M (Medium - 1 week)  
**Labels**: `P0`, `phase-1`, `verifier`, `ui`

### Description
Display verification results to verifier after validation.

### Acceptance Criteria
- [ ] Result screen: Status badge (✓ Valid / ✗ Invalid)
- [ ] Show verified claims: Name, Institution, Degree/GPA, dates
- [ ] Timestamp: When verification occurred
- [ ] Reason for invalid: Expired, revoked, signature mismatch, issuer unknown
- [ ] Color coding: Green for valid, red for invalid
- [ ] Download option: PDF/JSON report of verification result
- [ ] Print option: For physical records
- [ ] Return to scan: Button to scan another credential
- [ ] Mobile responsive: Work on desktop/tablet/phone
- [ ] Accessibility: Color-blind friendly, clear messaging
- [ ] Loading state: Show while verifying
- [ ] Error messages: Clear, actionable error descriptions
- [ ] Unit tests for result formatting (minimum 70% coverage)
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- React component for result display
- PDF generation library (e.g., `pdfkit` or similar)
- Timestamp formatting
- Print CSS media queries
- Fallback for print-unfriendly displays

### Dependencies
- P0-9: verifier-signature-validation

### Related Issues
- P0-8: verifier-qr-scanning
- P0-11: verifier-audit-logging

---

## P0-11: Implement Verifier Registry and Authorization

**Title**: Implement Verifier Registry and Authorization  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Verifier Service  
**Effort**: M (Medium - 1 week)  
**Labels**: `P0`, `phase-1`, `verifier`, `database`

### Description
Database and API for managing authorized verifiers and access control.

### Acceptance Criteria
- [ ] Database table: verifiers (id, name, organization, email, certificate, status, keycloak_id)
- [ ] Keycloak integration: Auto-create verifier record on first login
- [ ] Admin UI: List/add/edit/deactivate verifiers (restricted to super-admin)
- [ ] Verifier self-service: Update profile (name, organization)
- [ ] Certificate management: Verifiers can upload/update their certificate
- [ ] Status tracking: Active/inactive verifiers
- [ ] API: Get verifier info (for audit logging)
- [ ] Soft delete: Deactivate instead of delete (keep audit trail)
- [ ] Authorization: Only verifiers can scan/verify
- [ ] Database migration and schema
- [ ] Unit tests: CRUD operations, authorization
- [ ] Integration tests: Keycloak sync
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- PostgreSQL table: verifiers
- Keycloak user mapping (sub → verifier.keycloak_id)
- Auto-provisioning on first login
- Role-based access control (RBAC)
- Audit trail for admin actions

### Dependencies
None (independent)

### Related Issues
- P0-9: verifier-signature-validation
- P0-17: verifier-audit-logging (Phase 2)

---

## P0-12: Implement ISO 18013-5 mDoc Protocol

**Title**: Implement ISO 18013-5 mDoc Protocol  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Protocol / Shared  
**Effort**: XL (Extra Large - 3+ weeks)  
**Labels**: `P0`, `phase-1`, `protocol`, `core`

### Description
Core mDoc protocol: QR code generation, parsing, device engagement, credential transfer. This is a blocking story for wallet and verifier.

### Acceptance Criteria
- [ ] Wallet request QR code: Encode issuer endpoint, nonce, request details
- [ ] Presentation QR code: Wallet generates for verifier scanning
- [ ] Device engagement: Establish secure channel between wallet and verifier
- [ ] Proximity check: Detect wallet presence (optional in Phase 1)
- [ ] HTTPS channel: Secure credential transfer (TLS 1.3)
- [ ] CBOR encoding: Encode/decode mDoc structures
- [ ] COSE signatures: Sign/verify with ED25519
- [ ] QR code library: Package as shared library (Node.js + Kotlin)
- [ ] Documentation: Protocol flow diagrams
- [ ] API reference documentation
- [ ] Unit tests: QR generation, parsing, CBOR encoding, COSE signatures
- [ ] Integration tests: Full protocol flow (issuer → wallet → verifier)
- [ ] Performance tests: QR scanning latency < 500ms
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- ISO/IEC 18013-5:2021 specification
- CBOR encoding library: `cbor2` (Node.js), `cbor-kotlin` (Kotlin)
- COSE library: `cose-js` or equivalent
- QR code generation: `qr-code` or similar
- Protocol flow: Device Request → Device Response → Credential Presentation
- Nonce generation for replay protection

### Dependencies
None (blocking for others)

### Related Issues
- P0-3: issuer-generate-mdoc-credentials
- P0-5: wallet-receive-credentials
- P0-8: verifier-qr-scanning

---

## P0-13: Implement Key Management (ED25519, Certificate Handling)

**Title**: Implement Key Management (ED25519, Certificate Handling)  
**Priority**: P0 (Phase 1 MVP)  
**Component**: Protocol / Infrastructure  
**Effort**: L (Large - 2 weeks)  
**Labels**: `P0`, `phase-1`, `protocol`, `security`

### Description
Key generation, storage, rotation, and certificate management for credentials signing.

### Acceptance Criteria
- [ ] Issuer key generation: ED25519 key pair creation (secure, one-time setup)
- [ ] Key storage: Issuer private key stored securely (env var or HSM ready)
- [ ] Public key registry: Store issuer public key in database (for verifiers)
- [ ] Key rotation process: Documented (future-proof design)
- [ ] Certificate generation: Optional x509 cert for enhanced validation
- [ ] Verifier keys: Each verifier can have optional public key (for future)
- [ ] Security: Private keys never logged, no exposure in errors
- [ ] CLI tool: Generate keys for new issuers (development/ops use)
- [ ] Documentation: Key management best practices
- [ ] Database table: public_keys (issuer_id, key, algorithm, created_at)
- [ ] Key versioning: Support key rollover
- [ ] Unit tests: Key generation, export, import
- [ ] Security review: No key leakage
- [ ] Code lint passes
- [ ] Code formatted

### Technical Notes
- ED25519 keys (EDDSA)
- OpenSSL or libsodium for key generation
- PEM format for key storage
- Environment variable: ISSUER_PRIVATE_KEY
- Database: Store public keys for distribution to verifiers
- CLI: `npm run generate-issuer-keys`
- HSM integration ready (but not required for Phase 1)

### Dependencies
None (infrastructure foundation)

### Related Issues
- P0-3: issuer-generate-mdoc-credentials
- P0-9: verifier-signature-validation
- P0-5: wallet-receive-credentials

---

## Summary: All 13 P0 Stories

| # | Story ID | Title | Component | Effort | Status |
|---|----------|-------|-----------|--------|--------|
| 1 | P0-1 | Define mDoc Credential Schema | Issuer Service | M | 🔴 Not Started |
| 2 | P0-2 | Build Admin Portal | Issuer Frontend | L | 🔴 Not Started |
| 3 | P0-3 | Implement mDoc Generation Engine | Issuer Service | L | 🔴 Not Started |
| 4 | P0-4 | Credential Storage Database | Issuer Service | M | 🔴 Not Started |
| 5 | P0-5 | Credential Reception in Wallet | Mobile Wallet | L | 🔴 Not Started |
| 6 | P0-6 | Credential Display UI | Mobile Wallet | M | 🔴 Not Started |
| 7 | P0-7 | Mobile Authentication | Mobile Wallet | M | 🔴 Not Started |
| 8 | P0-8 | QR Scanning in Verifier | Verifier Frontend | M | 🔴 Not Started |
| 9 | P0-9 | Signature Validation | Verifier Service | L | 🔴 Not Started |
| 10 | P0-10 | Result Display UI | Verifier Frontend | M | 🔴 Not Started |
| 11 | P0-11 | Verifier Registry | Verifier Service | M | 🔴 Not Started |
| 12 | P0-12 | mDoc Protocol Implementation | Protocol | XL | 🔴 Not Started |
| 13 | P0-13 | Key Management System | Protocol | L | 🔴 Not Started |

**Total Phase 1 Effort**: ~13-14 weeks (full-stack team)

---

## How to Create These Issues

### Option 1: GitHub Web UI (Manual)
1. Go to your Transcript repo on GitHub
2. Click "Issues" tab
3. Click "New Issue"
4. Copy/paste each issue above into the form
5. Add labels: `P0`, `phase-1`, `{component}`
6. Assign to team member

### Option 2: GitHub CLI (Batch)
```bash
gh issue create -t "P0-1: Define mDoc Credential Schema for Academic Transcripts" \
  -b "$(cat issue-p0-1.md)" \
  -l "P0,phase-1,issuer,schema" \
  -a "@team-member"
```

### Option 3: GitHub API
```bash
curl -X POST https://api.github.com/repos/smelme/transcript/issues \
  -H "Authorization: token $GITHUB_TOKEN" \
  -d '{
    "title": "P0-1: Define mDoc Credential Schema",
    "body": "...",
    "labels": ["P0", "phase-1", "issuer"]
  }'
```

---

**Ready to create issues in GitHub? Let me know when you've created them and we can start assigning stories to team members for Phase 1 kickoff!**
