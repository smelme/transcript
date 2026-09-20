import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  Cbor,
  fullDate,
  generateIssuerSigned,
  isValidDevicePublicJwk,
  verifyCwt,
  verifyIssuerSigned,
} from '../../mdoc-core.js';
import { WalletAccountService } from './wallet-account-service.js';
import { ShareService } from './share-service.js';
import { AdminAuthService } from './admin-auth.js';
import { ClientOrgService } from './client-orgs.js';
import {
  generateAcademicRecord,
  PHOTOID_DOCTYPE,
  generateStudentItems,
  kindOfCredentialData,
  labelOfCredentialData,
  academicNamespacesOf,
  todayIso,
} from './credential-generator.js';
import * as emailService from './email-service.js';
import { getDb } from '../../db.js';
import {
  packStatusList,
  encodeStatusListPayload,
  signStatusListJws,
  STATUS_VALID,
  STATUS_INVALID,
} from '../../status-list-core.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});

// Published status list. Each credential carries its index into this list inside
// its signed MSO (`status` -> `status_list`), which lets a verifier resolve
// revocation without the presentation disclosing any claim. The base URL must be
// reachable by verifiers (e.g. https://api.quals.example in production).
const STATUS_LIST_ID = process.env.STATUS_LIST_ID || 'quals-1';
const STATUS_LIST_BASE_URL = (
  process.env.STATUS_LIST_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
).replace(/\/+$/, '');

// Credential metadata is persisted in the shared SQLite database (see db.js);
// mdoc payloads stay in memory only.
class IssuerService {
  constructor(options = {}) {
    this.issuerId = options.issuerId || `issuer-${uuidv4()}`;
    this.issuerName = options.issuerName || 'Smart College';
    this.issuerDid = options.issuerDid || `did:example:${this.issuerId}`;
    this.credentials = new Map(); // credentialId -> credential metadata
    this.auditLog = [];
    this.statistics = {
      totalIssued: 0,
      totalRevoked: 0,
      totalVerified: 0,
      byStudent: {},
      byType: {},
    };
    this.revokedCredentials = new Set();

    // Shared database handle for credential metadata (NOT the mdoc bytes).
    this.db = getDb();

    // ISO 18013-5 mdoc signing material
    this.mdocSigner = this.loadMdocSigner(options);

    // mdoc payloads are held only in a short-lived in-memory session (NEVER persisted).
    // Credential metadata/status live in `this.credentials` (PostgreSQL in production).
    this.mdocSessionTtlMs = options.mdocSessionTtlMs
      || parseInt(process.env.MDOC_SESSION_TTL_MS || '0', 10)
      || parseInt(process.env.MDOC_SESSION_TTL_SECONDS || '0', 10) * 1000
      || 10 * 60 * 1000; // default: 10 minutes
    this.mdocSessions = new Map(); // credentialId -> { mdocBase64url, issuedAt, expiresAt }
    this.issuanceSessions = new Map(); // sessionId -> issuance session
    
    // Setup validation
    this.ajv = new Ajv();
    addFormats(this.ajv);
    
    // Academic Credential Schema
    this.validateCredentialRequest = this.ajv.compile({
      type: 'object',
      required: ['studentId', 'name', 'institution', 'courses'],
      properties: {
        studentId: { type: 'string', minLength: 1 },
        name: {
          type: 'object',
          required: ['givenName', 'familyName'],
          properties: {
            givenName: { type: 'string' },
            familyName: { type: 'string' },
          },
        },
        institution: { type: 'string' },
        courses: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['courseCode', 'courseName', 'credits'],
            properties: {
              courseCode: { type: 'string' },
              courseName: { type: 'string' },
              credits: { type: 'number', minimum: 0, maximum: 999 },
            },
          },
        },
        dateOfBirth: { type: 'string', format: 'date' },
        degreeLevel: { type: 'string', enum: ['associate', 'bachelor', 'master', 'doctorate'] },
        fieldOfStudy: { type: 'string' },
        gpa: { type: 'number', minimum: 0, maximum: 4.0 },
        achievements: { type: 'array', items: { type: 'string' } },
        issuanceDate: { type: 'string', format: 'date' },
        expiryDate: { type: 'string', format: 'date' },
      },
    });

    // Photo ID Credential Schema (ISO 23220)
    this.validatePhotoIDRequest = this.ajv.compile({
      type: 'object',
      required: ['docType', 'full_name', 'date_of_birth', 'document_number', 'issuing_authority', 'issue_date', 'expiry_date'],
      properties: {
        docType: { type: 'string', const: PHOTOID_DOCTYPE },
        full_name: { type: 'string' },
        date_of_birth: { type: 'string', format: 'date' },
        document_number: { type: 'string' },
        issuing_authority: { type: 'string' },
        issue_date: { type: 'string', format: 'date' },
        expiry_date: { type: 'string', format: 'date' },
        issuing_country: { type: 'string' },
        portrait: { type: 'string' },
        education_qualification: {
          type: 'object',
          properties: {
            institution_name: { type: 'string' },
            degree_level: { type: 'string' },
            field_of_study: { type: 'string' },
            graduation_date: { type: 'string', format: 'date' },
            gpa: { type: 'number' },
          },
        },
        education_transcript: {
          type: 'object',
          properties: {
            student_id: { type: 'string' },
            courses: { type: 'array' },
            total_credits: { type: 'number' },
            status: { type: 'string' },
          },
        },
        device_key: {
          type: 'object',
          properties: {
            kty: { type: 'string' },
            crv: { type: 'string' },
            x: { type: 'string' },
            y: { type: 'string' },
          },
        },
        // Set from the calling client organisation's API key, never from the body.
        institution: { type: 'string' },
      },
    });

    this.loadPersistedCredentials();
  }

  // ── Persistence (credential metadata; the mdoc bytes are NEVER stored) ──
  loadPersistedCredentials() {
    try {
      const rows = this.db.prepare('SELECT * FROM credentials').all();
      for (const row of rows) {
        // Revoked credentials are loaded as well as tracked: the portal lists them
        // (carrying status 'revoked') so an organisation keeps the full history of
        // what it issued rather than watching revoked rows disappear on restart.
        if (row.status === 'revoked') {this.revokedCredentials.add(row.credential_id);}
        let credential = null;
        if (row.metadata_json) {
          try { credential = JSON.parse(row.metadata_json); } catch { credential = null; }
        }
        if (!credential) {
          credential = {
            credentialId: row.credential_id,
            issuerId: row.issuer_id || this.issuerId,
            issuerName: this.issuerName,
            docType: row.doc_type,
            institution: row.institution,
            studentId: row.student_id,
            credentialType: 'PhotoID',
            status: row.status,
            deviceBound: !!row.device_bound,
            createdAt: row.created_at,
          };
        }
        credential.status = row.status;
        this.credentials.set(row.credential_id, credential);
      }
    } catch (e) {
      console.error('[issuer] failed to load persisted credentials:', e.message);
    }
  }

  /** URI of the status list this issuer publishes (referenced from each MSO). */
  statusListUri() {
    return `${STATUS_LIST_BASE_URL}/status-list/${STATUS_LIST_ID}`;
  }

  /** Next free index in the published status list. Gaps are harmless. */
  _allocateStatusIndex() {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(status_index), 0) + 1 AS next FROM credentials')
      .get();
    return row.next;
  }

  _persistCredential(credential) {
    try {
      this.db.prepare(`
        INSERT INTO credentials
          (credential_id, issuer_id, doc_type, institution, student_id, status, device_bound, created_at, metadata_json, status_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(credential_id) DO UPDATE SET
          status = excluded.status,
          metadata_json = excluded.metadata_json
      `).run(
        credential.credentialId,
        credential.issuerId || this.issuerId,
        credential.docType || null,
        credential.institution || null,
        credential.studentId || null,
        credential.status || 'active',
        credential.deviceBound ? 1 : 0,
        credential.createdAt || new Date().toISOString(),
        JSON.stringify(credential),
        credential.statusIndex ?? null,
      );
    } catch (e) {
      console.error('[issuer] failed to persist credential:', e.message);
    }
  }

  _markCredentialRevoked(credentialId, reason) {
    try {
      this.db.prepare(`
        UPDATE credentials SET status = 'revoked', revoked_at = ?, revoke_reason = ?
        WHERE credential_id = ?
      `).run(new Date().toISOString(), reason || null, credentialId);
    } catch (e) {
      console.error('[issuer] failed to mark credential revoked:', e.message);
    }
  }

  // Load ISO 18013-5 mdoc signing key and certificate (managed by key-management)
  loadMdocSigner(options = {}) {
    try {
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const keyPath = options.signerKeyPath
        || process.env.MDOC_SIGNER_KEY_PATH
        || path.resolve(dir, '../../key-management/keys/mdoc-signer.private.pem');
      const certPath = options.signerCertPath
        || process.env.MDOC_SIGNER_CERT_PATH
        || path.resolve(dir, '../../key-management/keys/mdoc-signer.cert.der');
      return {
        signerKeyPem: fs.readFileSync(keyPath, 'utf8'),
        certDer: fs.readFileSync(certPath),
      };
    } catch (e) {
      console.warn('[issuer] mdoc signing keys not found. Mdoc issuance disabled:', e.message);
      return null;
    }
  }

  /**
   * Build and sign an ISO 18013-5 IssuerSigned mdoc for a credential.
   *
   * Both kinds are issued under the same docType (a photo-ID document carrying the
   * holder's personal components); the academic namespace present in the record decides
   * whether it is a qualification, a transcript, or one combined academic credential.
   * `deviceJwk` (optional) is the holder's EC P-256 public JWK; when provided it is
   * embedded in the MSO deviceKeyInfo as the device's mdoc authentication key.
   *
   * Returns null when the docType is unknown or the record carries no claims at all,
   * which the caller must treat as a failure rather than issuing a credential that
   * cannot be presented.
   */
  buildCredentialMdoc(credentialData, deviceJwk = null, statusIndex = null) {
    const docType = credentialData.docType || PHOTOID_DOCTYPE;
    if (docType !== PHOTOID_DOCTYPE) {return null;}

    const namespaces = {};
    const fullName = (credentialData.full_name || '').trim();
    const parts = fullName.split(/\s+/);
    const givenName = parts[0] || '';
    const familyName = parts.slice(1).join(' ');

    const photoId = [];
    if (givenName) {photoId.push(['given_name', new Cbor().tstr(givenName).encode()]);}
    if (familyName) {photoId.push(['family_name', new Cbor().tstr(familyName).encode()]);}
    if (credentialData.date_of_birth) {photoId.push(['birth_date', fullDate(credentialData.date_of_birth)]);}
    if (credentialData.document_number) {photoId.push(['document_number', new Cbor().tstr(credentialData.document_number).encode()]);}
    if (credentialData.issuing_authority) {photoId.push(['issuing_authority', new Cbor().tstr(credentialData.issuing_authority).encode()]);}
    if (credentialData.issuing_country) {photoId.push(['issuing_country', new Cbor().tstr(credentialData.issuing_country).encode()]);}
    if (credentialData.issue_date) {photoId.push(['issue_date', fullDate(credentialData.issue_date)]);}
    if (credentialData.expiry_date) {photoId.push(['expiry_date', fullDate(credentialData.expiry_date)]);}
    if (credentialData.portrait) {
      try {
        photoId.push(['portrait', new Cbor().bstr(Buffer.from(credentialData.portrait, 'base64')).encode()]);
      } catch (e) { /* ignore invalid portrait */ }
    }
    if (photoId.length) {
      namespaces['org.iso.23220.photoid.1'] = photoId;
    }

    const eq = credentialData.education_qualification || {};
    const qual = [];
    pushElements(qual, [
      ['institution_name', eq.institution_name],
      ['degree_level', eq.degree_level],
      ['field_of_study', eq.field_of_study],
      ['graduation_date', eq.graduation_date, 'date'],
      ['gpa', numberOrNull(eq.gpa), 'number'],
      // The scale the average is on travels beside it, so it is never read as a mark out of
      // ten or as a percentage.
      ['gpa_scale_id', eq.gpa_scale_id],
      ['gpa_scale_maximum', numberOrNull(eq.gpa_scale_maximum), 'number'],
      // Recognition details (Tier 2), present only when the caller asked for them.
      ['institution_id', eq.institution_id],
      ['institution_id_scheme', eq.institution_id_scheme],
      ['institution_ror', eq.institution_ror],
      ['institution_name_alt', eq.institution_name_alt],
      ['language_of_instruction', eq.language_of_instruction],
      ['field_of_study_alt', eq.field_of_study_alt],
    ]);
    if (qual.length) {
      namespaces['org.iso.23220.education.qualification.1'] = qual;
    }

    // The transcript: what was studied, scheme-qualified throughout, plus the aggregates as
    // their own elements - the course list is one element, so anything a reader may want
    // without the marks cannot live inside it.
    const tr = credentialData.education_transcript || {};
    const transcript = [];
    pushElements(transcript, [
      ['institution_name', tr.institution_name],
      ['student_id', tr.student_id],
      ['programme_title', tr.programme_title],
      ['programme_type', tr.programme_type],
      ['programme_code', tr.programme_code],
      ['programme_code_scheme', tr.programme_code_scheme],
      ['programme_level', tr.programme_level],
      ['programme_level_framework', tr.programme_level_framework],
      ['award_title', tr.award_title],
      ['enrolment_start', tr.enrolment_start, 'date'],
      ['enrolment_end', tr.enrolment_end, 'date'],
      ['grading_scale_id', tr.grading_scale_id],
      ['grading_scale_label', tr.grading_scale_label],
      ['grading_scale_minimum', numberOrNull(tr.grading_scale_minimum), 'number'],
      ['grading_scale_maximum', numberOrNull(tr.grading_scale_maximum), 'number'],
      ['grading_scale_pass_mark', numberOrNull(tr.grading_scale_pass_mark), 'number'],
      ['credit_scheme', tr.credit_scheme],
      ['total_credits', numberOrNull(tr.total_credits), 'uint'],
      ['courses', Array.isArray(tr.courses) && tr.courses.length ? tr.courses : null, 'json'],
      ['outcome', tr.outcome],
      ['outcome_scheme', tr.outcome_scheme],
      ['overall_mark', numberOrNull(tr.overall_mark), 'number'],
      ['overall_mark_scale_id', tr.overall_mark_scale_id],
      ['credits_attempted', numberOrNull(tr.credits_attempted), 'uint'],
      ['credits_earned', numberOrNull(tr.credits_earned), 'uint'],
      // Recognition details (Tier 2): present only when the caller asked for them.
      ['institution_id', tr.institution_id],
      ['institution_id_scheme', tr.institution_id_scheme],
      ['institution_ror', tr.institution_ror],
      ['institution_erasmus_code', tr.institution_erasmus_code],
      ['institution_name_alt', tr.institution_name_alt],
      ['institution_name_alt_language', tr.institution_name_alt_language],
      ['programme_title_alt', tr.programme_title_alt],
      ['programme_title_alt_language', tr.programme_title_alt_language],
      ['language_of_instruction', tr.language_of_instruction],
      ['student_id_scheme', tr.student_id_scheme],
      // Kept for credentials issued before the outcome vocabulary existed.
      ['status', tr.status],
    ]);
    if (transcript.length) {
      namespaces['org.iso.23220.education.transcript.1'] = transcript;
    }

    // The US-practice supplement: the same study in a credit-hour reader's units, the figures
    // that reader computes, and the record's own standing as a document.
    const ar = credentialData.education_academic_record || {};
    const academicRecord = [];
    pushElements(academicRecord, [
      ['credit_hours_scheme', ar.credit_hours_scheme],
      ['credit_hours_attempted', numberOrNull(ar.credit_hours_attempted), 'uint'],
      ['credit_hours_earned', numberOrNull(ar.credit_hours_earned), 'uint'],
      ['credit_hours_for_average', numberOrNull(ar.credit_hours_for_average), 'uint'],
      ['average_cumulative', numberOrNull(ar.average_cumulative), 'number'],
      ['average_weighting', ar.average_weighting],
      ['average_range_minimum', numberOrNull(ar.average_range_minimum), 'number'],
      ['average_range_maximum', numberOrNull(ar.average_range_maximum), 'number'],
      ['quality_points', numberOrNull(ar.quality_points), 'number'],
      ['document_type', ar.document_type],
      ['document_id', ar.document_id],
      ['document_issued_at', ar.document_issued_at, 'date'],
      ['document_status', ar.document_status],
      ['document_completeness', ar.document_completeness],
      // Recognition details (Tier 2): which document this is and who attested it.
      ['transcript_type', ar.transcript_type],
      ['document_version', ar.document_version],
      ['attesting_office', ar.attesting_office],
      ['attesting_capacity', ar.attesting_capacity],
    ]);
    if (academicRecord.length) {
      namespaces['org.iso.23220.education.academic-record.1'] = academicRecord;
    }

    if (!Object.keys(namespaces).length) {return null;}

    return generateIssuerSigned({
      docType,
      namespaces,
      signerKeyPem: this.mdocSigner.signerKeyPem,
      certDer: this.mdocSigner.certDer,
      deviceJwk,
      // Lets a verifier resolve this credential's status from the signed MSO
      // alone, without the presentation having to disclose any claim.
      status: statusIndex == null ? null : { idx: statusIndex, uri: this.statusListUri() },
    });
  }

  // Store the mdoc payload in the ephemeral in-memory session (never persisted)
  storeMdocSession(credentialId, mdocBase64url) {
    this.pruneExpiredMdocSessions();
    this.mdocSessions.set(credentialId, {
      mdocBase64url,
      issuedAt: Date.now(),
      expiresAt: Date.now() + this.mdocSessionTtlMs,
    });
  }

  // Retrieve an mdoc payload if its session has not timed out
  getMdocSession(credentialId) {
    this.pruneExpiredMdocSessions();
    const session = this.mdocSessions.get(credentialId);
    if (!session) {return null;}
    if (Date.now() > session.expiresAt) {
      this.mdocSessions.delete(credentialId);
      return null;
    }
    return session;
  }

  // Remove timed-out mdoc sessions
  pruneExpiredMdocSessions() {
    const now = Date.now();
    for (const [id, session] of this.mdocSessions) {
      if (now > session.expiresAt) {this.mdocSessions.delete(id);}
    }
  }

  issue(credentialData) {
    const credentialId = uuidv4();
    const now = new Date();
    
    // Determine credential type and validate accordingly
    let credential = null;
    let mdocBase64url = null;
    
    if (credentialData.docType === PHOTOID_DOCTYPE) {
      // A photo-ID-shaped credential: identity plus whichever academic namespace the
      // record holds, validated against the ISO 23220 shape and issued as a signed mdoc.
      if (!this.validatePhotoIDRequest(credentialData)) {
        return {
          success: false,
          error: `Credential validation failed: ${JSON.stringify(this.validatePhotoIDRequest.errors)}`,
        };
      }

      // Device-bound issuance: the wallet generates its mdoc authentication key
      // (EC P-256) and supplies the public JWK so the issuer embeds it in the
      // MSO's deviceKeyInfo. Absent a device_key we fall back to an ephemeral
      // (non-device-bound) key for backward compatibility.
      const deviceKeyJwk = credentialData.device_key || null;
      if (deviceKeyJwk && !isValidDevicePublicJwk(deviceKeyJwk)) {
        return {
          success: false,
          error: 'Invalid device_key: expected an EC P-256 public JWK { kty: "EC", crv: "P-256", x, y }',
        };
      }

      credential = {
        credentialId,
        issuerId: this.issuerId,
        issuerDid: this.issuerDid,
        issuerName: this.issuerName,
        // The client organisation that issued it; the scope for every portal view.
        institution: credentialData.institution,
        // Identifies the holder so a signed-in wallet can list its own
        // credentials; the transcript element is the usual place to find it.
        studentId: credentialData.studentId || credentialData.education_transcript?.student_id || null,
        docType: credentialData.docType,
        full_name: credentialData.full_name,
        date_of_birth: credentialData.date_of_birth,
        document_number: credentialData.document_number,
        issuing_authority: credentialData.issuing_authority,
        issue_date: credentialData.issue_date,
        expiry_date: credentialData.expiry_date,
        issuing_country: credentialData.issuing_country,
        portrait: credentialData.portrait,
        education_qualification: credentialData.education_qualification,
        education_transcript: credentialData.education_transcript,
        credentialType: 'PhotoID',
        // The academic namespace this credential holds decides its kind, which is what the
        // portal and the wallet label it by: both kinds share the photo-ID docType.
        kind: kindOfCredentialData(credentialData),
        status: 'active',
        signature: `sig_${uuidv4()}`,
        deviceKey: deviceKeyJwk,
        deviceBound: !!deviceKeyJwk,
        createdAt: now.toISOString(),
      };

      // Generate the ISO 18013-5 IssuerSigned mdoc for this credential kind. The mdoc
      // payload is held in-memory only (session store). Never persisted.
      //
      // A credential without an mdoc cannot be presented or status-checked, so a failure
      // here fails the request rather than returning a credential that is dead on arrival.
      if (!this.mdocSigner) {
        return {
          success: false,
          error: 'The mdoc signing key is not configured, so credentials cannot be issued',
        };
      }
      try {
        const statusIndex = this._allocateStatusIndex();
        credential.statusIndex = statusIndex;
        const mdoc = this.buildCredentialMdoc(credentialData, deviceKeyJwk, statusIndex);
        if (!mdoc) {
          return {
            success: false,
            error: `No claims to issue: a ${labelOfCredentialData(credentialData)} needs its own academic data`,
          };
        }
        mdocBase64url = mdoc.base64url;
        credential.mdocDocType = credentialData.docType;
        credential.hasMdoc = true;
        this.storeMdocSession(credentialId, mdoc.base64url);
      } catch (e) {
        console.error('[issuer] mdoc generation failed:', e.message);
        return { success: false, error: `Credential could not be signed: ${e.message}` };
      }
      
      // Track by name for Photo ID
      const nameKey = credentialData.full_name;
      this.statistics.byStudent[nameKey] = 
        (this.statistics.byStudent[nameKey] || 0) + 1;
      
    } else {
      // Academic credential validation (default)
      if (!this.validateCredentialRequest(credentialData)) {
        return {
          success: false,
          error: `Validation failed: ${JSON.stringify(this.validateCredentialRequest.errors)}`,
        };
      }
      
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 5); // 5-year expiry
      
      credential = {
        credentialId,
        issuerId: this.issuerId,
        issuerDid: this.issuerDid,
        issuerName: this.issuerName,
        studentId: credentialData.studentId,
        name: credentialData.name,
        institution: credentialData.institution,
        courses: credentialData.courses,
        credentialType: credentialData.credentialType || 'AcademicCredential',
        status: 'active',
        issuanceDate: credentialData.issuanceDate || now.toISOString(),
        expiryDate: credentialData.expiryDate || expiryDate.toISOString(),
        dateOfBirth: credentialData.dateOfBirth,
        degreeLevel: credentialData.degreeLevel,
        fieldOfStudy: credentialData.fieldOfStudy,
        gpa: credentialData.gpa,
        achievements: credentialData.achievements,
        signature: `sig_${uuidv4()}`,
        createdAt: now.toISOString(),
      };
      
      this.statistics.byStudent[credentialData.studentId] = 
        (this.statistics.byStudent[credentialData.studentId] || 0) + 1;
    }

    // Store credential (metadata persisted; mdoc payload stays in-memory only)
    this.credentials.set(credentialId, credential);
    this._persistCredential(credential);

    // Update statistics
    this.statistics.totalIssued++;
    this.statistics.byType[credential.credentialType] = 
      (this.statistics.byType[credential.credentialType] || 0) + 1;

    // Log audit
    this.auditLog.push({
      timestamp: now.toISOString(),
      action: 'credential_issued',
      credentialId,
      credentialType: credential.credentialType,
      studentId: credential.studentId,
      // The kind travels with the event, so the log is readable without a lookup and
      // without inferring it from a docType every kind shares.
      kind: credential.kind || 'credential',
      kindLabel: labelOfCredentialData(credential),
      details: { issued: true, docType: credential.docType || credential.credentialType },
    });

    return {
      success: true,
      credentialId,
      docType: credentialData.docType || PHOTOID_DOCTYPE,
      status: 'active',
      deviceKey: credential.deviceKey || null,
      deviceBound: credential.deviceBound || false,
      issuanceDate: credential.issuanceDate || credential.issue_date || now.toISOString(),
      expiryDate: credential.expiryDate || credential.expiry_date,
      mdocBase64url,
      mdocSessionTtlMs: this.mdocSessionTtlMs,
    };
  }

  // Retrieve the ISO 18013-5 IssuerSigned mdoc (base64url) for a credential
  getCredentialMdoc(credentialId) {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }
    const session = this.getMdocSession(credentialId);
    if (!session) {
      return { success: false, error: 'mdoc session expired. Re-issue the credential to retrieve the mdoc' };
    }
    const verification = verifyIssuerSigned(session.mdocBase64url);
    return {
      success: true,
      credentialId,
      docType: credential.mdocDocType || verification.docType,
      mdocBase64url: session.mdocBase64url,
      verification: {
        signatureValid: verification.signatureValid,
        digestsValid: verification.digestsValid,
        issuerCert: verification.issuerCert,
        validityInfo: verification.validityInfo,
        deviceKey: verification.deviceKey,
        namespaces: verification.namespaces,
      },
      deviceBound: credential.deviceBound || false,
    };
  }

  // ── Issuance sessions (invitation-driven, device-bound) ──────────────────
  //
  // An issuance session is created by the institute for a specific student
  // (studentId). It stays `pending` until the wallet proves. Via an access
  // token whose `sub` is linked to that studentId. That it belongs to the
  // same person. Only then is the credential issued.

  createIssuanceSession({
    studentId,
    institution,
    credentialData,
    feePence = 0,
    termsRequired = true,
    email = null,
    sub = null,
    display = null,
  }) {
    if (!studentId || !credentialData) {
      throw new Error('studentId and credentialData are required');
    }
    const fee = Number(feePence) || 0;
    const sessionId = uuidv4();
    const session = {
      sessionId,
      sub: sub || null,
      email: email ? String(email).trim().toLowerCase() : null,
      studentId: String(studentId),
      institution: String(institution || this.issuerId),
      credentialData,
      display: display || null,
      status: 'pending',
      termsRequired: !!termsRequired,
      termsVersion: '1.0',
      termsAcceptedAt: null,
      feePence: fee,
      paymentStatus: fee > 0 ? 'unpaid' : 'not_required',
      nonce: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    this.issuanceSessions.set(sessionId, session);
    this._persistIssuanceSession(session);
    return session;
  }

  _hydrateIssuanceSession(row) {
    return {
      sessionId: row.session_id,
      sub: row.sub,
      email: row.email,
      studentId: row.student_id,
      institution: row.institution,
      credentialData: JSON.parse(row.credential_data),
      display: row.display ? JSON.parse(row.display) : null,
      status: row.status,
      termsRequired: !!row.terms_required,
      termsVersion: '1.0',
      termsAcceptedAt: row.terms_accepted_at,
      feePence: 0,
      paymentStatus: 'not_required',
      nonce: row.nonce,
      credentialId: row.credential_id,
      createdAt: row.created_at,
    };
  }

  _persistIssuanceSession(session) {
    try {
      this.db.prepare(`
        INSERT INTO issuance_sessions
          (session_id, sub, email, student_id, institution, credential_data, display, status,
           terms_required, terms_accepted_at, nonce, credential_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = excluded.status,
          email = COALESCE(excluded.email, email),
          sub = COALESCE(excluded.sub, sub),
          terms_accepted_at = excluded.terms_accepted_at,
          credential_id = excluded.credential_id
      `).run(
        session.sessionId,
        session.sub || null,
        session.email || null,
        session.studentId,
        session.institution,
        JSON.stringify(session.credentialData),
        session.display ? JSON.stringify(session.display) : null,
        session.status || 'pending',
        session.termsRequired ? 1 : 0,
        session.termsAcceptedAt || null,
        session.nonce,
        session.credentialId || null,
        session.createdAt || new Date().toISOString(),
      );
    } catch (e) {
      console.error('[issuer] failed to persist issuance session:', e.message);
    }
  }

  /** Issuance sessions visible to a wallet (by subject, email, or institute link). */
  listIssuanceSessions({ sub = null, email = null, links = [] } = {}) {
    let rows;
    try {
      rows = this.db.prepare('SELECT * FROM issuance_sessions ORDER BY created_at DESC').all();
    } catch (e) {
      console.error('[issuer] issuance session list failed:', e.message);
      return [];
    }
    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
    const filterSession = (session) => {
      if (session.status === 'superseded') {return false;}
      if (sub && session.sub === sub) {return true;}
      if (normalizedEmail && session.email === normalizedEmail) {return true;}
      return links.some(
        (l) => l.institution === session.institution && l.studentId === session.studentId,
      );
    };
    return rows.map((row) => this._hydrateIssuanceSession(row)).filter(filterSession);
  }

  /**
   * Every session this student already has for one academic namespace, pending before issued and
   * newest first. The caller decides whether any of them is what it would issue now: a prepared
   * credential from an older claim set must not be handed back as if it were current.
   */
  findIssuanceSessionsFor({ studentId, institution, academicNamespace }) {
    if (!studentId || !academicNamespace) {return [];}
    let rows;
    try {
      rows = this.db
        .prepare(
          `SELECT * FROM issuance_sessions
            WHERE student_id = ? AND institution = ? AND status != 'superseded'
            ORDER BY (status = 'pending') DESC, created_at DESC`,
        )
        .all(String(studentId), String(institution));
    } catch (e) {
      console.error('[issuer] issuance session lookup by namespace failed:', e.message);
      return [];
    }
    return rows
      .map((row) => this._hydrateIssuanceSession(row))
      .filter((session) =>
        academicNamespacesOf(session.credentialData || {}).includes(academicNamespace),
      );
  }

  /**
   * Retire a prepared credential that is no longer what the issuer would produce, so a repeat
   * request yields one current credential rather than a stale one plus a fresh one. The holder
   * never claimed it, so nothing is taken away from them.
   */
  supersedeIssuanceSession(sessionId) {
    const session = this.getIssuanceSession(sessionId);
    if (!session || session.status !== 'pending') {return undefined;}
    session.status = 'superseded';
    session.supersededAt = new Date().toISOString();
    this._persistIssuanceSession(session);
    return session;
  }

  /** Attach an account to a session created before the holder signed in. */
  linkIssuanceSession(sessionId, { email = null, sub = null } = {}) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) {return undefined;}
    let changed = false;
    if (email && !session.email) {
      session.email = String(email).trim().toLowerCase();
      changed = true;
    }
    if (sub && !session.sub) {
      session.sub = sub;
      changed = true;
    }
    if (changed) {this._persistIssuanceSession(session);}
    return session;
  }

  acceptTerms(sessionId, version = null) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) {return { success: false, status: 404, error: 'Issuance session not found' };}
    session.termsAcceptedAt = new Date().toISOString();
    if (version) {session.termsVersion = String(version);}
    this._persistIssuanceSession(session);
    return { success: true, sessionId, termsAcceptedAt: session.termsAcceptedAt };
  }

  createCheckout(sessionId) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) {return { success: false, status: 404, error: 'Issuance session not found' };}
    if (session.feePence <= 0) {return { success: false, status: 400, error: 'No fee required' };}
    if (session.paymentStatus === 'paid') {return { success: false, status: 409, error: 'Already paid' };}
    session.paymentStatus = 'pending';
    return {
      success: true,
      sessionId,
      feePence: session.feePence,
      checkoutUrl: `${process.env.ISSUER_BASE_URL || 'https://issuer.smartcollege.example'}/checkout/${sessionId}`,
    };
  }

  confirmPayment(sessionId) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) {return { success: false, status: 404, error: 'Issuance session not found' };}
    session.paymentStatus = 'paid';
    session.paidAt = new Date().toISOString();
    return { success: true, sessionId, paymentStatus: 'paid' };
  }

  getIssuanceSession(sessionId) {
    const cached = this.issuanceSessions.get(sessionId);
    if (cached) {return cached;}
    // Fall back to the database so pending sessions survive a restart.
    try {
      const row = this.db
        .prepare('SELECT * FROM issuance_sessions WHERE session_id = ?')
        .get(sessionId);
      if (!row) {return undefined;}
      const session = this._hydrateIssuanceSession(row);
      this.issuanceSessions.set(sessionId, session);
      return session;
    } catch (e) {
      console.error('[issuer] issuance session lookup failed:', e.message);
      return undefined;
    }
  }

  // Issue a device-bound mdoc for an issuance session, of whatever kind it holds.
  //
  // A session that has already been claimed is refused unless the caller asks for a re-issue.
  // That is what stops a double tap or a replayed offer minting a second credential, while still
  // letting a holder who asks again be issued one - for another device, or to replace a credential
  // they no longer have. The copy they already hold is untouched: replacing it is an operation on
  // the status list, not a side effect of issuing another.
  issueForSession(session, deviceJwk, { allowReissue = false } = {}) {
    if (session.status === 'issued' && !allowReissue) {
      return { success: false, error: 'Issuance session already claimed' };
    }
    if (session.status === 'superseded') {
      return {
        success: false,
        error: 'This credential was replaced by a newer one. Open your latest invitation link',
      };
    }
    if (session.status === 'issued') {
      // Issuing again is issuing a document, and a document is dated the day it is issued rather
      // than the day the invitation behind it was prepared. Everything else is the same, so the
      // new copy says the same thing about the study as the one it replaces.
      session.credentialData = { ...session.credentialData, issue_date: todayIso() };
      session.reissuedAt = new Date().toISOString();
    }
    const docType = session.credentialData?.docType || PHOTOID_DOCTYPE;
    const statusIndex = this._allocateStatusIndex();
    const mdoc = this.buildCredentialMdoc(session.credentialData, deviceJwk, statusIndex);
    if (!mdoc) {return { success: false, error: `No claims to issue for ${docType}` };}

    const credentialId = uuidv4();
    const credential = {
      credentialId,
      issuerId: this.issuerId,
      issuerDid: this.issuerDid,
      issuerName: this.issuerName,
      docType,
      studentId: session.studentId,
      institution: session.institution,
      ...session.credentialData,
      credentialType: 'PhotoID',
      kind: kindOfCredentialData(session.credentialData),
      status: 'active',
      statusIndex,
      deviceKey: deviceJwk,
      deviceBound: !!deviceJwk,
      createdAt: new Date().toISOString(),
    };

    this.credentials.set(credentialId, credential);
    this._persistCredential(credential);
    this.storeMdocSession(credentialId, mdoc.base64url);
    this.statistics.totalIssued++;
    this.statistics.byType['PhotoID'] = (this.statistics.byType['PhotoID'] || 0) + 1;

    // The academy path issues through a session rather than through the API, so it needs
    // its own audit entry: without it, the credentials a student claims were invisible to
    // the organisation that issued them.
    this.auditLog.push({
      timestamp: credential.createdAt,
      action: 'credential_issued',
      credentialId,
      credentialType: 'PhotoID',
      studentId: credential.studentId,
      kind: credential.kind,
      kindLabel: labelOfCredentialData(credential),
      details: { issued: true, docType, sessionId: session.sessionId },
    });

    session.status = 'issued';
    session.credentialId = credentialId;
    this._persistIssuanceSession(session);

    return { success: true, credentialId, mdocBase64url: mdoc.base64url, deviceBound: !!deviceJwk };
  }

  // Claim an issuance session with a wallet access token + proof-of-possession
  // CWT. The token's `sub` must be linked (via an institute invitation) to the
  // session's studentId, and the CWT must be signed by the wallet's device key.
  async claimIssuanceSession(sessionId, { accessToken, cwt, allowReissue = false }, walletAccounts) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) {return { success: false, status: 404, error: 'Issuance session not found' };}
    // A session already claimed is refused unless this claim came from an offer that asked for a
    // re-issue - the holder's own request rather than a retry.
    if (session.status === 'issued' && !allowReissue) {
      return { success: false, status: 409, error: 'Issuance session already claimed' };
    }
    if (session.status === 'superseded') {
      return {
        success: false,
        status: 409,
        error: 'This credential was replaced by a newer one. Open your latest invitation link',
      };
    }

    let payload;
    try {
      payload = await walletAccounts.verifyAccessToken(accessToken);
    } catch (e) {
      return { success: false, status: 401, error: 'Invalid access token' };
    }

    if (!walletAccounts.hasLink(payload.sub, session.institution, session.studentId)) {
      return {
        success: false,
        status: 403,
        error: 'Wallet is not linked to the person in this issuance session',
      };
    }

    if (session.termsRequired && !session.termsAcceptedAt) {
      return { success: false, status: 403, error: 'Terms have not been accepted' };
    }

    if (session.feePence > 0 && session.paymentStatus !== 'paid') {
      return { success: false, status: 402, error: 'Payment required' };
    }

    // Verify the wallet's proof-of-possession CWT and extract the device key.
    let cwtBytes;
    try {
      cwtBytes = Buffer.from(String(cwt || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    } catch {
      return { success: false, status: 400, error: 'Invalid CWT encoding' };
    }
    const cwtResult = verifyCwt(cwtBytes, { audience: session.institution, nonce: session.nonce });
    if (!cwtResult.valid) {
      return { success: false, status: 401, error: `Invalid CWT: ${cwtResult.error}` };
    }

    const result = this.issueForSession(session, cwtResult.devicePublicJwk, { allowReissue });
    return { ...result, status: result.success ? 200 : 400 };
  }

  getCredential(credentialId) {
    let credential = this.credentials.get(credentialId);

    // Fall back to the shared database so credentials issued by another
    // instance (or before a restart) are still resolvable.
    if (!credential) {
      try {
        const row = this.db
          .prepare('SELECT * FROM credentials WHERE credential_id = ?')
          .get(credentialId);
        if (row) {
          credential = row.metadata_json ? JSON.parse(row.metadata_json) : null;
          if (!credential) {
            credential = {
              credentialId: row.credential_id,
              issuerId: row.issuer_id || this.issuerId,
              docType: row.doc_type,
              institution: row.institution,
              studentId: row.student_id,
              credentialType: 'PhotoID',
              deviceBound: !!row.device_bound,
              createdAt: row.created_at,
            };
          }
          credential.status = row.status;
          this.credentials.set(credentialId, credential);
          if (row.status === 'revoked') {this.revokedCredentials.add(credentialId);}
        }
      } catch (e) {
        console.error('[issuer] credential lookup failed:', e.message);
      }
    }

    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }
    if (this.revokedCredentials.has(credentialId) || credential.status === 'revoked') {
      return { success: false, error: 'Credential has been revoked' };
    }
    return { success: true, credential };
  }

  listCredentials(filters = {}) {
    const results = Array.from(this.credentials.values()).filter(cred => {
      // Organisation scope: a client org only ever sees its own credentials.
      if (filters.institution && cred.institution !== filters.institution) {return false;}
      // Holder scope: a wallet sees only credentials linked to its own account.
      if (filters.owners && !filters.owners.some(
        (owner) => owner.institution === cred.institution && owner.studentId === cred.studentId,
      )) {return false;}
      if (filters.studentId && cred.studentId !== filters.studentId) {return false;}
      if (filters.type && cred.credentialType !== filters.type) {return false;}
      if (filters.status && cred.status !== filters.status) {return false;}
      // Revoked credentials stay visible (carrying status 'revoked') so the portal
      // keeps a complete history of what was issued; pass ?status=active to narrow.
      return true;
    });

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      success: true,
      credentials: results.slice(start, end).map((credential) => ({
        ...credential,
        // The kind is derived from the academic namespace the credential holds, never
        // inferred from its contents: both kinds share the photo-ID docType, so the
        // namespace is the only thing that tells them apart. A credential that holds
        // neither namespace stays 'credential', and the caller falls back to the raw
        // docType rather than being given a label that would be a guess.
        kind: kindOfCredentialData(credential),
        kindLabel: labelOfCredentialData(credential),
        academicNamespaces: academicNamespacesOf(credential),
      })),
      total: results.length,
      page,
      pageSize,
    };
  }

  revokeCredential(credentialId, reason = 'No reason provided') {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }
    if (this.revokedCredentials.has(credentialId)) {
      return { success: false, error: 'Credential already revoked' };
    }

    this.revokedCredentials.add(credentialId);
    credential.status = 'revoked';
    credential.revocationReason = reason;
    this._markCredentialRevoked(credentialId, reason);

    this.statistics.totalRevoked++;

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'credential_revoked',
      credentialId,
      studentId: credential.studentId,
      kind: credential.kind || 'credential',
      kindLabel: labelOfCredentialData(credential),
      details: { reason },
    });

    return { success: true, credentialId, status: 'revoked' };
  }

  async generateQR(credentialId) {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }

    try {
      // Create payload (minimal data for QR code)
      const payload = {
        credentialId,
        issuerId: this.issuerId,
        issuerDid: this.issuerDid,
        credentialType: credential.credentialType,
        studentId: credential.studentId,
        issuanceDate: credential.issuanceDate,
        expiryDate: credential.expiryDate,
      };

      // Generate QR as data URL
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300,
      });

      return { success: true, qrDataUrl, payload };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Statistics for the whole platform, or for a single client organisation when
   * one is named. An organisation's figures are derived from the credentials it
   * issued, so they can never include anybody else's.
   */
  getStatistics(institution = null) {
    // Counts by kind, taken from the credentials themselves. Both kinds share the
    // photo-ID docType, so a count by docType would silently merge them.
    const countByKind = (credentials) => {
      const byKind = {};
      for (const credential of credentials) {
        const kind = kindOfCredentialData(credential);
        byKind[kind] = (byKind[kind] || 0) + 1;
      }
      return byKind;
    };

    if (!institution) {
      const all = Array.from(this.credentials.values());
      return {
        issuerId: this.issuerId,
        issuerName: this.issuerName,
        ...this.statistics,
        // The counters above are per-process and reset on restart; the store is the
        // durable truth, so the totals are taken from it.
        totalIssued: this.credentials.size,
        totalRevoked: this.revokedCredentials.size,
        credentialsInSystem: this.credentials.size,
        activeCredentials: this.credentials.size - this.revokedCredentials.size,
        byKind: countByKind(all),
        byKindActive: countByKind(all.filter((c) => c.status !== 'revoked')),
      };
    }

    const mine = Array.from(this.credentials.values()).filter(
      (credential) => credential.institution === institution,
    );
    const revoked = mine.filter((credential) => credential.status === 'revoked').length;
    return {
      issuerId: this.issuerId,
      issuerName: this.issuerName,
      institution,
      totalIssued: mine.length,
      totalRevoked: revoked,
      credentialsInSystem: mine.length,
      activeCredentials: mine.length - revoked,
      byKind: countByKind(mine),
      byKindActive: countByKind(mine.filter((credential) => credential.status !== 'revoked')),
    };
  }

  getAuditLog(filters = {}) {
    let log = [...this.auditLog];

    if (filters.action) {
      log = log.filter(entry => entry.action === filters.action);
    }
    if (filters.studentId) {
      log = log.filter(entry => entry.studentId === filters.studentId);
    }
    // Organisation scope: only events about that organisation's own credentials.
    if (filters.institution) {
      log = log.filter(
        (entry) =>
          entry.credentialId
          && this.credentials.get(entry.credentialId)?.institution === filters.institution,
      );
    }
    if (filters.limit) {
      log = log.slice(-filters.limit);
    }

    return { success: true, auditLog: log, total: log.length };
  }

  clear() {
    this.credentials.clear();
    this.auditLog = [];
    this.revokedCredentials.clear();
    this.statistics = {
      totalIssued: 0,
      totalRevoked: 0,
      totalVerified: 0,
      byStudent: {},
      byType: {},
    };
    return { success: true };
  }
}

// Initialize service
const issuer = new IssuerService({
  issuerId: process.env.ISSUER_ID || 'issuer-001',
  issuerName: process.env.ISSUER_NAME || 'Smart College',
  issuerDid: process.env.ISSUER_DID || 'did:example:issuer-001',
});

// Load the wallet access-token signer key (separate from the mdoc signer key).
function loadWalletTokenSigner() {
  const keyPath = process.env.WALLET_TOKEN_SIGNER_KEY_PATH
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../key-management/keys/wallet-token-signer.private.pem');
  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (e) {
    console.warn('[issuer] wallet access-token signer key not found. Access tokens disabled:', e.message);
    return null;
  }
}

// Wallet account provisioning (invitation + email OTP + institute links)
const walletAccounts = new WalletAccountService({
  signerKeyPem: loadWalletTokenSigner(),
  issuerId: issuer.issuerId,
  issuerName: issuer.issuerName,
  siteUrl: process.env.ISSUER_FRONTEND_URL || process.env.ISSUER_BASE_URL,
  emailSender: emailService.sendOtpEmail,
});

// Client organisations and the API keys their own systems use to issue.
const clientOrgs = new ClientOrgService({});

// The example academy is the organisation the self-service flows issue under, so
// register it up front for the portal's organisation picker.
clientOrgs.ensureOrg(process.env.ACADEMY_NAME || 'Smart Academy');

// Management-portal administrators (email + password, separate from holders).
const adminAuth = new AdminAuthService({
  signerKeyPem: loadWalletTokenSigner(),
  issuerId: issuer.issuerId,
});

// Selective-disclosure "share" flow (alternative to DCAPI integration).
//
// The address a share is opened on is its own site, not the academy's: the recipient has no
// relationship with the institution that issued the document. It is set here explicitly rather
// than left to the service's own default, because an option passed in wins over that default, and
// a share link already sits in someone's inbox by the time anyone notices the difference.
const SHARE_SITE_URL =
  process.env.SHARE_SITE_URL || process.env.ISSUER_FRONTEND_URL || process.env.ISSUER_BASE_URL || 'http://localhost:3005';

const shareService = new ShareService({
  issuerService: issuer,
  walletAccounts,
  verifierApiUrl: process.env.VERIFIER_API_URL || 'http://localhost:3001',
  siteUrl: SHARE_SITE_URL,
  origin: SHARE_SITE_URL,
  emailSender: emailService.sendEmail,
});

// Build an OpenID4VCI credential-offer URL that references an issuance session.
//
// A re-issue is marked inside the offer itself, because the offer is what travels to the wallet.
// A session that has already been claimed may only be claimed again from an offer that carries
// the marker, so a replayed or double-tapped offer cannot mint a second credential by accident.
function buildCredentialOfferUrl(session, { reissue = false } = {}) {
  const offer = {
    credential_issuer: process.env.ISSUER_BASE_URL || 'https://issuer.smartcollege.example',
    issuer_id: session.institution,
    credentials: [docTypeOf(session)],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': session.sessionId,
        user_pin_required: false,
        nonce: session.nonce,
      },
    },
  };
  if (reissue) {offer.reissue = true;}
  const encoded = Buffer.from(JSON.stringify(offer)).toString('base64url');
  return `openid-credential-offer://?credential_offer=${encoded}`;
}

// Whether an offer carries the holder's request to be issued the credential again.
function isReissueOffer(offerUrl) {
  let encoded = String(offerUrl || '').trim();
  if (!encoded) {return false;}
  const q = encoded.match(/[?&]credential_offer=([^&]+)/);
  if (q) {encoded = q[1];}
  try {
    const json = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json)?.reissue === true;
  } catch {
    return false;
  }
}

// When WALLET_APP_LINK_BASE is configured (e.g. https://quals.example/offer),
// the same credential offer is also exposed as an Android App Link so a phone
// can open the wallet directly without a scheme chooser.
const WALLET_APP_LINK_BASE = process.env.WALLET_APP_LINK_BASE || null;

function buildAppLinkOfferUrl(offerUrl) {
  if (!WALLET_APP_LINK_BASE) {return null;}
  const encoded = String(offerUrl || '').split('credential_offer=')[1];
  if (!encoded) {return null;}
  return `${WALLET_APP_LINK_BASE}?credential_offer=${encoded}`;
}

// Extract the issuance session id from an OpenID4VCI credential-offer URL.
function parseSessionIdFromOffer(offerUrl) {
  let encoded = String(offerUrl || '').trim();
  if (!encoded) {return null;}
  const q = encoded.match(/[?&]credential_offer=([^&]+)/);
  if (q) {encoded = q[1];}
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(encoded)) {
    return encoded; // already a raw session id
  }
  try {
    const json = Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const offer = JSON.parse(json);
    return offer?.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'] || null;
  } catch {
    return null;
  }
}

// Create Express app
// Browser origin allow-list. Override with CORS_ORIGINS (comma-separated) or
// set CORS_ORIGINS=* to allow any origin (not recommended outside development).
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:3002,http://localhost:3003,http://localhost:3004,' +
    'http://127.0.0.1:3002,http://127.0.0.1:3003,http://127.0.0.1:3004'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Server-to-server and same-origin requests carry no Origin header.
      if (!origin) {return callback(null, true);}
      if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(origin)) {return callback(null, true);}
      return callback(null, false);
    },
  }),
);
app.use(express.json({ limit: '10mb' }));

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', issuerId: issuer.issuerId });
});

// Published status list, referenced from every credential's signed MSO
// (`status` -> `status_list` -> `uri`). The bits are derived from the credential
// registry on each request, so a revocation takes effect immediately, and the
// response is a signed `statuslist+jwt` so a verifier can confirm it came from
// the same key that signed the credential.
app.get('/status-list/:listId', (req, res) => {
  if (req.params.listId !== STATUS_LIST_ID) {
    return res.status(404).json({ success: false, error: 'Unknown status list' });
  }
  if (!issuer.mdocSigner) {
    return res.status(503).json({ success: false, error: 'Status list signing key unavailable' });
  }
  try {
    const rows = getDb()
      .prepare('SELECT status_index, status FROM credentials WHERE status_index IS NOT NULL')
      .all();
    const entries = {};
    for (const row of rows) {
      entries[row.status_index] = row.status === 'active' ? STATUS_VALID : STATUS_INVALID;
    }
    const payload = encodeStatusListPayload(packStatusList(entries));
    const jws = signStatusListJws(payload, issuer.mdocSigner.signerKeyPem);
    res.type('application/statuslist+jwt').send(jws);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Issue credential. Only a client organisation may call this, authenticated with
// an API key issued through the management portal; the credential is stamped with
// that organisation, so it can only ever see and revoke its own credentials.
app.post('/credentials/issue', async (req, res) => {
  if (!(await requireApiKey(req, res))) {return;}
  const result = issuer.issue({ ...req.body, institution: req.clientOrg.institution });
  res.status(result.success ? 201 : 400).json(result);
});

// Get credential
app.get('/credentials/:id', (req, res) => {
  const result = issuer.getCredential(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// List credentials
// List credentials. Always scoped to the caller: an administrator sees their
// organisation's credentials, a signed-in holder sees their own.
app.get('/credentials', async (req, res) => {
  const scope = await resolveCredentialScope(req, res);
  if (!scope) {return;}

  const filters = {
    studentId: req.query.studentId,
    type: req.query.type,
    status: req.query.status,
    page: parseInt(req.query.page) || 1,
    pageSize: parseInt(req.query.pageSize) || 20,
  };
  if (scope.kind === 'holder') {
    filters.owners = scope.owners;
  } else if (scope.institution) {
    filters.institution = scope.institution;
  }

  res.json(issuer.listCredentials(filters));
});

// List by student (scoped the same way: a holder cannot read another's).
app.get('/credentials/student/:studentId', async (req, res) => {
  const scope = await resolveCredentialScope(req, res);
  if (!scope) {return;}

  const filters = { studentId: req.params.studentId };
  if (scope.kind === 'holder') {
    filters.owners = scope.owners;
  } else if (scope.institution) {
    filters.institution = scope.institution;
  }

  res.json(issuer.listCredentials(filters));
});

// Revoke credential. Privileged, destructive and irreversible, so it requires an
// administrator - and an organisation-scoped administrator may only revoke the
// credentials their own organisation issued.
app.delete('/credentials/:id', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}

  const existing = issuer.getCredential(req.params.id);
  if (!existing.success) {return res.status(404).json(existing);}
  if (req.admin.institution && existing.credential.institution !== req.admin.institution) {
    return res.status(403).json({ success: false, error: 'Credential belongs to another organisation' });
  }

  const result = issuer.revokeCredential(req.params.id, req.body.reason);
  res.status(result.success ? 200 : 404).json(result);
});

// Generate QR code
app.get('/credentials/:id/qr', async (req, res) => {
  const result = await issuer.generateQR(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// Get ISO 18013-5 IssuerSigned mdoc (base64url) for a credential
app.get('/credentials/:id/mdoc', (req, res) => {
  const result = issuer.getCredentialMdoc(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// Statistics. A platform administrator sees the whole network; an
// organisation-scoped administrator sees only its own numbers.
app.get('/statistics', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  res.json({ success: true, statistics: issuer.getStatistics(req.admin.institution || null) });
});

// Audit log, scoped the same way: an organisation only ever sees events about the
// credentials it issued.
app.get('/audit-log', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  const filters = {
    action: req.query.action,
    studentId: req.query.studentId,
    limit: parseInt(req.query.limit) || 100,
    institution: req.admin.institution || null,
  };
  res.json(issuer.getAuditLog(filters));
});

// ── Wallet account provisioning (invitation + email OTP) ───────────────────
app.post('/invitations', async (req, res) => {
  try {
    res.status(201).json(await walletAccounts.invite(req.body || {}));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/otp/verify', (req, res) => {
  const result = walletAccounts.verifyOtp(req.body || {});
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/auth/otp', async (req, res) => {
  try {
    // The academy site says so when it is the one asking, so the message is worded for the site
    // rather than for the wallet. Absent means the wallet, which is what the app sends.
    const audience = req.body?.audience === 'academy' ? 'academy' : 'wallet';
    res.json(await walletAccounts.requestSignInOtp({
      ...(req.body || {}),
      audience,
      institution: ACADEMY_NAME,
    }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/auth/token', async (req, res) => {
  try {
    res.json(await walletAccounts.exchangeToken(req.body || {}));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Refresh an expired access token using the long-lived refresh token.
app.post('/auth/refresh', async (req, res) => {
  try {
    res.json(await walletAccounts.refresh(req.body || {}));
  } catch (e) {
    res.status(401).json({ success: false, error: e.message });
  }
});

// Sign out: invalidate the refresh token (access token expires on its own).
app.post('/auth/signout', (req, res) => {
  try {
    res.json(walletAccounts.signOut(req.body || {}));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ── Administrator authentication (Quals management portal) ───────────────
// Sign-in endpoints are public; everything else under /admin requires either a
// valid admin session token or (only when explicitly configured) the shared
// break-glass key in ADMIN_API_KEY.
app.post('/admin/auth/login', async (req, res) => {
  try {
    res.json(await adminAuth.login(req.body || {}));
  } catch (e) {
    res.status(401).json({ success: false, error: e.message });
  }
});

app.post('/admin/auth/logout', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  try {
    res.json(adminAuth.signOut(req.admin.id));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get('/admin/auth/me', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  res.json({ success: true, admin: req.admin });
});

app.post('/admin/auth/password', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  try {
    res.json(await adminAuth.changePassword(req.admin.id, req.body?.newPassword));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Managing administrators is platform administration: an organisation-scoped
// administrator can neither list nor create them.
app.get('/admin/users', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  res.json({ success: true, users: adminAuth.listAdmins() });
});

app.post('/admin/users', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  const institution = req.body?.institution ? String(req.body.institution).trim() : null;
  if (institution) {clientOrgs.ensureOrg(institution);}
  try {
    res.status(201).json({
      success: true,
      user: await adminAuth.createAdmin({
        email: req.body?.email,
        password: req.body?.password,
        role: req.body?.role,
        institution,
      }),
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/admin/users/:id/active', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  try {
    res.json({ success: true, user: adminAuth.setActive(req.params.id, !!req.body?.active) });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ── Client organisations and their API keys ──────────────────────────────
// Each client organisation issues credentials with its own API key and only ever
// sees the credentials issued under it. An organisation-scoped administrator can
// manage its own keys; a platform administrator can manage any organisation's.
app.get('/admin/orgs', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  // An organisation-scoped administrator only ever sees its own organisation.
  const orgs = clientOrgs.listOrgs();
  res.json({
    success: true,
    orgs: req.admin.institution
      ? orgs.filter((org) => org.institution === req.admin.institution)
      : orgs,
  });
});

app.get('/admin/api-keys', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  res.json({ success: true, keys: clientOrgs.listApiKeys(req.admin.institution || null) });
});

app.post('/admin/api-keys', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}

  const requested = req.body?.institution ? String(req.body.institution).trim() : null;
  const institution = req.admin.institution || requested;
  if (!institution) {
    return res.status(400).json({ success: false, error: 'institution is required' });
  }
  if (req.admin.institution && requested && requested !== req.admin.institution) {
    return res.status(403).json({ success: false, error: 'Cannot create API keys for another organisation' });
  }

  try {
    // The key is returned once, here; only its hash is stored.
    res.status(201).json(clientOrgs.createApiKey({ institution, name: req.body?.name }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.delete('/admin/api-keys/:keyId', async (req, res) => {
  if (!(await requireAdmin(req, res))) {return;}
  const result = clientOrgs.revokeApiKey(req.params.keyId, req.admin.institution || null);
  res.status(result.success ? 200 : 404).json(result);
});

// ── Remote account administration ────────────────────────────────────────
// Deactivate / reactivate / delete a wallet account. A deactivated or deleted
// account can no longer exchange its refresh token.
/**
 * Authenticate a client organisation by API key.
 *
 * A key is minted through the management portal and belongs to a single
 * organisation; anything issued with it is stamped with that organisation, which
 * is what scopes every portal view of the resulting credential.
 */
async function requireApiKey(req, res) {
  const header = req.headers.authorization || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-api-key'];
  const org = clientOrgs.authenticate(presented);
  if (!org) {
    res.status(401).json({ success: false, error: 'A valid client API key is required' });
    return false;
  }
  req.clientOrg = org;
  return true;
}

/**
 * Work out who is reading credentials and what they may see.
 *
 * A management-portal administrator is scoped to their organisation (a platform
 * administrator, with none, sees every organisation). A signed-in holder is
 * scoped to the credentials linked to their own account. Responds and returns
 * null when neither applies.
 */
async function resolveCredentialScope(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (token) {
    // A client organisation's API key may read its own credentials, which is how a
    // client's own systems reconcile what has been issued to their students.
    const organisation = clientOrgs.authenticate(token);
    if (organisation) {return { kind: 'org', institution: organisation.institution };}

    try {
      const admin = await adminAuth.verifyAdminToken(token);
      return { kind: 'admin', institution: admin.institution || null };
    } catch { /* not an administrator session */ }

    try {
      const claims = await walletAccounts.verifyAccessToken(token);
      return { kind: 'holder', owners: walletAccounts.getLinks(claims.sub) };
    } catch { /* not a holder access token either */ }
  }

  const sharedKey = process.env.ADMIN_API_KEY;
  if (sharedKey && (req.headers['x-admin-key'] || '') === sharedKey) {
    return { kind: 'admin', institution: null };
  }

  res.status(401).json({ success: false, error: 'Sign in required' });
  return null;
}

async function requireAdmin(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.admin = await adminAuth.verifyAdminToken(token);
      return true;
    } catch (e) {
      res.status(401).json({ success: false, error: e.message });
      return false;
    }
  }

  // Break-glass: only honoured when a key is explicitly configured.
  const sharedKey = process.env.ADMIN_API_KEY;
  if (sharedKey && (req.headers['x-admin-key'] || '') === sharedKey) {
    req.admin = { id: 'shared-key', email: 'shared-key', role: 'break-glass', active: true };
    return true;
  }

  res.status(401).json({ success: false, error: 'Administrator sign-in required' });
  return false;
}

/**
 * Require a platform administrator: one who is not scoped to a single client
 * organisation. Network-wide data. Wallet accounts, sharing, other
 * organisations and administrator records. Is only ever visible to them.
 */
async function requirePlatformAdmin(req, res) {
  if (!(await requireAdmin(req, res))) {return false;}
  if (req.admin.institution) {
    res.status(403).json({
      success: false,
      error: 'This area is limited to the platform operator',
    });
    return false;
  }
  return true;
}

app.post('/admin/accounts/:sub/deactivate', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  try {
    res.json(walletAccounts.deactivateAccount(req.params.sub));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/admin/accounts/:sub/activate', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  try {
    res.json(walletAccounts.activateAccount(req.params.sub));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/admin/accounts/:sub/delete', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  try {
    res.json(walletAccounts.deleteAccount(req.params.sub));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ── Management portal: accounts + shares ─────────────────────────────────
app.get('/admin/accounts', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  try {
    res.json({ success: true, accounts: walletAccounts.listAccounts() });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// A share is a holder disclosing their own credential; client organisations do not
// administer sharing, so this is platform-only.
app.delete('/shares/:id', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  try {
    res.json(shareService.revoke({ shareId: req.params.id, reason: req.body?.reason || null }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ── Smart Academy self-service flow ──────────────────────────────────────
// The academy already holds the academic record, so there is no form: the
// applicant gives an email, we generate the record, and email them a link to
// the issuance page where they sign in and add the credential to their wallet.
const ACADEMY_NAME = process.env.ACADEMY_NAME || 'Smart Academy';
const ACADEMY_SITE_URL =
  process.env.ACADEMY_SITE_URL || process.env.ISSUER_FRONTEND_URL || 'http://localhost:3002';

const isEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value || '').trim());

/** A number that is present, or null so the calling table omits the element. */
const numberOrNull = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Whether two claim sets are the same credential, compared by value and independent of key order.
 *
 * This is what decides whether a prepared credential may be reused: reusing one whose claims have
 * since changed would hand the holder a record the issuer would no longer produce - which is how a
 * student ends up presenting marks on a scale the issuer stopped using.
 */
function sameClaimSet(a, b) {  const stable = (value) => {
  if (Array.isArray(value)) {return value.map(stable);}
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
};
return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

export { sameClaimSet };

/**
 * How an element value is written into an mdoc. An element is one identifier/value pair, so a
 * scheme is a sibling element rather than a nested map (nested structures are opaque to
 * selective disclosure and to most mdoc debuggers), and the encoders are named rather than
 * inlined so a claim set can be read as a table.
 */
const ELEMENT_ENCODERS = {
  text: (value) => new Cbor().tstr(String(value)).encode(),
  date: (value) => fullDate(value),
  uint: (value) => new Cbor().uint(value).encode(),
  number: (value) => new Cbor().f64(value).encode(),
  /** The course list travels as one JSON string: a flat value is maximally portable. */
  json: (value) => new Cbor().tstr(JSON.stringify(value)).encode(),
};

/**
 * Append `[identifier, value, encoder?]` rows, omitting anything absent - an element is left
 * out rather than emitted empty, so a reader can tell "not recorded" from "recorded as blank".
 */
function pushElements(target, rows) {
  for (const [identifier, value, encoder] of rows) {
    if (value === null || value === undefined || value === '') {continue;}
    target.push([identifier, ELEMENT_ENCODERS[encoder || 'text'](value)]);
  }
}

/** The docType a stored issuance session will issue. */
function docTypeOf(session) {
  return session?.credentialData?.docType || PHOTOID_DOCTYPE;
}

/**
 * The kind of a session, from the academic namespace its record holds rather than from
 * its docType, which every kind shares.
 */
function kindOf(session) {
  return kindOfCredentialData(session?.credentialData || {});
}

function kindLabel(session) {
  return labelOfCredentialData(session?.credentialData || {});
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

app.post('/academy/requests', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!isEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    // Deterministic student id so repeat requests always map to one person.
    const studentId =
      String(req.body?.studentId || '').trim() ||
      `SA-${crypto.createHash('sha1').update(email).digest('hex').slice(0, 8).toUpperCase()}`;

    const { sub } = walletAccounts.ensureAccountLink({
      email,
      studentId,
      institution: ACADEMY_NAME,
    });

    // The academy knows what the student holds, and the programme's state decides what each item
    // carries, so the request cannot choose it. A completed degree is one document holding the
    // qualification and the transcript; one still in progress is the transcript for the terms
    // completed so far; a certification is the qualification alone.
    //
    // The recognition details are the one remaining option: a caller that does not want them (they
    // describe the institution and the module, and enlarge what a presentation can disclose)
    // passes `recognition: false`. Absent means the demo's default, which is to include them, so
    // the test sites have a recognisable record to show.
    const recognition = req.body?.recognition !== false && req.body?.recognition !== 'false';
    const requestedKind = req.body?.include;
    // The academy's own flow asks for nothing and gets the rule; an explicit request for one kind
    // is honoured for callers that know what they want, and prepares that one item alone.
    const records = requestedKind
      ? generateAcademicRecord({
        institution: ACADEMY_NAME,
        studentId,
        fullName: req.body?.fullName,
        include: requestedKind,
        recognition,
      }).records
      : generateStudentItems({
        institution: ACADEMY_NAME,
        studentId,
        fullName: req.body?.fullName,
        recognition,
      });

    // One session per requested kind, and only when it is what this request would issue today:
    // a credential prepared under older claims is replaced (it was never claimed, so nothing is
    // taken away), while one already in the wallet stays there and a current credential is
    // prepared alongside it, since re-issuing is not something the holder can undo.
    const issued = records.map((record) => {
      const candidates = issuer.findIssuanceSessionsFor({
        studentId,
        institution: ACADEMY_NAME,
        // Any one of the record's namespaces is enough to find the candidates to compare;
        // whether a candidate really is the same credential is decided by the claim-set
        // comparison below, not by this filter.
        academicNamespace: record.academicNamespaces[0],
      });
      // Two items of one student's record can share a namespace - a completed degree holds the
      // qualification, and the certificate is one - so the programme is part of what tells items
      // apart. Without it, preparing the second item supersedes the first.
      const forThisItem = candidates.filter(
        (session) =>
          (session.display?.programmeCode || null) === (record.display?.programmeCode || null),
      );
      const matching = forThisItem.find((session) =>
        sameClaimSet(session.credentialData, record.credentialData),
      );
      if (matching) {
        issuer.linkIssuanceSession(matching.sessionId, { email, sub });
        return { record, session: matching, reused: true, superseded: 0 };
      }

      const stale = forThisItem.filter((session) => session.status === 'pending');
      for (const session of stale) {issuer.supersedeIssuanceSession(session.sessionId);}

      return {
        record,
        reused: false,
        superseded: stale.length,
        session: issuer.createIssuanceSession({
          studentId,
          institution: ACADEMY_NAME,
          credentialData: record.credentialData,
          display: record.display,
          email,
          sub,
          termsRequired: true,
        }),
      };
    });

    // The link carries the address the request was made for, so the claiming page shows the items
    // belonging to that student rather than every credential the browser happens to have seen.
    const claimParams = new URLSearchParams({ email });
    if (requestedKind) {claimParams.set('include', String(requestedKind));}
    if (!recognition) {claimParams.set('recognition', 'false');}
    const claimUrl = `${ACADEMY_SITE_URL}/claim?${claimParams.toString()}`;
    // Only mail a link when something is still claimable: repeating a request the student
    // has already acted on must not send them a second "your credentials are ready".
    const claimable = issued.some(({ session }) => session.status !== 'issued');
    const sent = claimable
      ? await emailService.sendCredentialsReadyEmail({
        email,
        institution: ACADEMY_NAME,
        claimUrl,
        credentials: records.map((record) => ({
          title: record.display.title,
          subtitle:
              record.kind === 'transcript'
                ? `${record.display.totalCredits} credits · ${record.display.courseCount} courses`
                : `${record.display.degreeLevel} · Graduated ${record.display.graduationDate}`,
        })),
      })
      : { success: false, skipped: 'already-issued' };

    const primary = issued[0];
    const allInWallet = issued.every(({ session }) => session.status === 'issued');
    res.status(201).json({
      success: true,
      email,
      studentId,
      claimUrl,
      emailSent: sent.success,
      // The first credential, for callers written before the choice existed, plus the
      // complete list of what was created or reused.
      sessionId: primary.session.sessionId,
      credential: {
        title: primary.record.display.title,
        graduationDate: primary.record.display.graduationDate,
      },
      credentials: issued.map(({ record, session, reused, superseded }) => ({
        sessionId: session.sessionId,
        kind: record.kind,
        label: record.label,
        docType: record.docType,
        academicNamespaces: record.academicNamespaces,
        // Whether this credential carries the recognition details, so a caller can tell what
        // it asked for and the app can say what the holder will receive.
        recognition: record.recognition === true,
        // `reused` means this request matched credentials already prepared, so the same
        // session (and the same offer) is returned rather than a duplicate being created.
        reused,
        // How many prepared credentials were replaced because they no longer carried the claims
        // this issuer would produce - an older claim set is not handed back as if it were current.
        superseded: superseded ?? 0,
        inWallet: session.status === 'issued',
        title: record.display.title,
        graduationDate: record.display.graduationDate ?? null,
        totalCredits: record.display.totalCredits ?? null,
        courseCount: record.display.courseCount ?? null,
      })),
      message: allInWallet
        ? 'These credentials are already in your wallet, so no new link was emailed. You can issue another copy from here.'
        : sent.success
          ? 'We have emailed you a link to add your credentials to your wallet.'
          : 'We could not email you the link. Use the link below to continue.',
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// List the credentials the signed-in wallet address can add.
app.get('/academy/credentials', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) {return res.status(401).json({ success: false, error: 'Sign in required' });}

    const payload = await walletAccounts.verifyAccessToken(token);
    const links = walletAccounts.getLinks(payload.sub);
    const sessions = issuer.listIssuanceSessions({
      sub: payload.sub,
      email: payload.email,
      links,
    });

    res.json({
      success: true,
      email: payload.email,
      credentials: sessions.map((session) => ({
        sessionId: session.sessionId,
        status: session.status,
        inWallet: session.status === 'issued',
        kind: kindOf(session),
        label: kindLabel(session),
        docType: docTypeOf(session),
        // What tells this credential apart from the organisation's other kind: they share
        // a docType, so the academic namespace is the discriminator.
        academicNamespaces: academicNamespacesOf(session.credentialData || {}),
        title: session.display?.title || 'Academic credential',
        institution: session.display?.institution || session.institution,
        degreeLevel: session.display?.degreeLevel || null,
        fieldOfStudy: session.display?.fieldOfStudy || null,
        graduationDate: session.display?.graduationDate || null,
        studentId: session.studentId,
        country: session.display?.country || null,
        totalCredits: session.display?.totalCredits || null,
        courseCount: session.display?.courseCount || null,
        holderName: session.credentialData?.full_name || null,
      })),
    });
  } catch (e) {
    res.status(401).json({ success: false, error: 'Your session has expired. Please sign in again' });
  }
});

// Accept terms and return the credential offer + QR code for one credential.
app.post('/academy/credentials/:sessionId/offer', async (req, res) => {
  try {
    const token = bearerToken(req);
    if (!token) {return res.status(401).json({ success: false, error: 'Sign in required' });}

    const payload = await walletAccounts.verifyAccessToken(token);
    const session = issuer.getIssuanceSession(req.params.sessionId);
    if (!session) {return res.status(404).json({ success: false, error: 'Credential not found' });}

    const links = walletAccounts.getLinks(payload.sub);
    const owns =
      session.sub === payload.sub ||
      links.some(
        (l) => l.institution === session.institution && l.studentId === session.studentId,
      );
    if (!owns) {return res.status(403).json({ success: false, error: 'This credential belongs to another account' });}

    // A credential already sitting in a wallet is not a reason to refuse it. The holder is asking
    // for the document, and asking again is asking for another copy: it is issued again, dated the
    // day it is issued, and the copy they already hold stays valid until the organisation revokes
    // it - which is the operational way one credential is replaced by another.
    const reissue = session.status === 'issued';
    if (session.status === 'superseded') {
      return res.status(409).json({
        success: false,
        error: 'This credential was replaced by a newer one. Open your latest invitation link',
      });
    }

    if (session.termsRequired && !session.termsAcceptedAt) {
      issuer.acceptTerms(session.sessionId);
    }

    const offerUrl = buildCredentialOfferUrl(session, { reissue });
    const qrDataUrl = await QRCode.toDataURL(offerUrl, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 320,
      margin: 1,
    });

    res.json({
      success: true,
      sessionId: session.sessionId,
      docType: docTypeOf(session),
      kind: kindOf(session),
      label: kindLabel(session),
      offerUrl,
      // True when this offer issues the credential again rather than for the first time, so the
      // page can say so rather than presenting it as a first issuance.
      reissued: reissue,
      // Present only when a wallet App Link domain is configured.
      appLinkUrl: buildAppLinkOfferUrl(offerUrl),
      qrDataUrl,
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ── Issuance sessions (gated by wallet-account link) ──────────────────────
app.post('/issuance-sessions', (req, res) => {
  try {
    const { studentId, institution, credentialData, feePence, termsRequired } = req.body || {};
    const session = issuer.createIssuanceSession({
      studentId,
      institution,
      credentialData,
      feePence,
      termsRequired,
    });
    res.status(201).json({
      success: true,
      sessionId: session.sessionId,
      status: session.status,
      offerUrl: buildCredentialOfferUrl(session),
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/issuance-sessions/:id/consent', (req, res) => {
  const result = issuer.acceptTerms(req.params.id, req.body?.termsVersion);
  res.status(result.status || (result.success ? 200 : 400)).json(result);
});

app.post('/issuance-sessions/:id/checkout', (req, res) => {
  const result = issuer.createCheckout(req.params.id);
  res.status(result.status || (result.success ? 200 : 400)).json(result);
});

app.post('/issuance-sessions/:id/payment/confirm', (req, res) => {
  const result = issuer.confirmPayment(req.params.id);
  res.status(result.status || (result.success ? 200 : 400)).json(result);
});

// Offer QR code (PNG data URL) for the wallet to scan.
app.get('/issuance-sessions/:id/offer-qr', async (req, res) => {
  const session = issuer.getIssuanceSession(req.params.id);
  if (!session) {return res.status(404).json({ success: false, error: 'Issuance session not found' });}
  try {
    const qrDataUrl = await QRCode.toDataURL(buildCredentialOfferUrl(session), {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 320,
    });
    res.json({ success: true, sessionId: session.sessionId, qrDataUrl });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/issuance-sessions/:id/claim', async (req, res) => {
  const { accessToken, cwt } = req.body || {};
  const result = await issuer.claimIssuanceSession(
    req.params.id,
    { accessToken, cwt },
    walletAccounts,
  );
  res.status(result.status || (result.success ? 200 : 400)).json(result);
});

// ── Wallet BFF: single issuance call ────────────────────────────────────────
// The wallet scans the offer URL, then sends the offer + its access token + a
// proof-of-possession CWT in ONE request; the mdoc is returned directly.
app.post('/wallet/issuance', async (req, res) => {
  const { offerUrl, sessionId, accessToken, cwt, reissue } = req.body || {};
  const resolved = sessionId || parseSessionIdFromOffer(offerUrl);
  if (!resolved) {
    return res.status(400).json({ success: false, error: 'offerUrl or sessionId is required' });
  }
  // Only an offer that says the holder asked for a re-issue may claim a session a second time.
  // The marker travels inside the offer, so a wallet replaying an older one is still refused.
  const allowReissue = reissue === true || isReissueOffer(offerUrl);
  const result = await issuer.claimIssuanceSession(
    resolved,
    { accessToken, cwt, allowReissue },
    walletAccounts,
  );
  if (!result.success) {
    return res.status(result.status || 400).json(result);
  }
  res.json({
    success: true,
    docType: 'org.iso.23220.photoid.1',
    credentialId: result.credentialId,
    mdocBase64url: result.mdocBase64url,
    deviceBound: result.deviceBound,
  });
});

// ── Selective-disclosure share flow (no DCAPI integration required) ──────
// 1. Wallet creates a share: issuer mints a one-time verifier request for the
//    selected namespaces and returns deviceRequest + encryptionInfo.
app.post('/shares', async (req, res) => {
  try {
    const result = await shareService.create(req.body || {});
    res.status(201).json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// 2. Wallet returns the HPKE-encrypted, selectively-disclosed DeviceResponse.
//    The issuer forwards it to the verifier and stores the verified claims.
app.post('/shares/:id/response', async (req, res) => {
  try {
    const result = await shareService.submit({
      shareId: req.params.id,
      accessToken: req.body?.accessToken,
      credential: req.body?.credential,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// 3. Recipient access: OTP sign-in with the invited email, accept terms, view.
app.post('/shares/:id/otp', async (req, res) => {
  try {
    res.json(await shareService.requestOtp({
      shareId: req.params.id,
      email: req.body?.email,
    }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/shares/:id/verify', (req, res) => {
  try {
    res.json(shareService.verifyOtp({
      shareId: req.params.id,
      email: req.body?.email,
      otp: req.body?.otp,
    }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/shares/:id/accept-terms', (req, res) => {
  try {
    res.json(shareService.acceptTerms({
      shareId: req.params.id,
      recipientToken: req.body?.recipientToken,
    }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.post('/shares/:id/view', (req, res) => {
  try {
    res.json(shareService.view({
      shareId: req.params.id,
      recipientToken: req.body?.recipientToken,
    }));
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.get('/shares/:id/pdf', (req, res) => {
  try {
    const result = shareService.pdf({
      shareId: req.params.id,
      recipientToken: req.query.token || req.headers['x-share-token'],
    });
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${result.filename}"`);
    res.send(result.pdf);
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// Listing shares spans every holder and every organisation, so it is limited to the
// platform operator. Recipients still reach their own share through the tokenised
// routes below.
app.get('/shares', async (req, res) => {
  if (!(await requirePlatformAdmin(req, res))) {return;}
  res.json({ success: true, shares: shareService.list() });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// Export for testing
export { IssuerService, app, issuer, buildCredentialOfferUrl, isReissueOffer };

// Start server if run directly (robust entry-point detection)
const PORT = process.env.PORT || 3000;
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// Optional: an administrator scoped to the example academy, so that organisation can sign in on
// its own to see its credentials and manage its API keys. Created only when ACADEMY_ADMIN_EMAIL
// and ACADEMY_ADMIN_PASSWORD are configured, and only once.
async function seedAcademyAdmin() {
  const email = String(process.env.ACADEMY_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ACADEMY_ADMIN_PASSWORD || '';
  if (!email || !password) {return null;}
  if (adminAuth.listAdmins().some((admin) => admin.email === email)) {return null;}

  const institution = process.env.ACADEMY_NAME || 'Smart Academy';
  try {
    clientOrgs.ensureOrg(institution);
    await adminAuth.createAdmin({ email, password, role: 'admin', institution });
    console.log(`[issuer] Created administrator ${email} for ${institution}.`);
  } catch (e) {
    console.error('[issuer] could not create the academy administrator:', e.message);
  }
  return null;
}

if (isMain) {
  // Make sure the portal has at least one administrator to sign in with.
  adminAuth.ensureSeedAdmin().catch((e) => {
    console.error('[admin-auth] failed to seed administrator:', e.message);
  });

  seedAcademyAdmin().catch((e) => {
    console.error('[issuer] failed to seed the academy administrator:', e.message);
  });

  const server = app.listen(PORT, () => {
    console.log(`Issuer Service listening on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}`);
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}
