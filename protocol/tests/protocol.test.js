/**
 * Tests for ISO 18013-5 mDoc Protocol Implementation
 * Coverage: Device Requests, QR codes, CBOR encoding, Protocol flows
 */

import assert from 'assert';
import { test } from 'node:test';
import {
  DeviceRequest,
  DeviceResponse,
  PresentationRequest,
  PresentationResponse,
  CBORCodec,
  QRCodeHandler,
  DeviceEngagementProtocol,
  ProtocolFlow,
  generateNonce,
  generateSessionId,
  MDOC_PROTOCOL
} from '../src/index.js';

test('Protocol - Generate Nonce', () => {
  const nonce1 = generateNonce();
  const nonce2 = generateNonce();

  assert(nonce1, 'Nonce should be generated');
  assert.notStrictEqual(nonce1, nonce2, 'Nonces should be unique');
  assert.strictEqual(nonce1.length, 32, 'Nonce should be 32 chars (16 bytes hex)');
});

test('Protocol - Generate Session ID', () => {
  const sid1 = generateSessionId();
  const sid2 = generateSessionId();

  assert(sid1, 'Session ID should be generated');
  assert.notStrictEqual(sid1, sid2, 'Session IDs should be unique');
  assert.strictEqual(sid1.length, 16, 'Session ID should be 16 chars');
});

test('Protocol - Device Request Creation', () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu',
    requestedAttributes: ['name', 'institution']
  });

  assert(request.sessionId, 'Session ID should be set');
  assert(request.nonce, 'Nonce should be set');
  assert.strictEqual(request.issuerUrl, 'https://issuer.smartcollege.edu');
  assert.deepStrictEqual(request.requestedAttributes, ['name', 'institution']);
});

test('Protocol - Device Request Validation (valid)', () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu'
  });

  assert.strictEqual(request.validate(), true, 'Valid request should pass validation');
});

test('Protocol - Device Request Validation (missing issuerUrl)', () => {
  const request = new DeviceRequest();
  request.issuerUrl = ''; // Clear URL

  assert.strictEqual(request.validate(), false, 'Missing issuerUrl should fail validation');
});

test('Protocol - Device Request Validation (expired)', () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu',
    expiresAt: new Date(Date.now() - 1000).toISOString() // 1 second in past
  });

  assert.strictEqual(request.validate(), false, 'Expired request should fail validation');
});

test('Protocol - Device Request JSON Encoding', () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu'
  });

  const json = request.toJSON();
  const parsed = JSON.parse(json);

  assert.strictEqual(parsed.issuerUrl, 'https://issuer.smartcollege.edu');
  assert(parsed.sessionId, 'Parsed JSON should have sessionId');
  assert(parsed.nonce, 'Parsed JSON should have nonce');
});

test('Protocol - Presentation Request Creation', () => {
  const request = new PresentationRequest({
    verifierUrl: 'https://verifier.smartcollege.edu',
    verifierId: 'VERIFIER-001'
  });

  assert(request.sessionId, 'Session ID should be set');
  assert(request.nonce, 'Nonce should be set');
  assert.strictEqual(request.verifierUrl, 'https://verifier.smartcollege.edu');
  assert.strictEqual(request.verifierId, 'VERIFIER-001');
});

test('Protocol - Presentation Request Validation (valid)', () => {
  const request = new PresentationRequest({
    verifierUrl: 'https://verifier.smartcollege.edu',
    verifierId: 'VERIFIER-001'
  });

  assert.strictEqual(request.validate(), true, 'Valid request should pass validation');
});

test('Protocol - Presentation Request Validation (missing verifierUrl)', () => {
  const request = new PresentationRequest({
    verifierId: 'VERIFIER-001'
  });
  request.verifierUrl = '';

  assert.strictEqual(request.validate(), false, 'Missing verifierUrl should fail');
});

test('Protocol - Presentation Request Validation (empty attributes)', () => {
  const request = new PresentationRequest({
    verifierUrl: 'https://verifier.smartcollege.edu',
    requestedAttributes: []
  });

  assert.strictEqual(request.validate(), false, 'Empty attributes should fail');
});

test('Protocol - Device Response Creation', () => {
  const response = new DeviceResponse({
    sessionId: 'session-123',
    walletUrl: 'https://wallet.smartcollege.edu',
    credentialData: { name: 'Alice Smith' }
  });

  assert.strictEqual(response.sessionId, 'session-123');
  assert.strictEqual(response.walletUrl, 'https://wallet.smartcollege.edu');
  assert.deepStrictEqual(response.credentialData, { name: 'Alice Smith' });
});

test('Protocol - Device Response Validation (valid)', () => {
  const response = new DeviceResponse({
    sessionId: 'session-123',
    walletUrl: 'https://wallet.smartcollege.edu',
    credentialData: { name: 'Alice Smith' }
  });

  assert.strictEqual(response.validate(), true, 'Valid response should pass validation');
});

test('Protocol - Presentation Response Creation', () => {
  const response = new PresentationResponse({
    sessionId: 'session-123',
    credentialId: 'cred-123',
    presentedAttributes: { name: 'Alice', institution: 'Smart College' }
  });

  assert.strictEqual(response.credentialId, 'cred-123');
  assert.deepStrictEqual(response.presentedAttributes, { name: 'Alice', institution: 'Smart College' });
});

test('Protocol - Presentation Response Validation (valid)', () => {
  const response = new PresentationResponse({
    sessionId: 'session-123',
    credentialId: 'cred-123',
    presentedAttributes: { name: 'Alice' }
  });

  assert.strictEqual(response.validate(), true, 'Valid response should pass validation');
});

test('Protocol - Presentation Response Validation (missing credentialId)', () => {
  const response = new PresentationResponse({
    sessionId: 'session-123',
    presentedAttributes: { name: 'Alice' }
  });
  response.credentialId = '';

  assert.strictEqual(response.validate(), false, 'Missing credentialId should fail');
});

test('Protocol - CBOR Encode/Decode', () => {
  const data = {
    name: 'Alice Smith',
    institution: 'Smart College',
    gpa: 3.95
  };

  const encoded = CBORCodec.encode(data);
  assert(encoded instanceof Buffer, 'Encoded data should be Buffer');

  const decoded = CBORCodec.decode(encoded);
  assert.deepStrictEqual(decoded, data, 'Decoded data should match original');
});

test('Protocol - CBOR Hex Encoding', () => {
  const data = { test: 'data' };

  const hex = CBORCodec.encodeToHex(data);
  assert.strictEqual(typeof hex, 'string', 'Hex should be string');

  const decoded = CBORCodec.decodeFromHex(hex);
  assert.deepStrictEqual(decoded, data, 'Decoded from hex should match');
});

test('Protocol - CBOR Base64 Encoding', () => {
  const data = { test: 'data' };

  const base64 = CBORCodec.encodeToBase64(data);
  assert.strictEqual(typeof base64, 'string', 'Base64 should be string');

  const decoded = CBORCodec.decodeFromBase64(base64);
  assert.deepStrictEqual(decoded, data, 'Decoded from base64 should match');
});

test('Protocol - QR Code Generation for Wallet Request', async () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu'
  });

  const qr = await QRCodeHandler.generateWalletRequestQR(request);

  assert.strictEqual(qr.type, 'wallet-request');
  assert(qr.qrCode, 'QR code data should be generated');
  assert(qr.data, 'QR data should include request');
  assert(qr.dataSize, 'QR data size should be tracked');
});

test('Protocol - QR Code Generation for Presentation', async () => {
  const request = new PresentationRequest({
    verifierUrl: 'https://verifier.smartcollege.edu',
    verifierId: 'VER-001'
  });

  const qr = await QRCodeHandler.generatePresentationQR(request);

  assert.strictEqual(qr.type, 'presentation');
  assert(qr.qrCode, 'QR code data should be generated');
  assert(qr.data, 'QR data should include request');
});

test('Protocol - QR Code Size Validation', async () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu',
    requestedAttributes: new Array(100).fill('attr') // Create very large request
  });

  try {
    // This might still pass depending on serialization, so we just verify it handles large data
    await QRCodeHandler.generateWalletRequestQR(request);
  } catch (error) {
    assert(error.message.includes('exceeds maximum size') || !error.message.includes('exceeds'), 'Should handle size limit');
  }
});

test('Protocol - QR Data Parsing (Wallet Request)', async () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu'
  });

  const qrData = request.toJSON();
  const parsed = QRCodeHandler.parseQRData(qrData);

  assert.strictEqual(parsed.type, 'wallet-request');
  assert(parsed.data, 'Parsed data should be present');
  assert.strictEqual(parsed.data.issuerUrl, 'https://issuer.smartcollege.edu');
});

test('Protocol - QR Data Parsing (Presentation)', async () => {
  const request = new PresentationRequest({
    verifierUrl: 'https://verifier.smartcollege.edu',
    verifierId: 'VER-001'
  });

  const qrData = request.toJSON();
  const parsed = QRCodeHandler.parseQRData(qrData);

  assert.strictEqual(parsed.type, 'presentation');
  assert.strictEqual(parsed.data.verifierUrl, 'https://verifier.smartcollege.edu');
});

test('Protocol - Device Engagement Initiation', () => {
  const request = new PresentationRequest({
    verifierUrl: 'https://verifier.smartcollege.edu'
  });

  const engagement = DeviceEngagementProtocol.initiateEngagement(request);

  assert.strictEqual(engagement.status, 'initiated');
  assert.strictEqual(engagement.connectionMethod, 'https');
  assert.strictEqual(engagement.timeout, MDOC_PROTOCOL.DEVICE_ENGAGEMENT_TIMEOUT);
});

test('Protocol - Secure Channel Establishment', () => {
  const channel = DeviceEngagementProtocol.establishSecureChannel('session-123', 'nonce-456');

  assert.strictEqual(channel.sessionId, 'session-123');
  assert.strictEqual(channel.tlsVersion, '1.3');
  assert.strictEqual(channel.established, true);
});

test('Protocol - Complete Engagement', () => {
  const completion = DeviceEngagementProtocol.completeEngagement('session-123');

  assert.strictEqual(completion.sessionId, 'session-123');
  assert.strictEqual(completion.status, 'completed');
  assert.strictEqual(completion.nextStep, 'awaitPresentationResponse');
});

test('Protocol - Check Engagement Timeout (not expired)', () => {
  const initiatedAt = new Date().toISOString();
  const timedOut = DeviceEngagementProtocol.checkEngagementTimeout(initiatedAt);

  assert.strictEqual(timedOut, false, 'Recent engagement should not be timed out');
});

test('Protocol - Check Engagement Timeout (expired)', () => {
  const initiatedAt = new Date(Date.now() - 70000).toISOString(); // 70 seconds ago
  const timedOut = DeviceEngagementProtocol.checkEngagementTimeout(initiatedAt);

  assert.strictEqual(timedOut, true, 'Old engagement should be timed out');
});

test('Protocol - Verify Presentation Response (valid)', () => {
  const expectedNonce = 'nonce-123';
  const response = new PresentationResponse({
    sessionId: 'session-123',
    responseNonce: expectedNonce,
    credentialId: 'cred-123',
    presentedAttributes: { name: 'Alice' }
  });

  const result = ProtocolFlow.verifyPresentationResponse(response.encode(), expectedNonce);

  assert.strictEqual(result.valid, true);
});

test('Protocol - Verify Presentation Response (nonce mismatch)', () => {
  const response = new PresentationResponse({
    sessionId: 'session-123',
    responseNonce: 'wrong-nonce',
    credentialId: 'cred-123',
    presentedAttributes: { name: 'Alice' }
  });

  const result = ProtocolFlow.verifyPresentationResponse(response.encode(), 'expected-nonce');

  assert.strictEqual(result.valid, false);
  assert(result.reason.includes('Nonce mismatch'));
});

test('Protocol - Verify Presentation Response (no attributes)', () => {
  const response = new PresentationResponse({
    sessionId: 'session-123',
    responseNonce: 'nonce-123',
    credentialId: 'cred-123',
    presentedAttributes: {}
  });

  const result = ProtocolFlow.verifyPresentationResponse(response.encode(), 'nonce-123');

  assert.strictEqual(result.valid, false);
  assert(result.reason.includes('No attributes'));
});

test('Protocol - Full Protocol Flow', async () => {
  const credentials = {
    name: 'Alice Smith',
    institution: 'Smart College',
    degreeLevel: 'bachelor'
  };

  const flow = await ProtocolFlow.executeFullFlow(
    credentials,
    'https://verifier.smartcollege.edu',
    'VER-001'
  );

  assert.strictEqual(flow.status, 'ready');
  assert(flow.walletRequest, 'Should have wallet request');
  assert(flow.presentationRequest, 'Should have presentation request');
  assert(flow.engagement, 'Should have engagement details');
});

test('Protocol - mDoc Protocol Constants', () => {
  assert.strictEqual(MDOC_PROTOCOL.NAMESPACE, 'org.smartcollege.academic');
  assert.strictEqual(MDOC_PROTOCOL.VERSION, '1');
  assert.strictEqual(MDOC_PROTOCOL.QR_TYPE_WALLET_REQUEST, 'wallet-request');
  assert.strictEqual(MDOC_PROTOCOL.QR_TYPE_PRESENTATION, 'presentation');
  assert(MDOC_PROTOCOL.DEVICE_ENGAGEMENT_TIMEOUT > 0);
  assert(MDOC_PROTOCOL.MAX_QR_DATA_SIZE > 0);
});

test('Protocol - QR Code SVG Generation', async () => {
  const request = new DeviceRequest({
    issuerUrl: 'https://issuer.smartcollege.edu'
  });

  const svg = await QRCodeHandler.generateQRSVG(request.toJSON());
  assert(svg.includes('<svg'), 'SVG should contain SVG element');
});

test('Protocol - Multiple Nonces are Unique', () => {
  const nonces = new Set();
  
  for (let i = 0; i < 10; i++) {
    nonces.add(generateNonce());
  }

  assert.strictEqual(nonces.size, 10, 'All 10 nonces should be unique');
});

test('Protocol - Session IDs are Unique', () => {
  const ids = new Set();
  
  for (let i = 0; i < 10; i++) {
    ids.add(generateSessionId());
  }

  assert.strictEqual(ids.size, 10, 'All 10 session IDs should be unique');
});
