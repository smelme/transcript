/**
 * mDoc Credential Generation Engine
 * 
 * Integrates:
 * - P0-1: Schema Validation
 * - P0-12: Protocol (QR, CBOR, Device Engagement)
 * - P0-13: Key Management (ED25519 signatures)
 */

import CBOR from 'cbor';
import qrcode from 'qrcode';
import { SignJWT, importPKCS8, importSPKI } from 'jose';
import { nanoid } from 'nanoid';
import { randomBytes, createSign } from 'crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Credential Generator Configuration
 */
export const GENERATOR_CONFIG = {
  NAMESPACE: 'org.smartcollege.academic',
  VERSION: '1',
  SIGNATURE_ALGORITHM: 'EdDSA',
  SIGNATURE_CURVE: 'Ed25519',
  CREDENTIAL_EXPIRY_DAYS: 1825, // 5 years
  QR_ERROR_CORRECTION: 'H',
  QR_SIZE: 300
};

/**
 * Credential Generation Engine
 */
export class CredentialGenerator {
  constructor(options = {}) {
    this.keyLoader = options.keyLoader || null;
    this.schemaValidator = options.schemaValidator || null;
    this.namespace = options.namespace || GENERATOR_CONFIG.NAMESPACE;
    this.credentialExpiry = options.credentialExpiry || GENERATOR_CONFIG.CREDENTIAL_EXPIRY_DAYS;
    
    // Setup AJV for validation
    this.ajv = new Ajv();
    addFormats(this.ajv);
    
    // Credential schema (mDoc format)
    this.credentialSchema = this.buildCredentialSchema();
  }

  /**
   * Build JSON Schema for credential validation
   */
  buildCredentialSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['studentId', 'name', 'institution', 'courses'],
      properties: {
        studentId: {
          type: 'string',
          minLength: 1,
          maxLength: 50,
          pattern: '^[A-Za-z0-9_-]+$'
        },
        name: {
          type: 'object',
          required: ['givenName', 'familyName'],
          properties: {
            givenName: { type: 'string', minLength: 1, maxLength: 100 },
            familyName: { type: 'string', minLength: 1, maxLength: 100 },
            middleNames: { type: 'array', items: { type: 'string' } }
          }
        },
        dateOfBirth: { type: 'string', format: 'date' },
        institution: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            code: { type: 'string', maxLength: 50 },
            country: { type: 'string', maxLength: 50 }
          }
        },
        degreeLevel: {
          type: 'string',
          enum: ['high-school', 'associate', 'bachelor', 'master', 'doctorate', 'certificate', 'diploma']
        },
        fieldOfStudy: { type: 'string', minLength: 1, maxLength: 200 },
        gpa: { type: 'number', minimum: 0, maximum: 4.0 },
        courses: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            required: ['name', 'code', 'grade', 'credits'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 200 },
              code: { type: 'string', minLength: 1, maxLength: 50 },
              grade: { type: 'string', minLength: 1, maxLength: 5 },
              credits: { type: 'number', minimum: 0, maximum: 999 },
              completionDate: { type: 'string', format: 'date' }
            }
          }
        },
        achievements: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string' }
        },
        issueDate: { type: 'string', format: 'date-time' },
        expiryDate: { type: 'string', format: 'date-time' },
        issuerId: { type: 'string', minLength: 1, maxLength: 100 }
      },
      additionalProperties: false
    };
  }

  /**
   * Validate credential against schema
   */
  validateCredential(credentialData) {
    try {
      const validate = this.ajv.compile(this.credentialSchema);
      const valid = validate(credentialData);

      if (!valid) {
        return {
          valid: false,
          errors: validate.errors.map(err => ({
            path: err.instancePath,
            message: err.message
          }))
        };
      }

      // Business rule validation
      const businessRuleErrors = this.validateBusinessRules(credentialData);
      if (businessRuleErrors.length > 0) {
        return {
          valid: false,
          errors: businessRuleErrors
        };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [{ path: 'root', message: error.message }]
      };
    }
  }

  /**
   * Validate business rules
   */
  validateBusinessRules(credential) {
    const errors = [];

    // Date range validation
    const issueDate = new Date(credential.issueDate);
    const expiryDate = new Date(credential.expiryDate);

    if (issueDate >= expiryDate) {
      errors.push({
        path: 'dates',
        message: 'Issue date must be before expiry date'
      });
    }

    // GPA validation (if present)
    if (credential.gpa !== undefined && (credential.gpa < 0 || credential.gpa > 4.0)) {
      errors.push({
        path: 'gpa',
        message: 'GPA must be between 0.0 and 4.0'
      });
    }

    // Credits validation
    for (const course of credential.courses) {
      if (course.credits < 0 || course.credits > 999) {
        errors.push({
          path: `courses.${credential.courses.indexOf(course)}.credits`,
          message: 'Credits must be between 0 and 999'
        });
      }
    }

    return errors;
  }

  /**
   * Create ED25519 signature
   */
  async signCredential(credentialData, privateKeyPem) {
    try {
      // Convert credential to JSON string for signing
      const credentialJson = JSON.stringify(credentialData);

      // Import private key
      const privateKey = await importPKCS8(privateKeyPem, GENERATOR_CONFIG.SIGNATURE_ALGORITHM);

      // Create JWS signature
      const jwt = await new SignJWT(credentialData)
        .setProtectedHeader({
          alg: 'EdDSA',
          typ: 'mDoc',
          kid: credentialData.issuerId
        })
        .sign(privateKey);

      return {
        signature: jwt,
        algorithm: GENERATOR_CONFIG.SIGNATURE_ALGORITHM,
        curve: GENERATOR_CONFIG.SIGNATURE_CURVE
      };
    } catch (error) {
      throw new Error(`Signature creation failed: ${error.message}`);
    }
  }

  /**
   * Encode credential to CBOR
   */
  encodeCredential(credentialData, signature) {
    try {
      const mdocStructure = {
        version: GENERATOR_CONFIG.VERSION,
        namespace: this.namespace,
        docType: this.namespace,
        data: credentialData,
        signature: signature.signature,
        issueDate: new Date(credentialData.issueDate).getTime(),
        expiryDate: new Date(credentialData.expiryDate).getTime()
      };

      const cbor = CBOR.encode(mdocStructure);
      return {
        cbor,
        hex: cbor.toString('hex'),
        base64: cbor.toString('base64'),
        size: cbor.length
      };
    } catch (error) {
      throw new Error(`CBOR encoding failed: ${error.message}`);
    }
  }

  /**
   * Generate QR code for credential
   */
  async generateCredentialQR(credentialData, cborData) {
    try {
      // Create minimal QR data payload (to stay within size limits)
      const qrPayload = {
        t: 'mdoc',
        v: GENERATOR_CONFIG.VERSION,
        id: credentialData.credentialId,
        sid: credentialData.studentId,
        c: cborData.base64.substring(0, 500) // Limit CBOR data in QR
      };

      const qrData = JSON.stringify(qrPayload);

      // Generate QR code (PNG DataURL)
      const qrCode = await qrcode.toDataURL(qrData, {
        errorCorrectionLevel: GENERATOR_CONFIG.QR_ERROR_CORRECTION,
        type: 'image/png',
        width: GENERATOR_CONFIG.QR_SIZE,
        margin: 2
      });

      // Also generate ASCII for terminal display
      const qrAscii = await qrcode.toString(qrData, { type: 'terminal' });

      return {
        type: 'mdoc-credential',
        qrCode: qrCode,
        qrAscii: qrAscii,
        data: qrPayload,
        dataSize: qrData.length
      };
    } catch (error) {
      throw new Error(`QR generation failed: ${error.message}`);
    }
  }

  /**
   * Generate complete credential
   */
  async generateCredential(credentialData, keyName, privateKeyPem) {
    try {
      // Step 1: Validate credential
      const validation = this.validateCredential(credentialData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
      }

      // Step 2: Add metadata
      const credentialId = `mdoc-${nanoid(16)}`;
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt);
      expiresAt.setDate(expiresAt.getDate() + this.credentialExpiry);

      const enrichedCredential = {
        ...credentialData,
        credentialId,
        issuerId: credentialData.issuerId || keyName,
        issueDate: issuedAt.toISOString(),
        expiryDate: expiresAt.toISOString()
      };

      // Step 3: Sign credential
      const signature = await this.signCredential(enrichedCredential, privateKeyPem);

      // Step 4: Encode to CBOR
      const cborData = this.encodeCredential(enrichedCredential, signature);

      // Step 5: Generate QR code
      const qrCode = await this.generateCredentialQR(enrichedCredential, cborData);

      // Step 6: Return complete mDoc
      return {
        credentialId,
        status: 'issued',
        namespace: this.namespace,
        studentId: credentialData.studentId,
        studentName: `${credentialData.name.givenName} ${credentialData.name.familyName}`,
        institution: credentialData.institution.name,
        degreeLevel: credentialData.degreeLevel,
        gpa: credentialData.gpa,
        courses: credentialData.courses,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        signature: {
          algorithm: signature.algorithm,
          value: signature.signature
        },
        cbor: {
          hex: cborData.hex,
          base64: cborData.base64,
          size: cborData.size
        },
        qrCode: {
          dataUrl: qrCode.qrCode,
          ascii: qrCode.qrAscii,
          dataSize: qrCode.dataSize
        },
        metadata: {
          version: GENERATOR_CONFIG.VERSION,
          keyName: keyName,
          validated: true,
          signed: true,
          encoded: true
        }
      };
    } catch (error) {
      throw new Error(`Credential generation failed: ${error.message}`);
    }
  }

  /**
   * Batch generate credentials
   */
  async generateBatch(credentialsData, keyName, privateKeyPem) {
    const results = [];
    const errors = [];

    for (const credData of credentialsData) {
      try {
        const credential = await this.generateCredential(credData, keyName, privateKeyPem);
        results.push({
          success: true,
          credential
        });
      } catch (error) {
        errors.push({
          studentId: credData.studentId,
          error: error.message
        });
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    return {
      total: credentialsData.length,
      generated: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      errors
    };
  }

  /**
   * Get generator metadata
   */
  getMetadata() {
    return {
      namespace: this.namespace,
      version: GENERATOR_CONFIG.VERSION,
      signatureAlgorithm: GENERATOR_CONFIG.SIGNATURE_ALGORITHM,
      supportedCurves: [GENERATOR_CONFIG.SIGNATURE_CURVE],
      credentialExpiryDays: this.credentialExpiry,
      qrErrorCorrection: GENERATOR_CONFIG.QR_ERROR_CORRECTION,
      maxCoursesPerCredential: 100,
      maxAchievements: 20
    };
  }
}

/**
 * Utility function for quick credential generation
 */
export async function generateCredential(credentialData, keyName, privateKeyPem, options = {}) {
  const generator = new CredentialGenerator(options);
  return generator.generateCredential(credentialData, keyName, privateKeyPem);
}

export default {
  CredentialGenerator,
  GENERATOR_CONFIG,
  generateCredential
};
