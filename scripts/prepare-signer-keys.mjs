#!/usr/bin/env node
// Writes the signer keys onto the persistent volume before the issuer starts.
//
// The private keys are deliberately not in the repository, so they arrive as environment
// variables and are placed at the paths the issuer reads. If a variable is absent nothing is
// written, and the issuer then reports the missing key itself instead of signing with the wrong
// one in silence.

import fs from 'node:fs';
import path from 'node:path';

const targets = [
  { variable: 'MDOC_SIGNER_KEY_PEM', target: process.env.MDOC_SIGNER_KEY_PATH },
  { variable: 'WALLET_TOKEN_SIGNER_KEY_PEM', target: process.env.WALLET_TOKEN_SIGNER_KEY_PATH },
];

let written = 0;

for (const { variable, target } of targets) {
  const value = process.env[variable];

  if (!value) {
    console.log(`[keys] ${variable} is not set, nothing to write`);
    continue;
  }

  if (!target) {
    console.log(`[keys] ${variable} is set but no path variable points anywhere, skipping`);
    continue;
  }

  const body = value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, { mode: 0o600 });

  console.log(`[keys] wrote ${target}, ${body.length} bytes`);
  written += 1;
}

console.log(`[keys] ${written} key file(s) ready`);
