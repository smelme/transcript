import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as cbor2 from 'cbor2';
import { generateNonce, generateJWK, processCredentials } from 'id-verifier';
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

/**
 * A date claim as `YYYY-MM-DD`, whichever shape the decoder produced.
 *
 * ISO 18013-5 full-dates (CBOR tag 1004) arrive from a decoded credential as a `Date`, a plain
 * string, or our own decoder's `{ type: 'date', tag, value }` wrapper, depending on the library
 * and its version. The API's contract is a date string, so normalise at this boundary instead of
 * letting a `Date` reach consumers that would serialise it as a full timestamp.
 */
function toDateString(value) {
  if (value == null) {return null;}
  if (typeof value === 'string') {return value;}
  if (value instanceof Date) {return value.toISOString().slice(0, 10);}
  if (typeof value === 'object' && value.value != null) {return toDateString(value.value);}
  return String(value);
}

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
  for (let i = 0; i < hex.length; i += 2) {bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);}
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
    for (const field of fields) {nameSpaces[namespace][field] = true;}
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
    if (!relyingPartyId || !origin) {throw new Error('relyingPartyId and origin are required');}
    let parsedOrigin;
    try { parsedOrigin = new URL(origin); } catch { throw new Error('origin must be an absolute URL'); }
    if (!['https:', 'http:'].includes(parsedOrigin.protocol)) {throw new Error('origin must use HTTP or HTTPS');}

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
    if (!session) {throw new Error('Presentation session is invalid, expired, or already used');}
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
    // Awaited: a status failure must reject the presentation, not escape as an
    // unhandled rejection while verification carries on.
    await this.enforceCredentialStatus(
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
        graduationDate: toDateString(claims.graduation_date),
        // A transcript carries the study rather than an award, so a registrar reads these.
        // Reported as null when absent rather than invented: a transcript credential holds
        // no qualification namespace, and a qualification holds no course list.
        studentId: claims.student_id || null,
        totalCredits: claims.total_credits ?? null,
        creditsAttempted: claims.credits_attempted ?? null,
        creditsEarned: claims.credits_earned ?? null,
        completionStatus: claims.status || null,
        outcome: claims.outcome || null,
        // Programme context, each with the scheme that defines it.
        programmeTitle: claims.programme_title || null,
        programmeCode: claims.programme_code || null,
        programmeCodeScheme: claims.programme_code_scheme || null,
        programmeLevel: claims.programme_level || null,
        programmeLevelFramework: claims.programme_level_framework || null,
        awardTitle: claims.award_title || null,
        // When the study happened: a registrar places a record by its period as much as by its marks.
        enrolmentStart: toDateString(claims.enrolment_start),
        enrolmentEnd: toDateString(claims.enrolment_end),
        // The average and the scale it is on, never one without the other.
        gpa: claims.overall_mark ?? null,
        gpaScaleId: claims.overall_mark_scale_id || null,
        gpaScaleMaximum: claims.grading_scale_maximum ?? null,
        courses: claims.courses || null,
        // Recognition details, when the credential was issued with them: how the institution
        // is identified outside its own name, in which language the study was taught, and who
        // attested the document. Null rather than guessed when absent.
        institutionId: claims.institution_id || null,
        institutionIdScheme: claims.institution_id_scheme || null,
        institutionRor: claims.institution_ror || null,
        institutionNameAlt: claims.institution_name_alt || null,
        programmeTitleAlt: claims.programme_title_alt || null,
        languageOfInstruction: claims.language_of_instruction || null,
        transcriptType: claims.transcript_type || null,
        attestingOffice: claims.attesting_office || null,
        attestingCapacity: claims.attesting_capacity || null,
      },
      // Full disclosed element values (flattened, keyed by element identifier)
      // so callers such as the issuer's "share" flow can persist every
      // selectively-disclosed field, not just the academic subset above.
      allClaims: claims,
    };
  }

  /**
   * Reject a presented credential unless its status is known to be valid.
   *
   * The status comes from the reference inside the credential's own signed MSO
   * (`status` -> `status_list` -> `{ idx, uri }`), which every presentation
   * carries because the MSO is not subject to selective disclosure.
   *
   * There is deliberately no fallback and no other source. A credential that
   * carries no reference cannot have its revocation status established, and
   * accepting it anyway would defeat revocation entirely, so it is refused
   * however the issuer's own records describe it. Credentials issued before this
   * issuer published a status list must be re-issued before they can be
   * presented.
   */
  async enforceCredentialStatus(documents = []) {
    const noReference = new Error(
      'Credential does not reference a status list, so its revocation status cannot be checked',
    );
    if (!documents.length) {throw noReference;}

    for (const document of documents) {
      const status = extractMsoStatus(document);
      if (!status) {throw noReference;}
      const bit = await this.statusList.statusAt(
        status.uri,
        status.idx,
        issuerPublicKeyFrom(document),
      );
      if (bit !== STATUS_VALID) {throw new Error('Credential is revoked');}
    }
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
    for (const [id, session] of this.sessions) {if (session.expiresAtMs <= this.now()) {this.sessions.delete(id);}}
  }
}