/**
 * Signature Validator Service
 * 
 * Cryptographic verification of credential signatures using ED25519
 * Integrates with jose for JWS/JWT operations
 */

import { jwtVerify, compactVerify, importSPKI } from 'jose';

export class SignatureValidator {
  constructor(options = {}) {
    this.validationResults = new Map();  // credentialId -> validation result
    this.trustedKeys = new Map();         // issuerDid -> public key
    this.auditLog = [];
    this.maxAuditLog = options.maxAuditLog || 1000;
  }

  /**
   * Validate public key format
   */
  validatePublicKeyFormat(publicKeyPem) {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') {
      return { valid: false, error: 'Public key is required' };
    }

    // Check for PEM format
    if (!publicKeyPem.includes('BEGIN PUBLIC KEY')) {
      return { valid: false, error: 'Public key must be in PEM format' };
    }

    if (!publicKeyPem.includes('END PUBLIC KEY')) {
      return { valid: false, error: 'Public key must be in PEM format' };
    }

    // Check minimum length (actual keys are ~300+ chars)
    if (publicKeyPem.length < 50) {
      return { valid: false, error: 'Public key appears to be invalid or too short' };
    }

    return { valid: true };
  }

  /**
   * Register issuer public key
   */
  registerPublicKey(issuerDid, publicKeyPem) {
    const validation = this.validatePublicKeyFormat(publicKeyPem);
    if (!validation.valid) {
      return validation;
    }

    this.trustedKeys.set(issuerDid, {
      issuerDid,
      publicKeyPem,
      registeredAt: new Date(),
      verificationsCount: 0
    });

    this._logAudit('key_registered', { issuerDid });

    return { success: true, issuerDid };
  }

  /**
   * Get issuer public key
   */
  getPublicKey(issuerDid) {
    const keyData = this.trustedKeys.get(issuerDid);
    if (!keyData) {
      return null;
    }
    return keyData.publicKeyPem;
  }

  /**
   * List trusted keys
   */
  listTrustedKeys() {
    return Array.from(this.trustedKeys.values()).map(k => ({
      issuerDid: k.issuerDid,
      registeredAt: k.registeredAt,
      verificationsCount: k.verificationsCount
    }));
  }

  /**
   * Verify JWS signature using ED25519
   * JWS format: "header.payload.signature"
   */
  async verifyJWSSignature(jws, publicKeyPem, options = {}) {
    try {
      if (!jws || typeof jws !== 'string') {
        return {
          success: false,
          error: 'JWS is required and must be a string'
        };
      }

      const keyValidation = this.validatePublicKeyFormat(publicKeyPem);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }

      // Import public key
      const publicKey = await importSPKI(publicKeyPem, 'EdDSA');

      // Verify JWS signature
      const verified = await compactVerify(jws, publicKey);
      const payload = JSON.parse(new TextDecoder().decode(verified.payload));

      this._logAudit('jws_verified', { 
        success: true,
        algorithm: verified.protectedHeader?.alg 
      });

      return {
        success: true,
        payload,
        algorithm: verified.protectedHeader?.alg,
        verifiedAt: new Date()
      };
    } catch (error) {
      this._logAudit('jws_verification_failed', { 
        error: error.message 
      });

      return {
        success: false,
        error: `JWS verification failed: ${error.message}`
      };
    }
  }

  /**
   * Verify JWT token
   * JWT format: "header.payload.signature"
   */
  async verifyJWTToken(token, publicKeyPem, options = {}) {
    try {
      if (!token || typeof token !== 'string') {
        return {
          success: false,
          error: 'Token is required and must be a string'
        };
      }

      const keyValidation = this.validatePublicKeyFormat(publicKeyPem);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }

      // Import public key
      const publicKey = await importSPKI(publicKeyPem, 'EdDSA');

      // Verify token
      const verified = await jwtVerify(token, publicKey, {
        ...options,
        algorithms: ['EdDSA']
      });

      this._logAudit('jwt_verified', { 
        subject: verified.payload.sub,
        issuer: verified.payload.iss 
      });

      return {
        success: true,
        payload: verified.payload,
        header: verified.protectedHeader,
        verifiedAt: new Date()
      };
    } catch (error) {
      this._logAudit('jwt_verification_failed', { 
        error: error.message 
      });

      return {
        success: false,
        error: `JWT verification failed: ${error.message}`
      };
    }
  }

  /**
   * Verify credential signature
   * Primary verification method - works with JWS credentials
   */
  async verifyCredentialSignature(credentialId, signatureData, issuerDid) {
    try {
      // Get issuer public key
      const publicKey = this.getPublicKey(issuerDid);
      if (!publicKey) {
        return {
          success: false,
          credentialId,
          error: `Public key not found for issuer: ${issuerDid}`,
          issuerDid
        };
      }

      // Verify JWS (credential is typically in JWS format)
      const result = await this.verifyJWSSignature(signatureData, publicKey);

      if (!result.success) {
        return {
          success: false,
          credentialId,
          error: result.error,
          issuerDid
        };
      }

      // Update verification count
      const keyData = this.trustedKeys.get(issuerDid);
      if (keyData) {
        keyData.verificationsCount++;
      }

      // Store validation result
      const validationResult = {
        credentialId,
        issuerDid,
        signatureValid: true,
        verifiedAt: new Date(),
        algorithm: result.algorithm,
        payload: result.payload
      };

      this.validationResults.set(credentialId, validationResult);

      this._logAudit('credential_verified', {
        credentialId,
        issuerDid,
        algorithm: result.algorithm
      });

      return {
        success: true,
        credentialId,
        issuerDid,
        signatureValid: true,
        algorithm: result.algorithm,
        verifiedAt: validationResult.verifiedAt,
        payload: result.payload
      };
    } catch (error) {
      this._logAudit('credential_verification_error', {
        credentialId,
        issuerDid,
        error: error.message
      });

      return {
        success: false,
        credentialId,
        error: error.message,
        issuerDid
      };
    }
  }

  /**
   * Batch verify credentials
   */
  async verifyCredentialBatch(credentials) {
    const results = {
      total: credentials.length,
      verified: 0,
      failed: 0,
      results: []
    };

    for (const cred of credentials) {
      const result = await this.verifyCredentialSignature(
        cred.credentialId,
        cred.signatureData,
        cred.issuerDid
      );

      results.results.push(result);

      if (result.success) {
        results.verified++;
      } else {
        results.failed++;
      }
    }

    this._logAudit('batch_verification', {
      total: results.total,
      verified: results.verified,
      failed: results.failed
    });

    return results;
  }

  /**
   * Get verification result
   */
  getVerificationResult(credentialId) {
    return this.validationResults.get(credentialId) || null;
  }

  /**
   * Check if credential signature is valid
   */
  isSignatureValid(credentialId) {
    const result = this.validationResults.get(credentialId);
    return result?.signatureValid || false;
  }

  /**
   * Validate credential claims structure
   */
  validateCredentialClaims(payload) {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be an object'] };
    }

    const errors = [];

    // Check required claims for academic credentials
    if (payload.ns === 'org.smartcollege.academic/v1') {
      if (!payload.studentId) {
        errors.push('studentId is required for academic credentials');
      }
      if (!payload.name) {
        errors.push('name is required for academic credentials');
      }
      if (!payload.institution) {
        errors.push('institution is required for academic credentials');
      }
      if (!Array.isArray(payload.courses) || payload.courses.length === 0) {
        errors.push('At least one course is required');
      }

      // Validate course structure
      if (Array.isArray(payload.courses)) {
        for (const course of payload.courses) {
          if (!course.courseCode || !course.courseName) {
            errors.push('Each course must have courseCode and courseName');
            break;
          }
          if (typeof course.credits !== 'number' || course.credits < 0 || course.credits > 999) {
            errors.push('Course credits must be 0-999');
            break;
          }
        }
      }

      // Validate GPA if present
      if (payload.gpa !== undefined) {
        if (typeof payload.gpa !== 'number' || payload.gpa < 0 || payload.gpa > 4.0) {
          errors.push('GPA must be 0-4.0');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Verify and validate credential
   */
  async verifyAndValidateCredential(credentialId, signatureData, issuerDid) {
    // Verify signature
    const sigResult = await this.verifyCredentialSignature(
      credentialId,
      signatureData,
      issuerDid
    );

    if (!sigResult.success) {
      return sigResult;
    }

    // Validate claims
    const claimsValidation = this.validateCredentialClaims(sigResult.payload);

    if (!claimsValidation.valid) {
      return {
        success: false,
        credentialId,
        error: 'Invalid credential claims',
        validationErrors: claimsValidation.errors
      };
    }

    return {
      success: true,
      credentialId,
      signatureValid: true,
      claimsValid: true,
      payload: sigResult.payload,
      verifiedAt: sigResult.verifiedAt
    };
  }

  /**
   * Extract and validate claims from signature
   */
  extractCredentialClaims(credentialId) {
    const result = this.validationResults.get(credentialId);
    if (!result) {
      return null;
    }

    return {
      credentialId,
      claims: result.payload,
      verifiedAt: result.verifiedAt,
      issuerDid: result.issuerDid
    };
  }

  /**
   * Check credential expiration
   */
  checkExpiration(payload) {
    if (!payload.exp) {
      return { expired: false, error: 'No expiration claim' };
    }

    const now = Math.floor(Date.now() / 1000);
    const expTime = typeof payload.exp === 'string' ? parseInt(payload.exp) : payload.exp;

    return {
      expired: now > expTime,
      expiresAt: new Date(expTime * 1000),
      timeRemaining: expTime - now
    };
  }

  /**
   * Check credential issuance date
   */
  checkIssuance(payload) {
    if (!payload.iat && !payload.iss) {
      return { valid: false, error: 'No issuance information' };
    }

    const iat = payload.iat || Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);

    return {
      valid: now >= iat,
      issuedAt: new Date(iat * 1000),
      ageDays: Math.floor((now - iat) / 86400)
    };
  }

  /**
   * Get validation statistics
   */
  getStatistics() {
    const stats = {
      totalVerifications: this.validationResults.size,
      trustedIssuers: this.trustedKeys.size,
      totalVerificationsPerformed: 0,
      algorithms: {},
      auditLogEntries: this.auditLog.length
    };

    // Count algorithms
    for (const result of this.validationResults.values()) {
      if (result.algorithm) {
        stats.algorithms[result.algorithm] = (stats.algorithms[result.algorithm] || 0) + 1;
      }
    }

    // Count total verifications
    for (const key of this.trustedKeys.values()) {
      stats.totalVerificationsPerformed += key.verificationsCount;
    }

    return stats;
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 100, filter = {}) {
    let logs = this.auditLog;

    if (filter.action) {
      logs = logs.filter(log => log.action === filter.action);
    }

    if (filter.success !== undefined) {
      logs = logs.filter(log => {
        const isSuccess = log.action.includes('verified') || 
                         log.action.includes('registered');
        return isSuccess === filter.success;
      });
    }

    return logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Clear validation history
   */
  clearValidationHistory() {
    this.validationResults.clear();
    this.auditLog = [];
    return { success: true, cleared: true };
  }

  /**
   * Export verification report
   */
  exportVerificationReport(format = 'json') {
    const report = {
      exportedAt: new Date().toISOString(),
      statistics: this.getStatistics(),
      verifications: Array.from(this.validationResults.values()),
      trustedKeys: this.listTrustedKeys()
    };

    return {
      success: true,
      format,
      data: format === 'json' ? report : JSON.stringify(report)
    };
  }

  /**
   * Internal: Log audit entry
   */
  _logAudit(action, details) {
    this.auditLog.push({
      action,
      details,
      timestamp: new Date().toISOString()
    });

    // Maintain max history
    if (this.auditLog.length > this.maxAuditLog) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLog);
    }
  }
}

export default SignatureValidator;
