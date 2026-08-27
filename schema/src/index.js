/**
 * mDoc Schema Definition and Validation Service
 * Academic Transcripts & Qualifications
 * Namespace: org.smartcollege.academic
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ useDefaults: true, coerceTypes: true });
addFormats(ajv);

/**
 * JSON Schema Definition for Academic Credentials
 * Compliant with ISO/IEC 18013-5:2021 mDoc specification
 */
export const ACADEMIC_CREDENTIAL_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'org.smartcollege.academic/v1',
  title: 'Academic Transcript & Qualification',
  description: 'mDoc credential for academic transcripts and qualifications',
  type: 'object',
  required: [
    'studentId',
    'name',
    'institution',
    'courses',
    'issueDate',
    'expiryDate'
  ],
  properties: {
    studentId: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      description: 'Unique student identifier',
      pattern: '^[A-Za-z0-9_-]+$'
    },
    name: {
      type: 'object',
      required: ['givenName', 'familyName'],
      description: 'Student name',
      properties: {
        givenName: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'First/given name'
        },
        familyName: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          description: 'Last/family name'
        },
        middleNames: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: 100
          },
          maxItems: 3,
          description: 'Optional middle names'
        }
      },
      additionalProperties: false
    },
    dateOfBirth: {
      type: 'string',
      format: 'date',
      description: 'Student date of birth (YYYY-MM-DD)'
    },
    institution: {
      type: 'object',
      required: ['name', 'code'],
      description: 'Issuing institution',
      properties: {
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Official institution name'
        },
        code: {
          type: 'string',
          minLength: 1,
          maxLength: 50,
          description: 'Institution unique code/identifier'
        },
        country: {
          type: 'string',
          minLength: 2,
          maxLength: 2,
          description: 'ISO 3166-1 alpha-2 country code'
        }
      },
      additionalProperties: false
    },
    degreeLevel: {
      type: 'string',
      enum: ['high-school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma'],
      description: 'Degree or qualification level'
    },
    fieldOfStudy: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      description: 'Primary field of study or major'
    },
    courses: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      description: 'List of completed courses/subjects',
      items: {
        type: 'object',
        required: ['name', 'code', 'grade', 'credits'],
        description: 'Individual course record',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: 'Course name'
          },
          code: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'Course code/identifier'
          },
          grade: {
            type: 'string',
            minLength: 1,
            maxLength: 5,
            description: 'Grade received (A, A+, 4.0, etc.)'
          },
          credits: {
            type: 'number',
            minimum: 0,
            maximum: 999,
            description: 'Credit hours or units'
          },
          completionDate: {
            type: 'string',
            format: 'date',
            description: 'Course completion date (YYYY-MM-DD)'
          }
        },
        additionalProperties: false
      }
    },
    gpa: {
      type: 'number',
      minimum: 0,
      maximum: 4.0,
      description: 'Cumulative GPA (0.0 - 4.0 scale)'
    },
    achievements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title'],
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: 'Achievement title (honors, awards, etc.)'
          },
          date: {
            type: 'string',
            format: 'date'
          }
        },
        additionalProperties: false
      },
      maxItems: 20,
      description: 'Optional honors, awards, recognitions'
    },
    issueDate: {
      type: 'string',
      format: 'date-time',
      description: 'Credential issuance date and time (ISO 8601)'
    },
    expiryDate: {
      type: 'string',
      format: 'date-time',
      description: 'Credential expiry date and time (ISO 8601)'
    },
    issuerId: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      description: 'Issuer identifier (institution code or ID)'
    }
  },
  additionalProperties: false
};

/**
 * Schema Validator Service
 */
export class SchemaValidator {
  constructor() {
    this.validate = ajv.compile(ACADEMIC_CREDENTIAL_SCHEMA);
  }

  /**
   * Validate credential data against schema
   * @param {object} credential - Credential data to validate
   * @returns {object} { valid, errors }
   */
  validateCredential(credential) {
    const valid = this.validate(credential);
    
    if (!valid) {
      return {
        valid: false,
        errors: this.validate.errors.map(error => ({
          path: error.instancePath || '/',
          message: error.message,
          keyword: error.keyword,
          params: error.params
        }))
      };
    }

    return {
      valid: true,
      errors: []
    };
  }

  /**
   * Validate GPA is within expected range
   */
  validateGPA(gpa) {
    if (gpa === undefined || gpa === null) return true;
    return gpa >= 0 && gpa <= 4.0;
  }

  /**
   * Validate course credits
   */
  validateCredits(credits) {
    return credits >= 0 && credits <= 999;
  }

  /**
   * Validate date ranges (issue < expiry)
   */
  validateDateRange(issueDate, expiryDate) {
    const issue = new Date(issueDate);
    const expiry = new Date(expiryDate);
    return issue < expiry;
  }

  /**
   * Validate complete credential with business rules
   */
  validateCompletely(credential) {
    const schemaValidation = this.validateCredential(credential);
    
    if (!schemaValidation.valid) {
      return schemaValidation;
    }

    const errors = [];

    // Business rule: issue date must be before expiry date
    if (!this.validateDateRange(credential.issueDate, credential.expiryDate)) {
      errors.push({
        path: '/issueDateRange',
        message: 'Issue date must be before expiry date',
        keyword: 'dateRange'
      });
    }

    // Business rule: GPA must be valid
    if (credential.gpa !== undefined && !this.validateGPA(credential.gpa)) {
      errors.push({
        path: '/gpa',
        message: 'GPA must be between 0.0 and 4.0',
        keyword: 'gpaRange'
      });
    }

    // Business rule: Courses array must not be empty
    if (!credential.courses || credential.courses.length === 0) {
      errors.push({
        path: '/courses',
        message: 'At least one course must be listed',
        keyword: 'minItems'
      });
    }

    // Business rule: Validate each course's credits
    if (credential.courses) {
      credential.courses.forEach((course, index) => {
        if (!this.validateCredits(course.credits)) {
          errors.push({
            path: `/courses/${index}/credits`,
            message: `Course credits must be between 0 and 999`,
            keyword: 'creditsRange'
          });
        }
      });
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors
      };
    }

    return {
      valid: true,
      errors: []
    };
  }

  /**
   * Get schema metadata
   */
  getSchemaMetadata() {
    return {
      namespace: 'org.smartcollege.academic',
      version: '1',
      title: ACADEMIC_CREDENTIAL_SCHEMA.title,
      description: ACADEMIC_CREDENTIAL_SCHEMA.description,
      requiredFields: ACADEMIC_CREDENTIAL_SCHEMA.required,
      totalFields: Object.keys(ACADEMIC_CREDENTIAL_SCHEMA.properties).length
    };
  }
}

/**
 * Default validator instance
 */
export const validator = new SchemaValidator();

export default SchemaValidator;
