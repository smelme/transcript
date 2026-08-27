# Credential Storage Layer

Privacy-first metadata storage for credentials with audit trails and revocation tracking.

**Key Principle**: Never stores actual credential data (claims). Only metadata and status.

## Architecture

Credentials flow:
1. **Generated** in memory (P0-3 Generator)
2. **Stored temporarily** in session (while being distributed)
3. **Metadata recorded** in database (issuer, student, dates, status)
4. **Distributed** to wallet via QR
5. **Stored permanently** in wallet (not on issuer server)

## What Gets Stored

### ✅ Stored in Database (Metadata)
- Credential ID (UUID)
- Issuer ID
- Student ID  
- Issue & expiry dates
- Status (pending, issued, revoked, expired)
- Revocation details (reason, date, who revoked)
- Audit trail (who did what, when)

### ❌ NOT Stored in Database (Actual Credential)
- Student name
- GPA
- Courses
- Institution
- Any credential claims
- CBOR encoded data
- Credential signature

### ✅ Stored in Memory (Temporary Session)
- Full credential data (while being distributed)
- Expires after 1 hour
- Auto-cleaned when expired
- Never persisted to disk

## Components

### CredentialStorage

Main storage class.

```javascript
import { CredentialStorage } from './src/index.js';

const storage = new CredentialStorage({
  pool: pgPool, // PostgreSQL connection
  namespace: 'org.smartcollege.academic'
});

await storage.initialize();
```

## Metadata Storage

### Store Credential

Called after generation, stores metadata only.

```javascript
const result = await storage.storeCredential({
  credentialId: 'mdoc-abc123',
  issuerId: 'ISSUER-001',
  studentId: 'ALICE-2024-001',
  schemaId: 'schema-123',
  issueDate: new Date('2024-08-27'),
  expiryDate: new Date('2029-08-27'),
  status: 'issued'
});

// Returns:
// {
//   credentialId: 'mdoc-abc123',
//   status: 'issued',
//   stored: true,
//   storedAt: 2024-08-27T12:34:56.789Z
// }
```

### Retrieve Metadata

```javascript
const metadata = await storage.getCredentialMetadata('mdoc-abc123');

// Returns:
// {
//   credentialId: 'mdoc-abc123',
//   issuerId: 'ISSUER-001',
//   studentId: 'ALICE-2024-001',
//   status: 'issued',
//   issueDate: 2024-08-27T00:00:00Z,
//   expiryDate: 2029-08-27T00:00:00Z,
//   createdAt: 2024-08-27T12:34:56.789Z,
//   updatedAt: 2024-08-27T12:34:56.789Z
// }
```

### List by Issuer

```javascript
const credentials = await storage.listByIssuer('ISSUER-001', limit=100, offset=0);

// Returns: [{credentialId, status, issueDate, ...}, ...]
```

### List by Student

```javascript
const credentials = await storage.listByStudent('ALICE-2024-001', limit=100, offset=0);

// Returns: [{credentialId, status, issueDate, ...}, ...]
```

### Check Status

```javascript
const result = await storage.checkStatus('mdoc-abc123');

// Returns: {
//   status: 'issued' | 'expired' | 'revoked' | 'not-found',
//   metadata: {...}
// }
```

## Revocation Management

### Revoke Credential

```javascript
const result = await storage.revokeCredential(
  'mdoc-abc123',           // credentialId
  'Student request',       // reason
  'ADMIN-001'             // revokedByUserId
);

// Returns:
// {
//   credentialId: 'mdoc-abc123',
//   status: 'revoked',
//   revokedAt: 2024-08-28T10:00:00.000Z,
//   reason: 'Student request'
// }
```

### Check Revocation

```javascript
const isRevoked = await storage.isRevoked('mdoc-abc123');

// Returns: true | false
```

## Audit Trail

### Get Audit Log

```javascript
const auditTrail = await storage.getAuditTrail('mdoc-abc123', limit=100);

// Returns:
// [{
//   id: 1,
//   credentialId: 'mdoc-abc123',
//   action: 'created' | 'issued' | 'revoked' | 'verified' | 'accessed',
//   actorId: 'ADMIN-001',
//   actorType: 'admin' | 'issuer' | 'verifier',
//   statusBefore: 'pending',
//   statusAfter: 'issued',
//   details: {...},
//   createdAt: 2024-08-27T12:34:56.789Z
// }, ...]
```

## Session Storage

Temporary in-memory storage for credentials before wallet distribution.

### Store in Session

```javascript
const credentialData = {
  studentId: 'ALICE-2024-001',
  name: 'Alice Smith',
  gpa: 3.95,
  // ... full credential
};

const session = storage.storeInSession(credentialData);

// Returns:
// {
//   sessionId: 'session-abc123def456',
//   expiresAt: 2024-08-28T10:30:00.000Z
// }
```

### Retrieve from Session

```javascript
const credential = storage.getFromSession('session-abc123def456');

// Returns: credentialData or null (if expired/not found)
```

### Clear Session

```javascript
const cleared = storage.clearFromSession('session-abc123def456');

// Returns: true | false
```

### Clean Expired Sessions

```javascript
const result = storage.cleanExpiredSessions();

// Returns: { cleaned: 5 }
```

## Database Schema

### credential_metadata
```sql
- credential_id (UUID, PRIMARY KEY)
- issuer_id (VARCHAR)
- student_id (VARCHAR)
- schema_id (UUID, FK)
- status (VARCHAR) - pending|issued|revoked|expired
- issue_date (TIMESTAMP)
- expiry_date (TIMESTAMP)
- revoked_at (TIMESTAMP)
- revocation_reason (VARCHAR)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

Indexes:
- issuer_id
- student_id
- status
- expiry_date
```

### credential_audit_log
```sql
- id (BIGSERIAL, PRIMARY KEY)
- credential_id (UUID, FK)
- action (VARCHAR) - created|issued|revoked|verified|accessed
- actor_id (VARCHAR)
- actor_type (VARCHAR) - admin|issuer|verifier
- issuer_id (VARCHAR)
- details (JSONB)
- status_before (VARCHAR)
- status_after (VARCHAR)
- ip_address (INET)
- user_agent (VARCHAR)
- created_at (TIMESTAMP)

Indexes:
- credential_id
- issuer_id
- action
- created_at
```

### revocation_list
```sql
- id (BIGSERIAL, PRIMARY KEY)
- credential_id (UUID, UNIQUE FK)
- issuer_id (VARCHAR)
- revocation_reason (VARCHAR)
- revoked_by_user_id (VARCHAR)
- revoked_at (TIMESTAMP)

Indexes:
- issuer_id
- revoked_at
```

## Statistics

Get storage statistics.

```javascript
const stats = await storage.getStatistics();

// Returns:
// {
//   credentials: {
//     total: 150,
//     issued: 145,
//     revoked: 3,
//     expired: 2,
//     nowExpired: 5
//   },
//   auditLogs: {
//     total: 450
//   },
//   sessions: {
//     active: 12
//   }
// }
```

## Configuration

```javascript
export const STORAGE_CONFIG = {
  NAMESPACE: 'org.smartcollege.academic',
  VERSION: '1',
  CREDENTIAL_STATUSES: ['pending', 'issued', 'revoked', 'expired'],
  AUDIT_ACTIONS: ['created', 'issued', 'revoked', 'verified', 'accessed'],
  SESSION_EXPIRY_MS: 3600000  // 1 hour
};
```

## Privacy & Security

### Credential Data Privacy
- Never stores actual credential claims
- Claims only in wallet app or session memory
- Database is audit-only and metadata

### Audit Trail
- Immutable log of all actions
- Tracks who accessed what credential, when
- Used for compliance and investigation
- Cannot be deleted (only read)

### Session Security
- Temporary in-memory storage only
- Automatic expiry after 1 hour
- No disk persistence
- Manual cleanup available

### Revocation
- Immediate effect on verification
- Reason tracked for audit
- User who revoked recorded
- Timestamp recorded

## Related Stories

- P0-1: Credential Schema (schema validation)
- P0-3: Generation Engine (creates credentials)
- P0-5: Wallet Reception (distributes credentials)
- P0-9: Signature Validation (uses revocation check)

## Testing

30+ comprehensive unit tests:

```bash
npm test
```

Coverage:
- ✅ Metadata storage and retrieval
- ✅ Status tracking
- ✅ Revocation management
- ✅ Audit trail logging
- ✅ Session storage
- ✅ Expiry handling
- ✅ Pagination
- ✅ Statistics
- ✅ Database initialization

## Future Enhancements

- PostgreSQL full-text search on audit logs
- Batch operations for performance
- Credential search by attributes
- Advanced filtering and queries
- Read replicas for analytics
- Cache layer for frequently accessed metadata
- GraphQL API for audit queries
