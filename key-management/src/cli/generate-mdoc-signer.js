#!/usr/bin/env node

/**
 * CLI: Generate the mdoc document-signer key (ES256 / P-256) and a
 * self-signed X.509 certificate, stored in the key-management key directory.
 *
 * Usage: node src/cli/generate-mdoc-signer.js [keyName]
 */

import { KeyManagementService } from '../index.js';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../../keys');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} failed: ${result.stderr || result.stdout}`);
  }
}

async function main() {
  const keyName = process.argv[2] || 'mdoc-signer';
  const subject = '/C=NL/O=Smart College/CN=Smart College';

  console.log(`Generating mdoc document-signer key + certificate: ${keyName}\n`);

  const keyManagement = new KeyManagementService({ keysDir, algorithm: 'ES256' });
  const keyData = await keyManagement.generateKeyPair(keyName);

  await fs.promises.mkdir(keysDir, { recursive: true });

  const privatePemPath = path.join(keysDir, `${keyName}.private.pem`);
  const certPemPath = path.join(keysDir, `${keyName}.cert.pem`);
  const certDerPath = path.join(keysDir, `${keyName}.cert.der`);

  await fs.promises.writeFile(privatePemPath, keyData.privateKey, 'utf8');

  // Self-sign an X.509 certificate with the generated key (openssl)
  run('openssl', [
    'req', '-new', '-x509',
    '-key', privatePemPath,
    '-out', certPemPath,
    '-days', '365',
    '-subj', subject,
  ]);
  run('openssl', [
    'x509', '-in', certPemPath,
    '-outform', 'DER',
    '-out', certDerPath,
  ]);

  // Register the public key + metadata in the key registry
  await keyManagement.storeKeyPair(keyName, keyData);

  console.log('mdoc signer generated:');
  console.log(`  Key ID:      ${keyData.keyId}`);
  console.log(`  Algorithm:   ${keyData.metadata.algorithm}`);
  console.log(`  Private key: ${privatePemPath}`);
  console.log(`  Certificate: ${certDerPath}`);
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
