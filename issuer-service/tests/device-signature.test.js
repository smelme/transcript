import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import {
  generateDeviceKeyPair,
  buildDeviceSignature,
  verifyDeviceSignature,
  generateIssuerSigned,
  verifyIssuerSigned,
  Cbor,
} from '../../mdoc-core.js';

const signerKeyPem = fs.readFileSync(
  new URL('../../key-management/keys/mdoc-signer.private.pem', import.meta.url),
  'utf8'
);
const certDer = fs.readFileSync(
  new URL('../../key-management/keys/mdoc-signer.cert.der', import.meta.url)
);

test('device signature proves possession of the device private key', () => {
  const { publicJwk, privateJwk } = generateDeviceKeyPair();
  const challenge = Buffer.from('session-transcript-challenge');

  const signature = buildDeviceSignature(privateJwk, challenge);
  assert.strictEqual(verifyDeviceSignature(signature, publicJwk, challenge), true);

  // A different challenge must fail.
  assert.strictEqual(verifyDeviceSignature(signature, publicJwk, Buffer.from('other')), false);

  // A different device key must fail.
  const other = generateDeviceKeyPair();
  assert.strictEqual(verifyDeviceSignature(signature, other.publicJwk, challenge), false);
});

test('device-bound mdoc embeds the key that verifies the device signature', () => {
  const { publicJwk, privateJwk } = generateDeviceKeyPair();

  const namespaces = {
    'org.iso.23220.photoid.1': [['given_name', new Cbor().tstr('Erika').encode()]],
  };
  const generated = generateIssuerSigned({
    docType: 'org.iso.23220.photoid.1',
    namespaces,
    signerKeyPem,
    certDer,
    deviceJwk: publicJwk,
  });

  const verification = verifyIssuerSigned(generated.base64url);
  assert.strictEqual(verification.signatureValid, true);

  // The key in the MSO must verify a signature made by the device's private key.
  const challenge = Buffer.from('verifier-challenge');
  const signature = buildDeviceSignature(privateJwk, challenge);
  assert.strictEqual(verifyDeviceSignature(signature, publicJwk, challenge), true);
});
