/**
 * Tests for mDoc Academic Credential Schema
 * Coverage: Schema validation, business rules, edge cases
 */

import assert from 'assert';
import { test } from 'node:test';
import { SchemaValidator, ACADEMIC_CREDENTIAL_SCHEMA } from '../src/index.js';

const validator = new SchemaValidator();

// Sample valid credential for testing
const validCredential = {
  studentId: 'STU-2024-001234',
  name: {
    givenName: 'Alice',
    familyName: 'Smith',
    middleNames: ['Grace']
  },
  dateOfBirth: '2000-01-15',
  institution: {
    name: 'Smart College',
    code: 'SC-001',
    country: 'US'
  },
  degreeLevel: 'bachelor',
  fieldOfStudy: 'Computer Science',
  courses: [
    {
      name: 'Introduction to Programming',
      code: 'CS-101',
      grade: 'A',
      credits: 3,
      completionDate: '2023-05-15'
    },
    {
      name: 'Data Structures',
      code: 'CS-201',
      grade: 'A+',
      credits: 4,
      completionDate: '2023-12-20'
    }
  ],
  gpa: 3.9,
  achievements: [
    {
      title: 'Dean\'s List',
      date: '2023-06-01'
    }
  ],
  issueDate: '2024-01-10T10:00:00Z',
  expiryDate: '2029-01-10T10:00:00Z',
  issuerId: 'SC-ISSUER-001'
};

test('Schema - Valid credential passes validation', () => {
  const result = validator.validateCredential(validCredential);
  assert.strictEqual(result.valid, true, 'Valid credential should pass');
  assert.strictEqual(result.errors.length, 0, 'No errors expected');
});

test('Schema - Missing required field (studentId)', () => {
  const credential = { ...validCredential };
  delete credential.studentId;
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Should fail without studentId');
  assert(result.errors.length > 0, 'Should have validation errors');
});

test('Schema - Missing required field (courses)', () => {
  const credential = { ...validCredential };
  delete credential.courses;
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Should fail without courses');
});

test('Schema - Empty courses array fails', () => {
  const credential = { ...validCredential, courses: [] };
  const result = validator.validateCompletely(credential);
  assert.strictEqual(result.valid, false, 'Empty courses should fail');
});

test('Schema - Invalid GPA (too high)', () => {
  const credential = { ...validCredential, gpa: 5.0 };
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'GPA > 4.0 should fail');
});

test('Schema - Invalid GPA (negative)', () => {
  const credential = { ...validCredential, gpa: -1.0 };
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Negative GPA should fail');
});

test('Schema - Valid GPA values (0, 2.5, 4.0)', () => {
  [0, 2.5, 4.0].forEach(gpa => {
    const credential = { ...validCredential, gpa };
    const result = validator.validateCredential(credential);
    assert.strictEqual(result.valid, true, `GPA ${gpa} should be valid`);
  });
});

test('Schema - Issue date after expiry date fails', () => {
  const credential = {
    ...validCredential,
    issueDate: '2025-01-10T10:00:00Z',
    expiryDate: '2024-01-10T10:00:00Z'
  };
  
  const result = validator.validateCompletely(credential);
  assert.strictEqual(result.valid, false, 'Issue date after expiry should fail');
});

test('Schema - Valid date range (issue < expiry)', () => {
  const credential = {
    ...validCredential,
    issueDate: '2024-01-01T00:00:00Z',
    expiryDate: '2029-12-31T23:59:59Z'
  };
  
  const result = validator.validateCompletely(credential);
  assert.strictEqual(result.valid, true, 'Valid date range should pass');
});

test('Schema - Student name with special characters', () => {
  const credential = {
    ...validCredential,
    name: {
      givenName: 'José',
      familyName: 'O\'Brien'
    }
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, true, 'Special characters in names should be allowed');
});

test('Schema - Course with missing grade fails', () => {
  const credential = {
    ...validCredential,
    courses: [
      {
        name: 'Course Name',
        code: 'CS-101',
        // missing grade
        credits: 3
      }
    ]
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Course without grade should fail');
});

test('Schema - Course with zero credits', () => {
  const credential = {
    ...validCredential,
    courses: [
      {
        name: 'Course Name',
        code: 'CS-101',
        grade: 'A',
        credits: 0
      }
    ]
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, true, 'Zero credits should be valid');
});

test('Schema - Course with negative credits fails', () => {
  const credential = {
    ...validCredential,
    courses: [
      {
        name: 'Course Name',
        code: 'CS-101',
        grade: 'A',
        credits: -1
      }
    ]
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Negative credits should fail');
});

test('Schema - Course with very high credits fails', () => {
  const credential = {
    ...validCredential,
    courses: [
      {
        name: 'Course Name',
        code: 'CS-101',
        grade: 'A',
        credits: 1000
      }
    ]
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Credits > 999 should fail');
});

test('Schema - Multiple courses', () => {
  const courses = [];
  for (let i = 0; i < 5; i++) {
    courses.push({
      name: `Course ${i + 1}`,
      code: `CS-${100 + i}`,
      grade: ['A', 'A+', 'B', 'B+', 'A'][i],
      credits: 3 + i
    });
  }
  
  const credential = { ...validCredential, courses };
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, true, '5 courses should be valid');
});

test('Schema - Max courses limit (100)', () => {
  const courses = [];
  for (let i = 0; i < 100; i++) {
    courses.push({
      name: `Course ${i + 1}`,
      code: `CS-${100 + i}`,
      grade: 'A',
      credits: 3
    });
  }
  
  const credential = { ...validCredential, courses };
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, true, '100 courses should be valid');
});

test('Schema - Exceeds max courses limit (101)', () => {
  const courses = [];
  for (let i = 0; i < 101; i++) {
    courses.push({
      name: `Course ${i + 1}`,
      code: `CS-${100 + i}`,
      grade: 'A',
      credits: 3
    });
  }
  
  const credential = { ...validCredential, courses };
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, '101 courses should exceed max');
});

test('Schema - Additional properties rejected', () => {
  const credential = {
    ...validCredential,
    unknownField: 'should fail'
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Additional properties should be rejected');
});

test('Schema - Institution with optional country', () => {
  const credential = {
    ...validCredential,
    institution: {
      name: 'Smart College',
      code: 'SC-001'
      // no country
    }
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, true, 'Country should be optional');
});

test('Schema - Student ID validation (alphanumeric, underscore, hyphen)', () => {
  const validIds = ['STU-001', 'STU_001', 'STU001', 'student-123_abc'];
  validIds.forEach(id => {
    const credential = { ...validCredential, studentId: id };
    const result = validator.validateCredential(credential);
    assert.strictEqual(result.valid, true, `Student ID "${id}" should be valid`);
  });
});

test('Schema - Student ID with special chars fails', () => {
  const credential = { ...validCredential, studentId: 'STU@001' };
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Student ID with @ should fail');
});

test('Schema - Validate metadata retrieval', () => {
  const metadata = validator.getSchemaMetadata();
  
  assert.strictEqual(metadata.namespace, 'org.smartcollege.academic', 'Namespace should match');
  assert.strictEqual(metadata.version, '1', 'Version should be 1');
  assert(metadata.requiredFields.includes('studentId'), 'Should include studentId');
  assert(metadata.totalFields > 0, 'Should have total fields count');
});

test('Schema - Date format validation (ISO 8601)', () => {
  const validDates = [
    '2024-01-01T00:00:00Z',
    '2024-12-31T23:59:59Z',
    '2024-06-15T12:30:45Z'
  ];
  
  validDates.forEach(date => {
    const credential = {
      ...validCredential,
      issueDate: date,
      expiryDate: '2029-12-31T23:59:59Z'
    };
    const result = validator.validateCredential(credential);
    assert.strictEqual(result.valid, true, `Date "${date}" should be valid ISO 8601`);
  });
});

test('Schema - Invalid date format', () => {
  const credential = {
    ...validCredential,
    issueDate: '01/15/2024' // MM/DD/YYYY format
  };
  
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Non-ISO date format should fail');
});

test('Schema - Degree level enum validation', () => {
  const validDegrees = ['high-school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'];
  
  validDegrees.forEach(degree => {
    const credential = { ...validCredential, degreeLevel: degree };
    const result = validator.validateCredential(credential);
    assert.strictEqual(result.valid, true, `Degree "${degree}" should be valid`);
  });
});

test('Schema - Invalid degree level', () => {
  const credential = { ...validCredential, degreeLevel: 'phd' }; // Should be 'doctorate'
  const result = validator.validateCredential(credential);
  assert.strictEqual(result.valid, false, 'Invalid degree should fail');
});

test('Schema - GPA range validation (boundary)', () => {
  const result1 = validator.validateGPA(0);
  const result2 = validator.validateGPA(4.0);
  const result3 = validator.validateGPA(2.5);
  
  assert.strictEqual(result1, true, 'GPA 0 should be valid');
  assert.strictEqual(result2, true, 'GPA 4.0 should be valid');
  assert.strictEqual(result3, true, 'GPA 2.5 should be valid');
});

test('Schema - Credits range validation (boundary)', () => {
  const result1 = validator.validateCredits(0);
  const result2 = validator.validateCredits(999);
  const result3 = validator.validateCredits(3);
  
  assert.strictEqual(result1, true, 'Credits 0 should be valid');
  assert.strictEqual(result2, true, 'Credits 999 should be valid');
  assert.strictEqual(result3, true, 'Credits 3 should be valid');
});

test('Schema - Error details include path and message', () => {
  const credential = {
    ...validCredential,
    issueDate: '2025-01-10T10:00:00Z',
    expiryDate: '2024-01-10T10:00:00Z'
  };
  
  const result = validator.validateCompletely(credential);
  assert.strictEqual(result.valid, false, 'Should have validation error');
  assert(result.errors[0].path, 'Error should have path');
  assert(result.errors[0].message, 'Error should have message');
});

test('Schema - Minimal valid credential', () => {
  const minimalCredential = {
    studentId: 'STU-001',
    name: {
      givenName: 'John',
      familyName: 'Doe'
    },
    institution: {
      name: 'College',
      code: 'C-001'
    },
    courses: [
      {
        name: 'Course',
        code: 'CS-101',
        grade: 'A',
        credits: 3
      }
    ],
    issueDate: '2024-01-01T00:00:00Z',
    expiryDate: '2029-01-01T00:00:00Z'
  };
  
  const result = validator.validateCredential(minimalCredential);
  assert.strictEqual(result.valid, true, 'Minimal credential should be valid');
});
