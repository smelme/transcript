import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';

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
 * In this development build, OTPs are returned in the response for testing; a
 * production deployment must send them via email/SMS instead.
 */
export class WalletAccountService {
  constructor({
    signerKeyPem,
    issuerId = 'issuer-001',
    issuerName,
    siteUrl,
    otpTtlMs = 10 * 60 * 1000,
    tokenTtl = '10m',
    emailSender = null,
  } = {}) {
    this.issuerId = issuerId;
    this.issuerName = issuerName || issuerId;
    this.siteUrl = siteUrl;
    this.otpTtlMs = otpTtlMs;
    this.tokenTtl = tokenTtl;
    this.signerKeyPem = signerKeyPem;
    this.emailSender = emailSender;

    this.accounts = new Map(); // email -> account
    this.subIndex = new Map(); // sub -> email
    this.otps = new Map();     // email -> { code, expiresAt }

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

  _findOrCreateAccount(email) {
    const normalized = this._normalize(email);
    let account = this.accounts.get(normalized);
    let created = false;
    if (!account) {
      account = {
        sub: uuidv4(),
        email: normalized,
        emailVerified: false,
        links: [], // { institution, studentId }
        createdAt: new Date().toISOString(),
      };
      this.accounts.set(normalized, account);
      this.subIndex.set(account.sub, normalized);
      created = true;
    }
    return { account, created };
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

    const linkExists = account.links.some(
      (l) => l.institution === inst && l.studentId === sid
    );
    if (!linkExists) account.links.push({ institution: inst, studentId: sid });

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
    const account = this.accounts.get(normalized);
    if (account) account.emailVerified = true;
    return { success: true, email: normalized };
  }

  /** Wallet sign-in step 1: request a fresh OTP for an invited email. */
  async requestSignInOtp({ email }) {
    const normalized = this._normalize(email);
    const account = this.accounts.get(normalized);
    if (!account) {
      throw new Error('No wallet account for this email — an institute must invite you first');
    }
    const otp = this._issueOtp(normalized);
    const sent = await this._sendOtpEmail(normalized, otp, 'signin');
    return { success: true, otpSent: sent.success, otp: sent.success ? undefined : otp };
  }

  /** Wallet sign-in step 2: exchange OTP for an access token (ES256 JWT). */
  async exchangeToken({ email, otp }) {
    const verified = this.verifyOtp({ email, otp });
    if (!verified.success) throw new Error(verified.error);
    const account = this.accounts.get(verified.email);
    if (!account) throw new Error('No wallet account for this email');
    if (!this.signerKeyPem) throw new Error('Signer key not configured');

    const privateKey = await importPKCS8(this.signerKeyPem, 'ES256');
    const accessToken = await new SignJWT({
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

    return { success: true, accessToken, tokenType: 'Bearer', sub: account.sub };
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
    const email = this.subIndex.get(sub);
    const account = email && this.accounts.get(email);
    return account ? account.links : [];
  }

  /** True if this wallet subject is linked to (institution, studentId). */
  hasLink(sub, institution, studentId) {
    return this.getLinks(sub).some(
      (l) => l.institution === String(institution) && l.studentId === String(studentId)
    );
  }
}

export default WalletAccountService;
