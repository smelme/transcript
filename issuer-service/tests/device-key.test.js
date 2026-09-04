import { test } from 'node:test';
import assert from 'node:assert';
import { IssuerService } from '../src/index.js';
import { generateDeviceKeyPair } from '../../mdoc-core.js';

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

test('Device-bound issuance embeds the supplied device public key in the MSO', () => {
  const issuer = new IssuerService();
  const { publicJwk, privateJwk } = generateDeviceKeyPair();

  const result = issuer.issue({ ...baseCredential, device_key: publicJwk });
  assert.strictEqual(result.success, true, result.error);
  assert.strictEqual(result.deviceBound, true);
  assert.deepStrictEqual(result.deviceKey, publicJwk);
  assert.ok(result.mdocBase64url, 'mdoc should be generated for a device-bound credential');

  const mdoc = issuer.getCredentialMdoc(result.credentialId);
  assert.strictEqual(mdoc.deviceBound, true);
  assert.strictEqual(mdoc.verification.signatureValid, true);
  assert.strictEqual(mdoc.verification.digestsValid, true);

  // The MSO deviceKeyInfo must contain the exact public key supplied by the device.
  const dk = mdoc.verification.deviceKey;
  assert.ok(dk, 'deviceKey should be exposed from the verified MSO');
  assert.strictEqual(dk.kty, 2); // COSE EC2
  assert.strictEqual(dk.crv, 1); // COSE P-256
  assert.strictEqual(dk.x, Buffer.from(publicJwk.x, 'base64url').toString('base64'));
  assert.strictEqual(dk.y, Buffer.from(publicJwk.y, 'base64url').toString('base64'));

  // The device retains the private key for later device authentication.
  assert.ok(privateJwk.d, 'private JWK must include the private scalar d');
});

test('Issuance without a device_key remains non-device-bound (ephemeral key)', () => {
  const issuer = new IssuerService();
  const result = issuer.issue({ ...baseCredential });
  assert.strictEqual(result.success, true, result.error);
  assert.strictEqual(result.deviceBound, false);
  assert.strictEqual(result.deviceKey, null);
  assert.ok(result.mdocBase64url, 'mdoc should still be generated');

  const mdoc = issuer.getCredentialMdoc(result.credentialId);
  assert.strictEqual(mdoc.deviceBound, false);
  assert.ok(mdoc.verification.deviceKey, 'an ephemeral device key should still be embedded');
});

test('Invalid device_key is rejected', () => {
  const issuer = new IssuerService();
  const result = issuer.issue({
    ...baseCredential,
    device_key: { kty: 'RSA', n: 'x', e: 'y' },
  });
  assert.strictEqual(result.success, false);
  assert.match(result.error, /Invalid device_key/);
});
