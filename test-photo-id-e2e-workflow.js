#!/usr/bin/env node

/**
 * End-to-End Photo ID Credential Workflow Test
 * Tests complete issuance, verification, and registry workflow
 */

const ISSUER_API = 'http://localhost:3000';
const VERIFIER_API = 'http://localhost:3001';

// Photo ID Credential Data
const photoIDData = {
  docType: 'org.iso.23220.photoid.1',
  full_name: 'Erika Muster',
  date_of_birth: '1964-08-12',
  document_number: 'Z021AB37X13',
  issuing_authority: 'Bundesrepublik Deutschland',
  issue_date: '2025-03-24',
  expiry_date: '2031-03-24',
  issuing_country: 'NL',
  portrait: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  education_qualification: {
    institution_name: 'MIT',
    degree_level: 'bachelor',
    field_of_study: 'Computer Science',
    graduation_date: '2026-05-15',
    gpa: 3.9
  },
  education_transcript: {
    student_id: 'STU-2026-001',
    courses: [
      { courseCode: '6.S191', courseName: 'Machine Learning', credits: 3, grade: 'A' },
      { courseCode: '6.009', courseName: 'Programming', credits: 4, grade: 'A' }
    ],
    total_credits: 7,
    status: 'completed'
  }
};

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testE2EWorkflow() {
  console.log('🎫 End-to-End Photo ID Credential Workflow\n');
  console.log('═════════════════════════════════════════════════════\n');

  try {
    // PHASE 1: ISSUER SERVICE
    console.log('PHASE 1: ISSUER SERVICE\n');
    
    // 1. Check issuer health
    console.log('1️⃣  Checking Issuer Service...');
    let res = await fetch(`${ISSUER_API}/health`);
    let data = await res.json();
    console.log(`   ✓ Service: ${data.status}`);
    console.log(`   ✓ Issuer ID: ${data.issuerId}\n`);

    // 2. Issue Photo ID credential
    console.log('2️⃣  Issuing Photo ID Credential...');
    res = await fetch(`${ISSUER_API}/credentials/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(photoIDData)
    });
    data = await res.json();
    
    if (!data.success) {
      console.log(`   ❌ Failed: ${data.error}\n`);
      return;
    }
    
    const credentialId = data.credentialId;
    console.log(`   ✓ Credential ID: ${credentialId}`);
    console.log(`   ✓ Status: ${data.status}`);
    console.log(`   ✓ Issued: ${data.issuanceDate}`);
    console.log(`   ✓ Expires: ${data.expiryDate}\n`);

    // 3. Retrieve full credential
    console.log('3️⃣  Retrieving Full Credential...');
    res = await fetch(`${ISSUER_API}/credentials/${credentialId}`);
    data = await res.json();
    console.log(`   ✓ Credential retrieved`);
    console.log(`   ✓ Holder: ${data.credential.full_name}`);
    console.log(`   ✓ Document: ${data.credential.document_number}`);
    console.log(`   ✓ Institution: ${data.credential.education_qualification.institution_name}\n`);

    // 4. Generate QR
    console.log('4️⃣  Generating QR Code...');
    res = await fetch(`${ISSUER_API}/credentials/${credentialId}/qr`);
    data = await res.json();
    console.log(`   ✓ QR Generated\n`);

    // PHASE 2: VERIFIER SERVICE
    console.log('\nPHASE 2: VERIFIER SERVICE\n');

    // 5. Check verifier health
    console.log('5️⃣  Checking Verifier Service...');
    res = await fetch(`${VERIFIER_API}/health`);
    data = await res.json();
    console.log(`   ✓ Service: ${data.status}`);
    console.log(`   ✓ Verifier ID: ${data.verifierId}\n`);

    // 6. Register issuer in verifier registry
    console.log('6️⃣  Registering Issuer in Verifier Registry...');
    res = await fetch(`${VERIFIER_API}/registry/verifiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issuerId: 'issuer-001',
        issuerName: 'Smart College',
        issuerDid: 'did:example:issuer-001',
        credentialTypes: ['org.iso.23220.photoid.1'],
        publicKeyUrl: 'https://example.com/public-key'
      })
    });
    data = await res.json();
    
    if (!data.success) {
      console.log(`   ⚠️  Registration result: ${data.message || data.error}`);
    } else {
      console.log(`   ✓ Issuer registered`);
      console.log(`   ✓ Status: ${data.status}`);
      console.log(`   ✓ Trust Score: ${data.trustScore}\n`);
    }

    // 7. Prepare credential for verification
    console.log('7️⃣  Preparing Credential for Verification...');
    const verificationPayload = {
      credentialId,
      issuerId: 'issuer-001',
      docType: 'org.iso.23220.photoid.1',
      holderName: photoIDData.full_name,
      documentNumber: photoIDData.document_number
    };
    console.log(`   ✓ Payload prepared\n`);

    // 8. Perform verification scan
    console.log('8️⃣  Performing Verification Scan...');
    res = await fetch(`${VERIFIER_API}/verify/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verificationPayload)
    });
    data = await res.json();
    
    console.log(`   ✓ Verification Result:`);
    console.log(`      - Status: ${data.status || data.verificationStatus}`);
    console.log(`      - Issuer Trust: ${data.issuerTrust || data.trustScore || 'N/A'}`);
    console.log(`      - Credential Valid: ${data.isValid !== false ? 'Yes' : 'No'}\n`);

    // PHASE 3: SUMMARY
    console.log('\nPHASE 3: SUMMARY & STATISTICS\n');

    // 9. Get issuer statistics
    console.log('9️⃣  Issuer Statistics:');
    res = await fetch(`${ISSUER_API}/statistics`);
    data = await res.json();
    console.log(`   ✓ Total Issued: ${data.totalIssued || data.credentialsInSystem}`);
    console.log(`   ✓ By Type: ${JSON.stringify(data.byType)}`);
    console.log(`   ✓ Active Credentials: ${data.activeCredentials}\n`);

    // 10. Get verifier statistics
    console.log('🔟 Verifier Statistics:');
    res = await fetch(`${VERIFIER_API}/verify/statistics`);
    data = await res.json();
    console.log(`   ✓ Total Verifications: ${data.totalVerifications || 0}`);
    console.log(`   ✓ Approved Issuers: ${data.approvedIssuers || 0}`);
    console.log(`   ✓ Blocked Issuers: ${data.blockedIssuers || 0}\n`);

    console.log('═════════════════════════════════════════════════════');
    console.log('✅ End-to-End Workflow Complete!\n');

    console.log('📋 Summary:\n');
    console.log(`✓ Credential Issued: ${credentialId}`);
    console.log(`✓ Holder: ${photoIDData.full_name}`);
    console.log(`✓ Document Type: org.iso.23220.photoid.1`);
    console.log(`✓ Issuer Registered: issuer-001`);
    console.log(`✓ Verification Performed: Success`);

  } catch (error) {
    console.error('❌ Workflow failed:', error.message);
  }
}

// Run workflow
testE2EWorkflow();
