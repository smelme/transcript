/**
 * Client for the status list referenced from a credential's signed MSO.
 *
 * The MSO (the signed payload of `issuerAuth`) carries the standard revocation
 * reference, `status` -> `status_list` -> `{ idx, uri }`, so a verifier can
 * resolve a presented credential's status without the presentation disclosing
 * any claim, and without the credential having to contain an identifier of its
 * own. The MSO is always available: it is not subject to selective disclosure.
 */
import crypto from 'crypto';
import * as cbor2 from 'cbor2';
import {
  readStatusBit,
  decodeStatusListPayload,
  verifyStatusListJws,
} from '../../status-list-core.js';

/** How long a verified list is reused before it is fetched again. */
const DEFAULT_TTL_MS = 60 * 1000;

/** Unwrap a CBOR byte string, whose façade differs between decoder versions. */
function bytesOf(value, depth = 0) {
  if (!value || depth > 4) {return null;}
  if (Buffer.isBuffer(value)) {return new Uint8Array(value);}
  if (value instanceof Uint8Array) {return value;}
  if (Array.isArray(value)) {return null;}
  if (typeof value === 'object' && 'contents' in value) {return bytesOf(value.contents, depth + 1);}
  return null;
}

const decodeOrNull = (bytes) => {
  try {
    return cbor2.decode(bytes);
  } catch {
    return null;
  }
};

/**
 * The Mobile Security Object of an already-decoded document.
 *
 * `issuerSigned.issuerAuth[2]` is the COSE payload: `#6.24(bstr .cbor MSO)`.
 * Decoders differ over how many layers they expose, so unwrap until a map with
 * a `version` field appears.
 */
export function extractMobileSecurityObject(document) {
  const payloadBytes = bytesOf(document?.issuerSigned?.issuerAuth?.[2]);
  if (!payloadBytes) {return null;}

  let node = decodeOrNull(payloadBytes);
  for (let depth = 0; depth < 3 && node; depth++) {
    if (node instanceof Map) {return node.has('version') ? node : null;}
    if (typeof node === 'object' && !Array.isArray(node) && 'version' in node) {return node;}
    const inner = bytesOf(node);
    if (!inner) {return null;}
    node = decodeOrNull(inner);
  }
  return null;
}

/**
 * The status-list reference carried by the MSO, or null when the credential has
 * none (anything issued before status lists existed).
 */
export function extractMsoStatus(document) {
  const mso = extractMobileSecurityObject(document);
  const status = mso?.status;
  const list = status?.status_list ?? status?.statusList;
  if (!list) {return null;}
  const idx = Number(list.idx);
  const uri = typeof list.uri === 'string' ? list.uri : null;
  if (!Number.isInteger(idx) || !uri) {return null;}
  return { idx, uri };
}

/** The public key of the certificate that signed the presented credential. */
export function issuerPublicKeyFrom(document) {
  const der = extractLeafCertificateDer(document);
  if (!der) {return null;}
  try {
    return new crypto.X509Certificate(der).publicKey;
  } catch {
    return null;
  }
}

/** DER bytes of the IssuerAuth leaf certificate, for pinning and status lists. */
export function extractLeafCertificateDer(document) {
  try {
    const issuerAuth = document?.issuerSigned?.issuerAuth;
    if (!Array.isArray(issuerAuth)) {return null;}
    const unprotectedHeaders = issuerAuth[1];
    const x5chain = unprotectedHeaders instanceof Map
      ? unprotectedHeaders.get(33)
      : unprotectedHeaders?.[33];
    const leaf = Array.isArray(x5chain) ? x5chain[0] : x5chain;
    const bytes = bytesOf(leaf);
    return bytes ? Buffer.from(bytes) : null;
  } catch {
    return null;
  }
}

export class StatusListClient {
  constructor({ fetchImpl = globalThis.fetch, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.fetchImpl = fetchImpl;
    this.ttlMs = ttlMs;
    this.now = now;
    this.cache = new Map();
  }

  /**
   * Status bit for `idx` in the list at `uri`, verified against the public key
   * that signed the credential. Throws when the list cannot be trusted, so a
   * failed check can never be mistaken for "valid".
   */
  async statusAt(uri, idx, publicKey) {
    const bits = await this._bitsFor(uri, publicKey);
    return readStatusBit(bits, idx);
  }

  async _bitsFor(uri, publicKey) {
    if (typeof this.fetchImpl !== 'function') {throw new Error('No fetch implementation available for status lists');}
    if (!publicKey) {throw new Error('Cannot verify the status list without the issuer public key');}

    const cacheKey = `${uri}|${crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('base64url')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) {return cached.bits;}

    const response = await this.fetchImpl(uri);
    if (!response?.ok) {
      throw new Error(`Status list could not be retrieved (HTTP ${response?.status ?? 'unknown'})`);
    }
    const jws = await response.text();
    const payload = verifyStatusListJws(jws, publicKey);
    const bits = decodeStatusListPayload(payload);
    this.cache.set(cacheKey, { bits, expiresAt: this.now() + this.ttlMs });
    return bits;
  }
}
