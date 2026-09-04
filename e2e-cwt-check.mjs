import { buildCwt, generateDeviceKeyPair } from './mdoc-core.js';

const BASE = 'http://localhost:3000';
const email = 'e2e-cwt@example.com';
const studentId = 'E2E-001';
const institution = 'issuer-001';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 1. invite
const inv = await post('/invitations', { email, studentId, institution });
if (!inv.success) throw new Error('invite failed: ' + inv.error);
console.log('invite ok, sub=', inv.sub, 'otp=', inv.otp);

// 2. verify OTP
const v = await post('/otp/verify', { email, otp: inv.otp });
console.log('verifyOtp', v.success);

// 3. sign in
const otpReq = await post('/auth/otp', { email });
const tok = await post('/auth/token', { email, otp: otpReq.otp });
if (!tok.success) throw new Error('token failed: ' + tok.error);
console.log('token ok');

// 4. create session
const sess = await post('/issuance-sessions', {
  studentId,
  institution,
  credentialData: {
    docType: 'org.iso.23220.photoid.1',
    full_name: 'Erika Mustermann',
    date_of_birth: '1964-08-12',
    document_number: 'Z021AB37X13',
    issuing_authority: 'Smart College',
    issue_date: '2025-03-24',
    expiry_date: '2031-03-24',
    issuing_country: 'NL',
  },
});
if (!sess.success) throw new Error('session failed: ' + sess.error);
console.log('session', sess.sessionId);

// 5. accept terms
await post(`/issuance-sessions/${sess.sessionId}/consent`, {});

// 6. offer QR endpoint
const qrRes = await fetch(`${BASE}/issuance-sessions/${sess.sessionId}/offer-qr`);
const qr = await qrRes.json();
console.log('offer-qr success', qr.success, 'dataUrl prefix', qr.qrDataUrl?.slice(0, 30));

// 7. parse nonce + issuer_id from the offer URL
const encoded = sess.offerUrl.match(/credential_offer=([^&]+)/)[1];
const offer = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
const nonce = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'].nonce;
const issuerId = offer.issuer_id;
console.log('offer issuer_id=', issuerId, 'nonce=', nonce);

// 8. build CWT
const { publicJwk, privateJwk } = generateDeviceKeyPair();
const cwt = buildCwt({
  privateJwk,
  devicePublicJwk: publicJwk,
  issuer: issuerId,
  subject: 'e2e-device',
  audience: issuerId,
  nonce,
}).toString('base64url');

// 9. wallet issuance
const issued = await post('/wallet/issuance', {
  offerUrl: sess.offerUrl,
  accessToken: tok.accessToken,
  cwt,
});
console.log('issuance success', issued.success, 'deviceBound', issued.deviceBound, 'error', issued.error);
if (!issued.success) throw new Error('issuance failed: ' + issued.error);
console.log('credentialId', issued.credentialId, 'mdoc length', issued.mdocBase64url?.length);
console.log('E2E CWT FLOW: OK');
