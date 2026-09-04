import { IssuerService } from './issuer-service/src/index.js';
import { verifyIssuerSigned } from './mdoc-core.js';

const issuer = new IssuerService({
  issuerId: 'issuer-test',
  issuerName: 'Smart College',
});

const result = issuer.issue({
  docType: 'org.iso.23220.photoid.1',
  full_name: 'Erika Mustermann',
  date_of_birth: '1964-08-12',
  document_number: 'Z021AB37X13',
  issuing_authority: 'Smart College',
  issue_date: '2025-03-24',
  expiry_date: '2031-03-24',
  issuing_country: 'NL',
  portrait: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  education_qualification: {
    institution_name: 'MIT',
    degree_level: 'bachelor',
    field_of_study: 'Computer Science',
    graduation_date: '2026-05-15',
    gpa: 3.9,
  },
  education_transcript: {
    student_id: 'STU-2026-001',
    courses: [
      { courseCode: '6.S191', courseName: 'Machine Learning', credits: 3, grade: 'A' },
      { courseCode: '6.009', courseName: 'Programming', credits: 4, grade: 'A' },
    ],
    total_credits: 7,
    status: 'completed',
  },
});

console.log('Issue result:', JSON.stringify({ ...result, mdocBase64url: result.mdocBase64url ? result.mdocBase64url.slice(0, 40) + '…' : null }, null, 2));

if (!result.success || !result.mdocBase64url) {
  console.error('❌ Issuer did not produce an mdoc');
  process.exit(1);
}

const mdoc = issuer.getCredentialMdoc(result.credentialId);
console.log('\n=== mdoc endpoint ===');
console.log('docType:', mdoc.docType);
console.log('signatureValid:', mdoc.verification.signatureValid);
console.log('digestsValid:', mdoc.verification.digestsValid);
console.log('issuerCert:', mdoc.verification.issuerCert?.subject?.replace(/\n/g, ' '));
for (const [ns, items] of Object.entries(mdoc.verification.namespaces)) {
  console.log(`  • ${ns} (${items.length})`);
  for (const it of items) {
    const v = it.elementValue;
    const d = typeof v === 'object' && v !== null ? (v.type === 'date' ? v.value : v.type) : v;
    console.log(`      ${it.elementIdentifier} = ${d}`);
  }
}

// Also verify directly from the base64url
const direct = verifyIssuerSigned(result.mdocBase64url);
console.log('\nDirect verify:', direct.valid ? '✅ VALID' : '❌ INVALID', '(signature', direct.signatureValid, 'digests', direct.digestsValid + ')');

if (!mdoc.verification.signatureValid || !mdoc.verification.digestsValid) {
  console.error('❌ ISSUER INTEGRATION FAILED');
  process.exit(1);
}
console.log('\n✅ ISSUER INTEGRATION PASSED');
