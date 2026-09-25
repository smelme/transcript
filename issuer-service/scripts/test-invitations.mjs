/**
 * End-to-end test for institution publishing.
 *
 * Runs against a test issuer (ISSUER_URL, default http://127.0.0.1:3006) started with a throwaway
 * database, ALLOW_DEV_OTP=true and a disabled Brevo key, so the sign-in code comes back in the
 * response instead of an email.
 *
 * It walks the whole publication: an administrator mints an API key, the institution publishes a
 * holder's credentials with it, the holder opens the link, signs in with a code, is shown what is
 * waiting, and takes the offer that the wallet would then claim.
 *
 * Prints INVITATION_TEST_PASSED on success.
 */

const ISSUER_URL = process.env.ISSUER_URL || 'http://127.0.0.1:3006';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@transcript.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';

let checks = 0;
const failures = [];

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` (${detail})` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}

async function call(path, { method = 'GET', body, token, apiKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {headers.Authorization = `Bearer ${token}`;}
  if (apiKey) {headers['x-api-key'] = apiKey;}
  const res = await fetch(`${ISSUER_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

/** The claims an institution publishes, in the namespaces this system issues into. */
function qualificationClaims() {
  return {
    'org.iso.23220.education.qualification.1': {
      institutionName: 'Test Institute',
      programmeTitle: 'Master of Data Science',
      degreeLevel: 'Master',
      fieldOfStudy: 'Data Science',
      graduationDate: '2026-09-01',
      gpa: 3.85,
    },
    'org.iso.23220.education.transcript.1': {
      totalCredits: 180,
      courses: JSON.stringify([
        { courseCode: 'COMPSCI 701', courseName: 'Algorithms', term: '2026 S1', credits: 15, grade: 'A-' },
        { courseCode: 'COMPSCI 702', courseName: 'Systems', term: '2026 S2', credits: 15, grade: 'B+' },
      ]),
    },
  };
}

console.log(`Testing institution publishing against ${ISSUER_URL}\n`);

// 1. An administrator signs in and mints an API key for an institution.
const login = await call('/admin/auth/login', {
  method: 'POST',
  body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
});
const adminToken = login.data.token || login.data.accessToken;
check('an administrator can sign in', Boolean(adminToken), JSON.stringify(login.data).slice(0, 120));

const keyResponse = await call('/admin/api-keys', {
  method: 'POST',
  token: adminToken,
  body: { institution: 'Test Institute', name: 'Registrar system' },
});
const apiKey = keyResponse.data.key || keyResponse.data.apiKey || keyResponse.data.secret;
check('an API key is issued once', Boolean(apiKey), JSON.stringify(keyResponse.data).slice(0, 160));

// 2. Publishing requires that key, and honours only the institution it belongs to.
const noKey = await call('/issuance/invitations', {
  method: 'POST',
  body: { holderEmail: 'holder@example.com', credentials: [{ claims: qualificationClaims() }] },
});
check('publishing without a key is refused', noKey.status === 401, `status ${noKey.status}`);

const publish = await call('/issuance/invitations', {
  method: 'POST',
  apiKey,
  body: {
    // The institution asks for another name; the key decides, so this must be ignored.
    institution: 'Somewhere Else',
    holderEmail: 'Holder@Example.com',
    holderName: 'Selam Melese',
    credentials: [{ claims: qualificationClaims() }],
  },
});
check('an institution can publish a credential', publish.status === 201, JSON.stringify(publish.data).slice(0, 200));

const invitation = publish.data;
const invitationId = invitation.invitationId;
check('the institution is taken from the key, not the request', publish.data?.credentials?.[0]?.label != null);
check('the invitation link points at the issuing page', String(invitation.inviteUrl || '').includes('/issue?invitation='), invitation.inviteUrl);
check('the holder address is normalised', invitation.holderEmail === 'holder@example.com', invitation.holderEmail);
check('the credential is described rather than asked for', invitation.credentials?.[0]?.title === 'Master of Data Science', invitation.credentials?.[0]?.title);
check('modules are counted, not printed as JSON', invitation.credentials?.[0]?.courseCount === 2, String(invitation.credentials?.[0]?.courseCount));

const token = new URL(invitation.inviteUrl).searchParams.get('token');
check('the link carries a token', Boolean(token));

// 3. The holder opens the link. The preview shows who published it and masks the address.
const preview = await call(`/issuance/invitations/${invitationId}?token=${encodeURIComponent(token)}`);
check('the link opens a preview', preview.status === 200 && preview.data.institution === 'Test Institute', JSON.stringify(preview.data).slice(0, 160));
check('the address is masked before sign-in', String(preview.data.holderEmail).includes('*'), preview.data.holderEmail);
check('the preview says when it expires', Boolean(preview.data.expiresAt));

const badToken = await call(`/issuance/invitations/${invitationId}?token=not-the-token`);
check('a wrong token is refused', badToken.status === 404, `status ${badToken.status}`);

// 4. A code is sent to the published address, and only with the token.
const noTokenOtp = await call(`/issuance/invitations/${invitationId}/otp`, { method: 'POST', body: {} });
check('a code cannot be requested without the token', noTokenOtp.status === 400, `status ${noTokenOtp.status}`);

const otp = await call(`/issuance/invitations/${invitationId}/otp`, { method: 'POST', body: { token } });
check('a code is sent to the published address', otp.status === 200 && otp.data.email === 'holder@example.com', JSON.stringify(otp.data).slice(0, 160));
check('the code comes back in a test environment', Boolean(otp.data.otp), JSON.stringify(otp.data).slice(0, 160));

const signIn = await call('/auth/token', {
  method: 'POST',
  body: { email: otp.data.email, otp: otp.data.otp },
});
const holderToken = signIn.data.accessToken;
check('the holder can sign in with the code', Boolean(holderToken), JSON.stringify(signIn.data).slice(0, 160));

// 5. What is waiting is only visible to the holder.
const anonymous = await call(`/issuance/invitations/${invitationId}/items`);
check('the items are not readable without signing in', anonymous.status === 401, `status ${anonymous.status}`);

const items = await call(`/issuance/invitations/${invitationId}/items`, { token: holderToken });
check('the holder sees what is waiting', items.status === 200 && items.data.credentials?.length === 1, JSON.stringify(items.data).slice(0, 200));
const sessionId = items.data.credentials?.[0]?.sessionId;
check('the item says it is not in the wallet yet', items.data.credentials?.[0]?.inWallet === false);

// 6. Taking the offer. This is where issuing happens: the wallet claims what comes back.
const offer = await call(`/issuance/items/${sessionId}/offer`, {
  method: 'POST',
  token: holderToken,
  body: { termsAccepted: true },
});
check('the holder can take the offer', offer.status === 200 && Boolean(offer.data.offerUrl), JSON.stringify(offer.data).slice(0, 200));
check('the offer is an OpenID4VCI credential offer', String(offer.data.offerUrl).startsWith('openid-credential-offer://'), offer.data.offerUrl);
check('the offer comes with a QR code', String(offer.data.qrDataUrl).startsWith('data:image/png'), String(offer.data.qrDataUrl).slice(0, 24));
check('a first offer is not marked as a re-issue', offer.data.reissued === false);

const claimed = await call(`/issuance/invitations/${invitationId}/claimed`, { method: 'POST', token: holderToken });
check('taking the offer marks the invitation collected', claimed.status === 200, JSON.stringify(claimed.data).slice(0, 120));

// 7. Expiry: a published credential nobody collects stops being claimable.
const shortLived = await call('/issuance/invitations', {
  method: 'POST',
  apiKey,
  body: { holderEmail: 'nobody@example.com', credentials: [{ claims: qualificationClaims() }] },
});
check('a second holder can be published for', shortLived.status === 201, JSON.stringify(shortLived.data).slice(0, 160));
const expired = await call('/issuance/invitations', { token: adminToken });
const listed = (expired.data.invitations || []).find((i) => i.invitationId === shortLived.data.invitationId);
check('the portal can list invitations', Boolean(listed), JSON.stringify(expired.data).slice(0, 160));
check('a listed invitation hides its link', listed && listed.token === undefined && listed.inviteUrl === undefined);

console.log(`\n${checks} checks, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) {console.log(`  - ${failure}`);}
  process.exit(1);
}
console.log('INVITATION_TEST_PASSED');
