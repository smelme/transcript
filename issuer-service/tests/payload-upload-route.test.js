import { test, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/**
 * What the institution is told when it hands the record over.
 *
 * The portal decides "stored" or "refused" from the status code and then reads the counts out of this
 * response. It used to look for an `ok` in the body instead - a word this route has never said - so
 * every successful upload was reported to the operator as a refusal, with the file sitting in the
 * database the whole time, and the page never reloaded to show what the upload had unlocked. That is
 * why the screen said "nothing was stored" and a manual refresh revealed the record.
 *
 * So this pins the shape: a stored file answers with `success`, what it stored, and no `ok` for a
 * client to depend on wrongly.
 */
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-payload-route-${process.pid}-${Date.now()}.db`,
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

const HEADER = [
  'email', 'full_name', 'student_id', 'credential', 'programme_title', 'degree_level',
  'field_of_study', 'graduation_date', 'institution_name', 'total_credits', 'courses',
].join(',');

function csvFor(email) {
  const courses = JSON.stringify([
    { courseCode: 'CS101', courseName: 'Introduction to Programming', credits: 3, grade: 'A', gradePoints: 4 },
  ]);
  return [
    HEADER,
    [
      email, 'Ada Lovelace', 'SA-1001', 'both', 'BSc Computer Science', 'Bachelor', 'Computer Science',
      '2024-06-30', ACADEMY, '3', `"${courses.replace(/"/g, '""')}"`,
    ].join(','),
  ].join('\n');
}

test('a stored file is answered as stored, with what it stored', async () => {
  const admins = new AdminAuthService({});
  await admins.createAdmin({
    email: 'registrar@payload.test',
    password: 'a-password-long-enough',
    role: 'admin',
    institution: ACADEMY,
  });
  const signIn = await json('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'registrar@payload.test', password: 'a-password-long-enough' }),
  });
  assert.strictEqual(signIn.status, 200, JSON.stringify(signIn.data));
  const auth = { Authorization: `Bearer ${signIn.data.token}` };

  // A case the institution has confirmed, which is the only state a file may be uploaded against.
  const service = new RequestService();
  const { requestId, token } = service.open({
    institution: ACADEMY,
    school: ACADEMY,
    applicantEmail: 'holder@example.com',
    applicantSsn: '123-45-6789',
  });
  service.attachIdentity({
    requestId,
    status: 'verified',
    sessionRef: 'didit-payload-1',
    extract: { givenName: 'Ada', familyName: 'Lovelace' },
  });
  service.markPaid({ requestId, paymentRef: 'pi_payload' });
  service.submit({ requestId, token, termsVersion: '2026-01' });
  service.decide({ requestId, decision: 'accepted', reason: 'Record confirmed', reviewedBy: 'registrar@payload.test' });

  const stored = await json(`/admin/requests/${requestId}/payload`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ csv: csvFor('holder@example.com'), filename: 'record.csv' }),
  });
  assert.strictEqual(stored.status, 200, JSON.stringify(stored.data));
  assert.strictEqual(stored.data.success, true);
  assert.strictEqual(stored.data.rowCount, 1);
  assert.deepStrictEqual(
    stored.data.credentials.map((credential) => credential.label),
    ['Qualification and transcript'],
  );
  // Nothing that invites a client to wait for a word this route does not send.
  assert.strictEqual('ok' in stored.data, false);

  // And the case is one the page can reload into: the file is on it, and issuing is available.
  const detail = await json(`/admin/requests/${requestId}`, { headers: auth });
  assert.strictEqual(detail.data.request.payloads.length, 1);
  assert.strictEqual(detail.data.request.canIssue, true);

  // A file naming somebody else is refused whole, says why, and stores nothing.
  const refused = await json(`/admin/requests/${requestId}/payload`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ csv: csvFor('someone.else@example.com'), filename: 'wrong.csv' }),
  });
  assert.strictEqual(refused.status, 400);
  assert.match(String(refused.data.error), /refused/i);
  assert.ok(Array.isArray(refused.data.details?.errors) && refused.data.details.errors.length > 0);

  const unchanged = await json(`/admin/requests/${requestId}`, { headers: auth });
  assert.strictEqual(unchanged.data.request.payloads.length, 1);
});
