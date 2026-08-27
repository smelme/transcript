# ISO/IEC 18013-5:2021 mDoc Protocol

Mobile Document (mDoc) Protocol Implementation for QR-based Credential Presentation

## Overview

Implements the full ISO/IEC 18013-5:2021 mDoc protocol for:
- Wallet request generation (Issuer → Wallet)
- Presentation request generation (Verifier → Wallet)
- Device engagement protocol (Wallet ↔ Verifier)
- QR code generation and parsing
- CBOR encoding/decoding
- Session management and nonce-based replay protection

## Architecture

### Protocol Flow

```
1. Issuer Creates Wallet Request
   ↓
   Issuer generates QR code with wallet request details
   ↓
2. Wallet Scans QR & Receives Credentials
   ↓
   Wallet reads issuer URL and downloads mDoc credential
   ↓
3. Verifier Creates Presentation Request
   ↓
   Verifier generates QR code with requested attributes
   ↓
4. Wallet Scans & Establishes Device Engagement
   ↓
   HTTPS connection with Verifier (TLS 1.3)
   ↓
5. Wallet Sends Presentation Response
   ↓
   Wallet sends selected credential data with signature
   ↓
6. Verifier Validates Signature
   ↓
   Signature validated using issuer's public key
```

## Components

### DeviceRequest

Wallet request from issuer.

```javascript
const request = new DeviceRequest({
  issuerUrl: 'https://issuer.smartcollege.edu',
  requestedAttributes: ['name', 'institution', 'degreeLevel']
});

const qr = await QRCodeHandler.generateWalletRequestQR(request);
```

**Properties**:
- `sessionId`: Unique session identifier
- `nonce`: Random value for replay protection
- `issuerUrl`: URL where wallet can download credential
- `docType`: mDoc namespace
- `timestamp`: Request creation time
- `expiresAt`: Request expiration (1 hour default)

### PresentationRequest

Credential request from verifier.

```javascript
const request = new PresentationRequest({
  verifierUrl: 'https://verifier.smartcollege.edu',
  verifierId: 'VERIFIER-001',
  requestedAttributes: ['name', 'institution', 'gpa']
});

const qr = await QRCodeHandler.generatePresentationQR(request);
```

**Properties**:
- `sessionId`: Unique session identifier
- `nonce`: Random for replay protection
- `verifierUrl`: Verifier endpoint for credential submission
- `verifierId`: Verifier identifier
- `requestedAttributes`: List of requested credential attributes
- `expiresAt`: Request expiration (5 minutes default)

### DeviceResponse

Wallet response to issuer's wallet request.

```javascript
const response = new DeviceResponse({
  sessionId: 'session-123',
  walletUrl: 'https://wallet.smartcollege.edu',
  credentialData: { /* credential claims */ }
});
```

### PresentationResponse

Wallet response to verifier's presentation request.

```javascript
const response = new PresentationResponse({
  sessionId: 'session-123',
  credentialId: 'cred-123',
  presentedAttributes: {
    name: 'Alice Smith',
    institution: 'Smart College',
    gpa: 3.95
  }
});
```

## QR Code Generation

### Wallet Request QR

```javascript
const request = new DeviceRequest({
  issuerUrl: 'https://issuer.smartcollege.edu'
});

const qr = await QRCodeHandler.generateWalletRequestQR(request);

// Output:
// {
//   type: 'wallet-request',
//   qrCode: 'data:image/png;base64,...',
//   data: { /* request object */ },
//   dataSize: 450
// }
```

### Presentation QR

```javascript
const request = new PresentationRequest({
  verifierUrl: 'https://verifier.smartcollege.edu'
});

const qr = await QRCodeHandler.generatePresentationQR(request);

// Output:
// {
//   type: 'presentation',
//   qrCode: 'data:image/png;base64,...',
//   data: { /* request object */ },
//   dataSize: 380
// }
```

### QR Parsing

```javascript
const jsonData = '{"sessionId":"...","issuerUrl":"..."}';
const parsed = QRCodeHandler.parseQRData(jsonData);

// Returns: { type: 'wallet-request', data: {...} }
```

## CBOR Encoding

Compact Binary Object Representation (CBOR) for efficient encoding.

```javascript
const data = {
  name: 'Alice Smith',
  institution: 'Smart College',
  gpa: 3.95
};

// Encode to CBOR
const cbor = CBORCodec.encode(data);

// Decode from CBOR
const decoded = CBORCodec.decode(cbor);

// Hex encoding
const hex = CBORCodec.encodeToHex(data);
const data2 = CBORCodec.decodeFromHex(hex);

// Base64 encoding
const b64 = CBORCodec.encodeToBase64(data);
const data3 = CBORCodec.decodeFromBase64(b64);
```

## Device Engagement Protocol

Secure communication channel between wallet and verifier.

```javascript
// Verifier initiates engagement
const engagement = DeviceEngagementProtocol.initiateEngagement(presentationRequest);

// Establish secure channel (TLS 1.3)
const channel = DeviceEngagementProtocol.establishSecureChannel(sessionId, nonce);

// Complete engagement
const completion = DeviceEngagementProtocol.completeEngagement(sessionId);

// Check timeout
const timedOut = DeviceEngagementProtocol.checkEngagementTimeout(initiatedAt);
```

## Protocol Flow Execution

Full end-to-end flow execution.

```javascript
const credentials = {
  name: 'Alice Smith',
  institution: 'Smart College',
  degreeLevel: 'bachelor'
};

const flow = await ProtocolFlow.executeFullFlow(
  credentials,
  'https://verifier.smartcollege.edu',
  'VERIFIER-001'
);

// Returns:
// {
//   flow: 'issuer-wallet-verifier',
//   walletRequest: { /* QR code and data */ },
//   presentationRequest: { /* QR code and data */ },
//   engagement: { /* engagement details */ },
//   status: 'ready'
// }
```

## Presentation Response Verification

```javascript
const response = new PresentationResponse({
  sessionId: 'session-123',
  responseNonce: expectedNonce,
  credentialId: 'cred-123',
  presentedAttributes: { name: 'Alice', institution: 'Smart College' }
});

const result = ProtocolFlow.verifyPresentationResponse(response.encode(), expectedNonce);

if (result.valid) {
  console.log('✓ Presentation valid');
} else {
  console.log('✗ Invalid:', result.reason);
}
```

## Security Features

### Nonce Generation

Cryptographically secure random nonces for replay protection.

```javascript
const nonce = generateNonce(); // 32-char hex string (16 bytes)
```

### Session Management

Unique session IDs for tracking requests and responses.

```javascript
const sessionId = generateSessionId(); // 16-char nanoid
```

### TLS 1.3

All device engagement uses TLS 1.3 for encryption and authentication.

### Timeout Protection

Device engagement times out after 60 seconds with configurable timeout.

```javascript
const DEVICE_ENGAGEMENT_TIMEOUT = 60000; // milliseconds
```

## Constants

```javascript
MDOC_PROTOCOL.NAMESPACE = 'org.smartcollege.academic'
MDOC_PROTOCOL.VERSION = '1'
MDOC_PROTOCOL.QR_TYPE_WALLET_REQUEST = 'wallet-request'
MDOC_PROTOCOL.QR_TYPE_PRESENTATION = 'presentation'
MDOC_PROTOCOL.DEVICE_ENGAGEMENT_TIMEOUT = 60000 // ms
MDOC_PROTOCOL.MAX_QR_DATA_SIZE = 2953 // bytes
```

## Compliance

- **ISO/IEC 18013-5:2021**: Mobile Driving License
- **RFC 8949**: CBOR encoding
- **RFC 8032**: ED25519 signatures
- **TLS 1.3**: Secure transport

## Testing

37 comprehensive unit tests covering:
- ✅ Device requests and responses
- ✅ Presentation requests and responses
- ✅ QR code generation and parsing
- ✅ CBOR encoding/decoding
- ✅ Device engagement protocol
- ✅ Protocol flow orchestration
- ✅ Nonce and session ID uniqueness
- ✅ Timeout handling
- ✅ Signature verification

Run tests:
```bash
npm run test
```

## Dependencies

- `cbor` - CBOR encoding/decoding
- `qrcode` - QR code generation
- `jose` - Cryptographic operations
- `nanoid` - Session ID generation

## Related Stories

- P0-12: Implement ISO 18013-5 mDoc Protocol (this story)
- P0-3: Implement mDoc Generation Engine (uses protocol)
- P0-5: Wallet QR Reception (uses protocol)
- P0-8: Verifier QR Scanning (uses protocol)
- P0-9: Signature Validation (uses protocol)
- P0-13: Key Management (crypto operations)

## Future Enhancements

- Proximity check (Bluetooth Low Energy)
- Device binding (certificate pinning)
- Multiple credential types
- Selective disclosure implementation
- Protocol flow diagrams in documentation
