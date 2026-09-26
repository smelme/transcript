import { test } from 'node:test';
import assert from 'node:assert';

import {
  IdentityService,
  identityOutcome,
  identityReason,
  parseDecision,
} from '../src/identity-service.js';

/** A provider that answers with what the test is about, and records what it was asked. */
function stubProvider(handler) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      const { status = 200, body = {} } = handler(url, init) || {};
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      };
    },
  };
}

test('the provider states a check is refused in more than one word', () => {
  assert.strictEqual(identityOutcome('Approved'), 'verified');
  assert.strictEqual(identityOutcome('verified'), 'verified');
  assert.strictEqual(identityOutcome('Declined'), 'failed');
  assert.strictEqual(identityOutcome('Expired'), 'failed');
  assert.strictEqual(identityOutcome('In Review'), 'pending');
  assert.strictEqual(identityOutcome('In Progress'), 'pending');
  // Anything unfamiliar is not treated as a pass, and not treated as a refusal either.
  assert.strictEqual(identityOutcome('Teleported'), 'pending');
  assert.strictEqual(identityOutcome(null), 'pending');
});

test('what an applicant is told never accuses them', () => {
  for (const status of ['Declined', 'Expired', 'In Review', null]) {
    const reason = identityReason(status);
    assert.ok(reason && reason.length > 0, `a reason for ${status}`);
    assert.doesNotMatch(reason, /fraud|reject|fail|denied/i, `not accusing for ${status}`);
  }
});

test('the extracted fields are read from wherever this workflow put them', () => {
  const fromIdVerification = parseDecision({
    id_verifications: [
      {
        first_name: 'Ada',
        last_name: 'Lovelace',
        date_of_birth: '1999-01-01',
        document_number: 'P123',
        document_type: 'passport',
        issuing_country: 'GB',
      },
    ],
  });
  assert.deepStrictEqual(
    {
      givenName: fromIdVerification.givenName,
      familyName: fromIdVerification.familyName,
      birthDate: fromIdVerification.birthDate,
      documentNumber: fromIdVerification.documentNumber,
      issuingAuthority: fromIdVerification.issuingAuthority,
    },
    { givenName: 'Ada', familyName: 'Lovelace', birthDate: '1999-01-01', documentNumber: 'P123', issuingAuthority: 'GB' },
  );

  // A chip read reports the same person under its own names.
  const fromChip = parseDecision({
    nfc_verifications: [{ chip_data: { given_name: 'Ada', surname: 'Lovelace', document_id: 'P123' } }],
  });
  assert.strictEqual(fromChip.givenName, 'Ada');
  assert.strictEqual(fromChip.familyName, 'Lovelace');

  // And nothing that is not there is invented: a wrong date of birth is worse than a missing one.
  const empty = parseDecision({});
  assert.strictEqual(empty.givenName, null);
  assert.strictEqual(empty.birthDate, null);
});

test('starting a check sends the request id as the reference, and the callback address', async () => {
  const provider = stubProvider(() => ({
    status: 200,
    body: { session_id: 'session-1', status: 'Not Started', url: 'https://verify.example/abc' },
  }));
  const service = new IdentityService({
    apiKey: 'key-1',
    workflowId: 'workflow-1',
    callbackBaseUrl: 'https://issuer.example/',
    fetchImpl: provider.fetchImpl,
  });

  const session = await service.createSession({ requestId: 'request-9' });
  assert.strictEqual(session.sessionId, 'session-1');
  assert.strictEqual(session.url, 'https://verify.example/abc');

  const [call] = provider.calls;
  assert.strictEqual(call.url, 'https://verification.didit.me/v3/session/');
  assert.strictEqual(call.init.headers['x-api-key'], 'key-1');
  const body = JSON.parse(call.init.body);
  assert.strictEqual(body.workflow_id, 'workflow-1');
  assert.strictEqual(body.vendor_data, 'request-9', 'the case is found by the reference we created');
  assert.strictEqual(body.callback, 'https://issuer.example/requests/identity/callback');
});

test('the outcome comes from the provider, not from whatever was posted to us', async () => {
  const provider = stubProvider(() => ({
    status: 200,
    body: {
      session_id: 'session-1',
      status: 'Declined',
      id_verifications: [{ first_name: 'Ada', last_name: 'Lovelace' }],
    },
  }));
  const service = new IdentityService({
    apiKey: 'key-1',
    workflowId: 'workflow-1',
    callbackBaseUrl: 'https://issuer.example',
    fetchImpl: provider.fetchImpl,
  });

  const decision = await service.getDecision('session-1');
  assert.strictEqual(decision.outcome, 'failed', 'a refusal is a refusal');
  assert.strictEqual(decision.status, 'Declined');
  assert.strictEqual(provider.calls[0].url, 'https://verification.didit.me/v3/session/session-1/decision/');
});

test('an unconfigured service refuses rather than pretending a check happened', async () => {
  const service = new IdentityService({ apiKey: null, workflowId: null, callbackBaseUrl: null });
  assert.strictEqual(service.configured, false);
  await assert.rejects(() => service.createSession({ requestId: 'request-1' }), /not configured/);
  await assert.rejects(() => service.getDecision('session-1'), /not configured/);
});

test('a provider that fails is an error, not a declined applicant', async () => {
  const provider = stubProvider(() => ({ status: 502, body: 'upstream' }));
  const service = new IdentityService({
    apiKey: 'key-1',
    workflowId: 'workflow-1',
    callbackBaseUrl: 'https://issuer.example',
    fetchImpl: provider.fetchImpl,
  });

  await assert.rejects(() => service.getDecision('session-1'), /could not report on that session/);
});
