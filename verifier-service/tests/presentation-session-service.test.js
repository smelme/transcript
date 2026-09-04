import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PresentationSessionService } from '../src/presentation-session-service.js';

test('creates an org-iso-mdoc request bound to a relying party', async () => {
  const service = new PresentationSessionService({ now: () => 1_000 });
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });

  assert.ok(session.sessionId);
  assert.equal(session.request.mediation, 'required');
  assert.equal(session.request.digital.requests.length, 1);
  assert.equal(session.request.digital.requests[0].protocol, 'org-iso-mdoc');
  assert.ok(session.request.digital.requests[0].data.deviceRequest);
  assert.ok(session.request.digital.requests[0].data.encryptionInfo);
  assert.equal(service.consume(session.sessionId, { relyingPartyId: 'myjob', origin: 'https://myjob.example' }).origin, 'https://myjob.example');
});

test('rejects replay, expiry, and relying-party mismatch', async () => {
  let now = 1_000;
  const service = new PresentationSessionService({ ttlMs: 100, now: () => now });
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  assert.throws(() => service.consume(session.sessionId, { relyingPartyId: 'other', origin: 'https://other.example' }));
  assert.throws(() => service.consume(session.sessionId, { relyingPartyId: 'myjob', origin: 'https://myjob.example' }));
  const expiring = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  now += 100;
  assert.throws(() => service.consume(expiring.sessionId, { relyingPartyId: 'myjob', origin: 'https://myjob.example' }));
});

test('rejects a non-org-iso-mdoc response and consumes the session', async () => {
  const service = new PresentationSessionService({ now: () => 1_000 });
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  await assert.rejects(
    service.verify(session.sessionId, {
      relyingPartyId: 'myjob',
      origin: 'https://myjob.example',
      credential: { protocol: 'openid4vp-v1-unsigned', data: { vp_token: {} } },
    }),
    /org-iso-mdoc/,
  );
  // The session was consumed before protocol validation, so it cannot be replayed.
  assert.throws(() => service.consume(session.sessionId, { relyingPartyId: 'myjob', origin: 'https://myjob.example' }));
});

test('rejects a malformed encrypted response', async () => {
  const service = new PresentationSessionService({ now: () => 1_000 });
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  await assert.rejects(
    service.verify(session.sessionId, {
      relyingPartyId: 'myjob',
      origin: 'https://myjob.example',
      credential: { protocol: 'org-iso-mdoc', data: { response: 'not-a-valid-device-response' } },
    }),
  );
});