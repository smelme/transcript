import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { getDb, sha256Hex, parseTtlMs } from '../../db.js';

/**
 * WalletAccountService — invitation-based wallet account provisioning.
 *
 * The wallet account is auth-only: it stores the email (login handle), a stable
 * `sub` (issuer-created subject), and the links asserted by trusted institutes
 * `{ institution, studentId }`. It holds NO other PII.
 *
 * Trust flows one way: a trusted institute asserts "email <-> studentId" at
 * invitation time; the user only proves email ownership (OTP) to gain access.
 *
 * Accounts, links and refresh tokens are persisted in the shared database so
 * they survive restarts. Short-lived OTPs remain in memory only. Access tokens
 * are short-lived ES256 JWTs; refresh tokens are opaque values stored only as
 * a SHA-256 hash, rotated on every refresh, and revoked on sign-out or remote
 * deactivation/deletion.
 */

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '10m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '1y';

export class WalletAccountService {
  constructor({
    signerKeyPem,
    issuerId = 'issuer-001',
    issuerName,
    siteUrl,
    otpTtlMs = 10 * 60 * 1000,
    tokenTtl = ACCESS_TOKEN_TTL,
    refreshTtl = REFRESH_TOKEN_TTL,
    emailSender = null,
  } = {}) {
    this.issuerId = issuerId;
    this.issuerName = issuerName || issuerId;
    this.siteUrl = siteUrl;
    this.otpTtlMs = otpTtlMs;
    this.tokenTtl = tokenTtl;
    this.refreshTtlMs = parseTtlMs(refreshTtl);
    this.signerKeyPem = signerKeyPem;
    this.emailSender = emailSender;

    this.otps = new Map(); // email -> { code, expiresAt } (in-memory, short-lived)
    this.db = getDb();

    if (signerKeyPem) {
      const privateKey = crypto.createPrivateKey(signerKeyPem);
      this.publicSpkiPem = crypto
        .createPublicKey(privateKey)
        .export({ type: 'spki', format: 'pem' });
    }
  }

  _normalize(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) throw new Error('email is required');
    return normalized;
  }

  _genOtp() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  }

  // ── Account persistence helpers ──────────────────────────────────────────
  _accountByEmail(email) {
    return this.db.prepare('SELECT * FROM wallet_accounts WHERE email = ?').get(email) || null;
  }

  _accountBySub(sub) {
    return this.db.prepare('SELECT * FROM wallet_accounts WHERE sub = ?').get(sub) || null;
  }

  _linksFor(sub) {
    return this.db
      .prepare('SELECT institution, student_id FROM account_links WHERE sub = ? ORDER BY created_at')
      .all(sub)
      .map((row) => ({ institution: row.institution, studentId: row.student_id }));
  }

  _findOrCreateAccount(email) {
    const normalized = this._normalize(email);
    let account = this._accountByEmail(normalized);
    let created = false;
    if (!account) {
      const sub = uuidv4();
      this.db
        .prepare('INSERT INTO wallet_accounts (sub, email, email_verified, active, created_at) VALUES (?, ?, 0, 1, ?)')
        .run(sub, normalized, new Date().toISOString());
      account = this._accountByEmail(normalized);
      created = true;
    }
    return { account, created };
  }

  _addLink(sub, institution, studentId) {
    this.db
      .prepare('INSERT OR IGNORE INTO account_links (sub, institution, student_id, created_at) VALUES (?, ?, ?, ?)')
      .run(sub, institution, studentId, new Date().toISOString());
  }

  _revokeAllRefreshTokens(sub) {
    this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE sub = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), sub);
  }

  _issueRefreshToken(sub) {
    const raw = crypto.randomBytes(32).toString('base64url');
    const hash = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs).toISOString();
    this.db
      .prepare('INSERT INTO refresh_tokens (token_hash, sub, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(hash, sub, expiresAt, new Date().toISOString());
    return raw;
  }

  async _signAccessToken(account) {
    const privateKey = await importPKCS8(this.signerKeyPem, 'ES256');
    return new SignJWT({
      email: account.email,
      scope: 'credential_issuance',
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(account.sub)
      .setIssuer(this.issuerId)
      .setAudience(this.issuerId)
      .setIssuedAt()
      .setExpirationTime(this.tokenTtl)
      .sign(privateKey);
  }

  /**
   * Institute-initiated invitation. Idempotent: repeated invitations for the
   * same (email, studentId) do not duplicate the account or the link.
   */
  async invite({ email, studentId, institution }) {
    const { account, created } = this._findOrCreateAccount(email);
    const inst = String(institution || this.issuerId);
    const sid = String(studentId || '').trim();
    if (!sid) throw new Error('studentId is required');

    const linkExists = this._linksFor(account.sub).some(
      (l) => l.institution === inst && l.studentId === sid
    );
    if (!linkExists) this._addLink(account.sub, inst, sid);

    const otp = this._issueOtp(account.email);
    // For an invitation the recipient-facing institute name is what they should
    // recognise. `inst` may be a stable id rather than a display name, so fall
    // back to issuerName when institution is not supplied.
    const inviteInstitute = institution || this.issuerName;
    const sent = await this._sendOtpEmail(account.email, otp, 'invite', {
      institution: inviteInstitute,
      siteUrl: this.siteUrl,
    });
    return {
      success: true,
      sub: account.sub,
      email: account.email,
      accountCreated: created,
      linkAdded: !linkExists,
      institution: inst,
      studentId: sid,
      otpSent: sent.success,
      otp: sent.success ? undefined : otp, // dev fallback when email is not configured
    };
  }

  /**
   * Ensure a wallet account + institute link exist, without sending any email.
   * Used by the academy self-service flow, which sends its own email.
   */
  ensureAccountLink({ email, studentId, institution }) {
    const { account, created } = this._findOrCreateAccount(email);
    const inst = String(institution || this.issuerId);
    const sid = String(studentId || '').trim();
    if (!sid) throw new Error('studentId is required');
    const linkExists = this._linksFor(account.sub).some(
      (l) => l.institution === inst && l.studentId === sid
    );
    if (!linkExists) this._addLink(account.sub, inst, sid);
    return {
      sub: account.sub,
      email: account.email,
      accountCreated: created,
      linkAdded: !linkExists,
    };
  }

  /** All wallet accounts with their links (for the management portal). */
  listAccounts() {
    const rows = this.db
      .prepare('SELECT * FROM wallet_accounts ORDER BY created_at DESC')
      .all();
    return rows.map((account) => ({
      sub: account.sub,
      email: account.email,
      emailVerified: !!account.email_verified,
      active: !!account.active,
      deletedAt: account.deleted_at,
      createdAt: account.created_at,
      links: this._linksFor(account.sub),
      activeRefreshTokens: this.db
        .prepare('SELECT COUNT(*) AS c FROM refresh_tokens WHERE sub = ? AND revoked_at IS NULL')
        .get(account.sub).c,
    }));
  }

  _issueOtp(email) {
    const code = this._genOtp();
    this.otps.set(email, { code, expiresAt: Date.now() + this.otpTtlMs });
    return code;
  }

  // Best-effort email delivery. When no emailSender is configured (or delivery
  // fails), the OTP is returned in the response so the flow stays usable in dev.
  async _sendOtpEmail(email, otp, purpose, extra = {}) {
    if (!this.emailSender) return { success: false, reason: 'no email sender configured' };
    try {
      return await this.emailSender({ email, otp, purpose, ...extra });
    } catch (e) {
      console.error('[wallet-account] OTP email send failed:', e.message);
      return { success: false, error: e.message };
    }
  }

  /** Verify an email OTP (marks the account's email as verified). */
  verifyOtp({ email, otp }) {
    const normalized = this._normalize(email);
    const record = this.otps.get(normalized);
    if (!record) return { success: false, error: 'No OTP issued for this email' };
    if (Date.now() > record.expiresAt) {
      this.otps.delete(normalized);
      return { success: false, error: 'OTP expired' };
    }
    if (record.code !== String(otp || '')) {
      return { success: false, error: 'Invalid OTP' };
    }
    this.otps.delete(normalized);
    this.db.prepare('UPDATE wallet_accounts SET email_verified = 1 WHERE email = ?').run(normalized);
    return { success: true, email: normalized };
  }

  /** Wallet sign-in step 1: request a fresh OTP for an invited email. */
  async requestSignInOtp({ email }) {
    const normalized = this._normalize(email);
    const account = this._accountByEmail(normalized);
    if (!account) {
      throw new Error('No wallet account for this email — an institute must invite you first');
    }
    const otp = this._issueOtp(normalized);
    const sent = await this._sendOtpEmail(normalized, otp, 'signin');
    return { success: true, otpSent: sent.success, otp: sent.success ? undefined : otp };
  }

  /** Wallet sign-in step 2: exchange OTP for an access + refresh token pair. */
  async exchangeToken({ email, otp }) {
    const verified = this.verifyOtp({ email, otp });
    if (!verified.success) throw new Error(verified.error);
    const account = this._accountByEmail(verified.email);
    if (!account) throw new Error('No wallet account for this email');
    if (!account.active || account.deleted_at) throw new Error('Account is not active');
    if (!this.signerKeyPem) throw new Error('Signer key not configured');

    const accessToken = await this._signAccessToken(account);
    const refreshToken = this._issueRefreshToken(account.sub);

    return {
      success: true,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      sub: account.sub,
      email: account.email,
    };
  }

  /** Exchange a valid refresh token for a fresh access + refresh token pair. */
  async refresh({ refreshToken }) {
    if (!refreshToken) throw new Error('refreshToken is required');
    const hash = sha256Hex(refreshToken);
    const row = this.db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hash);
    if (!row || row.revoked_at) throw new Error('Refresh token is invalid');
    if (Date.now() > new Date(row.expires_at).getTime()) throw new Error('Refresh token expired');

    const account = this._accountBySub(row.sub);
    if (!account || !account.active || account.deleted_at) {
      this._revokeAllRefreshTokens(row.sub);
      throw new Error('Account is not active');
    }
    if (!this.signerKeyPem) throw new Error('Signer key not configured');

    // Rotate: revoke the presented refresh token and issue a fresh pair.
    this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?')
      .run(new Date().toISOString(), hash);

    const accessToken = await this._signAccessToken(account);
    const newRefreshToken = this._issueRefreshToken(account.sub);

    return {
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      sub: account.sub,
      email: account.email,
    };
  }

  /** Sign out: invalidate the presented refresh token. */
  signOut({ refreshToken }) {
    if (!refreshToken) throw new Error('refreshToken is required');
    const hash = sha256Hex(refreshToken);
    this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?')
      .run(new Date().toISOString(), hash);
    return { success: true };
  }

  /** Verify an access token and return its claims ({ sub, email, scope, ... }). */
  async verifyAccessToken(token) {
    if (!this.publicSpkiPem) throw new Error('Signer key not configured');
    const publicKey = await importSPKI(this.publicSpkiPem, 'ES256');
    const { payload } = await jwtVerify(String(token || ''), publicKey, {
      issuer: this.issuerId,
      audience: this.issuerId,
    });
    return payload;
  }

  /** All institute links for a wallet subject. */
  getLinks(sub) {
    return this._linksFor(sub);
  }

  /** True if this wallet subject is linked to (institution, studentId). */
  hasLink(sub, institution, studentId) {
    return this.getLinks(sub).some(
      (l) => l.institution === String(institution) && l.studentId === String(studentId)
    );
  }

  // ── Remote account administration ────────────────────────────────────────
  /** Remotely deactivate an account and invalidate every refresh token. */
  deactivateAccount(sub) {
    const result = this.db.prepare('UPDATE wallet_accounts SET active = 0 WHERE sub = ?').run(sub);
    if (result.changes === 0) throw new Error('Account not found');
    this._revokeAllRefreshTokens(sub);
    return { success: true, sub, active: false };
  }

  /** Reactivate an account (does not restore previously revoked refresh tokens). */
  activateAccount(sub) {
    const result = this.db.prepare('UPDATE wallet_accounts SET active = 1 WHERE sub = ?').run(sub);
    if (result.changes === 0) throw new Error('Account not found');
    return { success: true, sub, active: true };
  }

  /** Soft-delete an account and invalidate every refresh token. */
  deleteAccount(sub) {
    const result = this.db
      .prepare('UPDATE wallet_accounts SET active = 0, deleted_at = ? WHERE sub = ?')
      .run(new Date().toISOString(), sub);
    if (result.changes === 0) throw new Error('Account not found');
    this._revokeAllRefreshTokens(sub);
    return { success: true, sub, deleted: true };
  }
}

export default WalletAccountService;
