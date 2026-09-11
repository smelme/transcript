// Verifies reader (verifier) authentication on the mdoc DeviceRequest:
//   - readerAuthAll carries a COSE_Sign1 with an ES256 protected header
//   - the signature verifies against the published reader key
//   - the signed structure is ["ReaderAuthentication", SessionTranscript, ItemsRequest]
//   - the session transcript matches what a wallet derives from encryptionInfo
//   - the reader key id is stable
import crypto from 'crypto';
import * as cbor2 from 'cbor2';
import { buildSessionTranscript } from '../tests/helpers/test-wallet.js';

const VERIFIER = process.env.VERIFIER_URL || 'http://127.0.0.1:3001';
const ORIGIN = 'http://localhost:3003';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

const b64urlToBytes = (value) => {
  const s = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = s + '='.repeat(s.length % 4 === 0 ? 0 : 4 - (s.length % 4));
  return new Uint8Array(Buffer.from(padded, 'base64'));
};
const bytesToB64url = (bytes) => Buffer.from(bytes).toString('base64url');

// 1. Ask for a presentation session.
const sessionRes = await fetch(`${VERIFIER}/presentation/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ relyingPartyId: 'test-reader-auth', origin: ORIGIN }),
});
const session = await sessionRes.json();
check('session created', sessionRes.ok && session.success === true, session.error || '');

const data = session.request.digital.requests[0].data;
const deviceRequest = cbor2.decode(b64urlToBytes(data.deviceRequest));

// 2. readerAuthAll must be present and well formed.
const readerAuthAll = deviceRequest.readerAuthAll;
check('deviceRequest carries readerAuthAll', Array.isArray(readerAuthAll) && readerAuthAll.length === 1);

const readerAuth = readerAuthAll[0];
check('readerAuth is a 4-element COSE_Sign1', Array.isArray(readerAuth) && readerAuth.length === 4);

const [protectedBytes, unprotected, payload, signature] = readerAuth;
check('signature is a 64-byte P-256 value', signature instanceof Uint8Array && signature.length === 64, `${signature?.length} bytes`);

const protectedHeader = cbor2.decode(protectedBytes);
const alg = protectedHeader instanceof Map ? protectedHeader.get(1) : protectedHeader[1];
check('protected header declares ES256', alg === -7, `alg=${alg}`);

const kid = unprotected instanceof Map ? unprotected.get(4) : unprotected[4];
check('readerAuth identifies the reader key', typeof kid === 'string' && kid.length > 0, String(kid));

// 3. The published reader key is stable and matches the signed kid.
const keyRes = await fetch(`${VERIFIER}/presentation/reader-key`);
const readerInfo = (await keyRes.json()).reader;
check('verifier publishes its reader key', keyRes.ok && readerInfo?.jwk?.crv === 'P-256');
check('published kid matches the signed kid', readerInfo.kid === kid, `${readerInfo.kid}`);

const keyAgain = (await (await fetch(`${VERIFIER}/presentation/reader-key`)).json()).reader;
check('reader key is stable across requests', keyAgain.kid === readerInfo.kid);

// 4. Reconstruct the session transcript exactly as a wallet would.
const encInfo = cbor2.decode(b64urlToBytes(data.encryptionInfo));
const params = encInfo[1];
const nonceHex = Buffer.from(params.nonce).toString('hex');
const coseKey = params.recipientPublicKey;
const readerJwk = {
  kty: 'EC',
  crv: 'P-256',
  x: bytesToB64url(coseKey.get(-2)),
  y: bytesToB64url(coseKey.get(-3)),
};
const expectedTranscript = buildSessionTranscript({ origin: ORIGIN, nonceHex, jwk: readerJwk });

// 5. Unwrap the signed payload and inspect the structure. Note the signature
// covers ReaderAuthenticationBytes — the whole #6.24 tagged encoding.
const signedBytes = new Uint8Array(payload);
const signedTag = cbor2.decode(signedBytes);
const readerAuthentication = cbor2.decode(new Uint8Array(signedTag.contents ?? signedTag.value));

check('payload is the ReaderAuthentication structure', readerAuthentication[0] === 'ReaderAuthentication');

const transcriptMatches =
  Buffer.compare(Buffer.from(readerAuthentication[1]), Buffer.from(expectedTranscript)) === 0;
check('reader signed the wallet-derived session transcript', transcriptMatches);

const itemsRequestBytes = readerAuthentication[2];
const documentItemsRequest = cbor2.decode(
  new Uint8Array(deviceRequest.docRequests[0].itemsRequest.contents ?? deviceRequest.docRequests[0].itemsRequest.value),
);
const signedItemsRequest = cbor2.decode(new Uint8Array(itemsRequestBytes));
check(
  'reader signed the ItemsRequest it is making',
  JSON.stringify(signedItemsRequest) === JSON.stringify(documentItemsRequest),
);

// 6. Independently verify the COSE_Sign1 signature.
const sigStructure = cbor2.encode([
  'Signature1',
  new Uint8Array(protectedBytes),
  new Uint8Array(0),
  signedBytes,
]);
const publicKey = await crypto.subtle.importKey(
  'jwk',
  readerInfo.jwk,
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['verify'],
);
const valid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  publicKey,
  new Uint8Array(signature),
  new Uint8Array(sigStructure),
);
check('readerAuth signature verifies against the published key', valid === true);

// 7. A tampered request must not verify.
const tampered = cbor2.encode([
  'Signature1',
  new Uint8Array(protectedBytes),
  new Uint8Array(0),
  new Uint8Array(Buffer.concat([Buffer.from(signedBytes), Buffer.from([0])])),
]);
const tamperedValid = await crypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  publicKey,
  new Uint8Array(signature),
  new Uint8Array(tampered),
);
check('a tampered request fails verification', tamperedValid === false);

console.log(failures === 0 ? '\nREADER_AUTH_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
