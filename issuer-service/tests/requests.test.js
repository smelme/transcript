import { test } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/**
 * A database of this test's own. db.js reads the path once, when it is imported, so this has to be
 * set before the dynamic import below rather than at the top of the file.
 */
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-requests-${process.pid}-${Date.now()}.db`,
);

const { RequestService, STATUS, addWorkingDays } = await import('../src/requests.js');
const { QUALIFICATION_NAMESPACE } = await import('../src/request-payload.js');
const { getDb } = await import('../../db.js');

const ACADEMY = 'Smart Academy';
const OTHER = 'Another College';

const HEADER = [
  'email', 'full_name', 'student_id', 'credential', 'programme_title', 'degree_level',
  'field_of_study', 'graduation_date', 'institution_name', 'total_credits', 'courses',
].join(',');

const COURSES = [
  {
    courseCode: 'CS101',
    courseName: 'Introduction to Programming',
    credits: 3,
    grade: 'A',
    gradePoints: 4,
    term: 'Fall 2023',
    termStart: '2023-08-28',
    termEnd: '2023-12-15',
  },
];

function csvRow({ email = 'holder@example.com', credential = 'both' } = {}) {
  return [
    email,
    'Ada Lovelace',
    'SA-1001',
    credential,
    'BSc Computer Science',
    'Bachelor',
    'Computer Science',
    '2024-06-30',
    ACADEMY,
    '3',
    `"${JSON.stringify(COURSES).replace(/"/g, '""')}"`,
  ].join(',');
}

function csvFile(row) {
  return `${HEADER}\n${row}`;
}

/** The issuer's publishing half, stood in for: this test is about the case, not the mints. */
function fakeInvitations() {
  const created = [];
  return {
    created,
    async create(args) {
      created.push(args);
      return {
        invitationId: `inv-${created.length}`,
        expiresAt: '2026-10-26T00:00:00.000Z',
        emailSent: true,
      };
    },
  };
}

function newService(overrides = {}) {
  return new RequestService({ invitationService: fakeInvitations(), ...overrides });
}

/** A case up to the point the school has it, which is where most of these tests start. */
function submitted(service, { institution = ACADEMY, email = 'holder@example.com' } = {}) {
  const { requestId, token } = service.open({
    institution,
    school: ACADEMY,
    applicantEmail: email,
    applicantName: 'Ada Lovelace',
    wanted: ['both'],
  });
  service.attachIdentity({ requestId, status: 'verified', sessionRef: 'didit-1', extract: { givenName: 'Ada' } });
  service.markPaid({ requestId, paymentRef: 'pi_1' });
  service.submit({ requestId, token, termsVersion: '2026-01' });
  return { requestId, token };
}

test('the promised period skips weekends', () => {
  // Friday 25 September 2026 plus one working day is Monday the 28th.
  const monday = addWorkingDays(new Date('2026-09-25T09:00:00Z'), 1);
  assert.strictEqual(monday.toISOString().slice(0, 10), '2026-09-28');

  // Ten working days from Monday 21 September 2026 is Monday 5 October.
  const ten = addWorkingDays(new Date('2026-09-21T09:00:00Z'), 10);
  assert.strictEqual(ten.toISOString().slice(0, 10), '2026-10-05');
});

test('opening a case needs an address, a school, and a kind this issuer makes', () => {
  const service = newService();
  assert.throws(() => service.open({ institution: ACADEMY, school: ACADEMY, applicantEmail: 'not-an-address' }), /valid email/);
  assert.throws(() => service.open({ institution: ACADEMY, school: '', applicantEmail: 'a@b.com' }), /school/);
  assert.throws(
    () => service.open({ institution: ACADEMY, school: ACADEMY, applicantEmail: 'a@b.com', wanted: ['diploma'] }),
    /Unknown credential kind/,
  );
});

test('a case cannot be submitted before the identity check and the fee', () => {
  const service = newService();
  const { requestId, token } = service.open({
    institution: ACADEMY, school: ACADEMY, applicantEmail: 'holder@example.com',
  });

  assert.throws(() => service.submit({ requestId, token }), /identity check is not complete/);

  service.attachIdentity({ requestId, status: 'verified' });
  assert.throws(() => service.submit({ requestId, token }), /fee has not been paid/);
});

test('a payment for the wrong amount is refused rather than recorded', () => {
  const service = newService();
  const { requestId } = service.open({
    institution: ACADEMY, school: ACADEMY, applicantEmail: 'holder@example.com',
  });
  service.attachIdentity({ requestId, status: 'verified' });

  assert.throws(() => service.markPaid({ requestId, paymentRef: 'pi_1', amount: 1000 }), /this request is for 3000 USD/);
  const row = service.markPaid({ requestId, paymentRef: 'pi_1', amount: 3000, currency: 'USD' });
  assert.strictEqual(row.payment_status, 'paid');
});

test('a repeated identity callback does not move the case twice', () => {
  const service = newService();
  const { requestId } = service.open({
    institution: ACADEMY, school: ACADEMY, applicantEmail: 'holder@example.com',
  });
  service.attachIdentity({ requestId, status: 'verified' });
  const again = service.attachIdentity({ requestId, status: 'verified' });
  assert.strictEqual(again.status, STATUS.AWAITING_PAYMENT);

  const events = service.get({ requestId, institution: ACADEMY }).events.filter((e) => e.event === 'identity.completed');
  assert.strictEqual(events.length, 1);
});

test('submitting starts the promised period, and only once', () => {
  const service = newService({ workingDays: 10 });
  const { requestId, token } = service.open({
    institution: ACADEMY, school: ACADEMY, applicantEmail: 'holder@example.com',
  });
  service.attachIdentity({ requestId, status: 'verified' });
  service.markPaid({ requestId, paymentRef: 'pi_1' });

  const submitted = service.submit({ requestId, token, termsVersion: '2026-01' });
  assert.strictEqual(submitted.status, STATUS.SUBMITTED);
  assert.ok(submitted.submitted_at);
  assert.ok(submitted.due_at, 'the applicant is owed a date');

  const before = service.get({ requestId, institution: ACADEMY }).events.length;
  service.submit({ requestId, token });
  assert.strictEqual(service.get({ requestId, institution: ACADEMY }).events.length, before, 'submitting twice adds no second event');
});

test('a decision names the reviewer, needs a reason, and cannot be taken twice', () => {
  const service = newService();
  const { requestId } = submitted(service);

  assert.throws(() => service.decide({ requestId, decision: 'accepted', reason: '', reviewedBy: 'registrar@x' }), /reason is required/);
  assert.throws(() => service.decide({ requestId, decision: 'maybe', reason: 'because', reviewedBy: 'registrar@x' }), /must be 'accepted' or 'declined'/);

  const decided = service.decide({ requestId, decision: 'accepted', reason: 'Record confirmed', reviewedBy: 'registrar@x' });
  assert.strictEqual(decided.status, STATUS.ACCEPTED);
  assert.strictEqual(decided.reviewed_by, 'registrar@x');
  assert.ok(decided.reviewed_at);

  assert.throws(() => service.decide({ requestId, decision: 'declined', reason: 'changed my mind', reviewedBy: 'registrar@x' }), /already accepted/);
});

test('a case that was never submitted cannot be decided', () => {
  const service = newService();
  const { requestId } = service.open({
    institution: ACADEMY, school: ACADEMY, applicantEmail: 'holder@example.com',
  });
  assert.throws(
    () => service.decide({ requestId, decision: 'accepted', reason: 'x', reviewedBy: 'r' }),
    /must be submitted before it can be decided/,
  );
});

test('nothing can be issued for a request that was not accepted', async () => {
  const service = newService();
  const { requestId } = submitted(service);
  assert.throws(() => service.attachPayload({ requestId, csv: csvFile(csvRow()) }), /has not been accepted/);
  await assert.rejects(() => service.issue({ requestId }), /has not been accepted/);
});

test('a file can only be uploaded after acceptance, and must name the request address', () => {
  const service = newService();
  const { requestId } = submitted(service);
  service.decide({ requestId, decision: 'accepted', reason: 'Record confirmed', reviewedBy: 'registrar@x' });

  assert.throws(
    () => service.attachPayload({ requestId, csv: csvFile(csvRow({ email: 'someone.else@example.com' })) }),
    /refused/,
  );
  // A refused file leaves the case where it was, so the operator can fix the file and retry.
  assert.strictEqual(service.get({ requestId, institution: ACADEMY }).status, STATUS.ACCEPTED);
  assert.strictEqual(service.get({ requestId, institution: ACADEMY }).payloads.length, 0);

  const uploaded = service.attachPayload({ requestId, csv: csvFile(csvRow()), filename: 'record.csv', uploadedBy: 'registrar@x' });
  assert.strictEqual(uploaded.rowCount, 1);
  assert.strictEqual(service.get({ requestId, institution: ACADEMY }).status, STATUS.PAYLOAD_RECEIVED);
});

test('nothing is signed before the payload is seen, and issuing produces an invitation', async () => {
  const service = newService();
  const { requestId } = submitted(service);
  service.decide({ requestId, decision: 'accepted', reason: 'Record confirmed', reviewedBy: 'registrar@x' });
  assert.throws(() => service.preview({ requestId }), /No payload/);

  service.attachPayload({ requestId, csv: csvFile(csvRow()), filename: 'record.csv', uploadedBy: 'registrar@x' });

  const preview = service.preview({ requestId });
  assert.strictEqual(preview.credentials.length, 1);
  assert.strictEqual(preview.credentials[0].display.title, 'BSc Computer Science');
  assert.strictEqual(preview.payload.filename, 'record.csv');

  const issued = await service.issue({ requestId, actor: 'registrar@x' });
  assert.strictEqual(issued.reused, false);
  assert.strictEqual(issued.invitation.invitationId, 'inv-1');

  // The claims handed to the publisher are the institution's, not anything this service invented,
  // and they travel keyed by the namespace they belong to.
  const [published] = service.invitationService.created;
  assert.strictEqual(published.institution, ACADEMY);
  assert.strictEqual(published.holderEmail, 'holder@example.com');
  assert.strictEqual(
    published.credentials[0].claims[QUALIFICATION_NAMESPACE].graduation_date,
    '2024-06-30',
  );

  const row = service.get({ requestId, institution: ACADEMY });
  assert.strictEqual(row.status, STATUS.ISSUED);
  assert.strictEqual(row.invitation_id, 'inv-1');
  assert.strictEqual(row.expires_at, '2026-10-26T00:00:00.000Z');

  // Asking again returns what exists rather than minting a second credential.
  const again = await service.issue({ requestId, actor: 'registrar@x' });
  assert.strictEqual(again.reused, true);
  assert.strictEqual(service.invitationService.created.length, 1);
});

test('a request cannot be read, decided or issued by another institution', async () => {
  const service = newService();
  const { requestId } = submitted(service);

  assert.throws(() => service.get({ requestId, institution: OTHER }), /Request not found/);
  assert.throws(() => service.preview({ requestId, institution: OTHER }), /Request not found/);
  assert.throws(() => service.decide({ requestId, institution: OTHER, decision: 'accepted', reason: 'x', reviewedBy: 'r' }), /Request not found/);
  assert.throws(() => service.attachPayload({ requestId, institution: OTHER, csv: csvFile(csvRow()) }), /Request not found/);
  await assert.rejects(() => service.issue({ requestId, institution: OTHER }), /Request not found/);

  // A platform administrator passes no institution and sees everything.
  assert.strictEqual(service.get({ requestId }).request_id, requestId);
});

test('the queue is scoped, aged in working days, and flags an overdue promise', () => {
  const service = newService();
  const { requestId } = submitted(service);

  // Every other case this file opened is in the same database, so the queue is read by request.
  const mine = () => service.list({ institution: ACADEMY }).filter((row) => row.request_id === requestId);
  assert.strictEqual(mine().length, 1);
  assert.strictEqual(mine()[0].applicantStatus, 'received');
  assert.strictEqual(mine()[0].overdue, false);
  assert.strictEqual(service.list({ institution: OTHER }).length, 0);

  // Age it past the promise: the queue has to show what it failed to do, not only what is pending.
  const past = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare('UPDATE credential_requests SET due_at = ? WHERE request_id = ?').run(past, requestId);
  assert.strictEqual(mine()[0].overdue, true);
});

test('an unfinished case is abandoned rather than left in the queue for ever', () => {
  const service = newService({ draftDays: 30 });
  const { requestId } = service.open({
    institution: ACADEMY, school: ACADEMY, applicantEmail: 'holder@example.com',
  });

  assert.strictEqual(service.prune(), 0, 'a case opened today is not stale');
  const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
  getDb().prepare('UPDATE credential_requests SET created_at = ? WHERE request_id = ?').run(old, requestId);

  assert.strictEqual(service.prune(), 1, 'the stale case, and no other');
  assert.strictEqual(service.get({ requestId, institution: ACADEMY }).status, STATUS.ABANDONED);
});

test('a declined request is a complete outcome, and says why', () => {
  const service = newService();
  const { requestId } = submitted(service);
  const decided = service.decide({
    requestId,
    decision: 'declined',
    reason: 'No record found for that period',
    note: 'Checked the 2019 intakes as well',
    reviewedBy: 'registrar@x',
  });

  assert.strictEqual(decided.status, STATUS.DECLINED);
  assert.strictEqual(decided.decision_reason, 'No record found for that period');
  assert.strictEqual(service.get({ requestId, institution: ACADEMY }).applicantStatus, 'declined');
  assert.throws(() => service.attachPayload({ requestId, csv: csvFile(csvRow()) }), /has not been accepted/);
});
