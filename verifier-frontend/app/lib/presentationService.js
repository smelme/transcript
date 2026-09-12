// Relies on the /api rewrite in next.config.mjs to reach the verifier service.
const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body.error || body.message || message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  return res.json();
}

export async function createPresentationSession() {
  return request('/presentation/sessions', {
    method: 'POST',
    body: JSON.stringify({
      relyingPartyId: 'myjob',
      origin: typeof window !== 'undefined' ? window.location.origin : '',
    }),
  });
}

function supportsIsoMdocPresentation() {
  if (!navigator.credentials?.get) return false;
  return (
    typeof window.DigitalCredential === 'undefined' ||
    typeof window.DigitalCredential.userAgentAllowsProtocol !== 'function' ||
    window.DigitalCredential.userAgentAllowsProtocol('org-iso-mdoc')
  );
}

export async function requestAcademicCredential() {
  if (!supportsIsoMdocPresentation()) {
    throw new Error('This browser does not support digital credential requests.');
  }

  const session = await createPresentationSession();
  const credential = await navigator.credentials.get(session.request);

  if (!credential) {
    throw new Error('No credential was shared.');
  }

  return submitAcademicCredential(session.sessionId, credential);
}

export async function submitAcademicCredential(sessionId, credential) {
  const data = await request(
    `/presentation/sessions/${encodeURIComponent(sessionId)}/response`,
    {
      method: 'POST',
      body: JSON.stringify({
        relyingPartyId: 'myjob',
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        credential: {
          protocol: credential.protocol,
          data: credential.data,
        },
      }),
    },
  );

  if (!data?.success) {
    throw new Error(data?.error || 'Credential verification failed.');
  }

  return data;
}

/* ── Trust University: a registrar asking for the transcript ───────────── */

/**
 * Both credential kinds are issued under this docType, so it does not identify one; the
 * transcript namespace in the request does.
 */
export const TRANSCRIPT_DOC_TYPE = 'org.iso.23220.photoid.1';

/**
 * What a registrar needs: the holder's name, then the study itself. The award fields are
 * deliberately not requested - a transcript credential does not carry them, and asking for
 * them would suggest the registrar reads an award from a transcript.
 */
export const REGISTRAR_NAME_SPACES = {
  'org.iso.23220.photoid.1': ['given_name', 'family_name'],
  'org.iso.23220.education.transcript.1': [
    'institution_name',
    'institution_id',
    'institution_id_scheme',
    'institution_ror',
    'institution_name_alt',
    'programme_title',
    'programme_title_alt',
    'programme_code',
    'programme_code_scheme',
    'programme_level',
    'award_title',
    'language_of_instruction',
    'credit_scheme',
    'total_credits',
    'credits_attempted',
    'credits_earned',
    'outcome',
    'overall_mark',
    'overall_mark_scale_id',
    'student_id',
    'student_id_scheme',
    'courses',
    'status',
  ],
  'org.iso.23220.education.academic-record.1': [
    'transcript_type',
    'attesting_office',
    'attesting_capacity',
    'document_status',
    'document_completeness',
  ],
};

export const REGISTRAR_RELYING_PARTY = 'trust-university';

export async function createRegistrarSession(relyingPartyId = REGISTRAR_RELYING_PARTY) {
  return request('/presentation/sessions', {
    method: 'POST',
    body: JSON.stringify({
      relyingPartyId,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      docType: TRANSCRIPT_DOC_TYPE,
      nameSpaces: REGISTRAR_NAME_SPACES,
    }),
  });
}

/** Ask the holder's wallet for their transcript and return the verified claims. */
export async function requestTranscript(relyingPartyId = REGISTRAR_RELYING_PARTY) {
  if (!supportsIsoMdocPresentation()) {
    throw new Error('This browser does not support digital credential requests.');
  }

  const session = await createRegistrarSession(relyingPartyId);
  const credential = await navigator.credentials.get(session.request);

  if (!credential) {
    throw new Error('No transcript was shared.');
  }

  return submitTranscript(session.sessionId, credential, relyingPartyId);
}

export async function submitTranscript(
  sessionId,
  credential,
  relyingPartyId = REGISTRAR_RELYING_PARTY,
) {
  const data = await request(
    `/presentation/sessions/${encodeURIComponent(sessionId)}/response`,
    {
      method: 'POST',
      body: JSON.stringify({
        relyingPartyId,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        credential: { protocol: credential.protocol, data: credential.data },
      }),
    },
  );

  if (!data?.success) {
    throw new Error(data?.error || 'Transcript verification failed.');
  }

  return data;
}

/**
 * The course list travels as one JSON string claim. Returns an empty list rather than
 * throwing, so a registrar sees the verified totals even if the list cannot be read.
 */
export function parseCourses(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
