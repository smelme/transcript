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

// Where the second path lives. Link text is not enough to check: a path that is described but not
// linked is a path an applicant cannot take, so the assertions look for the address as well.
const REQUEST_SITE_URL = (process.argv[3] || process.env.REQUEST_SITE_URL || 'https://quals-production.up.railway.app')
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

/**
 * What a reader actually sees.
 *
 * Next inlines comment markers around interpolated values, so a sentence split across one - "in the
 * last <!-- -->5<!-- --> years" - does not match a pattern written for the words. Checking the copy
 * means checking it after those are gone, and after the tags are out of the way.
 *
 * Link targets are checked against the raw HTML instead: stripping the tags would strip the hrefs.
 */
function visibleText(html) {
  return String(html)
    // The separator Next emits between a static and an interpolated value, so that a sentence built
    // from a constant and some words still reads as one sentence here. Bounded on purpose: an
    // unbounded comment pattern swallows everything up to the next `-->`, which in this page is the
    // rest of the copy.
    .replace(/<!--[\s\S]{0,40}?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

console.log(`Checking the decision point at ${ACADEMY_URL}\n`);

// ── the pages ──────────────────────────────────────────────────────────────────────────────
//
// Two paths, told apart by when somebody studied, each with its own way in. The figure is matched
// as a digit rather than as "5" so that changing the window on the registry does not break this
// check - what matters is that both paths state the same shape of answer, not what the number is.
const RECENT = /finished in the last \d+ years/i;
const EARLIER = /finished more than \d+ years ago/i;
const CHECKED_PATH = `${REQUEST_SITE_URL}/request`;

const home = await get('/');
const homeText = visibleText(home.text);
check('the home page is served', home.status === 200, `status ${home.status}`);
check(
  'the home page offers both paths, told apart by when somebody studied',
  RECENT.test(homeText) && EARLIER.test(homeText)
);
check(
  'and states what each costs, how long each takes and what each needs',
  /costs/i.test(homeText) && /takes/i.test(homeText) && /you\s+need/i.test(homeText)
);
check(
  'and each path has its own way in',
  /href="\/get-credentials"/.test(home.text) && home.text.includes(CHECKED_PATH),
  'both paths must be reachable from the page people read first'
);

// The first path: where the address is entered, and the other one is never hidden.
const chooser = await get('/get-credentials');
const chooserText = visibleText(chooser.text);
check('the first path is served', chooser.status === 200, `status ${chooser.status}`);
check(
  'and says which path it is, in the applicant\'s own terms',
  /finished with us in the last \d+ years/i.test(chooserText),
  'the page must not leave somebody guessing whether it applies to them'
);
check('and is where the address is entered', /Email address/i.test(chooserText));
check(
  'and offers the second path without hiding it',
  chooser.text.includes(CHECKED_PATH) && EARLIER.test(chooserText)
);
check(
  'and does not forward on its own',
  !/<meta[^>]+http-equiv=["']?refresh/i.test(chooser.text) &&
    !/window\.location\s*=/.test(chooser.text),
  'the page must wait for the applicant to act'
);

const credentialsPage = await get('/credentials');
const credentialsText = visibleText(credentialsPage.text);
check('the credentials page is served', credentialsPage.status === 200, `status ${credentialsPage.status}`);
check(
  'and offers both paths with a way into each',
  RECENT.test(credentialsText) &&
    EARLIER.test(credentialsText) &&
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
