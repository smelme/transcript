// scripts/check-wallet-entry.mjs — where the credential is offered, chosen by device (P0-47)
//
// The collecting screen leads with one of two things, and which one is decided from what the browser
// says about itself. Getting that wrong is quiet: a phone is shown a code it cannot usefully scan, or
// a laptop is offered a link that opens nothing. So the decision is a function rather than three
// lines inside the page, and these are what keep it honest:
//
//   1. A phone is offered the wallet it already has.
//   2. A desktop is offered the code, because there is no wallet on a desktop.
//   3. An iPad counts as a phone even though it calls itself a Mac.
//   4. A browser that states whether it is mobile is believed over its own user agent.
//   5. Nothing above turns a desktop into a phone.
//
// Run with: node scripts/check-wallet-entry.mjs

import assert from 'node:assert/strict';
import { looksLikePhone } from '../quals-frontend/app/lib/device.js';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

check('a phone is offered the wallet it is holding', () => {
  assert.equal(looksLikePhone({ userAgent: IPHONE }), true);
  assert.equal(looksLikePhone({ userAgent: ANDROID }), true);
});

check('a desktop is offered the code instead', () => {
  assert.equal(looksLikePhone({ userAgent: WINDOWS }), false);
  assert.equal(looksLikePhone({ userAgent: MAC }), false);
});

check('an iPad is a phone, however it introduces itself', () => {
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  assert.equal(looksLikePhone({ userAgent: ipad, coarsePointer: true }), true);
  // The same string with a mouse and a keyboard is a desktop, and is treated as one.
  assert.equal(looksLikePhone({ userAgent: ipad, coarsePointer: false }), false);
});

check('what the browser states outright is believed over its user agent', () => {
  assert.equal(looksLikePhone({ userAgent: WINDOWS, mobile: true }), true);
  assert.equal(looksLikePhone({ userAgent: IPHONE, mobile: false }), false);
  // An absent answer is not an answer, so the string decides.
  assert.equal(looksLikePhone({ userAgent: IPHONE, mobile: null }), true);
});

check('nothing here turns a desktop into a phone', () => {
  assert.equal(looksLikePhone({}), false);
  assert.equal(looksLikePhone(), false);
  assert.equal(looksLikePhone({ userAgent: WINDOWS, coarsePointer: false, mobile: false }), false);
});

console.log('');
if (failures.length > 0) {
  console.log(`WALLET_ENTRY_CHECK_FAILED — ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`WALLET_ENTRY_CHECK_PASSED — ${passed} checks`);
