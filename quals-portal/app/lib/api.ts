/**
 * Client for the issuer service, proxied through /api/* by the server-side
 * route handler (which attaches the admin key).
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

/* ── Overview ───────────────────────────────────────────────────────────── */

export interface Statistics {
  issuerId?: string;
  issuerName?: string;
  totalIssued?: number;
  totalRevoked?: number;
  totalVerified?: number;
  credentialsInSystem?: number;
  activeCredentials?: number;
}

export async function getStatistics(): Promise<Statistics> {
  const data = await request<{ statistics?: Statistics } & Statistics>('/statistics');
  return data.statistics || data;
}

/* ── Credentials ────────────────────────────────────────────────────────── */

export interface Credential {
  credentialId: string;
  credentialType?: string;
  docType?: string;
  status?: string;
  studentId?: string;
  institution?: string;
  full_name?: string;
  createdAt?: string;
  issue_date?: string;
  expiry_date?: string;
  [key: string]: unknown;
}

export async function listCredentials(params: { studentId?: string; status?: string } = {}): Promise<Credential[]> {
  const qs = new URLSearchParams();
  if (params.studentId) qs.set('studentId', params.studentId);
  if (params.status) qs.set('status', params.status);
  qs.set('pageSize', '200');
  const data = await request<{ credentials?: Credential[] }>(`/credentials?${qs.toString()}`);
  return data.credentials || [];
}

/* ── Client organisations and API keys ──────────────────────────────────── */

export interface ClientOrg {
  institution: string;
  name: string;
  createdAt?: string;
}

export interface ApiKey {
  keyId: string;
  institution: string;
  name?: string | null;
  /** Only the leading characters are kept; the secret is never stored. */
  prefix: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  active: boolean;
}

export interface CreatedApiKey {
  success: boolean;
  keyId: string;
  key: string;
  institution: string;
  error?: string;
}

export async function listOrgs(): Promise<ClientOrg[]> {
  const data = await request<{ orgs?: ClientOrg[] }>('/admin/orgs');
  return data.orgs || [];
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const data = await request<{ keys?: ApiKey[] }>('/admin/api-keys');
  return data.keys || [];
}

export function createApiKey(payload: { institution?: string; name?: string }): Promise<CreatedApiKey> {
  return request<CreatedApiKey>('/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function revokeApiKey(keyId: string): Promise<{ success: boolean; error?: string }> {
  return request<{ success: boolean; error?: string }>(`/admin/api-keys/${keyId}`, { method: 'DELETE' });
}

export function revokeCredential(credentialId: string, reason: string) {
  return request<{ success: boolean; error?: string }>(`/credentials/${credentialId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

/* ── Sharing ────────────────────────────────────────────────────────────── */

export interface Share {
  shareId: string;
  credentialId: string;
  senderEmail?: string | null;
  recipientEmail: string;
  recipientName: string;
  message?: string;
  status: string;
  categories?: string[];
  disclosedFields?: number;
  createdAt: string;
  expiresAt: string;
  viewedAt?: string | null;
  downloadedAt?: string | null;
}

export async function listShares(): Promise<Share[]> {
  const data = await request<{ shares?: Share[] }>('/shares');
  return data.shares || [];
}

export function revokeShare(shareId: string, reason: string) {
  return request<{ success: boolean; error?: string }>(`/shares/${shareId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });
}

/* ── Wallet accounts ────────────────────────────────────────────────────── */

export interface WalletAccount {
  sub: string;
  email: string;
  emailVerified: boolean;
  active: boolean;
  deletedAt?: string | null;
  createdAt: string;
  links: { institution: string; studentId: string }[];
  activeRefreshTokens: number;
}

export async function listAccounts(): Promise<WalletAccount[]> {
  const data = await request<{ accounts?: WalletAccount[] }>('/admin/accounts');
  return data.accounts || [];
}

export function deactivateAccount(sub: string) {
  return request<{ success: boolean; error?: string }>(`/admin/accounts/${encodeURIComponent(sub)}/deactivate`, {
    method: 'POST',
  });
}

export function activateAccount(sub: string) {
  return request<{ success: boolean; error?: string }>(`/admin/accounts/${encodeURIComponent(sub)}/activate`, {
    method: 'POST',
  });
}

export function deleteAccount(sub: string) {
  return request<{ success: boolean; error?: string }>(`/admin/accounts/${encodeURIComponent(sub)}/delete`, {
    method: 'POST',
  });
}

/* ── Audit ──────────────────────────────────────────────────────────────── */

export interface AuditEntry {
  timestamp: string;
  action: string;
  credentialId?: string;
  studentId?: string;
  shareId?: string;
  details?: Record<string, unknown>;
}

export async function getAuditLog(limit = 200): Promise<AuditEntry[]> {
  const data = await request<{ auditLog?: AuditEntry[] }>(`/audit-log?limit=${limit}`);
  return data.auditLog || [];
}
