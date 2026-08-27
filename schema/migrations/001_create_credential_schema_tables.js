/**
 * Database Migration: Create Credential Schema Tables
 * Timestamp: 2024-01-10T00:00:00Z
 * 
 * Creates tables for:
 * - credential_schemas: Store schema definitions (JSON)
 * - issued_credentials: Store issued credentials
 * - revocation_list: Track revoked credentials
 * - credential_audit_log: Audit trail for issuance
 */

export async function up(db) {
  // Create credential_schemas table
  await db.raw(`
    CREATE TABLE IF NOT EXISTS credential_schemas (
      id SERIAL PRIMARY KEY,
      namespace VARCHAR(255) NOT NULL UNIQUE,
      version INTEGER NOT NULL DEFAULT 1,
      schema_definition JSONB NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(namespace, version)
    );
  `);

  // Create issued_credentials table
  await db.raw(`
    CREATE TABLE IF NOT EXISTS issued_credentials (
      id SERIAL PRIMARY KEY,
      credential_id UUID NOT NULL UNIQUE,
      issuer_id UUID NOT NULL,
      schema_id INTEGER NOT NULL REFERENCES credential_schemas(id),
      student_id VARCHAR(255) NOT NULL,
      credential_data JSONB NOT NULL,
      credential_cbor BYTEA,
      qr_code_data TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP,
      revoked_at TIMESTAMP,
      revocation_reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT valid_status CHECK (status IN ('active', 'revoked', 'expired', 'pending')),
      UNIQUE(credential_id),
      INDEX (issuer_id),
      INDEX (student_id),
      INDEX (status),
      INDEX (issued_at),
      INDEX (expires_at)
    );
  `);

  // Create revocation_list table
  await db.raw(`
    CREATE TABLE IF NOT EXISTS revocation_list (
      id SERIAL PRIMARY KEY,
      credential_id UUID NOT NULL UNIQUE REFERENCES issued_credentials(credential_id),
      issuer_id UUID NOT NULL,
      revocation_reason VARCHAR(255),
      revoked_by_user_id UUID,
      revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX (issuer_id),
      INDEX (revoked_at)
    );
  `);

  // Create credential_audit_log table
  await db.raw(`
    CREATE TABLE IF NOT EXISTS credential_audit_log (
      id SERIAL PRIMARY KEY,
      credential_id UUID,
      action VARCHAR(50) NOT NULL,
      actor_id UUID NOT NULL,
      actor_type VARCHAR(50),
      issuer_id UUID,
      changes JSONB,
      status_before VARCHAR(50),
      status_after VARCHAR(50),
      ip_address INET,
      user_agent TEXT,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT valid_action CHECK (action IN ('issued', 'verified', 'revoked', 'updated', 'accessed')),
      INDEX (credential_id),
      INDEX (issuer_id),
      INDEX (action),
      INDEX (timestamp)
    );
  `);

  // Create index on issuer_id for faster lookups
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_issued_credentials_issuer_id 
    ON issued_credentials(issuer_id);
  `);

  // Create index on student_id for bulk operations
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_issued_credentials_student_id 
    ON issued_credentials(student_id);
  `);

  // Create index on credential_data for JSONB queries
  await db.raw(`
    CREATE INDEX IF NOT EXISTS idx_issued_credentials_data_gin 
    ON issued_credentials USING GIN(credential_data);
  `);

  console.log('✅ Migration UP: Created credential schema tables');
}

export async function down(db) {
  // Drop tables in reverse order (handle foreign keys)
  await db.raw('DROP TABLE IF EXISTS credential_audit_log;');
  await db.raw('DROP TABLE IF EXISTS revocation_list;');
  await db.raw('DROP TABLE IF EXISTS issued_credentials;');
  await db.raw('DROP TABLE IF EXISTS credential_schemas;');

  console.log('✅ Migration DOWN: Dropped credential schema tables');
}
