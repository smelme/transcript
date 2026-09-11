import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PresentationSessionService } from '../src/presentation-session-service.js';
import { buildAcademicCredential, buildEncryptedDeviceResponse } from './helpers/test-wallet.js';
import { packStatusList, encodeStatusListPayload, signStatusListJws } from '../../status-list-core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const keyDir = path.resolve(here, '../../key-management/keys');

// Status-list reference embedded in the credentials built below, and a service
// that serves the list from memory exactly as the issuer would sign it.
const STATUS_URI = 'https://issuer.example/status-list/quals-1';
const STATUS_INDEX = 0;

function serviceWithStatusList(issuerKeys, entries = {}) {
  const jws = signStatusListJws(
    encodeStatusListPayload(packStatusList(entries)),
    issuerKeys.signerKeyPem,
  );
  return new PresentationSessionService({
    statusListFetch: async () => ({ ok: true, status: 200, text: async () => jws }),
  });
}

function loadIssuerKeys() {
  return {
    signerKeyPem: fs.readFileSync(path.join(keyDir, 'mdoc-signer.private.pem'), 'utf8'),
    certDer: fs.readFileSync(path.join(keyDir, 'mdoc-signer.cert.der')),
  };
}

async function present(service, session, issuerKeys) {
  const record = service.sessions.get(session.sessionId);
  const credential = buildAcademicCredential({
    ...issuerKeys,
    status: { idx: STATUS_INDEX, uri: STATUS_URI },
  });
  const response = await buildEncryptedDeviceResponse({
    origin: record.origin,
    nonceHex: record.nonce,
    readerJwk: record.jwk,
    issuerSigned: credential.issuerSigned,
    docType: 'org.iso.23220.photoid.1',
    devicePrivateJwk: credential.device.privateJwk,
  });
  return { response };
}

test('verifies a complete encrypted org-iso-mdoc DeviceResponse', async () => {
  const issuerKeys = loadIssuerKeys();
  const service = serviceWithStatusList(issuerKeys);
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  const { response } = await present(service, session, issuerKeys);

  const result = await service.verify(session.sessionId, {
    relyingPartyId: 'myjob',
    origin: 'https://myjob.example',
    credential: { protocol: 'org-iso-mdoc', data: { response } },
  });

  assert.equal(result.status, 'verified');
  assert.equal(result.claims.name, 'Jane Doe');
  assert.equal(result.claims.institution, 'Transcript University');
  assert.equal(result.claims.degreeLevel, 'Bachelor');
  assert.equal(result.claims.graduationDate, '2025-06-01');
});

test('rejects a tampered encrypted response and consumes the session', async () => {
  const issuerKeys = loadIssuerKeys();
  const service = new PresentationSessionService();
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  const { response } = await present(service, session, issuerKeys);

  // Flip the last byte of the base64url ciphertext to break the AEAD tag.
  const tampered = response.slice(0, -1) + (response.at(-1) === 'A' ? 'B' : 'A');

  await assert.rejects(
    service.verify(session.sessionId, {
      relyingPartyId: 'myjob',
      origin: 'https://myjob.example',
      credential: { protocol: 'org-iso-mdoc', data: { response: tampered } },
    }),
  );
  // Consumed before decryption: replay is impossible.
  assert.throws(() => service.consume(session.sessionId, { relyingPartyId: 'myjob', origin: 'https://myjob.example' }));
});

test('rejects a response bound to a different origin', async () => {
  const issuerKeys = loadIssuerKeys();
  const service = new PresentationSessionService();
  const session = await service.create({ relyingPartyId: 'myjob', origin: 'https://myjob.example' });
  const { response } = await present(service, session, issuerKeys);

  await assert.rejects(
    service.verify(session.sessionId, {
      relyingPartyId: 'myjob',
      origin: 'https://evil.example',
      credential: { protocol: 'org-iso-mdoc', data: { response } },
    }),
  );
});
