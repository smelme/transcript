import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderSharePdf } from './pdf.js';

/**
 * Selective-disclosure "share" flow for recipients that cannot integrate with
 * the W3C Digital Credentials API (DCAPI).
 *
 * Flow:
 *   1. Wallet POSTs /shares with its access token, the credentialId, the
 *      disclosure categories, and recipient details. The issuer verifies the
 *      token, checks ownership (account must be linked to the credential's
 *      institution + studentId), and asks the verifier service to mint a
 *      one-time DCAPI request for exactly the selected namespaces.
 *   2. Wallet envelopes the selectively-disclosed mdoc exactly as it does for
 *      DCAPI (HPKE-encrypted DeviceResponse) and POSTs it to /shares/:id/response.
 *   3. The issuer forwards that envelope to the verifier service. If it
 *      verifies, the disclosed claims are stored with a TTL and the recipient
 *      is emailed a link.
 *   4. The recipient signs in with the emailed address + OTP, accepts terms,
 *      views the shared fields and may download a PDF. Views/downloads notify
 *      the sender. Expired shares are deleted.
 */

const SHARE_CATEGORIES = {
  personal: {
    label: 'Personal information',
    nameSpaces: {
      'org.iso.23220.photoid.1': ['given_name', 'family_name', 'birth_date'],
    },
  },
  qualification: {
    label: 'Qualification information',
    nameSpaces: {
      'org.iso.23220.education.qualification.1': [
        'institution_name',
        'degree_level',
        'field_of_study',
        'graduation_date',
        'gpa',
      ],
    },
  },
  transcript: {
    label: 'Transcript information',
    nameSpaces: {
      'org.iso.23220.education.transcript.1': [
        'student_id',
        'courses',
        'total_credits',
        'status',
      ],
    },
  },
};

const DEFAULT_TTL_DAYS = parseInt(process.env.SHARE_TTL_DAYS || '30', 10);
const OTP_TTL_MS = 10 * 60 * 1000;

export class ShareService {
  constructor({
    issuerService,
    walletAccounts,
    verifierApiUrl = process.env.VERIFIER_API_URL || 'http://localhost:3001',
    siteUrl = process.env.ISSUER_FRONTEND_URL || process.env.ISSUER_BASE_URL || 'http://localhost:3002',
    origin = siteUrl,
    dataDir = process.env.SHARE_DATA_DIR
      || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data'),
    ttlDays = DEFAULT_TTL_DAYS,
    emailSender = null,
  } = {}) {
    this.issuer = issuerService;
    this.walletAccounts = walletAccounts;
    this.verifierApiUrl = verifierApiUrl;
    this.siteUrl = siteUrl;
    this.origin = origin;
    this.ttlMs = ttlDays * 24 * 60 * 60 * 1000;
    this.emailSender = emailSender;

    this.dataFile = path.join(dataDir, 'shares.json');
    this.shares = new Map();
    this.load();
    this.sweepTimer = setInterval(() => this.pruneExpired(), 60 * 60 * 1000);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  // ── Persistence ──────────────────────────────────────────────────────────
  load() {
    try {
      if (!fs.existsSync(this.dataFile)) return;
      const parsed = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      for (const share of parsed.shares || []) {
        if (Date.now() <= new Date(share.expiresAt).getTime()) {
          this.shares.set(share.shareId, share);
        }
      }
    } catch (e) {
      console.error('[share] failed to load persisted shares:', e.message);
    }
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
      const payload = { shares: Array.from(this.shares.values()) };
      fs.writeFileSync(this.dataFile, JSON.stringify(payload, null, 2));
    } catch (e) {
      console.error('[share] failed to persist shares:', e.message);
    }
  }

  pruneExpired() {
    const now = Date.now();
    let changed = false;
    for (const [id, share] of this.shares) {
      if (now > new Date(share.expiresAt).getTime()) {
        this.shares.delete(id);
        this.issuer.auditLog.push({
          timestamp: new Date().toISOString(),
          action: 'share_expired',
          shareId: id,
          details: { recipientEmail: share.recipientEmail },
        });
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  audit(action, share, details = {}) {
    this.issuer.auditLog.push({
      timestamp: new Date().toISOString(),
      action,
      shareId: share.shareId,
      credentialId: share.credentialId,
      details: { recipientEmail: share.recipientEmail, ...details },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  async verifierCreateSession(nameSpaces, credentialId = null) {
    const response = await fetch(`${this.verifierApiUrl}/presentation/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        relyingPartyId: 'smart-college-share',
        origin: this.origin,
        nameSpaces,
        docType: 'org.iso.23220.photoid.1',
        credentialId,
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.success) {
      throw new Error(body.error || `Verifier session creation failed (${response.status})`);
    }
    return body;
  }

  async verifierVerify(sessionId, credential) {
    const response = await fetch(
      `${this.verifierApiUrl}/presentation/sessions/${encodeURIComponent(sessionId)}/response`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          relyingPartyId: 'smart-college-share',
          origin: this.origin,
          credential,
        }),
      },
    );
    const body = await response.json();
    if (!response.ok || !body.success) {
      throw new Error(body.error || `Verifier rejected the shared credential (${response.status})`);
    }
    return body;
  }

  genOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  // ── API ──────────────────────────────────────────────────────────────────
  /**
   * Step 1 — wallet asks to share a credential.
   * @returns {{ success, shareId, deviceRequest, encryptionInfo, origin }}
   */
  async create({ accessToken, credentialId, categories = [], recipientName, recipientEmail, message = '' }) {
    if (!accessToken) throw new Error('accessToken is required');
    if (!credentialId) throw new Error('credentialId is required');
    if (!recipientName || !recipientEmail) throw new Error('recipientName and recipientEmail are required');

    const payload = await this.walletAccounts.verifyAccessToken(accessToken);

    // Ownership: the credential must exist (persisted in the issuer registry)
    // and the sender's account must be linked to its institution + studentId.
    // The verifier additionally rejects revoked/missing credentials during
    // verification (defense in depth).
    const credential = this.issuer.getCredential(credentialId);
    if (!credential.success) throw new Error(credential.error || 'Credential not found');
    if (!this.walletAccounts.hasLink(
      payload.sub,
      credential.credential.institution,
      credential.credential.studentId,
    )) {
      throw new Error('You are not the owner of this credential');
    }

    const selected = [...new Set(categories)].filter((c) => SHARE_CATEGORIES[c]);
    if (selected.length === 0) throw new Error('Select at least one category to share');

    const nameSpaces = {};
    for (const cat of selected) {
      for (const [ns, fields] of Object.entries(SHARE_CATEGORIES[cat].nameSpaces)) {
        nameSpaces[ns] = Array.from(new Set([...(nameSpaces[ns] || []), ...fields]));
      }
    }

    // Mint a one-time verifier request for exactly these namespaces. The
    // credentialId lets the verifier enforce the credential's lifecycle state.
    const verifierSession = await this.verifierCreateSession(nameSpaces, credentialId);
    const data = verifierSession.request.digital.requests[0].data;

    const shareId = uuidv4();
    const now = new Date();
    const share = {
      shareId,
      credentialId,
      senderEmail: payload.email || null,
      senderSub: payload.sub,
      recipientName: String(recipientName).trim(),
      recipientEmail: String(recipientEmail).trim().toLowerCase(),
      message: String(message || '').slice(0, 2000),
      categories: selected,
      status: 'pending',
      verifierSessionId: verifierSession.sessionId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.ttlMs).toISOString(),
      recipientVerified: false,
      termsAccepted: false,
      otp: null,
      otpExpiresAt: null,
      recipientToken: null,
      viewedAt: null,
      downloadedAt: null,
      claims: null,
    };

    this.shares.set(shareId, share);
    this.persist();
    this.audit('share_created', share, { categories: selected });

    return {
      success: true,
      shareId,
      status: 'pending',
      deviceRequest: data.deviceRequest,
      encryptionInfo: data.encryptionInfo,
      origin: this.origin,
    };
  }

  /**
   * Step 2 — wallet returns the encrypted, selectively-disclosed DeviceResponse.
   */
  async submit({ shareId, accessToken, credential }) {
    const share = this.shares.get(shareId);
    if (!share) throw new Error('Share not found or expired');
    if (share.status === 'shared') throw new Error('Share already completed');
    if (Date.now() > new Date(share.expiresAt).getTime()) {
      this.shares.delete(shareId);
      this.persist();
      throw new Error('Share expired');
    }
    if (!accessToken) throw new Error('accessToken is required');
    const payload = await this.walletAccounts.verifyAccessToken(accessToken);
    if (payload.sub !== share.senderSub) throw new Error('Only the sender may complete this share');

    // Forward the DCAPI envelope to the verifier service.
    const verified = await this.verifierVerify(share.verifierSessionId, credential);

    share.status = 'shared';
    share.claims = verified.allClaims || verified.claims || {};
    this.persist();
    this.audit('share_submitted', share);

    await this._notifyRecipient(share);
    return { success: true, shareId, status: 'shared' };
  }

  async _notifyRecipient(share) {
    if (!this.emailSender) return;
    const link = `${this.siteUrl}/share/${share.shareId}`;
    try {
      await this.emailSender({
        to: share.recipientEmail,
        subject: `${share.recipientName}, ${share.senderEmail || 'someone'} has shared documents with you`,
        html: renderRecipientHtml(share, link),
      });
    } catch (e) {
      console.error('[share] recipient email failed:', e.message);
    }
  }

  async _notifySender(share, event) {
    if (!this.emailSender || !share.senderEmail) return;
    try {
      await this.emailSender({
        to: share.senderEmail,
        subject: event === 'viewed'
          ? `Your shared documents were viewed by ${share.recipientName}`
          : `Your shared documents were downloaded by ${share.recipientName}`,
        html: renderSenderHtml(share, event),
      });
    } catch (e) {
      console.error('[share] sender notification failed:', e.message);
    }
  }

  // ── Recipient access ─────────────────────────────────────────────────────
  /** Recipient requests a one-time code to open the share. */
  async requestOtp({ shareId, email }) {
    const share = this.shares.get(shareId);
    if (!share) throw new Error('Share not found or expired');
    if (Date.now() > new Date(share.expiresAt).getTime()) {
      this.shares.delete(shareId);
      this.persist();
      throw new Error('Share expired');
    }
    if (String(email || '').trim().toLowerCase() !== share.recipientEmail) {
      throw new Error('This share was sent to a different email address');
    }
    const otp = this.genOtp();
    share.otp = otp;
    share.otpExpiresAt = Date.now() + OTP_TTL_MS;
    this.persist();

    let otpSent = false;
    if (this.emailSender) {
      try {
        const sent = await this.emailSender({
          to: share.recipientEmail,
          subject: 'Your share access code',
          html: renderOtpHtml(share, otp),
        });
        otpSent = !!(sent && sent.success);
      } catch (e) {
        console.error('[share] OTP email failed:', e.message);
      }
    }
    return { success: true, otpSent, otp: otpSent ? undefined : otp };
  }

  verifyOtp({ shareId, email, otp }) {
    const share = this.shares.get(shareId);
    if (!share) throw new Error('Share not found or expired');
    if (String(email || '').trim().toLowerCase() !== share.recipientEmail) {
      throw new Error('This share was sent to a different email address');
    }
    if (!share.otp || Date.now() > share.otpExpiresAt) throw new Error('No OTP issued or OTP expired');
    if (String(otp) !== share.otp) throw new Error('Invalid OTP');
    share.otp = null;
    share.otpExpiresAt = null;
    share.recipientVerified = true;
    share.recipientToken = uuidv4();
    this.persist();
    this.audit('share_recipient_signed_in', share);
    return { success: true, recipientToken: share.recipientToken };
  }

  acceptTerms({ shareId, recipientToken }) {
    const share = this._requireRecipientAccess(shareId, recipientToken);
    share.termsAccepted = true;
    this.persist();
    this.audit('share_terms_accepted', share);
    return { success: true };
  }

  /** Recipient views the shared claims. Marks first-view and notifies sender. */
  view({ shareId, recipientToken }) {
    const share = this._requireRecipientAccess(shareId, recipientToken);
    if (!share.termsAccepted) throw new Error('Terms must be accepted before viewing');
    if (!share.viewedAt) {
      share.viewedAt = new Date().toISOString();
      this.persist();
      this.audit('share_viewed', share);
      this._notifySender(share, 'viewed').catch((e) => console.error(e.message));
    }
    return {
      success: true,
      shareId: share.shareId,
      senderEmail: share.senderEmail,
      recipientName: share.recipientName,
      message: share.message,
      categories: share.categories.map((c) => SHARE_CATEGORIES[c]?.label || c),
      claims: share.claims || {},
      sharedAt: share.createdAt,
      expiresAt: share.expiresAt,
    };
  }

  /** Recipient downloads a PDF of the shared claims. */
  pdf({ shareId, recipientToken }) {
    const share = this._requireRecipientAccess(shareId, recipientToken);
    if (!share.termsAccepted) throw new Error('Terms must be accepted before downloading');
    const rows = Object.entries(share.claims || {}).map(([k, v]) => {
      const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return [k, value];
    });
    const pdf = renderSharePdf({
      title: 'Shared credential information',
      subtitle: `Shared by ${share.senderEmail || 'a verified holder'} with ${share.recipientName}`,
      rows: rows.length ? rows : [['Message', 'No fields disclosed']],
      footer: `Share ID ${share.shareId} · Generated ${new Date().toISOString()}`,
    });
    if (!share.downloadedAt) {
      share.downloadedAt = new Date().toISOString();
      this.persist();
      this.audit('share_downloaded', share);
      this._notifySender(share, 'downloaded').catch((e) => console.error(e.message));
    }
    return { success: true, pdf, filename: `shared-${share.shareId}.pdf` };
  }

  list() {
    this.pruneExpired();
    return Array.from(this.shares.values()).map((s) => ({
      shareId: s.shareId,
      credentialId: s.credentialId,
      senderEmail: s.senderEmail,
      recipientEmail: s.recipientEmail,
      recipientName: s.recipientName,
      status: s.status,
      categories: s.categories,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      viewedAt: s.viewedAt,
      downloadedAt: s.downloadedAt,
    }));
  }

  _requireRecipientAccess(shareId, recipientToken) {
    const share = this.shares.get(shareId);
    if (!share) throw new Error('Share not found or expired');
    if (Date.now() > new Date(share.expiresAt).getTime()) {
      this.shares.delete(shareId);
      this.persist();
      throw new Error('Share expired');
    }
    if (!share.recipientVerified || share.recipientToken !== recipientToken) {
      throw new Error('Please sign in with the invited email address first');
    }
    return share;
  }
}

export default ShareService;

// ── Email templates ────────────────────────────────────────────────────────
function renderRecipientHtml(share, link) {
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:#14161c;color:#fff;padding:24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:20px">${share.recipientName}, you've been sent documents</h1>
  </div>
  <div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 12px 12px">
    <p><strong>${share.senderEmail || 'Someone'}</strong> has shared documents with you.</p>
    ${share.message ? `<blockquote style="border-left:4px solid #0a58ca;margin:16px 0;padding-left:14px;color:#555">${escapeHtml(share.message)}</blockquote>` : ''}
    <p>Please use the link below to view the documents that were shared with you:</p>
    <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#14161c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px">View shared documents</a></p>
    <p style="color:#666;font-size:13px">Or open: ${link}</p>
  </div>
</body></html>`;
}

function renderOtpHtml(share, otp) {
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:#14161c;color:#fff;padding:24px;border-radius:12px 12px 0 0">
    <h1 style="margin:0;font-size:20px">Your share access code</h1>
  </div>
  <div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 12px 12px">
    <p>Use this code to open the documents shared with you:</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:4px;color:#0a58ca">${otp}</p>
    <p style="color:#666;font-size:13px">This code expires in 10 minutes.</p>
  </div>
</body></html>`;
}

function renderSenderHtml(share, event) {
  const verb = event === 'viewed' ? 'viewed' : 'downloaded';
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="border:1px solid #e5e5e5;padding:24px;border-radius:12px">
    <p><strong>${share.recipientName}</strong> (${share.recipientEmail}) ${verb} the documents you shared.</p>
    <p style="color:#666;font-size:13px">Share ID: ${share.shareId}</p>
  </div>
</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
