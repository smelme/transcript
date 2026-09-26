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

/* ── Smart Academy self-service flow ────────────────────────────────────── */

export interface AcademyRequestResult {
  success: boolean;
  email?: string;
  studentId?: string;
  claimUrl?: string;
  emailSent?: boolean;
  sessionId?: string;
  credential?: { title?: string; graduationDate?: string };
  /** Everything the issuer prepared for this request, one entry per credential. */
  credentials?: AcademyPreparedCredential[];
  message?: string;
  error?: string;
}

/**
 * What the applicant asks to hold. `both` is an explicit choice rather than a side effect
 * of selecting two things, and anything unrecognised behaves as `qualification`.
 */
export type CredentialChoice = 'qualification' | 'transcript' | 'both';

/** One credential the issuer has prepared and is waiting for the holder to claim. */
export interface AcademyPreparedCredential {
  sessionId: string;
  kind: string;
  label: string;
  docType: string;
  /** Every academic namespace the credential holds: both of them for a combined credential. */
  academicNamespaces: string[];
  /** True when this credential carries the recognition details (Tier 2). */
  recognition?: boolean;
  /** True when this request matched a credential already prepared: nothing new was created. */
  reused: boolean;
  /** How many prepared credentials were replaced because they held an older claim set. */
  superseded?: number;
  inWallet: boolean;
  title: string;
  graduationDate?: string | null;
  totalCredits?: number | null;
  courseCount?: number | null;
}

export interface AcademyCredential {
  sessionId: string;
  status: string;
  inWallet: boolean;
  /** The kind, derived from the academic namespace: both kinds share the photo-ID docType. */
  kind: string;
  label: string;
  docType: string;
  academicNamespaces: string[];
  title: string;
  institution: string;
  degreeLevel?: string | null;
  fieldOfStudy?: string | null;
  graduationDate?: string | null;
  studentId: string;
  country?: string | null;
  totalCredits?: number | null;
  courseCount?: number | null;
  holderName?: string | null;
}

export interface AcademyOfferResult {
  success: boolean;
  sessionId?: string;
  docType?: string;
  offerUrl?: string;
  appLinkUrl?: string | null;
  qrDataUrl?: string;
  /** Kept for callers of older issuers, which refused a credential already in the wallet. */
  alreadyInWallet?: boolean;
  /** True when this offer issues another copy of a credential the wallet already holds. */
  reissued?: boolean;
  error?: string;
}

/** Ask the academy to prepare credentials and email a secure link. */
// requestCredentials() used to live here. It called POST /academy/requests, which *generated* a
// record — the graduation year from a range, the modules from a demo fixture, the credits
// computed — and that route is now disabled unless a deployment sets ALLOW_DEMO_RECORDS (P0-41).
//
// The academy publishes the record it actually holds instead: the page calls this site's own
// /api/publish, which asks the institution's registry, which builds the claims from what it keeps
// and publishes them to the issuer with its own key.

export function requestSignInOtp(email: string): Promise<{ success: boolean; otp?: string; otpSent?: boolean; error?: string }> {
  // Saying which site is asking, so the message is worded for this site rather than for the
  // wallet. The two sign a person in to different things and the code is not interchangeable.
  return request('/auth/otp', { method: 'POST', body: JSON.stringify({ email, audience: 'academy' }) });
}

export function exchangeToken(
  email: string,
  otp: string,
): Promise<{ success: boolean; accessToken?: string; refreshToken?: string; email?: string; error?: string }> {
  return request('/auth/token', { method: 'POST', body: JSON.stringify({ email, otp }) });
}

export function listAcademyCredentials(
  token: string,
): Promise<{ success: boolean; email?: string; credentials?: AcademyCredential[]; error?: string }> {
  return request('/academy/credentials', { headers: { Authorization: `Bearer ${token}` } });
}

export function createAcademyOffer(
  sessionId: string,
  token: string,
): Promise<AcademyOfferResult> {
  return request(`/academy/credentials/${sessionId}/offer`, {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { Authorization: `Bearer ${token}` },
  });
}
