import { test, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/**
 * The page the identity provider sends a browser back to (P0-46).
 *
 * The provider redirects the applicant's own browser here, in the same tab they left, so the route's
 * job is to settle the case and then put them back in front of their request rather than leaving them
 * on a page of ours. What is asserted here is that shape - which matters because the redirect is the
 * only thing standing between a finished check and a form that never learns about it.
 *
 * The provider is not configured in a test, so no decision can be collected: the answer must then be
 * "not yet" rather than an outcome. That is the invariant the live check covers from outside, tested
 * here directly.
 */
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-identity-return-${process.pid}-${Date.now()}.db`,
);
process.env.BREVO_API_KEY = '';
process.env.FROM_EMAIL = '';

const { app } = await import('../src/index.js');
const { RequestService } = await import('../src/requests.js');

const ACADEMY = 'Smart Academy';
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

/** A case with a check started, which is the state the provider returns a browser from. */
function caseWithCheck(sessionRef) {
  const service = new RequestService();
  const { requestId, token } = service.open({
    institution: ACADEMY,
    school: ACADEMY,
    applicantEmail: 'holder@example.com',
    applicantSsn: '123-45-6789',
  });
  service.startIdentity({ requestId, token, sessionRef });
  return { service, requestId, token };
}

async function returnFrom(sessionRef, handle) {
  const response = await fetch(
    `${base}/requests/identity/callback/${encodeURIComponent(handle)}`
      + `?verificationSessionId=${encodeURIComponent(sessionRef)}&status=Approved`,
    { redirect: 'manual' },
  );
  return { status: response.status, location: response.headers.get('location') };
}

test('a finished check puts the applicant back in front of their own request', async () => {
  const { requestId, token } = caseWithCheck('didit-return-1');

  const answer = await returnFrom('didit-return-1', token);

  assert.strictEqual(answer.status, 302, 'the browser is sent on, not left on a page of ours');
  const back = new URL(answer.location);
  assert.match(back.pathname, /\/request$/);
  assert.strictEqual(back.searchParams.get('reference'), requestId);
  assert.strictEqual(back.searchParams.get('token'), token, 'carrying the handle that is the case');
  assert.strictEqual(
    back.searchParams.get('identity'),
    'pending',
    'and what is known, which without the provider is that nothing is decided yet',
  );
});

test('the return never takes the status in its own address as the answer', async () => {
  const { service, requestId, token } = caseWithCheck('didit-return-2');

  // The query says `status=Approved`, which is a claim by whoever holds the URL. The provider cannot
  // be reached, so nothing was decided, and the case must still say so.
  await returnFrom('didit-return-2', token);

  const row = service.get({ requestId, institution: ACADEMY });
  assert.strictEqual(row.identity_status, 'pending', 'a query string is not a decision');
});

test('a return we cannot place still answers, rather than stranding the browser', async () => {
  const response = await fetch(
    `${base}/requests/identity/callback?verificationSessionId=00000000-0000-4000-8000-000000000000`,
    { redirect: 'manual' },
  );
  const body = await response.text();

  // There is no case to go back to, so the page is the answer: it says what happened and offers the
  // way to the request page.
  assert.strictEqual(response.status, 200);
  assert.match(body, /<!doctype html>/i);
  assert.match(body, /Back to my request/i);
});
