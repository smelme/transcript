import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cbor2 from 'cbor2';
import { PresentationSessionService } from '../src/presentation-session-service.js';
import {
  buildAcademicCredential,
  buildEncryptedDeviceResponse,
  buildTranscriptCredential,
} from './helpers/test-wallet.js';
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

// ── Trust University: the academic relying party this exists for ─────────
//
// A registrar asks for the photo-ID document carrying the transcript namespace. Both kinds
// are issued under that docType, so the namespace is what limits the request to the
// transcript credential and keeps the award fields out of it.

const REGISTRAR_NAME_SPACES = {
  'org.iso.23220.photoid.1': ['given_name', 'family_name'],
  'org.iso.23220.education.transcript.1': [
    'student_id',
    'courses',
    'total_credits',
    'status',
  ],
};

test('a registrar request names the transcript namespace and not the award one', async () => {
  const service = new PresentationSessionService();
  const session = await service.create({
    relyingPartyId: 'trust-university',
    origin: 'https://trust-university.example',
    docType: 'org.iso.23220.photoid.1',
    nameSpaces: REGISTRAR_NAME_SPACES,
  });

  const deviceRequest = cbor2.decode(
    Buffer.from(session.request.digital.requests[0].data.deviceRequest, 'base64url'),
  );
  const itemsRequest = cbor2.decode(deviceRequest.docRequests[0].itemsRequest.contents);

  assert.equal(itemsRequest.docType, 'org.iso.23220.photoid.1');
  assert.deepEqual(Object.keys(itemsRequest.nameSpaces).sort(), [
    'org.iso.23220.education.transcript.1',
    'org.iso.23220.photoid.1',
  ]);
  assert.equal(
    itemsRequest.nameSpaces['org.iso.23220.education.qualification.1'],
    undefined,
    'the request must not ask for an award it would then have to ignore',
  );
  assert.deepEqual(
    Object.keys(itemsRequest.nameSpaces['org.iso.23220.education.transcript.1']).sort(),
    ['courses', 'status', 'student_id', 'total_credits'],
  );
});

test('verifies a transcript presentation and reports the study, not an award', async () => {
  const issuerKeys = loadIssuerKeys();
  const service = serviceWithStatusList(issuerKeys);
  const session = await service.create({
    relyingPartyId: 'trust-university',
    origin: 'https://trust-university.example',
    docType: 'org.iso.23220.photoid.1',
    nameSpaces: REGISTRAR_NAME_SPACES,
  });

  const record = service.sessions.get(session.sessionId);
  const credential = buildTranscriptCredential({
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

  const result = await service.verify(session.sessionId, {
    relyingPartyId: 'trust-university',
    origin: 'https://trust-university.example',
    credential: { protocol: 'org-iso-mdoc', data: { response } },
  });

  assert.equal(result.status, 'verified');
  assert.equal(result.claims.name, 'Jane Doe');
  assert.equal(result.claims.studentId, 'SA-TRUST-1');
  assert.equal(result.claims.totalCredits, 24);
  assert.equal(result.claims.completionStatus, 'completed');
  assert.match(String(result.claims.courses), /CS101/);
  assert.equal(
    result.claims.degreeLevel,
    null,
    'a transcript holds no award, and none is invented for the registrar',
  );
  assert.equal(result.claims.graduationDate, null);
});

test('the registrar receives the programme, the credits and the average with its scale', async () => {
  const issuerKeys = loadIssuerKeys();
  const service = serviceWithStatusList(issuerKeys);
  const session = await service.create({
    relyingPartyId: 'trust-university',
    origin: 'https://trust-university.example',
    docType: 'org.iso.23220.photoid.1',
    nameSpaces: {
      'org.iso.23220.photoid.1': ['given_name', 'family_name'],
      'org.iso.23220.education.transcript.1': [
        'institution_name',
        'student_id',
        'programme_title',
        'programme_code',
        'programme_code_scheme',
        'award_title',
        'credit_scheme',
        'total_credits',
        'outcome',
        'overall_mark',
        'overall_mark_scale_id',
        'courses',
        'status',
      ],
    },
  });

  const record = service.sessions.get(session.sessionId);
  const credential = buildTranscriptCredential({
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

  const result = await service.verify(session.sessionId, {
    relyingPartyId: 'trust-university',
    origin: 'https://trust-university.example',
    credential: { protocol: 'org-iso-mdoc', data: { response } },
  });

  assert.equal(result.claims.institution, 'Smart Academy');
  assert.equal(result.claims.programmeTitle, 'Bachelor of Computer Science');
  assert.equal(result.claims.programmeCode, '11.0101');
  assert.equal(
    result.claims.programmeCodeScheme,
    'CIP-2020',
    'the classification code names the scheme that defines it',
  );
  assert.equal(result.claims.awardTitle, 'Bachelor of Science');
  assert.equal(result.claims.gpa, 3.5);
  assert.equal(
    result.claims.gpaScaleId,
    'us-gpa-4',
    'the average never arrives without the scale it is on',
  );
  assert.equal(result.claims.creditsEarned, 24);
});
