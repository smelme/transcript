// NFC service for sharing credentials via NFC
import { getCredential } from './walletService.js';

/**
 * Share a credential via NFC
 * @param {Object} nfcPayload - The payload to share via NFC
 * @returns {Promise<Object>} - Confirmation of shared data
 */
export async function shareCredentialViaNFC(nfcPayload) {
  if (!nfcPayload.credentialId) {
    throw new Error('NFC payload must include credentialId');
  }

  // Retrieve credential from wallet
  const credential = await getCredential(nfcPayload.credentialId);
  if (!credential) {
    throw new Error('Credential not found in wallet');
  }

  // Prepare minimal payload for NFC transmission (limited to 4KB)
  const payload = {
    credentialId: credential.credentialId,
    issuerId: credential.issuerId,
    credentialType: credential.credentialType,
    timestamp: new Date().toISOString(),
    walletVersion: '1.0'
  };

  // In production, this would use react-native-nfc-manager to write to NFC tag
  // or share via NFC peer-to-peer
  return {
    success: true,
    shared: payload,
    sharedAt: new Date().toISOString(),
    shareSize: JSON.stringify(payload).length
  };
}

/**
 * Read credential from NFC tag
 * @returns {Promise<Object>} - The credential data read from NFC
 */
export async function readCredentialFromNFC() {
  // In production, this would use react-native-nfc-manager to read NFC tag
  return {
    credentialId: 'cred-nfc-001',
    issuerId: 'issuer-001',
    credentialType: 'AcademicCredential',
    readAt: new Date().toISOString()
  };
}

/**
 * Check if NFC is supported and enabled
 * @returns {Promise<boolean>} - True if NFC is available
 */
export async function isNFCAvailable() {
  // In production, this would use react-native-nfc-manager
  return true; // Placeholder
}

/**
 * Start NFC listener for incoming shares
 * @param {Function} onCredentialReceived - Callback when credential is received
 * @returns {Function} - Cleanup function
 */
export function startNFCListener(onCredentialReceived) {
  // In production, this would set up NFC listener
  const listenerInterval = setInterval(() => {
    // Simulate NFC reception
  }, 1000);

  return () => clearInterval(listenerInterval);
}

/**
 * Prepare credential for NFC sharing
 * @param {Object} credential - The credential to prepare
 * @returns {string} - NFC payload string
 */
export function encodeCredentialForNFC(credential) {
  const payload = {
    cid: credential.credentialId,
    iss: credential.issuerId,
    typ: credential.credentialType,
    ts: new Date().toISOString()
  };

  return JSON.stringify(payload);
}

/**
 * Parse credential from NFC payload
 * @param {string} nfcData - The data received from NFC
 * @returns {Object} - Parsed credential data
 */
export function decodeCredentialFromNFC(nfcData) {
  try {
    const payload = JSON.parse(nfcData);
    return {
      credentialId: payload.cid,
      issuerId: payload.iss,
      credentialType: payload.typ,
      receivedAt: payload.ts
    };
  } catch (error) {
    throw new Error('Invalid NFC payload format');
  }
}

/**
 * Validate NFC payload
 * @param {Object} payload - The NFC payload to validate
 * @returns {boolean} - True if valid
 */
export function validateNFCPayload(payload) {
  if (!payload) return false;
  if (!payload.credentialId) return false;
  if (!payload.issuerId) return false;
  if (!payload.credentialType) return false;
  return true;
}
