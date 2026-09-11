// End-to-end smoke test for the issuer share flow, simulating the wallet's
// HTTP calls (invite -> sign-in -> claim -> share -> envelope -> submit) and
// then exercising the recipient OTP/verify/view endpoints.
import * as cbor2 from 'cbor2';
import { buildCwt, generateDeviceKeyPair } from '../../mdoc-core.js';
import { buildEncryptedDeviceResponse } from '../../verifier-service/tests/helpers/test-wallet.js';

const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';
const SENDER = 'share.sender@example.com';
const RECIPIENT = 'recipient@example.com';
const STUDENT = 'S-SHARE1';
const INSTITUTION = 'Smart Academy';
const DOC_TYPE = 'org.iso.23220.photoid.1';

const b64urlToBytes = (v) => {
  const s = v.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return new Uint8Array(Buffer.from(s + pad, 'base64'));
};
const bytesToB64url = (b) => Buffer.from(b).toString('base64url');
const bytesToHex = (b) => Buffer.from(b).toString('hex');

async function post(path, body) {
  const res = await fetch(`${ISSUER}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error || res.status}`);
  return data;
}

// 1. Invite sender (dev fallback returns OTP because Brevo is unreachable)
const invite = await post('/invitations', { email: SENDER, studentId: STUDENT, institution: INSTITUTION });

// 2. Sign in: request a fresh OTP, then exchange for a token.
const otpReq = await post('/auth/otp', { email: SENDER });
const otp = otpReq.otp || invite.otp;
if (!otp) throw new Error('No OTP available (email configured + no dev fallback)');
const token = await post('/auth/token', { email: SENDER, otp });
console.log('sign-in ok');

// 3. Create issuance session + consent.
const session = await post('/issuance-sessions', {
  studentId: STUDENT,
  institution: INSTITUTION,
  credentialData: {
    docType: DOC_TYPE,
    full_name: 'Share Sender',
    date_of_birth: '1990-01-01',
    document_number: 'D-SHARE-1',
    issuing_authority: INSTITUTION,
    issue_date: '2025-03-24',
    expiry_date: '2031-03-24',
    issuing_country: 'NL',
    education_qualification: {
      institution_name: INSTITUTION,
      degree_level: 'Bachelor',
      field_of_study: 'Computer Science',
      graduation_date: '2025-06-30',
      gpa: 3.6,
    },
    education_transcript: {
      student_id: STUDENT,
      courses: [{ courseCode: 'CS101', courseName: 'Intro', credits: 3 }],
      total_credits: 120,
      status: 'completed',
    },
  },
});
await post(`/issuance-sessions/${session.sessionId}/consent`, {});

// 4. Claim: build a CWT with a fresh device key and POST /wallet/issuance.
const offerUrl = session.offerUrl;
const offer = JSON.parse(Buffer.from(offerUrl.split('credential_offer=')[1], 'base64url').toString('utf8'));
const pac = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
const device = generateDeviceKeyPair();
const cwt = buildCwt({
  privateJwk: device.privateJwk,
  devicePublicJwk: device.publicJwk,
  issuer: 'smart-college-wallet',
  subject: 'device-key',
  audience: offer.issuer_id,
  nonce: pac.nonce,
}).toString('base64url');
const claim = await post('/wallet/issuance', { offerUrl, accessToken: token.accessToken, cwt });
console.log('claim ok, credentialId=', claim.credentialId);

// 5. Create the share. The qualification credential holds the identity and
//    qualification namespaces; a transcript is a credential of its own.
const share = await post('/shares', {
  accessToken: token.accessToken,
  credentialId: claim.credentialId,
  categories: ['personal', 'qualification'],
  recipientName: 'Recipient Person',
  recipientEmail: RECIPIENT,
  message: 'Here are my documents for the application.',
});
console.log('share created, shareId=', share.shareId);

// 6. Decode the encryptionInfo to get nonce + reader JWK, then build the
//    encrypted DeviceResponse with the same device key used at claim time.
const encInfo = cbor2.decode(b64urlToBytes(share.encryptionInfo));
const params = encInfo[1];
const nonceHex = bytesToHex(params.nonce);
const coseKey = params.recipientPublicKey;
const readerJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: bytesToB64url(coseKey.get(-2)),
  y: bytesToB64url(coseKey.get(-3)),
};

const mdoc = await fetch(`${ISSUER}/credentials/${claim.credentialId}/mdoc`).then((r) => r.json());
if (!mdoc.success) throw new Error('mdoc not retrievable: ' + (mdoc.error || ''));
const issuerSigned = b64urlToBytes(mdoc.mdocBase64url);

const envelope = await buildEncryptedDeviceResponse({
  origin: share.origin,
  nonceHex,
  readerJwk,
  issuerSigned,
  docType: DOC_TYPE,
  devicePrivateJwk: device.privateJwk,
});

// 7. Submit the envelope.
const submitted = await post(`/shares/${share.shareId}/response`, {
  accessToken: token.accessToken,
  credential: { protocol: 'org-iso-mdoc', data: envelope },
});
console.log('submit ok, status=', submitted.status);

// 8. Recipient flow: OTP -> verify -> accept terms -> view.
const otpForRecipient = await post(`/shares/${share.shareId}/otp`, { email: RECIPIENT });
const recipientOtp = otpForRecipient.otp;
if (!recipientOtp) throw new Error('No recipient OTP (email configured)');
const verified = await post(`/shares/${share.shareId}/verify`, { email: RECIPIENT, otp: recipientOtp });
await post(`/shares/${share.shareId}/accept-terms`, { recipientToken: verified.recipientToken });
const view = await post(`/shares/${share.shareId}/view`, { recipientToken: verified.recipientToken });
console.log('view ok, claims=', JSON.stringify(view.claims));

// 9. Download the PDF copy.
const pdfRes = await fetch(`${ISSUER}/shares/${share.shareId}/pdf?token=${encodeURIComponent(verified.recipientToken)}`);
const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
if (!pdfRes.ok || pdfBytes.length < 100) throw new Error('PDF download failed');
if (pdfBytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF magic bytes missing');
console.log('pdf ok, bytes=', pdfBytes.length);

// 10. List shares. Listing spans every holder and organisation, so it is a
// platform-operator view: a client organisation never sees other holders' shares.
const platformLogin = await fetch(`${ISSUER}/admin/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL || 'admin@quals.local',
    password: process.env.ADMIN_PASSWORD || 'quals-admin-2026',
  }),
}).then((r) => r.json());
if (!platformLogin.token) throw new Error('platform administrator sign-in failed');

const anonymousList = await fetch(`${ISSUER}/shares`);
if (anonymousList.status !== 401) {
  throw new Error(`unauthenticated share listing was allowed (HTTP ${anonymousList.status})`);
}

const list = await fetch(`${ISSUER}/shares`, {
  headers: { authorization: `Bearer ${platformLogin.token}` },
}).then((r) => r.json());
console.log('shares list count=', list.shares.length, 'status=', list.shares[0]?.status);
console.log('SMOKE_TEST_PASSED');
