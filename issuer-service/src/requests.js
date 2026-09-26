/**
 * Asking for a credential, for somebody the institution cannot identify from an address alone.
 *
 * This is the case the issuing side never had. A holder who studies and collects in the same
 * breath needs no case: the institution publishes, the holder claims, and an unclaimed credential
 * simply expires. A holder who is not on file needs somebody to look, and a look has a state, an
 * owner, an age and a decision - so the case lives here, beside the invitation it eventually
 * produces, because issuing has to be able to refuse.
 *
 * A request is deliberately not an invitation. The invitation is the deliverable: what the holder
 * opens, signs in for and collects, with the same 30-day life as anything else this issuer holds.
 * The request is the reasoning that produced it, including the identity check, the fee and the
 * institution's decision, which is why its states are its own and why issuing is the last of them.
 *
 * Nothing here issues on an assertion. The claims come from the institution's own file, the
 * decision is recorded against the request with a name and a time, and a request that was never
 * accepted cannot be issued however it is called.
 */

import crypto from 'crypto';
import { getDb, sha256Hex } from '../../db.js';
import { WANTED_KINDS, buildPayload, coursesOfClaims } from './request-payload.js';

/** The period promised to the applicant, in working days, from the moment the school has it. */
export const DEFAULT_WORKING_DAYS = 10;

/** $30.00, in the minor units a payment provider takes. */
export const DEFAULT_FEE = { amount: 3000, currency: 'USD' };

/** How long a request with no progress is kept before it is abandoned. */
export const DEFAULT_DRAFT_DAYS = 30;

/**
 * The states a request can be in. Every one has an owner: the applicant owns the early ones, the
 * queue owns `submitted` through `payload_received`, and the holder owns `issued`.
 */
export const STATUS = {
  DRAFT: 'draft',
  DETAILS_CAPTURED: 'details_captured',
  IDENTITY_PENDING: 'identity_pending',
  IDENTITY_VERIFIED: 'identity_verified',
  IDENTITY_FAILED: 'identity_failed',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAID: 'paid',
  SUBMITTED: 'submitted',
  IN_REVIEW: 'in_review',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  PAYLOAD_RECEIVED: 'payload_received',
  ISSUED: 'issued',
  COLLECTED: 'collected',
  WITHDRAWN: 'withdrawn',
  ABANDONED: 'abandoned',
};

/**
 * What may follow what. Written down rather than inferred from the code, so a state that can be
 * reached without a decision is visible as a missing edge rather than as a runtime surprise.
 *
 * `accepted` may receive another payload: an institution that uploaded the wrong programme fixes
 * it by uploading again, and the payload it replaced is kept. `issued` may not go back to accepted,
 * because a credential that exists is not un-issued by editing a case.
 */
const TRANSITIONS = {
  [STATUS.DRAFT]: [STATUS.DETAILS_CAPTURED, STATUS.IDENTITY_PENDING, STATUS.WITHDRAWN, STATUS.ABANDONED],
  [STATUS.DETAILS_CAPTURED]: [STATUS.IDENTITY_PENDING, STATUS.WITHDRAWN, STATUS.ABANDONED],
  [STATUS.IDENTITY_PENDING]: [STATUS.IDENTITY_VERIFIED, STATUS.IDENTITY_FAILED, STATUS.WITHDRAWN, STATUS.ABANDONED],
  [STATUS.IDENTITY_FAILED]: [STATUS.IDENTITY_PENDING, STATUS.WITHDRAWN, STATUS.ABANDONED],
  [STATUS.IDENTITY_VERIFIED]: [STATUS.AWAITING_PAYMENT, STATUS.WITHDRAWN, STATUS.ABANDONED],
  [STATUS.AWAITING_PAYMENT]: [STATUS.PAID, STATUS.WITHDRAWN, STATUS.ABANDONED],
  // Paid but not yet confirmed by the applicant. The two are kept apart because the period runs
  // from submission: somebody who pays and closes the tab has not asked for anything yet, and
  // starting the clock at the money would begin a promise the school was never told about.
  [STATUS.PAID]: [STATUS.SUBMITTED, STATUS.WITHDRAWN, STATUS.ABANDONED],
  [STATUS.SUBMITTED]: [STATUS.IN_REVIEW, STATUS.ACCEPTED, STATUS.DECLINED, STATUS.WITHDRAWN],
  [STATUS.IN_REVIEW]: [STATUS.ACCEPTED, STATUS.DECLINED],
  [STATUS.ACCEPTED]: [STATUS.PAYLOAD_RECEIVED, STATUS.DECLINED],
  [STATUS.PAYLOAD_RECEIVED]: [STATUS.ISSUED, STATUS.ACCEPTED],
  [STATUS.ISSUED]: [STATUS.COLLECTED],
  [STATUS.DECLINED]: [],
  [STATUS.WITHDRAWN]: [],
  [STATUS.ABANDONED]: [],
  [STATUS.COLLECTED]: [],
};

/**
 * The five things an applicant is told, which is all they need. The internal states are the
 * queue's vocabulary; this is the holder's, and it is deliberately smaller so a case can be
 * reorganised without the applicant's page changing meaning.
 */
const APPLICANT_STATUS = {
  [STATUS.DRAFT]: 'received',
  [STATUS.DETAILS_CAPTURED]: 'received',
  [STATUS.IDENTITY_PENDING]: 'received',
  [STATUS.IDENTITY_FAILED]: 'received',
  [STATUS.IDENTITY_VERIFIED]: 'received',
  [STATUS.AWAITING_PAYMENT]: 'received',
  [STATUS.PAID]: 'received',
  [STATUS.SUBMITTED]: 'received',
  [STATUS.IN_REVIEW]: 'being-checked',
  [STATUS.ACCEPTED]: 'being-prepared',
  [STATUS.PAYLOAD_RECEIVED]: 'being-prepared',
  [STATUS.ISSUED]: 'sent',
  [STATUS.COLLECTED]: 'sent',
  [STATUS.DECLINED]: 'declined',
  [STATUS.WITHDRAWN]: 'declined',
  [STATUS.ABANDONED]: 'declined',
};

/**
 * What the applicant is told, state by state. Five short sentences rather than a progress bar,
 * because the honest answer is either "the school has it" or "the school has finished", and
 * anything in between would be inventing progress nobody can point at.
 */
export const APPLICANT_WORDING = {
  received: 'We have your request. It is with the school now.',
  'being-checked': 'The school is checking your record.',
  'being-prepared': 'Your record has been confirmed, and your credentials are being prepared.',
  sent: 'Your credentials are ready to collect.',
  declined: 'This request was declined.',
};

/**
 * Add working days to a date, skipping weekends.
 *
 * Public holidays are not modelled. The promise is "up to 10 working days", so a holiday makes
 * the promise conservative rather than broken, and a reviewer who is late is visible on the queue
 * as an overdue request rather than hidden by a calendar this service does not have.
 */
export function addWorkingDays(from, days) {
  const date = new Date(from);
  let remaining = Number(days);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {remaining -= 1;}
  }
  return date;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

export class RequestService {
  /**
   * @param {object} deps
   * @param {object} [deps.invitationService] used at issue, to produce the deliverable
   * @param {(args: object) => Promise<object>} [deps.emailSender] the generic mail sender
   * @param {string} [deps.siteUrl] where the applicant's status page lives
   * @param {{amount: number, currency: string}} [deps.fee] the default fee, in minor units
   * @param {number} [deps.workingDays] the period promised to the applicant
   */
  constructor({
    invitationService = null,
    emailSender = null,
    siteUrl = null,
    fee = null,
    workingDays = null,
    draftDays = null,
  } = {}) {
    this.invitationService = invitationService;
    this.emailSender = emailSender ? (args) => emailSender(args) : null;
    this.siteUrl = (siteUrl || process.env.ISSUE_SITE_URL || '').replace(/\/$/, '');
    this.fee = fee || {
      amount: Number(process.env.REQUEST_FEE_MINOR_UNITS) || DEFAULT_FEE.amount,
      currency: process.env.REQUEST_FEE_CURRENCY || DEFAULT_FEE.currency,
    };
    this.workingDays = workingDays || Number(process.env.REQUEST_WORKING_DAYS) || DEFAULT_WORKING_DAYS;
    this.draftDays = draftDays || DEFAULT_DRAFT_DAYS;
  }

  get enabled() {
    return Boolean(this.invitationService);
  }

  _row(requestId) {
    return getDb().prepare('SELECT * FROM credential_requests WHERE request_id = ?').get(requestId);
  }

  _event(requestId, event, { actor = null, detail = null } = {}) {
    getDb()
      .prepare(
        `INSERT INTO request_events (event_id, request_id, event, actor, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        crypto.randomUUID(),
        requestId,
        event,
        actor,
        detail ? JSON.stringify(detail) : null,
        new Date().toISOString(),
      );
  }

  /**
   * Move a request to another state, refusing anything that is not an edge above.
   *
   * The refusal is the point: a state machine that accepts any target is a status column, and a
   * status column cannot stop a credential being issued for a request nobody accepted.
   */
  _transition(row, next, { actor = null, event = null, detail = null, patch = null } = {}) {
    const allowed = TRANSITIONS[row.status] || [];
    if (!allowed.includes(next)) {
      throw new Error(`A request in ${row.status} cannot move to ${next}`);
    }

    const fields = { ...(patch || {}), status: next, updated_at: new Date().toISOString() };
    const assignments = Object.keys(fields).map((key) => `${key} = ?`).join(', ');
    getDb()
      .prepare(`UPDATE credential_requests SET ${assignments} WHERE request_id = ?`)
      .run(...Object.values(fields), row.request_id);

    if (event) {this._event(row.request_id, event, { actor, detail });}
    return { ...row, ...fields };
  }

  /**
   * Open a case. The applicant chooses the school and what they want; the institution is the one
   * that will be asked, and the address is the one the collection link will go to.
   */
  open({
    institution,
    school,
    applicantEmail,
    applicantPhone = null,
    applicantName = null,
    wanted = ['both'],
  }) {
    const email = String(applicantEmail || '').trim().toLowerCase();
    if (!isEmail(email)) {throw new Error('A valid email address is required');}
    if (!String(institution || '').trim()) {throw new Error('An institution is required');}
    if (!String(school || '').trim()) {throw new Error('A school is required');}

    const wantedList = (Array.isArray(wanted) ? wanted : [wanted])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    if (wantedList.length === 0) {throw new Error('Say what the applicant is asking for');}
    const unknown = wantedList.filter((value) => !WANTED_KINDS.includes(value));
    if (unknown.length > 0) {
      throw new Error(`Unknown credential kind: ${unknown.join(', ')}. Use ${WANTED_KINDS.join(', ')}`);
    }

    const now = new Date().toISOString();
    const requestId = crypto.randomUUID();
    // The applicant's handle, hashed for the same reason an invitation token is: it arrives in a
    // link and a database read must not yield a usable one.
    const token = crypto.randomBytes(32).toString('base64url');

    getDb()
      .prepare(
        `INSERT INTO credential_requests
           (request_id, institution, school, applicant_email, applicant_phone, applicant_name,
            wanted, status, token_hash, fee_amount, fee_currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        requestId,
        String(institution).trim(),
        String(school).trim(),
        email,
        applicantPhone ? String(applicantPhone).trim() : null,
        applicantName ? String(applicantName).trim() : null,
        JSON.stringify(wantedList),
        STATUS.DRAFT,
        sha256Hex(token),
        this.fee.amount,
        this.fee.currency,
        now,
        now,
      );

    this._event(requestId, 'request.opened', {
      actor: 'applicant',
      detail: { school, wanted: wantedList, fee: this.fee },
    });

    return { requestId, token, status: STATUS.DRAFT, fee: this.fee, request: this._row(requestId) };
  }

  /** The applicant's own view of their case, by the handle they hold. */
  resolve({ requestId, token }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (sha256Hex(String(token || '')) !== row.token_hash) {throw new Error('Request not found');}
    return row;
  }

  /**
   * The applicant's own view of their case. Deliberately small: five states, the period they were
   * promised, and the outcome. The internal states, the reviewer's note and whatever the identity
   * check extracted stay inside - an applicant reading "identity_failed" learns nothing they can
   * act on, and being shown it is worse than being told to try again.
   */
  applicantView({ requestId, token }) {
    const row = this.resolve({ requestId, token });
    const status = APPLICANT_STATUS[row.status] || 'received';
    return {
      requestId: row.request_id,
      school: row.school,
      status,
      whatHappensNext: APPLICANT_WORDING[status],
      dueAt: row.due_at,
      overdue: Boolean(row.due_at) && Date.now() > Date.parse(row.due_at) && !this._isFinished(row.status),
      submittedAt: row.submitted_at,
      decidedAt: row.reviewed_at,
      outcome: row.decision,
      // The reason the institution agreed to share, never the reviewer's own note.
      reason: row.decision_reason,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Record the identity outcome. Called by the verification callback, so it is not applicant
   * input: the applicant's browser never states that a check passed.
   */
  attachIdentity({ requestId, status, sessionRef = null, summary = null, extract = null, actor = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}

    const verified = String(status).toLowerCase() === 'verified';
    const next = verified ? STATUS.IDENTITY_VERIFIED : STATUS.IDENTITY_FAILED;

    // A provider that delivers its callback twice must not move the case twice: the second
    // delivery is the same fact told again, not a new one.
    if (row.status === next) {return row;}
    if (row.status === STATUS.AWAITING_PAYMENT && verified) {return row;}

    if (row.status === STATUS.DRAFT) {
      this._transition(row, STATUS.IDENTITY_PENDING, { actor, event: 'identity.started', detail: { sessionRef } });
    }

    const current = this._row(requestId);
    const moved = this._transition(current, next, {
      actor: actor || 'identity-provider',
      event: verified ? 'identity.completed' : 'identity.failed',
      detail: { status, extract },
      patch: {
        identity_ref: sessionRef,
        identity_status: verified ? 'verified' : 'failed',
        identity_summary: summary ? JSON.stringify(summary) : null,
        extract_json: extract ? JSON.stringify(extract) : null,
      },
    });

    // Verification is the gate to payment: a case that can be paid for but not verified would take
    // money for something nobody can decide.
    if (verified) {
      return this._transition(this._row(moved.request_id), STATUS.AWAITING_PAYMENT, {
        actor: actor || 'identity-provider',
        event: 'identity.accepted',
      });
    }
    return moved;
  }

  /** Details the applicant supplies, which are theirs and not evidence of anything. */
  setDetails({ requestId, token, email = null, phone = null, name = null, school = null, wanted = null }) {
    const row = this.resolve({ requestId, token });
    const patch = {};
    if (email) {
      const value = String(email).trim().toLowerCase();
      if (!isEmail(value)) {throw new Error('A valid email address is required');}
      patch.applicant_email = value;
    }
    if (phone) {patch.applicant_phone = String(phone).trim();}
    if (name) {patch.applicant_name = String(name).trim();}
    if (school) {patch.school = String(school).trim();}
    if (wanted) {
      const list = (Array.isArray(wanted) ? wanted : [wanted]).map((v) => String(v).trim().toLowerCase());
      const unknown = list.filter((value) => !WANTED_KINDS.includes(value));
      if (unknown.length > 0) {throw new Error(`Unknown credential kind: ${unknown.join(', ')}`);}
      patch.wanted = JSON.stringify(list);
    }
    if (Object.keys(patch).length === 0) {throw new Error('Nothing to change');}

    const next = row.status === STATUS.DRAFT ? STATUS.DETAILS_CAPTURED : row.status;
    return this._transition(row, next, { actor: 'applicant', event: 'request.details_captured', patch });
  }

  /**
   * Record that the fee was paid. Called from the payment provider's confirmation, never from the
   * page, so a browser cannot mark a request paid.
   */
  markPaid({ requestId, paymentRef, amount = null, currency = null, actor = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (row.payment_status === 'paid') {return row;}

    const paidAmount = amount ?? row.fee_amount;
    const paidCurrency = currency || row.fee_currency;
    if (Number(paidAmount) !== Number(row.fee_amount) || paidCurrency !== row.fee_currency) {
      throw new Error(
        `The payment is ${paidAmount} ${paidCurrency}, but this request is for ${row.fee_amount} ${row.fee_currency}`,
      );
    }

    return this._transition(row, STATUS.PAID, {
      actor: actor || 'payment-provider',
      event: 'payment.completed',
      detail: { paymentRef, amount: paidAmount, currency: paidCurrency },
      patch: { payment_ref: paymentRef, payment_status: 'paid' },
    });
  }

  /**
   * Freeze the case and hand it to the school. This is the moment the promised period starts,
   * because it is the moment somebody at the institution could start.
   */
  submit({ requestId, token = null, termsVersion = null, actor = null }) {
    const row = token ? this.resolve({ requestId, token }) : this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (row.identity_status !== 'verified') {throw new Error('The identity check is not complete');}
    if (row.payment_status !== 'paid') {throw new Error('The fee has not been paid');}
    if (row.status === STATUS.SUBMITTED) {return row;}
    if (row.status !== STATUS.PAID) {
      throw new Error(`A request in ${row.status} cannot be submitted`);
    }

    const submittedAt = new Date();
    const dueAt = addWorkingDays(submittedAt, this.workingDays);
    const moved = this._transition(row, STATUS.SUBMITTED, {
      actor: actor || 'applicant',
      event: 'request.submitted',
      detail: { dueAt: dueAt.toISOString(), workingDays: this.workingDays },
      patch: {
        submitted_at: submittedAt.toISOString(),
        due_at: dueAt.toISOString(),
        terms_version: termsVersion,
      },
    });

    this._event(requestId, 'operator.notified', {
      actor: 'system',
      detail: { dueAt: dueAt.toISOString(), workingDays: this.workingDays },
    });
    return moved;
  }

  /** The queue. An institution sees its own; a platform administrator passes null and sees all. */
  list({ institution = null, status = null, limit = 200 } = {}) {
    const clauses = [];
    const values = [];
    if (institution) {
      clauses.push('institution = ?');
      values.push(institution);
    }
    if (status) {
      clauses.push('status = ?');
      values.push(status);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = getDb()
      .prepare(`SELECT * FROM credential_requests ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...values, Number(limit) || 200);

    const now = Date.now();
    return rows.map((row) => ({
      ...row,
      wanted: JSON.parse(row.wanted || '[]'),
      applicantStatus: APPLICANT_STATUS[row.status] || 'received',
      ageWorkingDays: this._workingDaysSince(row.submitted_at, now),
      overdue: Boolean(row.due_at) && now > Date.parse(row.due_at) && !this._isFinished(row.status),
    }));
  }

  /**
   * One case, scoped to an institution. This is the boundary that matters: a request holds a
   * person's identity evidence and their address, so reading one outside your organisation must
   * fail the same way as reading one that does not exist.
   */
  get({ requestId, institution = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (institution && row.institution !== institution) {throw new Error('Request not found');}

    const events = getDb()
      .prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at ASC')
      .all(requestId)
      .map((event) => ({ ...event, detail: event.detail_json ? JSON.parse(event.detail_json) : null }));

    const payloads = getDb()
      .prepare('SELECT payload_id, filename, row_count, validation_json, uploaded_by, uploaded_at FROM request_payloads WHERE request_id = ? ORDER BY uploaded_at DESC')
      .all(requestId)
      .map((payload) => ({
        ...payload,
        validation: payload.validation_json ? JSON.parse(payload.validation_json) : null,
        validation_json: undefined,
      }));

    return {
      ...row,
      wanted: JSON.parse(row.wanted || '[]'),
      extract: row.extract_json ? JSON.parse(row.extract_json) : null,
      identitySummary: row.identity_summary ? JSON.parse(row.identity_summary) : null,
      extract_json: undefined,
      identity_summary: undefined,
      applicantStatus: APPLICANT_STATUS[row.status] || 'received',
      ageWorkingDays: this._workingDaysSince(row.submitted_at, Date.now()),
      overdue: Boolean(row.due_at) && Date.now() > Date.parse(row.due_at) && !this._isFinished(row.status),
      events,
      payloads,
      canDecide: row.status === STATUS.SUBMITTED || row.status === STATUS.IN_REVIEW,
      canUpload: row.status === STATUS.ACCEPTED || row.status === STATUS.PAYLOAD_RECEIVED,
      canIssue: row.status === STATUS.PAYLOAD_RECEIVED,
    };
  }

  /**
   * The institution's decision. It names who decided and why, because that is the record the
   * credential rests on, and it cannot be taken twice: a second decision is a mistake, not a
   * correction, and the events show what was actually decided first.
   */
  decide({ requestId, institution = null, decision, reason, note = null, reviewedBy }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (institution && row.institution !== institution) {throw new Error('Request not found');}
    if (row.decision) {throw new Error(`This request was already ${row.decision}`);}
    if (!String(reason || '').trim()) {throw new Error('A reason is required, and it is shared with the applicant');}
    if (!String(reviewedBy || '').trim()) {throw new Error('A reviewer is required');}
    if (![STATUS.SUBMITTED, STATUS.IN_REVIEW].includes(row.status)) {
      throw new Error('A request must be submitted before it can be decided');
    }

    const accepted = String(decision).toLowerCase() === 'accepted';
    if (!accepted && String(decision).toLowerCase() !== 'declined') {
      throw new Error("The decision must be 'accepted' or 'declined'");
    }

    if (row.status === STATUS.SUBMITTED) {
      this._transition(row, STATUS.IN_REVIEW, { actor: reviewedBy, event: 'request.opened_by_reviewer' });
    }

    return this._transition(this._row(requestId), accepted ? STATUS.ACCEPTED : STATUS.DECLINED, {
      actor: reviewedBy,
      event: accepted ? 'request.accepted' : 'request.declined',
      detail: { reason, note },
      patch: {
        decision: accepted ? 'accepted' : 'declined',
        decision_reason: String(reason).trim(),
        reviewer_note: note ? String(note).trim() : null,
        reviewed_by: String(reviewedBy).trim(),
        reviewed_at: new Date().toISOString(),
      },
    });
  }

  /**
   * Take the institution's file. A rejected file leaves the case where it was, with the reasons
   * recorded, because the operator has to fix and retry rather than start again.
   */
  attachPayload({ requestId, institution = null, csv, filename = null, uploadedBy = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (institution && row.institution !== institution) {throw new Error('Request not found');}
    if (row.decision !== 'accepted') {throw new Error('This request has not been accepted');}
    if (![STATUS.ACCEPTED, STATUS.PAYLOAD_RECEIVED].includes(row.status)) {
      throw new Error(`A payload cannot be uploaded while the request is ${row.status}`);
    }

    const result = buildPayload({
      csv,
      expectedEmail: row.applicant_email,
      institution: row.institution,
    });

    if (!result.ok) {
      this._event(requestId, 'payload.rejected', {
        actor: uploadedBy,
        detail: { filename, errors: result.errors, rowCount: result.rowCount },
      });
      const error = new Error('The file was refused, so nothing was stored');
      error.details = result;
      throw error;
    }

    const payloadId = crypto.randomUUID();
    getDb()
      .prepare(
        `INSERT INTO request_payloads
           (payload_id, request_id, filename, row_count, validation_json, claims_json, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payloadId,
        requestId,
        filename ? String(filename) : null,
        result.rowCount,
        JSON.stringify({ rows: result.rows, warnings: [] }),
        JSON.stringify(result.credentials),
        uploadedBy,
        new Date().toISOString(),
      );

    this._event(requestId, 'payload.uploaded', {
      actor: uploadedBy,
      detail: {
        payloadId,
        filename,
        rowCount: result.rowCount,
        kinds: result.credentials.map((credential) => credential.kind),
      },
    });

    // A second file replaces the first: the institution that uploaded the wrong programme fixes it
    // by uploading again, and the earlier payload stays on the request as what was used before.
    const request =
      row.status === STATUS.PAYLOAD_RECEIVED
        ? row
        : this._transition(row, STATUS.PAYLOAD_RECEIVED, { actor: uploadedBy, event: 'payload.accepted' });

    return {
      payloadId,
      rowCount: result.rowCount,
      credentials: result.credentials,
      request,
    };
  }

  /** The most recent accepted payload, whose claims are what issuing would sign. */
  latestPayload({ requestId, institution = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (institution && row.institution !== institution) {throw new Error('Request not found');}

    const payload = getDb()
      .prepare('SELECT * FROM request_payloads WHERE request_id = ? ORDER BY uploaded_at DESC LIMIT 1')
      .get(requestId);
    if (!payload) {throw new Error('No payload has been uploaded for this request');}

    return {
      payloadId: payload.payload_id,
      filename: payload.filename,
      rowCount: payload.row_count,
      uploadedBy: payload.uploaded_by,
      uploadedAt: payload.uploaded_at,
      credentials: JSON.parse(payload.claims_json),
    };
  }

  /**
   * What issuing would produce, before anything is signed. The reviewer sees the same document the
   * holder will later be able to share, because that is the last moment a mistake can be caught.
   */
  preview({ requestId, institution = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (institution && row.institution !== institution) {throw new Error('Request not found');}

    const payload = this.latestPayload({ requestId, institution });
    return {
      requestId,
      holder: {
        email: row.applicant_email,
        name: row.applicant_name,
        studentId: payload.credentials[0]?.display?.studentId || null,
        verifiedName: row.extract_json ? JSON.parse(row.extract_json).givenName || null : null,
      },
      decision: { accepted: row.decision === 'accepted', reason: row.decision_reason },
      payload: { filename: payload.filename, rowCount: payload.rowCount, uploadedAt: payload.uploadedAt },
      credentials: payload.credentials.map((credential) => ({
        kind: credential.kind,
        label: credential.label,
        namespaces: credential.namespaces,
        display: credential.display,
        // The module list on its own, so the screen showing the preview does not have to know which
        // namespace a transcript lives in or how modules are encoded inside it.
        courses: coursesOfClaims(credential.claims),
        claims: credential.claims,
      })),
    };
  }

  /**
   * Issue, which is the last thing that happens to a request and the first thing that happens to
   * the holder: the case produces an invitation, and the holder collects through the same page as
   * anybody else. Asking twice returns the invitation that already exists rather than minting a
   * second credential.
   */
  async issue({ requestId, institution = null, actor = null }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (institution && row.institution !== institution) {throw new Error('Request not found');}
    if (row.invitation_id) {return { reused: true, invitationId: row.invitation_id, request: row };}

    if (row.decision !== 'accepted') {throw new Error('This request has not been accepted');}
    if (row.status !== STATUS.PAYLOAD_RECEIVED) {
      throw new Error('Upload the record the institution is asserting before issuing');
    }
    if (!this.invitationService) {throw new Error('The issuer is not configured to publish');}

    const payload = this.latestPayload({ requestId, institution });
    const invitation = await this.invitationService.create({
      institution: row.institution,
      holderEmail: row.applicant_email,
      holderName: row.applicant_name || payload.credentials[0]?.display?.title || null,
      studentId: payload.credentials[0]?.display?.studentId || undefined,
      credentials: payload.credentials.map((credential) => ({ claims: credential.claims })),
    });

    const moved = this._transition(this._row(requestId), STATUS.ISSUED, {
      actor,
      event: 'credential.issued',
      detail: { invitationId: invitation.invitationId, payloadId: payload.payloadId, rows: payload.rowCount },
      patch: { invitation_id: invitation.invitationId, issued_at: new Date().toISOString(), expires_at: invitation.expiresAt },
    });

    return { reused: false, invitation, request: moved };
  }

  /** The holder collected. Recorded so the queue can show a case closed rather than a case open. */
  markCollected({ requestId }) {
    const row = this._row(requestId);
    if (!row) {throw new Error('Request not found');}
    if (row.status === STATUS.COLLECTED) {return row;}
    return this._transition(row, STATUS.COLLECTED, { actor: 'holder', event: 'credential.collected' });
  }

  /** Requests that were never finished. A draft is not a queue entry, so it is closed quietly. */
  prune({ olderThanDays = null } = {}) {
    const days = olderThanDays || this.draftDays;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const stale = getDb()
      .prepare('SELECT request_id FROM credential_requests WHERE status IN (?, ?, ?) AND created_at < ?')
      .all(STATUS.DRAFT, STATUS.DETAILS_CAPTURED, STATUS.IDENTITY_PENDING, cutoff);

    for (const { request_id: requestId } of stale) {
      const row = this._row(requestId);
      this._transition(row, STATUS.ABANDONED, { actor: 'system', event: 'request.abandoned' });
    }
    return stale.length;
  }

  _isFinished(status) {
    return [STATUS.ISSUED, STATUS.COLLECTED, STATUS.DECLINED, STATUS.WITHDRAWN, STATUS.ABANDONED].includes(status);
  }

  _workingDaysSince(from, toMs) {
    if (!from) {return 0;}
    const start = new Date(from);
    const end = new Date(toMs);
    let days = 0;
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
    while (cursor < last) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) {days += 1;}
    }
    return days;
  }
}

export { APPLICANT_STATUS };
