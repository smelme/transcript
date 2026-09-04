#!/usr/bin/env node

/**
 * Generate a spec-compliant ISO 18013-5 / ISO 23220 Photo ID mDOC credential.
 *
 * Produces the "IssuerSigned" structure (accepted by the Paradym mDOC debugger):
 *
 *   IssuerSigned = {
 *     "nameSpaces": {
 *       namespace => [ #6.24(bstr .cbor IssuerSignedItem), ... ]
 *     },
 *     "issuerAuth": COSE_Sign1   ; payload = #6.24(bstr .cbor MobileSecurityObject)
 *   }
 *
 * Structure replicated from the Android Open Source Project "multipaz"
 * reference implementation (MobileSecurityObjectGenerator / DocumentGenerator).
 */

import fs from 'fs';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// CBOR ENCODER (RFC 8949)
// ─────────────────────────────────────────────────────────────────────────────
class Cbor {
  constructor() { this.parts = []; }

  // unsigned integer
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

  // byte string
  bstr(buf) {
    const len = buf.length;
    if (len < 24) this.parts.push(Buffer.from([0x40 | len]));
    else if (len < 256) this.parts.push(Buffer.from([0x58, len]));
    else if (len < 65536) { const b = Buffer.alloc(3); b[0] = 0x59; b.writeUInt16BE(len, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x5a; b.writeUInt32BE(len >>> 0, 1); this.parts.push(b); }
    this.parts.push(buf);
    return this;
  }

  // text string
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

  // array header
  arr(count) {
    if (count < 24) this.parts.push(Buffer.from([0x80 | count]));
    else if (count < 256) this.parts.push(Buffer.from([0x98, count]));
    else if (count < 65536) { const b = Buffer.alloc(3); b[0] = 0x99; b.writeUInt16BE(count, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0x9a; b.writeUInt32BE(count >>> 0, 1); this.parts.push(b); }
    return this;
  }

  // map header
  map(count) {
    if (count < 24) this.parts.push(Buffer.from([0xa0 | count]));
    else if (count < 256) this.parts.push(Buffer.from([0xb8, count]));
    else if (count < 65536) { const b = Buffer.alloc(3); b[0] = 0xb9; b.writeUInt16BE(count, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0xba; b.writeUInt32BE(count >>> 0, 1); this.parts.push(b); }
    return this;
  }

  // semantic tag
  tag(n) {
    if (n < 24) this.parts.push(Buffer.from([0xc0 | n]));
    else if (n < 256) this.parts.push(Buffer.from([0xd8, n]));
    else if (n < 65536) { const b = Buffer.alloc(3); b[0] = 0xd9; b.writeUInt16BE(n, 1); this.parts.push(b); }
    else { const b = Buffer.alloc(5); b[0] = 0xda; b.writeUInt32BE(n >>> 0, 1); this.parts.push(b); }
    return this;
  }

  // boolean
  bool(v) { this.parts.push(Buffer.from([v ? 0xf5 : 0xf4])); return this; }

  // float32
  f32(v) { const b = Buffer.alloc(5); b[0] = 0xfa; b.writeFloatBE(v, 1); this.parts.push(b); return this; }

  // embed raw pre-encoded CBOR bytes
  raw(buf) { this.parts.push(buf); return this; }

  encode() { return Buffer.concat(this.parts); }
}

// full-date: #6.1004(tstr)  (ISO 18013-5 "full-date")
function fullDate(s) { return new Cbor().tag(1004).tstr(s).encode(); }

// date-time: #6.0(tstr)  (RFC 3339)
function dateTime(s) { return new Cbor().tag(0).tstr(s).encode(); }

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const T24 = 24;            // Encoded-CBOR tag (bstr .cbor)
const ES256 = -7;          // COSE algorithm
const COSE_KEY_KTY = 1, COSE_KEY_EC2 = 2;
const COSE_KEY_CRV = -1, COSE_KEY_P256 = 1;
const COSE_KEY_X = -2, COSE_KEY_Y = -3;
const COSE_LABEL_ALG = 1, COSE_LABEL_X5CHAIN = 33;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest(); }

function nowPlusSeconds(s) {
  return new Date(Date.now() + s * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// IssuerSignedItem = #6.24(bstr .cbor { digestID, random, elementIdentifier, elementValue })
// digest = SHA-256 of those wrapped bytes
function issuerSignedItem(digestID, elementIdentifier, elementValueCbor) {
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

// COSE_Key for EC P-256 from a JWK export
function coseKeyFromJwk(jwk) {
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

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIAL DATA
// ─────────────────────────────────────────────────────────────────────────────
const DOC_TYPE = 'org.iso.23220.photoid.1';
const NS_PHOTOID = 'org.iso.23220.photoid.1';
const NS_QUALIFICATION = 'org.iso.23220.education.qualification.1';
const NS_TRANSCRIPT = 'org.iso.23220.education.transcript.1';

const portraitBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

// namespace -> [ [elementIdentifier, pre-encoded CBOR element value], ... ]
const namespaces = {
  [NS_PHOTOID]: [
    ['portrait', new Cbor().bstr(portraitBytes).encode()],
    ['given_name', new Cbor().tstr('Erika').encode()],
    ['family_name', new Cbor().tstr('Mustermann').encode()],
    ['birth_date', fullDate('1964-08-12')],
    ['document_number', new Cbor().tstr('Z021AB37X13').encode()],
    ['issuing_authority', new Cbor().tstr('Smart College').encode()],
    ['issuing_country', new Cbor().tstr('NL').encode()],
    ['issue_date', fullDate('2025-03-24')],
    ['expiry_date', fullDate('2031-03-24')],
  ],
  [NS_QUALIFICATION]: [
    ['institution_name', new Cbor().tstr('MIT').encode()],
    ['degree_level', new Cbor().tstr('bachelor').encode()],
    ['field_of_study', new Cbor().tstr('Computer Science').encode()],
    ['graduation_date', fullDate('2026-05-15')],
    ['gpa', new Cbor().f32(3.9).encode()],
  ],
  [NS_TRANSCRIPT]: [
    ['student_id', new Cbor().tstr('STU-2026-001').encode()],
    [
      'courses',
      new Cbor().arr(2)
        .map(4).tstr('courseCode').tstr('6.S191').tstr('courseName').tstr('Machine Learning').tstr('credits').uint(3).tstr('grade').tstr('A')
        .map(4).tstr('courseCode').tstr('6.009').tstr('courseName').tstr('Programming').tstr('credits').uint(4).tstr('grade').tstr('A')
        .encode(),
    ],
    ['total_credits', new Cbor().uint(7).encode()],
    ['status', new Cbor().tstr('completed').encode()],
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. BUILD ISSUER-SIGNED NAME SPACES + per-field digests
// ─────────────────────────────────────────────────────────────────────────────
const nameSpacesEntries = [];
const valueDigests = {};

for (const ns of Object.keys(namespaces)) {
  const items = namespaces[ns];
  const wrappedItems = [];
  valueDigests[ns] = {};

  items.forEach(([identifier, valueCbor], idx) => {
    const { wrapped, digest } = issuerSignedItem(idx, identifier, valueCbor);
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. DEVICE KEY (mdoc authentication key — EC P-256)
// ─────────────────────────────────────────────────────────────────────────────
const deviceKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const deviceJwk = deviceKeyPair.publicKey.export({ format: 'jwk' });
const deviceKeyCoseKey = coseKeyFromJwk(deviceJwk);

// ─────────────────────────────────────────────────────────────────────────────
// 3. MOBILE SECURITY OBJECT (MSO)
// ─────────────────────────────────────────────────────────────────────────────
const signed = nowPlusSeconds(0);
const validFrom = nowPlusSeconds(0);
const validUntil = nowPlusSeconds(2 * 365 * 24 * 3600);
const expectedUpdate = nowPlusSeconds(365 * 24 * 3600);

const valueDigestsMap = new Cbor().map(Object.keys(valueDigests).length);
for (const ns of Object.keys(valueDigests)) {
  const ids = Object.keys(valueDigests[ns]).sort((a, b) => a - b);
  const inner = new Cbor().map(ids.length);
  for (const id of ids) inner.uint(Number(id)).bstr(valueDigests[ns][id]);
  valueDigestsMap.tstr(ns).raw(inner.encode());
}

const mso = new Cbor()
  .map(6)
  .tstr('version').tstr('1.0')
  .tstr('digestAlgorithm').tstr('SHA-256')
  .tstr('docType').tstr(DOC_TYPE)
  .tstr('valueDigests').raw(valueDigestsMap.encode())
  .tstr('deviceKeyInfo').map(1).tstr('deviceKey').raw(deviceKeyCoseKey)
  .tstr('validityInfo').map(4)
  .tstr('signed').raw(dateTime(signed))
  .tstr('validFrom').raw(dateTime(validFrom))
  .tstr('validUntil').raw(dateTime(validUntil))
  .tstr('expectedUpdate').raw(dateTime(expectedUpdate))
  .encode();

// MobileSecurityObjectBytes = #6.24(bstr .cbor MSO)
const msoBytes = new Cbor().tag(T24).bstr(mso).encode();

// ─────────────────────────────────────────────────────────────────────────────
// 4. ISSUER AUTH (COSE_Sign1 over MobileSecurityObjectBytes, ES256)
// ─────────────────────────────────────────────────────────────────────────────
const signerKey = crypto.createPrivateKey(fs.readFileSync('signer-key.pem'));
const certDer = fs.readFileSync('signer-cert.der');

// protected header: { 1: -7 }  (alg = ES256)
const protectedHeaderMap = new Cbor().map(1).uint(COSE_LABEL_ALG).nint(ES256).encode();
const protectedBstr = new Cbor().bstr(protectedHeaderMap).encode();

// Sig_structure = [ "Signature1", protectedBstr, bstr'', msoBytes ]
const sigStructure = new Cbor()
  .arr(4)
  .tstr('Signature1')
  .raw(protectedBstr)
  .bstr(Buffer.alloc(0))
  .bstr(msoBytes)
  .encode();

const signature = crypto.sign('sha256', sigStructure, {
  key: signerKey,
  dsaEncoding: 'ieee-p1363', // raw r || s (64 bytes)
});

// unprotected header: { 33: [ certDer ] }  (x5chain)
const unprotectedHeader = new Cbor()
  .map(1)
  .uint(COSE_LABEL_X5CHAIN)
  .arr(1).bstr(certDer)
  .encode();

// COSE_Sign1 = [ protected, unprotected, payload(bstr), signature ]
const issuerAuth = new Cbor()
  .arr(4)
  .raw(protectedBstr)
  .raw(unprotectedHeader)
  .bstr(msoBytes)
  .bstr(signature)
  .encode();

// ─────────────────────────────────────────────────────────────────────────────
// 5. ISSUER SIGNED = { nameSpaces, issuerAuth }
// ─────────────────────────────────────────────────────────────────────────────
const issuerSigned = new Cbor()
  .map(2)
  .tstr('nameSpaces').raw(nameSpacesCbor)
  .tstr('issuerAuth').raw(issuerAuth)
  .encode();

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT
// ─────────────────────────────────────────────────────────────────────────────
const base64 = issuerSigned.toString('base64');
const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

console.log('🎫 ISO 23220 Photo ID mDOC (IssuerSigned) — ISO 18013-5 compliant\n');
console.log('══════════════════════════════════════════════════════════════\n');
console.log(`CBOR size      : ${issuerSigned.length} bytes`);
console.log(`Base64         : ${base64.length} chars`);
console.log(`Base64URL      : ${base64url.length} chars`);
console.log(`MSO size       : ${mso.length} bytes`);
console.log(`Signature      : ES256 (${signature.length} bytes raw r||s)`);
console.log(`Device key     : EC P-256`);
console.log(`Signer cert    : ${certDer.length} bytes DER\n`);

console.log('🔗 Base64URL (paste into https://paradym.id/tools/mdoc):\n');
console.log(base64url);
console.log();

fs.writeFileSync('mdoc-cbor.bin', issuerSigned);
fs.writeFileSync('mdoc-mso.bin', mso);
fs.writeFileSync('mdoc-base64-latest.txt', base64);
fs.writeFileSync('mdoc-base64url-latest.txt', base64url);

console.log('✅ Saved: mdoc-cbor.bin, mdoc-mso.bin, mdoc-base64-latest.txt, mdoc-base64url-latest.txt\n');

// ─────────────────────────────────────────────────────────────────────────────
// SELF-VERIFICATION (re-parse our CBOR + verify ES256 signature)
// ─────────────────────────────────────────────────────────────────────────────
function decodeCbor(buf) {
  let off = 0;
  function rd() { if (off >= buf.length) throw new Error('EOF'); return buf[off++]; }
  function len(ai) {
    if (ai < 24) return ai;
    if (ai === 24) return rd();
    if (ai === 25) return buf.readUInt16BE((off += 2) - 2);
    if (ai === 26) return buf.readUInt32BE((off += 4) - 4);
    throw new Error('bad len');
  }
  function dec() {
    const b = rd(); const major = b >> 5; const ai = b & 0x1f;
    switch (major) {
      case 0: return len(ai);
      case 1: return -1 - len(ai);
      case 2: { const n = len(ai); const v = buf.slice(off, off + n); off += n; return { __b: v }; }
      case 3: { const n = len(ai); const v = buf.slice(off, off + n).toString('utf8'); off += n; return v; }
      case 4: { const n = len(ai); const a = []; for (let i = 0; i < n; i++) a.push(dec()); return a; }
      case 5: { const n = len(ai); const m = new Map(); for (let i = 0; i < n; i++) { const k = dec(); const v = dec(); m.set(typeof k === 'object' ? JSON.stringify(k) : k, v); } return m; }
      case 6: { const t = len(ai); return { __tag: t, v: dec() }; }
      case 7: return ai === 20 ? false : ai === 21 ? true : null;
      default: throw new Error('bad major ' + major);
    }
  }
  return dec();
}

try {
  const doc = decodeCbor(issuerSigned);
  const nsMap = doc.get('nameSpaces');
  const auth = doc.get('issuerAuth');
  console.log('🔍 Self-check:');
  console.log(`   namespaces : ${nsMap.size}`);
  for (const [ns, arr] of nsMap) console.log(`     • ${ns} (${arr.length} fields)`);
  console.log(`   issuerAuth : COSE_Sign1 array, ${auth.length} items`);
  console.log(`   signature  : ${auth[3].__b.length} bytes`);

  // decode protected header and verify alg === ES256 (-7)
  const phDecoded = decodeCbor(auth[0].__b);
  const phAlg = [...phDecoded.entries()][0]?.[1];
  console.log(`   alg header : ${phAlg} ${phAlg === ES256 ? '✓ (ES256)' : '✗ WRONG'}`);

  // decode MSO payload and verify device key COSE labels
  // payload = bstr( #6.24( bstr(MSO) ) )
  const msoOuter = decodeCbor(auth[2].__b);      // { __tag: 24, v: { __b: msoBytes } }
  const innerMso = decodeCbor(msoOuter.v.__b);    // the actual MSO map
  const dki = innerMso.get('deviceKeyInfo');
  const deviceKey = dki.get('deviceKey');
  const kty = deviceKey.get(COSE_KEY_KTY);
  const crv = deviceKey.get(COSE_KEY_CRV);
  console.log(`   device key : kty=${kty} ${kty === COSE_KEY_EC2 ? '✓' : '✗'}, crv=${crv} ${crv === COSE_KEY_P256 ? '✓' : '✗'}`);
  console.log(`   docType    : ${innerMso.get('docType')}`);
  console.log(`   digestAlg  : ${innerMso.get('digestAlgorithm')}`);

  // verify ES256 signature against the MSO payload
  const ok = crypto.verify('sha256', sigStructure, {
    key: signerKey,
    dsaEncoding: 'ieee-p1363',
  }, signature);
  console.log(`   ES256 sig  : ${ok ? '✓ VERIFIED' : '✗ INVALID'}`);
  console.log('   ✓ structure decodes cleanly\n');
} catch (e) {
  console.log('⚠️  self-check error:', e.message, '\n');
}

console.log('══════════════════════════════════════════════════════════════\n');
