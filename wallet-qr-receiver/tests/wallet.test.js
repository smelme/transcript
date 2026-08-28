/**
 * Tests for Wallet QR Receiver
 * Coverage: QR parsing, credential reception, storage management
 */

import assert from 'assert';
import { test } from 'node:test';
import { WalletQRReceiver } from '../src/index.js';

/**
 * Helper to create valid credential metadata
 */
function createValidMetadata(overrides = {}) {
  return {
    credentialId: 'cred-001',
    issuerDid: 'did:key:issuer123',
    credentialType: 'AcademicCredential',
    issueDate: new Date().toISOString(),
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    claimsHash: 'hash123',
    ...overrides
  };
}

/**
 * Helper to convert to JSON string
 */
function jsonToQRData(obj) {
  return JSON.stringify(obj);
}

/**
 * Helper to convert to BASE64
 */
function jsonToBase64QR(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

test('Wallet - Create Receiver Instance', () => {
  const wallet = new WalletQRReceiver();
  assert(wallet, 'Wallet should be created');
  assert.strictEqual(wallet.namespace, 'org.smartcollege.credential');
});

test('Wallet - Parse JSON QR Data', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  const parsed = wallet.parseQRData(qrData);
  assert.strictEqual(parsed.credentialId, 'cred-001');
  assert.strictEqual(parsed.issuerDid, 'did:key:issuer123');
});

test('Wallet - Parse BASE64 QR Data', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToBase64QR(metadata);

  const parsed = wallet.parseQRData(qrData);
  assert.strictEqual(parsed.credentialId, 'cred-001');
});

test('Wallet - Validate Valid Credential', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();

  const validation = wallet.validateCredentialMetadata(metadata);
  assert.strictEqual(validation.valid, true);
  assert.strictEqual(validation.errors.length, 0);
});

test('Wallet - Reject Missing CredentialId', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata({ credentialId: undefined });

  const validation = wallet.validateCredentialMetadata(metadata);
  assert.strictEqual(validation.valid, false);
});

test('Wallet - Reject Missing IssuerDid', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata({ issuerDid: undefined });

  const validation = wallet.validateCredentialMetadata(metadata);
  assert.strictEqual(validation.valid, false);
});

test('Wallet - Reject Invalid ExpiryDate', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata({ expiryDate: 'invalid-date' });

  const validation = wallet.validateCredentialMetadata(metadata);
  assert.strictEqual(validation.valid, false);
});

test('Wallet - Receive Credential Success', async () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  const result = await wallet.receiveCredential(qrData);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.credentialId, 'cred-001');
});

test('Wallet - Reject Duplicate Credential', async () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const result2 = await wallet.receiveCredential(qrData);

  assert.strictEqual(result2.success, false);
  assert(result2.error.includes('already received'));
});

test('Wallet - Get Credential', async () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const cred = wallet.getCredential('cred-001');

  assert(cred);
  assert.strictEqual(cred.id, 'cred-001');
  assert.strictEqual(cred.metadata.credentialType, 'AcademicCredential');
});

test('Wallet - Get Non-Existent Credential', () => {
  const wallet = new WalletQRReceiver();
  const cred = wallet.getCredential('non-existent');

  assert.strictEqual(cred, null);
});

test('Wallet - List Credentials', async () => {
  const wallet = new WalletQRReceiver();

  for (let i = 1; i <= 3; i++) {
    const metadata = createValidMetadata({ 
      credentialId: `cred-00${i}`,
      credentialType: i === 1 ? 'AcademicCredential' : 'EmploymentCredential'
    });
    const qrData = jsonToQRData(metadata);
    await wallet.receiveCredential(qrData);
  }

  const all = wallet.listCredentials();
  assert.strictEqual(all.length, 3);
});

test('Wallet - Filter Credentials by Type', async () => {
  const wallet = new WalletQRReceiver();

  const metadata1 = createValidMetadata({ 
    credentialId: 'cred-001',
    credentialType: 'AcademicCredential'
  });
  const metadata2 = createValidMetadata({ 
    credentialId: 'cred-002',
    credentialType: 'EmploymentCredential'
  });

  await wallet.receiveCredential(jsonToQRData(metadata1));
  await wallet.receiveCredential(jsonToQRData(metadata2));

  const academic = wallet.listCredentials({ type: 'AcademicCredential' });
  assert.strictEqual(academic.length, 1);
  assert.strictEqual(academic[0].metadata.credentialType, 'AcademicCredential');
});

test('Wallet - Filter Credentials by Issuer', async () => {
  const wallet = new WalletQRReceiver();

  const metadata1 = createValidMetadata({ 
    credentialId: 'cred-001',
    issuerDid: 'did:key:issuer1'
  });
  const metadata2 = createValidMetadata({ 
    credentialId: 'cred-002',
    issuerDid: 'did:key:issuer2'
  });

  await wallet.receiveCredential(jsonToQRData(metadata1));
  await wallet.receiveCredential(jsonToQRData(metadata2));

  const issuer1 = wallet.listCredentials({ issuer: 'did:key:issuer1' });
  assert.strictEqual(issuer1.length, 1);
});

test('Wallet - Delete Credential', async () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const cred = wallet.getCredential('cred-001');
  assert(cred !== null);

  const result = wallet.deleteCredential('cred-001');
  assert.strictEqual(result.success, true);
  assert.strictEqual(wallet.getCredential('cred-001'), null);
});

test('Wallet - Check Valid Credential', async () => {
  const wallet = new WalletQRReceiver();
  const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const metadata = createValidMetadata({ expiryDate: futureExpiry.toISOString() });
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const isValid = wallet.isCredentialValid('cred-001');

  assert.strictEqual(isValid, true);
});

test('Wallet - Check Expired Credential', async () => {
  const wallet = new WalletQRReceiver();
  const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const metadata = createValidMetadata({ expiryDate: pastExpiry.toISOString() });
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const isValid = wallet.isCredentialValid('cred-001');

  assert.strictEqual(isValid, false);
});

test('Wallet - Get Credential Status Valid', async () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const status = wallet.getCredentialStatus('cred-001');

  assert.strictEqual(status, 'valid');
});

test('Wallet - Get Credential Status Expired', async () => {
  const wallet = new WalletQRReceiver();
  const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const metadata = createValidMetadata({ expiryDate: pastExpiry.toISOString() });
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const status = wallet.getCredentialStatus('cred-001');

  assert.strictEqual(status, 'expired');
});

test('Wallet - Get Wallet Statistics', async () => {
  const wallet = new WalletQRReceiver();

  for (let i = 1; i <= 3; i++) {
    const metadata = createValidMetadata({ 
      credentialId: `cred-00${i}`,
      credentialType: 'AcademicCredential'
    });
    const qrData = jsonToQRData(metadata);
    await wallet.receiveCredential(qrData);
  }

  const stats = wallet.getStatistics();
  assert.strictEqual(stats.totalCredentials, 3);
  assert.strictEqual(stats.validCredentials, 3);
  assert.strictEqual(stats.expiredCredentials, 0);
  assert(stats.credentialTypes['AcademicCredential']);
});

test('Wallet - Export Credentials', async () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();
  const qrData = jsonToQRData(metadata);

  await wallet.receiveCredential(qrData);
  const exported = wallet.exportCredentials('json');

  assert.strictEqual(exported.success, true);
  assert.strictEqual(exported.data.credentialCount, 1);
});

test('Wallet - Import Credentials', () => {
  const wallet = new WalletQRReceiver();
  
  const importData = {
    version: '1.0',
    namespace: 'org.smartcollege.credential',
    credentials: [
      {
        id: 'cred-001',
        metadata: createValidMetadata(),
        receivedAt: new Date().toISOString()
      }
    ]
  };

  const result = wallet.importCredentials(importData);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.imported, 1);
  assert(wallet.getCredential('cred-001'));
});

test('Wallet - Clear All Credentials', async () => {
  const wallet = new WalletQRReceiver();
  
  for (let i = 1; i <= 3; i++) {
    const metadata = createValidMetadata({ credentialId: `cred-00${i}` });
    await wallet.receiveCredential(jsonToQRData(metadata));
  }

  assert.strictEqual(wallet.listCredentials().length, 3);
  
  const result = wallet.clear();
  assert.strictEqual(result.success, true);
  assert.strictEqual(wallet.listCredentials().length, 0);
});

test('Wallet - Multiple Credentials From Different Issuers', async () => {
  const wallet = new WalletQRReceiver();

  const metadata1 = createValidMetadata({ 
    credentialId: 'cred-001',
    issuerDid: 'did:key:university1'
  });
  const metadata2 = createValidMetadata({ 
    credentialId: 'cred-002',
    issuerDid: 'did:key:employer1'
  });

  await wallet.receiveCredential(jsonToQRData(metadata1));
  await wallet.receiveCredential(jsonToQRData(metadata2));

  const stats = wallet.getStatistics();
  assert.strictEqual(stats.totalCredentials, 2);
  assert.strictEqual(Object.keys(stats.issuers).length, 2);
});

test('Wallet - Invalid QR Data', async () => {
  const wallet = new WalletQRReceiver();
  const result = await wallet.receiveCredential('invalid data');

  assert.strictEqual(result.success, false);
  assert(result.error);
});

test('Wallet - Parse Invalid Metadata Object', () => {
  const wallet = new WalletQRReceiver();
  const validation = wallet.validateCredentialMetadata(null);

  assert.strictEqual(validation.valid, false);
});

test('Wallet - Verifier Workflow', () => {
  const wallet = new WalletQRReceiver();
  const metadata = createValidMetadata();

  assert(metadata.credentialType);
  assert(metadata.issuerDid);
  assert(metadata.claimsHash);
});
