// Verifies management-portal authentication:
//   - wrong credentials are rejected
//   - a valid sign-in returns a token that can list accounts
//   - admin endpoints reject anonymous callers
//   - a wallet access token cannot be used as an admin token
//   - signing out invalidates every token issued to that administrator
const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3000';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${ISSUER}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const email = process.env.ADMIN_EMAIL || 'admin@quals.local';
const password = process.env.ADMIN_PASSWORD || 'quals-admin-2026';

// 1. Anonymous access is refused.
const anon = await call('GET', '/admin/accounts');
check('admin endpoints reject anonymous callers', anon.status === 401, `HTTP ${anon.status}`);

// 2. Wrong password is refused.
const bad = await call('POST', '/admin/auth/login', { email, password: 'not-the-password' });
check('wrong password is rejected', bad.status === 401, `HTTP ${bad.status}`);
check('rejection does not reveal whether the account exists', /incorrect email or password/i.test(bad.data.error || ''));

// 3. Correct credentials return a token.
const good = await call('POST', '/admin/auth/login', { email, password });
check('valid credentials return a session token', !!good.data.token, good.data.error || '');
check('sign-in returns the administrator', good.data.admin?.email === email);

const auth = { authorization: `Bearer ${good.data.token}` };

// 4. The token works for admin operations.
const me = await call('GET', '/admin/auth/me', null, auth);
check('session token identifies the administrator', me.data.admin?.email === email);

const accounts = await call('GET', '/admin/accounts', null, auth);
check('session token can list wallet accounts', Array.isArray(accounts.data.accounts), `HTTP ${accounts.status}`);

// 5. A wallet access token must not be accepted as an admin token.
const walletEmail = `admin-scope-${Date.now()}@example.com`;
const invite = (await call('POST', '/invitations', {
  email: walletEmail,
  studentId: `S-ADM-${Date.now()}`,
  institution: 'Smart Academy',
})).data;
if (invite.otp) {
  const walletToken = (await call('POST', '/auth/token', { email: walletEmail, otp: invite.otp })).data;
  const crossed = await call('GET', '/admin/accounts', null, {
    authorization: `Bearer ${walletToken.accessToken}`,
  });
  check('a wallet token cannot be used as an admin token', crossed.status === 401, `HTTP ${crossed.status}`);
} else {
  console.log('SKIP  wallet token cross-check (no dev OTP available on this issuer)');
}

// 6. Sign-out invalidates existing tokens.
const out = await call('POST', '/admin/auth/logout', {}, auth);
check('sign-out succeeds', out.data.success === true, out.data.error || '');

const afterSignOut = await call('GET', '/admin/accounts', null, auth);
check(
  'the token is rejected after sign-out',
  afterSignOut.status === 401 && /signed out/i.test(afterSignOut.data.error || ''),
  `HTTP ${afterSignOut.status}: ${afterSignOut.data.error}`,
);

// 7. Signing back in still works.
const again = await call('POST', '/admin/auth/login', { email, password });
check('administrator can sign in again after signing out', !!again.data.token);

console.log(failures === 0 ? '\nADMIN_AUTH_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
