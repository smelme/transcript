/**
 * Published status list, shared by the issuer (which serves it) and the verifier
 * (which enforces it).
 *
 * A credential references the list from its signed MSO
 * (`status` -> `status_list` -> `{ idx, uri }`), so a verifier can resolve
 * revocation from the MSO alone — no disclosed claim is involved.
 *
 * The list itself follows the IETF OAuth/Token Status List conventions:
 *   - the bitstring is packed LSB-first, one bit per status by default;
 *   - bit `idx` is 0 while the credential is valid and 1 once it is revoked;
 *   - the payload is the DEFLATE (zlib) compressed bitstring, base64url encoded;
 *   - it is served as a signed JWS (`typ: statuslist+jwt`) so a verifier can tell
 *     a genuine list from one injected by a man in the middle.
 */
import crypto from 'crypto';
import zlib from 'zlib';

/** Bits per status in the list this repository publishes. */
export const BITS_PER_STATUS = 1;

/** Status values for a one-bit list. */
export const STATUS_VALID = 0;
export const STATUS_INVALID = 1;

/** Number of bytes needed to hold indexes up to and including `maxIndex`. */
export function byteLengthFor(maxIndex) {
  if (maxIndex < 0) return 0;
  return (maxIndex >> 3) + 1;
}

/**
 * Pack `{ [index]: status }` into a bitstring. Every index in `entries` is
 * written; indexes that are absent stay 0 (valid).
 */
export function packStatusList(entries, { maxIndex } = {}) {
  const highest = maxIndex ?? Object.keys(entries).reduce((max, key) => Math.max(max, Number(key)), -1);
  const bits = Buffer.alloc(byteLengthFor(highest));
  for (const [key, status] of Object.entries(entries)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0) continue;
    if (status === STATUS_VALID) continue;
    const byte = 1 << (index & 7);
    bits[index >> 3] = (bits[index >> 3] || 0) | byte;
  }
  return bits;
}

/** Read the status stored at `index`. Returns 0 for indexes beyond the list. */
export function readStatusBit(bits, index) {
  if (!Number.isInteger(index) || index < 0) return STATUS_VALID;
  const byte = bits[index >> 3];
  if (byte === undefined) return STATUS_VALID;
  return (byte >> (index & 7)) & 1;
}

/** Wrap a bitstring in the IETF Token Status List JSON shape. */
export function encodeStatusListPayload(bits) {
  return {
    status_list: {
      bits: BITS_PER_STATUS,
      // DEFLATE (zlib) compressed bitstring, base64url encoded.
      lst: zlib.deflateSync(bits).toString('base64url'),
    },
  };
}

/** Reverse of {@link encodeStatusListPayload}; accepts the payload object. */
export function decodeStatusListPayload(payload) {
  const list = payload?.status_list;
  if (!list) throw new Error('Status list payload is missing status_list');
  if (list.bits !== undefined && list.bits !== BITS_PER_STATUS) {
    throw new Error(`Unsupported status list width: ${list.bits} bits per status`);
  }
  if (typeof list.lst !== 'string') throw new Error('Status list payload is missing the bitstring');
  return zlib.inflateSync(Buffer.from(list.lst, 'base64url'));
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/**
 * Sign a status list as a JWS (`typ: statuslist+jwt`). ES256 over
 * `header.payload`, signed with the issuer's mdoc signing key, so a verifier can
 * check it against the same certificate that signed the credential.
 */
export function signStatusListJws(payload, signerKeyPem, { kid = null, issuedAt = new Date() } = {}) {
  const header = { alg: 'ES256', typ: 'statuslist+jwt' };
  if (kid) header.kid = kid;
  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(
    JSON.stringify({ ...payload, iat: Math.floor(issuedAt.getTime() / 1000) }),
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: crypto.createPrivateKey(signerKeyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${b64url(signature)}`;
}

/**
 * Verify a status list JWS against an issuer public key (an X.509 certificate's
 * public key, i.e. the one that signed the presented credential). Returns the
 * payload, or throws when the JWS is malformed or the signature is not valid.
 */
export function verifyStatusListJws(jws, publicKey) {
  const parts = String(jws || '').trim().split('.');
  if (parts.length !== 3) throw new Error('Status list is not a compact JWS');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let header;
  try {
    header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Status list JWS header is not valid JSON');
  }
  if (header.alg !== 'ES256') throw new Error(`Unsupported status list algorithm: ${header.alg}`);

  const valid = crypto.verify(
    'sha256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(encodedSignature, 'base64url'),
  );
  if (!valid) throw new Error('Status list signature verification failed');

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Status list JWS payload is not valid JSON');
  }
}
