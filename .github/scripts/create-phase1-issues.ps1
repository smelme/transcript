# Create Phase 1 (P0) GitHub Issues for Transcript System
# Usage: powershell -ExecutionPolicy Bypass -File .github/scripts/create-phase1-issues.ps1
# Requires: gh CLI tool installed and authenticated

Write-Host "Creating Phase 1 (P0) GitHub Issues..." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

$REPO = "smelme/transcript"

# P0-1
Write-Host "Creating P0-1..." -ForegroundColor Cyan
$body1 = 'Define mDoc namespace and schema for academic transcripts.

Acceptance Criteria:
o mDoc namespace: org.smartcollege.academic
o Schema includes: studentId, name, institution, courses, GPA, dates
o Schema validation logic
o Schema versioning strategy
o Database migration
o Unit tests (80%+ coverage)
o Code lint passes
o Code formatted

Technical: JSON Schema, PostgreSQL JSONB
Dependencies: None (blocking)
Effort: Medium (1 week)'

gh issue create --repo $REPO --title "P0-1: Define mDoc Credential Schema for Academic Transcripts" --label "P0,phase-1,issuer,schema" --body $body1
Write-Host "OK P0-1 created" -ForegroundColor Green

# P0-2
Write-Host "Creating P0-2..." -ForegroundColor Cyan
$body2 = 'Build Keycloak-protected admin portal for issuing credentials.

Acceptance Criteria:
o Interface protected by issuer_admin role
o Single issuance form (JSON upload)
o Bulk CSV upload
o Preview screen before issuance
o Confirmation dialog
o Success screen with QR download
o Error handling and validation
o UI responsive
o Loading states
o Unit tests (70%+ coverage)
o E2E tests
o Code lint passes
o Code formatted

Technical: React, Vite, Keycloak OIDC
Dependencies: P0-1, P0-3
Effort: Large (2 weeks)'

gh issue create --repo $REPO --title "P0-2: Build Admin Portal for Credential Issuance" --label "P0,phase-1,issuer-frontend,ui" --body $body2
Write-Host "OK P0-2 created" -ForegroundColor Green

# P0-3
Write-Host "Creating P0-3..." -ForegroundColor Cyan
$body3 = 'Generate signed mDoc credentials and QR codes.

Acceptance Criteria:
o Parse schema and student data
o Generate ISO 18013-5 mDoc structure
o Sign with ED25519 issuer key
o Generate wallet request QR
o Store in issued_credentials
o Validate signature
o QR encodes: endpoint, data, nonce
o Error handling
o API endpoint: POST /api/admin/credentials/issue
o UUID credential IDs
o Timestamps
o CBOR encoding
o Unit tests (80%+ coverage)
o Integration tests
o Code lint passes
o Code formatted

Technical: cbor2, jose/tweetnacl.js, qrcode
Dependencies: P0-1, P0-13, P0-12
Effort: Large (2 weeks)'

gh issue create --repo $REPO --title "P0-3: Implement mDoc Credential Generation Engine" --label "P0,phase-1,issuer,core" --body $body3
Write-Host "OK P0-3 created" -ForegroundColor Green

# P0-4
Write-Host "Creating P0-4..." -ForegroundColor Cyan
$body4 = 'Database schema and ORM for credential storage.

Acceptance Criteria:
o Tables: credential_schemas, issued_credentials, revocation_list, audit_log
o ORM models
o Audit logging for all actions
o Indexes on student_id, status, issued_at
o Foreign keys enforced
o Timestamps on all tables
o Migrations automated
o Optimized queries
o Connection pooling
o Unit tests (70%+ coverage)
o Integration tests
o Backup/restore tested
o ER diagram documentation
o Code lint passes
o Code formatted

Technical: PostgreSQL 13+, migrations, soft deletes
Dependencies: P0-1
Effort: Medium (1 week)'

gh issue create --repo $REPO --title "P0-4: Design and Implement Credential Storage Database" --label "P0,phase-1,issuer,database" --body $body4
Write-Host "OK P0-4 created" -ForegroundColor Green

# P0-5
Write-Host "Creating P0-5..." -ForegroundColor Cyan
$body5 = 'QR scanner and credential reception in mobile wallet.

Acceptance Criteria:
o QR scanner UI (Kotlin Multiplatform)
o Parse ISO 18013-5 wallet request QR
o HTTPS connection to issuer
o Request credential from issuer
o Receive data and signature
o Validate signature
o Encrypt and store on device
o Success/error dialogs
o Network error handling
o Camera permissions (iOS/Android)
o Display info after reception
o Unit tests
o Integration tests
o Code lint passes
o Code formatted

Technical: Kotlin MP, CameraX, certificate pinning
Dependencies: P0-3, P0-12, P0-13
Effort: Large (2 weeks)'

gh issue create --repo $REPO --title "P0-5: Implement Credential Reception in Wallet App" --label "P0,phase-1,wallet,core" --body $body5
Write-Host "OK P0-5 created" -ForegroundColor Green

# P0-6
Write-Host "Creating P0-6..." -ForegroundColor Cyan
$body6 = 'Display credentials and management in mobile wallet.

Acceptance Criteria:
o List all credentials
o Card: type, institution, dates
o Detail view with full data
o Sorting by type/institution/date
o Search/filter
o Delete with confirmation
o Offline support
o Responsive (iOS/Android)
o WCAG 2.1 accessible
o Performance: 100+ credentials
o Empty state
o Refresh action
o Unit tests (70%+ coverage)
o Code lint passes
o Code formatted

Technical: Kotlin MP Compose, lazy loading, caching, dark mode
Dependencies: P0-5
Effort: Medium (1-2 weeks)'

gh issue create --repo $REPO --title "P0-6: Build Credential Display and Management UI" --label "P0,phase-1,wallet,ui" --body $body6
Write-Host "OK P0-6 created" -ForegroundColor Green

# P0-7
Write-Host "Creating P0-7..." -ForegroundColor Cyan
$body7 = 'Biometric and PIN authentication for wallet.

Acceptance Criteria:
o Biometric (fingerprint/face)
o PIN fallback (6-digit)
o Auto-lock after 5 min
o Lock screen UI
o Device key encryption
o Secure storage (Keystore/Keychain)
o Failed attempts tracked (max 5)
o 15-min lockout after failures
o Settings to change PIN
o Enable/disable biometric
o Unit tests
o Integration tests
o Code lint passes
o Code formatted

Technical: BiometricPrompt (Android), LocalAuthentication (iOS), AES-256
Dependencies: P0-5, P0-6
Effort: Medium (1-2 weeks)'

gh issue create --repo $REPO --title "P0-7: Implement Mobile Wallet Authentication (Biometric/PIN)" --label "P0,phase-1,wallet,security" --body $body7
Write-Host "OK P0-7 created" -ForegroundColor Green

# P0-8
Write-Host "Creating P0-8..." -ForegroundColor Cyan
$body8 = 'QR scanner in verifier interface.

Acceptance Criteria:
o Keycloak-protected interface
o Live camera or file upload
o Parse ISO 18013-5 QR
o Device engagement with wallet
o Request credential
o Receive data and signature
o Validate signature
o Temporary storage
o Error handling
o Camera permissions
o "Waiting for wallet..." message
o 60-second timeout with retry
o Unit tests (70%+ coverage)
o Integration tests
o Code lint passes
o Code formatted

Technical: React, Vite, QR Scanner, HTTPS, WebSocket/polling
Dependencies: P0-12, P0-13
Effort: Medium (1-2 weeks)'

gh issue create --repo $REPO --title "P0-8: Implement QR Scanning in Verifier Service" --label "P0,phase-1,verifier,ui" --body $body8
Write-Host "OK P0-8 created" -ForegroundColor Green

# P0-9
Write-Host "Creating P0-9..." -ForegroundColor Cyan
$body9 = 'Cryptographic validation of signatures and revocation.

Acceptance Criteria:
o Load issuer public key
o Validate ED25519 signature
o Check not revoked
o Check not expired
o Verify issuer identity
o Return detailed result
o Log verification attempt
o Performance: <2 seconds
o Cache public keys (1 hour TTL)
o Cache revocation list (5 min TTL)
o API endpoint: POST /api/verify
o Error handling
o Unit tests
o Integration tests
o Code lint passes
o Code formatted

Technical: jose/tweetnacl.js, CBOR, caching
Dependencies: P0-4, P0-13
Effort: Large (2 weeks)'

gh issue create --repo $REPO --title "P0-9: Implement Credential Signature Validation" --label "P0,phase-1,verifier,core" --body $body9
Write-Host "OK P0-9 created" -ForegroundColor Green

# P0-10
Write-Host "Creating P0-10..." -ForegroundColor Cyan
$body10 = 'Display verification results.

Acceptance Criteria:
o Status badge (Valid/Invalid)
o Show verified claims
o Timestamp
o Reason if invalid
o Color coding (green/red)
o PDF/JSON report download
o Print option
o Return to scan button
o Mobile responsive
o Color-blind accessible
o Loading state
o Clear errors
o Unit tests (70%+ coverage)
o Code lint passes
o Code formatted

Technical: React, PDF library, print CSS, accessibility
Dependencies: P0-9
Effort: Medium (1 week)'

gh issue create --repo $REPO --title "P0-10: Build Verification Result UI" --label "P0,phase-1,verifier,ui" --body $body10
Write-Host "OK P0-10 created" -ForegroundColor Green

# P0-11
Write-Host "Creating P0-11..." -ForegroundColor Cyan
$body11 = 'Verifier registry and authorization.

Acceptance Criteria:
o Table: verifiers (name, org, email, cert, status, keycloak_id)
o Keycloak integration: auto-create on login
o Admin UI: list/add/edit/deactivate
o Verifier self-service: update profile
o Certificate management
o Status: active/inactive
o API: get verifier info
o Soft delete
o Authorization: only verifiers scan/verify
o Database migration
o Unit tests
o Integration tests
o Code lint passes
o Code formatted

Technical: PostgreSQL, Keycloak mapping, auto-provisioning, RBAC
Dependencies: None
Effort: Medium (1 week)'

gh issue create --repo $REPO --title "P0-11: Implement Verifier Registry and Authorization" --label "P0,phase-1,verifier,database" --body $body11
Write-Host "OK P0-11 created" -ForegroundColor Green

# P0-12
Write-Host "Creating P0-12..." -ForegroundColor Cyan
$body12 = 'Core mDoc protocol implementation.

Acceptance Criteria:
o Wallet request QR (endpoint, nonce, details)
o Presentation QR (wallet to verifier)
o Device engagement (secure channel)
o Proximity check (optional)
o HTTPS (TLS 1.3)
o CBOR encoding/decoding
o COSE signing/verification
o Shared library (Node.js + Kotlin)
o Protocol flow diagrams
o API documentation
o Unit tests: QR, CBOR, COSE
o Integration tests
o Performance: <500ms
o Code lint passes
o Code formatted

Technical: ISO/IEC 18013-5, cbor2, cose-js, qr-code
Dependencies: None (blocking)
Effort: Extra Large (3+ weeks)'

gh issue create --repo $REPO --title "P0-12: Implement ISO 18013-5 mDoc Protocol" --label "P0,phase-1,protocol,core" --body $body12
Write-Host "OK P0-12 created" -ForegroundColor Green

# P0-13
Write-Host "Creating P0-13..." -ForegroundColor Cyan
$body13 = 'Key management for ED25519.

Acceptance Criteria:
o ED25519 key generation
o Secure storage (env/HSM)
o Public key registry
o Key rotation process
o Optional x509 cert
o Optional verifier keys
o Security: no logged keys
o CLI tool for key gen
o Documentation
o Table: public_keys
o Key versioning
o Unit tests
o Security review
o Code lint passes
o Code formatted

Technical: ED25519, OpenSSL, PEM, ISSUER_PRIVATE_KEY
Dependencies: None (foundation)
Effort: Large (2 weeks)'

gh issue create --repo $REPO --title "P0-13: Implement Key Management (ED25519, Certificate Handling)" --label "P0,phase-1,protocol,security" --body $body13
Write-Host "OK P0-13 created" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "All 13 Phase 1 issues created!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host 'View issues at: https://github.com/smelme/transcript/issues' -ForegroundColor Yellow
