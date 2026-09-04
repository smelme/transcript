/**
 * Typed API client for the issuer-service.
 *
 * The Next.js dev server proxies `/api/*` to the issuer-service via
 * `next.config.mjs` rewrites (default target `http://localhost:3000`,
 * overridable with `ISSUER_API_URL`).
 */

export interface PhotoIDRequest {
  docType: 'org.iso.23220.photoid.1';
  full_name: string;
  date_of_birth: string;
  document_number: string;
  issuing_authority: string;
  issue_date: string;
  expiry_date: string;
  issuing_country: string;
  portrait?: string | null;
  education_qualification?: Record<string, unknown>;
  education_transcript?: Record<string, unknown>;
}

export interface IssueResult {
  success: boolean;
  credentialId?: string;
  docType?: string;
  status?: string;
  mdocBase64url?: string;
  mdocSessionTtlMs?: number;
  error?: string;
}

export interface Credential {
  credentialId: string;
  credentialType?: string;
  status?: string;
  docType?: string;
  full_name?: string;
  issuing_authority?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface MdocResult {
  success: boolean;
  credentialId?: string;
  docType?: string;
  mdocBase64url?: string;
  verification?: {
    signatureValid?: boolean;
    digestsValid?: boolean;
    issuerCert?: { subject?: string } | null;
  };
  error?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  return (await res.json()) as T;
}

export function issueCredential(payload: PhotoIDRequest): Promise<IssueResult> {
  return request<IssueResult>('/credentials/issue', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listCredentials(): Promise<Credential[]> {
  const data = await request<{ credentials?: Credential[] }>('/credentials');
  return data.credentials || [];
}

export function getCredentialMdoc(credentialId: string): Promise<MdocResult> {
  return request<MdocResult>(`/credentials/${credentialId}/mdoc`);
}

export async function getStatistics(): Promise<Record<string, unknown>> {
  const data = await request<{ statistics?: Record<string, unknown> }>('/statistics');
  return data.statistics || data;
}

export async function getAuditLog(): Promise<Record<string, unknown>[]> {
  const data = await request<{ auditLog?: Record<string, unknown>[] }>('/audit-log');
  return data.auditLog || [];
}

export interface InvitationResult {
  success: boolean;
  sub?: string;
  email?: string;
  accountCreated?: boolean;
  linkAdded?: boolean;
  otp?: string;
  otpSent?: boolean;
  error?: string;
}

export interface IssuanceSessionResult {
  success: boolean;
  sessionId?: string;
  status?: string;
  offerUrl?: string;
  error?: string;
}

export function inviteWallet(payload: {
  email: string;
  studentId: string;
  institution?: string;
}): Promise<InvitationResult> {
  return request('/invitations', { method: 'POST', body: JSON.stringify(payload) });
}

export function createIssuanceSession(payload: {
  studentId: string;
  institution?: string;
  credentialData: Record<string, unknown>;
}): Promise<IssuanceSessionResult> {
  return request('/issuance-sessions', { method: 'POST', body: JSON.stringify(payload) });
}

export function acceptIssuanceTerms(sessionId: string): Promise<IssuanceSessionResult> {
  return request(`/issuance-sessions/${sessionId}/consent`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface OfferQrResult {
  success: boolean;
  sessionId?: string;
  qrDataUrl?: string;
  error?: string;
}

export function getOfferQr(sessionId: string): Promise<OfferQrResult> {
  return request(`/issuance-sessions/${sessionId}/offer-qr`);
}
