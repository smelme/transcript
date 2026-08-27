# ISO mDoc Academic Transcript & Qualification System - Feature Plan

**Status**: Planning Phase  
**Date**: 2026-08-27  
**Target**: Feature-gated MVP delivery with phased rollout

---

## 1. SYSTEM OVERVIEW

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    DIGITAL TRANSCRIPT ECOSYSTEM                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   ISSUER     │    │    WALLET    │    │  VERIFIER    │       │
│  │   SERVICE    │───▶│  (Student)   │◀───│ (Employer/   │       │
│  │              │    │              │    │  Relying     │       │
│  │ Node.js/     │    │ Kotlin       │    │  Party)      │       │
│  │ Express      │    │ Multiplatform│    │              │       │
│  │              │    │ (iOS/Android)│    │ Node.js/     │       │
│  └──────────────┘    └──────────────┘    │ Express      │       │
│        │                    │              └──────────────┘       │
│        └────────┬───────────┘                     ▲               │
│                 │                                 │               │
│         ┌───────▼─────────────────────────┐      │               │
│         │   Credential Exchange Protocol  │      │               │
│         │   (ISO mDoc/OpenID4VC hybrid)  │───────┘               │
│         └───────────────────────────────────┘                    │
│                 │                                                 │
│         ┌───────▼──────────────┐                                │
│         │  Credential Database │                                │
│         │  (Verifiable Format) │                                │
│         └────────────────────────┘                              │
│                                                                   │
│  Authentication: Keycloak (reuse Smart College setup)           │
│  Signing: ED25519 keys, x509 certificates                       │
│  Storage: PostgreSQL, encrypted wallet storage                  │
│  Protocol: QR code scanning (ISO18013-5 mdoc reader)           │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack (Reusing Existing)
- **Issuer Backend**: Node.js/Express (Smart College pattern)
- **Wallet**: Kotlin Multiplatform (multipaz base)
- **Verifier**: Node.js/Express (Smart College verification pattern)
- **Authentication**: Keycloak (existing)
- **Database**: PostgreSQL (existing)
- **Signing Library**: libsodium/tweetnacl.js for ED25519
- **mDoc Standard**: ISO/IEC 18013-5:2021 (mdoc standard)
- **Optional**: OpenID4VC for additional flexibility
- **Deployment**: Railway (existing)

### Key Assumptions
1. **Single Issuer MVP** (university admin issues credentials)
2. **User Personas**:
   - University Admin: Issues transcripts and qualifications
   - Student: Stores credentials in wallet, selectively shares
   - Employer/Verifier: Scans QR code or requests credential to verify
3. **Credential Types**: Academic transcripts + qualifications/degrees
4. **Authentication**: Keycloak for issuer/admin portal, mobile wallet native auth
5. **Sharing Model**: Student controls which credentials to share; verifier validates signature

---

## 2. FEATURE BREAKDOWN BY COMPONENT

### A. ISSUER SERVICE (Node.js/Express)

#### Phase 1: Credential Definition & Issuance
**P0 - Must Have**

1. **Credential Schema Definition**
   - Define mDoc namespace for academic credentials
   - Fields: Student ID, Name, Institution, Transcript (courses, grades, GPA), Degree, Issue Date, Expiry
   - Validation: Ensure all required fields present
   - Story: `issuer-define-transcript-schema`

2. **Admin Portal - Credential Issuance UI**
   - Keycloak-protected admin interface
   - Bulk upload: CSV with student data, transcripts
   - Individual issuance: Form to create single credential
   - Preview credential data before issuance
   - Story: `issuer-admin-issuance-portal`

3. **Credential Generation Engine**
   - Parse student data, generate mDoc
   - Sign credential with issuer's ED25519 key
   - Generate wallet request QR codes (ISO 18013-5)
   - Store issued credential metadata (student ID, issuance date, status)
   - Story: `issuer-generate-mdoc-credentials`

4. **Credential Storage & Tracking**
   - Database schema: Credentials table (credential_id, student_id, credential_type, data, signature, status)
   - Status tracking: issued, revoked, expired
   - Audit log: Who issued when, modifications
   - Story: `issuer-credential-storage`

#### Phase 2: Distribution & Revocation
**P1 - Important**

5. **Credential Distribution**
   - Generate unique QR codes per credential (wallet request protocol)
   - Email distribution: Send QR code link to student
   - In-app delivery: Student logs in to admin portal, downloads credential to wallet
   - Story: `issuer-distribute-credentials`

6. **Credential Revocation**
   - Admin can revoke issued credentials
   - Revocation list (CRL-style): Revoked credential IDs
   - Expiry handling: Automatic expiry checks
   - Story: `issuer-revocation-system`

#### Phase 3: Advanced Issuance
**P2 - Nice to Have (future)**

- Batch scheduling (issue credentials on specific dates)
- Credential renewal/re-issuance
- Integration with student information system (SIS) for auto-sync
- Support for selective disclosure (hide grades if needed)

---

### B. WALLET APP (Kotlin Multiplatform - Based on multipaz)

#### Phase 1: Credential Storage & Display
**P0 - Must Have**

7. **Credential Reception & Storage**
   - QR code scanner (using existing multipaz camera capability)
   - Parse ISO 18013-5 wallet request QR codes
   - Receive credential data from issuer
   - Store encrypted in local device storage (Keystore/Keychain)
   - Story: `wallet-receive-credentials`

8. **Credential Display & Management**
   - Home screen: List all stored credentials (transcripts, qualifications)
   - Detail view: Show full credential data, issue/expiry dates
   - Search & filter: By credential type, institution, date
   - Delete locally stored credentials
   - Story: `wallet-display-credentials`

9. **Mobile Authentication**
   - Local auth: Biometric (fingerprint/face) or PIN to unlock wallet
   - Session timeout: Auto-lock after inactivity
   - Security: Encrypt wallet data with device keys
   - Story: `wallet-mobile-authentication`

#### Phase 2: Credential Sharing
**P1 - Important**

10. **QR Code Presentation Mode**
    - Generate presentation QR code (ISO 18013-5 device engagement)
    - Student selects which credentials to share
    - Time-limited QR code validity (5-10 minutes)
    - Story: `wallet-qr-presentation`

11. **Selective Disclosure**
    - Student chooses which fields to include (e.g., name + degree but not GPA)
    - Verifier receives only disclosed claims
    - Privacy-preserving: No unnecessary data sharing
    - Story: `wallet-selective-disclosure`

12. **Credential History & Audit**
    - Log when credentials were shared (timestamp, verifier ID if possible)
    - Allow user to see sharing history
    - Export audit trail
    - Story: `wallet-sharing-audit-log`

#### Phase 3: Advanced Wallet Features
**P2 - Nice to Have (future)**

- Automatic credential refresh when issuer updates
- Credential backup/recovery
- Multiple wallet instances sync
- Support for additional credential types beyond academics

---

### C. VERIFIER SERVICE (Node.js/Express - Based on Smart College Verification)

#### Phase 1: Credential Verification
**P0 - Must Have**

13. **QR Code Scanning & Reception**
    - Web interface with QR code scanner (camera or file upload)
    - Parse device engagement QR codes (ISO 18013-5 format)
    - Establish connection with wallet device
    - Story: `verifier-qr-scanning`

14. **Credential Verification Engine**
    - Validate mDoc signature against issuer's public key
    - Check credential status: Not revoked, not expired
    - Verify issuer identity (certificate chain if applicable)
    - Verify selective disclosure integrity
    - Story: `verifier-signature-validation`

15. **Verification Result Display**
    - Show verification status: Valid ✓ / Invalid ✗ / Expired
    - Display verified claims (names, degree, credentials)
    - Timestamp of verification
    - Story: `verifier-result-display`

16. **Verifier Registry**
    - Database: Store authorized verifiers (employers, institutions)
    - Each verifier has: ID, name, certificate, access permissions
    - Keycloak integration for verifier authentication
    - Story: `verifier-registry-management`

#### Phase 2: Verification Policies & Audit
**P1 - Important**

17. **Verification Policies**
    - Employer can set required credentials (e.g., "require bachelor's degree")
    - Configurable verification rules (e.g., "GPA must be >= 3.0")
    - Policy enforcement during verification
    - Story: `verifier-policies`

18. **Audit & Compliance**
    - Log all verification attempts (who verified what, when)
    - GDPR compliance: Minimal data retention for verification logs
    - Export verification records
    - Story: `verifier-audit-logging`

#### Phase 3: Advanced Verification
**P2 - Nice to Have (future)**

- Batch verification API for employers
- Integration with applicant tracking systems (ATS)
- Machine-readable result format (API)
- Multi-credential verification (e.g., "verify all 3 degrees")

---

### D. ISSUER-WALLET-VERIFIER PROTOCOL

#### Phase 1: Basic Protocol
**P0 - Must Have**

19. **mDoc Protocol Implementation**
    - ISO/IEC 18013-5 wallet request protocol
    - QR code generation & parsing
    - Wallet device engagement (proximity detection)
    - Story: `protocol-mdoc-request-response`

20. **Key Management**
    - Generate issuer ED25519 key pair (secure key storage)
    - Generate verifier-specific public keys (if multi-verifier)
    - Secure key rotation process
    - Story: `protocol-key-management`

#### Phase 2: Protocol Extensions
**P1 - Important**

21. **OpenID4VC Interoperability (Optional)**
    - Support OpenID4VC credential issuance (JSON-LD format alternative)
    - Allow other ecosystem wallets to receive credentials
    - Story: `protocol-openid4vc-support` (deferred to Phase 2)

22. **Device Registration**
    - Wallet devices can register with verifier (optional flow)
    - Enables verifier to detect repeat verifications from same device
    - Story: `protocol-device-registration` (deferred to Phase 2)

---

## 3. FEATURE PRIORITIZATION MATRIX

### P0 - PHASE 1: CORE MVP (Weeks 1-4)

| Priority | Story ID | Component | Feature | Effort | Dependencies |
|----------|----------|-----------|---------|--------|--------------|
| **P0-1** | `issuer-define-transcript-schema` | Issuer | Credential Schema | M | - |
| **P0-2** | `issuer-admin-issuance-portal` | Issuer | Admin UI for Issuance | L | P0-1 |
| **P0-3** | `issuer-generate-mdoc-credentials` | Issuer | mDoc Generation | L | P0-1 |
| **P0-4** | `issuer-credential-storage` | Issuer | Credential Storage | M | P0-3 |
| **P0-5** | `wallet-receive-credentials` | Wallet | QR Scanning & Storage | L | P0-3, P0-19 |
| **P0-6** | `wallet-display-credentials` | Wallet | Credential Display | M | P0-5 |
| **P0-7** | `wallet-mobile-authentication` | Wallet | Mobile Auth | M | - |
| **P0-8** | `verifier-qr-scanning` | Verifier | QR Scanning | M | P0-19 |
| **P0-9** | `verifier-signature-validation` | Verifier | Verify Signature | L | P0-4, P0-20 |
| **P0-10** | `verifier-result-display` | Verifier | Show Results | M | P0-9 |
| **P0-11** | `verifier-registry-management` | Verifier | Verifier Registry | M | - |
| **P0-12** | `protocol-mdoc-request-response` | Protocol | mDoc Protocol | XL | - |
| **P0-13** | `protocol-key-management` | Protocol | Key Management | L | - |

**Phase 1 Total Effort**: ~13 weeks (full-stack team)

### P1 - PHASE 2: PRODUCTION-READY (Weeks 5-8)

| Priority | Story ID | Component | Feature | Effort | Dependencies |
|----------|----------|-----------|---------|--------|--------------|
| **P1-1** | `issuer-distribute-credentials` | Issuer | Distribution | M | P0-2, P0-3 |
| **P1-2** | `issuer-revocation-system` | Issuer | Revocation | M | P0-4 |
| **P1-3** | `wallet-qr-presentation` | Wallet | Presentation Mode | M | P0-5 |
| **P1-4** | `wallet-selective-disclosure` | Wallet | Selective Disclosure | L | P1-3 |
| **P1-5** | `wallet-sharing-audit-log` | Wallet | Audit Logging | M | P1-3 |
| **P1-6** | `verifier-policies` | Verifier | Verification Policies | M | P0-11 |
| **P1-7** | `verifier-audit-logging` | Verifier | Audit & Compliance | M | P1-6 |
| **P1-8** | `protocol-openid4vc-support` | Protocol | OpenID4VC (Optional) | L | P0-12 |

**Phase 2 Total Effort**: ~8 weeks

### P2 - PHASE 3: ADVANCED (Future)

- Batch issuance scheduling
- SIS integration
- Credential renewal system
- Batch verification API
- Multi-credential workflows

---

## 4-10: [Detailed sections continue as in original plan...]

**See full plan in Smart College docs or this file for complete content**

---

**Plan Version**: 1.0  
**Last Updated**: 2026-08-27  
**Repository**: Transcript (monorepo)  
**Next Phase**: Phase 1 kickoff after team review
