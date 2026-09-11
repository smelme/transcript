import { test, beforeEach } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Point the shared database at a throwaway file *before* the service is loaded.
// IssuerService loads persisted credentials on startup, so a developer's
// populated dev database would otherwise leak into these in-memory assertions
// (they expect a clean store) and report failures that do not exist in CI.
const testDbPath = path.join(os.tmpdir(), `issuer-unit-${process.pid}.db`);
process.env.DATABASE_PATH = testDbPath;
for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}
process.on('exit', () => {
  for (const suffix of ['', '-shm', '-wal']) {
    // The database handle is still open while this runs, so removal can fail;
    // the file is in the OS temp directory either way.
    try { fs.rmSync(`${testDbPath}${suffix}`, { force: true }); } catch { /* leave it to the OS */ }
  }
});

const { IssuerService } = await import('../src/index.js');
const { getDb } = await import('../../db.js');
const { generateAcademicRecord } = await import('../src/credential-generator.js');
const { verifyIssuerSigned } = await import('../../mdoc-core.js');

// Every test asserts against an empty store, but issued credentials are
// persisted and a new IssuerService loads them on construction - so without this
// each test would inherit the credentials the previous one issued.
beforeEach(() => {
  getDb().prepare('DELETE FROM credentials').run();
});

test('Credential kinds - a transcript is its own credential', () => {
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T1',
    include: 'transcript',
  });
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].kind, 'transcript');
  assert.strictEqual(records[0].docType, 'org.iso.23220.education.transcript.1');
  assert.ok(records[0].credentialData.education_transcript, 'expected transcript data');
  assert.strictEqual(
    records[0].credentialData.education_qualification,
    undefined,
    'a transcript credential must not carry qualification data',
  );
  assert.ok(records[0].credentialData.full_name, 'identity travels with the transcript');
});

test('Credential kinds - both means two credentials, one per kind', () => {
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T2',
    include: 'both',
  });
  assert.deepStrictEqual(records.map((record) => record.kind), ['qualification', 'transcript']);
  assert.deepStrictEqual(records.map((record) => record.docType), [
    'org.iso.23220.photoid.1',
    'org.iso.23220.education.transcript.1',
  ]);
  assert.deepStrictEqual(records.map((record) => record.display.kind), ['qualification', 'transcript']);
});

test('Credential kinds - qualification is the default, even for an unknown choice', () => {
  for (const include of [undefined, '', 'nonsense']) {
    const { records } = generateAcademicRecord({
      institution: 'Smart Academy',
      studentId: 'SA-T3',
      include,
    });
    assert.strictEqual(records.length, 1, `include=${include}`);
    assert.strictEqual(records[0].docType, 'org.iso.23220.photoid.1');
    assert.ok(records[0].credentialData.education_qualification);
    assert.strictEqual(records[0].credentialData.education_transcript, undefined);
  }
});

test('Credential kinds - a transcript mdoc carries no qualification namespace', () => {
  const issuer = new IssuerService();
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T4',
    include: 'transcript',
  });
  const mdoc = issuer.buildCredentialMdoc(records[0].credentialData);
  assert.ok(mdoc, 'expected a signed mdoc');

  const verified = verifyIssuerSigned(mdoc.base64url);
  assert.strictEqual(verified.docType, 'org.iso.23220.education.transcript.1');
  assert.deepStrictEqual(Object.keys(verified.namespaces).sort(), [
    'org.iso.23220.education.transcript.1',
    'org.iso.23220.photoid.1',
  ]);
});

test('Credential kinds - a qualification mdoc carries no transcript namespace', () => {
  const issuer = new IssuerService();
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T5',
    include: 'qualification',
  });
  const mdoc = issuer.buildCredentialMdoc(records[0].credentialData);
  assert.ok(mdoc, 'expected a signed mdoc');

  const verified = verifyIssuerSigned(mdoc.base64url);
  assert.strictEqual(verified.docType, 'org.iso.23220.photoid.1');
  assert.deepStrictEqual(Object.keys(verified.namespaces).sort(), [
    'org.iso.23220.education.qualification.1',
    'org.iso.23220.photoid.1',
  ]);
});

test('Credential kinds - issuing a transcript records its own docType', () => {
  const issuer = new IssuerService();
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T6',
    include: 'transcript',
  });
  const result = issuer.issue(records[0].credentialData);
  assert.strictEqual(result.success, true, result.error);
  assert.strictEqual(result.docType, 'org.iso.23220.education.transcript.1');

  const stored = issuer.getCredential(result.credentialId);
  assert.strictEqual(stored.credential.docType, 'org.iso.23220.education.transcript.1');
  assert.notStrictEqual(
    stored.credential.statusIndex,
    undefined,
    'a transcript credential needs its own status index',
  );
});

test('Issuer Service - Create Instance', () => {
  const issuer = new IssuerService();
  assert.ok(issuer.issuerId);
  assert.strictEqual(issuer.issuerName, 'Smart College');
  assert.strictEqual(issuer.statistics.totalIssued, 0);
});

test('Issuer Service - Custom Configuration', () => {
  const issuer = new IssuerService({
    issuerId: 'custom-issuer',
    issuerName: 'Test University',
    issuerDid: 'did:example:custom'
  });
  assert.strictEqual(issuer.issuerId, 'custom-issuer');
  assert.strictEqual(issuer.issuerName, 'Test University');
  assert.strictEqual(issuer.issuerDid, 'did:example:custom');
});

test('Issuer Service - Issue Credential Success', () => {
  const issuer = new IssuerService();
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [
      { courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 },
      { courseCode: 'MATH101', courseName: 'Calculus I', credits: 4 }
    ],
    gpa: 3.8,
    degreeLevel: 'bachelor'
  };

  const result = issuer.issue(credentialData);
  assert.strictEqual(result.success, true);
  assert.ok(result.credentialId);
  assert.strictEqual(result.status, 'active');
});

test('Issuer Service - Issue Credential Validation - Missing Student ID', () => {
  const issuer = new IssuerService();
  const credentialData = {
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  };

  const result = issuer.issue(credentialData);
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('Issuer Service - Issue Credential Validation - Invalid GPA', () => {
  const issuer = new IssuerService();
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }],
    gpa: 5.0 // Invalid: > 4.0
  };

  const result = issuer.issue(credentialData);
  assert.strictEqual(result.success, false);
});

test('Issuer Service - Issue Credential Validation - No Courses', () => {
  const issuer = new IssuerService();
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [] // Invalid: must have at least 1
  };

  const result = issuer.issue(credentialData);
  assert.strictEqual(result.success, false);
});

test('Issuer Service - Issue Credential Validation - Invalid Credits', () => {
  const issuer = new IssuerService();
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 1000 }] // Invalid: > 999
  };

  const result = issuer.issue(credentialData);
  assert.strictEqual(result.success, false);
});

test('Issuer Service - Update Statistics After Issuance', () => {
  const issuer = new IssuerService();
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  };

  issuer.issue(credentialData);
  assert.strictEqual(issuer.statistics.totalIssued, 1);
  assert.strictEqual(issuer.statistics.byStudent['STU-001'], 1);
  assert.strictEqual(issuer.statistics.byType['AcademicCredential'], 1);
});

test('Issuer Service - Get Credential Success', () => {
  const issuer = new IssuerService();
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  };

  const issued = issuer.issue(credentialData);
  const retrieved = issuer.getCredential(issued.credentialId);
  
  assert.strictEqual(retrieved.success, true);
  assert.strictEqual(retrieved.credential.credentialId, issued.credentialId);
  assert.strictEqual(retrieved.credential.studentId, 'STU-001');
});

test('Issuer Service - Get Non-Existent Credential', () => {
  const issuer = new IssuerService();
  const result = issuer.getCredential('non-existent');
  
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('Issuer Service - List Credentials All', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University A',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.issue({
    studentId: 'STU-002',
    name: { givenName: 'Jane', familyName: 'Smith' },
    institution: 'University B',
    courses: [{ courseCode: 'MATH101', courseName: 'Calculus', credits: 4 }]
  });

  const result = issuer.listCredentials();
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.credentials.length, 2);
  assert.strictEqual(result.total, 2);
});

test('Issuer Service - List Credentials Filter by Student', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University A',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.issue({
    studentId: 'STU-002',
    name: { givenName: 'Jane', familyName: 'Smith' },
    institution: 'University B',
    courses: [{ courseCode: 'MATH101', courseName: 'Calculus', credits: 4 }]
  });

  const result = issuer.listCredentials({ studentId: 'STU-001' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.credentials.length, 1);
  assert.strictEqual(result.credentials[0].studentId, 'STU-001');
});

test('Issuer Service - List Credentials Pagination', () => {
  const issuer = new IssuerService();
  
  for (let i = 0; i < 25; i++) {
    issuer.issue({
      studentId: `STU-${i}`,
      name: { givenName: 'Test', familyName: `Student${i}` },
      institution: 'University',
      courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
    });
  }

  const page1 = issuer.listCredentials({ page: 1, pageSize: 10 });
  assert.strictEqual(page1.credentials.length, 10);
  assert.strictEqual(page1.page, 1);
  assert.strictEqual(page1.total, 25);

  const page2 = issuer.listCredentials({ page: 2, pageSize: 10 });
  assert.strictEqual(page2.credentials.length, 10);
  assert.strictEqual(page2.page, 2);
});

test('Issuer Service - Revoke Credential Success', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  const revoked = issuer.revokeCredential(issued.credentialId, 'Degree revoked');
  assert.strictEqual(revoked.success, true);
  assert.strictEqual(revoked.status, 'revoked');
  assert.strictEqual(issuer.statistics.totalRevoked, 1);
});

test('Issuer Service - Revoke Non-Existent Credential', () => {
  const issuer = new IssuerService();
  const result = issuer.revokeCredential('non-existent');
  
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('Issuer Service - Revoke Already Revoked Credential', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.revokeCredential(issued.credentialId, 'First revocation');
  const secondRevoke = issuer.revokeCredential(issued.credentialId, 'Second attempt');
  
  assert.strictEqual(secondRevoke.success, false);
  assert.ok(secondRevoke.error);
});

test('Issuer Service - Cannot Get Revoked Credential', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.revokeCredential(issued.credentialId);
  const retrieved = issuer.getCredential(issued.credentialId);
  
  assert.strictEqual(retrieved.success, false);
  assert.ok(retrieved.error.includes('revoked'));
});

test('Issuer Service - Generate QR Code', async () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  const qrResult = await issuer.generateQR(issued.credentialId);
  assert.strictEqual(qrResult.success, true);
  assert.ok(qrResult.qrDataUrl);
  assert.ok(qrResult.qrDataUrl.startsWith('data:image/png'));
  assert.ok(qrResult.payload);
  assert.strictEqual(qrResult.payload.credentialId, issued.credentialId);
});

test('Issuer Service - Generate QR for Non-Existent Credential', async () => {
  const issuer = new IssuerService();
  const result = await issuer.generateQR('non-existent');
  
  assert.strictEqual(result.success, false);
  assert.ok(result.error);
});

test('Issuer Service - Get Statistics', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.issue({
    studentId: 'STU-002',
    name: { givenName: 'Jane', familyName: 'Smith' },
    institution: 'University',
    courses: [{ courseCode: 'MATH101', courseName: 'Calculus', credits: 4 }]
  });

  const stats = issuer.getStatistics();
  assert.strictEqual(stats.totalIssued, 2);
  assert.strictEqual(stats.credentialsInSystem, 2);
  assert.strictEqual(stats.activeCredentials, 2);
  assert.ok(stats.byStudent['STU-001']);
});

test('Issuer Service - Statistics After Revocation', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.revokeCredential(issued.credentialId);
  const stats = issuer.getStatistics();
  
  assert.strictEqual(stats.totalIssued, 1);
  assert.strictEqual(stats.totalRevoked, 1);
  assert.strictEqual(stats.activeCredentials, 0);
});

test('Issuer Service - Audit Log Entry Creation', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  assert.strictEqual(issuer.auditLog.length, 1);
  assert.strictEqual(issuer.auditLog[0].action, 'credential_issued');
  assert.strictEqual(issuer.auditLog[0].studentId, 'STU-001');
  assert.strictEqual(issuer.auditLog[0].credentialId, issued.credentialId);
});

test('Issuer Service - Audit Log Multiple Actions', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.revokeCredential(issued.credentialId, 'Test revocation');

  assert.strictEqual(issuer.auditLog.length, 2);
  assert.strictEqual(issuer.auditLog[0].action, 'credential_issued');
  assert.strictEqual(issuer.auditLog[1].action, 'credential_revoked');
  assert.strictEqual(issuer.auditLog[1].details.reason, 'Test revocation');
});

test('Issuer Service - Get Audit Log', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.issue({
    studentId: 'STU-002',
    name: { givenName: 'Jane', familyName: 'Smith' },
    institution: 'University',
    courses: [{ courseCode: 'MATH101', courseName: 'Calculus', credits: 4 }]
  });

  const result = issuer.getAuditLog({ action: 'credential_issued' });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.auditLog.length, 2);
  assert.strictEqual(result.total, 2);
});

test('Issuer Service - Get Audit Log Filter by Student', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.issue({
    studentId: 'STU-002',
    name: { givenName: 'Jane', familyName: 'Smith' },
    institution: 'University',
    courses: [{ courseCode: 'MATH101', courseName: 'Calculus', credits: 4 }]
  });

  const result = issuer.getAuditLog({ studentId: 'STU-001' });
  assert.strictEqual(result.auditLog.length, 1);
  assert.strictEqual(result.auditLog[0].studentId, 'STU-001');
});

test('Issuer Service - Clear Issuer Data', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  const clearResult = issuer.clear();
  assert.strictEqual(clearResult.success, true);
  assert.strictEqual(issuer.credentials.size, 0);
  assert.strictEqual(issuer.auditLog.length, 0);
  assert.strictEqual(issuer.statistics.totalIssued, 0);
});

test('Issuer Service - Issue with All Optional Fields', () => {
  const issuer = new IssuerService();
  
  const credentialData = {
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'State University',
    courses: [
      { courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 },
      { courseCode: 'MATH101', courseName: 'Calculus I', credits: 4 }
    ],
    credentialType: 'DegreeCredential',
    dateOfBirth: '2000-01-15',
    degreeLevel: 'bachelor',
    fieldOfStudy: 'Computer Science',
    gpa: 3.85,
    achievements: ['Dean\'s List', 'Honors Scholar'],
    issuanceDate: '2024-05-15',
    expiryDate: '2029-05-15'
  };

  const result = issuer.issue(credentialData);
  assert.strictEqual(result.success, true);
  
  const credential = issuer.getCredential(result.credentialId).credential;
  assert.strictEqual(credential.degreeLevel, 'bachelor');
  assert.strictEqual(credential.gpa, 3.85);
  assert.ok(credential.achievements);
  assert.strictEqual(credential.achievements.length, 2);
});

test('Issuer Service - Multiple Students Multiple Credentials', () => {
  const issuer = new IssuerService();
  
  // Student 1 - 2 credentials
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University A',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University A',
    courses: [{ courseCode: 'CS201', courseName: 'Advanced CS', credits: 4 }]
  });

  // Student 2 - 1 credential
  issuer.issue({
    studentId: 'STU-002',
    name: { givenName: 'Jane', familyName: 'Smith' },
    institution: 'University B',
    courses: [{ courseCode: 'MATH101', courseName: 'Calculus', credits: 4 }]
  });

  assert.strictEqual(issuer.statistics.totalIssued, 3);
  assert.strictEqual(issuer.statistics.byStudent['STU-001'], 2);
  assert.strictEqual(issuer.statistics.byStudent['STU-002'], 1);
});

test('Issuer Service - Credential Status After Issue', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  const credential = issuer.getCredential(issued.credentialId).credential;
  assert.strictEqual(credential.status, 'active');
  assert.ok(credential.issuanceDate);
  assert.ok(credential.expiryDate);
  assert.ok(credential.createdAt);
});

test('Issuer Service - Revocation Adds Reason to Credential', () => {
  const issuer = new IssuerService();
  
  const issued = issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  issuer.revokeCredential(issued.credentialId, 'Degree revoked due to misconduct');
  
  const credential = issuer.credentials.get(issued.credentialId);
  assert.strictEqual(credential.revocationReason, 'Degree revoked due to misconduct');
});

test('Issuer Service - Empty List Returns Empty Array', () => {
  const issuer = new IssuerService();
  const result = issuer.listCredentials();
  
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.credentials.length, 0);
  assert.strictEqual(result.total, 0);
});

test('Issuer Service - Non-Existent Filter Returns Empty', () => {
  const issuer = new IssuerService();
  
  issuer.issue({
    studentId: 'STU-001',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'University',
    courses: [{ courseCode: 'CS101', courseName: 'Intro to CS', credits: 3 }]
  });

  const result = issuer.listCredentials({ studentId: 'NONEXISTENT' });
  assert.strictEqual(result.credentials.length, 0);
});
