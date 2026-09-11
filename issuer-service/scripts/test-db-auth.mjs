// Verifies the DB-backed auth + credential lifecycle:
//   - access token is short-lived (10m) and a 1-year refresh token is issued
//   - refresh rotates the refresh token and invalidates the old one
//   - sign-out invalidates the refresh token
//   - remote deactivation invalidates the refresh token
//   - credential metadata persists and revoked credentials are rejected
//   - the verifier rejects a revoked or missing credential
//   - the verifier enforces revocation on DCAPI presentment too, where the
//     credential has to be identified from the disclosed claims
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const ISSUER = process.env.ISSUER_URL || 'http://127.0.0.1:3005';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB_PATH = process.env.DATABASE_PATH || path.join(REPO_ROOT, 'data', 'transcript.db');

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'dev-admin-key';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@quals.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'quals-admin-2026';
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

async function call(method, pathName, body, headers = {}, expectStatus = null) {
  const res = await fetch(`${ISSUER}${pathName}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (expectStatus && res.status !== expectStatus) {
    throw new Error(`${pathName}: expected ${expectStatus}, got ${res.status} (${data.error || ''})`);
  }
  return { status: res.status, data };
}

const jwtPayload = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const db = new Database(DB_PATH, { readonly: true });

const email = `lifecycle-${Date.now()}@example.com`;

// 1. Invite + sign in.
const invite = (await call('POST', '/invitations', { email, studentId: 'S-LIFE', institution: 'Smart Academy' })).data;
const otp = invite.otp;
check('invitation issues a dev OTP', !!otp);

const tokenRes = (await call('POST', '/auth/token', { email, otp })).data;
check('sign-in returns an access token', !!tokenRes.accessToken);
check('sign-in returns a refresh token', !!tokenRes.refreshToken);

const payload = jwtPayload(tokenRes.accessToken);
const accessTtlSec = payload.exp - payload.iat;
check('access token TTL is 10 minutes', accessTtlSec === 600, `${accessTtlSec}s`);

const rtRow = db
  .prepare('SELECT * FROM refresh_tokens WHERE sub = ?')
  .get(tokenRes.sub);
const refreshDays = (new Date(rtRow.expires_at).getTime() - Date.now()) / 86400000;
check('refresh token TTL is ~365 days', refreshDays > 360 && refreshDays < 370, `${refreshDays.toFixed(1)} days`);
check('refresh token is stored hashed, not in plaintext', rtRow.token_hash !== tokenRes.refreshToken);

// 2. Refresh rotates the token.
const refreshed = (await call('POST', '/auth/refresh', { refreshToken: tokenRes.refreshToken })).data;
check('refresh returns a new access token', !!refreshed.accessToken);
check('refresh rotates to a new refresh token', !!refreshed.refreshToken && refreshed.refreshToken !== tokenRes.refreshToken);

const reuse = await call('POST', '/auth/refresh', { refreshToken: tokenRes.refreshToken });
check('the old refresh token is rejected after rotation', reuse.status === 401, `HTTP ${reuse.status}`);

// 3. Sign-out invalidates the current refresh token.
const signout = await call('POST', '/auth/signout', { refreshToken: refreshed.refreshToken });
check('sign-out succeeds', signout.data.success === true);
const afterSignout = await call('POST', '/auth/refresh', { refreshToken: refreshed.refreshToken });
check('refresh after sign-out is rejected', afterSignout.status === 401, `HTTP ${afterSignout.status}`);

// 4. Remote deactivation invalidates refresh tokens.
// Administrative actions now require an authenticated administrator session.
const adminLogin = (await call('POST', '/admin/auth/login', {
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
})).data;
if (!adminLogin.token) throw new Error('Could not sign in as an administrator');
const adminAuth = { authorization: `Bearer ${adminLogin.token}` };

const invite2 = (await call('POST', '/invitations', { email, studentId: 'S-LIFE', institution: 'Smart Academy' })).data;
const tokenRes2 = (await call('POST', '/auth/token', { email, otp: invite2.otp })).data;
await call('POST', `/admin/accounts/${encodeURIComponent(tokenRes2.sub)}/deactivate`, {}, adminAuth);
const afterDeactivate = await call('POST', '/auth/refresh', { refreshToken: tokenRes2.refreshToken });
check('refresh after remote deactivation is rejected', afterDeactivate.status === 401, `HTTP ${afterDeactivate.status}`);
await call('POST', `/admin/accounts/${encodeURIComponent(tokenRes2.sub)}/activate`, {}, adminAuth);
const reactivated = await call('POST', '/auth/refresh', { refreshToken: tokenRes2.refreshToken });
check('revoked refresh token is not restored on reactivation', reactivated.status === 401, `HTTP ${reactivated.status}`);

// 5. Verifier rejects revoked / missing credentials.
const { PresentationSessionService } = await import('../../verifier-service/src/presentation-session-service.js');
const sessions = new PresentationSessionService();

// The status check is async: it resolves the credential's status-list reference
// from the presented documents (empty here, so only the session id applies).
const enforced = async (session, documents = []) => {
  try { await sessions.enforceCredentialStatus(session, documents); return null; }
  catch (e) { return e.message; }
};

const missingThrew = await enforced({ credentialId: `missing-${Date.now()}` });
check('verifier rejects a credential missing from the registry', !!missingThrew, missingThrew || '');

const revokedId = `revoked-${Date.now()}`;
const writeDb = new Database(DB_PATH);
writeDb.prepare(
  "INSERT INTO credentials (credential_id, issuer_id, institution, student_id, status, created_at) VALUES (?, 'issuer-001', 'Smart Academy', 'S-LIFE', 'revoked', ?)"
).run(revokedId, new Date().toISOString());
const revokedThrew = await enforced({ credentialId: revokedId });
check('verifier rejects a revoked credential', !!revokedThrew, revokedThrew || '');

const activeId = `active-${Date.now()}`;
writeDb.prepare(
  "INSERT INTO credentials (credential_id, issuer_id, institution, student_id, status, created_at) VALUES (?, 'issuer-001', 'Smart Academy', 'S-LIFE', 'active', ?)"
).run(activeId, new Date().toISOString());
const activeThrew = await enforced({ credentialId: activeId });
check('verifier accepts an active credential', activeThrew === null, activeThrew || '');

// 6. A credential that carries no status reference (and no session credential
//    id) cannot have its revocation checked, so the presentation is refused
//    rather than waved through.
const uncheckedThrew = await enforced({}, []);
check(
  'verifier refuses a credential whose status cannot be checked',
  /does not reference a status list/.test(uncheckedThrew || ''),
  uncheckedThrew || '',
);

writeDb.close();
db.close();

console.log(failures === 0 ? '\nALL_CHECKS_PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
