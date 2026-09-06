import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
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
import * as emailService from './email-service.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});

// In-memory storage for this service (would use P0-4 Storage in production)
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
      byType: {}
    };
    this.revokedCredentials = new Set();

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
            familyName: { type: 'string' }
          }
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
              credits: { type: 'number', minimum: 0, maximum: 999 }
            }
          }
        },
        dateOfBirth: { type: 'string', format: 'date' },
        degreeLevel: { type: 'string', enum: ['associate', 'bachelor', 'master', 'doctorate'] },
        fieldOfStudy: { type: 'string' },
        gpa: { type: 'number', minimum: 0, maximum: 4.0 },
        achievements: { type: 'array', items: { type: 'string' } },
        issuanceDate: { type: 'string', format: 'date' },
        expiryDate: { type: 'string', format: 'date' }
      }
    });

    // Photo ID Credential Schema (ISO 23220)
    this.validatePhotoIDRequest = this.ajv.compile({
      type: 'object',
      required: ['docType', 'full_name', 'date_of_birth', 'document_number', 'issuing_authority', 'issue_date', 'expiry_date'],
      properties: {
        docType: { type: 'string', const: 'org.iso.23220.photoid.1' },
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
            gpa: { type: 'number' }
          }
        },
        education_transcript: {
          type: 'object',
          properties: {
            student_id: { type: 'string' },
            courses: { type: 'array' },
            total_credits: { type: 'number' },
            status: { type: 'string' }
          }
        },
        device_key: {
          type: 'object',
          properties: {
            kty: { type: 'string' },
            crv: { type: 'string' },
            x: { type: 'string' },
            y: { type: 'string' }
          }
        }
      }
    });
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
      console.warn('[issuer] mdoc signing keys not found — mdoc issuance disabled:', e.message);
      return null;
    }
  }

  // Build and sign an ISO 18013-5 IssuerSigned mdoc for a Photo ID credential.
  // `deviceJwk` (optional) is the holder's EC P-256 public JWK; when provided it
  // is embedded in the MSO deviceKeyInfo as the device's mdoc authentication key.
  buildPhotoIDMdoc(credentialData, deviceJwk = null) {
    const namespaces = {};
    const fullName = (credentialData.full_name || '').trim();
    const parts = fullName.split(/\s+/);
    const givenName = parts[0] || '';
    const familyName = parts.slice(1).join(' ');

    const photoId = [];
    if (givenName) photoId.push(['given_name', new Cbor().tstr(givenName).encode()]);
    if (familyName) photoId.push(['family_name', new Cbor().tstr(familyName).encode()]);
    if (credentialData.date_of_birth) photoId.push(['birth_date', fullDate(credentialData.date_of_birth)]);
    if (credentialData.document_number) photoId.push(['document_number', new Cbor().tstr(credentialData.document_number).encode()]);
    if (credentialData.issuing_authority) photoId.push(['issuing_authority', new Cbor().tstr(credentialData.issuing_authority).encode()]);
    if (credentialData.issuing_country) photoId.push(['issuing_country', new Cbor().tstr(credentialData.issuing_country).encode()]);
    if (credentialData.issue_date) photoId.push(['issue_date', fullDate(credentialData.issue_date)]);
    if (credentialData.expiry_date) photoId.push(['expiry_date', fullDate(credentialData.expiry_date)]);
    if (credentialData.portrait) {
      try {
        photoId.push(['portrait', new Cbor().bstr(Buffer.from(credentialData.portrait, 'base64')).encode()]);
      } catch (e) { /* ignore invalid portrait */ }
    }
    if (photoId.length) namespaces['org.iso.23220.photoid.1'] = photoId;

    const eq = credentialData.education_qualification || {};
    const qual = [];
    if (eq.institution_name) qual.push(['institution_name', new Cbor().tstr(eq.institution_name).encode()]);
    if (eq.degree_level) qual.push(['degree_level', new Cbor().tstr(eq.degree_level).encode()]);
    if (eq.field_of_study) qual.push(['field_of_study', new Cbor().tstr(eq.field_of_study).encode()]);
    if (eq.graduation_date) qual.push(['graduation_date', fullDate(eq.graduation_date)]);
    if (typeof eq.gpa === 'number') qual.push(['gpa', new Cbor().f64(eq.gpa).encode()]);
    if (qual.length) namespaces['org.iso.23220.education.qualification.1'] = qual;

    const tr = credentialData.education_transcript || {};
    const transcript = [];
    if (tr.student_id) transcript.push(['student_id', new Cbor().tstr(tr.student_id).encode()]);
    if (Array.isArray(tr.courses) && tr.courses.length) {
      // Encode the course list as a flat JSON text string rather than a nested
      // CBOR array of maps: nested structures are not renderable by every mdoc
      // debugger (e.g. Paradym), and a flat string is maximally portable.
      transcript.push(['courses', new Cbor().tstr(JSON.stringify(tr.courses)).encode()]);
    }
    if (typeof tr.total_credits === 'number') transcript.push(['total_credits', new Cbor().uint(tr.total_credits).encode()]);
    if (tr.status) transcript.push(['status', new Cbor().tstr(tr.status).encode()]);
    if (transcript.length) namespaces['org.iso.23220.education.transcript.1'] = transcript;

    if (!Object.keys(namespaces).length) return null;

    return generateIssuerSigned({
      docType: 'org.iso.23220.photoid.1',
      namespaces,
      signerKeyPem: this.mdocSigner.signerKeyPem,
      certDer: this.mdocSigner.certDer,
      deviceJwk,
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
    if (!session) return null;
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
      if (now > session.expiresAt) this.mdocSessions.delete(id);
    }
  }

  issue(credentialData) {
    const credentialId = uuidv4();
    const now = new Date();
    
    // Determine credential type and validate accordingly
    let isPhotoID = false;
    let credential = null;
    let mdocBase64url = null;
    
    if (credentialData.docType === 'org.iso.23220.photoid.1') {
      // Photo ID credential validation
      if (!this.validatePhotoIDRequest(credentialData)) {
        return {
          success: false,
          error: `Photo ID validation failed: ${JSON.stringify(this.validatePhotoIDRequest.errors)}`
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
          error: 'Invalid device_key: expected an EC P-256 public JWK { kty: "EC", crv: "P-256", x, y }'
        };
      }
      
      isPhotoID = true;
      credential = {
        credentialId,
        issuerId: this.issuerId,
        issuerDid: this.issuerDid,
        issuerName: this.issuerName,
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
        status: 'active',
        signature: `sig_${uuidv4()}`,
        deviceKey: deviceKeyJwk,
        deviceBound: !!deviceKeyJwk,
        createdAt: now.toISOString()
      };

      // Generate the ISO 18013-5 IssuerSigned mdoc for Photo ID credentials.
      // The mdoc payload is held in-memory only (session store) — never persisted.
      if (this.mdocSigner) {
        try {
          const mdoc = this.buildPhotoIDMdoc(credentialData, deviceKeyJwk);
          if (mdoc) {
            mdocBase64url = mdoc.base64url;
            credential.mdocDocType = 'org.iso.23220.photoid.1';
            credential.hasMdoc = true;
            this.storeMdocSession(credentialId, mdoc.base64url);
          }
        } catch (e) {
          console.error('[issuer] mdoc generation failed:', e.message);
        }
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
          error: `Validation failed: ${JSON.stringify(this.validateCredentialRequest.errors)}`
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
        createdAt: now.toISOString()
      };
      
      this.statistics.byStudent[credentialData.studentId] = 
        (this.statistics.byStudent[credentialData.studentId] || 0) + 1;
    }

    // Store credential
    this.credentials.set(credentialId, credential);

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
      details: { issued: true, docType: credential.docType || credential.credentialType }
    });

    return {
      success: true,
      credentialId,
      docType: credentialData.docType || 'org.iso.18013.5.1.mDL',
      status: 'active',
      deviceKey: credential.deviceKey || null,
      deviceBound: credential.deviceBound || false,
      issuanceDate: credential.issuanceDate || credential.issue_date || now.toISOString(),
      expiryDate: credential.expiryDate || credential.expiry_date,
      mdocBase64url,
      mdocSessionTtlMs: this.mdocSessionTtlMs
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
      return { success: false, error: 'mdoc session expired — re-issue the credential to retrieve the mdoc' };
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
  // (studentId). It stays `pending` until the wallet proves — via an access
  // token whose `sub` is linked to that studentId — that it belongs to the
  // same person. Only then is the credential issued.

  createIssuanceSession({ studentId, institution, credentialData, feePence = 0, termsRequired = true }) {
    if (!studentId || !credentialData) {
      throw new Error('studentId and credentialData are required');
    }
    const fee = Number(feePence) || 0;
    const sessionId = uuidv4();
    const session = {
      sessionId,
      studentId: String(studentId),
      institution: String(institution || this.issuerId),
      credentialData,
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
    return session;
  }

  acceptTerms(sessionId, version = null) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) return { success: false, status: 404, error: 'Issuance session not found' };
    session.termsAcceptedAt = new Date().toISOString();
    if (version) session.termsVersion = String(version);
    return { success: true, sessionId, termsAcceptedAt: session.termsAcceptedAt };
  }

  createCheckout(sessionId) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) return { success: false, status: 404, error: 'Issuance session not found' };
    if (session.feePence <= 0) return { success: false, status: 400, error: 'No fee required' };
    if (session.paymentStatus === 'paid') return { success: false, status: 409, error: 'Already paid' };
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
    if (!session) return { success: false, status: 404, error: 'Issuance session not found' };
    session.paymentStatus = 'paid';
    session.paidAt = new Date().toISOString();
    return { success: true, sessionId, paymentStatus: 'paid' };
  }

  getIssuanceSession(sessionId) {
    return this.issuanceSessions.get(sessionId);
  }

  // Issue a device-bound Photo ID mdoc for an issuance session.
  issueForSession(session, deviceJwk) {
    if (session.status === 'issued') {
      return { success: false, error: 'Issuance session already claimed' };
    }
    const mdoc = this.buildPhotoIDMdoc(session.credentialData, deviceJwk);
    if (!mdoc) return { success: false, error: 'mdoc generation failed' };

    const credentialId = uuidv4();
    const credential = {
      credentialId,
      issuerId: this.issuerId,
      issuerDid: this.issuerDid,
      issuerName: this.issuerName,
      docType: 'org.iso.23220.photoid.1',
      studentId: session.studentId,
      institution: session.institution,
      ...session.credentialData,
      credentialType: 'PhotoID',
      status: 'active',
      deviceKey: deviceJwk,
      deviceBound: !!deviceJwk,
      createdAt: new Date().toISOString(),
    };

    this.credentials.set(credentialId, credential);
    this.storeMdocSession(credentialId, mdoc.base64url);
    this.statistics.totalIssued++;
    this.statistics.byType['PhotoID'] = (this.statistics.byType['PhotoID'] || 0) + 1;

    session.status = 'issued';
    session.credentialId = credentialId;

    return { success: true, credentialId, mdocBase64url: mdoc.base64url, deviceBound: !!deviceJwk };
  }

  // Claim an issuance session with a wallet access token + proof-of-possession
  // CWT. The token's `sub` must be linked (via an institute invitation) to the
  // session's studentId, and the CWT must be signed by the wallet's device key.
  async claimIssuanceSession(sessionId, { accessToken, cwt }, walletAccounts) {
    const session = this.getIssuanceSession(sessionId);
    if (!session) return { success: false, status: 404, error: 'Issuance session not found' };
    if (session.status === 'issued') {
      return { success: false, status: 409, error: 'Issuance session already claimed' };
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

    const result = this.issueForSession(session, cwtResult.devicePublicJwk);
    return { ...result, status: result.success ? 200 : 400 };
  }

  getCredential(credentialId) {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return { success: false, error: 'Credential not found' };
    }
    if (this.revokedCredentials.has(credentialId)) {
      return { success: false, error: 'Credential has been revoked' };
    }
    return { success: true, credential };
  }

  listCredentials(filters = {}) {
    const results = Array.from(this.credentials.values()).filter(cred => {
      if (filters.studentId && cred.studentId !== filters.studentId) return false;
      if (filters.type && cred.credentialType !== filters.type) return false;
      if (filters.status && cred.status !== filters.status) return false;
      if (!this.revokedCredentials.has(cred.credentialId)) return true;
      return false;
    });

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      success: true,
      credentials: results.slice(start, end),
      total: results.length,
      page,
      pageSize
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

    this.statistics.totalRevoked++;

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'credential_revoked',
      credentialId,
      studentId: credential.studentId,
      details: { reason }
    });

    return { success: true, credentialId, status: 'revoked' };
  }

  batchIssue(credentialsData) {
    const results = [];
    const errors = [];

    credentialsData.forEach((data, index) => {
      const result = this.issue(data);
      if (result.success) {
        results.push(result);
      } else {
        errors.push({ index, error: result.error });
      }
    });

    return {
      success: errors.length === 0,
      issued: results.length,
      total: credentialsData.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    };
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
        expiryDate: credential.expiryDate
      };

      // Generate QR as data URL
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300
      });

      return { success: true, qrDataUrl, payload };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getStatistics() {
    return {
      issuerId: this.issuerId,
      issuerName: this.issuerName,
      ...this.statistics,
      credentialsInSystem: this.credentials.size,
      activeCredentials: this.credentials.size - this.revokedCredentials.size
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
      byType: {}
    };
    return { success: true };
  }
}

// Initialize service
const issuer = new IssuerService({
  issuerId: process.env.ISSUER_ID || 'issuer-001',
  issuerName: process.env.ISSUER_NAME || 'Smart College',
  issuerDid: process.env.ISSUER_DID || 'did:example:issuer-001'
});

// Load the wallet access-token signer key (separate from the mdoc signer key).
function loadWalletTokenSigner() {
  const keyPath = process.env.WALLET_TOKEN_SIGNER_KEY_PATH
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../key-management/keys/wallet-token-signer.private.pem');
  try {
    return fs.readFileSync(keyPath, 'utf8');
  } catch (e) {
    console.warn('[issuer] wallet access-token signer key not found — access tokens disabled:', e.message);
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

// Build an OpenID4VCI credential-offer URL that references an issuance session.
function buildCredentialOfferUrl(session) {
  const offer = {
    credential_issuer: process.env.ISSUER_BASE_URL || 'https://issuer.smartcollege.example',
    issuer_id: session.institution,
    credentials: ['org.iso.23220.photoid.1'],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': session.sessionId,
        user_pin_required: false,
        nonce: session.nonce,
      },
    },
  };
  const encoded = Buffer.from(JSON.stringify(offer)).toString('base64url');
  return `openid-credential-offer://?credential_offer=${encoded}`;
}

// Extract the issuance session id from an OpenID4VCI credential-offer URL.
function parseSessionIdFromOffer(offerUrl) {
  let encoded = String(offerUrl || '').trim();
  if (!encoded) return null;
  const q = encoded.match(/[?&]credential_offer=([^&]+)/);
  if (q) encoded = q[1];
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
const app = express();
app.use(helmet());
app.use(cors());
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

// Issue credential
app.post('/credentials/issue', (req, res) => {
  const result = issuer.issue(req.body);
  res.status(result.success ? 201 : 400).json(result);
});

// Batch issue credentials
app.post('/credentials/batch-issue', (req, res) => {
  const result = issuer.batchIssue(req.body.credentials || []);
  res.status(result.success ? 201 : 400).json(result);
});

// Get credential
app.get('/credentials/:id', (req, res) => {
  const result = issuer.getCredential(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// List credentials
app.get('/credentials', (req, res) => {
  const filters = {
    studentId: req.query.studentId,
    type: req.query.type,
    status: req.query.status,
    page: parseInt(req.query.page) || 1,
    pageSize: parseInt(req.query.pageSize) || 20
  };
  const result = issuer.listCredentials(filters);
  res.json(result);
});

// List by student
app.get('/credentials/student/:studentId', (req, res) => {
  const result = issuer.listCredentials({ studentId: req.params.studentId });
  res.json(result);
});

// Revoke credential
app.delete('/credentials/:id', (req, res) => {
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

// Statistics
app.get('/statistics', (req, res) => {
  const stats = issuer.getStatistics();
  res.json({ success: true, statistics: stats });
});

// Audit log
app.get('/audit-log', (req, res) => {
  const filters = {
    action: req.query.action,
    studentId: req.query.studentId,
    limit: parseInt(req.query.limit) || 100
  };
  const result = issuer.getAuditLog(filters);
  res.json(result);
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
    res.json(await walletAccounts.requestSignInOtp(req.body || {}));
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
  if (!session) return res.status(404).json({ success: false, error: 'Issuance session not found' });
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
    walletAccounts
  );
  res.status(result.status || (result.success ? 200 : 400)).json(result);
});

// ── Wallet BFF: single issuance call ────────────────────────────────────────
// The wallet scans the offer URL, then sends the offer + its access token + a
// proof-of-possession CWT in ONE request; the mdoc is returned directly.
app.post('/wallet/issuance', async (req, res) => {
  const { offerUrl, sessionId, accessToken, cwt } = req.body || {};
  const resolved = sessionId || parseSessionIdFromOffer(offerUrl);
  if (!resolved) {
    return res.status(400).json({ success: false, error: 'offerUrl or sessionId is required' });
  }
  const result = await issuer.claimIssuanceSession(
    resolved,
    { accessToken, cwt },
    walletAccounts
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

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// Export for testing
export { IssuerService, app, issuer };

// Start server if run directly (robust entry-point detection)
const PORT = process.env.PORT || 3000;
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = app.listen(PORT, () => {
    console.log(`Issuer Service listening on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}`);
  });
  
  server.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}
