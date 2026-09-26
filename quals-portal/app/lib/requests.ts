/**
 * Client for the request domain, proxied through /api/* by the server-side route handler.
 *
 * The portal's proxy attaches the signed-in administrator's token, so every call here is made as
 * that administrator: the issuer reads the institution from their scope, which is why nothing in
 * this file sends an institution of its own.
 */

const PREFIX = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PREFIX}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    throw error;
  }
  return data as T;
}

/** A row in the queue, as the issuer summarises it. */
export interface CredentialRequest {
  requestId: string;
  institution: string;
  school: string;
  applicantEmail: string;
  applicantPhone?: string | null;
  applicantName?: string | null;
  wanted: string[];
  status: string;
  applicantStatus: string;
  identityStatus: string;
  fee?: { amount: number; currency: string } | null;
  paymentStatus: string;
  submittedAt?: string | null;
  dueAt?: string | null;
  ageWorkingDays: number;
  overdue: boolean;
  decision?: string | null;
  decisionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  issuedAt?: string | null;
  invitationId?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

/** One case, with what a decision needs. */
export interface RequestDetail extends CredentialRequest {
  extract: Record<string, unknown> | null;
  identitySummary: Record<string, unknown> | null;
  canDecide: boolean;
  canUpload: boolean;
  canIssue: boolean;
  events: Array<{ event: string; actor?: string | null; detail?: unknown; createdAt: string }>;
  payloads: Array<{
    payload_id: string;
    filename?: string | null;
    row_count: number;
    uploaded_by?: string | null;
    uploaded_at: string;
  }>;
}

export interface PreviewCredential {
  kind: string;
  label: string;
  namespaces: string[];
  /** The modules on their own, so this screen needs nothing about how claims are laid out. */
  courses: Array<{ courseCode?: string; courseName?: string; credits?: number; grade?: string }>;
  display: {
    title?: string | null;
    degreeLevel?: string | null;
    fieldOfStudy?: string | null;
    graduationDate?: string | null;
    institution?: string | null;
    totalCredits?: number | null;
    courseCount?: number | null;
    studentId?: string | null;
  };
  claims: Record<string, Record<string, unknown>>;
}

export interface RequestPreview {
  requestId: string;
  holder: { email: string; name?: string | null; studentId?: string | null; verifiedName?: string | null };
  decision: { accepted: boolean; reason?: string | null };
  payload: { filename?: string | null; rowCount: number; uploadedAt?: string | null };
  credentials: PreviewCredential[];
}

export async function listRequests(status?: string): Promise<CredentialRequest[]> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request<{ requests?: CredentialRequest[] }>(`/admin/requests${query}`);
  return data.requests || [];
}

export async function getRequest(requestId: string): Promise<RequestDetail> {
  const data = await request<{ request: RequestDetail }>(`/admin/requests/${encodeURIComponent(requestId)}`);
  return data.request;
}

export async function decideRequest(
  requestId: string,
  body: { decision: 'accepted' | 'declined'; reason: string; note?: string },
): Promise<{ request: CredentialRequest; emailSent: boolean }> {
  return request(`/admin/requests/${encodeURIComponent(requestId)}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upload the institution's file. Failures carry the row-by-row reasons, so this one returns the
 * refusal rather than throwing it: a refused file is a normal outcome the operator has to see.
 */
export async function uploadRequestPayload(
  requestId: string,
  body: { csv: string; filename?: string | null },
): Promise<
  | { ok: true; rowCount: number; credentials: Array<{ kind: string; label: string; title: string }> }
  | { ok: false; error: string; details?: { errors?: string[]; rows?: Array<{ line: number; errors: string[] }> } }
> {
  const res = await fetch(`${PREFIX}/admin/requests/${encodeURIComponent(requestId)}/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { error?: string }).error || `Request failed (${res.status})`,
      details: (data as { details?: { errors?: string[] } }).details,
    };
  }
  return data as { ok: true; rowCount: number; credentials: Array<{ kind: string; label: string; title: string }> };
}

export async function previewRequestPayload(requestId: string): Promise<RequestPreview> {
  const data = await request<{ preview: RequestPreview }>(
    `/admin/requests/${encodeURIComponent(requestId)}/payload/preview`,
  );
  return data.preview;
}

export async function issueRequest(
  requestId: string,
): Promise<{ reused: boolean; invitationId: string; link?: string | null; expiresAt?: string | null; emailSent?: boolean | null }> {
  return request(`/admin/requests/${encodeURIComponent(requestId)}/issue`, { method: 'POST' });
}

/** The columns the file may carry, so the screen can say what is expected rather than only refuse. */
export const CSV_TEMPLATE = [
  'email,full_name,student_id,credential,programme_title,degree_level,field_of_study,graduation_date,institution_name,total_credits,courses',
  'holder@example.com,Ada Lovelace,SA-1001,both,BSc Computer Science,Bachelor,Computer Science,2024-06-30,Smart Academy,3,"[{""courseCode"":""CS101"",""courseName"":""Introduction to Programming"",""credits"":3,""grade"":""A"",""gradePoints"":4}]"',
].join('\n');
