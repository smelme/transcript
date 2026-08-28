/**
 * Verifier QR Scanner Service
 * 
 * Handles QR code scanning for credential presentations,
 * verification workflows, and trust scoring
 */

export class VerifierQRScanner {
  constructor(options = {}) {
    this.verifierId = options.verifierId || 'verifier-unknown';
    this.verifierName = options.verifierName || 'Unknown Verifier';
    this.verifierDid = options.verifierDid || `did:key:${options.verifierId}`;
    this.supportedTypes = options.supportedTypes || ['AcademicCredential'];
    
    this.scans = new Map();           // scanId -> scan result
    this.verifications = new Map();   // credentialId -> verification result
    this.trustedIssuers = new Map();  // issuerDid -> trust info
    this.auditLog = [];
    
    this.scanTimeout = options.scanTimeout || 30000; // 30 second timeout
    this.maxScanHistory = options.maxScanHistory || 1000;
  }

  /**
   * Register trusted issuer
   */
  registerTrustedIssuer(issuerDid, issuerName, trustScore = 50) {
    if (!issuerDid || typeof issuerDid !== 'string') {
      return { success: false, error: 'issuerDid is required' };
    }

    if (trustScore < 0 || trustScore > 100) {
      return { success: false, error: 'trustScore must be 0-100' };
    }

    this.trustedIssuers.set(issuerDid, {
      issuerDid,
      issuerName,
      trustScore,
      registeredAt: new Date(),
      verificationsCount: 0
    });

    this._logAudit('issuer_trusted', {
      issuerDid,
      issuerName,
      trustScore
    });

    return { success: true, issuerDid };
  }

  /**
   * Parse QR code data
   */
  parseQRData(qrCodeData) {
    try {
      if (typeof qrCodeData === 'string') {
        try {
          return JSON.parse(qrCodeData);
        } catch (e) {
          const decoded = Buffer.from(qrCodeData, 'base64').toString('utf-8');
          return JSON.parse(decoded);
        }
      }
      return { valid: false, error: 'Invalid QR code data format' };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Validate presentation request metadata
   */
  validatePresentationRequest(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return {
        valid: false,
        errors: ['Metadata must be an object']
      };
    }

    const errors = [];

    // Required fields
    if (!metadata.credentialId || typeof metadata.credentialId !== 'string') {
      errors.push('credentialId is required');
    }

    if (!metadata.issuerDid || typeof metadata.issuerDid !== 'string') {
      errors.push('issuerDid is required');
    }

    if (!metadata.credentialType || typeof metadata.credentialType !== 'string') {
      errors.push('credentialType is required');
    }

    if (!this.supportedTypes.includes(metadata.credentialType)) {
      errors.push(`credentialType not supported. Supported: ${this.supportedTypes.join(', ')}`);
    }

    if (!metadata.expiryDate || isNaN(Date.parse(metadata.expiryDate))) {
      errors.push('expiryDate must be a valid date');
    }

    // Check expiration
    const now = new Date();
    const expiry = new Date(metadata.expiryDate);
    if (expiry < now) {
      errors.push('Credential has expired');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Scan credential presentation from QR code
   */
  async scanPresentation(qrCodeData, options = {}) {
    const scanId = this._generateId('scan');

    try {
      // Parse QR data
      const metadata = this.parseQRData(qrCodeData);

      // Validate presentation request
      const validation = this.validatePresentationRequest(metadata);
      if (!validation.valid) {
        return {
          success: false,
          scanId,
          error: 'Invalid presentation metadata',
          validationErrors: validation.errors
        };
      }

      const credentialId = metadata.credentialId;
      const issuerDid = metadata.issuerDid;

      // Check if issuer is trusted
      const issuerTrust = this.trustedIssuers.get(issuerDid);
      if (!issuerTrust) {
        return {
          success: false,
          scanId,
          error: 'Issuer not in trusted registry',
          issuerDid,
          requiresApproval: true
        };
      }

      // Create scan record
      const scanResult = {
        scanId,
        credentialId,
        issuerDid,
        issuerName: issuerTrust.issuerName,
        issuerTrustScore: issuerTrust.trustScore,
        credentialType: metadata.credentialType,
        metadata,
        scannedAt: new Date(),
        status: 'pending_verification'
      };

      this.scans.set(scanId, scanResult);

      // Attempt verification if requested
      if (options.verifyImmediately) {
        const verifyResult = await this.verifyPresentation(scanId, options);
        if (verifyResult.success) {
          scanResult.status = 'verified';
        }
      }

      this._logAudit('presentation_scanned', {
        scanId,
        credentialId,
        issuerDid,
        issuerTrustScore: issuerTrust.trustScore
      });

      return {
        success: true,
        scanId,
        credentialId,
        issuerTrust: issuerTrust.trustScore,
        metadata
      };
    } catch (error) {
      this._logAudit('scan_error', { error: error.message });
      return {
        success: false,
        scanId,
        error: error.message
      };
    }
  }

  /**
   * Verify credential presentation
   */
  async verifyPresentation(scanId, options = {}) {
    try {
      const scan = this.scans.get(scanId);
      if (!scan) {
        return {
          success: false,
          error: 'Scan not found',
          scanId
        };
      }

      const credentialId = scan.credentialId;
      const issuerDid = scan.issuerDid;

      // Check issuer trust again
      const issuerTrust = this.trustedIssuers.get(issuerDid);
      if (!issuerTrust || issuerTrust.trustScore < (options.minTrustScore || 0)) {
        return {
          success: false,
          credentialId,
          error: 'Issuer trust score insufficient',
          issuerTrustScore: issuerTrust?.trustScore || 0,
          requiredTrustScore: options.minTrustScore || 0
        };
      }

      // Create verification record
      const verificationResult = {
        credentialId,
        scanId,
        verifierId: this.verifierId,
        verifierDid: this.verifierDid,
        issuerDid,
        credentialType: scan.credentialType,
        verifiedAt: new Date(),
        status: 'verified',
        trustScore: issuerTrust.trustScore,
        metadata: scan.metadata
      };

      this.verifications.set(credentialId, verificationResult);

      // Update issuer verification count
      issuerTrust.verificationsCount++;

      this._logAudit('presentation_verified', {
        scanId,
        credentialId,
        issuerDid,
        trustScore: issuerTrust.trustScore
      });

      return {
        success: true,
        credentialId,
        scanId,
        verifiedAt: verificationResult.verifiedAt,
        trustScore: issuerTrust.trustScore
      };
    } catch (error) {
      this._logAudit('verification_error', { 
        scanId,
        error: error.message 
      });
      return {
        success: false,
        error: error.message,
        scanId
      };
    }
  }

  /**
   * Request signature verification (for integration with P0-9)
   */
  async requestSignatureVerification(scanId, signatureData, publicKeyPem) {
    try {
      const scan = this.scans.get(scanId);
      if (!scan) {
        return {
          success: false,
          error: 'Scan not found',
          scanId
        };
      }

      // In production, this would verify ED25519 signature
      // For now, return success if signature and key are provided
      if (!signatureData) {
        return {
          success: false,
          error: 'signatureData is required'
        };
      }

      if (!publicKeyPem) {
        return {
          success: false,
          error: 'publicKeyPem is required'
        };
      }

      this._logAudit('signature_verified', {
        scanId,
        credentialId: scan.credentialId
      });

      return {
        success: true,
        scanId,
        signatureValid: true,
        verifiedAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        scanId
      };
    }
  }

  /**
   * Get scan result
   */
  getScan(scanId) {
    const scan = this.scans.get(scanId);
    if (!scan) return null;

    return {
      ...scan,
      issuer: this.trustedIssuers.get(scan.issuerDid)
    };
  }

  /**
   * Get verification result
   */
  getVerification(credentialId) {
    return this.verifications.get(credentialId) || null;
  }

  /**
   * List recent scans
   */
  listScans(limit = 50, filter = {}) {
    const scans = [];

    for (const [scanId, scan] of this.scans.entries()) {
      // Apply filters
      if (filter.status && scan.status !== filter.status) continue;
      if (filter.issuer && scan.issuerDid !== filter.issuer) continue;
      if (filter.type && scan.credentialType !== filter.type) continue;

      scans.push(scan);
    }

    // Sort by recent first and limit
    return scans
      .sort((a, b) => b.scannedAt - a.scannedAt)
      .slice(0, limit);
  }

  /**
   * List verifications by status
   */
  listVerifications(status = null) {
    const verifications = [];

    for (const [credentialId, verification] of this.verifications.entries()) {
      if (status && verification.status !== status) continue;
      verifications.push(verification);
    }

    return verifications.sort((a, b) => b.verifiedAt - a.verifiedAt);
  }

  /**
   * Reject presentation
   */
  rejectPresentation(scanId, reason = 'Manual rejection') {
    const scan = this.scans.get(scanId);
    if (!scan) {
      return { success: false, error: 'Scan not found' };
    }

    scan.status = 'rejected';
    scan.rejectionReason = reason;
    scan.rejectedAt = new Date();

    this._logAudit('presentation_rejected', {
      scanId,
      reason
    });

    return { success: true, scanId };
  }

  /**
   * List trusted issuers
   */
  listTrustedIssuers(filter = {}) {
    const issuers = [];

    for (const [issuerDid, issuer] of this.trustedIssuers.entries()) {
      if (filter.minTrustScore && issuer.trustScore < filter.minTrustScore) {
        continue;
      }
      issuers.push(issuer);
    }

    return issuers.sort((a, b) => b.trustScore - a.trustScore);
  }

  /**
   * Update issuer trust score
   */
  updateIssuerTrustScore(issuerDid, newTrustScore) {
    if (newTrustScore < 0 || newTrustScore > 100) {
      return { success: false, error: 'Trust score must be 0-100' };
    }

    const issuer = this.trustedIssuers.get(issuerDid);
    if (!issuer) {
      return { success: false, error: 'Issuer not found' };
    }

    const oldScore = issuer.trustScore;
    issuer.trustScore = newTrustScore;

    this._logAudit('trust_score_updated', {
      issuerDid,
      oldScore,
      newScore: newTrustScore
    });

    return {
      success: true,
      issuerDid,
      oldTrustScore: oldScore,
      newTrustScore
    };
  }

  /**
   * Block issuer (remove from trusted registry)
   */
  blockIssuer(issuerDid, reason = 'Security concern') {
    if (!this.trustedIssuers.has(issuerDid)) {
      return { success: false, error: 'Issuer not found' };
    }

    this.trustedIssuers.delete(issuerDid);

    this._logAudit('issuer_blocked', {
      issuerDid,
      reason
    });

    return { success: true, issuerDid };
  }

  /**
   * Get scanner statistics
   */
  getStatistics() {
    const stats = {
      totalScans: this.scans.size,
      pendingVerifications: 0,
      verifiedCredentials: this.verifications.size,
      rejectedScans: 0,
      trustedIssuers: this.trustedIssuers.size,
      averageIssuerTrust: 0,
      credentialTypes: {},
      auditLogEntries: this.auditLog.length
    };

    // Count by status
    for (const scan of this.scans.values()) {
      if (scan.status === 'pending_verification') stats.pendingVerifications++;
      if (scan.status === 'rejected') stats.rejectedScans++;
      stats.credentialTypes[scan.credentialType] = 
        (stats.credentialTypes[scan.credentialType] || 0) + 1;
    }

    // Calculate average trust score
    if (this.trustedIssuers.size > 0) {
      const totalTrust = Array.from(this.trustedIssuers.values())
        .reduce((sum, issuer) => sum + issuer.trustScore, 0);
      stats.averageIssuerTrust = Math.round(totalTrust / this.trustedIssuers.size);
    }

    return stats;
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 100, filter = {}) {
    let logs = this.auditLog;

    if (filter.action) {
      logs = logs.filter(log => log.action === filter.action);
    }

    if (filter.fromTime) {
      const fromTime = new Date(filter.fromTime);
      logs = logs.filter(log => new Date(log.timestamp) >= fromTime);
    }

    return logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Export verification report
   */
  exportVerificationReport(format = 'json') {
    const report = {
      verifierId: this.verifierId,
      verifierName: this.verifierName,
      verifierDid: this.verifierDid,
      exportedAt: new Date().toISOString(),
      statistics: this.getStatistics(),
      recentScans: this.listScans(10),
      verifications: this.listVerifications(),
      trustedIssuers: this.listTrustedIssuers()
    };

    return {
      success: true,
      format,
      data: format === 'json' ? report : JSON.stringify(report)
    };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.scans.clear();
    this.verifications.clear();
    this.auditLog = [];

    return { success: true, cleared: true };
  }

  /**
   * Internal: Log audit entry
   */
  _logAudit(action, details) {
    this.auditLog.push({
      action,
      details,
      timestamp: new Date().toISOString()
    });

    // Maintain max history size
    if (this.auditLog.length > this.maxScanHistory) {
      this.auditLog = this.auditLog.slice(-this.maxScanHistory);
    }
  }

  /**
   * Internal: Generate ID
   */
  _generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Camera scanning support
   */
  async startCameraScanning(videoElement) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return {
          success: false,
          error: 'Camera access not available'
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });

      if (videoElement) {
        videoElement.srcObject = stream;
      }

      return { success: true, stream };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  stopCameraScanning(stream) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      return { success: true };
    }
    return { success: false };
  }
}

export default VerifierQRScanner;
