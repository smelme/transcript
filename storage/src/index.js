/**
 * Credential Storage Layer
 * 
 * Stores credential metadata and audit trails
 * NOT storing actual credential data (claims) - only references
 * Session storage for temporary credentials before wallet distribution
 */

import { Pool } from 'pg';
import { nanoid } from 'nanoid';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Storage Configuration
 */
export const STORAGE_CONFIG = {
  NAMESPACE: 'org.smartcollege.academic',
  VERSION: '1',
  CREDENTIAL_STATUSES: ['pending', 'issued', 'revoked', 'expired'],
  AUDIT_ACTIONS: ['created', 'issued', 'revoked', 'verified', 'accessed'],
  SESSION_EXPIRY_MS: 3600000 // 1 hour
};

/**
 * Credential Storage Manager
 * Manages metadata-only storage and audit trails
 */
export class CredentialStorage {
  constructor(options = {}) {
    // PostgreSQL connection pool
    this.pool = options.pool || new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'credentials',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password'
    });

    // In-memory session storage for temporary credentials
    this.sessions = new Map();
    
    this.namespace = options.namespace || STORAGE_CONFIG.NAMESPACE;
  }

  /**
   * Initialize database schema
   */
  async initialize() {
    try {
      const client = await this.pool.connect();
      
      // Create credential_metadata table
      await client.query(`
        CREATE TABLE IF NOT EXISTS credential_metadata (
          credential_id UUID PRIMARY KEY,
          issuer_id VARCHAR(100) NOT NULL,
          student_id VARCHAR(50) NOT NULL,
          schema_id UUID,
          status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'issued', 'revoked', 'expired')),
          issue_date TIMESTAMP NOT NULL,
          expiry_date TIMESTAMP NOT NULL,
          revoked_at TIMESTAMP,
          revocation_reason VARCHAR(500),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (schema_id) REFERENCES credential_schemas(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_credential_issuer ON credential_metadata(issuer_id);
        CREATE INDEX IF NOT EXISTS idx_credential_student ON credential_metadata(student_id);
        CREATE INDEX IF NOT EXISTS idx_credential_status ON credential_metadata(status);
        CREATE INDEX IF NOT EXISTS idx_credential_expiry ON credential_metadata(expiry_date);
      `);

      // Create credential_audit_log table
      await client.query(`
        CREATE TABLE IF NOT EXISTS credential_audit_log (
          id BIGSERIAL PRIMARY KEY,
          credential_id UUID NOT NULL,
          action VARCHAR(20) NOT NULL CHECK (action IN ('created', 'issued', 'revoked', 'verified', 'accessed')),
          actor_id VARCHAR(100),
          actor_type VARCHAR(50),
          issuer_id VARCHAR(100),
          details JSONB,
          status_before VARCHAR(20),
          status_after VARCHAR(20),
          ip_address INET,
          user_agent VARCHAR(500),
          created_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (credential_id) REFERENCES credential_metadata(credential_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_audit_credential ON credential_audit_log(credential_id);
        CREATE INDEX IF NOT EXISTS idx_audit_issuer ON credential_audit_log(issuer_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON credential_audit_log(action);
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON credential_audit_log(created_at);
      `);

      // Create revocation_list table
      await client.query(`
        CREATE TABLE IF NOT EXISTS revocation_list (
          id BIGSERIAL PRIMARY KEY,
          credential_id UUID UNIQUE NOT NULL,
          issuer_id VARCHAR(100) NOT NULL,
          revocation_reason VARCHAR(500),
          revoked_by_user_id VARCHAR(100),
          revoked_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (credential_id) REFERENCES credential_metadata(credential_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_revocation_issuer ON revocation_list(issuer_id);
        CREATE INDEX IF NOT EXISTS idx_revocation_timestamp ON revocation_list(revoked_at);
      `);

      client.release();
      return { initialized: true };
    } catch (error) {
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  /**
   * Store credential metadata (called after generation)
   */
  async storeCredential(credentialMetadata) {
    try {
      const {
        credentialId,
        issuerId,
        studentId,
        schemaId,
        issueDate,
        expiryDate,
        status = 'issued'
      } = credentialMetadata;

      const client = await this.pool.connect();

      // Insert credential metadata
      const result = await client.query(
        `INSERT INTO credential_metadata 
         (credential_id, issuer_id, student_id, schema_id, status, issue_date, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING credential_id, status, created_at`,
        [credentialId, issuerId, studentId, schemaId, status, issueDate, expiryDate]
      );

      // Log audit entry
      await client.query(
        `INSERT INTO credential_audit_log 
         (credential_id, action, issuer_id, actor_type, status_after, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [credentialId, 'created', issuerId, 'issuer', status, JSON.stringify(credentialMetadata)]
      );

      client.release();

      return {
        credentialId,
        status,
        stored: true,
        storedAt: result.rows[0].created_at
      };
    } catch (error) {
      throw new Error(`Failed to store credential: ${error.message}`);
    }
  }

  /**
   * Retrieve credential metadata
   */
  async getCredentialMetadata(credentialId) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM credential_metadata WHERE credential_id = $1`,
        [credentialId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        credentialId: result.rows[0].credential_id,
        issuerId: result.rows[0].issuer_id,
        studentId: result.rows[0].student_id,
        status: result.rows[0].status,
        issueDate: result.rows[0].issue_date,
        expiryDate: result.rows[0].expiry_date,
        revokedAt: result.rows[0].revoked_at,
        revocationReason: result.rows[0].revocation_reason,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      };
    } catch (error) {
      throw new Error(`Failed to retrieve credential: ${error.message}`);
    }
  }

  /**
   * List credentials by issuer
   */
  async listByIssuer(issuerId, limit = 100, offset = 0) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM credential_metadata 
         WHERE issuer_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [issuerId, limit, offset]
      );

      return result.rows.map(row => ({
        credentialId: row.credential_id,
        issuerId: row.issuer_id,
        studentId: row.student_id,
        status: row.status,
        issueDate: row.issue_date,
        expiryDate: row.expiry_date,
        createdAt: row.created_at
      }));
    } catch (error) {
      throw new Error(`Failed to list credentials: ${error.message}`);
    }
  }

  /**
   * List credentials by student
   */
  async listByStudent(studentId, limit = 100, offset = 0) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM credential_metadata 
         WHERE student_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2 OFFSET $3`,
        [studentId, limit, offset]
      );

      return result.rows.map(row => ({
        credentialId: row.credential_id,
        issuerId: row.issuer_id,
        studentId: row.student_id,
        status: row.status,
        issueDate: row.issue_date,
        expiryDate: row.expiry_date,
        createdAt: row.created_at
      }));
    } catch (error) {
      throw new Error(`Failed to list student credentials: ${error.message}`);
    }
  }

  /**
   * Check credential status
   */
  async checkStatus(credentialId) {
    try {
      const metadata = await this.getCredentialMetadata(credentialId);
      
      if (!metadata) {
        return { status: 'not-found' };
      }

      // Check if expired
      if (new Date(metadata.expiryDate) < new Date()) {
        return { status: 'expired', metadata };
      }

      return { status: metadata.status, metadata };
    } catch (error) {
      throw new Error(`Failed to check status: ${error.message}`);
    }
  }

  /**
   * Revoke credential
   */
  async revokeCredential(credentialId, reason, revokedByUserId) {
    try {
      const client = await this.pool.connect();

      // Update credential status
      const result = await client.query(
        `UPDATE credential_metadata 
         SET status = 'revoked', revoked_at = NOW(), revocation_reason = $2, updated_at = NOW()
         WHERE credential_id = $1
         RETURNING credential_id, status, revoked_at`,
        [credentialId, reason]
      );

      if (result.rows.length === 0) {
        client.release();
        throw new Error('Credential not found');
      }

      // Insert into revocation list
      await client.query(
        `INSERT INTO revocation_list 
         (credential_id, issuer_id, revocation_reason, revoked_by_user_id)
         SELECT credential_id, issuer_id, $2, $3 FROM credential_metadata WHERE credential_id = $1`,
        [credentialId, reason, revokedByUserId]
      );

      // Log audit entry
      const oldMetadata = await this.getCredentialMetadata(credentialId);
      await client.query(
        `INSERT INTO credential_audit_log 
         (credential_id, action, actor_id, actor_type, status_before, status_after, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [credentialId, 'revoked', revokedByUserId, 'admin', 'issued', 'revoked', JSON.stringify({ reason })]
      );

      client.release();

      return {
        credentialId,
        status: 'revoked',
        revokedAt: result.rows[0].revoked_at,
        reason
      };
    } catch (error) {
      throw new Error(`Failed to revoke credential: ${error.message}`);
    }
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(credentialId, limit = 100) {
    try {
      const result = await this.pool.query(
        `SELECT * FROM credential_audit_log 
         WHERE credential_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [credentialId, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        credentialId: row.credential_id,
        action: row.action,
        actorId: row.actor_id,
        actorType: row.actor_type,
        issuerId: row.issuer_id,
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
   * Verify credential not revoked
   */
  async isRevoked(credentialId) {
    try {
      const result = await this.pool.query(
        `SELECT 1 FROM revocation_list WHERE credential_id = $1`,
        [credentialId]
      );

      return result.rows.length > 0;
    } catch (error) {
      throw new Error(`Failed to check revocation: ${error.message}`);
    }
  }

  /**
   * Session Storage: Store credential temporarily
   */
  storeInSession(credentialData) {
    const sessionId = `session-${nanoid(16)}`;
    const sessionEntry = {
      id: sessionId,
      data: credentialData,
      storedAt: new Date(),
      expiresAt: new Date(Date.now() + STORAGE_CONFIG.SESSION_EXPIRY_MS)
    };

    this.sessions.set(sessionId, sessionEntry);

    return {
      sessionId,
      expiresAt: sessionEntry.expiresAt
    };
  }

  /**
   * Retrieve from session storage
   */
  getFromSession(sessionId) {
    const entry = this.sessions.get(sessionId);

    if (!entry) {
      return null;
    }

    // Check expiry
    if (new Date() > entry.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return entry.data;
  }

  /**
   * Clear from session storage
   */
  clearFromSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clean up expired sessions
   */
  cleanExpiredSessions() {
    const now = new Date();
    let deleted = 0;

    for (const [sessionId, entry] of this.sessions.entries()) {
      if (now > entry.expiresAt) {
        this.sessions.delete(sessionId);
        deleted++;
      }
    }

    return { cleaned: deleted };
  }

  /**
   * Get storage statistics
   */
  async getStatistics() {
    try {
      const credentials = await this.pool.query(
        `SELECT COUNT(*) as total, 
                COUNT(CASE WHEN status = 'issued' THEN 1 END) as issued,
                COUNT(CASE WHEN status = 'revoked' THEN 1 END) as revoked,
                COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired,
                COUNT(CASE WHEN expiry_date < NOW() THEN 1 END) as now_expired
         FROM credential_metadata`
      );

      const audits = await this.pool.query(
        `SELECT COUNT(*) as total FROM credential_audit_log`
      );

      return {
        credentials: {
          total: parseInt(credentials.rows[0].total),
          issued: parseInt(credentials.rows[0].issued),
          revoked: parseInt(credentials.rows[0].revoked),
          expired: parseInt(credentials.rows[0].expired),
          nowExpired: parseInt(credentials.rows[0].now_expired)
        },
        auditLogs: {
          total: parseInt(audits.rows[0].total)
        },
        sessions: {
          active: this.sessions.size
        }
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
  CredentialStorage,
  STORAGE_CONFIG
};
