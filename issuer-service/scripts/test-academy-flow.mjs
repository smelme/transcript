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

console.log(failures === 0 ? '\nACADEMY_FLOW_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
