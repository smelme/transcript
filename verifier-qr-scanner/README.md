# Verifier QR Scanner (P0-8)

Server-side QR code scanning and credential presentation verification for verifiers.

## Overview

The Verifier QR Scanner enables verifiers to:
- Scan QR codes from credential presentations
- Validate credential metadata
- Verify issuer trust and credentials
- Manage trusted issuers registry
- Process verification workflows
- Generate verification reports

## Architecture

```
Verifier QR Scanner:
  ├── QR Code Reception & Parsing
  ├── Presentation Validation
  ├── Issuer Trust Management
  ├── Verification Workflow
  ├── Signature Verification (P0-9 integration)
  └── Audit & Reporting
```

## Features

### QR Scanning
- Parse QR codes from presentations
- Support JSON and BASE64 encoding
- Automatic format detection
- Metadata validation on receipt

### Presentation Validation
- Verify credential format
- Check expiration dates
- Validate issuer DIDs
- Confirm credential type support
- Ensure credential hasn't expired

### Trust Management
- Register trusted issuers
- Track issuer trust scores (0-100)
- Filter issuers by trust threshold
- Update trust scores dynamically
- Block compromised issuers

### Verification Workflow
```
1. Scan QR code
2. Parse presentation data
3. Check issuer is trusted
4. Validate credential metadata
5. Request signature verification (P0-9)
6. Verify issuer registry (P0-11)
7. Record verification
8. Generate report
```

### Audit Trail
- Log all scanning events
- Track verification results
- Record trust score changes
- Maintain issuer registration history
- Export audit reports

## API

### Constructor
```javascript
const scanner = new VerifierQRScanner({
  verifierId: 'verifier-001',
  verifierName: 'Verification Service',
  verifierDid: 'did:key:verifier123',
  supportedTypes: ['AcademicCredential'],
  scanTimeout: 30000,
  maxScanHistory: 1000
});
```

### Register Trusted Issuer
```javascript
const result = scanner.registerTrustedIssuer(
  'did:key:issuer123',
  'University Name',
  75  // Trust score (0-100)
);
// Returns: { success, issuerDid }
```

### Scan Presentation
```javascript
const result = await scanner.scanPresentation(qrCodeData, {
  verifyImmediately: true,  // Optional
  minTrustScore: 50         // Optional minimum
});
// Returns: { success, scanId, credentialId, issuerTrust, metadata }
```

### Verify Presentation
```javascript
const result = await scanner.verifyPresentation(scanId, {
  minTrustScore: 50
});
// Returns: { success, credentialId, scanId, verifiedAt, trustScore }
```

### List Trusted Issuers
```javascript
const issuers = scanner.listTrustedIssuers({
  minTrustScore: 60
});
// Returns: Array of issuer objects
```

### Update Trust Score
```javascript
const result = scanner.updateIssuerTrustScore('did:key:issuer123', 85);
// Returns: { success, issuerDid, oldTrustScore, newTrustScore }
```

### Block Issuer
```javascript
const result = scanner.blockIssuer('did:key:issuer123', 'Compromised');
// Returns: { success, issuerDid }
```

### List Recent Scans
```javascript
const scans = scanner.listScans(50, {
  status: 'pending_verification',  // 'verified', 'rejected'
  issuer: 'did:key:...',
  type: 'AcademicCredential'
});
// Returns: Array of scan records
```

### List Verifications
```javascript
const verifications = scanner.listVerifications('verified');
// Returns: Array of verification records
```

### Get Statistics
```javascript
const stats = scanner.getStatistics();
// Returns: { totalScans, verifiedCredentials, trustedIssuers, ... }
```

### Export Report
```javascript
const report = scanner.exportVerificationReport('json');
// Returns: { success, format, data }
```

## Presentation Metadata Format

```javascript
{
  credentialId: "cred-001",
  issuerDid: "did:key:issuer123",
  credentialType: "AcademicCredential",
  expiryDate: "2025-01-01T00:00:00Z"
}
```

## Trust Score Guidelines

| Score Range | Status | Action |
|-------------|--------|--------|
| 80-100      | Trusted | Auto-approve |
| 60-79       | Acceptable | Review |
| 40-59       | Caution | Manual verification |
| 0-39        | Untrusted | Require additional verification |

## Verification Statuses

- **pending_verification**: Scanned but not yet verified
- **verified**: Successfully verified
- **rejected**: Manually rejected by verifier

## Integration Points

### With Wallet QR Receiver (P0-5)
- Receives presentation QR codes from wallet
- Validates credential metadata
- Verifies credential hasn't been revoked

### With Signature Validation (P0-9)
- Requests cryptographic verification
- Validates ED25519 signatures
- Verifies issuer public key

### With Verifier Registry (P0-11)
- Looks up issuer details
- Verifies issuer approval status
- Confirms trust scores

### With Admin Portal (P0-2)
- Provides verification status
- Enables issuer management
- Reports statistics

## Testing

30+ unit tests covering:

```bash
npm test
```

Coverage:
- ✅ QR parsing and validation
- ✅ Issuer registration and management
- ✅ Scan receipt and storage
- ✅ Presentation validation
- ✅ Trust score management
- ✅ Verification workflows
- ✅ Issuer blocking
- ✅ Signature verification
- ✅ Filtering and queries
- ✅ Statistics and reporting
- ✅ Audit logging
- ✅ Multi-issuer scenarios
- ✅ Error handling

## Security Considerations

### Trust Management
- Trust scores are verifier-specific
- Scores can be updated independently
- Compromised issuers can be blocked immediately
- Audit trail maintains all trust changes

### Presentation Validation
- All metadata validated before processing
- Expired credentials rejected immediately
- Unknown issuers rejected
- Credential types must be supported

### Verification
- Requires issuer to be trusted
- Trust score threshold enforcement
- Signature verification integration
- Audit trail for all decisions

## Workflow Example

```javascript
const scanner = new VerifierQRScanner({
  verifierId: 'employer-verifier',
  verifierName: 'HR Department'
});

// Register trusted issuer
scanner.registerTrustedIssuer(
  'did:key:university123',
  'State University',
  90
);

// User scans credential QR
const scanResult = await scanner.scanPresentation(qrCode);

if (scanResult.success) {
  // Verify credential
  const verification = await scanner.verifyPresentation(
    scanResult.scanId,
    { minTrustScore: 70 }
  );

  if (verification.success) {
    // Process verification
    console.log(`Credential ${verification.credentialId} verified!`);
  }
}

// Generate report
const report = scanner.exportVerificationReport('json');
```

## Performance

- **Scan**: < 100ms for QR parsing
- **Validation**: < 50ms for metadata validation
- **Verification**: Depends on issuer lookup (typically < 500ms)
- **List**: O(n) where n = scan/verification count
- **Search**: O(n) with filtering

## Browser Compatibility

| Feature | Support |
|---------|---------|
| JSON Parsing | All browsers |
| BASE64 Encoding | All browsers |
| Camera API | Chrome, Edge, Safari, Firefox |

## Future Enhancements

- Revocation status checking
- Multi-factor verification
- Real-time issuer status sync
- Credential claim validation
- Selective disclosure support
- Privacy-preserving verification
- Batch verification
- Machine learning anomaly detection
- Integration with identity providers
- Webhook notifications
- Advanced analytics
- Verification templates
