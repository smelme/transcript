import { test, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/**
 * What the institution is told about a case it has to match by hand (P0-45).
 *
 * The number is asked for because nobody there can identify the applicant from an address, so the
 * one thing the case has to do is carry it to the person doing the looking up. It was asked for,
 * stored, and then left out of the response the reviewer's screen reads - so the screen showed a
 * dash where the number should be, which reads as a missing field and is really a missing feature.
 *
 * This holds the response to what the screen needs, over the same routes the screen uses.
 */
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-admin-detail-${process.pid}-${Date.now()}.db`,
);
process.env.BREVO_API_KEY = '';
process.env.FROM_EMAIL = '';

const { app } = await import('../src/index.js');
const { AdminAuthService } = await import('../src/admin-auth.js');
const { RequestService } = await import('../src/requests.js');

const ACADEMY = 'Smart Academy';
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

async function json(pathname, init) {
  const response = await fetch(`${base}${pathname}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

test('the case carries the number, and the document carries the name, to whoever looks the record up', async () => {
  // The institution's own registrar, who is the person this is for.
  const admins = new AdminAuthService({});
  await admins.createAdmin({
    email: 'registrar@detail.test',
    password: 'a-password-long-enough',
    role: 'admin',
    institution: ACADEMY,
  });

  const signIn = await json('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'registrar@detail.test', password: 'a-password-long-enough' }),
  });
  assert.strictEqual(signIn.status, 200, JSON.stringify(signIn.data));
  const auth = { Authorization: `Bearer ${signIn.data.token}` };

  // A case opened with what the applicant gave, which is the only way these values arrive.
  const opened = await json('/requests', {
    method: 'POST',
    body: JSON.stringify({
      email: 'holder@example.com',
      // A name in the body is not taken: the applicant door does not ask for one, and a name sent by
      // a browser is a name nobody verified.
      name: 'Somebody Else',
      phone: '+642102323447',
      ssn: '123-45-6789',
      studentId: '58/745665',
      school: ACADEMY,
      wanted: ['both'],
    }),
  });
  assert.strictEqual(opened.status, 201, JSON.stringify(opened.data));

  // The check reads a document, which is where the name and the date of birth come from.
  new RequestService().attachIdentity({
    requestId: opened.data.requestId,
    status: 'verified',
    sessionRef: 'didit-detail-1',
    extract: { givenName: 'Ada', familyName: 'Lovelace', birthDate: '1985-04-17' },
  });

  const detail = await json(`/admin/requests/${opened.data.requestId}`, { headers: auth });
  assert.strictEqual(detail.status, 200, JSON.stringify(detail.data));

  const view = detail.data.request;
  assert.strictEqual(view.applicantSsn, '123-45-6789');
  assert.strictEqual(view.applicantStudentId, '58/745665');
  assert.strictEqual(view.applicantPhone, '+642102323447');
  assert.deepStrictEqual(view.wanted, ['both']);

  // The name is the document's, not the one that came in with the case.
  assert.strictEqual(view.applicantName, 'Ada Lovelace');
  assert.strictEqual(view.extract.birthDate, '1985-04-17');

  // The queue is not the place for a number: a reviewer reads one while looking somebody up, and a
  // list of them is a list nobody needs to be holding.
  const queue = await json('/admin/requests', { headers: auth });
  const row = queue.data.requests.find((item) => item.requestId === opened.data.requestId);
  assert.ok(row, 'the case is in the queue');
  assert.strictEqual(row.applicantSsn, undefined);

  // Another institution cannot read it at all, number or no number.
  const other = new AdminAuthService({});
  await other.createAdmin({
    email: 'registrar@other.test',
    password: 'a-password-long-enough',
    role: 'admin',
    institution: 'Another College',
  });
  const theirSignIn = await json('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'registrar@other.test', password: 'a-password-long-enough' }),
  });
  const theirs = await json(`/admin/requests/${opened.data.requestId}`, {
    headers: { Authorization: `Bearer ${theirSignIn.data.token}` },
  });
  assert.strictEqual(theirs.status, 404);
});
