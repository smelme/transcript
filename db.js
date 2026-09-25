import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Shared SQLite persistence for the issuer and verifier services.
 *
 * A single file-backed database (default: <repo>/data/transcript.db) is the
 * source of truth for wallet accounts, institute links, credential metadata
 * (NOT the mdoc bytes) and refresh tokens. Both services open the same file so
 * the verifier can enforce credential lifecycle (revoked / missing) directly.
 *
 * Override the location with DATABASE_PATH.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = process.env.DATABASE_PATH || path.join(REPO_ROOT, 'data', 'transcript.db');

let db = null;

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS wallet_accounts (
      sub            TEXT PRIMARY KEY,
      email          TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      active         INTEGER NOT NULL DEFAULT 1,
      deleted_at     TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_links (
      sub         TEXT NOT NULL,
      institution TEXT NOT NULL,
      student_id  TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (sub, institution, student_id)
    );

    CREATE TABLE IF NOT EXISTS credentials (
      credential_id TEXT PRIMARY KEY,
      issuer_id     TEXT,
      doc_type      TEXT,
      institution   TEXT,
      student_id    TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      device_bound  INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      revoked_at    TEXT,
      revoke_reason TEXT,
      metadata_json TEXT,
      status_index  INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_credentials_student ON credentials (institution, student_id);
    CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials (status);

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      sub        TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_sub ON refresh_tokens (sub);

    -- Pending/claimed issuance sessions. Persisted so an emailed claim link
    -- keeps working after a restart.
    CREATE TABLE IF NOT EXISTS issuance_sessions (
      session_id         TEXT PRIMARY KEY,
      sub                TEXT,
      email              TEXT,
      student_id         TEXT NOT NULL,
      institution        TEXT NOT NULL,
      credential_data    TEXT NOT NULL,
      display            TEXT,
      status             TEXT NOT NULL DEFAULT 'pending',
      terms_required     INTEGER NOT NULL DEFAULT 1,
      terms_accepted_at  TEXT,
      nonce              TEXT NOT NULL,
      credential_id      TEXT,
      created_at         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_issuance_sessions_owner ON issuance_sessions (institution, student_id);
    CREATE INDEX IF NOT EXISTS idx_issuance_sessions_email ON issuance_sessions (email);

    -- Management-portal administrators. Passwords are stored as scrypt hashes;
    -- session_version is bumped on sign-out or password change to invalidate
    -- every outstanding admin token for that account.
    CREATE TABLE IF NOT EXISTS admin_users (
      id              TEXT PRIMARY KEY,
      email           TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'admin',
      active          INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL,
      institution     TEXT
    );

    -- Client organisations that issue credentials through this service (an
    -- example academy, a university, ...). The institution string is the scope
    -- key: every credential already carries one, and an organisation may only
    -- see and revoke credentials issued under its own.
    CREATE TABLE IF NOT EXISTS client_orgs (
      institution TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    -- API keys used by a client organisation's own systems to issue credentials.
    -- Only the SHA-256 of the key is stored: the key itself is shown once at
    -- creation, so a database read cannot yield a usable credential.
    CREATE TABLE IF NOT EXISTS api_keys (
      key_id       TEXT PRIMARY KEY,
      institution  TEXT NOT NULL,
      name         TEXT,
      key_hash     TEXT NOT NULL UNIQUE,
      key_prefix   TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      last_used_at TEXT,
      revoked_at   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_institution ON api_keys (institution);

    -- What an institution publishes to a holder: the credentials it wants issued, held until the
    -- holder claims them or the invitation expires. The token is stored as a hash because it
    -- arrives in a link, and a database read must not yield a usable one.
    CREATE TABLE IF NOT EXISTS invitations (
      invitation_id TEXT PRIMARY KEY,
      institution   TEXT NOT NULL,
      holder_email  TEXT NOT NULL,
      holder_name   TEXT,
      student_id    TEXT NOT NULL,
      token_hash    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending',
      api_key_id    TEXT,
      created_at    TEXT NOT NULL,
      expires_at    TEXT NOT NULL,
      claimed_at    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations (holder_email);
    CREATE INDEX IF NOT EXISTS idx_invitations_institution ON invitations (institution);
  `);

  // Administrators belong to a client organisation; NULL means a platform
  // administrator who spans every organisation. Added after the initial schema.
  const adminColumns = database.prepare('PRAGMA table_info(admin_users)').all();
  if (!adminColumns.some((column) => column.name === 'institution')) {
    database.exec('ALTER TABLE admin_users ADD COLUMN institution TEXT');
  }

  // The credential's index into the issuer's published status list, referenced
  // from the signed MSO (ISO/IEC 18013-5 `status` -> `status_list` -> `idx`).
  // Added after the initial schema, so existing databases need the column too.
  // SQLite UNIQUE permits repeated NULLs, so credentials issued before status
  // lists existed simply have no index and cannot be resolved that way.
  const credentialColumns = database.prepare('PRAGMA table_info(credentials)').all();
  if (!credentialColumns.some((column) => column.name === 'status_index')) {
    database.exec('ALTER TABLE credentials ADD COLUMN status_index INTEGER');
  }
  database.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_status_index ON credentials (status_index)',
  );
}

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Several service processes share this file; wait rather than failing fast.
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

/** SHA-256 hex of an opaque token (tokens are never stored in plaintext). */
export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Parse a TTL string such as "10m", "24h", "365d", "1y" (or a bare number of
 * milliseconds) into milliseconds.
 */
export function parseTtlMs(value) {
  const raw = String(value || '').trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|y)$/i);
  if (!match) throw new Error(`Unsupported TTL value: ${value}`);
  const n = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const factors = { ms: 1, s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 24 * 3600 * 1000, y: 365 * 24 * 3600 * 1000 };
  return Math.round(n * factors[unit]);
}

export const DB_PATH_INFO = DB_PATH;
