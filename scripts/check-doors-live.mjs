// scripts/check-doors-live.mjs — the deployed decision point, checked (P0-35)
//
// The invariant worth checking in production is the one that would hurt somebody if it broke:
// a question we could not answer must never come back as a "no". A registry that is unconfigured,
// unreachable or unrecognised all have to reach the applicant as `unknown`, because `no` is a
// statement about them and `unknown` is a statement about us.
//
// Read-only, and it writes nothing: every request either asks a question or refuses to act.
//
// Run with: node scripts/check-doors-live.mjs [academy-url]

const ACADEMY_URL = (process.argv[2] || process.env.ACADEMY_URL || 'https://academy-production-8262.up.railway.app')
  .replace(/\/+$/, '');

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

async function get(path) {
  const response = await fetch(`${ACADEMY_URL}${path}`, { redirect: 'manual' });
  const text = await response.text();
  return { status: response.status, text, headers: response.headers };
}

async function post(path, body) {
  const response = await fetch(`${ACADEMY_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, json };
}

console.log(`Checking the decision point at ${ACADEMY_URL}\n`);

// ── the pages ──────────────────────────────────────────────────────────────────────────────
//
// Two paths, told apart by when somebody studied, each with its own way in. The figure is matched
// as a digit rather than as "5" so that changing the window on the registry does not break this
// check - what matters is that both paths state the same shape of answer, not what the number is.
const RECENT = /finished in the last \d+ years/i;
const EARLIER = /finished more than \d+ years ago/i;
const CHECKED_PATH = `${QUALS}/request`;

const home = await get('/');
check('the home page is served', home.status === 200, `status ${home.status}`);
check(
  'the home page offers both paths, told apart by when somebody studied',
  RECENT.test(home.text) && EARLIER.test(home.text)
);
check(
  'and states what each costs, how long each takes and what each needs',
  /costs/i.test(home.text) && /takes/i.test(home.text) && /you\s+need/i.test(home.text)
);
check(
  'and each path has its own way in',
  /href="\/get-credentials"/.test(home.text) && home.text.includes(CHECKED_PATH),
  'both paths must be reachable from the page people read first'
);

// The first path: where the address is entered, and the other one is never hidden.
const chooser = await get('/get-credentials');
check('the first path is served', chooser.status === 200, `status ${chooser.status}`);
check(
  'and says which path it is, in the applicant\'s own terms',
  /finished with us in the last \d+ years/i.test(chooser.text),
  'the page must not leave somebody guessing whether it applies to them'
);
check('and is where the address is entered', /Email address/i.test(chooser.text));
check(
  'and offers the second path without hiding it',
  chooser.text.includes(CHECKED_PATH) && EARLIER.test(chooser.text)
);
check(
  'and does not forward on its own',
  !/<meta[^>]+http-equiv=["']?refresh/i.test(chooser.text) &&
    !/window\.location\s*=/.test(chooser.text),
  'the page must wait for the applicant to act'
);

const credentialsPage = await get('/credentials');
check('the credentials page is served', credentialsPage.status === 200, `status ${credentialsPage.status}`);
check(
  'and offers both paths with a way into each',
  RECENT.test(credentialsPage.text) &&
    EARLIER.test(credentialsPage.text) &&
    /href="\/get-credentials"/.test(credentialsPage.text) &&
    credentialsPage.text.includes(CHECKED_PATH)
);

// ── the question ───────────────────────────────────────────────────────────────────────────
const answered = await post('/api/eligibility', { email: 'nobody@example.com' });
check('the eligibility route answers', answered.status === 200, `status ${answered.status}`);
check(
  'an answer we cannot establish is unknown, never a no',
  answered.json?.verdict === 'unknown',
  `verdict was ${JSON.stringify(answered.json?.verdict)}`
);
check(
  'the answer says which kind of unknown it was',
  typeof answered.json?.reason === 'string' && answered.json.reason.length > 0,
  `reason was ${JSON.stringify(answered.json?.reason)}`
);

const noAddress = await post('/api/eligibility', {});
check(
  'an empty address is refused without inventing a verdict',
  noAddress.status === 400 && noAddress.json?.verdict !== 'yes',
  `status ${noAddress.status}, verdict ${JSON.stringify(noAddress.json?.verdict)}`
);

// ── the publish ────────────────────────────────────────────────────────────────────────────
const published = await post('/api/publish', { email: 'nobody@example.com' });
check(
  'a publish that cannot happen answers with a reason rather than a crash',
  published.status === 200 || published.status === 503
    ? published.json?.success === false && typeof published.json?.reason === 'string'
    : false,
  `status ${published.status}, body ${JSON.stringify(published.json)}`
);
check(
  'the publish never reports success for an address it does not hold',
  published.json?.success !== true
);

// ── report ─────────────────────────────────────────────────────────────────────────────────
console.log('');
if (failures.length > 0) {
  console.log(`DOORS_LIVE_CHECK_FAILED — ${passed} passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log(`DOORS_LIVE_CHECK_PASSED — ${passed} checks`);
