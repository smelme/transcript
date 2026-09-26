// scripts/check-decision.mjs — the decision point's wording, checked (P0-35)
//
// The wording here is the acceptance criterion, not the styling, so it is worth checking the way
// a route is checked. The assertions below encode the four rules the copy has to keep to:
//
//   1. Only a `yes` reaches the self-service door.
//   2. `unknown` never renders an accusation — no "failed", no "invalid", no "not found".
//   3. The window figure appears once, and the copy states the same number the registry measures.
//   4. Both doors are always described, with what each costs and how long each takes.
//   5. The demonstration list is exactly the addresses this deployment was asked to serve, and it
//      is never printed on a page.
//
// Run with: node scripts/check-decision.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  allCopy,
  CHECKED_PATH,
  ELIGIBILITY_WINDOW_YEARS,
  outcomeFor,
  REQUEST_PAGE_URL,
} from '../issuer-frontend/app/lib/doors.js';
import {
  DEMO_REGISTRY_ENABLED,
  DEMO_STUDENTS,
  demoEligibilityFor,
  demoStudentFor,
  withinWindow,
} from '../issuer-frontend/app/lib/demo-registry.js';

/** The addresses this deployment was asked to serve, and the whole of the demonstration list. */
const SERVED = ['s.melese+63@gmail.com', 's.melese+66@gmail.com'];

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

check('the way out is offered the way a sign-in screen offers one', () => {
  // The shape is the point. "Forgot your password?" is a question about circumstances, and it is
  // what makes the second road something an applicant takes rather than something they are told
  // they need. A prompt that read as a verdict would turn a legitimate graduate away.
  assert.match(CHECKED_PATH.prompt, /\?$/, 'the prompt must be a question to the applicant');
  assert.match(
    CHECKED_PATH.prompt,
    new RegExp(`${ELIGIBILITY_WINDOW_YEARS} years`),
    'the prompt must state the same window the institution measures by'
  );
  assert.doesNotMatch(
    CHECKED_PATH.prompt,
    /you did not|you failed|unable to|not eligible/i,
    'the prompt must not characterise the applicant'
  );
});

// ── 4. Both doors are always described, with their costs and waits ─────────────────────────
check('the way out states what it costs, how long it takes and what is needed', () => {
  for (const field of ['prompt', 'action', 'cost', 'wait', 'needs']) {
    assert.ok(
      typeof CHECKED_PATH[field] === 'string' && CHECKED_PATH[field].trim() !== '',
      `the second road must state its ${field}`
    );
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

// ── 5. The demonstration registry, and the fence around it ────────────────────────────────

check('the demonstration registry is off unless a deployment asks for it', () => {
  // Everything about the list rests on this. A registry that quietly decided who could collect a
  // real credential would be the worst kind of bug, because nobody would think to look for it.
  assert.equal(
    DEMO_REGISTRY_ENABLED,
    process.env.NEXT_PUBLIC_DEMO_REGISTRY === 'true',
    'the demo registry must follow the environment rather than a default of its own'
  );
  assert.equal(DEMO_REGISTRY_ENABLED, false, 'and it must be off in this tree');
});

check('the demonstration registry measures the same window the real one does', () => {
  const now = new Date('2026-09-26T00:00:00Z');

  assert.equal(withinWindow('2024-07-01', now), true, 'two years ago is inside');
  assert.equal(withinWindow('2015-07-01', now), false, 'eleven years ago is outside');
  // The boundary day counts, exactly as it does in the registry.
  assert.equal(withinWindow('2021-09-26', now), true, 'the boundary day is inside');
  assert.equal(withinWindow('2021-09-25', now), false, 'the day past the boundary is outside');
});

check('only a listed address is answered, and an address we do not hold is never a no', () => {
  const now = new Date('2026-09-26T00:00:00Z');

  for (const email of SERVED) {
    assert.equal(demoEligibilityFor(email, now).verdict, 'yes', `${email} is inside the window`);
  }
  assert.equal(
    demoEligibilityFor('S.Melese+63@Gmail.com', now).verdict,
    'yes',
    'the address must match whatever its case is'
  );

  // Everything else is unknown, including an address that looks exactly like another former
  // student's: the list decides who can serve themselves, and not being on it is not a no.
  for (const email of [
    's.melese+99@gmail.com',
    'david@demo.smartcollege.test',
    'alice@demo.smartcollege.test',
    'somebody@nowhere.test',
  ]) {
    const answer = demoEligibilityFor(email, now);
    assert.equal(answer.verdict, 'unknown', `${email} must be unknown, never no`);
    assert.equal(answer.name, null, 'and we must not name anybody we do not hold');
  }
});

check('the list holds exactly the addresses this deployment was asked to serve', () => {
  assert.deepEqual(
    DEMO_STUDENTS.map((student) => student.email),
    SERVED,
    'the list must be those addresses and no others'
  );
  assert.equal(DEMO_STUDENTS.length, SERVED.length, 'and nothing may be added to it quietly');
});

check('and every one of them is inside the window, so nobody else can serve themselves', () => {
  const now = new Date('2026-09-26T00:00:00Z');

  for (const student of DEMO_STUDENTS) {
    assert.match(student.graduationDate, /^\d{4}-\d{2}-\d{2}$/, 'with a date to measure from');
    assert.equal(
      withinWindow(student.graduationDate, now),
      true,
      `${student.email} must be inside the window, or the list would serve somebody else's path`
    );
  }
});

check('the addresses this deployment was asked to serve are on the list', () => {
  for (const email of SERVED) {
    assert.ok(demoStudentFor(email), `${email} must be listed`);
  }
});

check('and the sign-in page does not print the addresses it holds', () => {
  const page = readFileSync(
    new URL('../issuer-frontend/app/get-credentials/page.tsx', import.meta.url),
    'utf8'
  );

  for (const email of SERVED) {
    assert.ok(!page.includes(email), `${email} must not be printed on the page`);
  }
  assert.ok(
    !/demonstration address/i.test(page),
    'and the panel that listed them must not come back'
  );
});

// ── report ────────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length > 0) {
  console.log(`DECISION_CHECK_FAILED — ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`DECISION_CHECK_PASSED — ${passed} checks`);
