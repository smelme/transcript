/**
 * Wallet QR Receiver Service
 * 
 * Handles QR code scanning, credential reception,
 * and credential storage in the mobile wallet
 */

export class WalletQRReceiver {
  constructor(options = {}) {
    this.credentials = new Map(); // credentialId -> credential
    this.receivedAt = new Map(); // credentialId -> timestamp
    this.namespace = options.namespace || 'org.smartcollege.credential';
    this.maxStorageSize = options.maxStorageSize || 52428800; // 50MB default
    this.autoSync = options.autoSync || false;
  }

  /**
   * Parse QR code data
   */
  parseQRData(qrCodeData) {
    try {
      // QR code contains BASE64-encoded credential metadata
      if (typeof qrCodeData === 'string') {
        // Try JSON parsing first
        try {
          return JSON.parse(qrCodeData);
        } catch (e) {
          // If not JSON, assume BASE64
          const decoded = Buffer.from(qrCodeData, 'base64').toString('utf-8');
          return JSON.parse(decoded);
        }
      }

      return {
        valid: false,
        error: 'Invalid QR code data format'
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Validate credential metadata from QR
   */
  validateCredentialMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') {
      return {
        valid: false,
        errors: ['Metadata must be an object']
      };
    }

    const errors = [];

    // Required fields
    if (!metadata.credentialId || typeof metadata.credentialId !== 'string') {
      errors.push('credentialId is required and must be a string');
    }

    if (!metadata.issuerDid || typeof metadata.issuerDid !== 'string') {
      errors.push('issuerDid is required and must be a string');
    }

    if (!metadata.credentialType || typeof metadata.credentialType !== 'string') {
      errors.push('credentialType is required and must be a string');
    }

    if (!metadata.issueDate || isNaN(Date.parse(metadata.issueDate))) {
      errors.push('issueDate is required and must be a valid date');
    }

    if (!metadata.expiryDate || isNaN(Date.parse(metadata.expiryDate))) {
      errors.push('expiryDate is required and must be a valid date');
    }

    // Optional but recommended
    if (metadata.claimsHash && typeof metadata.claimsHash !== 'string') {
      errors.push('claimsHash must be a string');
    }

    if (metadata.qrCodeId && typeof metadata.qrCodeId !== 'string') {
      errors.push('qrCodeId must be a string');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Receive credential from QR code
   */
  async receiveCredential(qrCodeData, options = {}) {
    try {
      // Parse QR data
      const metadata = this.parseQRData(qrCodeData);

      // Validate metadata
      const validation = this.validateCredentialMetadata(metadata);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Invalid credential metadata',
          validationErrors: validation.errors
        };
      }

      const credentialId = metadata.credentialId;

      // Check if already received
      if (this.credentials.has(credentialId)) {
        return {
          success: false,
          error: 'Credential already received',
          credentialId
        };
      }

      // Store credential metadata
      this.credentials.set(credentialId, metadata);
      this.receivedAt.set(credentialId, new Date());

      // Verify with verifier if option provided
      if (options.verifyWithIssuer) {
        const verifyResult = await this.verifyWithIssuer(credentialId, metadata);
        if (!verifyResult.success) {
          // Remove credential if verification failed
          this.credentials.delete(credentialId);
          this.receivedAt.delete(credentialId);
          return verifyResult;
        }
      }

      return {
        success: true,
        credentialId,
        metadata,
        receivedAt: this.receivedAt.get(credentialId)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify credential with issuer
   */
  async verifyWithIssuer(credentialId, metadata) {
    try {
      // In production, this would call issuer verification endpoint
      // For now, simulate verification
      if (!metadata.issuerDid) {
        return {
          success: false,
          error: 'Cannot verify: issuerDid missing'
        };
      }

      // Simulate network call
      return {
        success: true,
        credentialId,
        verified: true,
        verifiedAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: `Verification failed: ${error.message}`
      };
    }
  }

  /**
   * Get credential by ID
   */
  getCredential(credentialId) {
    if (!this.credentials.has(credentialId)) {
      return null;
    }

    return {
      id: credentialId,
      metadata: this.credentials.get(credentialId),
      receivedAt: this.receivedAt.get(credentialId)
    };
  }

  /**
   * List all credentials
   */
  listCredentials(filter = {}) {
    const credentials = [];

    for (const [credentialId, metadata] of this.credentials.entries()) {
      const cred = {
        id: credentialId,
        metadata,
        receivedAt: this.receivedAt.get(credentialId)
      };

      // Apply filters
      if (filter.type && metadata.credentialType !== filter.type) {
        continue;
      }

      if (filter.issuer && metadata.issuerDid !== filter.issuer) {
        continue;
      }

      if (filter.status) {
        const isExpired = new Date(metadata.expiryDate) < new Date();
        if (filter.status === 'expired' && !isExpired) continue;
        if (filter.status === 'valid' && isExpired) continue;
      }

      credentials.push(cred);
    }

    return credentials;
  }

  /**
   * Delete credential
   */
  deleteCredential(credentialId) {
    if (!this.credentials.has(credentialId)) {
      return {
        success: false,
        error: 'Credential not found'
      };
    }

    this.credentials.delete(credentialId);
    this.receivedAt.delete(credentialId);

    return {
      success: true,
      credentialId
    };
  }

  /**
   * Check if credential is valid (not expired)
   */
  isCredentialValid(credentialId) {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return false;
    }

    const now = new Date();
    const expiry = new Date(credential.expiryDate);
    return expiry > now;
  }

  /**
   * Get credential status
   */
  getCredentialStatus(credentialId) {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return null;
    }

    const now = new Date();
    const expiry = new Date(credential.expiryDate);
    const issue = new Date(credential.issueDate);

    if (now < issue) {
      return 'pending';
    } else if (now > expiry) {
      return 'expired';
    } else {
      return 'valid';
    }
  }

  /**
   * Export credentials
   */
  exportCredentials(format = 'json') {
    const data = {
      version: '1.0',
      namespace: this.namespace,
      exportedAt: new Date().toISOString(),
      credentialCount: this.credentials.size,
      credentials: []
    };

    for (const [credentialId, metadata] of this.credentials.entries()) {
      data.credentials.push({
        id: credentialId,
        metadata,
        receivedAt: this.receivedAt.get(credentialId),
        status: this.getCredentialStatus(credentialId)
      });
    }

    return {
      success: true,
      format,
      data: format === 'json' ? data : JSON.stringify(data)
    };
  }

  /**
   * Import credentials
   */
  importCredentials(importData) {
    try {
      const data = typeof importData === 'string' ? JSON.parse(importData) : importData;

      if (!data.credentials || !Array.isArray(data.credentials)) {
        return {
          success: false,
          error: 'Invalid import format'
        };
      }

      let imported = 0;
      const errors = [];

      for (const cred of data.credentials) {
        if (!cred.id || !cred.metadata) {
          errors.push(`Skipped credential without id or metadata`);
          continue;
        }

        // Validate before importing
        const validation = this.validateCredentialMetadata(cred.metadata);
        if (!validation.valid) {
          errors.push(`Validation failed for ${cred.id}: ${validation.errors.join(', ')}`);
          continue;
        }

        // Import if not already present
        if (!this.credentials.has(cred.id)) {
          this.credentials.set(cred.id, cred.metadata);
          this.receivedAt.set(cred.id, new Date(cred.receivedAt || new Date()));
          imported++;
        }
      }

      return {
        success: true,
        imported,
        total: data.credentials.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get wallet statistics
   */
  getStatistics() {
    const credentials = this.listCredentials();
    const validCredentials = credentials.filter(c => this.isCredentialValid(c.id));
    const expiredCredentials = credentials.filter(c => !this.isCredentialValid(c.id));

    const types = {};
    const issuers = {};

    for (const cred of credentials) {
      types[cred.metadata.credentialType] = (types[cred.metadata.credentialType] || 0) + 1;
      issuers[cred.metadata.issuerDid] = (issuers[cred.metadata.issuerDid] || 0) + 1;
    }

    return {
      totalCredentials: credentials.length,
      validCredentials: validCredentials.length,
      expiredCredentials: expiredCredentials.length,
      credentialTypes: types,
      issuers,
      storageUsed: JSON.stringify(this.credentials).length
    };
  }

  /**
   * Clear all credentials
   */
  clear() {
    this.credentials.clear();
    this.receivedAt.clear();
    return { success: true, credentialsCleared: true };
  }

  /**
   * Scan QR code from image (in browser)
   */
  async scanQRFromImage(imageData) {
    try {
      // In production, use jsQR or similar library
      // For now, just parse as data URL or base64
      if (typeof imageData === 'string') {
        return this.parseQRData(imageData);
      }

      return {
        valid: false,
        error: 'Invalid image data'
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Scan QR code from camera stream (browser)
   */
  async startCameraScanning(videoElement, onQRDetected) {
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

      return {
        success: true,
        stream
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop camera scanning
   */
  stopCameraScanning(stream) {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      return { success: true };
    }
    return { success: false, error: 'No stream to stop' };
  }
}

export default WalletQRReceiver;
