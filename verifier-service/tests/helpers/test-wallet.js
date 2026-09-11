import crypto from 'crypto';
import * as cbor2 from 'cbor2';
import { generateIssuerSigned, generateDeviceKeyPair, buildDeviceSignature, fullDate, Cbor } from '../../../mdoc-core.js';

/**
 * Test-only wallet (org-iso-mdoc holder) used to exercise the verifier's
 * encrypted-response path end to end without an Android device.
 *
 * It mirrors, byte-for-byte, the session-transcript and DeviceResponse
 * conventions of the `id-verifier` package that the verifier uses, so a real
 * wallet implemented against the same conventions will interoperate.
 */

const bytesToB64url = (bytes) => {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return buffer.toString('base64url');
};

const b64urlToBytes = (value) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  return new Uint8Array(Buffer.from(base64 + pad, 'base64'));
};

const hexToBytes = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
};

// Mirrors id-verifier's jwkToCoseKey (EC P-256 only).
const jwkToCoseKey = (jwk) => {
  const coseKey = new Map();
  coseKey.set(1, 2); // kty: EC2
  coseKey.set(-1, 1); // crv: P-256
  coseKey.set(-2, b64urlToBytes(jwk.x));
  coseKey.set(-3, b64urlToBytes(jwk.y));
  return coseKey;
};

// Mirrors id-verifier's MDOCProtocolHelper._generateSessionTranscript for the
// W3C Digital Credentials API (dcapi) transport.
export function buildSessionTranscript({ origin, nonceHex, jwk }) {
  const encryptionInfo = bytesToB64url(cbor2.encode([
    'dcapi',
    { nonce: hexToBytes(nonceHex), recipientPublicKey: jwkToCoseKey(jwk) },
  ]));
  const dcapiInfo = cbor2.encode([encryptionInfo, origin]);
  const hash = crypto.createHash('sha256').update(dcapiInfo).digest();
  const handover = ['dcapi', new Uint8Array(hash)];
  return new Uint8Array(cbor2.encode([null, null, handover]));
}

// ─────────────────────────────────────────────────────────────────────────────
// HPKE base mode (DHKEM P-256 / HKDF-SHA256 / AES-128-GCM) as implemented in the
// Android wallet. Mirrors @hpke/core: KEM derivation uses the per-KEM suite id
// ("KEM"||kem_id) and the key schedule uses the draft-era ExtractAndExpand
// structure. This is the same code path the wallet executes at runtime.
// ─────────────────────────────────────────────────────────────────────────────
const KEM_SUITE = Buffer.concat([Buffer.from('KEM'), Buffer.from([0x00, 0x10])]);
const HPKE_SUITE = Buffer.concat([Buffer.from('HPKE'), Buffer.from([0x00, 0x10, 0x00, 0x01, 0x00, 0x01])]);
const HPKE_V1 = Buffer.from('HPKE-v1');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const labeledExtract = (salt, label, ikm, suite) =>
  hmac(salt, Buffer.concat([HPKE_V1, suite, Buffer.from(label), ikm]));
const labeledInfo = (label, info, len, suite) =>
  Buffer.concat([Buffer.from([0, len]), HPKE_V1, suite, Buffer.from(label), info]);
const hkdfExpand = (prk, info, len) => {
  const out = Buffer.alloc(len);
  let off = 0, t = Buffer.alloc(0), i = 1;
  while (off < len) {
    t = hmac(prk, Buffer.concat([t, info, Buffer.from([i])]));
    const c = Math.min(t.length, len - off);
    t.copy(out, off, 0, c);
    off += c; i++;
  }
  return out;
};
const extractAndExpand = (salt, ikm, info, len) => hkdfExpand(hmac(salt, ikm), info, len);
function hpkeEncrypt(recipientJwk, info, plaintext) {
  const eph = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = eph.publicKey.export({ format: 'jwk' });
  const enc = Buffer.concat([Buffer.from([4]), b64urlToBytes(pub.x), b64urlToBytes(pub.y)]);
  const pkRm = Buffer.concat([Buffer.from([4]), b64urlToBytes(recipientJwk.x), b64urlToBytes(recipientJwk.y)]);
  const recipientKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: recipientJwk.x, y: recipientJwk.y }, format: 'jwk' });
  const dh = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: recipientKey });
  const eaePrk = labeledExtract(Buffer.alloc(32), 'eae_prk', dh, KEM_SUITE);
  const sharedSecret = hkdfExpand(eaePrk, labeledInfo('shared_secret', Buffer.concat([enc, pkRm]), 32, KEM_SUITE), 32);
  const pskIdHash = labeledExtract(Buffer.alloc(32), 'psk_id_hash', Buffer.alloc(0), HPKE_SUITE);
  const infoHash = labeledExtract(Buffer.alloc(32), 'info_hash', info, HPKE_SUITE);
  const ctx = Buffer.concat([Buffer.from([0]), pskIdHash, infoHash]);
  const secretIkm = Buffer.concat([HPKE_V1, HPKE_SUITE, Buffer.from('secret')]);
  const key = extractAndExpand(sharedSecret, secretIkm, labeledInfo('key', ctx, 16, HPKE_SUITE), 16);
  const baseNonce = extractAndExpand(sharedSecret, secretIkm, labeledInfo('base_nonce', ctx, 12, HPKE_SUITE), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, baseNonce);
  const cipherText = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { enc, cipherText };
}

// Builds a self-consistent academic mdoc document and its device key pair.
// `status` is the credential's status-list reference (`{ idx, uri }`), which a
// real issuance embeds in the MSO; pass it to exercise the revocation path.
export function buildAcademicCredential({ signerKeyPem, certDer, status = null }) {
  const device = generateDeviceKeyPair();
  const namespaces = {
    'org.iso.23220.photoid.1': [
      ['given_name', new Cbor().tstr('Jane').encode()],
      ['family_name', new Cbor().tstr('Doe').encode()],
    ],
    'org.iso.23220.education.qualification.1': [
      ['institution_name', new Cbor().tstr('Transcript University').encode()],
      ['degree_level', new Cbor().tstr('Bachelor').encode()],
      ['graduation_date', fullDate('2025-06-01')],
    ],
  };
  const generated = generateIssuerSigned({
    docType: 'org.iso.23220.photoid.1',
    namespaces,
    signerKeyPem,
    certDer,
    deviceJwk: device.publicJwk,
    status,
  });
  return { ...generated, device };
}

// Encrypts an ISO 18013-5 DeviceResponse to the reader's ephemeral key and
// returns the base64url `response` string the W3C Digital Credentials API
// expects inside `credential.data`.
export async function buildEncryptedDeviceResponse({
  origin,
  nonceHex,
  readerJwk,
  issuerSigned,
  docType,
  devicePrivateJwk,
}) {
  const transcript = buildSessionTranscript({ origin, nonceHex, jwk: readerJwk });
  const transcriptDecoded = cbor2.decode(transcript);

  // Reuse the exact IssuerSigned name-space items in the device-signed map.
  const issuerSignedDecoded = cbor2.decode(new Uint8Array(issuerSigned));
  const issuerNameSpaces = issuerSignedDecoded.nameSpaces;

  const deviceSignedNameSpaces = new cbor2.Tag(24, cbor2.encode(issuerNameSpaces));
  const deviceAuthentication = cbor2.encode([
    'DeviceAuthentication',
    transcriptDecoded,
    docType,
    deviceSignedNameSpaces,
  ]);
  const encodedDeviceAuthentication = cbor2.encode(new cbor2.Tag(24, deviceAuthentication));

  const deviceSignatureBytes = buildDeviceSignature(devicePrivateJwk, Buffer.from(encodedDeviceAuthentication));
  const deviceSignature = cbor2.decode(new Uint8Array(deviceSignatureBytes));

  const document = {
    docType,
    issuerSigned: issuerSignedDecoded,
    deviceSigned: {
      nameSpaces: deviceSignedNameSpaces,
      deviceAuth: { deviceSignature },
    },
  };

  const deviceResponse = cbor2.encode({
    version: '1.0',
    documents: [document],
    documentErrors: [],
    status: 0,
  });

  const { enc, cipherText } = hpkeEncrypt(readerJwk, transcript, new Uint8Array(deviceResponse));
  const response = cbor2.encode([
    'dcapi',
    { enc: new Uint8Array(enc), cipherText: new Uint8Array(cipherText) },
  ]);
  return bytesToB64url(response);
}
