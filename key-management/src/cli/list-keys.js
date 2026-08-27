#!/usr/bin/env node

/**
 * CLI Tool: List All Keys in Registry
 * Usage: node src/cli/list-keys.js
 */

import { KeyManagementService } from '../index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '../../keys');

async function main() {
  console.log(`\n📋 Key Registry\n`);

  try {
    const keyManagement = new KeyManagementService({ keysDir });
    const keys = await keyManagement.listPublicKeys();

    if (keys.length === 0) {
      console.log(`No keys found in registry.`);
      console.log(`Generate a new key: npm run generate-keys\n`);
      return;
    }

    console.log(`Found ${keys.length} key(s):\n`);
    
    keys.forEach((key, idx) => {
      console.log(`${idx + 1}. ${key.keyName}`);
      console.log(`   ID: ${key.keyId}`);
      console.log(`   Algorithm: ${key.algorithm}`);
      console.log(`   Status: ${key.status}`);
      console.log(`   Version: ${key.version}`);
      console.log(`   Created: ${key.createdAt}\n`);
    });

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
