/**
 * Identity, for somebody the institution cannot identify from an address alone.
 *
 * The check is run here rather than in the academy's app because the applicant is Quals's to look
 * after until the school has the request: they have no account anywhere, and the evidence they
 * produce is evidence for a case that lives here.
 *
 * Two rules decide everything about this module.
 *
 * **The decision is fetched, never accepted.** A webhook is a notification that there is a decision
 * to collect, not the decision itself. So a forged webhook can at worst cause us to ask the provider
 * about a session, and a session we did not create is refused because the request does not carry
 * its reference. Nothing in a webhook body is ever stored as an outcome.
 *
 * **What is kept is what a reviewer reads.** The extracted fields - name, date of birth, document -
 * are stored on the request. The document images and the selfie are not: they are the provider's to
 * hold, and a copy here would be a liability with no reader.
 */

const DIDIT_API_BASE = process.env.DIDIT_API_BASE || 'https://verification.didit.me/v3';

/** States the provider reports that mean the check passed, is still running, or will not. */
const APPROVED = new Set(['approved', 'verified', 'passed']);
const FAILED = new Set([
  'declined',
  'rejected',
  'expired',
  'abandoned',
  'cancelled',
  'canceled',
  'failed',
]);
const IN_PROGRESS = new Set([
  'not started',
  'not_started',
  'in progress',
  'in_progress',
  'in review',
  'in_review',
  'submitted',
  'pending',
  'manual review',
  'manual_review',
]);

/** The mapping from the provider's vocabulary to ours, so the rest of the system has one. */
export function identityOutcome(status) {
  const value = String(status || '').trim().toLowerCase();
  if (APPROVED.has(value)) {return 'verified';}
  if (FAILED.has(value)) {return 'failed';}
  if (IN_PROGRESS.has(value)) {return 'pending';}
  return 'pending';
}

/** What to tell an applicant whose check did not pass, without telling them they are a fraud. */
export function identityReason(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'expired' || value === 'abandoned') {
    return 'The check timed out. You can start it again.';
  }
  if (value === 'manual review' || value === 'manual_review') {
    return 'This needs a person to look at it, and somebody will. You do not need to do anything.';
  }
  return 'We could not complete the check with that document. You can try again with another one.';
}

/**
 * Read the fields a reviewer needs out of a decision payload.
 *
 * Providers move these between versions and workflows, so each field is looked for under the names
 * it has been seen under rather than one assumed name. A field that cannot be found is left out
 * rather than guessed at, because a wrong date of birth is worse than a missing one.
 */
export function parseDecision(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const idVerifications = Array.isArray(data.id_verifications) ? data.id_verifications : [];
  const nfc = Array.isArray(data.nfc_verifications) ? data.nfc_verifications : [];
  const candidates = [
    idVerifications[0],
    nfc[0]?.chip_data,
    data.id_verification,
    data.document,
    data.extracted_data,
    data.decision?.id_verification,
  ].filter((candidate) => candidate && typeof candidate === 'object');

  const read = (...keys) => {
    for (const candidate of candidates) {
      for (const key of keys) {
        const value = candidate[key];
        if (value != null && `${value}`.trim() !== '') {return `${value}`.trim();}
      }
    }
    return null;
  };

  return {
    givenName: read('first_name', 'given_name', 'firstName', 'forename'),
    familyName: read('last_name', 'family_name', 'lastName', 'surname'),
    fullName: read('full_name', 'name'),
    birthDate: read('date_of_birth', 'birth_date', 'dob', 'birthDate'),
    documentNumber: read('document_number', 'document_id', 'id_number', 'personal_number'),
    documentType: read('document_type', 'documentType', 'type'),
    issuingAuthority: read('issuing_authority', 'issuing_country', 'issuer'),
    nationality: read('nationality', 'nationality_iso'),
    sex: read('sex', 'gender'),
    expiryDate: read('expiry_date', 'expiration_date', 'expires_at'),
  };
}

export class IdentityService {
  /**
   * @param {object} options
   * @param {string} [options.apiKey] the provider's key
   * @param {string} [options.workflowId] which checks to run
   * @param {string} [options.callbackBaseUrl] where the provider is asked to call back
   * @param {(input: string, init?: object) => Promise<object>} [options.fetchImpl] for the tests
   * @param {boolean} [options.mock] stand in for the provider, for the automated tests only
   */
  constructor({
    apiKey = process.env.DIDIT_API_KEY || null,
    workflowId = process.env.DIDIT_WORKFLOW_ID || null,
    callbackBaseUrl = process.env.ISSUER_BASE_URL || null,
    fetchImpl = null,
    mock = process.env.DIDIT_MOCK_MODE === 'true',
  } = {}) {
    this.apiKey = apiKey;
    this.workflowId = workflowId;
    this.callbackBaseUrl = (callbackBaseUrl || '').replace(/\/$/, '');
    this.fetchImpl = fetchImpl || ((url, init) => fetch(url, init));
    this.mock = mock;
  }

  get configured() {
    return this.mock || Boolean(this.apiKey && this.workflowId);
  }

  /**
   * Where the provider sends somebody back to when it has finished with them.
   *
   * This is the applicant's **browser** being redirected, not a server being notified, which is why
   * the handle travels in it: after the check the applicant lands on a page with no memory of the
   * request they were making, and without their own handle that page cannot offer them the way back.
   * It goes in the path rather than the query because the provider appends its own parameters on the
   * way back, and a query of ours would be at the mercy of how it joins them.
   *
   * The handle is the applicant's own and grants nothing but their own case - the same value their
   * browser was already showing while they completed the check. Nothing about the person is carried.
   */
  callbackUrlFor(handle) {
    const base = `${this.callbackBaseUrl}/requests/identity/callback`;
    return handle ? `${base}/${encodeURIComponent(String(handle))}` : base;
  }

  /**
   * Start a check. The vendor reference is the request id, which is how a callback finds its way
   * back to the right case without trusting anything the callback says about itself.
   */
  async createSession({ requestId, handle = null }) {
    if (this.mock) {
      const sessionId = `mock-${requestId}`;
      return {
        sessionId,
        status: 'Not Started',
        url: null,
        mock: true,
      };
    }
    if (!this.configured) {throw new Error('Identity checks are not configured');}

    const body = {
      workflow_id: this.workflowId,
      vendor_data: String(requestId),
      callback: this.callbackUrlFor(handle),
    };

    const response = await this.fetchImpl(`${DIDIT_API_BASE}/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = typeof response.text === 'function' ? await response.text() : '';
      throw new Error(`The identity provider refused the session (${response.status}) ${detail.slice(0, 200)}`);
    }

    const data = await response.json();
    const sessionId = data.session_id || data.sessionId || null;
    if (!sessionId) {throw new Error('The identity provider returned no session');}

    return {
      sessionId,
      status: data.status || 'Not Started',
      // The version in use calls it `url`, and an older one `verification_url`.
      url: data.url || data.verification_url || null,
      mock: false,
    };
  }

  /** Collect the decision. This is the only source of an outcome. */
  async getDecision(sessionId) {
    if (this.mock) {
      return {
        sessionId,
        status: 'Approved',
        vendorData: null,
        extract: {
          givenName: 'Ada',
          familyName: 'Lovelace',
          fullName: 'Ada Lovelace',
          birthDate: '1999-01-01',
          documentNumber: 'DEV-0001',
          documentType: 'passport',
          issuingAuthority: 'GB',
          nationality: 'GB',
          sex: 'F',
          expiryDate: '2030-01-01',
        },
        outcome: 'verified',
      };
    }
    if (!this.configured) {throw new Error('Identity checks are not configured');}

    const response = await this.fetchImpl(`${DIDIT_API_BASE}/session/${encodeURIComponent(sessionId)}/decision/`, {
      method: 'GET',
      headers: { 'x-api-key': this.apiKey, accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`The identity provider could not report on that session (${response.status})`);
    }

    const data = await response.json();
    return {
      sessionId: data.session_id || sessionId,
      status: data.status || 'In Progress',
      vendorData: data.vendor_data || null,
      extract: parseDecision(data),
      outcome: identityOutcome(data.status),
    };
  }
}

export default IdentityService;
