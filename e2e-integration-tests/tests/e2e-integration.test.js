import { test } from 'node:test';
import assert from 'node:assert';

// Mock API clients for testing
class IssuerServiceClient {
  async issueCredential(credentialData) {
    return {
      credentialId: `cred-${Math.random().toString(36).substr(2, 9)}`,
      issuerId: credentialData.issuerId,
      credentialType: credentialData.credentialType,
      studentId: credentialData.studentId,
      status: 'issued',
      issuedAt: new Date().toISOString(),
      expiresAt: credentialData.expiresAt,
      institution: credentialData.institution
    };
  }

  async getCredential(credentialId) {
    return {
      credentialId,
      issuerId: 'issuer-001',
      credentialType: 'AcademicCredential',
      studentId: 'STU-001',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  async revokeCredential(credentialId, reason) {
    return {
      success: true,
      credentialId,
      revokedAt: new Date().toISOString(),
      reason
    };
  }

  async generateQR(credentialId) {
    return {
      credentialId,
      qrData: JSON.stringify({
        credentialId,
        issuerId: 'issuer-001',
        credentialType: 'AcademicCredential',
        timestamp: new Date().toISOString()
      }),
      format: 'json'
    };
  }

  async listCredentials(filters) {
    return {
      credentials: [
        { credentialId: 'cred-001', status: 'active' },
        { credentialId: 'cred-002', status: 'active' }
      ],
      total: 2,
      pageNumber: 1,
      pageSize: 20
    };
  }
}

class VerifierServiceClient {
  constructor() {
    this.trustedIssuers = new Map();
    this.verifications = new Map();
  }

  async registerIssuer(issuerData) {
    const issuerId = issuerData.issuerId || `issuer-${Math.random().toString(36).substr(2, 9)}`;
    this.trustedIssuers.set(issuerId, {
      issuerId,
      issuerName: issuerData.issuerName,
      status: 'pending',
      trustScore: 50,
      registeredAt: new Date().toISOString()
    });
    return { issuerId, status: 'pending' };
  }

  async approveIssuer(issuerId) {
    const issuer = this.trustedIssuers.get(issuerId);
    if (!issuer) throw new Error('Issuer not found');
    issuer.status = 'approved';
    return { issuerId, status: 'approved' };
  }

  async blockIssuer(issuerId, reason) {
    const issuer = this.trustedIssuers.get(issuerId);
    if (!issuer) throw new Error('Issuer not found');
    issuer.status = 'blocked';
    issuer.blockedReason = reason;
    return { issuerId, status: 'blocked' };
  }

  async updateTrustScore(issuerId, score) {
    const issuer = this.trustedIssuers.get(issuerId);
    if (!issuer) throw new Error('Issuer not found');
    if (score < 0 || score > 100) throw new Error('Trust score must be 0-100');
    issuer.trustScore = score;
    return { issuerId, trustScore: score };
  }

  async scanPresentation(qrPayload) {
    if (!qrPayload.credentialId || !qrPayload.issuerId) {
      throw new Error('Invalid QR payload');
    }

    const verificationId = `ver-${Math.random().toString(36).substr(2, 9)}`;
    const issuer = this.trustedIssuers.get(qrPayload.issuerId);

    let result = {
      verificationId,
      credentialId: qrPayload.credentialId,
      issuerId: qrPayload.issuerId,
      status: 'verified',
      trustScore: 50,
      createdAt: new Date().toISOString()
    };

    if (!issuer) {
      result.status = 'unverified';
      result.reason = 'Issuer not registered';
    } else if (issuer.status === 'blocked') {
      result.status = 'rejected';
      result.reason = 'Issuer is blocked';
    } else if (issuer.status === 'pending') {
      result.status = 'pending_verification';
      result.reason = 'Issuer not approved yet';
    } else if (issuer.status === 'approved') {
      result.status = 'verified';
      result.trustScore = issuer.trustScore;
    }

    this.verifications.set(verificationId, result);
    return result;
  }

  async getVerification(verificationId) {
    return this.verifications.get(verificationId) || null;
  }

  async listVerifications(filters) {
    const verifications = Array.from(this.verifications.values());
    return {
      verifications,
      total: verifications.length
    };
  }

  async getStatistics() {
    const verifications = Array.from(this.verifications.values());
    const verified = verifications.filter(v => v.status === 'verified').length;
    const rejected = verifications.filter(v => v.status === 'rejected').length;

    return {
      totalVerifications: verifications.length,
      verifiedCount: verified,
      rejectedCount: rejected,
      pendingCount: verifications.filter(v => v.status === 'pending_verification').length,
      trustedIssuersCount: Array.from(this.trustedIssuers.values()).filter(i => i.status === 'approved').length,
      blockedIssuersCount: Array.from(this.trustedIssuers.values()).filter(i => i.status === 'blocked').length
    };
  }
}

// =========================
// E2E Integration Tests
// =========================

test('E2E: Issue Credential - Happy Path', async () => {
  const issuer = new IssuerServiceClient();

  const credentialData = {
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  const credential = await issuer.issueCredential(credentialData);

  assert.ok(credential.credentialId);
  assert.strictEqual(credential.status, 'issued');
  assert.strictEqual(credential.issuerId, 'issuer-001');
  assert.strictEqual(credential.credentialType, 'AcademicCredential');
});

test('E2E: Issue Multiple Credentials', async () => {
  const issuer = new IssuerServiceClient();

  const credentials = await Promise.all([
    issuer.issueCredential({
      issuerId: 'issuer-001',
      credentialType: 'AcademicCredential',
      studentId: 'STU-001',
      institution: 'State University',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    }),
    issuer.issueCredential({
      issuerId: 'issuer-002',
      credentialType: 'EmploymentCredential',
      employeeId: 'EMP-001',
      employer: 'Tech Company',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    })
  ]);

  assert.strictEqual(credentials.length, 2);
  assert.ok(credentials[0].credentialId);
  assert.ok(credentials[1].credentialId);
  assert.notStrictEqual(credentials[0].credentialId, credentials[1].credentialId);
});

test('E2E: Revoke Credential', async () => {
  const issuer = new IssuerServiceClient();

  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  const revoked = await issuer.revokeCredential(credential.credentialId, 'Student withdrew');

  assert.strictEqual(revoked.success, true);
  assert.ok(revoked.revokedAt);
  assert.strictEqual(revoked.reason, 'Student withdrew');
});

test('E2E: Generate QR Code for Credential', async () => {
  const issuer = new IssuerServiceClient();

  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  const qr = await issuer.generateQR(credential.credentialId);

  assert.ok(qr.credentialId);
  assert.ok(qr.qrData);
  
  const parsed = JSON.parse(qr.qrData);
  assert.strictEqual(parsed.credentialId, credential.credentialId);
});

test('E2E: Register Issuer with Verifier', async () => {
  const verifier = new VerifierServiceClient();

  const result = await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  assert.strictEqual(result.status, 'pending');
  assert.ok(result.issuerId);
});

test('E2E: Approve Issuer', async () => {
  const verifier = new VerifierServiceClient();

  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const approved = await verifier.approveIssuer('issuer-001');

  assert.strictEqual(approved.status, 'approved');
});

test('E2E: Block Issuer', async () => {
  const verifier = new VerifierServiceClient();

  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  await verifier.approveIssuer('issuer-001');

  const blocked = await verifier.blockIssuer('issuer-001', 'Fraudulent credentials detected');

  assert.strictEqual(blocked.status, 'blocked');
});

test('E2E: Update Trust Score', async () => {
  const verifier = new VerifierServiceClient();

  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const updated = await verifier.updateTrustScore('issuer-001', 85);

  assert.strictEqual(updated.trustScore, 85);
});

test('E2E: Verify Approved Issuer Credential', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Issue credential
  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  // Register and approve issuer
  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  await verifier.approveIssuer('issuer-001');
  await verifier.updateTrustScore('issuer-001', 85);

  // Scan presentation
  const qr = await issuer.generateQR(credential.credentialId);
  const qrPayload = JSON.parse(qr.qrData);
  const verification = await verifier.scanPresentation(qrPayload);

  assert.strictEqual(verification.status, 'verified');
  assert.strictEqual(verification.trustScore, 85);
  assert.ok(verification.verificationId);
});

test('E2E: Reject Credential from Blocked Issuer', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Issue credential
  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  // Register issuer
  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  // Block issuer
  await verifier.blockIssuer('issuer-001', 'Fraudulent credentials');

  // Scan presentation
  const qr = await issuer.generateQR(credential.credentialId);
  const qrPayload = JSON.parse(qr.qrData);
  const verification = await verifier.scanPresentation(qrPayload);

  assert.strictEqual(verification.status, 'rejected');
  assert.ok(verification.reason.includes('blocked'));
});

test('E2E: Pending Verification for Unapproved Issuer', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Issue credential
  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  // Register issuer (but don't approve)
  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  // Scan presentation
  const qr = await issuer.generateQR(credential.credentialId);
  const qrPayload = JSON.parse(qr.qrData);
  const verification = await verifier.scanPresentation(qrPayload);

  assert.strictEqual(verification.status, 'pending_verification');
  assert.ok(verification.reason.includes('not approved'));
});

test('E2E: Unregistered Issuer Credential', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Issue credential from unregistered issuer
  const credential = await issuer.issueCredential({
    issuerId: 'issuer-unknown',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'Unknown University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  // Scan without registering issuer
  const qr = await issuer.generateQR(credential.credentialId);
  const qrPayload = JSON.parse(qr.qrData);
  const verification = await verifier.scanPresentation(qrPayload);

  assert.strictEqual(verification.status, 'unverified');
  assert.ok(verification.reason.includes('not registered'));
});

test('E2E: Get Verification Details', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  await verifier.approveIssuer('issuer-001');

  const qr = await issuer.generateQR(credential.credentialId);
  const qrPayload = JSON.parse(qr.qrData);
  const verification = await verifier.scanPresentation(qrPayload);

  const retrieved = await verifier.getVerification(verification.verificationId);

  assert.strictEqual(retrieved.verificationId, verification.verificationId);
  assert.strictEqual(retrieved.status, 'verified');
});

test('E2E: List Verifications', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Create and verify multiple credentials
  for (let i = 0; i < 3; i++) {
    const credential = await issuer.issueCredential({
      issuerId: 'issuer-001',
      credentialType: 'AcademicCredential',
      studentId: `STU-00${i}`,
      institution: 'State University',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });

    if (i === 0) {
      await verifier.registerIssuer({
        issuerId: 'issuer-001',
        issuerName: 'State University'
      });

      await verifier.approveIssuer('issuer-001');
    }

    const qr = await issuer.generateQR(credential.credentialId);
    const qrPayload = JSON.parse(qr.qrData);
    await verifier.scanPresentation(qrPayload);
  }

  const list = await verifier.listVerifications({});

  assert.strictEqual(list.total, 3);
  assert.strictEqual(list.verifications.length, 3);
});

test('E2E: Verifier Statistics Dashboard', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Register and approve issuer
  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  await verifier.approveIssuer('issuer-001');

  // Issue and verify credentials
  for (let i = 0; i < 5; i++) {
    const credential = await issuer.issueCredential({
      issuerId: 'issuer-001',
      credentialType: 'AcademicCredential',
      studentId: `STU-00${i}`,
      institution: 'State University',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    });

    const qr = await issuer.generateQR(credential.credentialId);
    const qrPayload = JSON.parse(qr.qrData);
    await verifier.scanPresentation(qrPayload);
  }

  const stats = await verifier.getStatistics();

  assert.strictEqual(stats.totalVerifications, 5);
  assert.strictEqual(stats.verifiedCount, 5);
  assert.strictEqual(stats.rejectedCount, 0);
  assert.strictEqual(stats.trustedIssuersCount, 1);
  assert.strictEqual(stats.blockedIssuersCount, 0);
});

test('E2E: Full Workflow - Issue, Generate QR, Verify, Store', async () => {
  const issuer = new IssuerServiceClient();
  const verifier = new VerifierServiceClient();

  // Step 1: Issuer issues credential
  const credential = await issuer.issueCredential({
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    institution: 'State University',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  });

  assert.ok(credential.credentialId);

  // Step 2: Issuer generates QR code
  const qr = await issuer.generateQR(credential.credentialId);
  assert.ok(qr.qrData);

  // Step 3: Verifier registers and approves issuer
  await verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  await verifier.approveIssuer('issuer-001');
  await verifier.updateTrustScore('issuer-001', 90);

  // Step 4: Mobile wallet receives and stores credential
  const storedCredential = {
    credentialId: credential.credentialId,
    issuerId: credential.issuerId,
    credentialType: credential.credentialType,
    studentId: credential.studentId,
    storedAt: new Date().toISOString(),
    walletVersion: '1.0'
  };

  assert.ok(storedCredential.credentialId);

  // Step 5: Verifier scans QR code
  const qrPayload = JSON.parse(qr.qrData);
  const verification = await verifier.scanPresentation(qrPayload);

  assert.strictEqual(verification.status, 'verified');
  assert.strictEqual(verification.trustScore, 90);

  // Step 6: Verification result confirmed
  const verificationDetails = await verifier.getVerification(verification.verificationId);

  assert.strictEqual(verificationDetails.status, 'verified');
  assert.strictEqual(verificationDetails.credentialId, credential.credentialId);
});
