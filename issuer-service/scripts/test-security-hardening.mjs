// Verifies the security hardening:
//   - one-time codes are throttled per address
//   - repeated wrong codes lock the address out
//   - the dev OTP fallback is NOT returned when NODE_ENV=production
const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';
const PROD_ISSUER = process.env.PROD_ISSUER_URL || 'http://127.0.0.1:3006';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

async function call(base, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const stamp = Date.now();

// ── 1. Send throttling ───────────────────────────────────────────────────
const throttleEmail = `sec-throttle-${stamp}@example.com`;
await call(ISSUER, 'POST', '/invitations', { email: throttleEmail, studentId: `S-T${stamp}`, institution: 'Smart Academy' });

let throttled = null;
for (let i = 0; i < 12; i++) {
  const r = await call(ISSUER, 'POST', '/auth/otp', { email: throttleEmail });
  if (r.status !== 200) {
    throttled = r;
    break;
  }
}
check(
  'repeated code requests are throttled',
  !!throttled && /too many/i.test(throttled.data.error || ''),
  throttled ? `HTTP ${throttled.status}: ${throttled.data.error}` : 'never throttled',
);

// ── 2. Wrong-code lockout ────────────────────────────────────────────────
const lockEmail = `sec-lock-${stamp}@example.com`;
const invite = (await call(ISSUER, 'POST', '/invitations', {
  email: lockEmail,
  studentId: `S-L${stamp}`,
  institution: 'Smart Academy',
})).data;
const realCode = invite.otp;
check('dev issuer returns a code for testing', typeof realCode === 'string', realCode || '');
const wrongCode = realCode === '111111' ? '222222' : '111111';

let lastError = '';
for (let i = 0; i < 5; i++) {
  const r = await call(ISSUER, 'POST', '/auth/token', { email: lockEmail, otp: wrongCode });
  lastError = r.data.error || '';
}
const afterLockout = await call(ISSUER, 'POST', '/auth/token', { email: lockEmail, otp: realCode });
check(
  'address is locked out after repeated wrong codes',
  afterLockout.status === 400 && /too many incorrect codes/i.test(afterLockout.data.error || ''),
  `HTTP ${afterLockout.status}: ${afterLockout.data.error}`,
);
check('correct code is refused while locked out', !afterLockout.data.accessToken);

// ── 3. Dev fallback disabled in production ───────────────────────────────
const prodEmail = `sec-prod-${stamp}@example.com`;
const prodInvite = await call(PROD_ISSUER, 'POST', '/invitations', {
  email: prodEmail,
  studentId: `S-P${stamp}`,
  institution: 'Smart Academy',
});
check('production invite does not leak the code', prodInvite.data.otp === undefined, `otp=${JSON.stringify(prodInvite.data.otp)}`);
check('production invite reports email not sent', prodInvite.data.otpSent === false);

const prodOtp = await call(PROD_ISSUER, 'POST', '/auth/otp', { email: prodEmail });
check('production sign-in does not leak the code', prodOtp.data.otp === undefined, `otp=${JSON.stringify(prodOtp.data.otp)}`);
check('production sign-in reports email not sent', prodOtp.data.otpSent === false);

// ── 4. CORS allow-list ───────────────────────────────────────────────────
const allowed = await fetch(`${ISSUER}/health`, { headers: { Origin: 'http://localhost:3004' } });
check(
  'allow-listed origin receives CORS headers',
  allowed.headers.get('access-control-allow-origin') === 'http://localhost:3004',
  `header=${allowed.headers.get('access-control-allow-origin')}`,
);

const blocked = await fetch(`${ISSUER}/health`, { headers: { Origin: 'https://evil.example' } });
check(
  'unknown origin receives no CORS headers',
  blocked.headers.get('access-control-allow-origin') === null,
  `header=${blocked.headers.get('access-control-allow-origin')}`,
);

console.log(failures === 0 ? '\nSECURITY_HARDENING_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
