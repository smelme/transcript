/**
 * mdoc-core. Shared ISO/IEC 18013-5 (mDL / mdoc) library.
 *
 * Single source of truth for the credential format used by:
 *   - issuer-service  (generates IssuerSigned credentials)
 *   - verifier-service (verifies IssuerSigned credentials)
 *   - mobile-wallet-native (parses/displays IssuerSigned credentials)
 *
 * Self-contained (only Node's built-in `crypto`), so it can be imported by
 * any of the above without extra dependencies.
 *
 * Format produced/consumed (ISO/IEC 18013-5 §9.1.2 "Issuer data authentication"):
 *
 *   IssuerSigned = {
 *     "nameSpaces": {
 *       namespace => [ #6.24(bstr .cbor IssuerSignedItem), ... ]
 *     },
 *     "issuerAuth": COSE_Sign1   ; payload = #6.24(bstr .cbor MobileSecurityObject)
 *   }
 *
 *   IssuerSignedItem = {
 *     digestID, random, elementIdentifier, elementValue
 *   }
 *
 *   MobileSecurityObject = {
 *     version, digestAlgorithm, valueDigests, deviceKeyInfo, docType, validityInfo
 *   }
 */

import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// CBOR ENCODER (RFC 8949)
// ─────────────────────────────────────────────────────────────────────────────
export class Cbor {
  constructor() { this.parts = []; }

  uint(v) {
    if (v < 24) this.parts.push(Buffer.from([v]));
    else if (v < 256) this.parts.push(Buffer.from([0x18, v]));
    else if (v < 65536) { const b = Buffer.alloc(3); b[0] = 0x19; b.writeUInt16BE(v, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x1a; b.writeUInt32BE(v >>> 0, 1); this.parts.push(b); }
    return this;
  }

  // negative integer (major type 1: encoded value = -1 - v)
  nint(v) {
    const n = -1 - v;
    if (n < 24) this.parts.push(Buffer.from([0x20 | n]));
    else if (n < 256) this.parts.push(Buffer.from([0x38, n]));
    else if (n < 65536) { const b = Buffer.alloc(3); b[0] = 0x39; b.writeUInt16BE(n, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x3a; b.writeUInt32BE(n >>> 0, 1); this.parts.push(b); }
    return this;
  }

  bstr(buf) {
    const len = buf.length;
    if (len < 24) this.parts.push(Buffer.from([0x40 | len]));
    else if (len < 256) this.parts.push(Buffer.from([0x58, len]));
    else if (len < 65536) { const b = Buffer.alloc(3); b[0] = 0x59; b.writeUInt16BE(len, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x5a; b.writeUInt32BE(len >>> 0, 1); this.parts.push(b); }
    this.parts.push(buf);
    return this;
  }

  tstr(s) {
    const buf = Buffer.from(s, 'utf8');
    const len = buf.length;
    if (len < 24) this.parts.push(Buffer.from([0x60 | len]));
    else if (len < 256) this.parts.push(Buffer.from([0x78, len]));
    else if (len < 65536) { const b = Buffer.alloc(3); b[0] = 0x79; b.writeUInt16BE(len, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x7a; b.writeUInt32BE(len >>> 0, 1); this.parts.push(b); }
    this.parts.push(buf);
    return this;
  }

  arr(count) {
    if (count < 24) this.parts.push(Buffer.from([0x80 | count]));
    else if (count < 256) this.parts.push(Buffer.from([0x98, count]));
    else if (count < 65536) { const b = Buffer.alloc(3); b[0] = 0x99; b.writeUInt16BE(count, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x9a; b.writeUInt32BE(count >>> 0, 1); this.parts.push(b); }
    return this;
  }

  map(count) {
    if (count < 24) this.parts.push(Buffer.from([0xa0 | count]));
    else if (count < 256) this.parts.push(Buffer.from([0xb8, count]));
    else if (count < 65536) { const b = Buffer.alloc(3); b[0] = 0xb9; b.writeUInt16BE(count, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0xba; b.writeUInt32BE(count >>> 0, 1); this.parts.push(b); }
    return this;
  }

  tag(n) {
    if (n < 24) this.parts.push(Buffer.from([0xc0 | n]));
    else if (n < 256) this.parts.push(Buffer.from([0xd8, n]));
    else if (n < 65536) { const b = Buffer.alloc(3); b[0] = 0xd9; b.writeUInt16BE(n, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0xda; b.writeUInt32BE(n >>> 0, 1); this.parts.push(b); }
    return this;
  }

  bool(v) { this.parts.push(Buffer.from([v ? 0xf5 : 0xf4])); return this; }
  null_() { this.parts.push(Buffer.from([0xf6])); return this; }
  f32(v) { const b = Buffer.alloc(5); b[0] = 0xfa; b.writeFloatBE(v, 1); this.parts.push(b); return this; }
  f64(v) { const b = Buffer.alloc(9); b[0] = 0xfb; b.writeDoubleBE(v, 1); this.parts.push(b); return this; }
  raw(buf) { this.parts.push(buf); return this; }

  encode() { return Buffer.concat(this.parts); }
}

// full-date: #6.1004(tstr)
export function fullDate(s) { return new Cbor().tag(1004).tstr(s).encode(); }
// date-time: #6.0(tstr)
export function dateTime(s) { return new Cbor().tag(0).tstr(s).encode(); }

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest(); }

export function nowPlusSeconds(s) {
  return new Date(Date.now() + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ─────────────────────────────────────────────────────────────────────────────
// CBOR DECODER (returns plain JS values; byte strings as { __b: Buffer },
// tagged items as { __tag: n, v: value })
// ─────────────────────────────────────────────────────────────────────────────
export function decodeCbor(buf) {
  let off = 0;
  function rd() { if (off >= buf.length) throw new Error('Unexpected end of CBOR'); return buf[off++]; }
  function len(ai) {
    if (ai < 24) return ai;
    if (ai === 24) return rd();
    if (ai === 25) return buf.readUInt16BE((off += 2) - 2);
    if (ai === 26) return buf.readUInt32BE((off += 4) - 4);
    if (ai === 27) { const v = buf.readBigUInt64BE((off += 8) - 8); return Number(v); }
    throw new Error('Bad CBOR length');
  }
  function dec() {
    const b = rd(); const major = b >> 5; const ai = b & 0x1f;
    switch (major) {
      case 0: return len(ai);
      case 1: return -1 - len(ai);
      case 2: { const n = len(ai); const v = Buffer.from(buf.slice(off, off + n)); off += n; return { __b: v }; }
      case 3: { const n = len(ai); const v = buf.slice(off, off + n).toString('utf8'); off += n; return v; }
      case 4: { const n = len(ai); const a = []; for (let i = 0; i < n; i++) a.push(dec()); return a; }
      case 5: { const n = len(ai); const m = new Map(); for (let i = 0; i < n; i++) { const k = dec(); const v = dec(); m.set(k, v); } return m; }
      case 6: { const t = len(ai); return { __tag: t, v: dec() }; }
      case 7:
        if (ai === 20) return false;
        if (ai === 21) return true;
        if (ai === 22 || ai === 23) return null;
        if (ai === 26) { const v = buf.readFloatBE((off += 4) - 4); return v; }
        if (ai === 27) { const v = buf.readDoubleBE((off += 8) - 8); return v; }
        return undefined;
      default: throw new Error('Bad CBOR major type ' + major);
    }
  }
  return dec();
}

// Convert a decoded CBOR value into a JSON-friendly representation
export function toFriendly(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Buffer.isBuffer(value)) return value;
  if (value.__b) return { type: 'bytes', base64: value.__b.toString('base64'), length: value.__b.length };
  if (value.__tag !== undefined) {
    const inner = toFriendly(value.v);
    if (value.__tag === 0 || value.__tag === 1004) return { type: 'date', tag: value.__tag, value: inner };
    if (value.__tag === 24) return inner; // encoded CBOR: unwrap
    return { tag: value.__tag, value: inner };
  }
  if (value instanceof Map) {
    const obj = {};
    for (const [k, v] of value) {
      obj[typeof k === 'object' ? JSON.stringify(k) : String(k)] = toFriendly(v);
    }
    return obj;
  }
  if (Array.isArray(value)) return value.map(toFriendly);
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS (ISO/IEC 18013-5 + RFC 8152)
// ─────────────────────────────────────────────────────────────────────────────
export const T24 = 24;              // Encoded-CBOR tag
export const ES256 = -7;            // COSE algorithm identifier
const COSE_KEY_KTY = 1, COSE_KEY_EC2 = 2;
const COSE_KEY_CRV = -1, COSE_KEY_P256 = 1;
const COSE_KEY_X = -2, COSE_KEY_Y = -3;
const COSE_LABEL_ALG = 1, COSE_LABEL_X5CHAIN = 33;

// COSE_Key for an EC P-256 public key (from a JWK export)
export function coseKeyFromJwk(jwk) {
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  return new Cbor()
    .map(4)
    .uint(COSE_KEY_KTY).uint(COSE_KEY_EC2)
    .nint(COSE_KEY_CRV).uint(COSE_KEY_P256)
    .nint(COSE_KEY_X).bstr(x)
    .nint(COSE_KEY_Y).bstr(y)
    .encode();
}

// Generate an EC P-256 mdoc device key pair (the "mdoc authentication key").
// The public JWK (kty/crv/x/y) is sent to the issuer and embedded in the MSO's
// deviceKeyInfo.deviceKey; the private JWK (adds `d`) must remain on the device
// and is used later to sign the DeviceSigned structure during presentation.
export function generateDeviceKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  return {
    publicJwk: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y },
    privateJwk: priv,
  };
}

// Validate a device public JWK for use as the mdoc device key (EC P-256).
export function isValidDevicePublicJwk(jwk) {
  if (!jwk || typeof jwk !== 'object') return false;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false;
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return false;
  if (!/^[A-Za-z0-9_-]+$/.test(jwk.x) || !/^[A-Za-z0-9_-]+$/.test(jwk.y)) return false;
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  return x.length === 32 && y.length === 32;
}

// Build an IssuerSignedItem and its digest
// wrapped = #6.24(bstr .cbor { digestID, random, elementIdentifier, elementValue })
// digest  = SHA-256(wrapped)
export function buildIssuerSignedItem(digestID, elementIdentifier, elementValueCbor) {
  const random = crypto.randomBytes(32);
  const itemCbor = new Cbor()
    .map(4)
    .tstr('digestID').uint(digestID)
    .tstr('random').bstr(random)
    .tstr('elementIdentifier').tstr(elementIdentifier)
    .tstr('elementValue').raw(elementValueCbor)
    .encode();
  const wrapped = new Cbor().tag(T24).bstr(itemCbor).encode();
  return { wrapped, digest: sha256(wrapped) };
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION
// ─────────────────────────────────────────────────────────────────────────────
//
// namespaces: { [namespace]: [ [elementIdentifier, elementValueCborBuffer], ... ] }
// elementValueCborBuffer is pre-encoded CBOR (use Cbor helpers / fullDate / dateTime).
//
// Returns:
//   { issuerSigned (Buffer), base64url, mso (Buffer), nameSpaces (Buffer) }
//
export function generateIssuerSigned({
  docType,
  namespaces,
  signerKeyPem,
  certDer,
  signed = nowPlusSeconds(0),
  validFrom = nowPlusSeconds(0),
  validUntil = nowPlusSeconds(2 * 365 * 24 * 3600),
  expectedUpdate = nowPlusSeconds(365 * 24 * 3600),
  deviceJwk = null,
  status = null,
}) {
  const signerKey = crypto.createPrivateKey(signerKeyPem);
  if (!deviceJwk) {
    deviceJwk = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      .publicKey.export({ format: 'jwk' });
  }

  // 1. Issuer-signed name spaces + per-field digests
  const nameSpacesEntries = [];
  const valueDigests = {};

  for (const ns of Object.keys(namespaces)) {
    const items = namespaces[ns];
    const wrappedItems = [];
    valueDigests[ns] = {};

    items.forEach(([identifier, valueCbor], idx) => {
      const { wrapped, digest } = buildIssuerSignedItem(idx, identifier, valueCbor);
      wrappedItems.push(wrapped);
      valueDigests[ns][idx] = digest;
    });

    const nsArray = new Cbor().arr(wrappedItems.length);
    wrappedItems.forEach(w => nsArray.raw(w));
    nameSpacesEntries.push([new Cbor().tstr(ns).encode(), nsArray.encode()]);
  }

  const nameSpacesMap = new Cbor().map(nameSpacesEntries.length);
  for (const [k, v] of nameSpacesEntries) nameSpacesMap.raw(k).raw(v);
  const nameSpacesCbor = nameSpacesMap.encode();

  // 2. Device key (mdoc authentication key, EC P-256)
  const deviceKeyCoseKey = coseKeyFromJwk(deviceJwk);

  // 3. Mobile Security Object
  const valueDigestsMap = new Cbor().map(Object.keys(valueDigests).length);
  for (const ns of Object.keys(valueDigests)) {
    const ids = Object.keys(valueDigests[ns]).sort((a, b) => a - b);
    const inner = new Cbor().map(ids.length);
    for (const id of ids) inner.uint(Number(id)).bstr(valueDigests[ns][id]);
    valueDigestsMap.tstr(ns).raw(inner.encode());
  }

  const msoBuilder = new Cbor()
    .map(status ? 7 : 6)
    .tstr('version').tstr('1.0')
    .tstr('digestAlgorithm').tstr('SHA-256')
    .tstr('docType').tstr(docType)
    .tstr('valueDigests').raw(valueDigestsMap.encode())
    .tstr('deviceKeyInfo').map(1).tstr('deviceKey').raw(deviceKeyCoseKey)
    .tstr('validityInfo').map(4)
    .tstr('signed').raw(dateTime(signed))
    .tstr('validFrom').raw(dateTime(validFrom))
    .tstr('validUntil').raw(dateTime(validUntil))
    .tstr('expectedUpdate').raw(dateTime(expectedUpdate));

  // Optional revocation reference, in the shape ISO/IEC 18013-5 defines for
  // the MSO: status -> status_list -> { idx, uri }. It travels inside the signed
  // MSO, so a verifier can resolve the credential's status without relying on - or
  // even asking for - any disclosed claim. `idx` is the credential's index into
  // the status list published at `uri`.
  if (status) {
    msoBuilder
      .tstr('status').map(1)
      .tstr('status_list').map(2)
      .tstr('idx').uint(status.idx)
      .tstr('uri').tstr(status.uri);
  }

  const mso = msoBuilder.encode();

  // MobileSecurityObjectBytes = #6.24(bstr .cbor MSO)
  const msoBytes = new Cbor().tag(T24).bstr(mso).encode();

  // 4. COSE_Sign1 (ES256) over MobileSecurityObjectBytes
  const protectedHeaderMap = new Cbor().map(1).uint(COSE_LABEL_ALG).nint(ES256).encode();
  const protectedBstr = new Cbor().bstr(protectedHeaderMap).encode();

  const sigStructure = new Cbor()
    .arr(4)
    .tstr('Signature1')
    .raw(protectedBstr)
    .bstr(Buffer.alloc(0))
    .bstr(msoBytes)
    .encode();

  const signature = crypto.sign('sha256', sigStructure, {
    key: signerKey,
    dsaEncoding: 'ieee-p1363', // raw r || s
  });

  const unprotectedHeader = new Cbor()
    .map(1)
    .uint(COSE_LABEL_X5CHAIN)
    .arr(1).bstr(certDer)
    .encode();

  const issuerAuth = new Cbor()
    .arr(4)
    .raw(protectedBstr)
    .raw(unprotectedHeader)
    .bstr(msoBytes)
    .bstr(signature)
    .encode();

  // 5. IssuerSigned = { nameSpaces, issuerAuth }
  const issuerSigned = new Cbor()
    .map(2)
    .tstr('nameSpaces').raw(nameSpacesCbor)
    .tstr('issuerAuth').raw(issuerAuth)
    .encode();

  return {
    issuerSigned,
    base64url: issuerSigned.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
    mso,
    nameSpacesCbor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
//
// Accepts an IssuerSigned CBOR Buffer (or a base64/base64url string).
// Verifies: (1) COSE_Sign1 ES256 signature over the MSO, (2) MSO valueDigests
// match the actual IssuerSignedItems. Returns a detailed result object.
//
export function verifyIssuerSigned(input) {
  let buf = input;
  if (typeof input === 'string') {
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
    buf = Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64');
  }

  const result = {
    valid: false,
    signatureValid: false,
    digestsValid: false,
    docType: null,
    digestAlgorithm: null,
    validityInfo: null,
    issuerCert: null,
    deviceKey: null,
    namespaces: {},
    error: null,
  };

  try {
    const doc = decodeCbor(buf);
    if (!(doc instanceof Map) || !doc.has('nameSpaces') || !doc.has('issuerAuth')) {
      result.error = 'Not an IssuerSigned structure (missing nameSpaces/issuerAuth)';
      return result;
    }

    const nsMap = doc.get('nameSpaces');
    const auth = doc.get('issuerAuth');
    if (!Array.isArray(auth) || auth.length !== 4) {
      result.error = 'issuerAuth is not a COSE_Sign1 (4-element) array';
      return result;
    }

    const [protectedBstr, unprotected, payloadBstr, signature] = auth;
    const protectedMap = decodeCbor(protectedBstr.__b);
    const alg = protectedMap.get(COSE_LABEL_ALG);
    if (alg !== ES256) {
      result.error = `Unsupported signature algorithm ${alg} (expected ES256 ${ES256})`;
      return result;
    }

    // Extract the signer certificate from the x5chain (unprotected header label 33)
    const certDer = Array.isArray(unprotected.get(COSE_LABEL_X5CHAIN))
      ? unprotected.get(COSE_LABEL_X5CHAIN)[0].__b
      : null;

    let pubKey = null;
    if (certDer) {
      try {
        const cert = new crypto.X509Certificate(certDer);
        pubKey = cert.publicKey;
        result.issuerCert = {
          subject: cert.subject,
          issuer: cert.issuer,
          validFrom: cert.validFrom,
          validTo: cert.validTo,
        };
      } catch (e) {
        result.error = 'Invalid issuer certificate in x5chain: ' + e.message;
        return result;
      }
    }

    // Rebuild COSE Sig_structure = [ "Signature1", bstr(protected), bstr'', bstr(payload) ]
    const sigStructureBytes = new Cbor()
      .arr(4)
      .tstr('Signature1')
      .bstr(protectedBstr.__b)
      .bstr(Buffer.alloc(0))
      .bstr(payloadBstr.__b)
      .encode();

    if (pubKey) {
      result.signatureValid = crypto.verify(
        'sha256',
        sigStructureBytes,
        { key: pubKey, dsaEncoding: 'ieee-p1363' },
        signature.__b
      );
    }

    // Parse the MSO (payload = #6.24(bstr(MSO)))
    const msoOuter = decodeCbor(payloadBstr.__b);
    const mso = decodeCbor(msoOuter.v.__b);
    result.docType = mso.get('docType');
    result.digestAlgorithm = mso.get('digestAlgorithm');

    const vi = mso.get('validityInfo');
    if (vi instanceof Map) {
      result.validityInfo = {
        signed: toFriendly(vi.get('signed')),
        validFrom: toFriendly(vi.get('validFrom')),
        validUntil: toFriendly(vi.get('validUntil')),
        expectedUpdate: vi.has('expectedUpdate') ? toFriendly(vi.get('expectedUpdate')) : null,
      };
    }

    const dki = mso.get('deviceKeyInfo');
    if (dki instanceof Map && dki.get('deviceKey') instanceof Map) {
      const dk = dki.get('deviceKey');
      result.deviceKey = {
        kty: dk.get(COSE_KEY_KTY),
        crv: dk.get(COSE_KEY_CRV),
        x: dk.get(COSE_KEY_X).__b.toString('base64'),
        y: dk.get(COSE_KEY_Y).__b.toString('base64'),
      };
    }

    // valueDigests: ns -> { digestID -> digest }
    const msoValueDigests = mso.get('valueDigests');

    // Parse issuer-signed name spaces and recompute digests
    let digestsValid = true;
    const parsedNamespaces = {};
    for (const [ns, items] of nsMap) {
      parsedNamespaces[ns] = items.map((wrappedItem) => {
        const item = decodeCbor(wrappedItem.v.__b);
        const digestID = item.get('digestID');
        const identifier = item.get('elementIdentifier');
        const rawValue = item.get('elementValue');

        // digest = SHA-256( #6.24(bstr(itemCbor)) ), using the exact raw item bytes
        const digest = sha256(new Cbor().tag(T24).bstr(wrappedItem.v.__b).encode());

        // Compare with MSO valueDigests
        if (msoValueDigests instanceof Map && msoValueDigests.has(ns)) {
          const nsDigests = msoValueDigests.get(ns);
          if (nsDigests instanceof Map && nsDigests.has(digestID)) {
            if (!nsDigests.get(digestID).__b.equals(digest)) digestsValid = false;
          } else {
            digestsValid = false;
          }
        } else {
          digestsValid = false;
        }

        return {
          digestID,
          elementIdentifier: identifier,
          elementValue: toFriendly(rawValue),
        };
      });
    }
    result.namespaces = parsedNamespaces;
    result.digestsValid = digestsValid;

    result.valid = result.signatureValid && digestsValid;
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

// Parse (without strict verification) for display in the wallet.
export function parseMdoc(input) {
  const result = verifyIssuerSigned(input);
  return {
    docType: result.docType,
    digestAlgorithm: result.digestAlgorithm,
    validityInfo: result.validityInfo,
    issuerCert: result.issuerCert,
    namespaces: result.namespaces,
    signatureValid: result.signatureValid,
    digestsValid: result.digestsValid,
    error: result.error,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE AUTHENTICATION (proof of possession)
// ─────────────────────────────────────────────────────────────────────────────
//
// At presentation, the wallet signs the ISO 18013-5 SessionTranscript (which
// binds the verifier's challenge) with the device's mdoc authentication private
// key. The verifier checks the signature against the public key embedded in the
// MSO's deviceKeyInfo. Proving the presenting wallet holds the private key.

// Sign challenge bytes with the device private JWK, producing a COSE_Sign1 (ES256).
export function buildDeviceSignature(privateJwk, challengeBytes) {
  const privateKey = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: privateJwk.x,
      y: privateJwk.y,
      d: privateJwk.d,
    },
    format: 'jwk',
  });

  const protectedHeaderMap = new Cbor().map(1).uint(COSE_LABEL_ALG).nint(ES256).encode();
  const protectedBstr = new Cbor().bstr(protectedHeaderMap).encode();

  const sigStructure = new Cbor()
    .arr(4)
    .tstr('Signature1')
    .raw(protectedBstr)
    .bstr(Buffer.alloc(0))
    .bstr(challengeBytes)
    .encode();

  const signature = crypto.sign('sha256', sigStructure, {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return new Cbor()
    .arr(4)
    .raw(protectedBstr)
    .map(0)
    .bstr(challengeBytes)
    .bstr(signature)
    .encode();
}

// ─────────────────────────────────────────────────────────────────────────────
// CWT (CBOR Web Token, RFC 8392) proof-of-possession
// ─────────────────────────────────────────────────────────────────────────────
//
// The wallet proves possession of its device key by signing a CWT (COSE_Sign1)
// that carries the device public key in the `cnf` claim (RFC 8747) and is bound
// to the offer via a nonce. The issuer verifies the signature against that key
// and embeds the same key in the MSO deviceKeyInfo.

const CWT_ISS = 1, CWT_SUB = 2, CWT_AUD = 3, CWT_EXP = 4, CWT_IAT = 6, CWT_CTI = 7, CWT_CNF = 8;
const CWT_NONCE = 100; // custom claim: binds the CWT to a specific offer nonce

// Convert a decoded COSE_Key map (EC P-256) back to a public JWK.
export function jwkFromCoseKey(coseKey) {
  if (!(coseKey instanceof Map)) return null;
  const x = coseKey.get(COSE_KEY_X);
  const y = coseKey.get(COSE_KEY_Y);
  if (!x || !y || !x.__b || !y.__b) return null;
  return {
    kty: 'EC',
    crv: 'P-256',
    x: x.__b.toString('base64url'),
    y: y.__b.toString('base64url'),
  };
}

// Build a CWT (COSE_Sign1) signed with the device private JWK. The device public
// key is carried in the `cnf` claim; `nonce` binds the token to one offer.
export function buildCwt({
  privateJwk,
  devicePublicJwk,
  issuer,
  subject,
  audience,
  nonce,
  expSeconds = 300,
}) {
  const coseKey = coseKeyFromJwk(devicePublicJwk);
  const cnf = new Cbor().map(1).uint(1).raw(coseKey).encode(); // { 1: COSE_Key }

  const now = Math.floor(Date.now() / 1000);
  const claims = new Cbor()
    .map(8)
    .uint(CWT_ISS).tstr(String(issuer))
    .uint(CWT_SUB).tstr(String(subject))
    .uint(CWT_AUD).tstr(String(audience))
    .uint(CWT_EXP).uint(now + expSeconds)
    .uint(CWT_IAT).uint(now)
    .uint(CWT_CTI).bstr(crypto.randomBytes(16))
    .uint(CWT_CNF).raw(cnf)
    .uint(CWT_NONCE).tstr(String(nonce))
    .encode();

  const protectedHeaderMap = new Cbor().map(1).uint(COSE_LABEL_ALG).nint(ES256).encode();
  const protectedBstr = new Cbor().bstr(protectedHeaderMap).encode();

  const privateKey = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: privateJwk.x, y: privateJwk.y, d: privateJwk.d },
    format: 'jwk',
  });

  const sigStructure = new Cbor()
    .arr(4)
    .tstr('Signature1')
    .raw(protectedBstr)
    .bstr(Buffer.alloc(0))
    .bstr(claims)
    .encode();

  const signature = crypto.sign('sha256', sigStructure, {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  return new Cbor().arr(4).raw(protectedBstr).map(0).bstr(claims).bstr(signature).encode();
}

// Verify a CWT: signature against the embedded device key, audience, nonce, exp.
// Returns { valid, devicePublicJwk } on success.
export function verifyCwt(cwtBytes, { audience, nonce }) {
  try {
    const cose = decodeCbor(cwtBytes);
    if (!Array.isArray(cose) || cose.length !== 4) return { valid: false, error: 'Not a COSE_Sign1' };
    const [protectedBstr, , payloadBstr, signature] = cose;

    const protectedMap = decodeCbor(protectedBstr.__b);
    if (protectedMap.get(COSE_LABEL_ALG) !== ES256) return { valid: false, error: 'Unsupported algorithm' };

    const claims = decodeCbor(payloadBstr.__b);
    if (!(claims instanceof Map)) return { valid: false, error: 'Invalid CWT claims' };
    if (claims.get(CWT_AUD) !== String(audience)) return { valid: false, error: 'CWT audience mismatch' };
    if (claims.get(CWT_NONCE) !== String(nonce)) return { valid: false, error: 'CWT nonce mismatch' };
    if ((claims.get(CWT_EXP) || 0) < Math.floor(Date.now() / 1000)) return { valid: false, error: 'CWT expired' };

    const cnf = claims.get(CWT_CNF);
    const devicePublicJwk = jwkFromCoseKey(cnf instanceof Map ? cnf.get(1) : null);
    if (!devicePublicJwk) return { valid: false, error: 'Missing device key in CWT cnf' };

    const publicKey = crypto.createPublicKey({ key: devicePublicJwk, format: 'jwk' });
    const sigStructure = new Cbor()
      .arr(4)
      .tstr('Signature1')
      .bstr(protectedBstr.__b)
      .bstr(Buffer.alloc(0))
      .bstr(payloadBstr.__b)
      .encode();

    const ok = crypto.verify('sha256', sigStructure, {
      key: publicKey,
      dsaEncoding: 'ieee-p1363',
    }, signature.__b);
    if (!ok) return { valid: false, error: 'CWT signature invalid' };

    return {
      valid: true,
      devicePublicJwk,
      claims: { iss: claims.get(CWT_ISS), sub: claims.get(CWT_SUB) },
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

// Verify a device COSE_Sign1 over challengeBytes against the device public JWK.
export function verifyDeviceSignature(signatureCose, publicJwk, challengeBytes) {
  const cose = decodeCbor(signatureCose);
  if (!Array.isArray(cose) || cose.length !== 4) return false;
  const [protectedBstr, , payloadBstr, signature] = cose;

  // The signed payload must be exactly the challenge the verifier issued —
  // otherwise an old device signature could be replayed.
  const expected = Buffer.from(challengeBytes);
  if (!payloadBstr.__b.equals(expected)) return false;

  const protectedMap = decodeCbor(protectedBstr.__b);
  if (protectedMap.get(COSE_LABEL_ALG) !== ES256) return false;

  const publicKey = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y },
    format: 'jwk',
  });

  const sigStructure = new Cbor()
    .arr(4)
    .tstr('Signature1')
    .bstr(protectedBstr.__b)
    .bstr(Buffer.alloc(0))
    .bstr(payloadBstr.__b)
    .encode();

  try {
    return crypto.verify('sha256', sigStructure, {
      key: publicKey,
      dsaEncoding: 'ieee-p1363',
    }, signature.__b);
  } catch {
    return false;
  }
}
