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
// The section that was removed, and the way out that replaced it. Asserting the absence is the
// point: "get rid of this section" is a review criterion, and a criterion nothing checks is a
// criterion that comes back.
const REMOVED_SECTION = /I finished (in the last|more than) \d+ years/i;
const WAY_OUT = /Finished with us more than \d+ years ago\?/i;
const CHECKED_PATH = `${REQUEST_SITE_URL}/request`;

const home = await get('/');
const homeText = visibleText(home.text);
check('the home page is served', home.status === 200, `status ${home.status}`);
check('the home page offers the sign-in', /Sign in with your email/i.test(homeText));
check(
  'and a quiet way out for anybody it cannot serve',
  WAY_OUT.test(homeText) && home.text.includes(CHECKED_PATH),
  'the way out must be described and linked'
);
check('and the two-path section with its cost tables is gone', !REMOVED_SECTION.test(homeText));

// The sign-in itself: one field, one button, and the way out under it.
const signIn = await get('/get-credentials');
const signInText = visibleText(signIn.text);
check('the sign-in page is served', signIn.status === 200, `status ${signIn.status}`);
check('and its heading says what it is', /Sign in with your email/i.test(signInText));
check('and asks for the address', /Email address/i.test(signInText));
check(
  'and carries the way out under the form',
  WAY_OUT.test(signInText) && signIn.text.includes(CHECKED_PATH)
);
check('and carries no cost table', !REMOVED_SECTION.test(signInText));
check(
  'and does not forward on its own',
  !/<meta[^>]+http-equiv=["']?refresh/i.test(signIn.text) &&
    !/window\.location\s*=/.test(signIn.text),
  'the page must wait for the applicant to act'
);

const credentialsPage = await get('/credentials');
const credentialsText = visibleText(credentialsPage.text);
check('the credentials page is served', credentialsPage.status === 200, `status ${credentialsPage.status}`);
check(
  'and offers the sign-in and the way out',
  /Sign in with your email/i.test(credentialsText) &&
    WAY_OUT.test(credentialsText) &&
    credentialsPage.text.includes(CHECKED_PATH)
);
check('and its cost tables are gone too', !REMOVED_SECTION.test(credentialsText));

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
