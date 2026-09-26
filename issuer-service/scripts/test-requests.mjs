/**
 * End-to-end test for the ordered path: a credential for somebody the institution cannot identify
 * from an address alone.
 *
 * Runs against a test issuer (ISSUER_URL, default http://127.0.0.1:3006) started with a throwaway
 * database, ALLOW_DEV_OTP=true and no mail provider, so the identity check and the fee can be stood
 * in for and nothing is emailed.
 *
 * It walks the whole flow as the people involved: an applicant opens a request, the institution's
 * own administrator works it in the queue, decides, states the record as a file, looks at what
 * would be signed, and issues; then the holder's collection link is proved to be the same one the
 * published path produces.
 *
 * Prints REQUEST_TEST_PASSED on success.
 */

const ISSUER_URL = process.env.ISSUER_URL || 'http://127.0.0.1:3006';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@transcript.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'test-admin-password';

const ACADEMY = 'Smart Academy';
const OTHER = 'Another College';

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

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {headers.Authorization = `Bearer ${token}`;}
  const res = await fetch(`${ISSUER_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

/** The record an institution asserts, as its spreadsheet would export it. */
function recordCsv({ email, credential = 'both' } = {}) {
  const header = [
    'email', 'full_name', 'student_id', 'credential', 'programme_title', 'degree_level',
    'field_of_study', 'graduation_date', 'institution_name', 'total_credits', 'courses',
  ].join(',');
  const courses = [
    {
      courseCode: 'CS101',
      courseName: 'Introduction to Programming',
      credits: 3,
      grade: 'A',
      gradePoints: 4,
      term: 'Fall 2023',
    },
    {
      courseCode: 'CS202',
      courseName: 'Data Structures',
      credits: 4,
      grade: 'B+',
      gradePoints: 3.3,
      term: 'Spring 2024',
    },
  ];
  const row = [
    email,
    'Ada Lovelace',
    'SA-1001',
    credential,
    'BSc Computer Science',
    'Bachelor',
    'Computer Science',
    '2024-06-30',
    ACADEMY,
    '7',
    `"${JSON.stringify(courses).replace(/"/g, '""')}"`,
  ].join(',');
  return `${header}\n${row}`;
}

async function signIn(email, password) {
  const login = await call('/admin/auth/login', { method: 'POST', body: { email, password } });
  return login.data.token || login.data.accessToken || null;
}

console.log(`Testing the ordered credential path against ${ISSUER_URL}\n`);

// 1. Platform administration, and one administrator per institution.
const platformToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
check('the platform administrator can sign in', Boolean(platformToken));

const registrarPassword = 'registrar-password-1';
await call('/admin/users', {
  method: 'POST',
  token: platformToken,
  body: { email: 'registrar@test.invalid', password: registrarPassword, role: 'admin', institution: ACADEMY },
});
await call('/admin/users', {
  method: 'POST',
  token: platformToken,
  body: { email: 'other@test.invalid', password: registrarPassword, role: 'admin', institution: OTHER },
});

const registrarToken = await signIn('registrar@test.invalid', registrarPassword);
check('an institution-scoped administrator can sign in', Boolean(registrarToken));

const otherToken = await signIn('other@test.invalid', registrarPassword);
check('a second institution has its own administrator', Boolean(otherToken));

// 2. The applicant opens a request. They supply their own details and what they want; the
//    institution is the one that will be asked.
const applicantEmail = 'ada@example.com';
const opened = await call('/requests', {
  method: 'POST',
  body: {
    email: applicantEmail,
    name: 'Ada Lovelace',
    phone: '+1 555 0100',
    school: ACADEMY,
    wanted: ['both'],
    institution: OTHER, // ignored: the applicant does not get to choose who is asked
  },
});
check('an applicant can open a request', opened.status === 201, JSON.stringify(opened.data).slice(0, 160));

const requestId = opened.data.requestId;
const applicantToken = opened.data.token;
check('the applicant gets a handle of their own', Boolean(requestId && applicantToken));
check(
  'the fee is the configured one',
  opened.data.fee?.amount === 3000 && String(opened.data.fee?.currency).toLowerCase() === 'usd',
  JSON.stringify(opened.data.fee),
);
check('the promised period is 10 working days', opened.data.dueWorkingDays === 10, String(opened.data.dueWorkingDays));

const statusBefore = await call(`/requests/${requestId}?token=${encodeURIComponent(applicantToken)}`);
check('the applicant can see their own case', statusBefore.status === 200, JSON.stringify(statusBefore.data).slice(0, 120));
check('and is told what happens next', typeof statusBefore.data.whatHappensNext === 'string', statusBefore.data.whatHappensNext);
check('an unknown handle sees nothing', (await call(`/requests/${requestId}?token=wrong`)).status === 404);

// 3. Nothing can be decided before it is submitted, and the queue is the institution's own.
const tooEarly = await call(`/admin/requests/${requestId}/decision`, {
  method: 'POST',
  token: registrarToken,
  body: { decision: 'accepted', reason: 'Looks fine' },
});
check('a request that was not submitted cannot be decided', tooEarly.status === 400, JSON.stringify(tooEarly.data).slice(0, 140));

const queueBefore = await call('/admin/requests', { token: registrarToken });
check('the institution sees the request in its queue', (queueBefore.data.requests || []).some((row) => row.requestId === requestId));
check('the institution is the one that will be asked', (queueBefore.data.requests || []).every((row) => row.institution === ACADEMY), JSON.stringify(queueBefore.data.requests?.[0]?.institution));
check('another institution sees nothing of it', (await call('/admin/requests', { token: otherToken })).data.requests?.every((row) => row.requestId !== requestId) !== false);

// 4. The identity check. The provider is stood in for on this build, but the route, the reference
// and the way the outcome is collected are the real ones: the outcome is fetched from the provider,
// never taken from a request body.
const identityStart = await call(`/requests/${requestId}/identity`, {
  method: 'POST',
  body: { token: applicantToken },
});
check('an identity check can be started', identityStart.status === 200 && Boolean(identityStart.data.sessionId), JSON.stringify(identityStart.data).slice(0, 160));

const identityPoll = await call(`/requests/${requestId}/identity?token=${encodeURIComponent(applicantToken)}`);
check('the outcome is collected from the provider', identityPoll.data.identityStatus === 'verified', JSON.stringify(identityPoll.data).slice(0, 160));

// 4b. The fee. The session is created with the real key, and an unpaid one must settle nothing:
// a request that could be marked paid by asking nicely would be a hole rather than a shortcut.
const checkout = await call(`/requests/${requestId}/checkout`, {
  method: 'POST',
  body: { token: applicantToken },
});
if (process.env.STRIPE_SECRET_KEY) {
  check('a checkout is created for the fee', checkout.status === 200, JSON.stringify(checkout.data).slice(0, 200));
  check('and it is the provider\'s own page', String(checkout.data.checkoutUrl || '').startsWith('https://checkout.stripe.com'), String(checkout.data.checkoutUrl).slice(0, 80));
  check('for the fee on this request', checkout.data.fee?.amount === 3000, JSON.stringify(checkout.data.fee));

  const unpaid = await call(`/requests/${requestId}/payment/confirm`, {
    method: 'POST',
    body: { token: applicantToken, session_id: checkout.data.sessionId },
  });
  check('an unpaid session does not settle the fee', unpaid.status === 402, `status ${unpaid.status} ${JSON.stringify(unpaid.data).slice(0, 140)}`);

  const afterUnpaid = await call(`/requests/${requestId}?token=${encodeURIComponent(applicantToken)}`);
  check('and the request is still with the applicant', afterUnpaid.data.status === 'received', String(afterUnpaid.data.status));

  const foreign = await call(`/requests/${requestId}/payment/confirm`, {
    method: 'POST',
    body: { token: applicantToken, session_id: 'cs_test_not_a_session' },
  });
  check('a session the provider does not know is refused', foreign.status === 402 || foreign.status === 400, `status ${foreign.status}`);
} else {
  console.log('  skip  the payment checks (no STRIPE_SECRET_KEY here)');
}

// The last step of the fee is the scaffold, because a card cannot be completed from a script.
const advanced = await call(`/requests/${requestId}/advance`, { method: 'POST', body: { token: applicantToken } });
check('the case reaches the school', advanced.status === 200 && advanced.data.status === 'submitted', JSON.stringify(advanced.data).slice(0, 140));
check('and the promised date is set from submission', Boolean(advanced.data.dueAt), String(advanced.data.dueAt));

const detail = await call(`/admin/requests/${requestId}`, { token: registrarToken });
check('the case shows the identity outcome', detail.data.request?.identityStatus === 'verified', JSON.stringify(detail.data.request?.identityStatus));
check('and what the document said, beside what was claimed', detail.data.request?.extract?.givenName != null, JSON.stringify(detail.data.request?.extract));
check('a decision is offered now', detail.data.request?.canDecide === true);
check('the fee is recorded as paid', detail.data.request?.paymentStatus === 'paid');

// 5. Scoping: another institution cannot read, decide, upload or issue this request.
check('another institution cannot read the case', (await call(`/admin/requests/${requestId}`, { token: otherToken })).status === 404);
check('another institution cannot decide it', (await call(`/admin/requests/${requestId}/decision`, {
  method: 'POST', token: otherToken, body: { decision: 'accepted', reason: 'Not mine to decide' },
})).status === 404);
check('another institution cannot upload against it', (await call(`/admin/requests/${requestId}/payload`, {
  method: 'POST', token: otherToken, body: { csv: recordCsv({ email: applicantEmail }) },
})).status === 404);
check('another institution cannot issue it', (await call(`/admin/requests/${requestId}/issue`, {
  method: 'POST', token: otherToken,
})).status === 404);

// 6. The decision. A reason is required, and it is the institution's own administrator who takes it.
const noReason = await call(`/admin/requests/${requestId}/decision`, {
  method: 'POST', token: registrarToken, body: { decision: 'accepted', reason: '   ' },
});
check('a decision without a reason is refused', noReason.status === 400, JSON.stringify(noReason.data).slice(0, 140));

const decided = await call(`/admin/requests/${requestId}/decision`, {
  method: 'POST',
  token: registrarToken,
  body: { decision: 'accepted', reason: 'Record confirmed against the 2024 cohort', note: 'Checked the transcript too' },
});
check('the institution accepts the request', decided.status === 200 && decided.data.request?.decision === 'accepted', JSON.stringify(decided.data).slice(0, 160));
check('the decision names who took it', decided.data.request?.reviewedBy === 'registrar@test.invalid', String(decided.data.request?.reviewedBy));

const twice = await call(`/admin/requests/${requestId}/decision`, {
  method: 'POST', token: registrarToken, body: { decision: 'declined', reason: 'Changed my mind' },
});
check('a decision cannot be taken twice', twice.status === 400, JSON.stringify(twice.data).slice(0, 140));

// 7. Nothing is signed before the record is stated, and the record must be the right person's.
const issueTooEarly = await call(`/admin/requests/${requestId}/issue`, { method: 'POST', token: registrarToken });
check('issuing before the record exists is refused', issueTooEarly.status === 400, JSON.stringify(issueTooEarly.data).slice(0, 160));

const wrongPerson = await call(`/admin/requests/${requestId}/payload`, {
  method: 'POST', token: registrarToken, body: { csv: recordCsv({ email: 'someone.else@example.com' }), filename: 'wrong.csv' },
});
check('a file naming another address is refused', wrongPerson.status === 400, JSON.stringify(wrongPerson.data).slice(0, 160));
check('and the refusal says which line failed', JSON.stringify(wrongPerson.data.details || {}).includes('line'), JSON.stringify(wrongPerson.data.details).slice(0, 160));

const stillAccepted = await call(`/admin/requests/${requestId}`, { token: registrarToken });
check('a refused file leaves the case where it was', stillAccepted.data.request?.status === 'accepted', String(stillAccepted.data.request?.status));
check('and stores nothing', (stillAccepted.data.request?.payloads || []).length === 0);

const uploaded = await call(`/admin/requests/${requestId}/payload`, {
  method: 'POST', token: registrarToken, body: { csv: recordCsv({ email: applicantEmail }), filename: 'cohort-2024.csv' },
});
check('the institution states the record', uploaded.status === 200 && uploaded.data.rowCount === 1, JSON.stringify(uploaded.data).slice(0, 200));
check('the credential kind is derived from the namespaces', uploaded.data.credentials?.[0]?.kind === 'academic', String(uploaded.data.credentials?.[0]?.kind));

// 8. What will be signed, before anything is signed.
const preview = await call(`/admin/requests/${requestId}/payload/preview`, { token: registrarToken });
check('the preview shows what would be issued', preview.status === 200 && preview.data.preview?.credentials?.length === 1, JSON.stringify(preview.data).slice(0, 160));
const previewCredential = preview.data.preview?.credentials?.[0];
check('with the programme from the file', previewCredential?.display?.title === 'BSc Computer Science', String(previewCredential?.display?.title));
check('and the modules that will be signed', previewCredential?.courses?.length === 2, JSON.stringify(previewCredential?.courses?.length));
check('and the address the holder will collect from', preview.data.preview?.holder?.email === applicantEmail, String(preview.data.preview?.holder?.email));

// 9. Issue. The ordered credential is delivered through the same link as any other.
const issued = await call(`/admin/requests/${requestId}/issue`, { method: 'POST', token: registrarToken });
check('the request can be issued', issued.status === 200 && Boolean(issued.data.invitationId), JSON.stringify(issued.data).slice(0, 200));
check('and produces a collection link on the Quals site', String(issued.data.link || '').includes('/issue?invitation='), String(issued.data.link).slice(0, 120));
check('with a window to collect it in', Boolean(issued.data.expiresAt), String(issued.data.expiresAt));

const again = await call(`/admin/requests/${requestId}/issue`, { method: 'POST', token: registrarToken });
check('issuing twice returns the same deliverable', again.data.reused === true && again.data.invitationId === issued.data.invitationId, JSON.stringify(again.data).slice(0, 160));

// 10. The holder's side works through the published path, unchanged.
const link = new URL(issued.data.link);
const invitationId = link.searchParams.get('invitation');
const invitationToken = link.searchParams.get('token');
const holderPreview = await call(`/issuance/invitations/${invitationId}?token=${encodeURIComponent(invitationToken)}`);
check('the holder can open the link and see it is theirs', holderPreview.status === 200, JSON.stringify(holderPreview.data).slice(0, 160));
check('the address is masked until they prove it', String(holderPreview.data.holderEmail || '').includes('*'), String(holderPreview.data.holderEmail));

const applicantAfter = await call(`/requests/${requestId}?token=${encodeURIComponent(applicantToken)}`);
check('the applicant is told their credentials are ready', applicantAfter.data.status === 'sent', JSON.stringify(applicantAfter.data).slice(0, 160));
check('and never sees the reviewer\u2019s note', !JSON.stringify(applicantAfter.data).includes('Checked the transcript too'), JSON.stringify(applicantAfter.data).slice(0, 160));

// 11. The scaffold is not a feature: it is fenced by ALLOW_DEV_OTP, and it cannot move a case that
// has already finished, so it cannot be used to rewrite history either.
const devOnFinished = await call(`/requests/${requestId}/advance`, { method: 'POST', body: { token: applicantToken } });
check('the development stand-in cannot move a finished case', devOnFinished.status === 400, `status ${devOnFinished.status}`);

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const failure of failures) {console.log(`  - ${failure}`);}
  process.exit(1);
}
console.log('REQUEST_TEST_PASSED');
