#!/usr/bin/env node

/**
 * CLI Tool: Generate ED25519 Key Pair
 * Usage: node src/cli/generate-keys.js <keyName>
 */

import { KeyManagementService } from '../index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../../keys');

async function main() {
  const keyName = process.argv[2] || 'issuer-key';

  console.log('\n🔐 ED25519 Key Pair Generator\n');
  console.log(`Generating key pair: ${keyName}\n`);

  try {
    const keyManagement = new KeyManagementService({ keysDir });

    // Generate key pair
    const keyData = await keyManagement.generateKeyPair(keyName);

    // Store key pair
    await keyManagement.storeKeyPair(keyName, keyData);

    console.log('✓ Key pair generated successfully!\n');
    console.log(`Key ID: ${keyData.keyId}`);
    console.log(`Key Name: ${keyData.keyName}`);
    console.log(`Algorithm: ${keyData.metadata.algorithm}`);
    console.log(`Created: ${keyData.metadata.createdAt}\n`);

    console.log('📁 Files Created:');
    console.log(`  - Public Key: keys/${keyName}.json`);
    console.log(`  - Private Key: keys/${keyName}.private.pem\n`);

    console.log('🔒 IMPORTANT - Secure Private Key:\n');
    console.log('For PRODUCTION, store private key in environment variable:');
    console.log(`  export ISSUER_PRIVATE_KEY_${keyData.keyId}='<content of keys/${keyName}.private.pem>'\n`);

    console.log('For DEVELOPMENT, the private key is stored locally.\n');

    console.log('📋 Public Key JWK (for distribution to verifiers):');
    console.log(JSON.stringify(keyData.publicKeyJWK, null, 2));

    console.log('\n✓ Setup Complete!');
    console.log('Next Step: Add public key to verifier registry');

  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
