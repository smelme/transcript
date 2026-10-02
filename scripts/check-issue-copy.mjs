// scripts/check-issue-copy.mjs — what the issuing page says, checked (P0-42, P0-44)
//
// The wording on this screen is the whole of what it tells a reader, and it was wrong for two of the
// three states it has: a reader with nothing left to add was invited to choose, and a reader with
// nothing waiting at all was told their credentials were ready. Both is fixed, and the assertions
// below are what keep them fixed:
//
//   1. A reader with something to add is invited to choose.
//   2. A reader with nothing to add is not asked to choose anything, and is told where a copy comes
//      from instead.
//   3. A reader with nothing waiting is told that, rather than that something is ready.
//   4. Neither of the two conditions can be reached with copy that contradicts it.
//
// Run with: node scripts/check-issue-copy.mjs

import assert from 'node:assert/strict';
import { chooserCopy } from '../quals-frontend/app/lib/issue-copy.js';

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

check('a reader with something to add is invited to choose', () => {
  const { heading, lede } = chooserCopy(2, 2);

  assert.match(heading, /ready/i);
  assert.match(lede, /Choose the ones/, 'there is something to choose, so it may be asked for');
});

check('and one credential reads as one, not as several', () => {
  assert.equal(chooserCopy(1, 1).heading, 'Your credential is ready');
  assert.equal(chooserCopy(2, 2).heading, 'Your credentials are ready');
});

check('a reader with nothing to add is not asked to choose', () => {
  const { heading, lede } = chooserCopy(2, 0);

  assert.match(heading, /already in your wallet/i);
  assert.doesNotMatch(lede, /choose/i, 'nothing can be chosen, so nothing may be asked for');
  assert.match(lede, /Ask your institution/i, 'and it says where another copy comes from');
});

check('and that reads as one when the one thing is singular', () => {
  assert.equal(chooserCopy(1, 0).heading, 'Your credential is already in your wallet');
});

check('a reader with nothing waiting is not told their credentials are ready', () => {
  const { heading, lede } = chooserCopy(0, 0);

  assert.match(heading, /nothing is waiting/i);
  assert.doesNotMatch(heading, /ready/i, 'nothing waiting is not readiness');
  assert.match(lede, /check that your institution used this address/i);
});

check('a partly-collected list still invites a choice, because something is left', () => {
  const { heading, lede } = chooserCopy(2, 1);

  assert.match(heading, /ready/i);
  assert.match(lede, /choose/i);
});

check('no state is ever asked to choose from nothing', () => {
  for (let itemCount = 0; itemCount <= 4; itemCount += 1) {
    for (let offerable = 0; offerable <= itemCount; offerable += 1) {
      const { heading, lede } = chooserCopy(itemCount, offerable);
      const state = `${itemCount} held, ${offerable} to collect`;

      assert.ok(heading, `${state} has a heading`);
      assert.ok(lede, `${state} has a line under it`);

      if (offerable === 0) {
        assert.doesNotMatch(lede, /choose/i, `${state} may not ask for a choice`);
      }
      if (itemCount === 0) {
        assert.doesNotMatch(heading, /ready/i, `${state} is not readiness`);
      }
    }
  }
});

console.log('');
if (failures.length > 0) {
  console.log(`ISSUE_COPY_CHECK_FAILED — ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`ISSUE_COPY_CHECK_PASSED — ${passed} checks`);
