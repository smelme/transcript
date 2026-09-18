// Check that a credential already in a wallet can be issued again.
//
// Drives the academy's own path against a running issuer: sign in with a dev OTP for an account
// that already holds a credential, list that account's credentials, and ask for an offer for one
// the wallet already has. It must come back as a re-issue with an offer, not a refusal.
//
//   node scripts/check-reissue.mjs
//
// Needs the issuer running (./START_LOCAL_SERVICES.ps1) with BREVO_API_KEY=dev-disabled, so the
// one-time code is returned instead of emailed.

import Database from 'better-sqlite3';

const BASE = process.env.ISSUER_BASE_URL || 'http://127.0.0.1:3000';

async function post(path, body, token) {
  const response = await fetch(BASE + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function get(path, token) {
  const response = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

/** An account that already has a claimed credential, which is the case being checked. */
function accountWithIssuedCredential() {
  const db = new Database('data/transcript.db', { readonly: true });
  const row = db
    .prepare(
      `SELECT email FROM issuance_sessions
        WHERE status = 'issued' AND email IS NOT NULL
        GROUP BY email ORDER BY count(1) DESC LIMIT 1`,
    )
    .get();
  db.close();
  return row?.email ?? null;
}

const email = accountWithIssuedCredential();
if (!email) {
  console.error('No account has a claimed credential, so there is nothing to re-issue.');
  process.exit(1);
}

const otp = await post('/auth/otp', { email });
if (!otp.body.otp) {
  console.error(`Could not sign in as ${email}:`, otp.body.error || otp.status);
  process.exit(1);
}

const token = (await post('/auth/token', { email, otp: otp.body.otp })).body.accessToken;
if (!token) {
  console.error('No access token returned');
  process.exit(1);
}

const listed = await get('/academy/credentials', token);
const credentials = listed.body.credentials || [];
const held = credentials.filter((credential) => credential.inWallet);
console.log(`${email}: ${credentials.length} credentials, ${held.length} already in the wallet`);

const target = held[0];
if (!target) {
  console.error('This account has no claimed credential to re-issue.');
  process.exit(1);
}

const offer = await post(`/academy/credentials/${target.sessionId}/offer`, {}, token);
const reissued = offer.body.reissued === true && Boolean(offer.body.offerUrl);

console.log(
  [
    `offered        ${Boolean(offer.body.offerUrl)}`,
    `marked reissue ${offer.body.reissued === true}`,
    `refused        ${offer.body.alreadyInWallet === true}`,
    `error          ${offer.body.error || 'none'}`,
  ].join('\n'),
);

if (!reissued) {
  console.error('\nFAILED: a credential already in the wallet was not offered again.');
  process.exit(1);
}
console.log('\nOK: the credential is issued again rather than refused.');
