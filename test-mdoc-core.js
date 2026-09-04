import fs from 'fs';
import {
  Cbor,
  fullDate,
  generateIssuerSigned,
  verifyIssuerSigned,
  parseMdoc,
} from './mdoc-core.js';

const DOC_TYPE = 'org.iso.23220.photoid.1';
const NS_PHOTOID = 'org.iso.23220.photoid.1';
const NS_QUALIFICATION = 'org.iso.23220.education.qualification.1';
const NS_TRANSCRIPT = 'org.iso.23220.education.transcript.1';

const portrait = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const namespaces = {
  [NS_PHOTOID]: [
    ['portrait', new Cbor().bstr(portrait).encode()],
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
    ['total_credits', new Cbor().uint(7).encode()],
    ['status', new Cbor().tstr('completed').encode()],
  ],
};

const signerKeyPem = fs.readFileSync('key-management/keys/mdoc-signer.private.pem', 'utf8');
const certDer = fs.readFileSync('key-management/keys/mdoc-signer.cert.der');

// 1. Generate via shared library
const generated = generateIssuerSigned({
  docType: DOC_TYPE,
  namespaces,
  signerKeyPem,
  certDer,
});

console.log('Generated:', generated.issuerSigned.length, 'bytes, base64url', generated.base64url.length, 'chars\n');

// 2. Verify via shared library
const verification = verifyIssuerSigned(generated.issuerSigned);

console.log('=== Verification (shared library) ===');
console.log('valid          :', verification.valid);
console.log('signatureValid :', verification.signatureValid);
console.log('digestsValid   :', verification.digestsValid);
console.log('docType        :', verification.docType);
console.log('digestAlgorithm:', verification.digestAlgorithm);
console.log('issuerCert     :', verification.issuerCert?.subject);
console.log('validity       :', JSON.stringify(verification.validityInfo, null, 2));
console.log('deviceKey kty  :', verification.deviceKey?.kty, 'crv:', verification.deviceKey?.crv);
console.log('namespaces     :', Object.keys(verification.namespaces).length);
for (const [ns, items] of Object.entries(verification.namespaces)) {
  console.log(`  • ${ns} (${items.length})`);
  for (const it of items) {
    const v = it.elementValue;
    const display = typeof v === 'object' && v !== null
      ? (v.type === 'date' ? v.value : JSON.stringify(v).slice(0, 60))
      : v;
    console.log(`      ${it.elementIdentifier} = ${display}`);
  }
}

// 3. Also verify the standalone generator's output file
const standaloneB64url = fs.readFileSync('mdoc-base64url-latest.txt', 'utf8').trim();
const standaloneCheck = verifyIssuerSigned(standaloneB64url);
console.log('\n=== Standalone generate-mdoc-iso.js output ===');
console.log('signatureValid :', standaloneCheck.signatureValid);
console.log('digestsValid   :', standaloneCheck.digestsValid);
console.log('issuing_authority:', standaloneCheck.namespaces?.[NS_PHOTOID]?.find(i => i.elementIdentifier === 'issuing_authority')?.elementValue);

if (verification.valid && standaloneCheck.signatureValid) {
  console.log('\n✅ ALL CHECKS PASSED');
} else {
  console.log('\n❌ CHECKS FAILED');
  console.log('generation error:', verification.error);
  console.log('standalone error:', standaloneCheck.error);
  process.exit(1);
}
