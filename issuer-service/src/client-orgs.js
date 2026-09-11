/**
 * Client organisations and their API keys.
 *
 * A client organisation (an example academy, a university, ...) issues
 * credentials through this service using an API key, and an administrator scoped
 * to that organisation can see and revoke exactly those credentials. The
 * `institution` string is the scope key: every credential already carries one,
 * so credentials issued before organisations existed stay visible to the
 * organisation that owns them.
 *
 * Only the SHA-256 of a key is stored. The key itself is returned once, at
 * creation, so a database read cannot yield a usable credential.
 */
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb, sha256Hex } from '../../db.js';

/** Prefix so a leaked key is recognisable (and greppable) in logs and scanners. */
const KEY_PREFIX = 'quals_';
const PREFIX_DISPLAY_CHARS = KEY_PREFIX.length + 8;

export class ClientOrgService {
  constructor({ db = getDb() } = {}) {
    this.db = db;
  }

  /** Register an organisation if it is new; returns the normalised institution. */
  ensureOrg(institution, name = null) {
    const trimmed = String(institution || '').trim();
    if (!trimmed) throw new Error('institution is required');
    this.db
      .prepare(
        `INSERT INTO client_orgs (institution, name, created_at) VALUES (?, ?, ?)
         ON CONFLICT(institution) DO NOTHING`,
      )
      .run(trimmed, String(name || trimmed).trim(), new Date().toISOString());
    return trimmed;
  }

  listOrgs() {
    return this.db
      .prepare('SELECT institution, name, created_at FROM client_orgs ORDER BY name')
      .all()
      .map((row) => ({ institution: row.institution, name: row.name, createdAt: row.created_at }));
  }

  /**
   * Mint an API key for an organisation. The returned `key` is the only time the
   * secret is available; afterwards only its prefix and metadata can be shown.
   */
  createApiKey({ institution, name = null }) {
    const org = this.ensureOrg(institution);
    const key = `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const keyId = uuidv4();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO api_keys (key_id, institution, name, key_hash, key_prefix, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(keyId, org, name ? String(name).trim() : null, sha256Hex(key), key.slice(0, PREFIX_DISPLAY_CHARS), createdAt);

    return { success: true, keyId, key, institution: org, name, createdAt };
  }

  /** Key metadata, newest first. Pass an institution to scope to one org. */
  listApiKeys(institution = null) {
    const rows = institution
      ? this.db
          .prepare('SELECT * FROM api_keys WHERE institution = ? ORDER BY created_at DESC')
          .all(institution)
      : this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();

    return rows.map((row) => ({
      keyId: row.key_id,
      institution: row.institution,
      name: row.name,
      prefix: `${row.key_prefix}…`,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      active: !row.revoked_at,
    }));
  }

  /** Revoke a key. Revoking is idempotent-safe and keeps the row for the audit trail. */
  revokeApiKey(keyId, institution = null) {
    const row = this.db.prepare('SELECT key_id, institution, revoked_at FROM api_keys WHERE key_id = ?').get(keyId);
    if (!row) return { success: false, error: 'API key not found' };
    if (institution && row.institution !== institution) {
      return { success: false, error: 'API key belongs to another organisation' };
    }
    if (row.revoked_at) return { success: false, error: 'API key already revoked' };

    this.db.prepare('UPDATE api_keys SET revoked_at = ? WHERE key_id = ?').run(new Date().toISOString(), keyId);
    return { success: true, keyId };
  }

  /** Resolve a presented API key to its organisation, or null when unusable. */
  authenticate(key) {
    const presented = String(key || '').trim();
    if (!presented) return null;

    const row = this.db
      .prepare('SELECT key_id, institution, revoked_at FROM api_keys WHERE key_hash = ?')
      .get(sha256Hex(presented));
    if (!row || row.revoked_at) return null;

    this.db
      .prepare('UPDATE api_keys SET last_used_at = ? WHERE key_id = ?')
      .run(new Date().toISOString(), row.key_id);
    return { keyId: row.key_id, institution: row.institution };
  }
}

export default ClientOrgService;
