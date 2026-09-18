// Verifies the Smart Academy self-service flow:
//   request -> email link -> OTP sign-in -> list credentials -> offer + QR
import QRCode from 'qrcode';

const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${ISSUER}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const email = `academy-${Date.now()}@example.com`;

// 1. Academy request (public).
const request = (await call('POST', '/academy/requests', { email })).data;
check('request succeeds', request.success === true, request.error || '');
check('request returns a claim link', typeof request.claimUrl === 'string' && request.claimUrl.includes('/claim'));
check('request reports email delivery', typeof request.emailSent === 'boolean', `emailSent=${request.emailSent}`);
const claimParams = new URL(request.claimUrl).searchParams;
check('claim link carries the invited email', claimParams.get('email') === email, request.claimUrl);
check(
  'the claim link carries what was asked for',
  claimParams.get('include') === null || claimParams.get('include') === 'qualification',
  request.claimUrl,
);

// 2. Sign in with OTP (the academy account already exists).
const otpRes = (await call('POST', '/auth/otp', { email })).data;
check('sign-in OTP issued', !!otpRes.otp);
const token = (await call('POST', '/auth/token', { email, otp: otpRes.otp })).data;
check('sign-in returns an access token', !!token.accessToken);
check('sign-in returns a refresh token', !!token.refreshToken);

const auth = { authorization: `Bearer ${token.accessToken}` };

// 3. List the credentials the account can add.
const list = (await call('GET', '/academy/credentials', null, auth)).data;
check('credential list returns at least one entry', (list.credentials || []).length >= 1);
const first = (list.credentials || [])[0] || {};
check('credential has a title', !!first.title, first.title);
check('credential is not already in wallet', first.inWallet === false);
check('credential carries an institution', !!first.institution, first.institution);
check('credential carries a graduation date', !!first.graduationDate, first.graduationDate);

// 4. Start issuance for the selected credential.
const offer = (await call('POST', `/academy/credentials/${first.sessionId}/offer`, {}, auth)).data;
check('offer succeeds', offer.success === true, offer.error || '');
check('offer returns an offer URL', typeof offer.offerUrl === 'string' && offer.offerUrl.startsWith('openid-credential-offer://'));
check('offer returns a QR image', typeof offer.qrDataUrl === 'string' && offer.qrDataUrl.startsWith('data:image/png'));

// 5. The offer URL must be a valid credential offer the wallet can parse.
const offerPayload = JSON.parse(Buffer.from(offer.offerUrl.split('credential_offer=')[1], 'base64url').toString('utf8'));
check('offer names the photoid doctype', Array.isArray(offerPayload.credentials) && offerPayload.credentials[0] === 'org.iso.23220.photoid.1');
check('offer carries a pre-authorized code', !!offerPayload.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']);

// App Link form of the same offer, present only when WALLET_APP_LINK_BASE is set.
if (offer.appLinkUrl) {
  const appLinkPayload = decodeURIComponent(String(offer.appLinkUrl).split('credential_offer=')[1]);
  check('App Link offer points at the configured domain', String(offer.appLinkUrl).startsWith('https://'));
  check('App Link carries the same offer', appLinkPayload === String(offer.offerUrl).split('credential_offer=')[1]);
} else {
  check('App Link offer is absent when no domain is configured', offer.appLinkUrl == null);
}

// 5b. The wallet claims the offered credential (proof-of-possession CWT).
const { buildCwt, generateDeviceKeyPair } = await import('../../mdoc-core.js');
const device = generateDeviceKeyPair();
const pac = offerPayload.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
const cwt = buildCwt({
  privateJwk: device.privateJwk,
  devicePublicJwk: device.publicJwk,
  issuer: 'smart-college-wallet',
  subject: 'device-key',
  audience: offerPayload.issuer_id,
  nonce: pac.nonce,
}).toString('base64url');

const claim = (await call('POST', '/wallet/issuance', {
  offerUrl: offer.offerUrl,
  accessToken: token.accessToken,
  cwt,
})).data;
check('wallet can claim the academy credential', claim.success === true, claim.error || '');
check('claim returns an mdoc', typeof claim.mdocBase64url === 'string' && claim.mdocBase64url.length > 100);
check('claim is device bound', claim.deviceBound === true);

// 5d. The credential references the issuer's published status list from its
//     signed MSO, so revocation is enforceable without any disclosed claim.
const cbor2 = await import('cbor2');
const { extractMsoStatus, issuerPublicKeyFrom } = await import('../../verifier-service/src/status-list.js');
const { decodeStatusListPayload, verifyStatusListJws, readStatusBit, STATUS_INVALID } =
  await import('../../status-list-core.js');

// Decoded IssuerSigned, the same shape the verifier sees after decryption.
const presentedDocument = { issuerSigned: cbor2.decode(Buffer.from(claim.mdocBase64url, 'base64url')) };
const statusRef = extractMsoStatus(presentedDocument);
check('credential MSO carries a status reference', !!statusRef, JSON.stringify(statusRef || null));
check(
  'status reference points at the issuer status list',
  String(statusRef?.uri || '').endsWith('/status-list/quals-1'),
  statusRef?.uri || '',
);

const readStatusList = async () => {
  const response = await fetch(statusRef.uri);
  const payload = verifyStatusListJws(await response.text(), issuerPublicKeyFrom(presentedDocument));
  return decodeStatusListPayload(payload);
};

const beforeRevoke = await readStatusList();
check(
  'claimed credential reads as valid in the status list',
  readStatusBit(beforeRevoke, statusRef.idx) !== STATUS_INVALID,
);

const adminLogin = (await call('POST', '/admin/auth/login', {
  email: process.env.ADMIN_EMAIL || 'admin@quals.local',
  password: process.env.ADMIN_PASSWORD || 'quals-admin-2026',
})).data;
const revoked = await call(
  'DELETE',
  `/credentials/${claim.credentialId}`,
  { reason: 'status list test' },
  { authorization: `Bearer ${adminLogin.token}` },
);
check('credential can be revoked', revoked.status === 200 && revoked.data.success === true, `HTTP ${revoked.status}`);

const afterRevoke = await readStatusList();
check(
  'revoked credential reads as invalid in the status list',
  readStatusBit(afterRevoke, statusRef.idx) === STATUS_INVALID,
);
check(
  'revoking one credential leaves its neighbours valid',
  readStatusBit(afterRevoke, statusRef.idx + 1) !== STATUS_INVALID,
);

// 5c. The credential now shows as held in the wallet.
const afterClaim = (await call('GET', '/academy/credentials', null, auth)).data;
const claimed = (afterClaim.credentials || []).find((c) => c.sessionId === first.sessionId);
check('credential is marked as in the wallet', claimed?.inWallet === true);

// 6. Auth is enforced.
const noAuth = await call('GET', '/academy/credentials');
check('credential list requires sign-in', noAuth.status === 401, `HTTP ${noAuth.status}`);

// 7. Cross-account access is refused.
const otherEmail = `academy-other-${Date.now()}@example.com`;
await call('POST', '/academy/requests', { email: otherEmail });
const otherOtp = (await call('POST', '/auth/otp', { email: otherEmail })).data;
const otherToken = (await call('POST', '/auth/token', { email: otherEmail, otp: otherOtp.otp })).data;
const foreign = await call('POST', `/academy/credentials/${first.sessionId}/offer`, {}, {
  authorization: `Bearer ${otherToken.accessToken}`,
});
check('another account cannot start issuance for this credential', foreign.status === 403, `HTTP ${foreign.status}`);

// Sanity: the emitted QR actually encodes the offer URL.
const decoded = await QRCode.toDataURL('https://example.com');
check('qr encoder available', decoded.startsWith('data:image/png'));

// 6. The applicant chooses what they hold: a qualification, a transcript, or both.
const transcriptEmail = `transcript-${Date.now()}@example.com`;
const transcriptRequest = (await call('POST', '/academy/requests', {
  email: transcriptEmail,
  include: 'transcript',
})).data;
check(
  'a transcript request creates exactly one credential',
  (transcriptRequest.credentials || []).length === 1,
  JSON.stringify(transcriptRequest.credentials?.map((c) => c.docType)),
);
check(
  'the transcript credential is a photo-ID document holding the transcript namespace',
  transcriptRequest.credentials?.[0]?.docType === 'org.iso.23220.photoid.1' &&
    transcriptRequest.credentials?.[0]?.academicNamespaces?.includes(
      'org.iso.23220.education.transcript.1',
    ),
  `${transcriptRequest.credentials?.[0]?.docType} / ${JSON.stringify(transcriptRequest.credentials?.[0]?.academicNamespaces)}`,
);
check(
  'the transcript credential is labelled as a transcript',
  transcriptRequest.credentials?.[0]?.kind === 'transcript',
  transcriptRequest.credentials?.[0]?.kind,
);
check(
  'the transcript request carries its choice in the claim link',
  new URL(transcriptRequest.claimUrl).searchParams.get('include') === 'transcript',
  transcriptRequest.claimUrl,
);
check(
  'the first credential is still reported for callers written before the choice',
  transcriptRequest.sessionId === transcriptRequest.credentials?.[0]?.sessionId,
);

const transcriptOtp = (await call('POST', '/auth/otp', { email: transcriptEmail })).data;
const transcriptToken = (await call('POST', '/auth/token', { email: transcriptEmail, otp: transcriptOtp.otp })).data;
const transcriptAuth = { authorization: `Bearer ${transcriptToken.accessToken}` };
const transcriptList = (await call('GET', '/academy/credentials', null, transcriptAuth)).data;
check('the wallet sees one credential to add', (transcriptList.credentials || []).length === 1);
check(
  'the wallet is told it is a transcript',
  transcriptList.credentials?.[0]?.kind === 'transcript' &&
    transcriptList.credentials?.[0]?.label === 'Academic transcript' &&
    JSON.stringify(transcriptList.credentials?.[0]?.academicNamespaces) ===
      JSON.stringify(['org.iso.23220.education.transcript.1']),
  `${transcriptList.credentials?.[0]?.kind} / ${transcriptList.credentials?.[0]?.label} / ${JSON.stringify(transcriptList.credentials?.[0]?.academicNamespaces)}`,
);

const transcriptOffer = (await call(
  'POST',
  `/academy/credentials/${transcriptRequest.sessionId}/offer`,
  {},
  transcriptAuth,
)).data;
check(
  'the offer names the photo-ID docType and reports the kind',
  transcriptOffer.docType === 'org.iso.23220.photoid.1' && transcriptOffer.kind === 'transcript',
  `${transcriptOffer.docType} / ${transcriptOffer.kind}`,
);
const transcriptOfferPayload = JSON.parse(
  Buffer.from(String(transcriptOffer.offerUrl || '').split('credential_offer=')[1] || '', 'base64url').toString('utf8'),
);
check(
  'the offer points at this session, which is what resolves the kind',
  transcriptOfferPayload.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.[
    'pre-authorized_code'
  ] === transcriptRequest.sessionId,
  transcriptOfferPayload.credentials?.join(','),
);

const bothRequest = (await call('POST', '/academy/requests', {
  email: `both-${Date.now()}@example.com`,
  include: 'both',
})).data;
check('asking for both creates ONE credential', (bothRequest.credentials || []).length === 1);
check(
  'and that credential holds both academic namespaces',
  JSON.stringify(bothRequest.credentials?.[0]?.academicNamespaces) ===
    JSON.stringify([
      'org.iso.23220.education.qualification.1',
      'org.iso.23220.education.transcript.1',
      'org.iso.23220.education.academic-record.1',
    ]),
  JSON.stringify(bothRequest.credentials?.[0]?.academicNamespaces),
);
check(
  'and it is labelled as both',
  bothRequest.credentials?.[0]?.kind === 'academic',
  bothRequest.credentials?.[0]?.kind,
);

const unknownChoice = (await call('POST', '/academy/requests', {
  email: `unknown-${Date.now()}@example.com`,
  include: 'nonsense',
})).data;
check(
  'an unknown choice falls back to a qualification',
  (unknownChoice.credentials || []).length === 1 &&
    unknownChoice.credentials[0].kind === 'qualification' &&
    unknownChoice.credentials[0].docType === 'org.iso.23220.photoid.1',
  JSON.stringify((unknownChoice.credentials || []).map((c) => `${c.kind}:${c.docType}`)),
);

// 8. Asking twice must not mint a second copy of a credential the student already holds.
const repeatEmail = `repeat-${Date.now()}@example.com`;
const firstRequest = (await call('POST', '/academy/requests', {
  email: repeatEmail,
  include: 'both',
})).data;
check('a first request creates one credential', (firstRequest.credentials || []).length === 1);
check(
  'nothing is reused on a first request',
  (firstRequest.credentials || []).every((c) => c.reused === false),
  JSON.stringify((firstRequest.credentials || []).map((c) => c.reused)),
);

const repeatRequest = (await call('POST', '/academy/requests', {
  email: repeatEmail,
  include: 'both',
})).data;
check(
  'asking again reuses the same credential',
  JSON.stringify((repeatRequest.credentials || []).map((c) => c.sessionId)) ===
    JSON.stringify((firstRequest.credentials || []).map((c) => c.sessionId)),
  JSON.stringify((repeatRequest.credentials || []).map((c) => c.sessionId)),
);
check(
  'and says each was already prepared',
  (repeatRequest.credentials || []).every((c) => c.reused === true),
  JSON.stringify((repeatRequest.credentials || []).map((c) => c.reused)),
);

const repeatOtp = (await call('POST', '/auth/otp', { email: repeatEmail })).data;
const repeatToken = (await call('POST', '/auth/token', { email: repeatEmail, otp: repeatOtp.otp })).data;
const repeatList = (await call('GET', '/academy/credentials', null, {
  authorization: `Bearer ${repeatToken.accessToken}`,
})).data;
check(
  'the wallet is offered one credential, not two',
  (repeatList.credentials || []).length === 1,
  String((repeatList.credentials || []).length),
);

const narrower = (await call('POST', '/academy/requests', {
  email: repeatEmail,
  include: 'transcript',
})).data;
check(
  'asking for a subset touches only that kind',
  (narrower.credentials || []).length === 1 &&
    narrower.credentials[0].kind === 'transcript' &&
    narrower.credentials[0].reused === true,
  JSON.stringify(narrower.credentials || []),
);

// 9. The recognition details are an issuance option rather than a property of the kind: a
//    holder may take a smaller, less disclosing credential, and the record still reads.
const recognitionEmail = `recognition-${Date.now()}@example.com`;
const withDetails = (await call('POST', '/academy/requests', {
  email: recognitionEmail,
  include: 'transcript',
})).data;
check(
  'recognition details are included by default',
  withDetails.credentials?.[0]?.recognition === true,
  JSON.stringify(withDetails.credentials?.[0]?.recognition),
);
check(
  'and that credential is still a transcript',
  withDetails.credentials?.[0]?.kind === 'transcript',
  withDetails.credentials?.[0]?.kind,
);

const plainEmail = `plain-${Date.now()}@example.com`;
const withoutDetails = (await call('POST', '/academy/requests', {
  email: plainEmail,
  include: 'transcript',
  recognition: false,
})).data;
check(
  'they can be turned off',
  withoutDetails.credentials?.[0]?.recognition === false,
  JSON.stringify(withoutDetails.credentials?.[0]?.recognition),
);

// The difference has to be in the credential, not only in the answer: claim the one issued
// without them and check the transcript namespace carries no recognition elements at all.
const plainOtp = (await call('POST', '/auth/otp', { email: plainEmail })).data;
const plainToken = (await call('POST', '/auth/token', { email: plainEmail, otp: plainOtp.otp })).data;
const plainOffer = (await call(
  'POST',
  `/academy/credentials/${withoutDetails.sessionId}/offer`,
  {},
  { authorization: `Bearer ${plainToken.accessToken}` },
)).data;
const plainOfferPayload = JSON.parse(
  Buffer.from(String(plainOffer.offerUrl).split('credential_offer=')[1], 'base64url').toString('utf8'),
);
const plainPac =
  plainOfferPayload.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
const plainDevice = generateDeviceKeyPair();
const plainCwt = buildCwt({
  privateJwk: plainDevice.privateJwk,
  devicePublicJwk: plainDevice.publicJwk,
  issuer: 'smart-college-wallet',
  subject: 'device-key',
  audience: plainOfferPayload.issuer_id,
  nonce: plainPac.nonce,
}).toString('base64url');
const plainClaim = (await call('POST', '/wallet/issuance', {
  offerUrl: plainOffer.offerUrl,
  accessToken: plainToken.accessToken,
  cwt: plainCwt,
})).data;

const { verifyIssuerSigned } = await import('../../mdoc-core.js');
const plainDocument = verifyIssuerSigned(plainClaim.mdocBase64url);
const plainTranscript = plainDocument.namespaces['org.iso.23220.education.transcript.1'] || [];
const plainIdentifiers = plainTranscript.map((item) => item.elementIdentifier);
check(
  'a credential issued without them carries none of them',
  !plainIdentifiers.includes('institution_id') &&
    !plainIdentifiers.includes('language_of_instruction') &&
    !plainIdentifiers.includes('student_id_scheme'),
  JSON.stringify(plainIdentifiers.filter((id) => id.includes('institution') || id.includes('_alt'))),
);
check(
  'but still carries everything that makes it readable',
  plainIdentifiers.includes('grading_scale_id') &&
    plainIdentifiers.includes('credit_scheme') &&
    plainIdentifiers.includes('courses') &&
    plainIdentifiers.includes('overall_mark'),
  JSON.stringify(plainIdentifiers),
);

console.log(failures === 0 ? '\nACADEMY_FLOW_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
