# Verifier Registry

Trusted verifier management and public key distribution for credential verification.

Registry maintains approved verifiers, their trust scores, verification types, and public keys.

## Overview

The Verifier Registry is a central registry of trusted verifiers that can request credentials. It manages:
- Verifier registration and approval workflows
- Trust scoring and reputation management
- Public key distribution for signature verification
- Verification history and statistics
- Audit trails for compliance

## Architecture

```
Registration Flow:
1. Verifier applies for registration
2. Status = 'pending'
3. Admin reviews application
4. Admin approves → Status = 'approved'
5. Verifier becomes discoverable
6. Trust score managed over time
```

## Components

### VerifierRegistry

Main registry class.

```javascript
import { VerifierRegistry } from './src/index.js';

const registry = new VerifierRegistry({
  pool: pgPool,
  namespace: 'org.smartcollege.verifier'
});

await registry.initialize();
```

## Registration

### Register New Verifier

```javascript
const result = await registry.registerVerifier({
  verifierId: 'STATE-ED-DEPT',
  name: 'State Education Department',
  description: 'Official state education verification',
  verificationTypes: ['academic'],
  url: 'https://verify.education.gov',
  contactEmail: 'verify@education.gov',
  contactPhone: '+1-555-123-4567',
  publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----'
});

// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   status: 'pending',
//   registered: true,
//   registeredAt: 2024-08-27T12:34:56.789Z
// }
```

### Retrieve Verifier

```javascript
const verifier = await registry.getVerifier('STATE-ED-DEPT');

// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   name: 'State Education Department',
//   verificationTypes: ['academic'],
//   url: 'https://verify.education.gov',
//   contactEmail: 'verify@education.gov',
//   publicKeyPem: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
//   status: 'approved',
//   trustScore: 85,
//   credentialsVerifiedCount: 1250,
//   approvedAt: 2024-08-27T13:00:00.000Z,
//   createdAt: 2024-08-27T12:34:56.789Z
// }
```

## Approval Workflow

### Approve Verifier

```javascript
const result = await registry.approveVerifier('STATE-ED-DEPT', 'ADMIN-USER-001');

// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   status: 'approved',
//   approvedAt: 2024-08-27T13:00:00.000Z
// }
```

### Suspend Verifier

```javascript
const result = await registry.suspendVerifier(
  'STATE-ED-DEPT',
  'API abuse detected',
  'ADMIN-USER-001'
);

// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   status: 'suspended',
//   reason: 'API abuse detected'
// }
```

### Revoke Verifier

```javascript
const result = await registry.revokeVerifier(
  'STATE-ED-DEPT',
  'Malicious verification attempts',
  'ADMIN-USER-001'
);

// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   status: 'revoked',
//   revokedAt: 2024-08-28T10:00:00.000Z,
//   reason: 'Malicious verification attempts'
// }
```

## Trust Management

### Update Trust Score

```javascript
const result = await registry.updateTrustScore(
  'STATE-ED-DEPT',
  90,
  'Excellent verification accuracy'
);

// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   trustScore: 90
// }
```

Trust score ranges from 0-100:
- 0-30: Low trust (suspicious activity)
- 31-60: Medium trust (acceptable)
- 61-80: High trust (proven track record)
- 81-100: Excellent trust (exemplary)

### Record Verification

```javascript
const result = await registry.recordVerification('STATE-ED-DEPT');

// Increments the verification counter
// Returns:
// {
//   verifierId: 'STATE-ED-DEPT',
//   verifiedCount: 1251
// }
```

## Discovery

### List by Status

```javascript
const approved = await registry.listByStatus('approved', limit=100, offset=0);

// Returns: [
//   {
//     verifierId: 'STATE-ED-DEPT',
//     name: 'State Education Department',
//     verificationTypes: ['academic'],
//     status: 'approved',
//     trustScore: 85,
//     createdAt: ...
//   }, ...
// ]
```

### List by Verification Type

```javascript
const academic = await registry.listByType('academic', limit=100, offset=0);

// Returns all approved verifiers offering academic verification
// Sorted by trust score (highest first)
```

## Validation

### Validate Verifier Data

```javascript
const validation = registry.validateVerifier(verifierData);

if (validation.valid) {
  console.log('✓ Verifier data valid');
} else {
  console.log('✗ Validation errors:');
  validation.errors.forEach(err => {
    console.log(`  ${err.path}: ${err.message}`);
  });
}
```

### Verification Types

Valid types:
- `academic` - Educational institution
- `employment` - Employer
- `government` - Government agency
- `other` - Other verification source

## Audit & Compliance

### Get Audit Trail

```javascript
const trail = await registry.getAuditTrail('STATE-ED-DEPT', limit=100);

// Returns:
// [{
//   id: 1,
//   verifierId: 'STATE-ED-DEPT',
//   action: 'registered' | 'approved' | 'suspended' | 'revoked' | 'trust_score_updated',
//   actorId: 'ADMIN-USER-001',
//   statusBefore: 'pending',
//   statusAfter: 'approved',
//   details: {...},
//   createdAt: 2024-08-27T13:00:00.000Z
// }, ...]
```

### Check Status

```javascript
const isApproved = await registry.isApproved('STATE-ED-DEPT');
// Returns: true | false

const isRevoked = await registry.isRevoked('STATE-ED-DEPT');
// Returns: true | false
```

## Statistics

### Get Registry Statistics

```javascript
const stats = await registry.getStatistics();

// Returns:
// {
//   total: 42,
//   approved: 38,
//   pending: 2,
//   suspended: 1,
//   revoked: 1,
//   avgTrustScore: 78.5,
//   totalVerifications: 45230
// }
```

## Database Schema

### verifiers
```sql
- verifier_id (VARCHAR 50, PRIMARY KEY)
- name (VARCHAR 200)
- description (VARCHAR 500)
- verification_types (TEXT[])
- url (VARCHAR 500)
- contact_email (VARCHAR 100)
- contact_phone (VARCHAR 30)
- public_key_pem (TEXT)
- status (VARCHAR 20) - pending|approved|suspended|revoked
- trust_score (INTEGER 0-100)
- credentials_verified_count (INTEGER)
- approved_at (TIMESTAMP)
- revoked_at (TIMESTAMP)
- revocation_reason (VARCHAR 500)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Indexes:
- status
- verification_types (GIN)
- trust_score
```

### verifier_audit
```sql
- id (BIGSERIAL, PRIMARY KEY)
- verifier_id (VARCHAR, FK)
- action (VARCHAR) - registered|approved|suspended|revoked|trust_score_updated
- actor_id (VARCHAR)
- details (JSONB)
- status_before (VARCHAR)
- status_after (VARCHAR)
- created_at (TIMESTAMP)

Indexes:
- verifier_id
- action
```

## Configuration

```javascript
export const REGISTRY_CONFIG = {
  NAMESPACE: 'org.smartcollege.verifier',
  VERSION: '1',
  VERIFIER_STATUSES: ['pending', 'approved', 'suspended', 'revoked'],
  VERIFICATION_TYPES: ['academic', 'employment', 'government', 'other'],
  DEFAULT_TRUST_SCORE: 50,
  MAX_TRUST_SCORE: 100,
  MIN_TRUST_SCORE: 0
};
```

## Privacy & Security

### Public Key Management
- Only approved verifiers' public keys are distributed
- Revoked verifiers' keys cannot be used
- Key rotation supported via registration update

### Access Control
- Only approved verifiers can request credentials
- Suspended/revoked verifiers blocked automatically
- Trust score considered for sensitive requests

### Audit Trail
- All actions logged immutably
- Administrator tracked for each action
- Timestamps for compliance

## Related Stories

- P0-5: Wallet QR Reception (uses registry for verifier lookup)
- P0-8: Verifier QR Scanning (validates against registry)
- P0-9: Signature Validation (uses verifier public keys)

## Testing

30+ comprehensive unit tests:

```bash
npm test
```

Coverage:
- ✅ Verifier registration and validation
- ✅ Approval workflow (approve, suspend, revoke)
- ✅ Trust score management
- ✅ Verification type validation
- ✅ Audit trail tracking
- ✅ Status queries
- ✅ Statistics and reporting
- ✅ Email and URL validation
- ✅ Schema validation

## Future Enhancements

- Verifier self-service portal
- Automated trust scoring based on verification accuracy
- Rate limiting based on trust score
- Bulk verifier import/export
- Verification type plugins/extensions
- Geographic distribution of verifiers
- Backup verifier support
- Service level agreements (SLA) tracking
