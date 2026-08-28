import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';

dotenv.config();

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
    
    // Setup validation
    this.ajv = new Ajv();
    addFormats(this.ajv);
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
  }

  issue(credentialData) {
    // Validate input
    if (!this.validateCredentialRequest(credentialData)) {
      return {
        success: false,
        error: `Validation failed: ${JSON.stringify(this.validateCredentialRequest.errors)}`
      };
    }

    const credentialId = uuidv4();
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 5); // 5-year expiry

    const credential = {
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
      signature: `sig_${uuidv4()}`, // Placeholder for real ED25519 signature
      createdAt: now.toISOString()
    };

    // Store credential
    this.credentials.set(credentialId, credential);

    // Update statistics
    this.statistics.totalIssued++;
    this.statistics.byStudent[credentialData.studentId] = 
      (this.statistics.byStudent[credentialData.studentId] || 0) + 1;
    this.statistics.byType[credential.credentialType] = 
      (this.statistics.byType[credential.credentialType] || 0) + 1;

    // Log audit
    this.auditLog.push({
      timestamp: now.toISOString(),
      action: 'credential_issued',
      credentialId,
      studentId: credentialData.studentId,
      details: { issued: true }
    });

    return {
      success: true,
      credentialId,
      status: 'active',
      issuanceDate: credential.issuanceDate,
      expiryDate: credential.expiryDate
    };
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

// Create Express app
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

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

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// Export for testing
export { IssuerService, app, issuer };

// Start server if run directly
const PORT = process.env.PORT || 3000;
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Issuer Service listening on port ${PORT}`);
  });
}
