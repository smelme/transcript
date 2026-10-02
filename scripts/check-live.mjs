/**
 * What is actually live, checked against the deployed sites rather than against a deploy log.
 *
 * Two things make this different from the end-to-end test that runs locally. It is read-only: every
 * question is one the service must refuse, so proving a route exists never leaves a row behind in
 * the production database. And it checks the wiring *between* deployments - the front end reaching
 * the issuer through its own `/api` - because a page that renders and cannot talk to anything would
 * pass a check that only looked at the page.
 *
 * Run: node scripts/check-live.mjs
 */

const ISSUER = process.env.ISSUER_URL || 'https://issuer-production-335e.up.railway.app';
const QUALS = process.env.QUALS_URL || 'https://quals-production.up.railway.app';
const PORTAL = process.env.PORTAL_URL || 'https://portal-production-a8a5.up.railway.app';

let checks = 0;
const failures = [];

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` (${detail})` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`);
  }
}

async function get(url) {
  const response = await fetch(url, { redirect: 'manual' });
  const text = await response.text().catch(() => '');
  return { status: response.status, text, location: response.headers.get('location') };
}

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

/**
 * Everything the page's own scripts contain. A page whose first screen is chosen at run time - the
 * collecting page waits for its invitation - renders nothing useful into the HTML, so the only place
 * its words can be checked is the code the browser downloads.
 */
async function bundleText(base, html) {
  const sources = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((match) => match[1]);
  let text = '';
  for (const source of new Set(sources)) {
    text += (await get(base + source)).text;
  }
  return text;
}

console.log('The issuer\n');

const health = await get(`${ISSUER}/health`);
check('the issuer answers', health.status === 200, `status ${health.status}`);

const unknown = await get(`${ISSUER}/requests/00000000-0000-4000-8000-000000000000?token=nope`);
check('an unknown request is not found', unknown.status === 404, `status ${unknown.status}`);

const badEmail = await post(`${ISSUER}/requests`, { email: 'not-an-address', wanted: ['both'] });
check('opening a request validates the address', badEmail.status === 400, `status ${badEmail.status}`);
check('and says so in words', /valid email/i.test(String(badEmail.data.error)), String(badEmail.data.error));

const unknownKind = await post(`${ISSUER}/requests`, { email: 'verify@example.com', wanted: ['diploma'] });
check('and refuses a credential it does not make', unknownKind.status === 400, `status ${unknownKind.status}`);

const queueWithoutSignIn = await get(`${ISSUER}/admin/requests`);
check('the queue needs an administrator', queueWithoutSignIn.status === 401, `status ${queueWithoutSignIn.status}`);

const decisionWithoutSignIn = await post(`${ISSUER}/admin/requests/00000000-0000-4000-8000-000000000000/decision`, {
  decision: 'accepted',
  reason: 'not signed in',
});
check('so does a decision', decisionWithoutSignIn.status === 401, `status ${decisionWithoutSignIn.status}`);

const scaffold = await post(`${ISSUER}/requests/00000000-0000-4000-8000-000000000000/advance`, { token: 'nope' });
check(
  'the test scaffold is off in production',
  scaffold.status === 403,
  `status ${scaffold.status} ${JSON.stringify(scaffold.data).slice(0, 80)}`,
);

// The identity provider sends the applicant's *browser* back here, by GET, with its own parameter
// names. This used to answer "Cannot GET" because only the server webhook had been implemented, and
// the redirect is the first thing a real graduate actually hits.
const identityReturn = await get(
  `${ISSUER}/requests/identity/callback?verificationSessionId=00000000-0000-4000-8000-000000000000&status=Approved`,
);
check('the identity return answers with a page, not a 404', identityReturn.status === 200, `status ${identityReturn.status}`);
check('that page is HTML', /<!doctype html>/i.test(identityReturn.text));

// The one thing this route must never do is treat what the address says as the answer. `status` in a
// URL is a claim by whoever holds the URL, so a session we do not hold must not come back confirmed.
check(
  'and does not take the status in the address as the answer',
  !/confirmed/i.test(identityReturn.text),
  'the page claimed an outcome from the query string alone',
);
check(
  'and still offers the way back to the request',
  /Back to my request/i.test(identityReturn.text),
);

// The handle travels in the path, so the page can return the applicant to their own case.
const identityReturnWithHandle = await get(
  `${ISSUER}/requests/identity/callback/some-handle?verificationSessionId=00000000-0000-4000-8000-000000000000&status=Approved`,
);
check(
  'the return with a handle is a page too',
  identityReturnWithHandle.status === 200 && /<!doctype html>/i.test(identityReturnWithHandle.text),
  `status ${identityReturnWithHandle.status}`,
);

console.log('\nThe Quals site\n');

const request = await get(`${QUALS}/request`);
check('the asking page is live', request.status === 200, `status ${request.status}`);
check('and explains what it is for', /Ask for your credentials/i.test(request.text));
check('with the period stated', /working days/i.test(request.text));

const issue = await get(`${QUALS}/issue`);
check('the collecting page is still live', issue.status === 200, `status ${issue.status}`);
const issueBundle = await bundleText(QUALS, issue.text);
check('and now offers the other door', /Ask us for your credentials/.test(issueBundle));
check('and still asks for a code', /Send me a code/.test(issueBundle));

// The front end talks to the issuer through its own /api, so a page that renders and cannot reach the
// service is a failure this catches and a page check would not.
const proxied = await get(`${QUALS}/api/health`);
check('the asking page can reach the issuer through its own origin', proxied.status === 200, `status ${proxied.status}`);

const proxiedPost = await post(`${QUALS}/api/requests`, { email: 'not-an-address', wanted: ['both'] });
check('and so can a form it submits', proxiedPost.status === 400, `status ${proxiedPost.status}`);

console.log('\nThe management portal\n');

const portalRequests = await get(`${PORTAL}/requests`);
check(
  'the Manual requests page is behind the sign-in',
  (portalRequests.status === 307 || portalRequests.status === 302) && /\/login/.test(String(portalRequests.location)),
  `status ${portalRequests.status} -> ${portalRequests.location}`,
);

const signIn = await get(`${PORTAL}/login`);
check('the sign-in page is live', signIn.status === 200, `status ${signIn.status}`);
const portalBundle = await bundleText(PORTAL, signIn.text);
check('and offers Manual requests in its menu', /Manual requests/.test(portalBundle));

// The portal's proxy attaches the signed-in administrator's token, so unlike the public site it must
// refuse a caller with no session: reaching the issuer is not the same as being allowed to.
const portalProxied = await get(`${PORTAL}/api/health`);
check(
  "the portal's own proxy refuses an unauthenticated caller",
  portalProxied.status === 401,
  `status ${portalProxied.status}`,
);

console.log(`\n${checks - failures.length}/${checks} live checks passed`);
if (failures.length > 0) {
  console.log('\nNot as expected:');
  for (const failure of failures) {console.log(`  - ${failure}`);}
  process.exit(1);
}
console.log('LIVE_CHECK_PASSED');
