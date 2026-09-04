#!/usr/bin/env node

/**
 * Test Photo ID Credential Issuance
 * Tests the updated issuer service with ISO 23220 Photo ID credentials
 */

const ISSUER_API = 'http://localhost:3000';

// Photo ID Credential Request
const photoIDCredential = {
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
      {
        courseCode: '6.S191',
        courseName: 'Machine Learning',
        credits: 3,
        grade: 'A'
      },
      {
        courseCode: '6.009',
        courseName: 'Programming',
        credits: 4,
        grade: 'A'
      }
    ],
    total_credits: 7,
    status: 'completed'
  }
};

async function testPhotoIDIssuance() {
  console.log('🎫 Testing ISO 23220 Photo ID Credential Issuance\n');
  console.log('═════════════════════════════════════════════════════\n');

  try {
    // 1. Check health
    console.log('1️⃣  Checking issuer service health...');
    const healthRes = await fetch(`${ISSUER_API}/health`);
    const health = await healthRes.json();
    console.log(`   ✓ Service OK: ${health.status}`);
    console.log(`   ✓ Issuer ID: ${health.issuerId}\n`);

    // 2. Issue Photo ID credential
    console.log('2️⃣  Issuing Photo ID credential...');
    console.log(`   Request body: ${JSON.stringify(photoIDCredential, null, 2)}\n`);
    
    const issueRes = await fetch(`${ISSUER_API}/credentials/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(photoIDCredential)
    });

    const issueResult = await issueRes.json();
    
    if (!issueResult.success) {
      console.log('   ❌ Issuance failed:');
      console.log(`      Error: ${issueResult.error}\n`);
      return;
    }

    console.log('   ✓ Credential issued successfully');
    console.log(`   ✓ Credential ID: ${issueResult.credentialId}`);
    console.log(`   ✓ Document Type: ${issueResult.docType}`);
    console.log(`   ✓ Status: ${issueResult.status}`);
    console.log(`   ✓ Issued: ${issueResult.issuanceDate}`);
    console.log(`   ✓ Expires: ${issueResult.expiryDate}\n`);

    const credentialId = issueResult.credentialId;

    // 3. Retrieve credential
    console.log('3️⃣  Retrieving issued credential...');
    const getRes = await fetch(`${ISSUER_API}/credentials/${credentialId}`);
    const getResult = await getRes.json();

    if (!getResult.success) {
      console.log(`   ❌ Retrieval failed: ${getResult.error}\n`);
      return;
    }

    console.log('   ✓ Credential retrieved');
    console.log('   📋 Full Credential Data:');
    console.log(JSON.stringify(getResult.credential, null, 2));
    console.log();

    // 4. Generate QR code
    console.log('4️⃣  Generating QR code...');
    const qrRes = await fetch(`${ISSUER_API}/credentials/${credentialId}/qr`);
    const qrResult = await qrRes.json();

    if (!qrResult.success) {
      console.log(`   ❌ QR generation failed: ${qrResult.error}\n`);
      return;
    }

    console.log('   ✓ QR code generated');
    console.log(`   ✓ Payload: ${JSON.stringify(qrResult.payload, null, 2)}\n`);

    // 5. List credentials
    console.log('5️⃣  Listing all credentials...');
    const listRes = await fetch(`${ISSUER_API}/credentials`);
    const listResult = await listRes.json();

    console.log(`   ✓ Total credentials: ${listResult.total}`);
    console.log(`   ✓ Credentials in page: ${listResult.credentials.length}\n`);

    // 6. Get statistics
    console.log('6️⃣  Retrieving statistics...');
    const statsRes = await fetch(`${ISSUER_API}/statistics`);
    const statsResult = await statsRes.json();

    console.log('   ✓ Statistics:');
    console.log(`      - Total Issued: ${statsResult.totalIssued}`);
    console.log(`      - By Type: ${JSON.stringify(statsResult.byType)}`);
    console.log(`      - Active Credentials: ${statsResult.activeCredentials}\n`);

    console.log('═════════════════════════════════════════════════════');
    console.log('✅ Photo ID Credential Workflow Test Complete!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
testPhotoIDIssuance();
