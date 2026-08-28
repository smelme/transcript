import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

dotenv.config();

// Verifier Service - Handles credential verification and validation
class VerifierService {
  constructor(options = {}) {
    this.verifierId = options.verifierId || `verifier-${uuidv4()}`;
    this.verifierName = options.verifierName || 'Smart College Verifier';
    this.verificationTypes = options.verificationTypes || ['academic', 'employment', 'government'];
    
    // Storage
    this.verifications = new Map(); // verificationId -> verification result
    this.trustedIssuers = new Map(); // issuerId -> { name, trustScore, verificationTypes, status }
    this.blockedIssuers = new Set(); // Set of blocked issuer IDs
    this.auditLog = [];
    this.statistics = {
      totalVerifications: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      byIssuer: {},
      byType: {},
      byStatus: {}
    };

    // Validation
    this.ajv = new Ajv();
    addFormats(this.ajv);
    this.validateCredentialPresentation = this.ajv.compile({
      type: 'object',
      required: ['credentialId', 'issuerId', 'credentialType'],
      properties: {
        credentialId: { type: 'string' },
        issuerId: { type: 'string' },
        issuerDid: { type: 'string' },
        credentialType: { type: 'string' },
        studentId: { type: 'string' },
        name: { type: 'object' },
        issuanceDate: { type: 'string', format: 'date' },
        expiryDate: { type: 'string', format: 'date' }
      }
    });
  }

  // Register trusted issuer
  registerIssuer(issuerData) {
    if (!issuerData.issuerId || !issuerData.issuerName) {
      return { success: false, error: 'Missing issuerId or issuerName' };
    }

    if (this.trustedIssuers.has(issuerData.issuerId)) {
      return { success: false, error: 'Issuer already registered' };
    }

    const issuer = {
      issuerId: issuerData.issuerId,
      issuerName: issuerData.issuerName,
      verificationTypes: issuerData.verificationTypes || ['academic'],
      trustScore: issuerData.trustScore || 50, // Default to neutral
      status: 'pending',
      registeredAt: new Date().toISOString(),
      verificationsCount: 0
    };

    this.trustedIssuers.set(issuerData.issuerId, issuer);

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'issuer_registered',
      issuerId: issuerData.issuerId,
      details: { issuerName: issuerData.issuerName }
    });

    return { success: true, issuerId: issuerData.issuerId, status: 'pending' };
  }

  // Approve issuer
  approveIssuer(issuerId) {
    const issuer = this.trustedIssuers.get(issuerId);
    if (!issuer) {
      return { success: false, error: 'Issuer not found' };
    }

    issuer.status = 'approved';
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'issuer_approved',
      issuerId,
      details: {}
    });

    return { success: true, issuerId, status: 'approved' };
  }

  // Block issuer
  blockIssuer(issuerId, reason = 'Security concern') {
    if (!this.trustedIssuers.has(issuerId)) {
      return { success: false, error: 'Issuer not found' };
    }

    this.blockedIssuers.add(issuerId);
    const issuer = this.trustedIssuers.get(issuerId);
    issuer.status = 'blocked';

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'issuer_blocked',
      issuerId,
      details: { reason }
    });

    return { success: true, issuerId, status: 'blocked' };
  }

  // Update trust score
  updateTrustScore(issuerId, newScore) {
    const issuer = this.trustedIssuers.get(issuerId);
    if (!issuer) {
      return { success: false, error: 'Issuer not found' };
    }

    if (newScore < 0 || newScore > 100) {
      return { success: false, error: 'Trust score must be between 0 and 100' };
    }

    const oldScore = issuer.trustScore;
    issuer.trustScore = newScore;

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'trust_score_updated',
      issuerId,
      details: { oldScore, newScore }
    });

    return { success: true, issuerId, trustScore: newScore };
  }

  // Get issuer trust score
  getTrustScore(issuerId) {
    const issuer = this.trustedIssuers.get(issuerId);
    if (!issuer) {
      return { success: false, error: 'Issuer not found' };
    }

    return {
      success: true,
      issuerId,
      trustScore: issuer.trustScore,
      status: issuer.status,
      verificationsCount: issuer.verificationsCount
    };
  }

  // Scan and verify presentation (QR code data)
  scanPresentation(qrPayload) {
    if (!qrPayload.credentialId || !qrPayload.issuerId) {
      return { success: false, error: 'Invalid QR payload' };
    }

    // Validate format
    if (!this.validateCredentialPresentation(qrPayload)) {
      return { success: false, error: 'Invalid credential presentation format' };
    }

    const verificationId = uuidv4();
    const now = new Date();

    // Check if issuer is blocked
    if (this.blockedIssuers.has(qrPayload.issuerId)) {
      const verification = {
        verificationId,
        credentialId: qrPayload.credentialId,
        issuerId: qrPayload.issuerId,
        status: 'rejected',
        reason: 'Issuer is blocked',
        createdAt: now.toISOString()
      };

      this.verifications.set(verificationId, verification);
      this.statistics.totalVerifications++;
      this.statistics.rejectedCount++;
      this.statistics.byStatus['rejected'] = (this.statistics.byStatus['rejected'] || 0) + 1;

      return {
        success: false,
        verificationId,
        status: 'rejected',
        reason: 'Issuer is blocked',
        trustScore: 0
      };
    }

    // Check issuer trust
    const issuer = this.trustedIssuers.get(qrPayload.issuerId);
    if (!issuer || issuer.status !== 'approved') {
      const verification = {
        verificationId,
        credentialId: qrPayload.credentialId,
        issuerId: qrPayload.issuerId,
        status: 'pending_verification',
        reason: 'Issuer not trusted or pending approval',
        createdAt: now.toISOString()
      };

      this.verifications.set(verificationId, verification);
      this.statistics.totalVerifications++;
      this.statistics.byStatus['pending'] = (this.statistics.byStatus['pending'] || 0) + 1;

      return {
        success: false,
        verificationId,
        status: 'pending_verification',
        reason: 'Issuer not trusted',
        trustScore: issuer?.trustScore || 0
      };
    }

    // Verification successful
    const verification = {
      verificationId,
      credentialId: qrPayload.credentialId,
      issuerId: qrPayload.issuerId,
      credentialType: qrPayload.credentialType,
      studentId: qrPayload.studentId,
      status: 'verified',
      trustScore: issuer.trustScore,
      createdAt: now.toISOString()
    };

    this.verifications.set(verificationId, verification);

    // Update statistics
    this.statistics.totalVerifications++;
    this.statistics.verifiedCount++;
    this.statistics.byStatus['verified'] = (this.statistics.byStatus['verified'] || 0) + 1;
    this.statistics.byIssuer[qrPayload.issuerId] = 
      (this.statistics.byIssuer[qrPayload.issuerId] || 0) + 1;
    this.statistics.byType[qrPayload.credentialType] = 
      (this.statistics.byType[qrPayload.credentialType] || 0) + 1;

    issuer.verificationsCount++;

    this.auditLog.push({
      timestamp: now.toISOString(),
      action: 'credential_verified',
      credentialId: qrPayload.credentialId,
      issuerId: qrPayload.issuerId,
      details: { studentId: qrPayload.studentId, trustScore: issuer.trustScore }
    });

    return {
      success: true,
      verificationId,
      status: 'verified',
      trustScore: issuer.trustScore,
      studentId: qrPayload.studentId
    };
  }

  // Reject verification
  rejectVerification(verificationId, reason = 'Manual rejection') {
    const verification = this.verifications.get(verificationId);
    if (!verification) {
      return { success: false, error: 'Verification not found' };
    }

    if (verification.status === 'rejected') {
      return { success: false, error: 'Already rejected' };
    }

    verification.status = 'rejected';
    verification.rejectionReason = reason;

    this.statistics.rejectedCount++;
    this.statistics.byStatus[verification.status] = 
      (this.statistics.byStatus[verification.status] || 0) + 1;

    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action: 'verification_rejected',
      verificationId,
      details: { reason }
    });

    return { success: true, verificationId, status: 'rejected' };
  }

  // Get verification details
  getVerification(verificationId) {
    const verification = this.verifications.get(verificationId);
    if (!verification) {
      return { success: false, error: 'Verification not found' };
    }

    return { success: true, verification };
  }

  // List verifications
  listVerifications(filters = {}) {
    let results = Array.from(this.verifications.values());

    if (filters.status) {
      results = results.filter(v => v.status === filters.status);
    }
    if (filters.issuerId) {
      results = results.filter(v => v.issuerId === filters.issuerId);
    }
    if (filters.credentialType) {
      results = results.filter(v => v.credentialType === filters.credentialType);
    }

    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      success: true,
      verifications: results.slice(start, end),
      total: results.length,
      page,
      pageSize
    };
  }

  // List trusted issuers
  listIssuers(filters = {}) {
    let results = Array.from(this.trustedIssuers.values());

    if (filters.status) {
      results = results.filter(i => i.status === filters.status);
    }
    if (filters.verificationTypes) {
      results = results.filter(i => 
        filters.verificationTypes.some(type => i.verificationTypes.includes(type))
      );
    }

    return {
      success: true,
      issuers: results,
      total: results.length
    };
  }

  // Get statistics
  getStatistics() {
    return {
      verifierId: this.verifierId,
      verifierName: this.verifierName,
      ...this.statistics,
      trustedIssuersCount: this.trustedIssuers.size,
      blockedIssuersCount: this.blockedIssuers.size
    };
  }

  // Get audit log
  getAuditLog(filters = {}) {
    let log = [...this.auditLog];

    if (filters.action) {
      log = log.filter(entry => entry.action === filters.action);
    }
    if (filters.issuerId) {
      log = log.filter(entry => entry.issuerId === filters.issuerId);
    }
    if (filters.limit) {
      log = log.slice(-filters.limit);
    }

    return { success: true, auditLog: log, total: log.length };
  }

  // Clear all data
  clear() {
    this.verifications.clear();
    this.trustedIssuers.clear();
    this.blockedIssuers.clear();
    this.auditLog = [];
    this.statistics = {
      totalVerifications: 0,
      verifiedCount: 0,
      rejectedCount: 0,
      byIssuer: {},
      byType: {},
      byStatus: {}
    };
    return { success: true };
  }
}

// Initialize service
const verifier = new VerifierService({
  verifierId: process.env.VERIFIER_ID || 'verifier-001',
  verifierName: process.env.VERIFIER_NAME || 'Smart College Verifier'
});

// Create Express app
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', verifierId: verifier.verifierId });
});

// Scan and verify credential
app.post('/verify/scan', (req, res) => {
  const result = verifier.scanPresentation(req.body);
  res.status(result.success ? 200 : 400).json(result);
});

// Get verification result
app.get('/verify/verification/:id', (req, res) => {
  const result = verifier.getVerification(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// Reject verification
app.post('/verify/verification/:id/reject', (req, res) => {
  const result = verifier.rejectVerification(req.params.id, req.body.reason);
  res.status(result.success ? 200 : 404).json(result);
});

// List verifications
app.get('/verify/verifications', (req, res) => {
  const filters = {
    status: req.query.status,
    issuerId: req.query.issuerId,
    credentialType: req.query.credentialType,
    page: parseInt(req.query.page) || 1,
    pageSize: parseInt(req.query.pageSize) || 20
  };
  const result = verifier.listVerifications(filters);
  res.json(result);
});

// Statistics
app.get('/verify/statistics', (req, res) => {
  const stats = verifier.getStatistics();
  res.json({ success: true, statistics: stats });
});

// Register issuer
app.post('/registry/verifiers', (req, res) => {
  const result = verifier.registerIssuer(req.body);
  res.status(result.success ? 201 : 400).json(result);
});

// List issuers
app.get('/registry/verifiers', (req, res) => {
  const filters = {
    status: req.query.status,
    verificationTypes: req.query.verificationTypes?.split(',')
  };
  const result = verifier.listIssuers(filters);
  res.json(result);
});

// Get issuer trust score
app.get('/registry/verifiers/:id/trust-score', (req, res) => {
  const result = verifier.getTrustScore(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// Approve issuer
app.post('/registry/verifiers/:id/approve', (req, res) => {
  const result = verifier.approveIssuer(req.params.id);
  res.status(result.success ? 200 : 404).json(result);
});

// Update trust score
app.put('/registry/verifiers/:id/trust-score', (req, res) => {
  const result = verifier.updateTrustScore(req.params.id, req.body.trustScore);
  res.status(result.success ? 200 : 400).json(result);
});

// Block issuer
app.post('/registry/verifiers/:id/block', (req, res) => {
  const result = verifier.blockIssuer(req.params.id, req.body.reason);
  res.status(result.success ? 200 : 404).json(result);
});

// Audit log
app.get('/audit-log', (req, res) => {
  const filters = {
    action: req.query.action,
    issuerId: req.query.issuerId,
    limit: parseInt(req.query.limit) || 100
  };
  const result = verifier.getAuditLog(filters);
  res.json(result);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: err.message });
});

// Export for testing
export { VerifierService, app, verifier };

// Start server if run directly
const PORT = process.env.PORT || 3001;
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Verifier Service listening on port ${PORT}`);
  });
}
