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
const { generateAcademicRecord, kindOfCredentialData, academicNamespacesOf } = await import(
  '../src/credential-generator.js'
);
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
  assert.strictEqual(
    records[0].docType,
    'org.iso.23220.photoid.1',
    'both kinds are issued as photo-ID documents',
  );
  assert.strictEqual(records[0].academicNamespace, 'org.iso.23220.education.transcript.1');
  assert.ok(records[0].credentialData.education_transcript, 'expected transcript data');
  assert.strictEqual(
    records[0].credentialData.education_qualification,
    undefined,
    'a transcript credential must not carry qualification data',
  );
  assert.ok(records[0].credentialData.full_name, 'the personal components travel with it');
});

test('Credential kinds - both means two credentials, one per kind', () => {
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T2',
    include: 'both',
  });
  assert.deepStrictEqual(records.map((record) => record.kind), ['qualification', 'transcript']);
  assert.deepStrictEqual(
    records.map((record) => record.docType),
    ['org.iso.23220.photoid.1', 'org.iso.23220.photoid.1'],
    'the docType does not tell the kinds apart',
  );
  assert.deepStrictEqual(records.map((record) => record.academicNamespace), [
    'org.iso.23220.education.qualification.1',
    'org.iso.23220.education.transcript.1',
  ]);
});

test('Credential kinds - qualification is the default, even for an unknown choice', () => {
  for (const include of [undefined, '', 'nonsense']) {
    const { records } = generateAcademicRecord({
      institution: 'Smart Academy',
      studentId: 'SA-T3',
      include,
    });
    assert.strictEqual(records.length, 1, `include=${include}`);
    assert.strictEqual(records[0].kind, 'qualification');
    assert.strictEqual(records[0].docType, 'org.iso.23220.photoid.1');
    assert.ok(records[0].credentialData.education_qualification);
    assert.strictEqual(records[0].credentialData.education_transcript, undefined);
  }
});

test('Credential kinds - the kind comes from the academic namespace, not the docType', () => {
  assert.strictEqual(kindOfCredentialData({ docType: 'org.iso.23220.photoid.1' }), 'credential');
  assert.strictEqual(kindOfCredentialData({ education_qualification: {} }), 'qualification');
  assert.strictEqual(kindOfCredentialData({ education_transcript: {} }), 'transcript');
  assert.strictEqual(
    kindOfCredentialData({ education_qualification: {}, education_transcript: {} }),
    'academic',
    'a credential holding both is the combined academic credential issued before the choice existed',
  );
  assert.deepStrictEqual(academicNamespacesOf({ education_transcript: {} }), [
    'org.iso.23220.education.transcript.1',
  ]);
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
  assert.strictEqual(verified.docType, 'org.iso.23220.photoid.1');
  assert.deepStrictEqual(Object.keys(verified.namespaces).sort(), [
    'org.iso.23220.education.academic-record.1',
    'org.iso.23220.education.transcript.1',
    'org.iso.23220.photoid.1',
  ]);
  assert.ok(
    !Object.keys(verified.namespaces).includes('org.iso.23220.education.qualification.1'),
    'a transcript credential must not carry the award namespace',
  );
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
  assert.ok(
    !Object.keys(verified.namespaces).includes('org.iso.23220.education.academic-record.1'),
    'the US-practice supplement belongs to the transcript, not to the award',
  );
});

test('Credential kinds - issuing a transcript records its kind', () => {
  const issuer = new IssuerService();
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-T6',
    include: 'transcript',
  });
  const result = issuer.issue(records[0].credentialData);
  assert.strictEqual(result.success, true, result.error);
  assert.strictEqual(result.docType, 'org.iso.23220.photoid.1');

  const stored = issuer.getCredential(result.credentialId);
  assert.strictEqual(stored.credential.kind, 'transcript');
  assert.strictEqual(stored.credential.education_qualification, undefined);
  assert.ok(stored.credential.education_transcript, 'the grades are on the credential');
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

// ── Academy requests: one credential per kind, however often it is asked for ──
//
// The student chooses what to hold, and asking twice must not mint a second copy.
// The academic namespace is what identifies a kind, since both kinds share the
// photo-ID docType - so that, not the docType, is what the lookup matches on.

const sessionsFor = (studentId) =>
  getDb().prepare('SELECT * FROM issuance_sessions WHERE student_id = ?').all(studentId);

const dropSessionsFor = (studentId) =>
  getDb().prepare('DELETE FROM issuance_sessions WHERE student_id = ?').run(studentId);

const academySession = (issuer, studentId, record) =>
  issuer.createIssuanceSession({
    studentId,
    institution: 'Smart Academy',
    credentialData: record.credentialData,
    display: record.display,
  });

test('Academy request - a repeat request reuses the credential already prepared', () => {
  const issuer = new IssuerService();
  const studentId = 'SA-DEDUPE-1';
  dropSessionsFor(studentId);
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId,
    include: 'both',
  });
  const prepared = records.map((record) => academySession(issuer, studentId, record));
  assert.strictEqual(sessionsFor(studentId).length, 2);

  const found = records.map((record) =>
    issuer.findIssuanceSessionFor({
      studentId,
      institution: 'Smart Academy',
      academicNamespace: record.academicNamespace,
    }),
  );

  assert.deepStrictEqual(
    found.map((session) => session.sessionId),
    prepared.map((session) => session.sessionId),
    'the same sessions come back, in the order they were requested',
  );
  assert.strictEqual(sessionsFor(studentId).length, 2, 'and nothing duplicate was created');
  dropSessionsFor(studentId);
});

test('Academy request - the namespace decides which credential is reused', () => {
  const issuer = new IssuerService();
  const studentId = 'SA-DEDUPE-2';
  dropSessionsFor(studentId);
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId,
    include: 'transcript',
  });
  const transcript = academySession(issuer, studentId, records[0]);

  assert.strictEqual(
    issuer.findIssuanceSessionFor({
      studentId,
      institution: 'Smart Academy',
      academicNamespace: 'org.iso.23220.education.transcript.1',
    }).sessionId,
    transcript.sessionId,
  );
  assert.strictEqual(
    issuer.findIssuanceSessionFor({
      studentId,
      institution: 'Smart Academy',
      academicNamespace: 'org.iso.23220.education.qualification.1',
    }),
    undefined,
    'a kind the student does not hold is not answered with the kind they do',
  );
  assert.strictEqual(
    issuer.findIssuanceSessionFor({
      studentId: 'SA-SOMEONE-ELSE',
      institution: 'Smart Academy',
      academicNamespace: 'org.iso.23220.education.transcript.1',
    }),
    undefined,
    'another student is never answered with this one',
  );
  dropSessionsFor(studentId);
});

test('Academy request - a credential already in the wallet is reported, not re-issued', () => {
  const issuer = new IssuerService();
  const studentId = 'SA-DEDUPE-3';
  dropSessionsFor(studentId);
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId,
    include: 'qualification',
  });
  const session = academySession(issuer, studentId, records[0]);
  session.status = 'issued';
  issuer._persistIssuanceSession(session);

  const found = issuer.findIssuanceSessionFor({
    studentId,
    institution: 'Smart Academy',
    academicNamespace: 'org.iso.23220.education.qualification.1',
  });
  assert.strictEqual(found.sessionId, session.sessionId);
  assert.strictEqual(found.status, 'issued');
  assert.strictEqual(sessionsFor(studentId).length, 1, 'self-service re-issue is not offered');
  dropSessionsFor(studentId);
});

test('Academy request - linking a session attaches the account and keeps the credential', () => {
  const issuer = new IssuerService();
  const studentId = 'SA-DEDUPE-4';
  dropSessionsFor(studentId);
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId,
    include: 'transcript',
  });
  const session = academySession(issuer, studentId, records[0]);
  assert.strictEqual(session.email, null, 'created before the holder signed in');

  issuer.linkIssuanceSession(session.sessionId, { email: ' Student@Example.edu ', sub: 'sub-9' });

  // Read back through a fresh service, so this asserts what was persisted.
  const reloaded = new IssuerService().getIssuanceSession(session.sessionId);
  assert.strictEqual(reloaded.email, 'student@example.edu', 'normalised and persisted');
  assert.strictEqual(reloaded.sub, 'sub-9');
  assert.strictEqual(reloaded.sessionId, session.sessionId, 'the offer link still resolves');
  assert.ok(reloaded.credentialData.education_transcript, 'the claims are untouched');
  dropSessionsFor(studentId);
});

// ── What the management portal is told about a credential ──
//
// The portal must state each credential's kind without guessing. Both kinds share the
// photo-ID docType, so the kind is derived from the academic namespace the credential
// holds and travels with the list, the audit trail and the organisation's counts.

const issueKind = (issuer, studentId, kind, institution = 'Smart Academy') => {
  const { records } = generateAcademicRecord({ institution, studentId, include: kind });
  const session = issuer.createIssuanceSession({
    studentId,
    institution,
    credentialData: records[0].credentialData,
    display: records[0].display,
  });
  const result = issuer.issueForSession(session, null);
  assert.strictEqual(result.success, true, result.error || '');
  return result.credentialId;
};

test('Portal - each listed credential states the kind its namespace implies', () => {
  const issuer = new IssuerService();
  const qualificationId = issueKind(issuer, 'SA-PORTAL-1', 'qualification');
  const transcriptId = issueKind(issuer, 'SA-PORTAL-2', 'transcript');

  const { credentials } = issuer.listCredentials({ institution: 'Smart Academy' });
  const qualification = credentials.find((c) => c.credentialId === qualificationId);
  const transcript = credentials.find((c) => c.credentialId === transcriptId);

  assert.strictEqual(qualification.kind, 'qualification');
  assert.strictEqual(qualification.kindLabel, 'Qualification');
  assert.deepStrictEqual(qualification.academicNamespaces, [
    'org.iso.23220.education.qualification.1',
  ]);
  assert.strictEqual(transcript.kind, 'transcript');
  assert.strictEqual(transcript.kindLabel, 'Academic transcript');
  assert.deepStrictEqual(transcript.academicNamespaces, [
    'org.iso.23220.education.transcript.1',
  ]);
  assert.strictEqual(
    qualification.docType,
    transcript.docType,
    'the docType cannot tell them apart, which is why the kind is derived from the namespace',
  );
  dropSessionsFor('SA-PORTAL-1');
  dropSessionsFor('SA-PORTAL-2');
});

test('Portal - a credential holding no academic namespace is not given a kind', () => {
  const issuer = new IssuerService();
  // A legacy row, loaded from the store in a shape this issuer no longer issues.
  issuer.credentials.set('legacy-1', {
    credentialId: 'legacy-1',
    docType: 'org.example.legacy.1',
    credentialType: 'Legacy',
    institution: 'Smart Academy',
    status: 'active',
  });

  const { credentials } = issuer.listCredentials({ institution: 'Smart Academy' });
  const legacy = credentials.find((c) => c.credentialId === 'legacy-1');
  assert.strictEqual(legacy.kind, 'credential', 'no namespace, so no kind to claim');
  assert.deepStrictEqual(legacy.academicNamespaces, []);
  assert.strictEqual(
    legacy.docType,
    'org.example.legacy.1',
    'the portal shows this raw docType rather than a label it would be guessing at',
  );
});

test('Portal - the organisation overview is split by kind', () => {
  const issuer = new IssuerService();
  const qualificationId = issueKind(issuer, 'SA-STATS-1', 'qualification');
  const transcriptId = issueKind(issuer, 'SA-STATS-2', 'transcript');
  issueKind(issuer, 'SA-STATS-3', 'transcript', 'Another Academy');

  const mine = issuer.getStatistics('Smart Academy');
  assert.deepStrictEqual(mine.byKind, { qualification: 1, transcript: 1 });
  assert.deepStrictEqual(mine.byKindActive, { qualification: 1, transcript: 1 });
  assert.strictEqual(mine.totalIssued, 2, 'another organisation is not counted here');

  issuer.revokeCredential(transcriptId, 'withdrawn by the registry');

  const afterRevoke = issuer.getStatistics('Smart Academy');
  assert.deepStrictEqual(afterRevoke.byKind, { qualification: 1, transcript: 1 });
  assert.deepStrictEqual(
    afterRevoke.byKindActive,
    { qualification: 1 },
    'a revoked transcript is no longer active, so it drops out of the active split',
  );
  assert.strictEqual(afterRevoke.totalRevoked, 1);
  assert.ok(issuer.getCredential(qualificationId).success);
  dropSessionsFor('SA-STATS-1');
  dropSessionsFor('SA-STATS-2');
  dropSessionsFor('SA-STATS-3');
});

test('Portal - the audit trail records the kind with the event', () => {
  const issuer = new IssuerService();
  const transcriptId = issueKind(issuer, 'SA-AUDIT-1', 'transcript');
  issuer.revokeCredential(transcriptId, 'withdrawn by the registry');

  const { auditLog } = issuer.getAuditLog({ institution: 'Smart Academy' });
  const issued = auditLog.find((entry) => entry.action === 'credential_issued');
  const revokedEntry = auditLog.find((entry) => entry.action === 'credential_revoked');

  assert.strictEqual(issued.kind, 'transcript');
  assert.strictEqual(issued.kindLabel, 'Academic transcript');
  assert.strictEqual(revokedEntry.kind, 'transcript');
  assert.strictEqual(
    revokedEntry.kindLabel,
    'Academic transcript',
    'a revocation is readable without looking the credential up',
  );
  dropSessionsFor('SA-AUDIT-1');
});

// ── The transcript's claim set (P0-21, US conventions) ────────────────────
//
// Every value states its own scheme rather than leaving the reader to assume one - the
// grading scale, the credit unit and the programme's classification each travel with the
// value they describe - and the aggregates are elements in their own right, because the
// course list is one element and therefore all or nothing.

const elementsOf = (verified, namespace) =>
  Object.fromEntries(
    (verified.namespaces[namespace] || []).map((item) => [
      item.elementIdentifier,
      // A date element decodes as the tagged object it is, so read the date it carries.
      item.elementValue && item.elementValue.type === 'date'
        ? item.elementValue.value
        : item.elementValue,
    ]),
  );

const TRANSCRIPT_NS = 'org.iso.23220.education.transcript.1';
const ACADEMIC_RECORD_NS = 'org.iso.23220.education.academic-record.1';

function transcriptMdoc(issuer, studentId) {
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId,
    include: 'transcript',
  });
  const mdoc = issuer.buildCredentialMdoc(records[0].credentialData);
  assert.ok(mdoc, 'expected a signed mdoc');
  const verified = verifyIssuerSigned(mdoc.base64url);
  assert.strictEqual(verified.valid, true, verified.error || 'the mdoc must verify');
  return {
    record: records[0],
    verified,
    core: elementsOf(verified, TRANSCRIPT_NS),
    supplement: elementsOf(verified, ACADEMIC_RECORD_NS),
    photoId: elementsOf(verified, 'org.iso.23220.photoid.1'),
  };
}

test('Transcript - every mark states the scale it is on', () => {
  const { core } = transcriptMdoc(new IssuerService(), 'SA-US-1');

  assert.strictEqual(core.grading_scale_id, 'us-gpa-4');
  assert.strictEqual(core.grading_scale_minimum, 0);
  assert.strictEqual(core.grading_scale_maximum, 4);
  assert.strictEqual(core.grading_scale_pass_mark, 2);
  assert.ok(String(core.grading_scale_label).includes('4.00'), core.grading_scale_label);

  const courses = JSON.parse(core.courses);
  assert.ok(courses.length >= 5, 'expected the course list');
  for (const course of courses) {
    assert.match(course.grade, /^[A-D][+-]?$/, `a letter mark, got ${course.grade}`);
    assert.ok(course.gradePoints >= 0 && course.gradePoints <= 4, String(course.gradePoints));
    assert.strictEqual(
      course.markScaleId,
      'us-gpa-4',
      'a mark never travels without the scale it was awarded on',
    );
    assert.ok(['passed', 'failed'].includes(course.outcome), course.outcome);
    assert.ok(course.term, 'each result carries its academic term');
    assert.match(course.termStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(course.termEnd, /^\d{4}-\d{2}-\d{2}$/);
  }

  // The terms run forwards and the study does not outlast its own graduation: a record whose
  // semesters are out of order, or which ends after the award, is not a record anyone accepts.
  const starts = courses.map((course) => course.termStart);
  assert.deepStrictEqual(starts, [...starts].sort(), 'the terms are in chronological order');
  for (const course of courses) {
    assert.ok(course.termEnd <= core.enrolment_end, `${course.term} ends within the enrolment`);
    assert.ok(course.termStart >= core.enrolment_start, `${course.term} begins after it did`);
  }
});

test('Transcript - the aggregates are separately disclosable elements', () => {
  const { core, supplement } = transcriptMdoc(new IssuerService(), 'SA-US-2');

  // Their own elements, so a holder can disclose a summary without the course list.
  for (const identifier of [
    'total_credits',
    'credits_attempted',
    'credits_earned',
    'overall_mark',
    'overall_mark_scale_id',
    'outcome',
    'outcome_scheme',
  ]) {
    assert.ok(identifier in core, `${identifier} must be an element of its own`);
  }
  assert.strictEqual(core.total_credits, core.credits_earned);
  assert.strictEqual(core.overall_mark_scale_id, 'us-gpa-4');
  assert.strictEqual(core.outcome, 'completed');
  assert.strictEqual(core.status, 'completed', 'the pre-vocabulary field stays readable');

  const courses = JSON.parse(core.courses);
  const attempted = courses.reduce((sum, course) => sum + course.credits, 0);
  assert.strictEqual(core.credits_attempted, attempted, 'the total matches the course list');
  assert.strictEqual(
    supplement.credit_hours_attempted,
    attempted,
    'and both namespaces agree on what was attempted',
  );
});

test('Transcript - the arithmetic in the credential is consistent', () => {
  const { core, supplement } = transcriptMdoc(new IssuerService(), 'SA-US-3');
  const courses = JSON.parse(core.courses);

  const qualityPoints =
    Math.round(courses.reduce((sum, course) => sum + course.gradePoints * course.credits, 0) * 100) / 100;
  assert.strictEqual(supplement.quality_points, qualityPoints);
  assert.strictEqual(
    supplement.average_cumulative,
    Math.round((qualityPoints / supplement.credit_hours_for_average) * 100) / 100,
    'the average is the quality points over the credits counted towards it',
  );
  assert.strictEqual(supplement.average_range_minimum, 0);
  assert.strictEqual(supplement.average_range_maximum, 4);
  assert.strictEqual(
    supplement.average_weighting,
    'credit-weighted',
    'how the average was computed is stated, not assumed',
  );
  assert.strictEqual(core.overall_mark, supplement.average_cumulative);
});

test('Transcript - the programme context names its frameworks', () => {
  const { core } = transcriptMdoc(new IssuerService(), 'SA-US-4');

  assert.match(core.programme_code, /^\d{2}\.\d{4}$/, 'a CIP code');
  assert.strictEqual(core.programme_code_scheme, 'CIP-2020');
  assert.strictEqual(core.programme_level_framework, 'IPEDS-award-level');
  assert.match(core.programme_level, /degree$/, core.programme_level);
  assert.ok(core.programme_title && core.award_title, 'the programme and its award are named');
  assert.strictEqual(core.programme_type, 'degree');
  assert.strictEqual(core.credit_scheme, 'us-credit-hour');
  assert.strictEqual(core.institution_name, 'Smart Academy');
  assert.match(core.enrolment_start, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(core.enrolment_end, /^\d{4}-\d{2}-\d{2}$/);
});

test('Transcript - the record states its own standing and identity', () => {
  const { supplement, photoId, core } = transcriptMdoc(new IssuerService(), 'SA-US-5');

  assert.strictEqual(supplement.document_type, 'academic-record');
  assert.strictEqual(supplement.document_status, 'official');
  assert.strictEqual(supplement.document_completeness, 'partial');
  assert.match(supplement.document_id, /^AR-\d{6}$/);
  assert.notStrictEqual(
    supplement.document_id,
    photoId.document_number,
    'the record is a different artefact from the identity document, so it carries its own number',
  );
  assert.match(core.enrolment_end, /^\d{4}-\d{2}-\d{2}$/);
});

test('Transcript - the US supplement is not a kind discriminator', () => {
  const { record, core } = transcriptMdoc(new IssuerService(), 'SA-US-6');

  assert.strictEqual(
    kindOfCredentialData(record.credentialData),
    'transcript',
    'the transcript namespace still decides the kind',
  );
  assert.deepStrictEqual(academicNamespacesOf(record.credentialData), [TRANSCRIPT_NS]);
  assert.ok(core.student_id, 'the holder is still identified');
});

test('Qualification - its average is no longer on an unstated scale', () => {
  const issuer = new IssuerService();
  const { records } = generateAcademicRecord({
    institution: 'Smart Academy',
    studentId: 'SA-US-7',
    include: 'qualification',
  });
  const mdoc = issuer.buildCredentialMdoc(records[0].credentialData);
  const verified = verifyIssuerSigned(mdoc.base64url);
  const qualification = elementsOf(verified, 'org.iso.23220.education.qualification.1');

  assert.ok(qualification.gpa > 0 && qualification.gpa <= 4, String(qualification.gpa));
  assert.strictEqual(
    qualification.gpa_scale_id,
    'us-gpa-4',
    'the number states the scale it is on instead of being read as a mark out of ten',
  );
  assert.strictEqual(qualification.gpa_scale_maximum, 4);
});
