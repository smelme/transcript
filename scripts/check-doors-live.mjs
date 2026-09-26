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
const home = await get('/');
check('the home page is served', home.status === 200, `status ${home.status}`);
check(
  'the home page states both doors and what each costs and takes',
  /Collect them yourself/.test(home.text) &&
    /Ask us to check/.test(home.text) &&
    /costs/i.test(home.text) &&
    /takes/i.test(home.text)
);

const chooser = await get('/get-credentials');
check('the chooser is served', chooser.status === 200, `status ${chooser.status}`);
check(
  'the chooser describes both doors before it asks anything',
  /Collect them yourself/.test(chooser.text) && /Ask us to check/.test(chooser.text)
);
check(
  'the chooser does not forward on its own',
  !/<meta[^>]+http-equiv=["']?refresh/i.test(chooser.text) &&
    !/window\.location\s*=/.test(chooser.text),
  'the page must wait for the applicant to choose'
);

const credentialsPage = await get('/credentials');
check('the credentials page is served', credentialsPage.status === 200, `status ${credentialsPage.status}`);
check(
  'the credentials page offers the checked path too',
  /Ask us to check/.test(credentialsPage.text)
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
