#!/usr/bin/env node

/**
 * CLI: Generate the wallet access-token signer key (ES256 / P-256).
 *
 * This key is used to sign/verify the wallet's access tokens (JWTs) and is kept
 * SEPARATE from the mdoc document-signer key (`mdoc-signer`).
 *
 * Usage: node src/cli/generate-wallet-token-signer.js
 */

import { KeyManagementService } from '../index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../../keys');
const keyName = 'wallet-token-signer';

async function main() {
  const keyManagement = new KeyManagementService({ keysDir, algorithm: 'ES256' });
  const keyData = await keyManagement.generateKeyPair(keyName);

  await fs.promises.mkdir(keysDir, { recursive: true });
  const privatePemPath = path.join(keysDir, `${keyName}.private.pem`);
  await fs.promises.writeFile(privatePemPath, keyData.privateKey, 'utf8');

  await keyManagement.storeKeyPair(keyName, keyData);

  console.log('wallet access-token signer generated:');
  console.log(`  Key ID:      ${keyData.keyId}`);
  console.log(`  Algorithm:   ${keyData.metadata.algorithm}`);
  console.log(`  Private key: ${privatePemPath}`);
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
