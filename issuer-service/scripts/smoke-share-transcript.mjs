// End-to-end smoke test for sharing a transcript credential: issue a transcript,
// share only the transcript information, and check what the recipient actually
// receives. Mirrors smoke-share.mjs, which does the same for a qualification.
//
// The transcript is a photo-ID document (the personal components) whose academic
// claims live in the transcript namespace - the grades, one element of which is a
// JSON course list. A qualification credential shared the same way must still not
// disclose any of it.
import * as cbor2 from 'cbor2';
import { buildCwt, generateDeviceKeyPair } from '../../mdoc-core.js';
import { buildEncryptedDeviceResponse } from '../../verifier-service/tests/helpers/test-wallet.js';

const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';
const SENDER = 'transcript.sender@example.com';
const RECIPIENT = 'registrar@example.com';
const STUDENT = 'S-TRANSCRIPT1';
const INSTITUTION = 'Smart Academy';
const PHOTOID_DOCTYPE = 'org.iso.23220.photoid.1';

const COURSES = [
  { courseCode: 'FI501', courseName: 'Corporate Finance', credits: 9, grade: 8.1 },
  { courseCode: 'FI502', courseName: 'Derivatives', credits: 6, grade: 7.4 },
  { courseCode: 'EC510', courseName: 'Econometrics', credits: 12, grade: 9.0 },
];
const TOTAL_CREDITS = COURSES.reduce((sum, course) => sum + course.credits, 0);

const b64urlToBytes = (v) => {
  const s = v.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return new Uint8Array(Buffer.from(s + pad, 'base64'));
};
const bytesToB64url = (b) => Buffer.from(b).toString('base64url');
const bytesToHex = (b) => Buffer.from(b).toString('hex');

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

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

// 1. Invite the holder, then sign in (the dev issuer returns the OTP).
const invite = await post('/invitations', {
  email: SENDER,
  studentId: STUDENT,
  institution: INSTITUTION,
});
const otpReq = await post('/auth/otp', { email: SENDER });
const otp = otpReq.otp || invite.otp;
if (!otp) throw new Error('No OTP available (email configured + no dev fallback)');
const token = await post('/auth/token', { email: SENDER, otp });

// 2. A transcript credential: the personal components plus the grades, and no
//    qualification claims at all.
const session = await post('/issuance-sessions', {
  studentId: STUDENT,
  institution: INSTITUTION,
  credentialData: {
    docType: PHOTOID_DOCTYPE,
    full_name: 'Tessa Transcript',
    date_of_birth: '1990-01-01',
    document_number: 'D-TRANSCRIPT-1',
    issuing_authority: INSTITUTION,
    issue_date: '2025-03-24',
    expiry_date: '2031-03-24',
    issuing_country: 'NL',
    education_transcript: {
      student_id: STUDENT,
      courses: COURSES,
      total_credits: TOTAL_CREDITS,
      status: 'completed',
    },
  },
});
await post(`/issuance-sessions/${session.sessionId}/consent`, {});

// 3. Claim it with a device key.
const offer = JSON.parse(
  Buffer.from(session.offerUrl.split('credential_offer=')[1], 'base64url').toString('utf8'),
);
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
const claim = await post('/wallet/issuance', { offerUrl: session.offerUrl, accessToken: token.accessToken, cwt });
console.log('claim ok, credentialId=', claim.credentialId);
console.log('offer names:', JSON.stringify(offer.credentials));

// 4. Share the transcript information with a registrar.
const share = await post('/shares', {
  accessToken: token.accessToken,
  credentialId: claim.credentialId,
  categories: ['personal', 'transcript'],
  recipientName: 'Trust University Admissions',
  recipientEmail: RECIPIENT,
  message: 'Transcript for my application.',
});

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
if (!mdoc.success) throw new Error(`mdoc not retrievable: ${mdoc.error || ''}`);
const envelope = await buildEncryptedDeviceResponse({
  origin: share.origin,
  nonceHex,
  readerJwk,
  issuerSigned: b64urlToBytes(mdoc.mdocBase64url),
  docType: PHOTOID_DOCTYPE,
  devicePrivateJwk: device.privateJwk,
});

await post(`/shares/${share.shareId}/response`, {
  accessToken: token.accessToken,
  credential: { protocol: 'org-iso-mdoc', data: envelope },
});

// 5. What the registrar receives.
const recipientInvite = await post(`/shares/${share.shareId}/otp`, { email: RECIPIENT });
const verified = await post(`/shares/${share.shareId}/verify`, {
  email: RECIPIENT,
  otp: recipientInvite.otp,
});
await post(`/shares/${share.shareId}/accept-terms`, { recipientToken: verified.recipientToken });
const view = await post(`/shares/${share.shareId}/view`, { recipientToken: verified.recipientToken });
const claims = view.claims || {};

console.log('\n--- transcript claims the registrar receives ---');
console.log(JSON.stringify(claims, null, 2));

check('the grades arrive as a course list', typeof claims.courses === 'string' && claims.courses.includes('FI501'));
check('the courses keep their credits and grades', (() => {
  try {
    const parsed = JSON.parse(claims.courses);
    return Array.isArray(parsed) && parsed.length === COURSES.length
      && parsed.every((course, index) => course.credits === COURSES[index].credits);
  } catch { return false; }
})());
check(
  'the total credits arrive',
  claims.total_credits === TOTAL_CREDITS,
  `${claims.total_credits} (expected ${TOTAL_CREDITS})`,
);
check('the completion status arrives', claims.status === 'completed', String(claims.status));
check('the student id arrives', claims.student_id === STUDENT, String(claims.student_id));
check('the personal components arrive with it', claims.given_name === 'Tessa' && !!claims.family_name);
check(
  'the recipient is told which credential was shared',
  view.kind === 'transcript' && view.kindLabel === 'Academic transcript',
  `${view.kind} / ${view.kindLabel}`,
);
check(
  'no qualification claims are disclosed',
  claims.institution_name === undefined
    && claims.degree_level === undefined
    && claims.gpa === undefined,
  JSON.stringify(claims.institution_name ?? null),
);

// The PDF is labelled by kind too: the text is written uncompressed, so the label is
// readable in the bytes the recipient downloads.
const pdfResponse = await fetch(
  `${ISSUER}/shares/${share.shareId}/pdf?token=${encodeURIComponent(verified.recipientToken)}`,
);
const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer()).toString('latin1');
check(
  'the share PDF downloads',
  pdfResponse.ok && (pdfResponse.headers.get('content-type') || '').includes('pdf'),
  `${pdfResponse.status} ${pdfResponse.headers.get('content-type')}`,
);
check(
  'the share PDF is labelled by kind',
  pdfBytes.includes('Academic transcript'),
  `title present: ${pdfBytes.includes('Academic transcript')}`,
);

console.log(failures === 0 ? '\nTRANSCRIPT_SHARE_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
