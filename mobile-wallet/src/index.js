/**
 * Mobile Wallet Service
 * 
 * Cross-platform digital credential wallet for iOS and Android
 * Supports credential reception, storage, presentation, and management
 */

import { v4 as uuidv4 } from 'uuid';

export class MobileWallet {
  constructor(options = {}) {
    this.walletId = options.walletId || `wallet-${uuidv4()}`;
    this.userId = options.userId || null;
    this.deviceName = options.deviceName || 'Mobile Device';
    this.platform = options.platform || 'unknown'; // ios, android, web
    
    this.credentials = new Map();           // credentialId -> credential
    this.receivedCredentials = new Map();  // credentialId -> received metadata
    this.presentations = new Map();        // presentationId -> presentation
    this.shareHistory = new Map();         // sessionId -> share history
    this.pinCode = options.pinCode || null;
    this.biometricEnabled = options.biometricEnabled || false;
    
    this.maxStorage = options.maxStorage || 104857600; // 100MB default
    this.currentStorageUsed = 0;
    this.autoLock = options.autoLock || 300000; // 5 minutes default
    this.lastActivityTime = new Date();
    this.locked = false;
    
    this.auditLog = [];
    this.maxAuditLog = 1000;
  }

  /**
   * Setup wallet (initialization on first launch)
   */
  setupWallet(userId, pinCode, options = {}) {
    if (!userId) {
      return { success: false, error: 'userId is required' };
    }

    if (!pinCode || pinCode.length < 4) {
      return { success: false, error: 'PIN must be at least 4 digits' };
    }

    this.userId = userId;
    this.pinCode = this._hashPin(pinCode);
    this.biometricEnabled = options.biometricEnabled || false;

    this._logAudit('wallet_setup', { userId });

    return {
      success: true,
      walletId: this.walletId,
      userId
    };
  }

  /**
   * Authenticate to wallet
   */
  authenticate(pinOrBiometric) {
    if (this.locked) {
      return { success: false, error: 'Wallet is locked' };
    }

    if (!this.pinCode) {
      return { success: false, error: 'Wallet not initialized' };
    }

    // Check PIN
    if (typeof pinOrBiometric === 'string') {
      const hashedInput = this._hashPin(pinOrBiometric);
      if (hashedInput !== this.pinCode) {
        this._logAudit('authentication_failed', { reason: 'invalid_pin' });
        return { success: false, error: 'Invalid PIN' };
      }
    }

    this.locked = false;
    this.lastActivityTime = new Date();
    this._logAudit('authentication_success', {});

    return { success: true, authenticated: true };
  }

  /**
   * Lock wallet
   */
  lockWallet() {
    this.locked = true;
    this._logAudit('wallet_locked', {});
    return { success: true, locked: true };
  }

  /**
   * Add credential to wallet
   */
  addCredential(credentialId, credentialData, metadata = {}) {
    if (!credentialId) {
      return { success: false, error: 'credentialId is required' };
    }

    if (!credentialData || typeof credentialData !== 'object') {
      return { success: false, error: 'credentialData is required' };
    }

    // Check storage
    const credSize = JSON.stringify(credentialData).length;
    if (this.currentStorageUsed + credSize > this.maxStorage) {
      return { success: false, error: 'Insufficient storage' };
    }

    // Check if credential already exists
    if (this.credentials.has(credentialId)) {
      return { success: false, error: 'Credential already exists' };
    }

    // Store credential
    const storedCred = {
      id: credentialId,
      data: credentialData,
      metadata: {
        issuer: metadata.issuer || 'unknown',
        type: metadata.type || 'unknown',
        receivedAt: new Date(),
        ...metadata
      },
      size: credSize,
      pinned: false,
      shared: false
    };

    this.credentials.set(credentialId, storedCred);
    this.receivedCredentials.set(credentialId, metadata);
    this.currentStorageUsed += credSize;

    this._logAudit('credential_added', {
      credentialId,
      issuer: metadata.issuer,
      type: metadata.type,
      size: credSize
    });

    this.lastActivityTime = new Date();

    return {
      success: true,
      credentialId,
      size: credSize,
      storageUsed: this.currentStorageUsed
    };
  }

  /**
   * Get credential
   */
  getCredential(credentialId) {
    const cred = this.credentials.get(credentialId);
    if (!cred) return null;

    this.lastActivityTime = new Date();
    return cred;
  }

  /**
   * List credentials
   */
  listCredentials(filter = {}) {
    const creds = [];

    for (const [id, cred] of this.credentials.entries()) {
      // Apply filters
      if (filter.type && cred.metadata.type !== filter.type) continue;
      if (filter.issuer && cred.metadata.issuer !== filter.issuer) continue;
      if (filter.pinned !== undefined && cred.pinned !== filter.pinned) continue;

      creds.push({
        id: cred.id,
        type: cred.metadata.type,
        issuer: cred.metadata.issuer,
        receivedAt: cred.metadata.receivedAt,
        pinned: cred.pinned,
        size: cred.size
      });
    }

    this.lastActivityTime = new Date();

    return creds.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
  }

  /**
   * Delete credential
   */
  deleteCredential(credentialId) {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      return { success: false, error: 'Credential not found' };
    }

    this.credentials.delete(credentialId);
    this.receivedCredentials.delete(credentialId);
    this.currentStorageUsed -= cred.size;

    this._logAudit('credential_deleted', { credentialId });
    this.lastActivityTime = new Date();

    return {
      success: true,
      credentialId,
      storageFreed: cred.size
    };
  }

  /**
   * Pin credential (favorite)
   */
  pinCredential(credentialId) {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      return { success: false, error: 'Credential not found' };
    }

    cred.pinned = true;
    this._logAudit('credential_pinned', { credentialId });
    this.lastActivityTime = new Date();

    return { success: true, credentialId, pinned: true };
  }

  /**
   * Unpin credential
   */
  unpinCredential(credentialId) {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      return { success: false, error: 'Credential not found' };
    }

    cred.pinned = false;
    this._logAudit('credential_unpinned', { credentialId });
    this.lastActivityTime = new Date();

    return { success: true, credentialId, pinned: false };
  }

  /**
   * Initiate credential presentation
   */
  initiatePresentation(credentialId, verifierId, claimsRequested = null) {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      return { success: false, error: 'Credential not found' };
    }

    const presentationId = `pres-${uuidv4()}`;
    const presentation = {
      id: presentationId,
      credentialId,
      verifierId,
      status: 'initiated',
      claimsRequested,
      claims: claimsRequested ? this._selectiveDisclose(cred.data, claimsRequested) : cred.data,
      initiatedAt: new Date(),
      approvedAt: null,
      sharedAt: null
    };

    this.presentations.set(presentationId, presentation);

    this._logAudit('presentation_initiated', {
      presentationId,
      credentialId,
      verifierId
    });

    this.lastActivityTime = new Date();

    return {
      success: true,
      presentationId,
      credentialId,
      status: 'initiated'
    };
  }

  /**
   * Approve presentation
   */
  approvePresentation(presentationId, pinCode = null) {
    const presentation = this.presentations.get(presentationId);
    if (!presentation) {
      return { success: false, error: 'Presentation not found' };
    }

    // Verify PIN if required
    if (this.pinCode && pinCode) {
      const hashedInput = this._hashPin(pinCode);
      if (hashedInput !== this.pinCode) {
        return { success: false, error: 'Invalid PIN' };
      }
    }

    presentation.status = 'approved';
    presentation.approvedAt = new Date();

    this._logAudit('presentation_approved', { presentationId });
    this.lastActivityTime = new Date();

    return {
      success: true,
      presentationId,
      status: 'approved',
      claims: presentation.claims
    };
  }

  /**
   * Reject presentation
   */
  rejectPresentation(presentationId) {
    const presentation = this.presentations.get(presentationId);
    if (!presentation) {
      return { success: false, error: 'Presentation not found' };
    }

    presentation.status = 'rejected';

    this._logAudit('presentation_rejected', { presentationId });
    this.lastActivityTime = new Date();

    return {
      success: true,
      presentationId,
      status: 'rejected'
    };
  }

  /**
   * Get presentation status
   */
  getPresentationStatus(presentationId) {
    const presentation = this.presentations.get(presentationId);
    if (!presentation) return null;

    this.lastActivityTime = new Date();

    return {
      id: presentation.id,
      credentialId: presentation.credentialId,
      verifierId: presentation.verifierId,
      status: presentation.status,
      initiatedAt: presentation.initiatedAt,
      approvedAt: presentation.approvedAt
    };
  }

  /**
   * Get presentation history
   */
  getPresentationHistory(limit = 50) {
    const history = Array.from(this.presentations.values())
      .sort((a, b) => b.initiatedAt - a.initiatedAt)
      .slice(0, limit);

    this.lastActivityTime = new Date();

    return history.map(p => ({
      id: p.id,
      credentialId: p.credentialId,
      verifierId: p.verifierId,
      status: p.status,
      initiatedAt: p.initiatedAt
    }));
  }

  /**
   * Share credential via NFC/Bluetooth
   */
  shareCredential(credentialId, shareMethod = 'qr', options = {}) {
    const cred = this.credentials.get(credentialId);
    if (!cred) {
      return { success: false, error: 'Credential not found' };
    }

    const shareSessionId = `share-${uuidv4()}`;
    const shareData = {
      sessionId: shareSessionId,
      credentialId,
      method: shareMethod,
      sharedAt: new Date(),
      expiresAt: new Date(Date.now() + (options.ttl || 300000)), // 5 min default
      shared: false
    };

    this.shareHistory.set(shareSessionId, shareData);

    this._logAudit('credential_share_initiated', {
      credentialId,
      method: shareMethod
    });

    this.lastActivityTime = new Date();

    return {
      success: true,
      sessionId: shareSessionId,
      credentialId,
      method: shareMethod,
      expiresAt: shareData.expiresAt
    };
  }

  /**
   * Selective disclosure
   */
  _selectiveDisclose(credentialData, claimsRequested) {
    if (!Array.isArray(claimsRequested)) {
      return credentialData;
    }

    const disclosed = {};
    for (const claim of claimsRequested) {
      if (claim in credentialData) {
        disclosed[claim] = credentialData[claim];
      }
    }

    return disclosed;
  }

  /**
   * Get wallet statistics
   */
  getStatistics() {
    return {
      walletId: this.walletId,
      userId: this.userId,
      platform: this.platform,
      totalCredentials: this.credentials.size,
      pinnedCredentials: Array.from(this.credentials.values())
        .filter(c => c.pinned).length,
      storageUsed: this.currentStorageUsed,
      storageTotal: this.maxStorage,
      storagePercentage: Math.round((this.currentStorageUsed / this.maxStorage) * 100),
      totalPresentations: this.presentations.size,
      biometricEnabled: this.biometricEnabled,
      locked: this.locked,
      lastActivity: this.lastActivityTime,
      credentialTypes: this._getCredentialTypes(),
      issuers: this._getIssuers()
    };
  }

  /**
   * Get credential types breakdown
   */
  _getCredentialTypes() {
    const types = {};
    for (const cred of this.credentials.values()) {
      types[cred.metadata.type] = (types[cred.metadata.type] || 0) + 1;
    }
    return types;
  }

  /**
   * Get issuers breakdown
   */
  _getIssuers() {
    const issuers = {};
    for (const cred of this.credentials.values()) {
      issuers[cred.metadata.issuer] = (issuers[cred.metadata.issuer] || 0) + 1;
    }
    return issuers;
  }

  /**
   * Export wallet backup
   */
  exportBackup() {
    const backup = {
      version: '1.0',
      walletId: this.walletId,
      userId: this.userId,
      exportedAt: new Date().toISOString(),
      credentialCount: this.credentials.size,
      credentials: Array.from(this.credentials.values()).map(c => ({
        id: c.id,
        data: c.data,
        metadata: c.metadata,
        pinned: c.pinned
      }))
    };

    this._logAudit('wallet_backup_exported', {});
    this.lastActivityTime = new Date();

    return { success: true, backup };
  }

  /**
   * Import wallet backup
   */
  importBackup(backup) {
    try {
      if (!backup.credentials || !Array.isArray(backup.credentials)) {
        return { success: false, error: 'Invalid backup format' };
      }

      let imported = 0;
      const errors = [];

      for (const cred of backup.credentials) {
        if (!cred.id || !cred.data) {
          errors.push(`Skipped credential without id or data`);
          continue;
        }

        const result = this.addCredential(cred.id, cred.data, cred.metadata);
        if (result.success) {
          imported++;
          if (cred.pinned) {
            this.pinCredential(cred.id);
          }
        } else {
          errors.push(`Failed to import ${cred.id}: ${result.error}`);
        }
      }

      this._logAudit('wallet_backup_imported', { imported });
      this.lastActivityTime = new Date();

      return {
        success: true,
        imported,
        total: backup.credentials.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear wallet (reset)
   */
  clearWallet() {
    this.credentials.clear();
    this.receivedCredentials.clear();
    this.presentations.clear();
    this.shareHistory.clear();
    this.currentStorageUsed = 0;

    this._logAudit('wallet_cleared', {});

    return { success: true, cleared: true };
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 50) {
    return this.auditLog
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * Check auto-lock
   */
  checkAutoLock() {
    const timeSinceActivity = Date.now() - this.lastActivityTime.getTime();
    if (timeSinceActivity > this.autoLock) {
      this.locked = true;
      this._logAudit('wallet_auto_locked', {});
      return { autoLocked: true };
    }
    return { autoLocked: false };
  }

  /**
   * Internal: Hash PIN
   */
  _hashPin(pin) {
    // Simple hash for testing (production: use bcrypt or similar)
    return `hashed_${pin}`;
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

    if (this.auditLog.length > this.maxAuditLog) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLog);
    }
  }
}

export default MobileWallet;
