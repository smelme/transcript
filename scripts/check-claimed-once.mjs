// Check that a credential already in a wallet cannot be issued again (P0-44).
//
// Drives the academy's own path against a running issuer: sign in with a dev OTP for an account
// that already holds a credential, list that account's credentials, and ask for an offer for one the
// wallet already has. It must come back refused - the issuer handed the document over when it was
// collected and keeps no copy, so a second one is the institution's to publish.
//
//   node scripts/check-claimed-once.mjs
//
// Needs the issuer running (./START_LOCAL_SERVICES.ps1) with BREVO_API_KEY=dev-disabled, so the
// one-time code is returned instead of emailed.
//
// This replaced check-reissue.mjs, which asserted the opposite: that such an offer came back as a
// re-issue. P0-24 decided that; P0-44 reversed it.

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
  console.error('No account has a claimed credential, so there is nothing to check.');
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
  console.error('This account has no claimed credential to check.');
  process.exit(1);
}

const offer = await post(`/academy/credentials/${target.sessionId}/offer`, {}, token);

console.log(
  [
    `status         ${offer.status}`,
    `offered        ${Boolean(offer.body.offerUrl)}`,
    `error          ${offer.body.error || 'none'}`,
  ].join('\n'),
);

// Refused, with no offer: a document that has been collected is not handed over twice.
if (offer.body.offerUrl) {
  console.error('\nFAILED: a credential already in a wallet was offered again.');
  process.exit(1);
}
if (offer.status !== 409) {
  console.error(`\nFAILED: expected 409, got ${offer.status}.`);
  process.exit(1);
}
if (!/ask the institution/i.test(String(offer.body.error || ''))) {
  console.error('\nFAILED: the refusal must say where another copy comes from.');
  process.exit(1);
}

// And nothing in the offer machinery may ask for a second copy.
const listedAgain = await get('/academy/credentials', token);
const stillOneRow = listedAgain.body.credentials?.filter(
  (credential) => credential.sessionId === target.sessionId,
).length;
if (stillOneRow !== 1) {
  console.error('\nFAILED: the holder list no longer shows the credential exactly once.');
  process.exit(1);
}

console.log('\nOK: it is refused, and the holder is told to ask the institution.');
