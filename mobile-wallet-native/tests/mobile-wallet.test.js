import { test } from 'node:test';
import assert from 'node:assert';
import {
  storeCredential,
  getCredential,
  getStoredCredentials,
  deleteCredential,
  receiveCredential,
  getWalletStats,
  getWalletId,
  exportCredentials,
  importCredentials
} from '../src/services/walletService.js';

import {
  shareCredentialViaNFC,
  encodeCredentialForNFC,
  decodeCredentialFromNFC,
  validateNFCPayload
} from '../src/services/nfcService.js';

// =========================
// Wallet Service Tests
// =========================

test('Mobile Wallet - Store Credential', async () => {
  const credential = {
    credentialId: 'cred-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    issuer: 'State University',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  const stored = await storeCredential(credential);
  assert.strictEqual(stored.credentialId, 'cred-001');
  assert.ok(stored.storedAt);
  assert.strictEqual(stored.shareCount, 0);
});

test('Mobile Wallet - Get Credential', async () => {
  const credential = {
    credentialId: 'cred-get-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    issuer: 'State University',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  await storeCredential(credential);
  const retrieved = await getCredential('cred-get-001');
  
  assert.strictEqual(retrieved.credentialId, 'cred-get-001');
  assert.ok(retrieved.lastAccessedAt);
});

test('Mobile Wallet - Get Non-existent Credential', async () => {
  const retrieved = await getCredential('non-existent-001');
  assert.strictEqual(retrieved, null);
});

test('Mobile Wallet - Delete Credential', async () => {
  const credential = {
    credentialId: 'cred-del-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    issuer: 'State University',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  await storeCredential(credential);
  const deleted = await deleteCredential('cred-del-001');
  
  assert.strictEqual(deleted, true);
  
  const retrieved = await getCredential('cred-del-001');
  assert.strictEqual(retrieved, null);
});

test('Mobile Wallet - Delete Non-existent Credential', async () => {
  const deleted = await deleteCredential('non-existent-001');
  assert.strictEqual(deleted, false);
});

test('Mobile Wallet - Get Stored Credentials', async () => {
  const cred1 = {
    credentialId: 'cred-list-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    issuer: 'State University',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  const cred2 = {
    credentialId: 'cred-list-002',
    issuerId: 'issuer-002',
    credentialType: 'EmploymentCredential',
    issuer: 'Tech Company',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  await storeCredential(cred1);
  await storeCredential(cred2);

  const all = await getStoredCredentials();
  assert.ok(all.length >= 2);
});

test('Mobile Wallet - Filter Credentials by Type', async () => {
  const credentials = await getStoredCredentials({ credentialType: 'AcademicCredential' });
  assert.ok(Array.isArray(credentials));
  credentials.forEach(c => {
    assert.strictEqual(c.credentialType, 'AcademicCredential');
  });
});

test('Mobile Wallet - Receive Credential', async () => {
  const credentialData = {
    credentialId: 'cred-received-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    issuer: 'State University',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  const received = await receiveCredential(credentialData);
  assert.strictEqual(received.credentialId, 'cred-received-001');
  assert.strictEqual(received.issuerId, 'issuer-001');
});

test('Mobile Wallet - Receive Credential Validation', async () => {
  const invalidData = {
    credentialType: 'AcademicCredential'
    // Missing credentialId and issuerId
  };

  try {
    await receiveCredential(invalidData);
    assert.fail('Should have thrown an error');
  } catch (error) {
    assert.ok(error.message.includes('Invalid credential data'));
  }
});

test('Mobile Wallet - Get Wallet Stats', async () => {
  const stats = await getWalletStats();
  
  assert.ok(stats.walletId);
  assert.strictEqual(typeof stats.totalCredentials, 'number');
  assert.strictEqual(typeof stats.validCredentials, 'number');
  assert.strictEqual(typeof stats.expiredCredentials, 'number');
  assert.ok(stats.byType);
  assert.ok(stats.lastUpdated);
});

test('Mobile Wallet - Get Wallet ID', () => {
  const walletId = getWalletId();
  
  assert.ok(walletId);
  assert.ok(walletId.startsWith('wallet-'));
});

test('Mobile Wallet - Export Credentials', async () => {
  const backup = await exportCredentials();
  
  assert.ok(backup.walletId);
  assert.ok(Array.isArray(backup.credentials));
  assert.strictEqual(typeof backup.count, 'number');
  assert.ok(backup.exportedAt);
});

test('Mobile Wallet - Import Credentials', async () => {
  const backupData = {
    walletId: 'wallet-backup-001',
    credentials: [
      {
        credentialId: 'cred-import-001',
        issuerId: 'issuer-001',
        credentialType: 'AcademicCredential',
        issuer: 'State University',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      }
    ],
    count: 1
  };

  const imported = await importCredentials(backupData);
  assert.strictEqual(imported, 1);
});

test('Mobile Wallet - Import Invalid Backup', async () => {
  const invalidBackup = {
    walletId: 'wallet-backup-001',
    credentials: null
  };

  try {
    await importCredentials(invalidBackup);
    assert.fail('Should have thrown an error');
  } catch (error) {
    assert.ok(error.message.includes('Invalid backup format'));
  }
});

// =========================
// NFC Service Tests
// =========================

test('Mobile Wallet - NFC Share Credential', async () => {
  const credential = {
    credentialId: 'cred-nfc-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    issuer: 'State University',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  };

  await storeCredential(credential);

  const result = await shareCredentialViaNFC({ credentialId: 'cred-nfc-001' });
  
  assert.strictEqual(result.success, true);
  assert.ok(result.shared);
  assert.strictEqual(result.shared.credentialId, 'cred-nfc-001');
  assert.ok(result.sharedAt);
  assert.ok(result.shareSize > 0);
});

test('Mobile Wallet - Encode Credential for NFC', () => {
  const credential = {
    credentialId: 'cred-encode-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential'
  };

  const encoded = encodeCredentialForNFC(credential);
  
  assert.ok(typeof encoded === 'string');
  
  const parsed = JSON.parse(encoded);
  assert.strictEqual(parsed.cid, 'cred-encode-001');
  assert.strictEqual(parsed.iss, 'issuer-001');
  assert.strictEqual(parsed.typ, 'AcademicCredential');
});

test('Mobile Wallet - Decode Credential from NFC', () => {
  const nfcData = JSON.stringify({
    cid: 'cred-decode-001',
    iss: 'issuer-001',
    typ: 'AcademicCredential',
    ts: new Date().toISOString()
  });

  const decoded = decodeCredentialFromNFC(nfcData);
  
  assert.strictEqual(decoded.credentialId, 'cred-decode-001');
  assert.strictEqual(decoded.issuerId, 'issuer-001');
  assert.strictEqual(decoded.credentialType, 'AcademicCredential');
  assert.ok(decoded.receivedAt);
});

test('Mobile Wallet - Decode Invalid NFC Payload', () => {
  try {
    decodeCredentialFromNFC('invalid json');
    assert.fail('Should have thrown an error');
  } catch (error) {
    assert.ok(error.message.includes('Invalid NFC payload format'));
  }
});

test('Mobile Wallet - Validate NFC Payload Valid', () => {
  const payload = {
    credentialId: 'cred-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential'
  };

  const isValid = validateNFCPayload(payload);
  assert.strictEqual(isValid, true);
});

test('Mobile Wallet - Validate NFC Payload Invalid', () => {
  const payload = {
    credentialId: 'cred-001'
    // Missing issuerId and credentialType
  };

  const isValid = validateNFCPayload(payload);
  assert.strictEqual(isValid, false);
});

test('Mobile Wallet - Validate Null NFC Payload', () => {
  const isValid = validateNFCPayload(null);
  assert.strictEqual(isValid, false);
});

test('Mobile Wallet - NFC Payload Size Validation', () => {
  const credential = {
    credentialId: 'cred-size-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential'
  };

  const encoded = encodeCredentialForNFC(credential);
  const sizeInBytes = Buffer.byteLength(encoded, 'utf8');
  
  // NFC Type 4 tags typically support 4KB
  assert.ok(sizeInBytes < 4096);
});
