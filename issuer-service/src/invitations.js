/**
 * Institution publishing: the credentials an institution wants issued, held until the holder
 * collects them.
 *
 * The institution's own systems send the claims, authenticated with an API key that decides which
 * institution is publishing, so a caller cannot issue under another institution's name. The issuer
 * stores exactly what it was sent: it no longer invents a record, which was the demo behaviour and
 * the wrong shape for a registry integration.
 *
 * An invitation is a holder-facing thing, not a credential: it holds one or more prepared issuance
 * sessions, a link the holder can open, and an expiry. Nothing is issued by publishing; issuing
 * still happens when the holder claims, which is why a published credential that nobody collects
 * simply expires.
 *
 * The link carries an opaque token, stored only as a hash, because it arrives in an email and a
 * database read must not yield a usable one. The token identifies the invitation and everything
 * that follows still requires the holder to prove they control the address the institution named.
 */

import crypto from 'crypto';
import { getDb, sha256Hex } from '../../db.js';
import { credentialDataFromClaims } from './credential-generator.js';

/** How long an unclaimed published credential is kept. Matches the share TTL: one rule, two kinds. */
export const DEFAULT_INVITATION_TTL_DAYS = 30;

/** ISO 18013-5 namespaces this system issues into, used to tell one kind of item from another. */
const QUALIFICATION_NAMESPACE = 'org.iso.23220.education.qualification.1';
const TRANSCRIPT_NAMESPACE = 'org.iso.23220.education.transcript.1';

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

/** The same id rule the academy has always used, so repeat publications map to one person. */
function studentIdFor(email) {
  return `SA-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 8).toUpperCase()}`;
}

/** Modules travel as a JSON string claim, in this system and in older ones. */
function parseCourses(value) {
  if (Array.isArray(value)) {return value;}
  if (typeof value !== 'string' || value.trim() === '') {return [];}
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * What the holder is shown in a list, derived from the claims rather than asked for. A caller gives
 * the credential; describing it is our job, and a caller that has to describe its own credential
 * can describe it wrongly.
 */
export function displayFor(claims) {
  const qualification = claims?.[QUALIFICATION_NAMESPACE] || {};
  const transcript = claims?.[TRANSCRIPT_NAMESPACE] || {};
  const courses = parseCourses(transcript.courses);
  const level = qualification.degreeLevel || qualification.degree_level || null;
  const programme = qualification.programmeTitle || qualification.programme_title || null;
  const field = qualification.fieldOfStudy || qualification.field_of_study || null;
  const graduation = qualification.graduationDate || qualification.graduation_date || null;
  const institution = qualification.institutionName || qualification.institution_name || null;

  return {
    title: programme || field || (level ? `${level} qualification` : 'Academic credential'),
    programme,
    degreeLevel: level,
    fieldOfStudy: field,
    graduationDate: graduation,
    institution,
    totalCredits: transcript.totalCredits ?? transcript.total_credits ?? null,
    courseCount: courses.length || null,
  };
}

/** Which of this system's two kinds an item is, decided by the namespaces it carries. */
export function kindFor(claims) {
  const hasQualification = Boolean(claims?.[QUALIFICATION_NAMESPACE]);
  const hasTranscript = Boolean(claims?.[TRANSCRIPT_NAMESPACE]);
  if (hasQualification && hasTranscript) {return 'degree';}
  if (hasTranscript) {return 'transcript';}
  if (hasQualification) {return 'certification';}
  throw new Error('A published credential must carry a qualification or a transcript namespace');
}

export const KIND_LABELS = {
  degree: 'Qualification and transcript',
  transcript: 'Academic transcript',
  certification: 'Academic qualification',
};

export class InvitationService {
  /**
   * @param {object} deps
   * @param {object} deps.issuer the IssuerService, for the issuance sessions it already owns
   * @param {object} deps.walletAccounts for the holder's account and institute links
   * @param {(args: object) => Promise<object>} deps.emailSender the credentials-ready email
   * @param {string} deps.siteUrl where the issuing page lives, which is the Quals site
   */
  constructor({ issuer, walletAccounts, emailSender, siteUrl, ttlDays }) {
    this.issuer = issuer;
    this.walletAccounts = walletAccounts;
    this.emailSender = emailSender ? (args) => emailSender(args) : null;
    this.siteUrl = (siteUrl || 'http://localhost:3005').replace(/\/$/, '');
    this.ttlDays =
      ttlDays ||
      Number(process.env.INVITATION_TTL_DAYS) ||
      DEFAULT_INVITATION_TTL_DAYS;
  }

  get enabled() {
    return this.issuer && this.walletAccounts;
  }

  _row(invitationId) {
    return getDb().prepare('SELECT * FROM invitations WHERE invitation_id = ?').get(invitationId);
  }

  /**
   * Publish one or more credentials for one holder.
   *
   * @param {object} input
   * @param {string} input.institution the publishing institution, taken from the API key
   * @param {string} [input.apiKeyId] which key published it, for the audit trail
   * @param {string} input.holderEmail the address the institution holds for the person
   * @param {string} [input.holderName]
   * @param {string} [input.studentId] the institution's own identifier for them
   * @param {Array<{claims: object}>} input.credentials claims keyed by ISO namespace
   * @returns {Promise<object>} the invitation, its link and what it holds
   */
  async create({ institution, apiKeyId = null, holderEmail, holderName, studentId, credentials }) {
    const email = String(holderEmail || '').trim().toLowerCase();
    if (!isEmail(email)) {throw new Error('A valid holder email address is required');}
    if (!institution) {throw new Error('An institution is required');}
    if (!Array.isArray(credentials) || credentials.length === 0) {
      throw new Error('At least one credential is required');
    }

    const resolvedStudentId = String(studentId || '').trim() || studentIdFor(email);
    // The holder's account and link to this institution exist before anything is published, so a
    // published credential is claimable the moment they sign in.
    const { sub } = this.walletAccounts.ensureAccountLink({
      email,
      studentId: resolvedStudentId,
      institution,
    });

    const sessions = credentials.map((item) => {
      const claims = item?.claims;
      if (!claims || typeof claims !== 'object') {
        throw new Error('Each credential must carry claims keyed by namespace');
      }
      const kind = kindFor(claims);
      const display = { ...displayFor(claims), institution: displayFor(claims).institution || institution };
      return {
        kind,
        label: KIND_LABELS[kind],
        display,
        session: this.issuer.createIssuanceSession({
          studentId: resolvedStudentId,
          institution,
          // Stored in the shape the document builder reads. Published claims arrive keyed by
          // namespace and the builder reads fields, so without this conversion the credential
          // would be stored, offered, and then built as an empty document.
          credentialData: credentialDataFromClaims(claims),
          display,
          email,
          sub,
          termsRequired: true,
        }),
      };
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomBytes(32).toString('base64url');
    const invitationId = crypto.randomUUID();

    getDb()
      .prepare(
        `INSERT INTO invitations
           (invitation_id, institution, holder_email, holder_name, student_id, token_hash, status,
            api_key_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        invitationId,
        institution,
        email,
        holderName ? String(holderName) : null,
        resolvedStudentId,
        sha256Hex(token),
        apiKeyId,
        now.toISOString(),
        expiresAt,
      );

    const inviteUrl = `${this.siteUrl}/issue?invitation=${encodeURIComponent(invitationId)}&token=${encodeURIComponent(token)}`;

    let emailSent = false;
    if (this.emailSender) {
      try {
        const sent = await this.emailSender({
          email,
          institution,
          claimUrl: inviteUrl,
          credentials: sessions.map(({ display, label }) => ({
            title: display.title,
            subtitle:
              display.courseCount != null
                ? `${display.totalCredits ?? '—'} credits · ${display.courseCount} courses`
                : [display.degreeLevel, label].filter(Boolean).join(' · '),
          })),
        });
        emailSent = Boolean(sent && sent.success);
      } catch {
        emailSent = false;
      }
    }

    return {
      invitationId,
      inviteUrl,
      expiresAt,
      emailSent,
      holderEmail: email,
      studentId: resolvedStudentId,
      // The link is returned as well as emailed, so a caller may redirect the holder instead of
      // waiting for them to open their mail: the same invitation, reached two ways.
      credentials: sessions.map(({ kind, label, display, session }) => ({
        sessionId: session.sessionId,
        kind,
        label,
        title: display.title,
        degreeLevel: display.degreeLevel,
        graduationDate: display.graduationDate,
        totalCredits: display.totalCredits,
        courseCount: display.courseCount,
        status: session.status,
      })),
    };
  }

  /**
   * Record an invitation for credentials that were prepared elsewhere.
   *
   * The academy's own flow generates its record and creates its sessions itself, but a holder
   * should still be told when an uncollected credential stops being available, and that needs the
   * same expiry as a published one. This writes the invitation without creating anything, so both
   * paths run out at the same time.
   *
   * @returns {{invitationId: string, inviteUrl: string, expiresAt: string}}
   */
  record({ institution, apiKeyId = null, holderEmail, holderName = null, studentId }) {
    const email = String(holderEmail || '').trim().toLowerCase();
    if (!isEmail(email)) {throw new Error('A valid holder email address is required');}
    if (!institution) {throw new Error('An institution is required');}

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomBytes(32).toString('base64url');
    const invitationId = crypto.randomUUID();

    getDb()
      .prepare(
        `INSERT INTO invitations
           (invitation_id, institution, holder_email, holder_name, student_id, token_hash, status,
            api_key_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .run(
        invitationId,
        institution,
        email,
        holderName ? String(holderName) : null,
        String(studentId || '').trim() || studentIdFor(email),
        sha256Hex(token),
        apiKeyId,
        now.toISOString(),
        expiresAt,
      );

    return {
      invitationId,
      expiresAt,
      inviteUrl: `${this.siteUrl}/issue?invitation=${encodeURIComponent(invitationId)}&token=${encodeURIComponent(token)}`,
    };
  }

  /**
   * The invitation behind a link, with what is waiting for that holder.
   *
   * The token proves the holder was given the link; it is not a sign-in. Everything after this
   * still requires the holder to prove they control the address the institution named.
   */
  resolve({ invitationId, token }) {
    this.prune();
    const row = this._row(invitationId);
    if (!row) {throw new Error('This invitation is not available. Ask the institution to send it again.');}
    if (row.status === 'expired') {throw new Error('This invitation has expired');}
    if (token && sha256Hex(token) !== row.token_hash) {
      throw new Error('This link is not valid. Ask the institution to send it again.');
    }
    return row;
  }

  /** What the holding page shows before anybody signs in: who published it, and for whom. */
  preview({ invitationId, token }) {
    const row = this.resolve({ invitationId, token });
    return {
      invitationId: row.invitation_id,
      institution: row.institution,
      // Never the whole address: the page is public until the holder signs in, and the point of
      // returning it is to confirm which mailbox the code will go to.
      holderEmail: maskEmail(row.holder_email),
      holderName: row.holder_name,
      expiresAt: row.expires_at,
      status: row.status,
    };
  }

  /**
   * The invitation behind a link, with the token required rather than optional.
   *
   * Sending a code is the one action that reaches out to the holder, so it is the one that must
   * not be available from a guessed id: without this, an invitation id would be enough to post
   * codes at somebody's address and to learn it in the reply.
   */
  resolveForCode({ invitationId, token }) {
    if (!token) {
      throw new Error('This link is incomplete. Open the link the institution sent you.');
    }
    return this.resolve({ invitationId, token });
  }

  /** The items this invitation is holding, once the holder is signed in. */
  items({ invitationId, email = null }) {
    const row = this._row(invitationId);
    if (!row) {throw new Error('This invitation is not available');}
    if (email && String(email).toLowerCase() !== row.holder_email) {
      throw new Error('This invitation was published for a different address');
    }
    const links = email ? this.walletAccounts.getLinks(subForRow(row)) : [];
    const sessions = this.issuer.listIssuanceSessions({ email: row.holder_email, links });
    return sessions.filter((session) => session.status !== 'superseded');
  }

  /** Recorded when the holder takes the offer: the invitation has done its job. */
  markClaimed(invitationId) {
    getDb()
      .prepare("UPDATE invitations SET status = 'claimed', claimed_at = ? WHERE invitation_id = ? AND status = 'pending'")
      .run(new Date().toISOString(), invitationId);
  }

  /**
   * Deletes expired invitations and stops their unclaimed credentials being claimable.
   *
   * A session is superseded rather than deleted: it was never claimed, so nothing is taken from
   * anybody, and keeping the row means the audit trail still explains what was published.
   */
  prune() {
    const db = getDb();
    const expired = db
      .prepare("SELECT * FROM invitations WHERE status = 'pending' AND expires_at < ?")
      .all(new Date().toISOString());

    for (const row of expired) {
      const sessions = this.issuer.listIssuanceSessions({ email: row.holder_email });
      for (const session of sessions) {
        if (session.status === 'pending') {this.issuer.supersedeIssuanceSession(session.sessionId);}
      }
      db.prepare("UPDATE invitations SET status = 'expired' WHERE invitation_id = ?").run(
        row.invitation_id,
      );
    }
    return expired.length;
  }

  /** Invitations for the management portal, newest first, without their links. */
  list({ institution = null, limit = 100 } = {}) {
    this.prune();
    const db = getDb();
    const rows = institution
      ? db
          .prepare('SELECT * FROM invitations WHERE institution = ? ORDER BY created_at DESC LIMIT ?')
          .all(institution, limit)
      : db.prepare('SELECT * FROM invitations ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map((row) => ({
      invitationId: row.invitation_id,
      institution: row.institution,
      holderEmail: row.holder_email,
      holderName: row.holder_name,
      studentId: row.student_id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      claimedAt: row.claimed_at,
    }));
  }
}

function subForRow(row) {
  const account = getDb().prepare('SELECT sub FROM wallet_accounts WHERE email = ?').get(row.holder_email);
  return account?.sub || null;
}

/** Enough of an address to confirm it, not enough to harvest it. */
export function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!domain) {return '***';}
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 2))}@${domain}`;
}

export default InvitationService;
