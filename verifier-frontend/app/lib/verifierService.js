const API_BASE = process.env.NEXT_PUBLIC_VERIFIER_API || '';

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

export async function verifyCredential(qrPayload) {
  return request('/verify/scan', { method: 'POST', body: JSON.stringify(qrPayload) });
}

export async function getVerification(verificationId) {
  const data = await request(`/verify/verification/${encodeURIComponent(verificationId)}`);
  return data.verification || data;
}

export async function listVerifications(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.issuerId) params.append('issuerId', filters.issuerId);
  const qs = params.toString();
  const data = await request(`/verify/verifications${qs ? `?${qs}` : ''}`);
  return data.verifications || [];
}

export async function getStatistics() {
  const data = await request('/verify/statistics');
  return data.statistics || data;
}

export async function listIssuers(status = null) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await request(`/registry/verifiers${qs}`);
  return data.issuers || [];
}

export async function approveIssuer(issuerId) {
  return request(`/registry/verifiers/${encodeURIComponent(issuerId)}/approve`, { method: 'POST' });
}

export async function blockIssuer(issuerId, reason = 'Manual blocking') {
  return request(`/registry/verifiers/${encodeURIComponent(issuerId)}/block`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function updateTrustScore(issuerId, trustScore) {
  return request(`/registry/verifiers/${encodeURIComponent(issuerId)}/trust-score`, {
    method: 'PUT',
    body: JSON.stringify({ trustScore }),
  });
}
