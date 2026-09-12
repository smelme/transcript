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

// Trust University is its own site (`trust-university-frontend`) with its own registrar request,
// so nothing here serves it: this app answers as My Jobs only.
