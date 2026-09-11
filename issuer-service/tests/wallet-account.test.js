import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point the shared database at a throwaway file *before* the service modules load.
// Without this the suite signs in as erika@example.com against the developer's own
// database and fails on the second run, when the account already exists.
const testDbPath = path.join(os.tmpdir(), `wallet-account-unit-${process.pid}.db`);
process.env.DATABASE_PATH = testDbPath;
for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}
process.on('exit', () => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.rmSync(`${testDbPath}${suffix}`, { force: true }); } catch { /* leave it to the OS */ }
  }
});

const { IssuerService } = await import('../src/index.js');
const { WalletAccountService } = await import('../src/wallet-account-service.js');
const { buildCwt, generateDeviceKeyPair } = await import('../../mdoc-core.js');

// Access tokens are signed with the dedicated wallet-token-signer key (separate
// from the mdoc document-signer key).
const signerKeyPem = fs.readFileSync(
  new URL('../../key-management/keys/wallet-token-signer.private.pem', import.meta.url),
  'utf8'
);

const baseCredential = {
  docType: 'org.iso.23220.photoid.1',
  full_name: 'Erika Mustermann',
  date_of_birth: '1964-08-12',
  document_number: 'Z021AB37X13',
  issuing_authority: 'Smart College',
  issue_date: '2025-03-24',
  expiry_date: '2031-03-24',
  issuing_country: 'NL',
};

function setup() {
  const issuer = new IssuerService();
  const accounts = new WalletAccountService({ signerKeyPem, issuerId: issuer.issuerId });
  return { issuer, accounts };
}

async function invite(accounts, email, studentId, institution) {
  const inv = await accounts.invite({ email, studentId, institution });
  accounts.verifyOtp({ email, otp: inv.otp });
  return inv;
}

async function signIn(accounts, email) {
  const req = await accounts.requestSignInOtp({ email });
  return accounts.exchangeToken({ email, otp: req.otp });
}

// Build a proof-of-possession CWT signed by the device key for a session.
function makeCwt(issuer, session, publicJwk, privateJwk, sub) {
  return buildCwt({
    privateJwk,
    devicePublicJwk: publicJwk,
    issuer: issuer.issuerId,
    subject: sub,
    audience: issuer.issuerId,
    nonce: session.nonce,
  }).toString('base64url');
}

test('invite creates account + link and is idempotent', async () => {
  const { accounts } = setup();

  const first = await accounts.invite({ email: 'erika@example.com', studentId: 'S-1', institution: 'issuer-001' });
  assert.strictEqual(first.accountCreated, true);
  assert.strictEqual(first.linkAdded, true);
  assert.ok(accounts.hasLink(first.sub, 'issuer-001', 'S-1'));

  const second = await accounts.invite({ email: 'erika@example.com', studentId: 'S-1', institution: 'issuer-001' });
  assert.strictEqual(second.accountCreated, false);
  assert.strictEqual(second.linkAdded, false);
  assert.strictEqual(second.sub, first.sub);

  // A different studentId adds a second link on the same account.
  const third = await accounts.invite({ email: 'erika@example.com', studentId: 'S-2', institution: 'issuer-001' });
  assert.strictEqual(third.linkAdded, true);
  assert.strictEqual(accounts.getLinks(first.sub).length, 2);
});

test('verifyOtp marks email verified and rejects a wrong OTP', async () => {
  const { accounts } = setup();
  const inv = await accounts.invite({ email: 'erika@example.com', studentId: 'S-1', institution: 'issuer-001' });

  const ok = accounts.verifyOtp({ email: 'erika@example.com', otp: inv.otp });
  assert.strictEqual(ok.success, true);

  const wrong = accounts.verifyOtp({ email: 'erika@example.com', otp: '000000' });
  assert.strictEqual(wrong.success, false);
});

test('access token round-trips the wallet sub', async () => {
  const { accounts } = setup();
  const inv = await invite(accounts, 'erika@example.com', 'S-1', 'issuer-001');

  const { accessToken } = await signIn(accounts, 'erika@example.com');
  assert.ok(accessToken);

  const payload = await accounts.verifyAccessToken(accessToken);
  assert.strictEqual(payload.sub, inv.sub);
  assert.strictEqual(payload.email, 'erika@example.com');
  assert.strictEqual(payload.scope, 'credential_issuance');
});

test('claim issues a device-bound mdoc when the wallet is linked', async () => {
  const { issuer, accounts } = setup();
  const inv = await invite(accounts, 'erika@example.com', 'S-1', issuer.issuerId);
  const { accessToken } = await signIn(accounts, 'erika@example.com');
  const { publicJwk, privateJwk } = generateDeviceKeyPair();

  const session = issuer.createIssuanceSession({
    studentId: 'S-1',
    institution: issuer.issuerId,
    credentialData: baseCredential,
  });
  issuer.acceptTerms(session.sessionId);

  const claim = await issuer.claimIssuanceSession(
    session.sessionId,
    { accessToken, cwt: makeCwt(issuer, session, publicJwk, privateJwk, inv.sub) },
    accounts
  );
  assert.strictEqual(claim.success, true, claim.error);
  assert.strictEqual(claim.deviceBound, true);
  assert.ok(claim.mdocBase64url);

  const mdoc = issuer.getCredentialMdoc(claim.credentialId);
  assert.strictEqual(mdoc.verification.signatureValid, true);
  assert.strictEqual(mdoc.verification.digestsValid, true);
  assert.strictEqual(mdoc.verification.deviceKey.x, Buffer.from(publicJwk.x, 'base64url').toString('base64'));
  assert.strictEqual(mdoc.verification.deviceKey.y, Buffer.from(publicJwk.y, 'base64url').toString('base64'));

  // The link matches: the session student id == the invited student id.
  assert.strictEqual(inv.sub, (await accounts.verifyAccessToken(accessToken)).sub);
});

test('claim rejects when the wallet is not linked to the session studentId', async () => {
  const { issuer, accounts } = setup();
  await invite(accounts, 'erika@example.com', 'S-1', issuer.issuerId);
  const { accessToken } = await signIn(accounts, 'erika@example.com');

  // Session is for a DIFFERENT student.
  const session = issuer.createIssuanceSession({
    studentId: 'S-OTHER',
    institution: issuer.issuerId,
    credentialData: baseCredential,
  });

  const claim = await issuer.claimIssuanceSession(session.sessionId, { accessToken }, accounts);
  assert.strictEqual(claim.success, false);
  assert.strictEqual(claim.status, 403);
});

test('claim rejects an invalid access token', async () => {
  const { issuer, accounts } = setup();
  const session = issuer.createIssuanceSession({
    studentId: 'S-1',
    institution: issuer.issuerId,
    credentialData: baseCredential,
  });

  const claim = await issuer.claimIssuanceSession(session.sessionId, { accessToken: 'not-a-token' }, accounts);
  assert.strictEqual(claim.success, false);
  assert.strictEqual(claim.status, 401);
});

test('claim rejects a double claim', async () => {
  const { issuer, accounts } = setup();
  await invite(accounts, 'erika@example.com', 'S-1', issuer.issuerId);
  const { accessToken } = await signIn(accounts, 'erika@example.com');
  const { publicJwk, privateJwk } = generateDeviceKeyPair();

  const session = issuer.createIssuanceSession({
    studentId: 'S-1',
    institution: issuer.issuerId,
    credentialData: baseCredential,
  });
  issuer.acceptTerms(session.sessionId);

  const cwt = makeCwt(issuer, session, publicJwk, privateJwk, 'someone');
  const first = await issuer.claimIssuanceSession(session.sessionId, { accessToken, cwt }, accounts);
  assert.strictEqual(first.success, true);

  const second = await issuer.claimIssuanceSession(session.sessionId, { accessToken, cwt }, accounts);
  assert.strictEqual(second.success, false);
  assert.strictEqual(second.status, 409);
});

test('claim requires terms acceptance before issuing', async () => {
  const { issuer, accounts } = setup();
  await invite(accounts, 'erika@example.com', 'S-1', issuer.issuerId);
  const { accessToken } = await signIn(accounts, 'erika@example.com');
  const { publicJwk, privateJwk } = generateDeviceKeyPair();

  const session = issuer.createIssuanceSession({
    studentId: 'S-1',
    institution: issuer.issuerId,
    credentialData: baseCredential,
  });

  const before = await issuer.claimIssuanceSession(session.sessionId, { accessToken }, accounts);
  assert.strictEqual(before.success, false);
  assert.strictEqual(before.status, 403);

  issuer.acceptTerms(session.sessionId);
  const cwt = makeCwt(issuer, session, publicJwk, privateJwk, 'someone');
  const after = await issuer.claimIssuanceSession(session.sessionId, { accessToken, cwt }, accounts);
  assert.strictEqual(after.success, true);
});

test('claim requires payment when a fee is set', async () => {
  const { issuer, accounts } = setup();
  await invite(accounts, 'erika@example.com', 'S-1', issuer.issuerId);
  const { accessToken } = await signIn(accounts, 'erika@example.com');
  const { publicJwk, privateJwk } = generateDeviceKeyPair();

  const session = issuer.createIssuanceSession({
    studentId: 'S-1',
    institution: issuer.issuerId,
    credentialData: baseCredential,
    feePence: 10000,
    termsRequired: false,
  });

  const unpaid = await issuer.claimIssuanceSession(session.sessionId, { accessToken }, accounts);
  assert.strictEqual(unpaid.success, false);
  assert.strictEqual(unpaid.status, 402);

  issuer.confirmPayment(session.sessionId);
  const cwt = makeCwt(issuer, session, publicJwk, privateJwk, 'someone');
  const paid = await issuer.claimIssuanceSession(session.sessionId, { accessToken, cwt }, accounts);
  assert.strictEqual(paid.success, true);
});
