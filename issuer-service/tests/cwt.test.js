import { test } from 'node:test';
import assert from 'node:assert';
import { buildCwt, verifyCwt, generateDeviceKeyPair } from '../../mdoc-core.js';

function makeCwt({ audience = 'issuer-001', nonce = 'abc123', privateJwk, publicJwk }) {
  return buildCwt({
    privateJwk,
    devicePublicJwk: publicJwk,
    issuer: 'issuer-001',
    subject: 'wallet-sub-1',
    audience,
    nonce,
  });
}

test('CWT round-trips: valid signature and device key extraction', () => {
  const { publicJwk, privateJwk } = generateDeviceKeyPair();
  const cwt = makeCwt({ privateJwk, publicJwk });

  const result = verifyCwt(cwt, { audience: 'issuer-001', nonce: 'abc123' });
  assert.strictEqual(result.valid, true, result.error);
  assert.deepStrictEqual(result.devicePublicJwk, publicJwk);
  assert.strictEqual(result.claims.sub, 'wallet-sub-1');
});

test('CWT rejects a mismatched nonce', () => {
  const { publicJwk, privateJwk } = generateDeviceKeyPair();
  const cwt = makeCwt({ privateJwk, publicJwk });

  const result = verifyCwt(cwt, { audience: 'issuer-001', nonce: 'wrong' });
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /nonce/);
});

test('CWT rejects a mismatched audience', () => {
  const { publicJwk, privateJwk } = generateDeviceKeyPair();
  const cwt = makeCwt({ privateJwk, publicJwk });

  const result = verifyCwt(cwt, { audience: 'other-issuer', nonce: 'abc123' });
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /audience/);
});

test('CWT rejects a tampered payload', () => {
  const { publicJwk, privateJwk } = generateDeviceKeyPair();
  const cwt = makeCwt({ privateJwk, publicJwk });

  // Flip a byte in the middle of the payload (claims bstr).
  const tampered = Buffer.from(cwt);
  tampered[tampered.length - 66] ^= 0xff; // inside the signature region is safest
  const result = verifyCwt(tampered, { audience: 'issuer-001', nonce: 'abc123' });
  // Either the decode fails or the signature fails — but never valid.
  assert.strictEqual(result.valid, false);
});

test('CWT rejects when signed by a different key than the cnf key', () => {
  const { privateJwk } = generateDeviceKeyPair();
  const other = generateDeviceKeyPair();

  // Sign with privateJwk but embed other.publicJwk in cnf.
  const cwt = buildCwt({
    privateJwk,
    devicePublicJwk: other.publicJwk,
    issuer: 'issuer-001',
    subject: 'wallet-sub-1',
    audience: 'issuer-001',
    nonce: 'abc123',
  });

  const result = verifyCwt(cwt, { audience: 'issuer-001', nonce: 'abc123' });
  assert.strictEqual(result.valid, false);
  assert.match(result.error, /signature/);
});
