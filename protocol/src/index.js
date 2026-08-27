/**
 * ISO/IEC 18013-5:2021 mDoc Protocol Implementation
 * 
 * Handles:
 * - Wallet Request (Issuer → Wallet)
 * - Device Engagement (Wallet ↔ Verifier)
 * - Credential Presentation (Wallet → Verifier)
 * - QR Code generation and parsing
 * - CBOR encoding/decoding
 */

import qrcode from 'qrcode';
import CBOR from 'cbor';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';

/**
 * mDoc Protocol Namespace and Constants
 */
export const MDOC_PROTOCOL = {
  NAMESPACE: 'org.smartcollege.academic',
  VERSION: '1',
  QR_TYPE_WALLET_REQUEST: 'wallet-request',
  QR_TYPE_PRESENTATION: 'presentation',
  DEVICE_ENGAGEMENT_TIMEOUT: 60000, // 60 seconds
  MAX_QR_DATA_SIZE: 2953 // Max for QR version 40
};

/**
 * Nonce Generation for Replay Protection
 */
export function generateNonce(length = 16) {
  return randomBytes(length).toString('hex');
}

/**
 * Session ID Generation
 */
export function generateSessionId() {
  return nanoid(16);
}

/**
 * Device Request - Wallet Request from Issuer
 */
export class DeviceRequest {
  constructor(options = {}) {
    this.version = MDOC_PROTOCOL.VERSION;
    this.sessionId = options.sessionId || generateSessionId();
    this.nonce = options.nonce || generateNonce();
    this.issuerUrl = options.issuerUrl || '';
    this.requestedAttributes = options.requestedAttributes || [];
    this.docType = MDOC_PROTOCOL.NAMESPACE;
    this.timestamp = new Date().toISOString();
    this.expiresAt = options.expiresAt || new Date(Date.now() + 3600000).toISOString(); // 1 hour
  }

  /**
   * Encode Device Request for QR code
   */
  encode() {
    return {
      version: this.version,
      sessionId: this.sessionId,
      nonce: this.nonce,
      issuerUrl: this.issuerUrl,
      docType: this.docType,
      namespace: MDOC_PROTOCOL.NAMESPACE,
      timestamp: this.timestamp,
      expiresAt: this.expiresAt,
      requestedAttributes: this.requestedAttributes
    };
  }

  /**
   * Convert to JSON for QR code
   */
  toJSON() {
    return JSON.stringify(this.encode());
  }

  /**
   * Validate request
   */
  validate() {
    if (!this.sessionId) return false;
    if (!this.nonce) return false;
    if (!this.issuerUrl) return false;
    
    const expiry = new Date(this.expiresAt);
    if (expiry < new Date()) return false;
    
    return true;
  }
}

/**
 * Device Response - Wallet Response to Verifier
 */
export class DeviceResponse {
  constructor(options = {}) {
    this.version = MDOC_PROTOCOL.VERSION;
    this.sessionId = options.sessionId || generateSessionId();
    this.responseNonce = options.responseNonce || generateNonce();
    this.walletUrl = options.walletUrl || '';
    this.credentialData = options.credentialData || {};
    this.signature = options.signature || '';
    this.docType = MDOC_PROTOCOL.NAMESPACE;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Encode Device Response
   */
  encode() {
    return {
      version: this.version,
      sessionId: this.sessionId,
      responseNonce: this.responseNonce,
      walletUrl: this.walletUrl,
      docType: this.docType,
      namespace: MDOC_PROTOCOL.NAMESPACE,
      credentialData: this.credentialData,
      signature: this.signature,
      timestamp: this.timestamp
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return JSON.stringify(this.encode());
  }

  /**
   * Validate response
   */
  validate() {
    if (!this.sessionId) return false;
    if (!this.responseNonce) return false;
    if (!this.walletUrl) return false;
    if (!this.credentialData) return false;
    
    return true;
  }
}

/**
 * Presentation Request - Verifier Request to Wallet
 */
export class PresentationRequest {
  constructor(options = {}) {
    this.version = MDOC_PROTOCOL.VERSION;
    this.sessionId = options.sessionId || generateSessionId();
    this.nonce = options.nonce || generateNonce();
    this.verifierUrl = options.verifierUrl || '';
    this.verifierId = options.verifierId || '';
    this.requestedAttributes = options.requestedAttributes || [
      'name',
      'institution',
      'degreeLevel'
    ];
    this.docType = MDOC_PROTOCOL.NAMESPACE;
    this.timestamp = new Date().toISOString();
    this.expiresAt = options.expiresAt || new Date(Date.now() + 300000).toISOString(); // 5 mins
  }

  /**
   * Encode Presentation Request
   */
  encode() {
    return {
      version: this.version,
      sessionId: this.sessionId,
      nonce: this.nonce,
      verifierUrl: this.verifierUrl,
      verifierId: this.verifierId,
      docType: this.docType,
      namespace: MDOC_PROTOCOL.NAMESPACE,
      requestedAttributes: this.requestedAttributes,
      timestamp: this.timestamp,
      expiresAt: this.expiresAt
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return JSON.stringify(this.encode());
  }

  /**
   * Validate presentation request
   */
  validate() {
    if (!this.sessionId) return false;
    if (!this.nonce) return false;
    if (!this.verifierUrl) return false;
    if (!this.requestedAttributes || this.requestedAttributes.length === 0) return false;
    
    return true;
  }
}

/**
 * Presentation Response - Wallet Response to Verifier
 */
export class PresentationResponse {
  constructor(options = {}) {
    this.version = MDOC_PROTOCOL.VERSION;
    this.sessionId = options.sessionId || generateSessionId();
    this.responseNonce = options.responseNonce || generateNonce();
    this.credentialId = options.credentialId || '';
    this.presentedAttributes = options.presentedAttributes || {};
    this.signature = options.signature || '';
    this.docType = MDOC_PROTOCOL.NAMESPACE;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Encode Presentation Response
   */
  encode() {
    return {
      version: this.version,
      sessionId: this.sessionId,
      responseNonce: this.responseNonce,
      credentialId: this.credentialId,
      docType: this.docType,
      namespace: MDOC_PROTOCOL.NAMESPACE,
      presentedAttributes: this.presentedAttributes,
      signature: this.signature,
      timestamp: this.timestamp
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return JSON.stringify(this.encode());
  }

  /**
   * Validate presentation response
   */
  validate() {
    if (!this.sessionId) return false;
    if (!this.credentialId) return false;
    if (!this.presentedAttributes) return false;
    
    return true;
  }
}

/**
 * CBOR Encoding/Decoding Utilities
 */
export class CBORCodec {
  /**
   * Encode object to CBOR
   */
  static encode(data) {
    try {
      return CBOR.encode(data);
    } catch (error) {
      throw new Error(`CBOR encoding failed: ${error.message}`);
    }
  }

  /**
   * Decode CBOR to object
   */
  static decode(buffer) {
    try {
      return CBOR.decode(buffer);
    } catch (error) {
      throw new Error(`CBOR decoding failed: ${error.message}`);
    }
  }

  /**
   * Encode to hex string
   */
  static encodeToHex(data) {
    const cbor = this.encode(data);
    return cbor.toString('hex');
  }

  /**
   * Decode from hex string
   */
  static decodeFromHex(hexString) {
    const buffer = Buffer.from(hexString, 'hex');
    return this.decode(buffer);
  }

  /**
   * Encode to base64
   */
  static encodeToBase64(data) {
    const cbor = this.encode(data);
    return cbor.toString('base64');
  }

  /**
   * Decode from base64
   */
  static decodeFromBase64(base64String) {
    const buffer = Buffer.from(base64String, 'base64');
    return this.decode(buffer);
  }
}

/**
 * QR Code Handler for Device Requests and Presentations
 */
export class QRCodeHandler {
  /**
   * Generate QR code for wallet request
   */
  static async generateWalletRequestQR(deviceRequest) {
    try {
      if (!deviceRequest.validate()) {
        throw new Error('Invalid device request');
      }

      const qrData = deviceRequest.toJSON();

      // Check size limit
      if (qrData.length > MDOC_PROTOCOL.MAX_QR_DATA_SIZE) {
        throw new Error(`QR data exceeds maximum size: ${qrData.length} > ${MDOC_PROTOCOL.MAX_QR_DATA_SIZE}`);
      }

      const qrCode = await qrcode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300,
        margin: 2
      });

      return {
        type: MDOC_PROTOCOL.QR_TYPE_WALLET_REQUEST,
        qrCode,
        data: deviceRequest.encode(),
        dataSize: qrData.length
      };
    } catch (error) {
      throw new Error(`Failed to generate wallet request QR: ${error.message}`);
    }
  }

  /**
   * Generate QR code for presentation request
   */
  static async generatePresentationQR(presentationRequest) {
    try {
      if (!presentationRequest.validate()) {
        throw new Error('Invalid presentation request');
      }

      const qrData = presentationRequest.toJSON();

      if (qrData.length > MDOC_PROTOCOL.MAX_QR_DATA_SIZE) {
        throw new Error(`QR data exceeds maximum size: ${qrData.length} > ${MDOC_PROTOCOL.MAX_QR_DATA_SIZE}`);
      }

      const qrCode = await qrcode.toDataURL(qrData, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 300,
        margin: 2
      });

      return {
        type: MDOC_PROTOCOL.QR_TYPE_PRESENTATION,
        qrCode,
        data: presentationRequest.encode(),
        dataSize: qrData.length
      };
    } catch (error) {
      throw new Error(`Failed to generate presentation QR: ${error.message}`);
    }
  }

  /**
   * Parse QR code (typically from scanned data)
   */
  static parseQRData(jsonData) {
    try {
      const parsed = JSON.parse(jsonData);

      // Determine type based on content
      if (parsed.issuerUrl && !parsed.verifierUrl) {
        return {
          type: MDOC_PROTOCOL.QR_TYPE_WALLET_REQUEST,
          data: parsed
        };
      } else if (parsed.verifierUrl) {
        return {
          type: MDOC_PROTOCOL.QR_TYPE_PRESENTATION,
          data: parsed
        };
      } else if (parsed.walletUrl && !parsed.verifierUrl) {
        // DeviceResponse case
        return {
          type: MDOC_PROTOCOL.QR_TYPE_WALLET_REQUEST,
          data: parsed
        };
      }

      throw new Error('Unknown QR data type');
    } catch (error) {
      throw new Error(`Failed to parse QR data: ${error.message}`);
    }
  }

  /**
   * Generate QR code string representation (ASCII)
   */
  static async generateQRString(data) {
    try {
      const qrCode = await qrcode.toString(data, { type: 'terminal' });
      return qrCode;
    } catch (error) {
      throw new Error(`Failed to generate QR string: ${error.message}`);
    }
  }

  /**
   * Generate SVG QR code
   */
  static async generateQRSVG(data) {
    try {
      const qrCode = await qrcode.toString(data, { type: 'svg' });
      return qrCode;
    } catch (error) {
      throw new Error(`Failed to generate QR SVG: ${error.message}`);
    }
  }
}

/**
 * Device Engagement Protocol Handler
 */
export class DeviceEngagementProtocol {
  /**
   * Initiate device engagement (Verifier → Wallet)
   */
  static initiateEngagement(presentationRequest) {
    if (!presentationRequest.validate()) {
      throw new Error('Invalid presentation request');
    }

    return {
      sessionId: presentationRequest.sessionId,
      nonce: presentationRequest.nonce,
      timestamp: new Date().toISOString(),
      status: 'initiated',
      timeout: MDOC_PROTOCOL.DEVICE_ENGAGEMENT_TIMEOUT,
      connectionMethod: 'https' // TLS 1.3
    };
  }

  /**
   * Establish secure channel (between Wallet and Verifier)
   */
  static establishSecureChannel(sessionId, nonce) {
    // In production, this would establish:
    // - TLS 1.3 connection
    // - Mutual authentication
    // - Device binding

    return {
      sessionId,
      nonce,
      channelType: 'https',
      tlsVersion: '1.3',
      established: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Complete device engagement and return session
   */
  static completeEngagement(sessionId) {
    return {
      sessionId,
      status: 'completed',
      timestamp: new Date().toISOString(),
      credentialReceived: false,
      nextStep: 'awaitPresentationResponse'
    };
  }

  /**
   * Verify engagement timeout
   */
  static checkEngagementTimeout(initiatedAt) {
    const elapsed = Date.now() - new Date(initiatedAt).getTime();
    return elapsed > MDOC_PROTOCOL.DEVICE_ENGAGEMENT_TIMEOUT;
  }
}

/**
 * Protocol Flow Orchestration
 */
export class ProtocolFlow {
  /**
   * Full issuer → wallet → verifier flow
   */
  static async executeFullFlow(credentials, verifierUrl, verifierId) {
    try {
      // Step 1: Issuer generates wallet request QR
      const deviceRequest = new DeviceRequest({
        issuerUrl: 'https://issuer.smartcollege.edu',
        requestedAttributes: Object.keys(credentials)
      });

      if (!deviceRequest.validate()) {
        throw new Error('Device request validation failed');
      }

      const walletRequestQR = await QRCodeHandler.generateWalletRequestQR(deviceRequest);

      // Step 2: Verifier generates presentation request QR
      const presentationRequest = new PresentationRequest({
        verifierUrl,
        verifierId,
        requestedAttributes: ['name', 'institution', 'degreeLevel']
      });

      if (!presentationRequest.validate()) {
        throw new Error('Presentation request validation failed');
      }

      const presentationQR = await QRCodeHandler.generatePresentationQR(presentationRequest);

      // Step 3: Verifier initiates device engagement
      const engagement = DeviceEngagementProtocol.initiateEngagement(presentationRequest);

      return {
        flow: 'issuer-wallet-verifier',
        walletRequest: walletRequestQR,
        presentationRequest: presentationQR,
        engagement,
        status: 'ready'
      };
    } catch (error) {
      throw new Error(`Protocol flow failed: ${error.message}`);
    }
  }

  /**
   * Verify presentation response
   */
  static verifyPresentationResponse(response, expectedNonce) {
    // Verify nonce matches (replay protection)
    if (!response.responseNonce || response.responseNonce !== expectedNonce) {
      return {
        valid: false,
        reason: 'Nonce mismatch - potential replay attack'
      };
    }

    // Verify required attributes present
    if (!response.presentedAttributes || Object.keys(response.presentedAttributes).length === 0) {
      return {
        valid: false,
        reason: 'No attributes presented'
      };
    }

    return {
      valid: true,
      reason: 'Presentation response valid'
    };
  }
}

export default {
  MDOC_PROTOCOL,
  DeviceRequest,
  DeviceResponse,
  PresentationRequest,
  PresentationResponse,
  CBORCodec,
  QRCodeHandler,
  DeviceEngagementProtocol,
  ProtocolFlow,
  generateNonce,
  generateSessionId
};
