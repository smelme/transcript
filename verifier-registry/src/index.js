/**
 * Verifier Registry - Trusted verifier management
 * 
 * Registry of verified verifiers that can request credentials
 * Maintains trust status, public keys, and verification history
 */

import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Registry Configuration
 */
export const REGISTRY_CONFIG = {
  NAMESPACE: 'org.smartcollege.verifier',
  VERSION: '1',
  VERIFIER_STATUSES: ['pending', 'approved', 'suspended', 'revoked'],
  VERIFICATION_TYPES: ['academic', 'employment', 'government', 'other'],
  DEFAULT_TRUST_SCORE: 50,
  MAX_TRUST_SCORE: 100,
  MIN_TRUST_SCORE: 0
};

/**
 * Verifier Registry Manager
 */
export class VerifierRegistry {
  constructor(options = {}) {
    this.pool = options.pool || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'credentials',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password'
    });

    this.namespace = options.namespace || REGISTRY_CONFIG.NAMESPACE;
    
    // Setup AJV for validation
    this.ajv = new Ajv();
    addFormats(this.ajv);
    
    // Verifier schema
    this.verifierSchema = this.buildVerifierSchema();
  }

  /**
   * Build JSON Schema for verifier validation
   */
  buildVerifierSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['verifierId', 'name', 'verificationTypes', 'publicKeyPem'],
      properties: {
        verifierId: {
          type: 'string',
          minLength: 3,
          maxLength: 50,
          pattern: '^[A-Za-z0-9_-]+$'
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 200
        },
        description: {
          type: 'string',
          maxLength: 500
        },
        verificationTypes: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: {
            type: 'string',
            enum: REGISTRY_CONFIG.VERIFICATION_TYPES
          }
        },
        url: {
          type: 'string',
          format: 'uri',
          maxLength: 500
        },
        contactEmail: {
          type: 'string',
          format: 'email',
          maxLength: 100
        },
        contactPhone: {
          type: 'string',
          pattern: '^\\+?[0-9\\-()\\s]+$',
          maxLength: 30
        },
        publicKeyPem: {
          type: 'string',
          minLength: 50
        },
        trustScore: {
          type: 'integer',
          minimum: 0,
          maximum: 100
        },
        status: {
          type: 'string',
          enum: REGISTRY_CONFIG.VERIFIER_STATUSES
        }
      },
      additionalProperties: false
    };
  }

  /**
   * Validate verifier data
   */
  validateVerifier(verifierData) {
    try {
      const validate = this.ajv.compile(this.verifierSchema);
      const valid = validate(verifierData);

      if (!valid) {
        return {
          valid: false,
          errors: validate.errors.map(err => ({
            path: err.instancePath,
            message: err.message
          }))
        };
      }

      // Additional business logic validation
      if (verifierData.trustScore !== undefined) {
        if (verifierData.trustScore < REGISTRY_CONFIG.MIN_TRUST_SCORE || 
            verifierData.trustScore > REGISTRY_CONFIG.MAX_TRUST_SCORE) {
          return {
            valid: false,
            errors: [{
              path: 'trustScore',
              message: `Trust score must be between ${REGISTRY_CONFIG.MIN_TRUST_SCORE} and ${REGISTRY_CONFIG.MAX_TRUST_SCORE}`
            }]
          };
        }
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
   * Initialize database schema
   */
  async initialize() {
    try {
      const client = await this.pool.connect();

      await client.query(`
        CREATE TABLE IF NOT EXISTS verifiers (
          verifier_id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          description VARCHAR(500),
          verification_types TEXT[] NOT NULL,
          url VARCHAR(500),
          contact_email VARCHAR(100),
          contact_phone VARCHAR(30),
          public_key_pem TEXT NOT NULL,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'suspended', 'revoked')),
          trust_score INTEGER DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
          credentials_verified_count INTEGER DEFAULT 0,
          approved_at TIMESTAMP,
          revoked_at TIMESTAMP,
          revocation_reason VARCHAR(500),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_verifier_status ON verifiers(status);
        CREATE INDEX IF NOT EXISTS idx_verifier_type ON verifiers USING GIN(verification_types);
        CREATE INDEX IF NOT EXISTS idx_verifier_trust ON verifiers(trust_score);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS verifier_audit (
          id BIGSERIAL PRIMARY KEY,
          verifier_id VARCHAR(50) NOT NULL,
          action VARCHAR(50) NOT NULL,
          actor_id VARCHAR(100),
          details JSONB,
          status_before VARCHAR(20),
          status_after VARCHAR(20),
          created_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (verifier_id) REFERENCES verifiers(verifier_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_verifier_audit ON verifier_audit(verifier_id);
        CREATE INDEX IF NOT EXISTS idx_verifier_audit_action ON verifier_audit(action);
      `);

      client.release();
      return { initialized: true };
    } catch (error) {
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Register new verifier
   */
  async registerVerifier(verifierData) {
    try {
      const validation = this.validateVerifier(verifierData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${JSON.stringify(validation.errors)}`);
      }

      const client = await this.pool.connect();

      const {
        verifierId,
        name,
        description,
        verificationTypes,
        url,
        contactEmail,
        contactPhone,
        publicKeyPem,
        trustScore = REGISTRY_CONFIG.DEFAULT_TRUST_SCORE,
        status = 'pending'
      } = verifierData;

      const result = await client.query(
        `INSERT INTO verifiers 
         (verifier_id, name, description, verification_types, url, contact_email, contact_phone, public_key_pem, status, trust_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING verifier_id, status, created_at`,
        [verifierId, name, description, verificationTypes, url, contactEmail, contactPhone, publicKeyPem, status, trustScore]
      );

      // Log audit entry
      await client.query(
        `INSERT INTO verifier_audit (verifier_id, action, status_after, details)
         VALUES ($1, $2, $3, $4)`,
        [verifierId, 'registered', status, JSON.stringify({ name, verificationTypes })]
      );

      client.release();

      return {
        verifierId,
        status,
        registered: true,
        registeredAt: result.rows[0].created_at
      };
    } catch (error) {
      throw new Error(`Failed to register verifier: ${error.message}`);
    }
  }

  /**
   * Retrieve verifier by ID
   */
  async getVerifier(verifierId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM verifiers WHERE verifier_id = $1`,
        [verifierId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        verifierId: row.verifier_id,
        name: row.name,
        description: row.description,
        verificationTypes: row.verification_types,
        url: row.url,
        contactEmail: row.contact_email,
        contactPhone: row.contact_phone,
        publicKeyPem: row.public_key_pem,
        status: row.status,
        trustScore: row.trust_score,
        credentialsVerifiedCount: row.credentials_verified_count,
        approvedAt: row.approved_at,
        revokedAt: row.revoked_at,
        revocationReason: row.revocation_reason,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      throw new Error(`Failed to retrieve verifier: ${error.message}`);
    }
  }

  /**
   * List verifiers by status
   */
  async listByStatus(status, limit = 100, offset = 0) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM verifiers WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      return result.rows.map(row => ({
        verifierId: row.verifier_id,
        name: row.name,
        verificationTypes: row.verification_types,
        status: row.status,
        trustScore: row.trust_score,
        createdAt: row.created_at
      }));
    } catch (error) {
      throw new Error(`Failed to list verifiers: ${error.message}`);
    }
  }

  /**
   * List by verification type
   */
  async listByType(verificationType, limit = 100, offset = 0) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM verifiers 
         WHERE verification_types @> $1::text[] AND status = 'approved'
         ORDER BY trust_score DESC, created_at DESC 
         LIMIT $2 OFFSET $3`,
        [[verificationType], limit, offset]
      );

      return result.rows.map(row => ({
        verifierId: row.verifier_id,
        name: row.name,
        verificationTypes: row.verification_types,
        trustScore: row.trust_score,
        url: row.url
      }));
    } catch (error) {
      throw new Error(`Failed to list by type: ${error.message}`);
    }
  }

  /**
   * Approve verifier
   */
  async approveVerifier(verifierId, approvedByUserId) {
    try {
      const client = await this.pool.connect();

      const result = await client.query(
        `UPDATE verifiers 
         SET status = 'approved', approved_at = NOW(), updated_at = NOW()
         WHERE verifier_id = $1
         RETURNING verifier_id, status, approved_at`,
        [verifierId]
      );

      if (result.rows.length === 0) {
        client.release();
        throw new Error('Verifier not found');
      }

      // Log audit
      await client.query(
        `INSERT INTO verifier_audit (verifier_id, action, actor_id, status_before, status_after)
         VALUES ($1, $2, $3, $4, $5)`,
        [verifierId, 'approved', approvedByUserId, 'pending', 'approved']
      );

      client.release();

      return {
        verifierId,
        status: 'approved',
        approvedAt: result.rows[0].approved_at
      };
    } catch (error) {
      throw new Error(`Failed to approve verifier: ${error.message}`);
    }
  }

  /**
   * Suspend verifier
   */
  async suspendVerifier(verifierId, reason, suspendedByUserId) {
    try {
      const client = await this.pool.connect();

      const result = await client.query(
        `UPDATE verifiers 
         SET status = 'suspended', updated_at = NOW()
         WHERE verifier_id = $1
         RETURNING verifier_id, status`,
        [verifierId]
      );

      if (result.rows.length === 0) {
        client.release();
        throw new Error('Verifier not found');
      }

      // Log audit
      await client.query(
        `INSERT INTO verifier_audit (verifier_id, action, actor_id, status_after, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [verifierId, 'suspended', suspendedByUserId, 'suspended', JSON.stringify({ reason })]
      );

      client.release();

      return {
        verifierId,
        status: 'suspended',
        reason
      };
    } catch (error) {
      throw new Error(`Failed to suspend verifier: ${error.message}`);
    }
  }

  /**
   * Revoke verifier
   */
  async revokeVerifier(verifierId, reason, revokedByUserId) {
    try {
      const client = await this.pool.connect();

      const result = await client.query(
        `UPDATE verifiers 
         SET status = 'revoked', revoked_at = NOW(), revocation_reason = $2, updated_at = NOW()
         WHERE verifier_id = $1
         RETURNING verifier_id, status, revoked_at`,
        [verifierId, reason]
      );

      if (result.rows.length === 0) {
        client.release();
        throw new Error('Verifier not found');
      }

      // Log audit
      await client.query(
        `INSERT INTO verifier_audit (verifier_id, action, actor_id, status_after, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [verifierId, 'revoked', revokedByUserId, 'revoked', JSON.stringify({ reason })]
      );

      client.release();

      return {
        verifierId,
        status: 'revoked',
        revokedAt: result.rows[0].revoked_at,
        reason
      };
    } catch (error) {
      throw new Error(`Failed to revoke verifier: ${error.message}`);
    }
  }

  /**
   * Update trust score
   */
  async updateTrustScore(verifierId, newScore, reason) {
    try {
      if (newScore < REGISTRY_CONFIG.MIN_TRUST_SCORE || newScore > REGISTRY_CONFIG.MAX_TRUST_SCORE) {
        throw new Error(`Trust score must be between ${REGISTRY_CONFIG.MIN_TRUST_SCORE} and ${REGISTRY_CONFIG.MAX_TRUST_SCORE}`);
      }

      const client = await this.pool.connect();

      const result = await client.query(
        `UPDATE verifiers 
         SET trust_score = $2, updated_at = NOW()
         WHERE verifier_id = $1
         RETURNING verifier_id, trust_score`,
        [verifierId, newScore]
      );

      if (result.rows.length === 0) {
        client.release();
        throw new Error('Verifier not found');
      }

      // Log audit
      await client.query(
        `INSERT INTO verifier_audit (verifier_id, action, details)
         VALUES ($1, $2, $3)`,
        [verifierId, 'trust_score_updated', JSON.stringify({ newScore, reason })]
      );

      client.release();

      return {
        verifierId,
        trustScore: result.rows[0].trust_score
      };
    } catch (error) {
      throw new Error(`Failed to update trust score: ${error.message}`);
    }
  }

  /**
   * Increment verified count
   */
  async recordVerification(verifierId) {
    try {
      const result = await this.pool.query(
        `UPDATE verifiers 
         SET credentials_verified_count = credentials_verified_count + 1, updated_at = NOW()
         WHERE verifier_id = $1
         RETURNING credentials_verified_count`,
        [verifierId]
      );

      if (result.rows.length === 0) {
        throw new Error('Verifier not found');
      }

      return {
        verifierId,
        verifiedCount: result.rows[0].credentials_verified_count
      };
    } catch (error) {
      throw new Error(`Failed to record verification: ${error.message}`);
    }
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(verifierId, limit = 100) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM verifier_audit 
         WHERE verifier_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [verifierId, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        verifierId: row.verifier_id,
        action: row.action,
        actorId: row.actor_id,
        statusBefore: row.status_before,
        statusAfter: row.status_after,
        details: row.details,
        createdAt: row.created_at
      }));
    } catch (error) {
      throw new Error(`Failed to get audit trail: ${error.message}`);
    }
  }

  /**
   * Check if verifier is approved
   */
  async isApproved(verifierId) {
    try {
      const verifier = await this.getVerifier(verifierId);
      return verifier && verifier.status === 'approved';
    } catch (error) {
      throw new Error(`Failed to check approval: ${error.message}`);
    }
  }

  /**
   * Check if verifier is revoked
   */
  async isRevoked(verifierId) {
    try {
      const verifier = await this.getVerifier(verifierId);
      return verifier && verifier.status === 'revoked';
    } catch (error) {
      throw new Error(`Failed to check revocation: ${error.message}`);
    }
  }

  /**
   * Get registry statistics
   */
  async getStatistics() {
    try {
      const result = await this.pool.query(
        `SELECT 
           COUNT(*) as total,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
           COUNT(CASE WHEN status = 'suspended' THEN 1 END) as suspended,
           COUNT(CASE WHEN status = 'revoked' THEN 1 END) as revoked,
           AVG(trust_score) as avg_trust_score,
           SUM(credentials_verified_count) as total_verifications
         FROM verifiers`
      );

      const row = result.rows[0];
      return {
        total: parseInt(row.total),
        approved: parseInt(row.approved),
        pending: parseInt(row.pending),
        suspended: parseInt(row.suspended),
        revoked: parseInt(row.revoked),
        avgTrustScore: parseFloat(row.avg_trust_score || 0),
        totalVerifications: parseInt(row.total_verifications || 0)
      };
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default {
  VerifierRegistry,
  REGISTRY_CONFIG
};
