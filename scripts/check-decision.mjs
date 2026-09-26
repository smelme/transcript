// scripts/check-decision.mjs — the decision point's wording, checked (P0-35)
//
// The wording here is the acceptance criterion, not the styling, so it is worth checking the way
// a route is checked. The assertions below encode the four rules the copy has to keep to:
//
//   1. Only a `yes` reaches the self-service door.
//   2. `unknown` never renders an accusation — no "failed", no "invalid", no "not found".
//   3. The window figure appears once, and the copy states the same number the registry measures.
//   4. Both doors are always described, with what each costs and how long each takes.
//
// Run with: node scripts/check-decision.mjs

import assert from 'node:assert/strict';
import {
  allCopy,
  DOORS,
  ELIGIBILITY_WINDOW_YEARS,
  outcomeFor,
  REQUEST_PAGE_URL,
} from '../issuer-frontend/app/lib/doors.js';

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

// ── 1. Only a yes reaches the self-service door ────────────────────────────────────────────
check('a yes takes the self-service door', () => {
  const outcome = outcomeFor({ verdict: 'yes', name: 'Ada Lovelace', completedYear: 2024 });
  assert.equal(outcome.door, 'self');
  assert.match(outcome.body, /Ada Lovelace/);
  assert.match(outcome.body, /2024/);
});

check('a no takes the checked path', () => {
  const outcome = outcomeFor({ verdict: 'no', name: 'Ada Lovelace', completedYear: 2015 });
  assert.equal(outcome.door, 'checked');
});

check('an unmatchable address takes the checked path', () => {
  assert.equal(outcomeFor({ verdict: 'unknown', reason: 'no_match' }).door, 'checked');
});

check('a thin record takes the checked path', () => {
  const outcome = outcomeFor({
    verdict: 'unknown',
    reason: 'record_too_thin',
    missing: ['the completion date'],
  });
  assert.equal(outcome.door, 'checked');
  // The refusal names what is missing rather than blaming the applicant.
  assert.match(outcome.body, /the completion date/);
});

check('every other answer takes the checked path', () => {
  // A registry that did not answer is not a verdict, and must never be rendered as one.
  for (const answer of [
    { verdict: 'unknown', reason: 'registry_unreachable' },
    { verdict: 'unknown', reason: 'registry_unrecognised_answer' },
    { verdict: 'unknown' },
    {},
    undefined,
  ]) {
    assert.equal(
      outcomeFor(answer).door,
      'checked',
      `an answer of ${JSON.stringify(answer)} must not reach the self-service door`
    );
  }
});

check('no verdict and no reason ever arrives at the self-service door by accident', () => {
  // The dangerous direction: anything unrecognised must fall to the checked path, never to self.
  for (const verdict of ['no', 'unknown', 'maybe', 'YES ', '', null, undefined, true, 1]) {
    assert.notEqual(outcomeFor({ verdict }).door, 'self', `verdict ${JSON.stringify(verdict)} reached self-service`);
  }
});

// ── 2. `unknown` never renders an accusation ───────────────────────────────────────────────
check('no sentence accuses the applicant of anything', () => {
  // Words that turn a missing match into an accusation. "Could not match" is allowed; "failed" is
  // not, and neither is anything that reads as a judgement of the person.
  const forbidden = [
    'failed',
    'failure',
    'invalid',
    'denied',
    'rejected',
    'suspicious',
    'fraud',
    'error',
    'not found',
    'no record',
    'unable to verify',
    'verification failed',
    'mismatch',
  ];

  for (const sentence of allCopy()) {
    for (const word of forbidden) {
      assert.equal(
        sentence.toLowerCase().includes(word),
        false,
        `"${word}" appears in: ${sentence}`
      );
    }
  }
});

check('the unknown answers differ from the unmatchable one, so the sentence stays true', () => {
  // A registry we could not reach is a different fact from an address we could not match, and
  // saying the wrong one is a claim about the applicant we have not established.
  assert.notEqual(outcomeFor({ verdict: 'unknown', reason: 'no_match' }).body, outcomeFor({ verdict: 'unknown', reason: 'registry_unreachable' }).body);
});

// ── 3. Every year figure in the copy is the window's, so the two cannot drift ─────────────
check('every year figure in the copy is the configured window', () => {
  // The figure is stated in both path labels, which is the point of them: the two paths are how
  // somebody picks, and they pick by when they studied. What must never happen is a *second*
  // figure appearing, because then the page and the rule the institution measures by would
  // disagree and the applicant would be told something untrue.
  const figures = allCopy().flatMap((sentence) =>
    [...String(sentence).matchAll(/(\d+)\s*years?/g)].map((match) => Number(match[1]))
  );

  assert.ok(figures.length >= 2, 'the window figure must be stated where the paths are described');
  for (const figure of figures) {
    assert.equal(figure, ELIGIBILITY_WINDOW_YEARS, `the copy states "${figure} years" somewhere`);
  }
});

check('the two paths are told apart by when the applicant studied, not by what we decide', () => {
  for (const door of Object.values(DOORS)) {
    assert.match(
      door.name,
      new RegExp(`${ELIGIBILITY_WINDOW_YEARS} years`),
      `the ${door.key} path must be recognisable by timeframe, because that is how it is chosen`
    );
  }
  assert.notEqual(DOORS.self.name, DOORS.checked.name, 'the two paths must be distinguishable');
});

// ── 4. Both doors are always described, with their costs and waits ─────────────────────────
check('both paths state what they cost, how long they take and what is needed', () => {
  for (const [name, door] of Object.entries(DOORS)) {
    for (const field of ['name', 'what', 'cost', 'wait', 'needs', 'action']) {
      assert.ok(
        typeof door[field] === 'string' && door[field].trim() !== '',
        `the ${name} path must state its ${field}`
      );
    }
  }
});

check('the checked path is a reachable address', () => {
  assert.match(REQUEST_PAGE_URL, /^https?:\/\//, 'the checked path must be an absolute address');
  assert.match(REQUEST_PAGE_URL, /\/request$/, 'the checked path must be the asking page');
});

check('every outcome that is not self-service points the applicant somewhere', () => {
  const answers = [
    { verdict: 'no' },
    { verdict: 'unknown', reason: 'no_match' },
    { verdict: 'unknown', reason: 'record_too_thin' },
    { verdict: 'unknown', reason: 'registry_unreachable' },
  ];

  for (const answer of answers) {
    const outcome = outcomeFor(answer);
    assert.match(
      outcome.body,
      /ask us to check/i,
      `the copy for ${JSON.stringify(answer)} must offer the checked path`
    );
  }
});

// ── report ────────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length > 0) {
  console.log(`DECISION_CHECK_FAILED — ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`DECISION_CHECK_PASSED — ${passed} checks`);
