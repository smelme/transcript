// Check the OpenID4VCI issuance endpoints as a conformant wallet would use them.
//
// Nothing here is Smart College specific: it fetches the issuer's metadata, takes the
// pre-authorized code out of the credential offer, exchanges it for an access token, gets a
// c_nonce, proves possession of a device key, collects the mdoc, and tells the issuer it stored it.
//
//   node scripts/check-openid4vci.mjs
//
// Needs the issuer running (./START_LOCAL_SERVICES.ps1).

import crypto from 'crypto';

const BASE = process.env.ISSUER_BASE_URL || 'http://127.0.0.1:3000';
const { generateAcademicRecord } = await import('../issuer-service/src/credential-generator.js');
const { verifyIssuerSigned } = await import('../mdoc-core.js');

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function call(method, path, { body, form, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ? new URLSearchParams(form) : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const fail = (message) => {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
};

// 1. Discovery. A wallet starts here, not at a URL somebody gave it.
const metadata = (await call('GET', '/.well-known/openid-credential-issuer')).body;
if (!metadata?.credential_endpoint) {fail('no issuer metadata at the well-known location');}
const configurationId = Object.keys(metadata.credential_configurations_supported)[0];
const configuration = metadata.credential_configurations_supported[configurationId];
console.log(`issuer          ${metadata.credential_issuer}`);
console.log(`configuration   ${configurationId} (${configuration.format})`);
console.log(`display         ${configuration.credential_metadata.display[0].name}`);

// 2. An offer, as the academy would hand one over.
const studentId = `SA-OID-${Date.now().toString().slice(-6)}`;
const { records } = generateAcademicRecord({
  institution: 'Smart Academy',
  studentId,
  include: 'both',
});
const created = await call('POST', '/issuance-sessions', {
  body: {
    studentId,
    institution: 'Smart Academy',
    credentialData: records[0].credentialData,
    termsRequired: false,
  },
});
if (!created.body?.offerUrl) {fail(`could not create an offer: ${created.status}`);}

const encoded = new URL(String(created.body.offerUrl).replace('openid-credential-offer://?', 'https://x/?'))
  .searchParams.get('credential_offer');
const offer = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
if (!offer.credential_configuration_ids?.includes(configurationId)) {
  fail('the offer does not name the credential configuration the metadata publishes');
}
console.log(`offer           pre-authorized code accepted`);

// 3. Pre-authorized code -> access token.
const code = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code'];
const token = await call('POST', '/token', {
  form: {
    grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    'pre-authorized_code': code,
  },
});
if (!token.body?.access_token) {fail(`token exchange failed: ${token.status} ${JSON.stringify(token.body)}`);}
console.log(`token           ${token.body.token_type}, ${token.body.expires_in}s`);

// 4. A device key, and the nonce the proof has to carry.
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });
const nonce = (await call('POST', '/nonce')).body.c_nonce;

const signingInput = `${base64url({ alg: 'ES256', typ: 'openid4vci-proof+jwt', jwk })}.${base64url({
  aud: metadata.credential_issuer,
  iat: Math.floor(Date.now() / 1000),
  nonce,
})}`;
const signature = crypto.sign('sha256', Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
});
const proof = `${signingInput}.${signature.toString('base64url')}`;

// 5. The credential itself.
const issued = await call('POST', '/credential', {
  token: token.body.access_token,
  body: {
    credential_configuration_id: configurationId,
    proofs: { jwt: [proof] },
  },
});
if (!issued.body?.credentials?.length) {
  fail(`credential request failed: ${issued.status} ${JSON.stringify(issued.body)}`);
}
const mdoc = issued.body.credentials[0].credential;

// 6. It has to be a real mdoc, signed by the issuer.
let verified;
try {
  verified = verifyIssuerSigned(mdoc);
} catch (e) {
  fail(`what came back is not a verifiable mdoc: ${e.message}`);
}
const namespaces = Object.keys(verified.namespaces).sort();
console.log(`credential      ${verified.docType}, namespaces: ${namespaces.length}`);
namespaces.forEach((namespace) => console.log(`                ${namespace}`));

// 7. A nonce is spent by the request that used it.
const replay = await call('POST', '/credential', {
  token: token.body.access_token,
  body: { proofs: { jwt: [proof] } },
});
if (replay.status !== 400) {fail(`a replayed proof was accepted (${replay.status})`);}
console.log(`replay          refused (${replay.body.error})`);

// 8. The issuer learns what became of it.
const notified = await call('POST', '/notification', {
  token: token.body.access_token,
  body: { notification_id: issued.body.notification_id, event: 'credential_accepted' },
});
if (notified.status !== 204) {fail(`notification failed: ${notified.status}`);}
console.log(`notification    accepted`);

console.log('\nOK: a conformant wallet issued and stored a credential, and told the issuer so.');
