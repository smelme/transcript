import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 15000 });

export async function createPresentationSession() {
  const response = await api.post('/presentation/sessions', {
    relyingPartyId: 'myjob',
    origin: window.location.origin,
  });
  return response.data;
}

function supportsIsoMdocPresentation() {
  if (!navigator.credentials?.get) return false;
  return typeof window.DigitalCredential === 'undefined'
    || typeof window.DigitalCredential.userAgentAllowsProtocol !== 'function'
    || window.DigitalCredential.userAgentAllowsProtocol('org-iso-mdoc');
}

export async function requestAcademicCredential() {
  if (!supportsIsoMdocPresentation()) {
    throw new Error('This browser does not support digital credential requests.');
  }
  const session = await createPresentationSession();
  const credential = await navigator.credentials.get(session.request);
  if (!credential) throw new Error('No credential was shared.');
  const result = await submitAcademicCredential(session.sessionId, credential);
  return result;
}

export async function submitAcademicCredential(sessionId, credential) {
  const response = await api.post(`/presentation/sessions/${encodeURIComponent(sessionId)}/response`, {
    relyingPartyId: 'myjob',
    origin: window.location.origin,
    credential: {
      protocol: credential.protocol,
      data: credential.data,
    },
  });
  if (!response.data?.success) {
    throw new Error(response.data?.error || 'Credential verification failed.');
  }
  return response.data;
}