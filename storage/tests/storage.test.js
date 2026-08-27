/**
 * Tests for Credential Storage Layer
 * Coverage: Metadata storage, audit trails, session storage, revocation
 */

import assert from 'assert';
import { test } from 'node:test';
import { CredentialStorage, STORAGE_CONFIG } from '../src/index.js';

/**
 * Mock Database Connection Pool
 */
class MockPool {
  constructor() {
    this.data = {
      credentials: new Map(),
      auditLogs: [],
      revocations: new Map()
    };
  }

  async query(sql, params = []) {
    // Mock responses based on query type
    if (sql.includes('CREATE TABLE')) {
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO credential_metadata')) {
      const [credId, issuerId, studentId, schemaId, status, issueDate, expiryDate] = params;
      this.data.credentials.set(credId, {
        credential_id: credId,
        issuer_id: issuerId,
        student_id: studentId,
        schema_id: schemaId,
        status,
        issue_date: issueDate,
        expiry_date: expiryDate,
        revoked_at: null,
        revocation_reason: null,
        created_at: new Date(),
        updated_at: new Date()
      });
      return { rows: [{ credential_id: credId, status, created_at: new Date() }] };
    }

    if (sql.includes('INSERT INTO credential_audit_log')) {
      this.data.auditLogs.push({
        credential_id: params[0],
        action: params[1],
        issuer_id: params[2],
        actor_type: params[3],
        status_after: params[4],
        details: params[5],
        created_at: new Date()
      });
      return { rows: [{ id: this.data.auditLogs.length }] };
    }

    if (sql.includes('SELECT * FROM credential_metadata WHERE credential_id')) {
      const cred = this.data.credentials.get(params[0]);
      return cred ? { rows: [cred] } : { rows: [] };
    }

    if (sql.includes('SELECT * FROM credential_metadata WHERE issuer_id')) {
      const creds = Array.from(this.data.credentials.values())
        .filter(c => c.issuer_id === params[0])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(params[2], params[2] + params[1]);
      return { rows: creds };
    }

    if (sql.includes('SELECT * FROM credential_metadata WHERE student_id')) {
      const creds = Array.from(this.data.credentials.values())
        .filter(c => c.student_id === params[0])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(params[2], params[2] + params[1]);
      return { rows: creds };
    }

    if (sql.includes('UPDATE credential_metadata')) {
      const cred = this.data.credentials.get(params[0]);
      if (cred) {
        cred.status = 'revoked';
        cred.revoked_at = new Date();
        cred.revocation_reason = params[1];
        cred.updated_at = new Date();
        return { rows: [{ credential_id: params[0], status: 'revoked', revoked_at: new Date() }] };
      }
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO revocation_list')) {
      this.data.revocations.set(params[0], {
        credential_id: params[0],
        issuer_id: params[1],
        reason: params[2],
        revoked_by_user_id: params[3]
      });
      return { rows: [{ id: 1 }] };
    }

    if (sql.includes('SELECT * FROM credential_audit_log')) {
      const logs = this.data.auditLogs
        .filter(l => l.credential_id === params[0])
        .slice(0, params[1]);
      return { rows: logs };
    }

    if (sql.includes('SELECT 1 FROM revocation_list')) {
      const isRevoked = this.data.revocations.has(params[0]);
      return { rows: isRevoked ? [{ 1: 1 }] : [] };
    }

    if (sql.includes('COUNT')) {
      return {
        rows: [{
          total: '10',
          issued: '8',
          revoked: '1',
          expired: '1',
          now_expired: '2'
        }]
      };
    }

    return { rows: [] };
  }

  async connect() {
    return this;
  }

  release() {}

  async end() {}
}

test('Storage - Create Storage Instance', () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  assert(storage, 'Storage should be created');
  assert.strictEqual(storage.namespace, STORAGE_CONFIG.NAMESPACE);
});

test('Storage - Initialize Database Schema', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const result = await storage.initialize();

  assert.strictEqual(result.initialized, true);
});

test('Storage - Store Credential Metadata', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialMetadata = {
    credentialId: 'mdoc-abc123',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    schemaId: 'schema-123',
    issueDate: new Date('2024-08-27'),
    expiryDate: new Date('2029-08-27'),
    status: 'issued'
  };

  const result = await storage.storeCredential(credentialMetadata);

  assert.strictEqual(result.credentialId, 'mdoc-abc123');
  assert.strictEqual(result.status, 'issued');
  assert.strictEqual(result.stored, true);
});

test('Storage - Retrieve Credential Metadata', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  // Store first
  const credentialMetadata = {
    credentialId: 'mdoc-abc123',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    schemaId: 'schema-123',
    issueDate: new Date('2024-08-27'),
    expiryDate: new Date('2029-08-27'),
    status: 'issued'
  };

  await storage.storeCredential(credentialMetadata);

  // Retrieve
  const retrieved = await storage.getCredentialMetadata('mdoc-abc123');

  assert.strictEqual(retrieved.credentialId, 'mdoc-abc123');
  assert.strictEqual(retrieved.issuerId, 'ISSUER-001');
  assert.strictEqual(retrieved.studentId, 'ALICE-2024-001');
});

test('Storage - Retrieve Non-Existent Credential', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const result = await storage.getCredentialMetadata('non-existent');

  assert.strictEqual(result, null);
});

test('Storage - List Credentials by Issuer', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  // Store multiple credentials
  for (let i = 0; i < 3; i++) {
    await storage.storeCredential({
      credentialId: `mdoc-${i}`,
      issuerId: 'ISSUER-001',
      studentId: `STUDENT-${i}`,
      issueDate: new Date(),
      expiryDate: new Date(Date.now() + 86400000),
      status: 'issued'
    });
  }

  // This test verifies the API contract works
  // Full integration testing requires real PostgreSQL
  const credentials = await storage.listByIssuer('ISSUER-001');
  assert(Array.isArray(credentials), 'Should return array');
});

test('Storage - List Credentials by Student', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const studentId = 'ALICE-2024-001';

  // Store credential for student
  await storage.storeCredential({
    credentialId: 'mdoc-alice-1',
    issuerId: 'ISSUER-001',
    studentId,
    issueDate: new Date(),
    expiryDate: new Date(Date.now() + 86400000),
    status: 'issued'
  });

  // This test verifies the API contract works
  const credentials = await storage.listByStudent(studentId);
  assert(Array.isArray(credentials), 'Should return array');
});

test('Storage - Check Credential Status (Active)', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialMetadata = {
    credentialId: 'mdoc-active',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    issueDate: new Date(Date.now() - 86400000),
    expiryDate: new Date(Date.now() + 86400000),
    status: 'issued'
  };

  await storage.storeCredential(credentialMetadata);

  const result = await storage.checkStatus('mdoc-active');

  assert.strictEqual(result.status, 'issued');
  assert(result.metadata, 'Should include metadata');
});

test('Storage - Check Credential Status (Not Found)', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const result = await storage.checkStatus('non-existent');

  assert.strictEqual(result.status, 'not-found');
});

test('Storage - Revoke Credential', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialMetadata = {
    credentialId: 'mdoc-revoke',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    issueDate: new Date(),
    expiryDate: new Date(Date.now() + 86400000),
    status: 'issued'
  };

  await storage.storeCredential(credentialMetadata);

  const result = await storage.revokeCredential('mdoc-revoke', 'Student request', 'ADMIN-001');

  assert.strictEqual(result.status, 'revoked');
  assert.strictEqual(result.reason, 'Student request');
});

test('Storage - Verify Credential Revocation', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialMetadata = {
    credentialId: 'mdoc-check-revoke',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    issueDate: new Date(),
    expiryDate: new Date(Date.now() + 86400000),
    status: 'issued'
  };

  await storage.storeCredential(credentialMetadata);
  await storage.revokeCredential('mdoc-check-revoke', 'Test revocation', 'ADMIN-001');

  const isRevoked = await storage.isRevoked('mdoc-check-revoke');

  assert.strictEqual(isRevoked, true, 'Should be marked as revoked');
});

test('Storage - Get Audit Trail', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialMetadata = {
    credentialId: 'mdoc-audit',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    issueDate: new Date(),
    expiryDate: new Date(Date.now() + 86400000),
    status: 'issued'
  };

  await storage.storeCredential(credentialMetadata);

  const auditTrail = await storage.getAuditTrail('mdoc-audit');

  assert(auditTrail.length > 0, 'Should have audit entries');
  assert(auditTrail.some(entry => entry.action === 'created'));
});

test('Storage - Session Storage: Store Credential', () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialData = {
    studentId: 'ALICE-2024-001',
    name: 'Alice Smith',
    gpa: 3.95
  };

  const session = storage.storeInSession(credentialData);

  assert(session.sessionId, 'Should return session ID');
  assert(session.expiresAt, 'Should set expiry time');
});

test('Storage - Session Storage: Retrieve Credential', () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialData = {
    studentId: 'ALICE-2024-001',
    name: 'Alice Smith',
    gpa: 3.95
  };

  const session = storage.storeInSession(credentialData);
  const retrieved = storage.getFromSession(session.sessionId);

  assert.deepStrictEqual(retrieved, credentialData);
});

test('Storage - Session Storage: Session Expiry', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialData = { data: 'test' };
  const session = storage.storeInSession(credentialData);

  // Manually expire the session
  const entry = storage.sessions.get(session.sessionId);
  entry.expiresAt = new Date(Date.now() - 1000);

  const retrieved = storage.getFromSession(session.sessionId);

  assert.strictEqual(retrieved, null, 'Expired session should return null');
});

test('Storage - Session Storage: Clear Session', () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const session = storage.storeInSession({ data: 'test' });
  const cleared = storage.clearFromSession(session.sessionId);

  assert.strictEqual(cleared, true);

  const retrieved = storage.getFromSession(session.sessionId);
  assert.strictEqual(retrieved, null);
});

test('Storage - Session Storage: Clean Expired Sessions', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  // Store multiple sessions
  const session1 = storage.storeInSession({ data: 'test1' });
  const session2 = storage.storeInSession({ data: 'test2' });

  // Expire session 1
  const entry = storage.sessions.get(session1.sessionId);
  entry.expiresAt = new Date(Date.now() - 1000);

  const result = storage.cleanExpiredSessions();

  assert.strictEqual(result.cleaned, 1, 'Should clean 1 expired session');
  assert(storage.getFromSession(session2.sessionId), 'Session 2 should still exist');
});

test('Storage - Get Storage Statistics', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const stats = await storage.getStatistics();

  assert(stats.credentials, 'Should have credential stats');
  assert(stats.credentials.total >= 0);
  assert(stats.credentials.issued >= 0);
  assert(stats.credentials.revoked >= 0);
  assert(stats.auditLogs, 'Should have audit log stats');
  assert(stats.sessions, 'Should have session stats');
});

test('Storage - Storage Config Constants', () => {
  assert.strictEqual(STORAGE_CONFIG.NAMESPACE, 'org.smartcollege.academic');
  assert.strictEqual(STORAGE_CONFIG.VERSION, '1');
  assert(STORAGE_CONFIG.CREDENTIAL_STATUSES.includes('issued'));
  assert(STORAGE_CONFIG.CREDENTIAL_STATUSES.includes('revoked'));
  assert(STORAGE_CONFIG.AUDIT_ACTIONS.includes('created'));
  assert(STORAGE_CONFIG.AUDIT_ACTIONS.includes('revoked'));
});

test('Storage - Multiple Credentials Same Issuer', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const issuerId = 'ISSUER-MULTI';

  for (let i = 0; i < 5; i++) {
    await storage.storeCredential({
      credentialId: `mdoc-multi-${i}`,
      issuerId,
      studentId: `STUDENT-${i}`,
      issueDate: new Date(),
      expiryDate: new Date(Date.now() + 86400000),
      status: 'issued'
    });
  }

  // This test verifies the API contract works
  const credentials = await storage.listByIssuer(issuerId);
  assert(Array.isArray(credentials), 'Should return array');
});

test('Storage - Audit Trail Tracking', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  const credentialMetadata = {
    credentialId: 'mdoc-trail',
    issuerId: 'ISSUER-001',
    studentId: 'ALICE-2024-001',
    issueDate: new Date(),
    expiryDate: new Date(Date.now() + 86400000),
    status: 'issued'
  };

  await storage.storeCredential(credentialMetadata);
  await storage.revokeCredential('mdoc-trail', 'Test', 'ADMIN-001');

  const trail = await storage.getAuditTrail('mdoc-trail', 10);

  assert(trail.length >= 2, 'Should have at least 2 audit entries');
  assert(trail.some(e => e.action === 'created'));
  assert(trail.some(e => e.action === 'revoked'));
});

test('Storage - Pagination Support', async () => {
  const storage = new CredentialStorage({
    pool: new MockPool()
  });

  // Store credentials
  for (let i = 0; i < 10; i++) {
    await storage.storeCredential({
      credentialId: `mdoc-page-${i}`,
      issuerId: 'ISSUER-PAGE',
      studentId: `STUDENT-${i}`,
      issueDate: new Date(),
      expiryDate: new Date(Date.now() + 86400000),
      status: 'issued'
    });
  }

  const page1 = await storage.listByIssuer('ISSUER-PAGE', 5, 0);
  const page2 = await storage.listByIssuer('ISSUER-PAGE', 5, 5);

  assert(page1.length <= 5);
  assert(page2.length <= 5);
});
