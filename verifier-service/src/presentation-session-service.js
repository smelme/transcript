import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as cbor2 from 'cbor2';
import { generateNonce, generateJWK, processCredentials } from 'id-verifier';
import { getDb } from '../../db.js';
import { ReaderAuthService } from './reader-auth.js';
import {
  StatusListClient,
  extractMsoStatus,
  extractLeafCertificateDer,
  issuerPublicKeyFrom,
} from './status-list.js';
import { STATUS_VALID } from '../../status-list-core.js';

/**
 * Ephemeral state for one W3C Digital Credentials API (org-iso-mdoc)
 * presentation. The service intentionally retains no claim values or credential
 * bytes — only the one-time nonce and the reader's ephemeral decryption key.
 *
 * Request/response construction mirrors the `id-verifier` package used by the
 * Smart College verifier so the wallet-facing wire format stays interoperable.
 */

const ACADEMIC_DOC_TYPE = 'org.iso.23220.photoid.1';

// Requested namespaces → data-element identifiers. The wallet MUST filter the
// returned IssuerSigned fields to exactly these identifiers.
const ACADEMIC_NAME_SPACES = {
  'org.iso.23220.photoid.1': ['given_name', 'family_name'],
  'org.iso.23220.education.qualification.1': [
    'institution_name',
    'degree_level',
    'graduation_date',
  ],
};

// Optional pinned issuer trust. Comma-separated hex SHA-256 fingerprints of the
// DER-encoded issuer certificates that are allowed to sign academic
// credentials. When configured, a presented credential is rejected unless its
// IssuerAuth leaf certificate matches one of the pins (fail-closed). When left
// unset, trust falls back to the trusted-issuer-registry shipped with
// `id-verifier`, exactly like the Smart College verifier.
const PINNED_ISSUER_SHA256 = (process.env.TRUSTED_ACADEMIC_ISSUER_SHA256 || '')
  .split(',')
  .map((fingerprint) => fingerprint.trim().toLowerCase())
  .filter(Boolean);

// ─────────────────────────────────────────────────────────────────────────────
// Wire-format helpers (copied from id-verifier so both sides agree byte-for-byte)
// ─────────────────────────────────────────────────────────────────────────────

const bufferToBase64Url = (input) => {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return bytes.toString('base64url');
};

const hexToUint8Array = (hex) => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
};

const base64urlToUint8Array = (value) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  return new Uint8Array(Buffer.from(base64 + pad, 'base64'));
};

// EC P-256 only, matching id-verifier's jwkToCoseKey.
const jwkToCoseKey = (jwk) => {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') {
    throw new Error('Only EC P-256 reader keys are supported');
  }
  const coseKey = new Map();
  coseKey.set(1, 2); // kty: EC2
  coseKey.set(-1, 1); // crv: P-256
  coseKey.set(-2, base64urlToUint8Array(jwk.x));
  coseKey.set(-3, base64urlToUint8Array(jwk.y));
  return coseKey;
};

// Mirrors id-verifier's MDOCProtocolHelper._createDeviceRequest for the
// academic namespaces, including the required DeviceRequestInfo use-case.
// `requestedNameSpaces` is `{ namespace: [field, ...] }`; defaults to the
// academic set (used by the interactive verifier flow).
function buildItemsRequestBytes(requestedNameSpaces, docType) {
  const source = requestedNameSpaces || ACADEMIC_NAME_SPACES;
  const nameSpaces = {};
  for (const [namespace, fields] of Object.entries(source)) {
    nameSpaces[namespace] = {};
    for (const field of fields) nameSpaces[namespace][field] = true;
  }
  return cbor2.encode({ docType: docType || ACADEMIC_DOC_TYPE, nameSpaces });
}

function createMdocDeviceRequest(itemsRequestBytes, readerAuthAll = []) {
  const docRequests = [{
    itemsRequest: new cbor2.Tag(24, itemsRequestBytes),
  }];
  const documentSets = [[0]];

  const deviceRequestInfo = new cbor2.Tag(24, cbor2.encode({
    useCases: [{ mandatory: true, documentSets }],
  }));

  return bufferToBase64Url(cbor2.encode({
    version: '1.1',
    docRequests,
    readerAuthAll,
    deviceRequestInfo,
  }));
}

// Mirrors id-verifier's MDOCProtocolHelper._createEncryptionInfo.
function createEncryptionInfo(nonceHex, jwk) {
  const encryptionInfo = cbor2.encode([
    'dcapi',
    { nonce: hexToUint8Array(nonceHex), recipientPublicKey: jwkToCoseKey(jwk) },
  ]);
  return bufferToBase64Url(encryptionInfo);
}

// Mirrors id-verifier's MDOCProtocolHelper._generateSessionTranscript for the
// W3C Digital Credentials API (dcapi) transport. The wallet derives the exact
// same value from the encryptionInfo it receives; that shared value is what
// binds a reader's signature to this one-time session.
function buildSessionTranscript(origin, nonceHex, jwk) {
  const encryptionInfo = createEncryptionInfo(nonceHex, jwk);
  const dcapiInfo = cbor2.encode([encryptionInfo, origin]);
  const hash = crypto.createHash('sha256').update(dcapiInfo).digest();
  const handover = ['dcapi', new Uint8Array(hash)];
  return new Uint8Array(cbor2.encode([null, null, handover]));
}

/** Collapse whitespace so a name typed with double spaces still matches. */
const normalizeName = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

/**
 * Registry entries whose stored claim values match the disclosed ones.
 *
 * Used only to enforce revocation when presentment carries no credential id, so
 * it is deliberately conservative: a match can only ever cause a rejection, and
 * never an acceptance that the signature and trust checks would not already
 * allow. The name is required (without it every credential of an institution
 * would match); the qualification elements narrow it down when disclosed.
 */
function findRegistryMatches(claims = {}) {
  const name = normalizeName([claims.given_name, claims.family_name].filter(Boolean).join(' '));
  if (!name) return [];

  const institution = claims.institution_name || null;
  const degreeLevel = claims.degree_level || null;
  const graduationDate = claims.graduation_date || null;

  let rows;
  try {
    rows = getDb().prepare('SELECT credential_id, status, metadata_json FROM credentials').all();
  } catch (e) {
    console.warn('[presentation] could not read the credential registry:', e.message);
    return [];
  }

  return rows.filter((row) => {
    let metadata;
    try {
      metadata = JSON.parse(row.metadata_json || '{}');
    } catch {
      return false;
    }
    if (normalizeName(metadata.full_name) !== name) return false;
    const qualification = metadata.education_qualification || {};
    if (institution && qualification.institution_name !== institution) return false;
    if (degreeLevel && qualification.degree_level !== degreeLevel) return false;
    if (graduationDate && qualification.graduation_date !== graduationDate) return false;
    return true;
  });
}

export class PresentationSessionService {
  constructor({ ttlMs = 5 * 60 * 1000, now = () => Date.now(), dataDir, statusListFetch } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.sessions = new Map();
    // Authenticates this verifier's requests to the wallet.
    this.readerAuth = new ReaderAuthService({ dataDir });
    // Resolves revocation from a credential's signed MSO (see status-list.js).
    this.statusList = new StatusListClient({ fetchImpl: statusListFetch ?? globalThis.fetch, now });
  }

  /** The reader key a wallet can pin, so it can show who is asking. */
  async readerKeyInfo() {
    return this.readerAuth.describe();
  }

  async create({ relyingPartyId, origin, nameSpaces, docType, credentialId }) {
    if (!relyingPartyId || !origin) throw new Error('relyingPartyId and origin are required');
    let parsedOrigin;
    try { parsedOrigin = new URL(origin); } catch { throw new Error('origin must be an absolute URL'); }
    if (!['https:', 'http:'].includes(parsedOrigin.protocol)) throw new Error('origin must use HTTP or HTTPS');

    this.pruneExpired();
    const nonce = generateNonce(); // 128-bit entropy, hex string
    const jwk = await generateJWK(); // EC P-256 private JWK (includes x/y for the reader key)
    const sessionId = uuidv4();
    const expiresAtMs = this.now() + this.ttlMs;

    // The reader authenticates the exact request it is making: the signature
    // covers this one-time session transcript and the ItemsRequest bytes.
    const sessionTranscript = buildSessionTranscript(parsedOrigin.origin, nonce, jwk);
    const itemsRequestBytes = buildItemsRequestBytes(nameSpaces, docType);
    const readerAuthAll = await this.readerAuth.createReaderAuth({
      sessionTranscriptBytes: sessionTranscript,
      itemsRequestBytes,
    });

    const request = {
      mediation: 'required',
      digital: {
        requests: [{
          protocol: 'org-iso-mdoc',
          data: {
            deviceRequest: createMdocDeviceRequest(itemsRequestBytes, readerAuthAll),
            encryptionInfo: createEncryptionInfo(nonce, jwk),
          },
        }],
      },
    };
    this.sessions.set(sessionId, {
      relyingPartyId,
      origin: parsedOrigin.origin,
      nonce,
      jwk,
      expiresAtMs,
      credentialId: credentialId || null,
      readerKid: await this.readerAuth.kid(),
    });
    return {
      sessionId,
      expiresAt: new Date(expiresAtMs).toISOString(),
      reader: await this.readerAuth.describe(),
      request,
    };
  }

  consume(sessionId, { relyingPartyId, origin }) {
    this.pruneExpired();
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Presentation session is invalid, expired, or already used');
    this.sessions.delete(sessionId);
    if (session.relyingPartyId !== relyingPartyId || session.origin !== origin) {
      throw new Error('Presentation session does not belong to this relying party');
    }
    return session;
  }

  /**
   * Decrypt and verify an org-iso-mdoc response using id-verifier, then return
   * only the server-verified academic claims. The session is consumed before
   * decryption so malformed or failing responses cannot be replayed.
   */
  async verify(sessionId, { relyingPartyId, origin, credential }) {
    const session = this.consume(sessionId, { relyingPartyId, origin });
    if (!credential || credential.protocol !== 'org-iso-mdoc' || !credential.data) {
      throw new Error('A valid org-iso-mdoc credential response is required');
    }

    // The browser DCAPI surfaces `credential.data` as an object with a
    // base64url `response`; the wallet's direct HTTP submission sends the
    // base64url response string itself. Normalise both to the DCAPI shape.
    const credentialForVerifier =
      typeof credential.data === 'string'
        ? { ...credential, data: { response: credential.data } }
        : credential;

    const result = await processCredentials(credentialForVerifier, {
      nonce: session.nonce,
      jwk: session.jwk,
      origin: session.origin,
    });

    if (!result.valid) {
      const reasons = (result.processedDocuments || [])
        .flatMap((document) => document.invalidReasons || []);
      throw new Error(`Credential response failed verification${reasons.length ? `: ${reasons.join('; ')}` : ''}`);
    }

    this.enforcePinnedIssuer(result);
    const claims = result.claims || {};
    await this.enforceCredentialStatus(
      session,
      claims,
      (result.processedDocuments || []).map((processed) => processed.document),
    );

    const givenName = claims.given_name || claims.given_name_unicode || '';
    const familyName = claims.family_name || claims.family_name_unicode || '';
    return {
      status: 'verified',
      claims: {
        name: [givenName, familyName].filter(Boolean).join(' '),
        institution: claims.institution_name || null,
        degreeLevel: claims.degree_level || null,
        graduationDate: claims.graduation_date || null,
      },
      // Full disclosed element values (flattened, keyed by element identifier)
      // so callers such as the issuer's "share" flow can persist every
      // selectively-disclosed field, not just the academic subset above.
      allClaims: claims,
    };
  }

  /**
   * Reject a presented credential whose status is not valid.
   *
   * Three ways the credential can be identified, in order of preference:
   *   1. the status reference inside the signed MSO (`status.status_list`), which
   *      is claim-free and is what ISO/IEC 18013-5 provides for exactly this;
   *   2. the credential id a share session was minted against;
   *   3. the disclosed claims, as a fallback for credentials issued before status
   *      lists existed.
   *
   * A credential matching nothing in the registry is accepted with a warning
   * rather than rejected - that is how a credential from another issuer is
   * treated. Configure TRUSTED_ACADEMIC_ISSUER_SHA256 to reject unknown issuers.
   */
  async enforceCredentialStatus(session, claims = {}, documents = []) {
    for (const document of documents) {
      const status = extractMsoStatus(document);
      if (!status) continue;
      const bit = await this.statusList.statusAt(
        status.uri,
        status.idx,
        issuerPublicKeyFrom(document),
      );
      if (bit !== STATUS_VALID) throw new Error('Credential is revoked');
      return;
    }

    if (session.credentialId) {
      const row = getDb()
        .prepare('SELECT status FROM credentials WHERE credential_id = ?')
        .get(session.credentialId);
      if (!row) throw new Error('Credential does not exist in the issuer registry');
      if (row.status !== 'active') throw new Error(`Credential is ${row.status}`);
      return;
    }

    const matches = findRegistryMatches(claims);
    if (matches.length === 0) {
      console.warn(
        '[presentation] presented credential matches no entry in the issuer registry - revocation could not be checked',
      );
      return;
    }
    // The registry only holds the elements this request discloses, so more than
    // one entry can match. Reject when any candidate is not active: for
    // revocation checks, failing closed is the only safe direction.
    const notActive = matches.find((row) => row.status !== 'active');
    if (notActive) throw new Error(`Credential is ${notActive.status}`);
  }

  enforcePinnedIssuer(result) {
    if (PINNED_ISSUER_SHA256.length === 0) {
      if (result.trusted === false) {
        // Same behavior as the Smart College verifier: cryptography is valid but
        // the issuer is not present in the trusted-issuer-registry. This is a
        // non-fatal warning here; configure TRUSTED_ACADEMIC_ISSUER_SHA256 to
        // fail closed against a pinned academic issuer certificate.
        console.warn('[presentation] valid response from an issuer that is not in the trusted-issuer-registry');
      }
      return;
    }
    const presented = (result.processedDocuments || [])
      .map((document) => extractLeafCertificateDer(document.document))
      .filter(Boolean);
    const matches = presented.map((der) => crypto.createHash('sha256').update(der).digest('hex'));
    if (presented.length === 0 || !matches.some((fingerprint) => PINNED_ISSUER_SHA256.includes(fingerprint))) {
      throw new Error('Presented issuer certificate is not in the pinned trusted issuer list');
    }
  }

  pruneExpired() {
    for (const [id, session] of this.sessions) if (session.expiresAtMs <= this.now()) this.sessions.delete(id);
  }
}