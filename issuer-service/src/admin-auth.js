import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { getDb } from '../../db.js';

/**
 * Administrator authentication for the Quals management portal.
 *
 * Admins are separate from wallet holders: they have an email + password, and
 * sign in to the portal. A successful sign-in returns a short-lived ES256 JWT
 * with `scope: "admin"` and a distinct audience, so a wallet access token can
 * never be replayed as an admin token (and vice versa).
 *
 * `session_version` is embedded in the token and bumped on sign-out, so signing
 * out genuinely invalidates every token previously issued to that admin.
 */

const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '8h';
const MIN_PASSWORD_LENGTH = parseInt(process.env.ADMIN_MIN_PASSWORD_LENGTH || '10', 10);

const scrypt = (password, salt, length) =>
  new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, length, (err, derived) => (err ? reject(err) : resolve(derived)));
  });

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scrypt(password, salt, expected.length);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export class AdminAuthService {
  constructor({ signerKeyPem, issuerId = 'issuer-001' } = {}) {
    this.issuerId = issuerId;
    this.signerKeyPem = signerKeyPem;
    this.audience = `${issuerId}#admin`;
    this.db = getDb();

    if (signerKeyPem) {
      const privateKey = crypto.createPrivateKey(signerKeyPem);
      this.publicSpkiPem = crypto
        .createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' });
    }
  }

  _row(email) {
    return this.db
      .prepare('SELECT * FROM admin_users WHERE email = ?')
      .get(String(email || '').trim().toLowerCase()) || null;
  }

  _byId(id) {
    return this.db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) || null;
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  }

  /**
   * Create the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD.
   *
   * In development, if those are not set, a default account is created so the
   * portal is usable out of the box (and the credentials are logged). In
   * production nothing is created unless both variables are supplied.
   */
  async ensureSeedAdmin() {
    if (this.count() > 0) return null;

    let email = process.env.ADMIN_EMAIL;
    let password = process.env.ADMIN_PASSWORD;
    let generated = false;

    if (!email || !password) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[admin-auth] No administrator exists. Set ADMIN_EMAIL and ADMIN_PASSWORD to create one.',
        );
        return null;
      }
      email = email || 'admin@quals.local';
      password = password || crypto.randomBytes(9).toString('base64url');
      generated = true;
    }

    const admin = await this.createAdmin({ email, password, role: 'owner' });
    if (generated) {
      console.warn(`[admin-auth] Created development administrator ${email} with password: ${password}`);
      console.warn('[admin-auth] Set ADMIN_EMAIL and ADMIN_PASSWORD to control these credentials.');
    } else {
      console.log(`[admin-auth] Created administrator ${email} from ADMIN_EMAIL.`);
    }
    return admin;
  }

  async createAdmin({ email, password, role = 'admin' }) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      throw new Error('A valid email address is required');
    }
    if (String(password || '').length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (this._row(normalized)) throw new Error('An administrator with that email already exists');

    const id = uuidv4();
    const passwordHash = await hashPassword(String(password));
    this.db
      .prepare(
        'INSERT INTO admin_users (id, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      )
      .run(id, normalized, passwordHash, String(role || 'admin'), new Date().toISOString());
    return this._public(this._byId(id));
  }

  _public(row) {
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      active: !!row.active,
      createdAt: row.created_at,
    };
  }

  listAdmins() {
    return this.db
      .prepare('SELECT * FROM admin_users ORDER BY created_at')
      .all()
      .map((row) => this._public(row));
  }

  setActive(id, active) {
    const result = this.db
      .prepare('UPDATE admin_users SET active = ?, session_version = session_version + 1 WHERE id = ?')
      .run(active ? 1 : 0, id);
    if (result.changes === 0) throw new Error('Administrator not found');
    return this._public(this._byId(id));
  }

  async _signToken(row) {
    const privateKey = await importPKCS8(this.signerKeyPem, 'ES256');
    return new SignJWT({ scope: 'admin', role: row.role, sv: row.session_version })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(row.id)
      .setIssuer(this.issuerId)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(ADMIN_TOKEN_TTL)
      .sign(privateKey);
  }

  /** Verify an admin email + password and return a portal session token. */
  async login({ email, password }) {
    const row = this._row(email);
    // Always run a hash comparison so a missing account is not distinguishable
    // from a wrong password by response timing.
    const ok = row
      ? await verifyPassword(String(password || ''), row.password_hash)
      : await verifyPassword(String(password || ''), 'scrypt$AAAA$AAAA');
    if (!row || !ok) throw new Error('Incorrect email or password');
    if (!row.active) throw new Error('This administrator account is disabled');
    if (!this.signerKeyPem) throw new Error('Signer key not configured');

    const token = await this._signToken(row);
    return { success: true, token, admin: this._public(row) };
  }

  /**
   * Verify an admin token and confirm the account is still active and its
   * session has not been invalidated.
   */
  async verifyAdminToken(token) {
    if (!this.publicSpkiPem) throw new Error('Signer key not configured');
    const publicKey = await importSPKI(this.publicSpkiPem, 'ES256');
    const { payload } = await jwtVerify(String(token || ''), publicKey, {
      issuer: this.issuerId,
      audience: this.audience,
    });
    if (payload.scope !== 'admin') throw new Error('Not an administrator token');

    const row = this._byId(payload.sub);
    if (!row || !row.active) throw new Error('Administrator account is not active');
    if (Number(payload.sv) !== Number(row.session_version)) {
      throw new Error('This session has been signed out');
    }
    return this._public(row);
  }

  /** Sign out: bump the session version so every existing token is rejected. */
  signOut(id) {
    const row = this._byId(id);
    if (!row) throw new Error('Administrator not found');
    this.db
      .prepare('UPDATE admin_users SET session_version = session_version + 1 WHERE id = ?')
      .run(id);
    return { success: true };
  }

  async changePassword(id, newPassword) {
    if (String(newPassword || '').length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const hash = await hashPassword(String(newPassword));
    const result = this.db
      .prepare(
        'UPDATE admin_users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?',
      )
      .run(hash, id);
    if (result.changes === 0) throw new Error('Administrator not found');
    return { success: true };
  }
}

export default AdminAuthService;
