import { test } from 'node:test';
import assert from 'node:assert';
import { VerifierService } from '../src/index.js';

// Helper to create a valid QR payload
function createQRPayload(overrides = {}) {
  return {
    credentialId: 'cred-001',
    issuerId: 'issuer-001',
    issuerDid: 'did:example:issuer-001',
    credentialType: 'AcademicCredential',
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    issuanceDate: '2024-01-15',
    expiryDate: '2029-01-15',
    ...overrides
  };
}

test('Verifier Service - Create Instance', () => {
  const verifier = new VerifierService();
  assert.ok(verifier.verifierId);
  assert.strictEqual(verifier.verifierName, 'Smart College Verifier');
  assert.strictEqual(verifier.statistics.totalVerifications, 0);
});

test('Verifier Service - Custom Configuration', () => {
  const verifier = new VerifierService({
    verifierId: 'custom-verifier',
    verifierName: 'Test Verifier'
  });
  assert.strictEqual(verifier.verifierId, 'custom-verifier');
  assert.strictEqual(verifier.verifierName, 'Test Verifier');
});

test('Verifier Service - Register Issuer Success', () => {
  const verifier = new VerifierService();
  
  const result = verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University',
    verificationTypes: ['academic'],
    trustScore: 75
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'pending');
  assert.ok(result.issuerId);
});

test('Verifier Service - Register Issuer Missing Fields', () => {
  const verifier = new VerifierService();
  
  const result = verifier.registerIssuer({
    issuerId: 'issuer-001'
  });

  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('Verifier Service - Register Duplicate Issuer', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const result = verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'Different Name'
  });

  assert.strictEqual(result.success, false);
});

test('Verifier Service - Approve Issuer', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const result = verifier.approveIssuer('issuer-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'approved');
});

test('Verifier Service - Approve Non-Existent Issuer', () => {
  const verifier = new VerifierService();
  const result = verifier.approveIssuer('non-existent');
  
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Block Issuer', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const result = verifier.blockIssuer('issuer-001', 'Compromised credentials');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'blocked');
});

test('Verifier Service - Block Non-Existent Issuer', () => {
  const verifier = new VerifierService();
  const result = verifier.blockIssuer('non-existent');
  
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Update Trust Score Success', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University',
    trustScore: 50
  });

  const result = verifier.updateTrustScore('issuer-001', 85);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.trustScore, 85);
});

test('Verifier Service - Update Trust Score Invalid Range', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const result1 = verifier.updateTrustScore('issuer-001', 101);
  assert.strictEqual(result1.success, false);

  const result2 = verifier.updateTrustScore('issuer-001', -1);
  assert.strictEqual(result2.success, false);
});

test('Verifier Service - Get Trust Score', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University',
    trustScore: 75
  });

  const result = verifier.getTrustScore('issuer-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.trustScore, 75);
});

test('Verifier Service - Get Non-Existent Issuer Trust Score', () => {
  const verifier = new VerifierService();
  const result = verifier.getTrustScore('non-existent');
  
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Scan Approved Issuer Success', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University',
    trustScore: 85
  });
  verifier.approveIssuer('issuer-001');

  const result = verifier.scanPresentation(createQRPayload());
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'verified');
  assert.strictEqual(result.trustScore, 85);
});

test('Verifier Service - Scan Blocked Issuer Rejected', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');
  verifier.blockIssuer('issuer-001', 'Security concern');

  const result = verifier.scanPresentation(createQRPayload());
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'rejected');
  assert.ok(result.reason.includes('blocked'));
});

test('Verifier Service - Scan Unapproved Issuer Pending', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  const result = verifier.scanPresentation(createQRPayload());
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'pending_verification');
});

test('Verifier Service - Scan Unknown Issuer Pending', () => {
  const verifier = new VerifierService();

  const result = verifier.scanPresentation(createQRPayload());
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'pending_verification');
});

test('Verifier Service - Scan Invalid Payload Missing Credential ID', () => {
  const verifier = new VerifierService();
  
  const payload = createQRPayload();
  delete payload.credentialId;

  const result = verifier.scanPresentation(payload);
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Scan Invalid Payload Missing Issuer ID', () => {
  const verifier = new VerifierService();
  
  const payload = createQRPayload();
  delete payload.issuerId;

  const result = verifier.scanPresentation(payload);
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Scan Updates Statistics', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  verifier.scanPresentation(createQRPayload());
  verifier.scanPresentation(createQRPayload({ credentialId: 'cred-002' }));

  assert.strictEqual(verifier.statistics.totalVerifications, 2);
  assert.strictEqual(verifier.statistics.verifiedCount, 2);
  assert.strictEqual(verifier.statistics.byIssuer['issuer-001'], 2);
});

test('Verifier Service - Reject Verification', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  const scan = verifier.scanPresentation(createQRPayload());
  const result = verifier.rejectVerification(scan.verificationId, 'Manual review required');

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'rejected');
});

test('Verifier Service - Reject Non-Existent Verification', () => {
  const verifier = new VerifierService();
  const result = verifier.rejectVerification('non-existent');
  
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Cannot Double Reject', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  const scan = verifier.scanPresentation(createQRPayload());
  verifier.rejectVerification(scan.verificationId, 'First rejection');

  const result = verifier.rejectVerification(scan.verificationId, 'Second attempt');
  assert.strictEqual(result.success, false);
});

test('Verifier Service - Get Verification', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  const scan = verifier.scanPresentation(createQRPayload());
  const result = verifier.getVerification(scan.verificationId);

  assert.strictEqual(result.success, true);
  assert.ok(result.verification);
  assert.strictEqual(result.verification.credentialId, 'cred-001');
});

test('Verifier Service - Get Non-Existent Verification', () => {
  const verifier = new VerifierService();
  const result = verifier.getVerification('non-existent');
  
  assert.strictEqual(result.success, false);
});

test('Verifier Service - List Verifications', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  verifier.scanPresentation(createQRPayload());
  verifier.scanPresentation(createQRPayload({ credentialId: 'cred-002' }));

  const result = verifier.listVerifications();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.total, 2);
});

test('Verifier Service - List Verifications Filter by Status', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  const scan = verifier.scanPresentation(createQRPayload());
  verifier.rejectVerification(scan.verificationId);

  const result = verifier.listVerifications({ status: 'rejected' });
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.verifications[0].status, 'rejected');
});

test('Verifier Service - List Verifications Filter by Issuer', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'University A'
  });
  verifier.registerIssuer({
    issuerId: 'issuer-002',
    issuerName: 'University B'
  });
  verifier.approveIssuer('issuer-001');
  verifier.approveIssuer('issuer-002');

  verifier.scanPresentation(createQRPayload({ issuerId: 'issuer-001' }));
  verifier.scanPresentation(createQRPayload({ 
    issuerId: 'issuer-002',
    credentialId: 'cred-002'
  }));

  const result = verifier.listVerifications({ issuerId: 'issuer-001' });
  assert.strictEqual(result.total, 1);
});

test('Verifier Service - List Issuers', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'University A'
  });
  verifier.registerIssuer({
    issuerId: 'issuer-002',
    issuerName: 'University B'
  });

  const result = verifier.listIssuers();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.total, 2);
});

test('Verifier Service - List Issuers Filter by Status', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'University A'
  });
  verifier.registerIssuer({
    issuerId: 'issuer-002',
    issuerName: 'University B'
  });
  verifier.approveIssuer('issuer-001');

  const result = verifier.listIssuers({ status: 'approved' });
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.issuers[0].status, 'approved');
});

test('Verifier Service - List Issuers Filter by Verification Type', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'University A',
    verificationTypes: ['academic']
  });
  verifier.registerIssuer({
    issuerId: 'issuer-002',
    issuerName: 'Company B',
    verificationTypes: ['employment']
  });

  const result = verifier.listIssuers({ verificationTypes: ['academic'] });
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.issuers[0].issuerId, 'issuer-001');
});

test('Verifier Service - Get Statistics', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  verifier.scanPresentation(createQRPayload());

  const stats = verifier.getStatistics();
  assert.strictEqual(stats.totalVerifications, 1);
  assert.strictEqual(stats.verifiedCount, 1);
  assert.strictEqual(stats.trustedIssuersCount, 1);
});

test('Verifier Service - Statistics After Block', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.blockIssuer('issuer-001');

  const stats = verifier.getStatistics();
  assert.strictEqual(stats.blockedIssuersCount, 1);
});

test('Verifier Service - Audit Log Entry Creation', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });

  assert.strictEqual(verifier.auditLog.length, 1);
  assert.strictEqual(verifier.auditLog[0].action, 'issuer_registered');
});

test('Verifier Service - Audit Log Multiple Actions', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');
  verifier.updateTrustScore('issuer-001', 90);

  assert.strictEqual(verifier.auditLog.length, 3);
  assert.strictEqual(verifier.auditLog[1].action, 'issuer_approved');
  assert.strictEqual(verifier.auditLog[2].action, 'trust_score_updated');
});

test('Verifier Service - Get Audit Log', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  const result = verifier.getAuditLog({ action: 'issuer_registered' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.total, 1);
});

test('Verifier Service - Clear All Data', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');
  verifier.scanPresentation(createQRPayload());

  const result = verifier.clear();
  assert.strictEqual(result.success, true);
  assert.strictEqual(verifier.verifications.size, 0);
  assert.strictEqual(verifier.trustedIssuers.size, 0);
  assert.strictEqual(verifier.auditLog.length, 0);
});

test('Verifier Service - Verification Count Increments Issuer Verification Counter', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'State University'
  });
  verifier.approveIssuer('issuer-001');

  verifier.scanPresentation(createQRPayload());
  const score = verifier.getTrustScore('issuer-001');

  assert.strictEqual(score.verificationsCount, 1);
});

test('Verifier Service - Multiple Verification Types', () => {
  const verifier = new VerifierService();
  
  verifier.registerIssuer({
    issuerId: 'issuer-001',
    issuerName: 'Multi-Type Issuer',
    verificationTypes: ['academic', 'employment', 'government']
  });
  verifier.approveIssuer('issuer-001');

  verifier.scanPresentation(createQRPayload({ credentialType: 'AcademicCredential' }));
  verifier.scanPresentation(createQRPayload({ 
    credentialId: 'cred-002',
    credentialType: 'EmploymentCredential'
  }));

  const stats = verifier.getStatistics();
  assert.strictEqual(stats.byType['AcademicCredential'], 1);
  assert.strictEqual(stats.byType['EmploymentCredential'], 1);
});
