// Wallet service for managing stored credentials
const storedCredentials = [];
const walletID = 'wallet-' + Math.random().toString(36).substr(2, 9);

/**
 * Store a credential in the mobile wallet
 * @param {Object} credential - The credential to store
 * @returns {Promise<Object>} - The stored credential with metadata
 */
export async function storeCredential(credential) {
  if (!credential.credentialId) {
    throw new Error('Credential must have a credentialId');
  }

  const stored = {
    ...credential,
    storedAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    shareCount: 0
  };

  storedCredentials.push(stored);
  return stored;
}

/**
 * Retrieve a credential from the wallet
 * @param {string} credentialId - The ID of the credential to retrieve
 * @returns {Promise<Object|null>} - The credential or null if not found
 */
export async function getCredential(credentialId) {
  const credential = storedCredentials.find(c => c.credentialId === credentialId);
  if (credential) {
    credential.lastAccessedAt = new Date().toISOString();
  }
  return credential || null;
}

/**
 * Get all stored credentials
 * @param {Object} filters - Optional filters (credentialType, issuer, etc.)
 * @returns {Promise<Array>} - Array of stored credentials
 */
export async function getStoredCredentials(filters = {}) {
  let results = storedCredentials;

  if (filters.credentialType) {
    results = results.filter(c => c.credentialType === filters.credentialType);
  }

  if (filters.issuer) {
    results = results.filter(c => c.issuer === filters.issuer);
  }

  if (filters.isExpired !== undefined) {
    results = results.filter(c => {
      const expired = new Date(c.expiresAt) < new Date();
      return filters.isExpired ? expired : !expired;
    });
  }

  return results;
}

/**
 * Delete a credential from the wallet
 * @param {string} credentialId - The ID of the credential to delete
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
export async function deleteCredential(credentialId) {
  const index = storedCredentials.findIndex(c => c.credentialId === credentialId);
  if (index !== -1) {
    storedCredentials.splice(index, 1);
    return true;
  }
  return false;
}

/**
 * Receive and store a credential from an issuer
 * @param {Object} credentialData - The credential data from QR/transfer
 * @returns {Promise<Object>} - The received and stored credential
 */
export async function receiveCredential(credentialData) {
  if (!credentialData.credentialId || !credentialData.issuerId) {
    throw new Error('Invalid credential data: missing credentialId or issuerId');
  }

  // Check if credential already exists
  const existing = await getCredential(credentialData.credentialId);
  if (existing) {
    throw new Error('Credential already exists in wallet');
  }

  // Store the credential
  const credential = {
    credentialId: credentialData.credentialId,
    issuerId: credentialData.issuerId,
    credentialType: credentialData.credentialType || 'UnknownType',
    issuer: credentialData.issuer || 'Unknown Issuer',
    issuedAt: credentialData.issuedAt || new Date().toISOString(),
    expiresAt: credentialData.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    ...credentialData
  };

  return await storeCredential(credential);
}

/**
 * Get wallet statistics
 * @returns {Promise<Object>} - Wallet statistics
 */
export async function getWalletStats() {
  const total = storedCredentials.length;
  const expired = storedCredentials.filter(c => new Date(c.expiresAt) < new Date()).length;
  const valid = total - expired;
  const byType = {};

  storedCredentials.forEach(c => {
    byType[c.credentialType] = (byType[c.credentialType] || 0) + 1;
  });

  return {
    walletId: walletID,
    totalCredentials: total,
    validCredentials: valid,
    expiredCredentials: expired,
    byType,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Export credentials for backup
 * @returns {Promise<Object>} - Encrypted credential backup data
 */
export async function exportCredentials() {
  return {
    walletId: walletID,
    exportedAt: new Date().toISOString(),
    credentials: storedCredentials.map(c => ({
      ...c,
      // In production, sensitive data would be encrypted
    })),
    count: storedCredentials.length
  };
}

/**
 * Import credentials from backup
 * @param {Object} backupData - The backup data to import
 * @returns {Promise<number>} - Number of imported credentials
 */
export async function importCredentials(backupData) {
  if (!backupData.credentials || !Array.isArray(backupData.credentials)) {
    throw new Error('Invalid backup format');
  }

  let imported = 0;
  for (const credential of backupData.credentials) {
    const existing = await getCredential(credential.credentialId);
    if (!existing) {
      await storeCredential(credential);
      imported++;
    }
  }

  return imported;
}

/**
 * Get wallet ID
 * @returns {string} - The wallet ID
 */
export function getWalletId() {
  return walletID;
}
