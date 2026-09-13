/**
 * Tests for Key Management Service
 * Coverage: Key generation, storage, retrieval, rotation, verification
 */

import assert from 'assert';
import { test } from 'node:test';
import { KeyManagementService } from '../src/index.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testKeysDir = path.join(__dirname, '../test-keys');

// Cleanup test keys directory
async function cleanupTestKeys() {
  try {
    await fs.rm(testKeysDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore if directory doesn't exist
  }
}

test('KeyManagementService - Generate Key Pair', async () => {
  await cleanupTestKeys();

  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });
  const keyData = await keyManagement.generateKeyPair('test-key');

  assert(keyData.keyId, 'keyId should be generated');
  assert(keyData.keyName === 'test-key', 'keyName should match');
  assert(keyData.publicKey.includes('PUBLIC KEY'), 'publicKey should be PEM format');
  assert(keyData.privateKey.includes('PRIVATE KEY'), 'privateKey should be PEM format');
  assert(keyData.publicKeyJWK, 'publicKeyJWK should be included');
  assert(keyData.metadata.algorithm === 'EdDSA', 'algorithm should be EdDSA');
  assert(keyData.metadata.status === 'active', 'status should be active');
});

test('KeyManagementService - Store Key Pair', async () => {
  await cleanupTestKeys();

  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });
  const keyData = await keyManagement.generateKeyPair('store-test');
  const storeResult = await keyManagement.storeKeyPair('store-test', keyData);

  assert(storeResult.success === true, 'store should succeed');
  assert(storeResult.keyId === keyData.keyId, 'stored keyId should match');

  // Verify file was created
  const keyFile = path.join(testKeysDir, 'store-test.json');
  const exists = await fs.access(keyFile).then(() => true).catch(() => false);
  assert(exists, 'key file should exist');
});

test('KeyManagementService - Load Public Key', async () => {
  await cleanupTestKeys();

  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });
  const originalKeyData = await keyManagement.generateKeyPair('load-test');
  await keyManagement.storeKeyPair('load-test', originalKeyData);

  const loadedKey = await keyManagement.loadPublicKey('load-test');

  assert(loadedKey.keyId === originalKeyData.keyId, 'loaded keyId should match');
  assert(loadedKey.keyName === 'load-test', 'loaded keyName should match');
  assert(loadedKey.publicKey === originalKeyData.publicKey, 'public key should match');
});

test('KeyManagementService - List Public Keys', async () => {
  await cleanupTestKeys();

  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });

  // Generate and store multiple keys
  for (let i = 1; i <= 3; i++) {
    const keyData = await keyManagement.generateKeyPair(`key-${i}`);
    await keyManagement.storeKeyPair(`key-${i}`, keyData);
  }

  const keys = await keyManagement.listPublicKeys();

  assert(keys.length === 3, 'should list all 3 keys');
  assert(keys[0].keyName, 'each key should have keyName');
  assert(keys[0].algorithm === 'EdDSA', 'each key should have algorithm');
  assert(keys[0].status, 'each key should have status');
});

test('KeyManagementService - Hash String', async () => {
  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });

  const testString = 'test-private-key-content';
  const hash1 = keyManagement.hashString(testString);
  const hash2 = keyManagement.hashString(testString);

  assert(hash1 === hash2, 'same input should produce same hash');
  assert(hash1.length === 64, 'hash should be SHA256 (64 chars hex)');
});

test('KeyManagementService - Verify Private Key Hash', async () => {
  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });

  const privateKeyPem = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
  const hash = keyManagement.hashString(privateKeyPem);

  assert(keyManagement.verifyPrivateKeyHash(privateKeyPem, hash), 'hash should verify');
  assert(!keyManagement.verifyPrivateKeyHash('different', hash), 'wrong key should not verify');
});

test('KeyManagementService - Get Key Metadata', async () => {
  await cleanupTestKeys();

  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });
  const keyData = await keyManagement.generateKeyPair('metadata-test');
  await keyManagement.storeKeyPair('metadata-test', keyData);

  const metadata = await keyManagement.getKeyMetadata('metadata-test');

  assert(metadata.keyId, 'metadata should have keyId');
  assert(metadata.algorithm === 'EdDSA', 'metadata should have algorithm');
  assert(metadata.status === 'active', 'metadata should have status');
  assert(metadata.createdAt, 'metadata should have createdAt');
});

test('KeyManagementService - Error Handling', async () => {
  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });

  try {
    await keyManagement.loadPublicKey('nonexistent-key');
    assert(false, 'should throw error for missing key');
  } catch (error) {
    assert(error.message.includes('Failed to load public key'), 'should have descriptive error');
  }
});

test('KeyManagementService - Export Public Key', async () => {
  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });
  const keyData = await keyManagement.generateKeyPair('export-test');

  assert(keyData.publicKey.includes('-----BEGIN PUBLIC KEY-----'), 'PEM format should be correct');
  assert(keyData.publicKey.includes('-----END PUBLIC KEY-----'), 'PEM format should be complete');
  assert(keyData.publicKeyJWK.kty === 'OKP', 'JWK should have correct kty');
  assert(keyData.publicKeyJWK.crv === 'Ed25519', 'JWK should have correct crv');
});

test('KeyManagementService - PEM Format Conversion', async () => {
  const keyManagement = new KeyManagementService({ keysDir: testKeysDir });

  const testBuffer = Buffer.from('test data');
  const pem = keyManagement.toPEM(testBuffer, 'TEST KEY');

  assert(pem.includes('-----BEGIN TEST KEY-----'), 'PEM should have BEGIN marker');
  assert(pem.includes('-----END TEST KEY-----'), 'PEM should have END marker');
  assert(pem.includes('\n'), 'PEM should have line breaks');
});

// Cleanup after all tests
await cleanupTestKeys();
