/**
 * Tests for mDoc Credential Generation Engine
 * Coverage: Schema validation, signature, CBOR encoding, QR generation
 */

import assert from 'assert';
import { test } from 'node:test';
import { CredentialGenerator, GENERATOR_CONFIG, generateCredential } from '../src/index.js';
import { generateKeyPairSync } from 'crypto';
import { exportSPKI, exportPKCS8 } from 'jose';

/**
 * Test Helpers
 */
let testPrivateKeyPem = null;
let testPublicKeyPem = null;

async function setupTestKeys() {
  try {
    // Generate ED25519 key pair for testing
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    
    testPublicKeyPem = publicKey.export({ format: 'pem', type: 'spki' });
    testPrivateKeyPem = privateKey.export({ format: 'pem', type: 'pkcs8' });
  } catch (error) {
    console.error('Failed to setup test keys:', error.message);
  }
}

/**
 * Valid test credential
 */
function getValidCredential() {
  return {
    studentId: 'ALICE-2024-001',
    name: {
      givenName: 'Alice',
      familyName: 'Smith',
      middleNames: ['Marie']
    },
    dateOfBirth: '2000-01-15',
    institution: {
      name: 'Smart College',
      code: 'SC-001',
      country: 'USA'
    },
    degreeLevel: 'bachelor',
    fieldOfStudy: 'Computer Science',
    gpa: 3.95,
    courses: [
      {
        name: 'Introduction to Computer Science',
        code: 'CS-101',
        grade: 'A',
        credits: 3,
        completionDate: '2021-05-15'
      },
      {
        name: 'Data Structures',
        code: 'CS-201',
        grade: 'A+',
        credits: 4,
        completionDate: '2021-12-15'
      },
      {
        name: 'Algorithms',
        code: 'CS-301',
        grade: 'A',
        credits: 4,
        completionDate: '2022-05-15'
      },
      {
        name: 'Software Engineering',
        code: 'CS-401',
        grade: 'A',
        credits: 3,
        completionDate: '2022-12-15'
      }
    ],
    achievements: [
      'Dean\'s List (2021-2022)',
      'Scholarship Recipient',
      'Class Valedictorian'
    ],
    issuerId: 'SC-ISSUER-001'
  };
}

// Setup test keys before running tests
await setupTestKeys();

test('Generator - Create Generator Instance', () => {
  const generator = new CredentialGenerator();
  
  assert(generator, 'Generator should be created');
  assert.strictEqual(generator.namespace, GENERATOR_CONFIG.NAMESPACE);
  assert(generator.credentialSchema, 'Schema should be defined');
});

test('Generator - Validate Valid Credential', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, true, 'Valid credential should pass validation');
  assert.strictEqual(result.errors.length, 0, 'Should have no errors');
});

test('Generator - Validate Missing StudentId', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  delete credential.studentId;
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Missing studentId should fail');
  assert(result.errors.length > 0, 'Should have errors');
});

test('Generator - Validate Missing Courses', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.courses = [];
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Empty courses should fail');
});

test('Generator - Validate Invalid GPA', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.gpa = 5.0;
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'GPA > 4.0 should fail');
});

test('Generator - Validate Invalid Date Range', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.issueDate = '2024-12-31T00:00:00Z';
  credential.expiryDate = '2024-01-01T00:00:00Z';
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Invalid date range should fail');
});

test('Generator - Validate Invalid Credits', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.courses[0].credits = 1000;
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Credits > 999 should fail');
});

test('Generator - Validate StudentId Pattern', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.studentId = 'ALICE@2024#001'; // Invalid characters
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Invalid studentId pattern should fail');
});

test('Generator - Validate Max Courses', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  // Create 101 courses (exceeds max of 100)
  credential.courses = Array.from({ length: 101 }, (_, i) => ({
    name: `Course ${i}`,
    code: `COURSE-${i}`,
    grade: 'A',
    credits: 3
  }));
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'More than 100 courses should fail');
});

test('Generator - Validate Additional Properties Rejected', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.unknownField = 'should be rejected';
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Additional properties should fail');
});

test('Generator - Encode Credential to CBOR', async () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  const signature = {
    signature: 'test-signature-value',
    algorithm: GENERATOR_CONFIG.SIGNATURE_ALGORITHM
  };
  
  const encoded = generator.encodeCredential(credential, signature);
  
  assert(encoded.cbor instanceof Buffer, 'CBOR should be Buffer');
  assert(encoded.hex, 'Hex encoding should be present');
  assert(encoded.base64, 'Base64 encoding should be present');
  assert(encoded.size > 0, 'Size should be tracked');
});

test('Generator - Generate Credential QR Code', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping QR generation test (keys not available)');
    return;
  }
  
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  const signature = {
    signature: 'test-signature-value',
    algorithm: GENERATOR_CONFIG.SIGNATURE_ALGORITHM
  };
  
  const cborData = generator.encodeCredential(credential, signature);
  const qr = await generator.generateCredentialQR(credential, cborData);
  
  assert.strictEqual(qr.type, 'mdoc-credential');
  assert(qr.qrCode, 'QR code DataURL should exist');
  assert(qr.qrAscii, 'ASCII QR should exist');
  assert(qr.data, 'QR data should exist');
  assert(qr.dataSize > 0, 'Data size should be tracked');
});

test('Generator - Get Generator Metadata', () => {
  const generator = new CredentialGenerator();
  const metadata = generator.getMetadata();
  
  assert.strictEqual(metadata.namespace, GENERATOR_CONFIG.NAMESPACE);
  assert.strictEqual(metadata.version, GENERATOR_CONFIG.VERSION);
  assert.strictEqual(metadata.signatureAlgorithm, GENERATOR_CONFIG.SIGNATURE_ALGORITHM);
  assert(metadata.supportedCurves.includes(GENERATOR_CONFIG.SIGNATURE_CURVE));
});

test('Generator - Full Credential Generation', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping full generation test (keys not available)');
    return;
  }
  
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  const generated = await generator.generateCredential(
    credential,
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  assert(generated.credentialId, 'Credential ID should be generated');
  assert.strictEqual(generated.status, 'issued');
  assert.strictEqual(generated.studentId, credential.studentId);
  assert.strictEqual(generated.studentName, 'Alice Smith');
  assert(generated.signature, 'Signature should exist');
  assert(generated.cbor, 'CBOR encoding should exist');
  assert(generated.qrCode, 'QR code should exist');
  assert(generated.metadata.validated, 'Should be marked as validated');
  assert(generated.metadata.signed, 'Should be marked as signed');
  assert(generated.metadata.encoded, 'Should be marked as encoded');
});

test('Generator - Generated Credential Has Correct Dates', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping date validation test (keys not available)');
    return;
  }
  
  const generator = new CredentialGenerator({ credentialExpiry: 5 });
  const credential = getValidCredential();
  
  const generated = await generator.generateCredential(
    credential,
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  const issuedDate = new Date(generated.issuedAt);
  const expiryDate = new Date(generated.expiresAt);
  
  assert(issuedDate < expiryDate, 'Issue date should be before expiry');
  
  const daysDiff = Math.floor((expiryDate - issuedDate) / (1000 * 60 * 60 * 24));
  assert.strictEqual(daysDiff, 5, 'Expiry should be 5 days after issue');
});

test('Generator - Credential ID is Unique', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping uniqueness test (keys not available)');
    return;
  }
  
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  const gen1 = await generator.generateCredential(
    credential,
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  const gen2 = await generator.generateCredential(
    credential,
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  assert.notStrictEqual(gen1.credentialId, gen2.credentialId, 'Credential IDs should be unique');
});

test('Generator - CBOR Size is Tracked', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  
  const signature = {
    signature: 'test-signature-value',
    algorithm: GENERATOR_CONFIG.SIGNATURE_ALGORITHM
  };
  
  const encoded = generator.encodeCredential(credential, signature);
  
  assert(encoded.size > 100, 'CBOR should have meaningful size');
  assert(encoded.base64.length > 0, 'Base64 should not be empty');
  assert(encoded.hex.length > 0, 'Hex should not be empty');
});

test('Generator - Batch Generation Success', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping batch generation test (keys not available)');
    return;
  }
  
  const generator = new CredentialGenerator();
  const credentials = [
    getValidCredential(),
    getValidCredential(),
    getValidCredential()
  ];
  
  // Make each credential unique
  credentials[1].studentId = 'BOB-2024-001';
  credentials[1].name.givenName = 'Bob';
  credentials[2].studentId = 'CHARLIE-2024-001';
  credentials[2].name.givenName = 'Charlie';
  
  const batch = await generator.generateBatch(
    credentials,
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  assert.strictEqual(batch.total, 3, 'Should process 3 credentials');
  assert.strictEqual(batch.generated, 3, 'All should be generated');
  assert.strictEqual(batch.failed, 0, 'None should fail');
  assert.strictEqual(batch.results.length, 3, 'Should have 3 results');
});

test('Generator - Batch Generation With Errors', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping batch error handling test (keys not available)');
    return;
  }
  
  const generator = new CredentialGenerator();
  const validCred = getValidCredential();
  const invalidCred = getValidCredential();
  invalidCred.studentId = 'INVALID@#'; // Invalid pattern
  
  const batch = await generator.generateBatch(
    [validCred, invalidCred],
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  assert.strictEqual(batch.total, 2);
  assert.strictEqual(batch.generated, 1, 'One should succeed');
  assert.strictEqual(batch.failed, 1, 'One should fail');
  assert(batch.errors.length > 0, 'Should have error details');
});

test('Generator - Credential Config Constants', () => {
  assert.strictEqual(GENERATOR_CONFIG.NAMESPACE, 'org.smartcollege.academic');
  assert.strictEqual(GENERATOR_CONFIG.VERSION, '1');
  assert.strictEqual(GENERATOR_CONFIG.SIGNATURE_ALGORITHM, 'EdDSA');
  assert.strictEqual(GENERATOR_CONFIG.SIGNATURE_CURVE, 'Ed25519');
  assert.strictEqual(GENERATOR_CONFIG.CREDENTIAL_EXPIRY_DAYS, 1825); // 5 years
  assert(GENERATOR_CONFIG.QR_ERROR_CORRECTION === 'H');
  assert(GENERATOR_CONFIG.QR_SIZE > 0);
});

test('Generator - Utility Function generateCredential', async () => {
  if (!testPrivateKeyPem) {
    console.log('⊘ Skipping utility function test (keys not available)');
    return;
  }
  
  const credential = getValidCredential();
  
  const generated = await generateCredential(
    credential,
    'SC-ISSUER-001',
    testPrivateKeyPem
  );
  
  assert(generated.credentialId, 'Should generate credential');
  assert.strictEqual(generated.status, 'issued');
});

test('Generator - Validate Long Institution Name', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.institution.name = 'A'.repeat(201); // Exceeds maxLength of 200
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Long institution name should fail');
});

test('Generator - Validate Enum DegreeLevel', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.degreeLevel = 'invalid-degree';
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, false, 'Invalid degree level should fail');
});

test('Generator - Validate All Valid DegreeLevels', () => {
  const generator = new CredentialGenerator();
  const degrees = ['high-school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'];
  
  for (const degree of degrees) {
    const credential = getValidCredential();
    credential.degreeLevel = degree;
    
    const result = generator.validateCredential(credential);
    assert.strictEqual(result.valid, true, `${degree} should be valid`);
  }
});

test('Generator - Validate Name Variations', () => {
  const generator = new CredentialGenerator();
  const credential = getValidCredential();
  credential.name.middleNames = ['Marie', 'Anne'];
  
  const result = generator.validateCredential(credential);
  
  assert.strictEqual(result.valid, true, 'Multiple middle names should be valid');
});

test('Generator - Custom Credential Expiry', () => {
  const generator = new CredentialGenerator({ credentialExpiry: 10 });
  
  const metadata = generator.getMetadata();
  assert.strictEqual(metadata.credentialExpiryDays, 10, 'Should reflect custom expiry');
});
