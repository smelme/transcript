import { test } from 'node:test';
import assert from 'node:assert';
import {
  decodeMdoc,
  verifyMdoc,
  mdocToCredentialSummary,
} from '../src/services/mdocService.js';
import { generateIssuerSigned, Cbor, fullDate } from '../../mdoc-core.js';
import fs from 'fs';

const signerKeyPem = fs.readFileSync(new URL('../../key-management/keys/mdoc-signer.private.pem', import.meta.url), 'utf8');
const certDer = fs.readFileSync(new URL('../../key-management/keys/mdoc-signer.cert.der', import.meta.url));

const namespaces = {
  'org.iso.23220.photoid.1': [
    ['given_name', new Cbor().tstr('Erika').encode()],
    ['family_name', new Cbor().tstr('Mustermann').encode()],
    ['birth_date', fullDate('1964-08-12')],
    ['document_number', new Cbor().tstr('Z021AB37X13').encode()],
    ['issuing_authority', new Cbor().tstr('Smart College').encode()],
    ['issuing_country', new Cbor().tstr('NL').encode()],
    ['issue_date', fullDate('2025-03-24')],
    ['expiry_date', fullDate('2031-03-24')],
  ],
};

const generated = generateIssuerSigned({
  docType: 'org.iso.23220.photoid.1',
  namespaces,
  signerKeyPem,
  certDer,
});

test('Mobile Wallet - decode mdoc', () => {
  const parsed = decodeMdoc(generated.base64url);
  assert.strictEqual(parsed.docType, 'org.iso.23220.photoid.1');
  assert.ok(parsed.namespaces['org.iso.23220.photoid.1']);
  assert.strictEqual(parsed.namespaces['org.iso.23220.photoid.1'].length, 8);
});

test('Mobile Wallet - verify mdoc', () => {
  const verification = verifyMdoc(generated.base64url);
  assert.strictEqual(verification.signatureValid, true);
  assert.strictEqual(verification.digestsValid, true);
  assert.strictEqual(verification.valid, true);
});

test('Mobile Wallet - mdoc credential summary', () => {
  const summary = mdocToCredentialSummary(generated.base64url);
  assert.strictEqual(summary.issuer, 'Smart College');
  assert.strictEqual(summary.givenName, 'Erika');
  assert.strictEqual(summary.familyName, 'Mustermann');
  assert.strictEqual(summary.documentNumber, 'Z021AB37X13');
  assert.strictEqual(summary.birthDate, '1964-08-12');
  assert.strictEqual(summary.signatureValid, true);
});

test('Mobile Wallet - rejects tampered mdoc', () => {
  const tampered = Buffer.from(generated.issuerSigned);
  tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  const b64url = tampered.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const verification = verifyMdoc(b64url);
  assert.strictEqual(verification.valid, false);
});
