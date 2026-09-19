import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// A throwaway database, and an issuer identifier that is stable before the module under test is
// loaded - it is what proves are addressed to, and what its metadata is published under.
const testDbPath = path.join(os.tmpdir(), `issuer-oid4vci-${process.pid}.db`);
process.env.DATABASE_PATH = testDbPath;
process.env.ISSUER_BASE_URL = 'https://issuer.test';
for (const suffix of ['', '-shm', '-wal']) {
  fs.rmSync(`${testDbPath}${suffix}`, { force: true });
}
process.on('exit', () => {
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.rmSync(`${testDbPath}${suffix}`, { force: true }); } catch { /* leave it to the OS */ }
  }
});

const { app, issuer } = await import('../src/index.js');
const { getDb } = await import('../../db.js');
const { generateAcademicRecord } = await import('../src/credential-generator.js');
const { verifyIssuerSigned } = await import('../../mdoc-core.js');
const { CREDENTIAL_CONFIGURATION_ID, verifyProofJwt } = await import('../src/openid4vci.js');

const ISSUER = 'https://issuer.test';

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

beforeEach(() => {
  getDb().prepare('DELETE FROM credentials').run();
});

const json = (path_, body, token) =>
  fetch(`${base}${path_}`, {
    method: 'POST',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

const get = (path_) => fetch(`${base}${path_}`);

/** A session holding one credential, as the academy would have prepared it. */
function prepareSession(studentId, include = 'both') {
  const { records } = generateAcademicRecord({ institution: 'Smart Academy', studentId, include });
  return issuer.createIssuanceSession({
    studentId,
    institution: 'Smart Academy',
    credentialData: records[0].credentialData,
    display: records[0].display,
    termsRequired: true,
  });
}

/** A wallet: a device key, and the proof that proves it holds it. */
function wallet() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    jwk,
    proof({ audience = ISSUER, nonce, iat = Math.floor(Date.now() / 1000) } = {}) {
      const signingInput = `${base64url({ alg: 'ES256', typ: 'openid4vci-proof+jwt', jwk })}.${base64url({
        aud: audience,
        iat,
        ...(nonce ? { nonce } : {}),
      })}`;
      const signature = crypto.sign('sha256', Buffer.from(signingInput), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      });
      return `${signingInput}.${signature.toString('base64url')}`;
    },
  };
}

/** The pre-authorized code flow up to a usable access token. */
async function tokenFor(code) {
  const response = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': code,
    }),
  });
  return { status: response.status, body: await response.json() };
}

test('OpenID4VCI - the metadata tells a wallet where everything is', async () => {
  const response = await get('/.well-known/openid-credential-issuer');
  assert.strictEqual(response.status, 200);
  const metadata = await response.json();

  assert.strictEqual(metadata.credential_issuer, ISSUER);
  assert.strictEqual(metadata.credential_endpoint, `${ISSUER}/credential`);
  assert.strictEqual(metadata.nonce_endpoint, `${ISSUER}/nonce`);
  assert.strictEqual(metadata.notification_endpoint, `${ISSUER}/notification`);

  const configuration = metadata.credential_configurations_supported[CREDENTIAL_CONFIGURATION_ID];
  assert.strictEqual(configuration.format, 'mso_mdoc');
  assert.strictEqual(configuration.doctype, CREDENTIAL_CONFIGURATION_ID);
  assert.deepStrictEqual(configuration.proof_types_supported.jwt.proof_signing_alg_values_supported, ['ES256']);
  // The display metadata is the point of publishing it: brands and claim names from the issuer
  // rather than from a table inside each wallet.
  assert.strictEqual(configuration.credential_metadata.display[0].background_color, '#1B3A6B');
  assert.ok(configuration.credential_metadata.claims.length > 5);
});

test('OpenID4VCI - the authorization server offers the pre-authorized code grant', async () => {
  const metadata = await (await get('/.well-known/oauth-authorization-server')).json();

  assert.strictEqual(metadata.token_endpoint, `${ISSUER}/token`);
  assert.deepStrictEqual(metadata.grant_types_supported, [
    'urn:ietf:params:oauth:grant-type:pre-authorized_code',
  ]);
  assert.strictEqual(metadata.pre_authorized_grant_anonymous_access_supported, true);
});

test('OpenID4VCI - a pre-authorized code buys an access token, once', async () => {
  const session = prepareSession('SA-OID1');

  const first = await tokenFor(session.sessionId);
  assert.strictEqual(first.status, 200);
  assert.ok(first.body.access_token);
  assert.strictEqual(first.body.token_type, 'Bearer');

  // Single use, as the specification requires of a pre-authorized code.
  const replay = await tokenFor(session.sessionId);
  assert.strictEqual(replay.status, 400);
  assert.strictEqual(replay.body.error, 'invalid_grant');
});

test('OpenID4VCI - an unsupported grant is refused', async () => {
  const response = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  assert.strictEqual(response.status, 400);
  assert.strictEqual((await response.json()).error, 'unsupported_grant_type');
});

test('OpenID4VCI - a credential is issued against a proof, bound to the key that signed it', async () => {
  const session = prepareSession('SA-OID2');
  const { body: token } = await tokenFor(session.sessionId);
  const { c_nonce: cNonce } = await (await json('/nonce')).json();
  const device = wallet();

  const response = await json(
    '/credential',
    {
      credential_configuration_id: CREDENTIAL_CONFIGURATION_ID,
      proofs: { jwt: [device.proof({ nonce: cNonce })] },
    },
    token.access_token,
  );

  assert.strictEqual(response.status, 200, JSON.stringify(await response.clone().json()));
  const issued = await response.json();
  assert.strictEqual(issued.credentials.length, 1);
  assert.ok(issued.notification_id, 'the wallet is given something to notify with');

  // What comes back is a real mdoc, in the format the specification's profile requires.
  const mdoc = issued.credentials[0].credential;
  const verified = verifyIssuerSigned(mdoc);
  assert.strictEqual(verified.docType, 'org.iso.23220.photoid.1');
  assert.ok(Object.keys(verified.namespaces).includes('org.iso.23220.photoid.1'));

  // And it is bound to the key from the proof: the whole point of asking for one.
  const stored = issuer.getCredential(session.credentialId);
  assert.deepStrictEqual(stored.credential.deviceKey, device.jwk);
});

test('OpenID4VCI - a proof for another issuer is refused', async () => {
  const session = prepareSession('SA-OID3');
  const { body: token } = await tokenFor(session.sessionId);
  const { c_nonce: cNonce } = await (await json('/nonce')).json();
  const device = wallet();

  const response = await json(
    '/credential',
    { proofs: { jwt: [device.proof({ audience: 'https://attacker.test', nonce: cNonce })] } },
    token.access_token,
  );

  assert.strictEqual(response.status, 400);
  const refusal = await response.json();
  assert.strictEqual(refusal.error, 'invalid_proof');
  assert.match(refusal.error_description, /audience/);
});

test('OpenID4VCI - a proof with no nonce is refused, since this issuer has a nonce endpoint', async () => {
  const session = prepareSession('SA-OID9');
  const { body: token } = await tokenFor(session.sessionId);

  const response = await json(
    '/credential',
    { proofs: { jwt: [wallet().proof()] } },
    token.access_token,
  );

  assert.strictEqual(response.status, 400);
  const refusal = await response.json();
  assert.strictEqual(refusal.error, 'invalid_proof');
  assert.match(refusal.error_description, /c_nonce/);
});

test('OpenID4VCI - a proof with a nonce this issuer never issued is refused', async () => {
  const session = prepareSession('SA-OID10');
  const { body: token } = await tokenFor(session.sessionId);

  const response = await json(
    '/credential',
    { proofs: { jwt: [wallet().proof({ nonce: 'invented' })] } },
    token.access_token,
  );

  assert.strictEqual(response.status, 400);
  assert.strictEqual((await response.json()).error, 'invalid_nonce');
});

test('OpenID4VCI - a credential request without a proof is refused', async () => {
  const session = prepareSession('SA-OID4');
  const { body: token } = await tokenFor(session.sessionId);

  const response = await json('/credential', { proofs: {} }, token.access_token);
  assert.strictEqual(response.status, 400);
  assert.strictEqual((await response.json()).error, 'invalid_proof');
});

test('OpenID4VCI - a credential request without an access token is refused', async () => {
  const response = await json('/credential', {
    proofs: { jwt: [wallet().proof()] },
  });

  assert.strictEqual(response.status, 401);
  assert.strictEqual((await response.json()).error, 'invalid_token');
});

test('OpenID4VCI - an unknown credential configuration is refused by name', async () => {
  const session = prepareSession('SA-OID5');
  const { body: token } = await tokenFor(session.sessionId);

  const response = await json(
    '/credential',
    { credential_configuration_id: 'org.example.not.this', proofs: { jwt: [wallet().proof()] } },
    token.access_token,
  );

  assert.strictEqual(response.status, 400);
  assert.strictEqual((await response.json()).error, 'unknown_credential_configuration');
});

test('OpenID4VCI - the wallet tells the issuer what became of the credential', async () => {
  const session = prepareSession('SA-OID6');
  const { body: token } = await tokenFor(session.sessionId);
  const { c_nonce: cNonce } = await (await json('/nonce')).json();

  const issued = await (
    await json(
      '/credential',
      { proofs: { jwt: [wallet().proof({ nonce: cNonce })] } },
      token.access_token,
    )
  ).json();

  const before = issuer.auditLog.length;
  const notified = await json(
    '/notification',
    { notification_id: issued.notification_id, event: 'credential_accepted' },
    token.access_token,
  );

  assert.strictEqual(notified.status, 204);
  const entry = issuer.auditLog[issuer.auditLog.length - 1];
  assert.strictEqual(issuer.auditLog.length, before + 1, 'the issuer now knows it was stored');
  assert.strictEqual(entry.details.event, 'credential_accepted');
});

test('OpenID4VCI - a notification the issuer never issued is refused', async () => {
  const session = prepareSession('SA-OID7');
  const { body: token } = await tokenFor(session.sessionId);

  const response = await json(
    '/notification',
    { notification_id: 'not-one-of-ours', event: 'credential_accepted' },
    token.access_token,
  );

  assert.strictEqual(response.status, 400);
  assert.strictEqual((await response.json()).error, 'invalid_notification_id');
});

test('OpenID4VCI - a proof carrying a spent nonce is refused', async () => {
  const session = prepareSession('SA-OID8');
  const { body: token } = await tokenFor(session.sessionId);
  const { c_nonce: cNonce } = await (await json('/nonce')).json();
  const device = wallet();

  const first = await json(
    '/credential',
    { proofs: { jwt: [device.proof({ nonce: cNonce })] } },
    token.access_token,
  );
  assert.strictEqual(first.status, 200);

  const second = await json(
    '/credential',
    { proofs: { jwt: [device.proof({ nonce: cNonce })] } },
    token.access_token,
  );
  assert.strictEqual(second.status, 400);
  assert.strictEqual((await second.json()).error, 'invalid_nonce');
});

test('OpenID4VCI - the proof verifier reports why a proof fails', () => {
  const device = wallet();
  const now = Date.now();

  assert.strictEqual(verifyProofJwt('not-a-jwt', { audience: ISSUER }).valid, false);
  assert.match(
    verifyProofJwt(device.proof({ audience: ISSUER }), { audience: 'https://other.test' }).error,
    /audience/,
  );
  assert.match(
    verifyProofJwt(device.proof({ iat: Math.floor(now / 1000) - 9999 }), { audience: ISSUER }).error,
    /fresh/,
  );
  assert.match(
    verifyProofJwt(device.proof({ nonce: 'from-somewhere-else' }), { audience: ISSUER, nonce: 'ours' })
      .error,
    /nonce/,
  );
  assert.strictEqual(verifyProofJwt(device.proof(), { audience: ISSUER }).valid, true);
});
