import { test, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/**
 * One row per programme, and what happens once the holder says it has arrived (P0-42, P0-43).
 *
 * The listing rule and the readback are driven through the real app rather than only through their
 * own functions, because the thing worth proving is that both doors use them and that the answer to
 * "is it in the wallet" comes from the issuer's records rather than from the caller.
 *
 * Nothing is mailed: the provider key is blanked rather than deleted, because the service loads its
 * own `.env` on import and an empty value is still a value.
 */
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-collection-${process.pid}-${Date.now()}.db`,
);
process.env.BREVO_API_KEY = '';
process.env.FROM_EMAIL = '';

const { app, issuer } = await import('../src/index.js');
const { oneItemPerProgramme } = await import('../src/issuance-items.js');
const { generateAcademicRecord } = await import('../src/credential-generator.js');
const { WalletAccountService } = await import('../src/wallet-account-service.js');

const ACADEMY = 'Smart Academy';
const OTHER_COLLEGE = 'Other College';
const HOLDER = 'holder@example.com';
// The institution's own link between an address and a student, which is what makes a credential
// this holder's: the account is created by being invited, exactly as it is in production.
const LINKED_STUDENT = 'SA-LINKED';
const accounts = new WalletAccountService();
accounts.ensureAccountLink({ email: HOLDER, studentId: LINKED_STUDENT, institution: ACADEMY });

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

async function post(route, body, token) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

/** One programme's worth of record, from the generator, so the claims are the real shape. */
function recordFor(studentId, fullName = 'Ada Lovelace') {
  const { records } = generateAcademicRecord({
    institution: ACADEMY,
    studentId,
    fullName,
    include: 'both',
  });
  return records[0];
}

function sessionFor({ studentId, record, status = 'pending', createdAt, institution = ACADEMY }) {
  const session = issuer.createIssuanceSession({
    studentId,
    institution,
    credentialData: record.credentialData,
    display: record.display,
    termsRequired: true,
  });
  session.status = status;
  session.createdAt = createdAt || session.createdAt;
  return session;
}

/** A session that has really been issued, with the mdoc the wallet would come for. */
function issuedSessionFor({ studentId, record, institution = ACADEMY }) {
  const session = sessionFor({ studentId, record, institution });
  const issued = issuer.issueForSession(session, null);
  assert.equal(issued.success, true, issued.error);
  return { session, credentialId: issued.credentialId };
}

/** Sign in the way the page does, and keep the access token. */
async function signIn(email = HOLDER) {
  const asked = await post('/auth/otp', { email, audience: 'academy' });
  assert.equal(asked.status, 200, JSON.stringify(asked.json));
  assert.ok(asked.json?.otp, 'the test runs with the development code, so the code comes back');
  const exchanged = await post('/auth/token', { email, otp: asked.json.otp });
  assert.equal(exchanged.status, 200, JSON.stringify(exchanged.json));
  return exchanged.json.accessToken;
}

// ── the listing rule ──────────────────────────────────────────────────────────────────────

const plain = (overrides) => ({
  sessionId: overrides.sessionId,
  status: overrides.status || 'pending',
  institution: overrides.institution || ACADEMY,
  studentId: overrides.studentId || 'SA-1',
  display: {
    programmeCode: overrides.programmeCode ?? 'BSC-CS',
    title: overrides.title || 'BSc Computer Science',
  },
  createdAt: overrides.createdAt || '2026-01-01T00:00:00.000Z',
});

test('two copies of one programme are one row, offering the one the issuer would hand over now', () => {
  const held = plain({ sessionId: 'held', status: 'issued', createdAt: '2025-01-01T00:00:00.000Z' });
  const current = plain({ sessionId: 'current', status: 'pending', createdAt: '2026-06-01T00:00:00.000Z' });

  const items = oneItemPerProgramme([held, current]);

  assert.equal(items.length, 1, 'one programme is one row');
  assert.equal(items[0].sessionId, 'current', 'and the prepared copy is the one offered');
  assert.equal(items[0].inWallet, true, 'while the row still says the programme is already held');
  assert.equal(items[0].heldSessionId, 'held');
  assert.equal(items[0].copies, 2);
});

test('a programme already in a wallet is one row, and it is the held copy', () => {
  const items = oneItemPerProgramme([plain({ sessionId: 'held', status: 'issued' })]);

  assert.equal(items.length, 1);
  assert.equal(items[0].inWallet, true);
  assert.equal(items[0].heldSessionId, 'held');
  assert.equal(items[0].copies, 1);
});

test('and a programme that is only prepared says so', () => {
  const items = oneItemPerProgramme([plain({ sessionId: 'prepared' })]);

  assert.equal(items[0].inWallet, false);
  assert.equal(items[0].heldSessionId, null);
});

test('two programmes stay two rows', () => {
  const items = oneItemPerProgramme([
    plain({ sessionId: 'a', programmeCode: 'BSC-CS', title: 'BSc Computer Science' }),
    plain({ sessionId: 'b', programmeCode: 'MA-DS', title: 'Master of Data Science' }),
  ]);

  assert.deepEqual(items.map((item) => item.sessionId).sort(), ['a', 'b']);
});

test('the same code at two institutions is two programmes', () => {
  const items = oneItemPerProgramme([
    plain({ sessionId: 'here', institution: ACADEMY }),
    plain({ sessionId: 'there', institution: OTHER_COLLEGE }),
  ]);

  assert.deepEqual(items.map((item) => item.sessionId).sort(), ['here', 'there']);
});

test('a record with no programme code falls back to its title', () => {
  const items = oneItemPerProgramme([
    plain({ sessionId: 'old', programmeCode: null, title: 'BSc Computer Science' }),
    plain({ sessionId: 'new', programmeCode: null, title: 'BSc Computer Science' }),
  ]);

  assert.equal(items.length, 1, 'the same programme is one row whatever it is keyed by');
});

test('a superseded copy is not a row at all', () => {
  const items = oneItemPerProgramme([
    plain({ sessionId: 'gone', status: 'superseded' }),
    plain({ sessionId: 'current' }),
  ]);

  assert.deepEqual(items.map((item) => item.sessionId), ['current']);
});

// ── the readback, and letting go of the document ──────────────────────────────────────────

test('a collection is read back from the issuer records, and the document is let go of', () => {
  const record = recordFor('SA-READBACK');
  const { session, credentialId } = issuedSessionFor({ studentId: 'SA-READBACK', record });

  assert.ok(
    issuer.getMdocSession(credentialId),
    'the document is held while it is being collected',
  );

  const report = issuer.settleCollected({ confirmed: [session], held: [session] });

  assert.equal(report.allInWallet, true);
  assert.equal(report.items[0].inWallet, true);
  assert.equal(report.items[0].credentialId, credentialId);
  assert.ok(report.items[0].recordedAt, 'the answer carries when the issuer recorded the issue');
  assert.equal(report.mdocsForgotten, 1);
  assert.equal(issuer.getMdocSession(credentialId), null, 'and the document is no longer held');
});

test('the record of the issue stays, even though the document goes', () => {
  const record = recordFor('SA-RECORD');
  const { session, credentialId } = issuedSessionFor({ studentId: 'SA-RECORD', record });

  issuer.settleCollected({ confirmed: [session], held: [session] });

  const kept = issuer.getCredentialRecord(credentialId);
  assert.ok(kept, 'the metadata row is what the issuer keeps');
  assert.equal(kept.status, 'active');
  assert.equal(issuer.getCredential(credentialId).success, true, 'and the credential still resolves');
});

test('a credential that has not arrived is not treated as collected, and nothing is let go of', () => {
  const record = recordFor('SA-NOT-YET');
  const session = sessionFor({ studentId: 'SA-NOT-YET', record });

  const report = issuer.settleCollected({ confirmed: [session], held: [session] });

  assert.equal(report.items[0].inWallet, false);
  assert.equal(report.allInWallet, false, 'so the holder is not told it is done');
  assert.equal(report.mdocsForgotten, 0);
});

test('every copy of a programme the holder already has is let go of, not only the one named', () => {
  const record = recordFor('SA-TWO-COPIES');
  const older = issuedSessionFor({ studentId: 'SA-TWO-COPIES', record });
  const newer = issuedSessionFor({ studentId: 'SA-TWO-COPIES', record });

  const report = issuer.settleCollected({
    confirmed: [newer.session],
    held: [older.session, newer.session],
  });

  assert.equal(report.mdocsForgotten, 2, 'the same person holds the same programme twice');
  assert.equal(issuer.getMdocSession(older.credentialId), null);
  assert.equal(issuer.getMdocSession(newer.credentialId), null);
});

// ── the route ─────────────────────────────────────────────────────────────────────────────

test('the confirmation route will not answer without a token', async () => {
  const response = await post('/issuance/collection/confirmed', { sessionIds: ['anything'] });
  assert.equal(response.status, 401);
});

test('and refuses a request that names nothing, rather than confirming it', async () => {
  const token = await signIn();
  const response = await post('/issuance/collection/confirmed', { sessionIds: [] }, token);

  assert.equal(response.status, 400);
  assert.match(String(response.json?.error), /which credentials/i);
});

test('a collection the holder made is confirmed, and the documents are let go of', async () => {
  const token = await signIn();
  const record = recordFor(LINKED_STUDENT);
  const session = issuer.createIssuanceSession({
    studentId: LINKED_STUDENT,
    institution: ACADEMY,
    credentialData: record.credentialData,
    display: record.display,
    email: HOLDER,
  });
  const issued = issuer.issueForSession(session, null);
  assert.equal(issued.success, true, issued.error);

  const response = await post(
    '/issuance/collection/confirmed',
    { sessionIds: [session.sessionId] },
    token,
  );

  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json?.allInWallet, true);
  assert.equal(response.json?.items?.[0]?.inWallet, true);
  assert.equal(issuer.getMdocSession(issued.credentialId), null);
});

test('and a credential belonging to somebody else is refused', async () => {
  const token = await signIn();
  const record = recordFor('SA-SOMEONE-ELSE', 'Someone Else');
  const session = sessionFor({ studentId: 'SA-SOMEONE-ELSE', record });
  session.sub = 'another-wallet-account';

  const response = await post(
    '/issuance/collection/confirmed',
    { sessionIds: [session.sessionId] },
    token,
  );

  assert.equal(response.status, 403, JSON.stringify(response.json));
});
