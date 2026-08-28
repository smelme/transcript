/**
 * Tests for Verifier Registry
 * Coverage: Verifier registration, approval, revocation, trust scoring
 */

import assert from 'assert';
import { test } from 'node:test';
import { VerifierRegistry, REGISTRY_CONFIG } from '../src/index.js';

/**
 * Mock Pool for testing
 */
class MockPool {
  constructor() {
    this.verifiers = new Map();
    this.auditLogs = [];
  }

  async query(sql, params = []) {
    // CREATE TABLE
    if (sql.includes('CREATE TABLE')) {
      return { rows: [] };
    }

    // INSERT INTO verifiers
    if (sql.includes('INSERT INTO verifiers')) {
      const [vId, name, desc, types, url, email, phone, pubKey, status, trust] = params;
      this.verifiers.set(vId, {
        verifier_id: vId,
        name,
        description: desc,
        verification_types: types,
        url,
        contact_email: email,
        contact_phone: phone,
        public_key_pem: pubKey,
        status,
        trust_score: trust,
        credentials_verified_count: 0,
        approved_at: null,
        revoked_at: null,
        revocation_reason: null,
        created_at: new Date(),
        updated_at: new Date()
      });
      return { rows: [{ verifier_id: vId, status, created_at: new Date() }] };
    }

    // INSERT INTO verifier_audit
    if (sql.includes('INSERT INTO verifier_audit')) {
      this.auditLogs.push({
        verifier_id: params[0],
        action: params[1],
        actor_id: params[2],
        status_after: params[3],
        details: params[4]
      });
      return { rows: [{ id: this.auditLogs.length }] };
    }

    // SELECT FROM verifiers WHERE verifier_id
    if (sql.includes('SELECT * FROM verifiers WHERE verifier_id')) {
      const v = this.verifiers.get(params[0]);
      return v ? { rows: [v] } : { rows: [] };
    }

    // SELECT FROM verifiers WHERE status
    if (sql.includes('SELECT * FROM verifiers WHERE status')) {
      const verifiers = Array.from(this.verifiers.values())
        .filter(v => v.status === params[0]);
      return { rows: verifiers };
    }

    // UPDATE verifiers (approve)
    if (sql.includes('UPDATE verifiers')) {
      const v = this.verifiers.get(params[0]);
      if (v) {
        if (sql.includes('approved')) {
          v.status = 'approved';
          v.approved_at = new Date();
        } else if (sql.includes('suspended')) {
          v.status = 'suspended';
        } else if (sql.includes('revoked')) {
          v.status = 'revoked';
          v.revoked_at = new Date();
          v.revocation_reason = params[1];
        } else if (sql.includes('trust_score')) {
          v.trust_score = params[1];
        } else if (sql.includes('credentials_verified_count')) {
          v.credentials_verified_count++;
        }
        v.updated_at = new Date();
        return { rows: [{ verifier_id: params[0], ...v }] };
      }
      return { rows: [] };
    }

    // SELECT FROM verifier_audit
    if (sql.includes('SELECT * FROM verifier_audit')) {
      const logs = this.auditLogs.filter(l => l.verifier_id === params[0]);
      return { rows: logs };
    }

    // COUNT statistics
    if (sql.includes('COUNT')) {
      return {
        rows: [{
          total: '5',
          approved: '3',
          pending: '1',
          suspended: '1',
          revoked: '0',
          avg_trust_score: '75',
          total_verifications: '150'
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

test('Registry - Create Registry Instance', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  assert(registry, 'Registry should be created');
  assert.strictEqual(registry.namespace, REGISTRY_CONFIG.NAMESPACE);
});

test('Registry - Initialize Database', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const result = await registry.initialize();
  assert.strictEqual(result.initialized, true);
});

test('Registry - Register Verifier', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'State Education Department',
    description: 'Official state education verification',
    verificationTypes: ['academic'],
    url: 'https://verifier.education.gov',
    contactEmail: 'contact@education.gov',
    contactPhone: '+1-555-123-4567',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJ...\n-----END PUBLIC KEY-----'
  };

  const result = await registry.registerVerifier(verifier);

  assert.strictEqual(result.verifierId, 'VERIFIER-001');
  assert.strictEqual(result.status, 'pending');
  assert.strictEqual(result.registered, true);
});

test('Registry - Validate Verifier Data', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const validVerifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(validVerifier);
  assert.strictEqual(validation.valid, true);
});

test('Registry - Validate Missing VerifierId', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const invalidVerifier = {
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(invalidVerifier);
  assert.strictEqual(validation.valid, false);
});

test('Registry - Validate Invalid VerifierId Pattern', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const invalidVerifier = {
    verifierId: 'VERIFIER@#$',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(invalidVerifier);
  assert.strictEqual(validation.valid, false);
});

test('Registry - Validate Verification Types', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const validTypes = ['academic', 'employment', 'government', 'other'];
  for (const type of validTypes) {
    const verifier = {
      verifierId: 'VERIFIER-001',
      name: 'Test Verifier',
      verificationTypes: [type],
      publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
    };
    const validation = registry.validateVerifier(verifier);
    assert.strictEqual(validation.valid, true, `${type} should be valid`);
  }
});

test('Registry - Validate Invalid Verification Type', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['invalid-type'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(verifier);
  assert.strictEqual(validation.valid, false);
});

test('Registry - Retrieve Verifier', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  const retrieved = await registry.getVerifier('VERIFIER-001');

  assert.strictEqual(retrieved.verifierId, 'VERIFIER-001');
  assert.strictEqual(retrieved.name, 'Test Verifier');
  assert.strictEqual(retrieved.status, 'pending');
});

test('Registry - Retrieve Non-Existent Verifier', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const result = await registry.getVerifier('NON-EXISTENT');
  assert.strictEqual(result, null);
});

test('Registry - Approve Verifier', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  const result = await registry.approveVerifier('VERIFIER-001', 'ADMIN-001');

  assert.strictEqual(result.status, 'approved');
  assert(result.approvedAt);
});

test('Registry - Suspend Verifier', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  const result = await registry.suspendVerifier('VERIFIER-001', 'Policy violation', 'ADMIN-001');

  assert.strictEqual(result.status, 'suspended');
  assert.strictEqual(result.reason, 'Policy violation');
});

test('Registry - Revoke Verifier', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  const result = await registry.revokeVerifier('VERIFIER-001', 'Malicious behavior', 'ADMIN-001');

  assert.strictEqual(result.status, 'revoked');
  assert.strictEqual(result.reason, 'Malicious behavior');
});

test('Registry - Update Trust Score', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----',
    trustScore: 50
  };

  await registry.registerVerifier(verifier);
  const result = await registry.updateTrustScore('VERIFIER-001', 85, 'Good track record');

  assert.strictEqual(result.trustScore, 85);
});

test('Registry - Validate Trust Score Range', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);

  try {
    await registry.updateTrustScore('VERIFIER-001', 150, 'Invalid');
    assert.fail('Should throw error for score > 100');
  } catch (error) {
    assert(error.message.includes('Trust score'));
  }
});

test('Registry - Record Verification', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  const result = await registry.recordVerification('VERIFIER-001');

  assert.strictEqual(result.verifiedCount, 1);
});

test('Registry - Check if Approved', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  let approved = await registry.isApproved('VERIFIER-001');
  assert.strictEqual(approved, false);

  await registry.approveVerifier('VERIFIER-001', 'ADMIN-001');
  approved = await registry.isApproved('VERIFIER-001');
  assert.strictEqual(approved, true);
});

test('Registry - Check if Revoked', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  let revoked = await registry.isRevoked('VERIFIER-001');
  assert.strictEqual(revoked, false);

  await registry.revokeVerifier('VERIFIER-001', 'Bad behavior', 'ADMIN-001');
  revoked = await registry.isRevoked('VERIFIER-001');
  assert.strictEqual(revoked, true);
});

test('Registry - List by Status', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifiers = await registry.listByStatus('approved');
  assert(Array.isArray(verifiers));
});

test('Registry - Get Audit Trail', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  await registry.registerVerifier(verifier);
  const trail = await registry.getAuditTrail('VERIFIER-001');

  assert(Array.isArray(trail));
  assert(trail.some(e => e.action === 'registered'));
});

test('Registry - Get Statistics', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const stats = await registry.getStatistics();

  assert(stats.total >= 0);
  assert(stats.approved >= 0);
  assert(stats.pending >= 0);
  assert(stats.suspended >= 0);
  assert(stats.revoked >= 0);
  assert(stats.avgTrustScore >= 0);
  assert(stats.totalVerifications >= 0);
});

test('Registry - Registry Config Constants', () => {
  assert.strictEqual(REGISTRY_CONFIG.NAMESPACE, 'org.smartcollege.verifier');
  assert.strictEqual(REGISTRY_CONFIG.VERSION, '1');
  assert(REGISTRY_CONFIG.VERIFIER_STATUSES.includes('approved'));
  assert(REGISTRY_CONFIG.VERIFICATION_TYPES.includes('academic'));
  assert.strictEqual(REGISTRY_CONFIG.DEFAULT_TRUST_SCORE, 50);
});

test('Registry - Verify Multiple Types', async () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Multi-Type Verifier',
    verificationTypes: ['academic', 'employment'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(verifier);
  assert.strictEqual(validation.valid, true);
});

test('Registry - Reject Too Many Types', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Too Many Types',
    verificationTypes: ['academic', 'employment', 'government', 'other', 'extra', 'too-many'],
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(verifier);
  assert.strictEqual(validation.valid, false);
});

test('Registry - Email Validation', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    contactEmail: 'invalid-email',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(verifier);
  assert.strictEqual(validation.valid, false);
});

test('Registry - URL Validation', () => {
  const registry = new VerifierRegistry({
    pool: new MockPool()
  });

  const verifier = {
    verifierId: 'VERIFIER-001',
    name: 'Test Verifier',
    verificationTypes: ['academic'],
    url: 'not-a-url',
    publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBANJTaF3KkJiGPj5/v7E7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8o\nkzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6L2L7D2J/7K8okzTaF3E9E/N6\nL2L7D2J/7K8AQIDAQAB\n-----END PUBLIC KEY-----'
  };

  const validation = registry.validateVerifier(verifier);
  assert.strictEqual(validation.valid, false);
});
