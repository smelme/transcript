// Verifies that the issuer refuses to start a share for a revoked credential.
import { buildCwt, generateDeviceKeyPair } from '../../mdoc-core.js';

const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';

async function post(path, body, expect = null) {
  const res = await fetch(`${ISSUER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (expect && res.status !== expect) throw new Error(`${path}: expected ${expect}, got ${res.status}`);
  return { status: res.status, data };
}

const email = `revoked-${Date.now()}@example.com`;
const invite = (await post('/invitations', { email, studentId: 'S-REV', institution: 'Smart Academy' })).data;
const token = (await post('/auth/token', { email, otp: invite.otp })).data;

const session = (await post('/issuance-sessions', {
  studentId: 'S-REV',
  institution: 'Smart Academy',
  credentialData: { docType: 'org.iso.23220.photoid.1', full_name: 'Revoked Person', date_of_birth: '1990-01-01', issuing_authority: 'Smart Academy' },
})).data;
await post(`/issuance-sessions/${session.sessionId}/consent`, {});

const device = generateDeviceKeyPair();
const offer = JSON.parse(Buffer.from(session.offerUrl.split('credential_offer=')[1], 'base64url').toString('utf8'));
const pac = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
const cwt = buildCwt({
  privateJwk: device.privateJwk,
  devicePublicJwk: device.publicJwk,
  issuer: 'smart-college-wallet',
  subject: 'device-key',
  audience: offer.issuer_id,
  nonce: pac.nonce,
}).toString('base64url');

const claim = (await post('/wallet/issuance', { offerUrl: session.offerUrl, accessToken: token.accessToken, cwt })).data;

// Revoke it. Revocation is admin-only, so authenticate as an administrator.
const adminLogin = (await post('/admin/auth/login', {
  email: process.env.ADMIN_EMAIL || 'admin@quals.local',
  password: process.env.ADMIN_PASSWORD || 'quals-admin-2026',
})).data;
const del = await fetch(`${ISSUER}/credentials/${claim.credentialId}`, {
  method: 'DELETE',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${adminLogin.token}`,
  },
  body: JSON.stringify({ reason: 'test revocation' }),
});
console.log('revoke status', del.status);
if (del.status !== 200) {
  console.log(`FAIL  revoking requires an authenticated administrator — HTTP ${del.status}`);
  process.exit(1);
}

const share = await post('/shares', {
  accessToken: token.accessToken,
  credentialId: claim.credentialId,
  categories: ['personal'],
  recipientName: 'R',
  recipientEmail: 'r@example.com',
});
const rejected = share.status === 400 && /revoked/i.test(share.data.error || '');
console.log(`${rejected ? 'PASS' : 'FAIL'}  sharing a revoked credential is rejected — HTTP ${share.status}: ${share.data.error || ''}`);
process.exit(rejected ? 0 : 1);
