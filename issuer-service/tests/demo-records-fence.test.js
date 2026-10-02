import { test, after } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';

/**
 * The demonstration generator's fence (P0-41).
 *
 * `ALLOW_DEMO_RECORDS` opens a route that *invents* a record rather than publishing one the
 * institution holds. `DEMO_RECORDS_ALLOWLIST` is what keeps that route to the addresses a
 * demonstration deployment was actually asked to serve, so a single flag cannot open the generator
 * to everybody who learns the address.
 *
 * This drives the real app over HTTP rather than calling the helper, because the thing worth
 * proving is that the fence is in the route and stands in front of the generator — a helper that
 * is never called would pass a unit test and leak in production.
 *
 * Nothing is mailed. The provider key is blanked with an empty string rather than deleted, because
 * the service loads its own `.env` on import — an empty value is still a value, so the loader will
 * not fill it back in — and the first test asserts that the mailer really is off, so this suite
 * fails loudly rather than quietly posting a claim link to a real inbox.
 */
process.env.DATABASE_PATH = path.join(
  os.tmpdir(),
  `transcript-demo-fence-${process.pid}-${Date.now()}.db`,
);
process.env.BREVO_API_KEY = '';
process.env.FROM_EMAIL = '';

const { app, demoRecordAllowlist, demoRecordAllowed } = await import('../src/index.js');
const { isEmailConfigured } = await import('../src/email-service.js');

const LISTED = 's.melese+63@gmail.com';
const ANOTHER_LISTED = 's.melese+66@gmail.com';
const OFF_THE_LIST = 'david@demo.smartcollege.test';

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

async function ask(body) {
  const response = await fetch(`${base}/academy/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

test('the mailer is off here, so this suite cannot post a link to a real inbox', () => {
  assert.equal(
    isEmailConfigured(),
    false,
    'the provider key must be blanked before the app is imported',
  );
});

test('the list is read from the environment, trimmed and lowercased', () => {
  assert.deepEqual(demoRecordAllowlist(' A@B.com , c@d.com ,, '), ['a@b.com', 'c@d.com']);
  assert.deepEqual(demoRecordAllowlist(''), [], 'an empty list is no list, not one empty entry');
  assert.deepEqual(demoRecordAllowlist('   '), [], 'and nor is a list of whitespace');
});
test('the flag alone opens the route to every address, which is the development default', () => {
  assert.equal(demoRecordAllowed('anyone@example.com', []), true);
});

test('a list is what holds the route to the addresses it was given', () => {
  const list = demoRecordAllowlist(`${LISTED}, ${ANOTHER_LISTED}`);

  assert.equal(demoRecordAllowed(LISTED, list), true);
  assert.equal(demoRecordAllowed(ANOTHER_LISTED, list), true);
  assert.equal(
    demoRecordAllowed('S.Melese+63@Gmail.com', list),
    true,
    'an address matches whatever its case is',
  );
  assert.equal(demoRecordAllowed(OFF_THE_LIST, list), false);
});

test('the route refuses an address off the list without reaching the generator', async () => {
  process.env.ALLOW_DEMO_RECORDS = 'true';
  process.env.DEMO_RECORDS_ALLOWLIST = `${LISTED}, ${ANOTHER_LISTED}`;

  const refused = await ask({ email: OFF_THE_LIST });

  assert.equal(refused.status, 403, JSON.stringify(refused.json));
  assert.equal(refused.json?.success, false);
  assert.equal(refused.json?.code, 'DEMO_RECORDS_NOT_ALLOWED');
  assert.equal(
    refused.json?.claimUrl,
    undefined,
    'nothing may be prepared, so there is no link to hand back',
  );
  assert.equal(
    refused.json?.sessionId,
    undefined,
    'and a refused request must not leave a prepared credential behind',
  );
});

test('and it still invents a record for the addresses it was given', async () => {
  process.env.ALLOW_DEMO_RECORDS = 'true';
  process.env.DEMO_RECORDS_ALLOWLIST = `${LISTED}, ${ANOTHER_LISTED}`;

  const accepted = await ask({ email: LISTED });

  assert.equal(accepted.status, 201, JSON.stringify(accepted.json));
  assert.equal(accepted.json?.success, true);
  assert.ok(
    String(accepted.json?.claimUrl || '').includes(encodeURIComponent(LISTED)),
    `the link must carry the address, got ${JSON.stringify(accepted.json?.claimUrl)}`,
  );
  assert.equal(accepted.json?.emailSent, false, 'the mailer is unconfigured in this test');
});

test('with the flag off the list changes nothing, because the route is shut either way', async () => {
  delete process.env.ALLOW_DEMO_RECORDS;
  process.env.DEMO_RECORDS_ALLOWLIST = `${LISTED}, ${ANOTHER_LISTED}`;

  const shut = await ask({ email: LISTED });

  assert.equal(shut.status, 409, JSON.stringify(shut.json));
  assert.equal(shut.json?.code, 'DEMO_RECORDS_DISABLED');
});

test('a malformed address is refused as an address, not as one off the list', async () => {
  process.env.ALLOW_DEMO_RECORDS = 'true';
  process.env.DEMO_RECORDS_ALLOWLIST = `${LISTED}, ${ANOTHER_LISTED}`;

  const malformed = await ask({ email: 'not-an-address' });

  assert.equal(malformed.status, 400, JSON.stringify(malformed.json));
  assert.notEqual(malformed.json?.code, 'DEMO_RECORDS_NOT_ALLOWED');
});
