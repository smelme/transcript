/**
 * Tests for Verifier QR Scanner
 * Coverage: QR scanning, verification workflow, trust management
 */

import assert from 'assert';
import { test } from 'node:test';
import { VerifierQRScanner } from '../src/index.js';

/**
 * Helper to create valid presentation metadata
 */
function createValidPresentation(overrides = {}) {
  return {
    credentialId: 'cred-001',
    issuerDid: 'did:key:issuer123',
    credentialType: 'AcademicCredential',
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides
  };
}

/**
 * Helper to convert to JSON string
 */
function jsonToQRData(obj) {
  return JSON.stringify(obj);
}

test('Scanner - Create Instance', () => {
  const scanner = new VerifierQRScanner({
    verifierId: 'verifier-001',
    verifierName: 'Test Verifier'
  });
  assert.strictEqual(scanner.verifierId, 'verifier-001');
  assert.strictEqual(scanner.verifierName, 'Test Verifier');
});

test('Scanner - Register Trusted Issuer', () => {
  const scanner = new VerifierQRScanner();
  const result = scanner.registerTrustedIssuer(
    'did:key:issuer123',
    'University Name',
    75
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.issuerDid, 'did:key:issuer123');
});

test('Scanner - Reject Invalid Issuer Did', () => {
  const scanner = new VerifierQRScanner();
  const result = scanner.registerTrustedIssuer('', 'Name', 50);

  assert.strictEqual(result.success, false);
});

test('Scanner - Reject Invalid Trust Score', () => {
  const scanner = new VerifierQRScanner();
  const result = scanner.registerTrustedIssuer('did:key:issuer', 'Name', 150);

  assert.strictEqual(result.success, false);
});

test('Scanner - Parse JSON QR Data', () => {
  const scanner = new VerifierQRScanner();
  const presentation = createValidPresentation();
  const qrData = jsonToQRData(presentation);

  const parsed = scanner.parseQRData(qrData);
  assert.strictEqual(parsed.credentialId, 'cred-001');
});

test('Scanner - Parse BASE64 QR Data', () => {
  const scanner = new VerifierQRScanner();
  const presentation = createValidPresentation();
  const qrData = Buffer.from(JSON.stringify(presentation)).toString('base64');

  const parsed = scanner.parseQRData(qrData);
  assert.strictEqual(parsed.credentialId, 'cred-001');
});

test('Scanner - Validate Valid Presentation', () => {
  const scanner = new VerifierQRScanner();
  const presentation = createValidPresentation();

  const validation = scanner.validatePresentationRequest(presentation);
  assert.strictEqual(validation.valid, true);
});

test('Scanner - Reject Missing CredentialId', () => {
  const scanner = new VerifierQRScanner();
  const presentation = createValidPresentation({ credentialId: undefined });

  const validation = scanner.validatePresentationRequest(presentation);
  assert.strictEqual(validation.valid, false);
});

test('Scanner - Reject Expired Credential', () => {
  const scanner = new VerifierQRScanner();
  const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const presentation = createValidPresentation({ 
    expiryDate: pastDate.toISOString() 
  });

  const validation = scanner.validatePresentationRequest(presentation);
  assert.strictEqual(validation.valid, false);
});

test('Scanner - Reject Unsupported Credential Type', () => {
  const scanner = new VerifierQRScanner({
    supportedTypes: ['AcademicCredential']
  });
  const presentation = createValidPresentation({ 
    credentialType: 'EmploymentCredential' 
  });

  const validation = scanner.validatePresentationRequest(presentation);
  assert.strictEqual(validation.valid, false);
});

test('Scanner - Scan Presentation Without Trusted Issuer', async () => {
  const scanner = new VerifierQRScanner();
  const presentation = createValidPresentation();
  const qrData = jsonToQRData(presentation);

  const result = await scanner.scanPresentation(qrData);
  assert.strictEqual(result.success, false);
  assert(result.error.includes('not in trusted registry'));
});

test('Scanner - Scan Presentation With Trusted Issuer', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const qrData = jsonToQRData(presentation);

  const result = await scanner.scanPresentation(qrData);
  assert.strictEqual(result.success, true);
  assert(result.scanId);
  assert.strictEqual(result.issuerTrust, 80);
});

test('Scanner - Get Scan Result', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const result = await scanner.scanPresentation(jsonToQRData(presentation));
  const scan = scanner.getScan(result.scanId);

  assert(scan);
  assert.strictEqual(scan.credentialId, 'cred-001');
});

test('Scanner - Verify Presentation', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));
  const verifyResult = await scanner.verifyPresentation(scanResult.scanId);

  assert.strictEqual(verifyResult.success, true);
  assert.strictEqual(verifyResult.credentialId, 'cred-001');
});

test('Scanner - Verify With Low Trust Score', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 20);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));
  const verifyResult = await scanner.verifyPresentation(scanResult.scanId, {
    minTrustScore: 50
  });

  assert.strictEqual(verifyResult.success, false);
  assert(verifyResult.error);
});

test('Scanner - List Trusted Issuers', () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer1', 'University 1', 80);
  scanner.registerTrustedIssuer('did:key:issuer2', 'University 2', 60);

  const issuers = scanner.listTrustedIssuers();
  assert.strictEqual(issuers.length, 2);
});

test('Scanner - Filter Trusted Issuers by Trust Score', () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer1', 'University 1', 80);
  scanner.registerTrustedIssuer('did:key:issuer2', 'University 2', 40);

  const issuers = scanner.listTrustedIssuers({ minTrustScore: 60 });
  assert.strictEqual(issuers.length, 1);
  assert.strictEqual(issuers[0].trustScore, 80);
});

test('Scanner - Update Issuer Trust Score', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 50);

  const result = scanner.updateIssuerTrustScore('did:key:issuer123', 75);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.oldTrustScore, 50);
  assert.strictEqual(result.newTrustScore, 75);
});

test('Scanner - Reject Invalid Trust Score Update', () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 50);

  const result = scanner.updateIssuerTrustScore('did:key:issuer123', 150);
  assert.strictEqual(result.success, false);
});

test('Scanner - Block Issuer', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 50);

  const result = scanner.blockIssuer('did:key:issuer123', 'Compromised');
  assert.strictEqual(result.success, true);

  // Try to scan with blocked issuer
  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));
  assert.strictEqual(scanResult.success, false);
});

test('Scanner - Reject Presentation', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));
  const rejectResult = scanner.rejectPresentation(scanResult.scanId, 'Fraud detected');

  assert.strictEqual(rejectResult.success, true);
  const scan = scanner.getScan(scanResult.scanId);
  assert.strictEqual(scan.status, 'rejected');
});

test('Scanner - List Recent Scans', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  for (let i = 1; i <= 3; i++) {
    const presentation = createValidPresentation({ 
      credentialId: `cred-00${i}` 
    });
    await scanner.scanPresentation(jsonToQRData(presentation));
  }

  const scans = scanner.listScans();
  assert.strictEqual(scans.length, 3);
});

test('Scanner - Filter Scans by Status', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));

  scanner.rejectPresentation(scanResult.scanId);

  const pendingScans = scanner.listScans(50, { status: 'pending_verification' });
  assert.strictEqual(pendingScans.length, 0);

  const rejectedScans = scanner.listScans(50, { status: 'rejected' });
  assert.strictEqual(rejectedScans.length, 1);
});

test('Scanner - List Verifications', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));
  await scanner.verifyPresentation(scanResult.scanId);

  const verifications = scanner.listVerifications();
  assert.strictEqual(verifications.length, 1);
});

test('Scanner - Get Statistics', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  await scanner.scanPresentation(jsonToQRData(presentation));

  const stats = scanner.getStatistics();
  assert.strictEqual(stats.totalScans, 1);
  assert.strictEqual(stats.trustedIssuers, 1);
});

test('Scanner - Export Verification Report', async () => {
  const scanner = new VerifierQRScanner({
    verifierId: 'verifier-001'
  });
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  await scanner.scanPresentation(jsonToQRData(presentation));

  const report = scanner.exportVerificationReport('json');
  assert.strictEqual(report.success, true);
  assert(report.data.verifierId);
});

test('Scanner - Request Signature Verification', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));

  const result = await scanner.requestSignatureVerification(
    scanResult.scanId,
    'signature-data-here',
    '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQc=\n-----END PUBLIC KEY-----'
  );

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.signatureValid, true);
});

test('Scanner - Reject Signature Verification Without Data', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  const scanResult = await scanner.scanPresentation(jsonToQRData(presentation));

  const result = await scanner.requestSignatureVerification(
    scanResult.scanId,
    null,
    'key'
  );

  assert.strictEqual(result.success, false);
});

test('Scanner - Get Audit Log', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  await scanner.scanPresentation(jsonToQRData(presentation));

  const log = scanner.getAuditLog();
  assert(log.length > 0);
});

test('Scanner - Clear History', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:issuer123', 'University', 80);

  const presentation = createValidPresentation();
  await scanner.scanPresentation(jsonToQRData(presentation));

  assert.strictEqual(scanner.listScans().length, 1);

  const result = scanner.clearHistory();
  assert.strictEqual(result.success, true);
  assert.strictEqual(scanner.listScans().length, 0);
});

test('Scanner - Multiple Issuers Scenario', async () => {
  const scanner = new VerifierQRScanner();
  scanner.registerTrustedIssuer('did:key:university', 'University', 90);
  scanner.registerTrustedIssuer('did:key:employer', 'Employer', 70);

  const uniCred = createValidPresentation({ 
    issuerDid: 'did:key:university',
    credentialId: 'uni-cred'
  });
  const empCred = createValidPresentation({ 
    issuerDid: 'did:key:employer',
    credentialId: 'emp-cred'
  });

  const uniResult = await scanner.scanPresentation(jsonToQRData(uniCred));
  const empResult = await scanner.scanPresentation(jsonToQRData(empCred));

  assert.strictEqual(uniResult.success, true);
  assert.strictEqual(empResult.success, true);

  const stats = scanner.getStatistics();
  assert.strictEqual(stats.trustedIssuers, 2);
});

test('Scanner - Invalid QR Data', async () => {
  const scanner = new VerifierQRScanner();
  const result = await scanner.scanPresentation('invalid data');

  assert.strictEqual(result.success, false);
});
