// Revocation is resolved from the credential's signed MSO
// (`status` -> `status_list` -> `{ idx, uri }`), so a verifier never has to infer
// an identity from disclosed claims. These tests build a real IssuerSigned mdoc
// with a status reference, publish a signed status list, and check enforcement.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cbor2 from 'cbor2';

import { Cbor, generateIssuerSigned } from '../../mdoc-core.js';
import {
  packStatusList,
  encodeStatusListPayload,
  signStatusListJws,
  STATUS_VALID,
  STATUS_INVALID,
} from '../../status-list-core.js';
import {
  StatusListClient,
  extractMsoStatus,
  issuerPublicKeyFrom,
} from '../src/status-list.js';
import { PresentationSessionService } from '../src/presentation-session-service.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const keyDir = path.resolve(here, '../../key-management/keys');
const signerKeyPem = fs.readFileSync(path.join(keyDir, 'mdoc-signer.private.pem'), 'utf8');
const certDer = fs.readFileSync(path.join(keyDir, 'mdoc-signer.cert.der'));

const STATUS_URI = 'https://issuer.example/status-list/quals-1';

const REVOKED_INDEX = 3;
const ACTIVE_INDEX = 4;

/** An IssuerSigned mdoc that references the status list at `idx`. */
function mdocWithStatus(idx) {
  const namespaces = {
    'org.iso.23220.photoid.1': [
      ['given_name', new Cbor().tstr('Status').encode()],
      ['family_name', new Cbor().tstr('Checker').encode()],
    ],
    'org.iso.23220.education.qualification.1': [
      ['institution_name', new Cbor().tstr('Smart Academy').encode()],
      ['degree_level', new Cbor().tstr('Master').encode()],
      ['graduation_date', new Cbor().tstr('2025-06-30').encode()],
    ],
  };
  const mdoc = generateIssuerSigned({
    docType: 'org.iso.23220.photoid.1',
    namespaces,
    signerKeyPem,
    certDer,
    status: { idx, uri: STATUS_URI },
  });
  const issuerSigned = cbor2.decode(Buffer.from(mdoc.base64url, 'base64url'));
  return { issuerSigned, document: { issuerSigned } };
}

/** A status list JWS marking `REVOKED_INDEX` as revoked, signed by `keyPem`. */
function signedStatusList({ keyPem = signerKeyPem, entries = { [REVOKED_INDEX]: STATUS_INVALID } } = {}) {
  return signStatusListJws(encodeStatusListPayload(packStatusList(entries)), keyPem);
}

const servingStatusList = (jws) => async () => ({ ok: true, status: 200, text: async () => jws });

test('the MSO carries the status reference and it survives encoding', () => {
  const { document } = mdocWithStatus(REVOKED_INDEX);

  assert.deepEqual(extractMsoStatus(document), { idx: REVOKED_INDEX, uri: STATUS_URI });
});

test('a credential issued without a status reference reports none', () => {
  const mdoc = generateIssuerSigned({
    docType: 'org.iso.23220.photoid.1',
    namespaces: { 'org.iso.23220.photoid.1': [['given_name', new Cbor().tstr('No').encode()]] },
    signerKeyPem,
    certDer,
  });
  const document = { issuerSigned: cbor2.decode(Buffer.from(mdoc.base64url, 'base64url')) };

  assert.equal(extractMsoStatus(document), null);
});

test('the issuer public key is recovered from the credential it signed', () => {
  const { document } = mdocWithStatus(ACTIVE_INDEX);
  const publicKey = issuerPublicKeyFrom(document);

  assert.ok(publicKey, 'expected a public key from the IssuerAuth certificate');
  const expected = new crypto.X509Certificate(certDer).publicKey.export({ type: 'spki', format: 'der' });
  assert.deepEqual(publicKey.export({ type: 'spki', format: 'der' }), expected);
});

test('a signed list reports the revoked index and clears the active one', async () => {
  const jws = signedStatusList();
  const client = new StatusListClient({ fetchImpl: servingStatusList(jws) });
  const { document } = mdocWithStatus(REVOKED_INDEX);

  assert.equal(await client.statusAt(STATUS_URI, REVOKED_INDEX, issuerPublicKeyFrom(document)), STATUS_INVALID);
  assert.equal(await client.statusAt(STATUS_URI, ACTIVE_INDEX, issuerPublicKeyFrom(document)), STATUS_VALID);
});

test('a list signed by another key is rejected', async () => {
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jws = signedStatusList({ keyPem: other.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const client = new StatusListClient({ fetchImpl: servingStatusList(jws) });
  const { document } = mdocWithStatus(REVOKED_INDEX);

  await assert.rejects(
    () => client.statusAt(STATUS_URI, REVOKED_INDEX, issuerPublicKeyFrom(document)),
    /signature verification failed/,
  );
});

test('a tampered list is rejected', async () => {
  const [header, payload, signature] = signedStatusList().split('.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  // Re-encode the list as all-valid, keeping the original signature.
  const forged = Buffer.from(payload, 'base64url').toString('utf8')
    .replace(decoded.status_list.lst, encodeStatusListPayload(packStatusList({})).status_list.lst);
  const jws = [header, Buffer.from(forged).toString('base64url'), signature].join('.');

  const client = new StatusListClient({ fetchImpl: servingStatusList(jws) });
  const { document } = mdocWithStatus(REVOKED_INDEX);

  await assert.rejects(
    () => client.statusAt(STATUS_URI, REVOKED_INDEX, issuerPublicKeyFrom(document)),
    /signature verification failed/,
  );
});

test('presentment is rejected on the MSO status alone, without matching claims', async () => {
  // The disclosed claims match nothing in the registry, so the claim-matching
  // fallback would let the presentation through. Only the MSO status can reject
  // it - which is the whole point of carrying the reference in the mdoc.
  const service = new PresentationSessionService({
    statusListFetch: servingStatusList(signedStatusList()),
  });
  const { document } = mdocWithStatus(REVOKED_INDEX);

  await assert.rejects(
    () => service.enforceCredentialStatus({}, { given_name: 'Nobody', family_name: 'Matches' }, [document]),
    /Credential is revoked/,
  );
});

test('presentment proceeds when the status list says the credential is valid', async () => {
  const service = new PresentationSessionService({
    statusListFetch: servingStatusList(signedStatusList()),
  });
  const { document } = mdocWithStatus(ACTIVE_INDEX);

  await service.enforceCredentialStatus({}, { given_name: 'Nobody', family_name: 'Matches' }, [document]);
});

test('an unreachable status list fails the presentation rather than passing it', async () => {
  const service = new PresentationSessionService({
    statusListFetch: async () => ({ ok: false, status: 503, text: async () => '' }),
  });
  const { document } = mdocWithStatus(ACTIVE_INDEX);

  await assert.rejects(
    () => service.enforceCredentialStatus({}, {}, [document]),
    /could not be retrieved/,
  );
});
