#!/usr/bin/env node

/**
 * Canonical CLI generator for the ISO 23220 Photo ID mDOC credential.
 *
 * This is a thin wrapper over `mdoc-core.js` (the single source of truth for
 * the ISO 18013-5 IssuerSigned format). Run from the repo root:
 *
 *   node scripts/generate-mdoc.js
 *
 * Outputs the base64url credential and writes the same artifact files the
 * rest of the tooling consumes (mdoc-cbor.bin, mdoc-mso.bin,
 * mdoc-base64url-latest.txt).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Cbor,
  fullDate,
  generateIssuerSigned,
  verifyIssuerSigned,
} from '../mdoc-core.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DOC_TYPE = 'org.iso.23220.photoid.1';
const NS_PHOTOID = 'org.iso.23220.photoid.1';
const NS_QUALIFICATION = 'org.iso.23220.education.qualification.1';
const NS_TRANSCRIPT = 'org.iso.23220.education.transcript.1';

const portraitBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// namespace -> [ [elementIdentifier, pre-encoded CBOR element value], ... ]
const namespaces = {
  [NS_PHOTOID]: [
    ['portrait', new Cbor().bstr(portraitBytes).encode()],
    ['given_name', new Cbor().tstr('Erika').encode()],
    ['family_name', new Cbor().tstr('Mustermann').encode()],
    ['birth_date', fullDate('1964-08-12')],
    ['document_number', new Cbor().tstr('Z021AB37X13').encode()],
    ['issuing_authority', new Cbor().tstr('Smart College').encode()],
    ['issuing_country', new Cbor().tstr('NL').encode()],
    ['issue_date', fullDate('2025-03-24')],
    ['expiry_date', fullDate('2031-03-24')],
  ],
  [NS_QUALIFICATION]: [
    ['institution_name', new Cbor().tstr('MIT').encode()],
    ['degree_level', new Cbor().tstr('bachelor').encode()],
    ['field_of_study', new Cbor().tstr('Computer Science').encode()],
    ['graduation_date', fullDate('2026-05-15')],
    ['gpa', new Cbor().f64(3.9).encode()],
  ],
  [NS_TRANSCRIPT]: [
    ['student_id', new Cbor().tstr('STU-2026-001').encode()],
    [
      'courses',
      new Cbor().tstr(JSON.stringify([
        { courseCode: '6.S191', courseName: 'Machine Learning', credits: 3, grade: 'A' },
        { courseCode: '6.009', courseName: 'Programming', credits: 4, grade: 'A' },
      ])).encode(),
    ],
    ['total_credits', new Cbor().uint(7).encode()],
    ['status', new Cbor().tstr('completed').encode()],
  ],
};

const signerKeyPem = fs.readFileSync(
  process.env.MDOC_SIGNER_KEY_PATH || path.join(rootDir, 'key-management/keys/mdoc-signer.private.pem'),
  'utf8'
);
const certDer = fs.readFileSync(
  process.env.MDOC_SIGNER_CERT_PATH || path.join(rootDir, 'key-management/keys/mdoc-signer.cert.der')
);

const generated = generateIssuerSigned({
  docType: DOC_TYPE,
  namespaces,
  signerKeyPem,
  certDer,
});

const { issuerSigned, mso, base64url } = generated;

console.log('🎫 ISO 23220 Photo ID mDOC (IssuerSigned) — ISO 18013-5 compliant\n');
console.log('══════════════════════════════════════════════════════════════\n');
console.log(`CBOR size      : ${issuerSigned.length} bytes`);
console.log(`Base64URL      : ${base64url.length} chars`);
console.log(`MSO size       : ${mso.length} bytes`);
console.log(`Signature      : ES256`);
console.log(`Device key     : EC P-256`);
console.log(`Signer cert    : ${certDer.length} bytes DER\n`);

console.log('🔗 Base64URL (paste into https://paradym.id/tools/mdoc):\n');
console.log(base64url);
console.log();

// Write the same artifact files the rest of the tooling consumes
fs.writeFileSync(path.join(rootDir, 'mdoc-cbor.bin'), issuerSigned);
fs.writeFileSync(path.join(rootDir, 'mdoc-mso.bin'), mso);
fs.writeFileSync(
  path.join(rootDir, 'mdoc-base64-latest.txt'),
  issuerSigned.toString('base64')
);
fs.writeFileSync(path.join(rootDir, 'mdoc-base64url-latest.txt'), base64url);

console.log('✅ Saved: mdoc-cbor.bin, mdoc-mso.bin, mdoc-base64-latest.txt, mdoc-base64url-latest.txt\n');

// Self-check against the shared verifier
const verification = verifyIssuerSigned(issuerSigned);
console.log('🔍 Self-check:');
console.log(`   namespaces : ${Object.keys(verification.namespaces).length}`);
for (const [ns, items] of Object.entries(verification.namespaces)) {
  console.log(`     • ${ns} (${items.length} fields)`);
}
console.log(`   docType    : ${verification.docType}`);
console.log(`   digestAlg  : ${verification.digestAlgorithm}`);
console.log(`   ES256 sig  : ${verification.signatureValid ? '✓ VERIFIED' : '✗ INVALID'}`);
console.log(`   digests    : ${verification.digestsValid ? '✓ VALID' : '✗ INVALID'}`);
console.log('══════════════════════════════════════════════════════════════\n');
