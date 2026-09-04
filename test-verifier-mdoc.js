import { VerifierService } from './verifier-service/src/index.js';
import { generateIssuerSigned, Cbor, fullDate } from './mdoc-core.js';
import fs from 'fs';

const signerKeyPem = fs.readFileSync('key-management/keys/mdoc-signer.private.pem', 'utf8');
const certDer = fs.readFileSync('key-management/keys/mdoc-signer.cert.der');

const namespaces = {
  'org.iso.23220.photoid.1': [
    ['given_name', new Cbor().tstr('Erika').encode()],
    ['family_name', new Cbor().tstr('Mustermann').encode()],
    ['birth_date', fullDate('1964-08-12')],
    ['issuing_authority', new Cbor().tstr('Smart College').encode()],
  ],
};

const generated = generateIssuerSigned({
  docType: 'org.iso.23220.photoid.1',
  namespaces,
  signerKeyPem,
  certDer,
});

const verifier = new VerifierService({ verifierId: 'verifier-test', verifierName: 'Smart College Verifier' });

// 1. Verify a valid mdoc
const ok = verifier.verifyMdoc(generated.base64url);
console.log('=== Valid mdoc ===');
console.log('success       :', ok.success);
console.log('signatureValid:', ok.signatureValid);
console.log('digestsValid  :', ok.digestsValid);
console.log('docType       :', ok.docType);
console.log('issuerCert    :', ok.issuerCert?.subject?.replace(/\n/g, ' '));
console.log('issuing_auth  :', ok.namespaces['org.iso.23220.photoid.1'].find(i => i.elementIdentifier === 'issuing_authority')?.elementValue);

// 2. Verify a tampered mdoc (flip a byte in the middle)
const tampered = Buffer.from(generated.issuerSigned);
const mid = Math.floor(tampered.length / 2);
tampered[mid] ^= 0xff;
const tamperedB64url = tampered.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
const bad = verifier.verifyMdoc(tamperedB64url);
console.log('\n=== Tampered mdoc ===');
console.log('success       :', bad.success, '(expected false)');
console.log('signatureValid:', bad.signatureValid, '(expected false)');
console.log('digestsValid  :', bad.digestsValid);

// 3. Stats reflect the two verifications
const stats = verifier.getStatistics();
console.log('\ntotalVerifications:', stats.totalVerifications, '(expected 2)');
console.log('verifiedCount:', stats.verifiedCount, '(expected 1)');
console.log('rejectedCount:', stats.rejectedCount, '(expected 1)');

const pass = ok.success && ok.signatureValid && ok.digestsValid && !bad.success;
console.log('\n' + (pass ? '✅ VERIFIER INTEGRATION PASSED' : '❌ VERIFIER INTEGRATION FAILED'));
if (!pass) process.exit(1);
