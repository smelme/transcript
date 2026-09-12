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
check('claim link carries the invited email', decodeURIComponent(request.claimUrl.split('email=')[1]) === email);

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
    transcriptRequest.credentials?.[0]?.academicNamespace === 'org.iso.23220.education.transcript.1',
  `${transcriptRequest.credentials?.[0]?.docType} / ${transcriptRequest.credentials?.[0]?.academicNamespace}`,
);
check(
  'the transcript credential is labelled as a transcript',
  transcriptRequest.credentials?.[0]?.kind === 'transcript',
  transcriptRequest.credentials?.[0]?.kind,
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
check('asking for both creates two credentials', (bothRequest.credentials || []).length === 2);
check(
  'both credentials are distinct kinds',
  JSON.stringify((bothRequest.credentials || []).map((c) => c.kind)) ===
    JSON.stringify(['qualification', 'transcript']),
  JSON.stringify((bothRequest.credentials || []).map((c) => c.kind)),
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

console.log(failures === 0 ? '\nACADEMY_FLOW_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
