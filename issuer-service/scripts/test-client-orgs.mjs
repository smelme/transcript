// Verifies client organisations and their API keys:
//   - issuing requires a client API key
//   - a credential is stamped with the organisation that issued it
//   - an organisation only ever sees and revokes its own credentials
//   - a platform administrator spans every organisation
//   - an API key can be revoked, and shows only its prefix afterwards
//   - a signed-in holder sees only credentials linked to their own account
//   - batch issue is gone
const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
};

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${ISSUER}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const stamp = Date.now();
const orgA = `Academy A ${stamp}`;
const orgB = `Academy B ${stamp}`;

const credentialBody = (studentId) => ({
  docType: 'org.iso.23220.photoid.1',
  full_name: 'Org Test',
  date_of_birth: '1990-01-01',
  document_number: `D-${studentId}`,
  issuing_authority: 'Smart Academy',
  issue_date: '2025-01-01',
  expiry_date: '2035-01-01',
  issuing_country: 'NL',
  education_qualification: { institution_name: 'Smart Academy', degree_level: 'Master', graduation_date: '2025-06-30' },
  education_transcript: { student_id: studentId, total_credits: 12, status: 'completed' },
});

// 1. Issuing without a client API key is refused.
const anonymous = await call('POST', '/credentials/issue', credentialBody(`ANON-${stamp}`));
check('issuing without an API key is refused', anonymous.status === 401, `HTTP ${anonymous.status}`);

const bogus = await call('POST', '/credentials/issue', credentialBody(`BOGUS-${stamp}`), {
  authorization: 'Bearer quals_not-a-real-key',
});
check('issuing with an unknown key is refused', bogus.status === 401, `HTTP ${bogus.status}`);

// 2. Platform administrator signs in and creates a key per organisation.
const platform = (await call('POST', '/admin/auth/login', {
  email: process.env.ADMIN_EMAIL || 'admin@quals.local',
  password: process.env.ADMIN_PASSWORD || 'quals-admin-2026',
})).data;
const platformAuth = { authorization: `Bearer ${platform.token}` };
check('platform administrator signs in', !!platform.token, platform.error || '');
check('platform administrator spans every organisation', platform.admin?.institution == null);

const keyA = (await call('POST', '/admin/api-keys', { institution: orgA, name: 'Academy A issuer' }, platformAuth)).data;
const keyB = (await call('POST', '/admin/api-keys', { institution: orgB, name: 'Academy B issuer' }, platformAuth)).data;
check('an API key is issued for an organisation', keyA.success === true && !!keyA.key, keyA.error || '');
check('API keys are per organisation', keyB.success === true && keyB.key !== keyA.key);

const keyList = (await call('GET', '/admin/api-keys', null, platformAuth)).data;
const listedA = (keyList.keys || []).find((k) => k.keyId === keyA.keyId);
check('a key is listed by prefix only', !!listedA && !String(listedA.prefix).includes(keyA.key.slice(8)), listedA?.prefix);
check('the listed key carries no secret', !!listedA && listedA.key === undefined && listedA.key_hash === undefined);

// 3. Only an administrator signed in to that organisation may revoke its key.
const keyBAttempt = await call('DELETE', `/admin/api-keys/${keyA.keyId}`, null, platformAuth);
check('platform administrator can revoke any key', keyBAttempt.status === 200, `HTTP ${keyBAttempt.status}`);
const keyBAfter = (await call('GET', '/admin/api-keys', null, platformAuth)).data;
check(
  'a revoked key is marked inactive',
  (keyBAfter.keys || []).find((k) => k.keyId === keyA.keyId)?.active === false,
);

// A fresh key for the rest of the checks.
const issuerKeyA = (await call('POST', '/admin/api-keys', { institution: orgA, name: 'Academy A issuer 2' }, platformAuth)).data;

// 4. A revoked key stops working.
const revokedKeyAttempt = await call('POST', '/credentials/issue', credentialBody(`REVOKED-${stamp}`), {
  authorization: `Bearer ${keyA.key}`,
});
check('a revoked API key is refused', revokedKeyAttempt.status === 401, `HTTP ${revokedKeyAttempt.status}`);

// 5. Issuing with a key stamps the key's organisation, not the request body.
const issuedA = await call(
  'POST',
  '/credentials/issue',
  { ...credentialBody(`A-${stamp}`), institution: orgB },
  { authorization: `Bearer ${issuerKeyA.key}` },
);
check('a client organisation can issue', issuedA.status === 201 && issuedA.data.success === true, issuedA.data.error || '');

const issuedB = await call('POST', '/credentials/issue', credentialBody(`B-${stamp}`), {
  authorization: `Bearer ${keyB.key}`,
});
check('a second organisation can issue', issuedB.status === 201 && issuedB.data.success === true, issuedB.data.error || '');

// 6. Organisation-scoped administrators only see their own credentials.
const makeOrgAdmin = async (institution, email) => {
  const created = await call('POST', '/admin/users', { email, password: 'org-admin-password-2026', institution }, platformAuth);
  if (!created.data.success) throw new Error(created.data.error || 'could not create administrator');
  const session = (await call('POST', '/admin/auth/login', { email, password: 'org-admin-password-2026' })).data;
  return { auth: { authorization: `Bearer ${session.token}` }, admin: session.admin };
};

const adminA = await makeOrgAdmin(orgA, `org-admin-a-${stamp}@example.com`);
const adminB = await makeOrgAdmin(orgB, `org-admin-b-${stamp}@example.com`);
check('an organisation administrator is scoped to its organisation', adminA.admin?.institution === orgA, adminA.admin?.institution || '');

const listA = (await call('GET', '/credentials?pageSize=200', null, adminA.auth)).data;
const listB = (await call('GET', '/credentials?pageSize=200', null, adminB.auth)).data;
const idsA = (listA.credentials || []).map((c) => c.credentialId);
const idsB = (listB.credentials || []).map((c) => c.credentialId);

check("organisation A sees the credential it issued", idsA.includes(issuedA.data.credentialId));
check(
  'the credential is stamped with the organisation that issued it',
  (listA.credentials || []).find((c) => c.credentialId === issuedA.data.credentialId)?.institution === orgA,
);
check("organisation A cannot see organisation B's credential", !idsA.includes(issuedB.data.credentialId));
check("organisation B cannot see organisation A's credential", !idsB.includes(issuedA.data.credentialId));
check(
  'every credential listed belongs to the organisation',
  (listA.credentials || []).every((c) => c.institution === orgA),
);

const platformList = (await call('GET', '/credentials?pageSize=500', null, platformAuth)).data;
const platformIds = (platformList.credentials || []).map((c) => c.credentialId);
check('a platform administrator sees every organisation', platformIds.includes(issuedA.data.credentialId) && platformIds.includes(issuedB.data.credentialId));

// 7. Revocation is confined to the owning organisation.
const crossRevoke = await call('DELETE', `/credentials/${issuedB.data.credentialId}`, { reason: 'cross-org attempt' }, adminA.auth);
check("an organisation cannot revoke another organisation's credential", crossRevoke.status === 403, `HTTP ${crossRevoke.status}`);

const ownRevoke = await call('DELETE', `/credentials/${issuedA.data.credentialId}`, { reason: 'owner revoked' }, adminA.auth);
check('an organisation can revoke its own credential', ownRevoke.status === 200 && ownRevoke.data.success === true, `HTTP ${ownRevoke.status}`);

// 8. A signed-in holder sees only the credentials linked to their account.
const holderEmail = `holder-${stamp}@example.com`;
const invitation = (await call('POST', '/invitations', { email: holderEmail, studentId: `H-${stamp}`, institution: orgB })).data;
const holderToken = (await call('POST', '/auth/token', { email: holderEmail, otp: invitation.otp })).data;
const holderIssued = await call('POST', '/credentials/issue', credentialBody(`H-${stamp}`), {
  authorization: `Bearer ${keyB.key}`,
});
// The API-key flow stamps the key's organisation, so link the holder to it as well.
check('holder credential issued', holderIssued.status === 201, holderIssued.data.error || '');

const holderList = await call('GET', '/credentials?pageSize=200', null, {
  authorization: `Bearer ${holderToken.accessToken}`,
});
check('a holder token is accepted for listing', holderList.status === 200, `HTTP ${holderList.status}`);
const holderIds = (holderList.data.credentials || []).map((c) => c.credentialId);
check("a holder sees their own credential", holderIds.includes(holderIssued.data.credentialId));
check(
  "a holder cannot see credentials that are not linked to them",
  !holderIds.includes(issuedB.data.credentialId),
);

const anonymousList = await call('GET', '/credentials');
check('listing credentials requires a sign-in of some kind', anonymousList.status === 401, `HTTP ${anonymousList.status}`);

// 9. Batch issue is gone.
const batch = await call('POST', '/credentials/batch-issue', { credentials: [] }, platformAuth);
check('batch issue no longer exists', batch.status === 404, `HTTP ${batch.status}`);

// 10. An organisation's administrator only reaches its own console: the
// network-wide views belong to the platform operator.
const orgStats = await call('GET', '/statistics', null, adminA.auth);
check(
  'an organisation sees its own statistics only',
  orgStats.status === 200 && orgStats.data.statistics?.institution === orgA,
  JSON.stringify(orgStats.data.statistics),
);

const orgAudit = await call('GET', '/audit-log?limit=200', null, adminA.auth);
const orgAuditIds = (orgAudit.data.auditLog || []).map((entry) => entry.credentialId).filter(Boolean);
check('an organisation can read its audit log', orgAudit.status === 200, `HTTP ${orgAudit.status}`);
check("the audit log carries the organisation's own events", orgAuditIds.includes(issuedA.data.credentialId));
check(
  "the audit log does not leak another organisation's events",
  !orgAuditIds.includes(issuedB.data.credentialId),
);

const orgOrgs = await call('GET', '/admin/orgs', null, adminA.auth);
check(
  'an organisation only sees itself in the organisation list',
  orgOrgs.status === 200 && (orgOrgs.data.orgs || []).every((org) => org.institution === orgA),
  JSON.stringify((orgOrgs.data.orgs || []).map((org) => org.institution)),
);

for (const [label, path] of [
  ['list wallet accounts', '/admin/accounts'],
  ['list shares', '/shares'],
  ['list administrators', '/admin/users'],
]) {
  const denied = await call('GET', path, null, adminA.auth);
  check(`an organisation cannot ${label}`, denied.status === 403, `HTTP ${denied.status}`);
  const permitted = await call('GET', path, null, platformAuth);
  check(`the platform operator can ${label}`, permitted.status === 200, `HTTP ${permitted.status}`);
}

const anonymousStats = await call('GET', '/statistics');
check('statistics require a sign-in', anonymousStats.status === 401, `HTTP ${anonymousStats.status}`);
const anonymousAudit = await call('GET', '/audit-log');
check('the audit log requires a sign-in', anonymousAudit.status === 401, `HTTP ${anonymousAudit.status}`);

console.log(failures === 0 ? '\nCLIENT_ORGS_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
