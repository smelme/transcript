# mDoc Credential Generation Engine

Comprehensive credential generation and issuance engine for academic credentials.

Integrates:
- P0-1: Credential schema validation
- P0-12: QR code generation and CBOR encoding
- P0-13: ED25519 key management

## Overview

The generation engine handles the complete credential lifecycle:
1. Validate credential data against mDoc schema
2. Sign with issuer's ED25519 private key
3. Encode as CBOR for efficient storage
4. Generate QR codes for wallet distribution
5. Return complete mDoc credential ready for session storage

## Architecture

### Generation Flow

```
Credential Data (JSON)
    ↓
Schema Validation (P0-1)
    ↓
ED25519 Signature (P0-13)
    ↓
CBOR Encoding (P0-12)
    ↓
QR Code Generation (P0-12)
    ↓
Complete mDoc Credential
    ↓
Session Storage (temporary)
    ↓
Wallet Distribution via QR
```

## Components

### CredentialGenerator

Main class for credential generation.

```javascript
import { CredentialGenerator } from './src/index.js';

const generator = new CredentialGenerator({
  namespace: 'org.smartcollege.academic',
  credentialExpiry: 1825 // days
});
```

### Generate Single Credential

```javascript
const credentialData = {
  studentId: 'ALICE-2024-001',
  name: {
    givenName: 'Alice',
    familyName: 'Smith'
  },
  institution: {
    name: 'Smart College',
    code: 'SC-001'
  },
  degreeLevel: 'bachelor',
  gpa: 3.95,
  courses: [
    {
      name: 'CS-101',
      code: 'CS-101',
      grade: 'A',
      credits: 3
    }
  ],
  issueDate: '2024-08-27T00:00:00Z',
  expiryDate: '2029-08-27T00:00:00Z',
  issuerId: 'SC-ISSUER-001'
};

const credential = await generator.generateCredential(
  credentialData,
  'SC-ISSUER-001',
  privateKeyPem
);

// Returns:
// {
//   credentialId: 'mdoc-abc123def456',
//   status: 'issued',
//   studentName: 'Alice Smith',
//   institution: 'Smart College',
//   gpa: 3.95,
//   issuedAt: '2024-08-27T12:34:56.789Z',
//   expiresAt: '2029-08-27T12:34:56.789Z',
//   signature: {
//     algorithm: 'EdDSA',
//     value: 'eyJhbGc...'
//   },
//   cbor: {
//     hex: '5843...',
//     base64: 'WEM...',
//     size: 512
//   },
//   qrCode: {
//     dataUrl: 'data:image/png;base64,...',
//     ascii: '████████...',
//     dataSize: 450
//   },
//   metadata: {
//     version: '1',
//     keyName: 'SC-ISSUER-001',
//     validated: true,
//     signed: true,
//     encoded: true
//   }
// }
```

### Validate Credential

```javascript
const validation = generator.validateCredential(credentialData);

if (validation.valid) {
  console.log('✓ Credential valid');
} else {
  console.log('✗ Validation errors:');
  validation.errors.forEach(err => {
    console.log(`  ${err.path}: ${err.message}`);
  });
}
```

### Batch Generation

```javascript
const credentials = [
  { studentId: 'ALICE-2024-001', ... },
  { studentId: 'BOB-2024-001', ... },
  { studentId: 'CHARLIE-2024-001', ... }
];

const batch = await generator.generateBatch(
  credentials,
  'SC-ISSUER-001',
  privateKeyPem
);

console.log(`Generated: ${batch.generated}/${batch.total}`);
if (batch.errors.length > 0) {
  console.log('Errors:', batch.errors);
}
```

## Validation

### Schema Validation

Credential must conform to mDoc schema:
- Required fields: studentId, name, institution, courses, issueDate, expiryDate
- Field constraints: types, lengths, patterns
- Collections: 1-100 courses, 0-20 achievements

```javascript
const validation = generator.validateCredential(credential);
// {
//   valid: boolean,
//   errors: [{ path: string, message: string }, ...]
// }
```

### Business Rule Validation

Additional runtime checks:
- Date ordering: issueDate < expiryDate
- GPA bounds: 0.0 ≤ gpa ≤ 4.0
- Credits per course: 0 ≤ credits ≤ 999
- StudentId pattern: ^[A-Za-z0-9_-]+$

## Signature

ED25519 digital signature for credential authenticity.

```javascript
const signature = await generator.signCredential(
  credentialData,
  privateKeyPem
);

// Returns:
// {
//   signature: 'eyJhbGc...' (JWS format),
//   algorithm: 'EdDSA',
//   curve: 'Ed25519'
// }
```

## CBOR Encoding

Compact binary encoding for storage and transmission.

```javascript
const cbor = generator.encodeCredential(credentialData, signature);

// Returns:
// {
//   cbor: Buffer,
//   hex: string,       // '5843...'
//   base64: string,    // 'WEM...'
//   size: number       // 512 bytes
// }
```

## QR Code Generation

Multiple QR formats for distribution.

```javascript
const qr = await generator.generateCredentialQR(
  credentialData,
  cborData
);

// Returns:
// {
//   type: 'mdoc-credential',
//   qrCode: 'data:image/png;base64,...',  // PNG DataURL
//   qrAscii: '████████...',                // Terminal display
//   data: { /* QR payload */ },
//   dataSize: 450                          // bytes
// }
```

## Configuration

```javascript
export const GENERATOR_CONFIG = {
  NAMESPACE: 'org.smartcollege.academic',
  VERSION: '1',
  SIGNATURE_ALGORITHM: 'EdDSA',
  SIGNATURE_CURVE: 'Ed25519',
  CREDENTIAL_EXPIRY_DAYS: 1825,        // 5 years
  QR_ERROR_CORRECTION: 'H',            // High
  QR_SIZE: 300                         // pixels
};
```

## Credential Structure

Complete mDoc credential returned by generator:

```javascript
{
  credentialId: 'mdoc-abc123def456',
  status: 'issued' | 'revoked' | 'expired',
  namespace: 'org.smartcollege.academic',
  
  // Student info (from input)
  studentId: 'ALICE-2024-001',
  studentName: 'Alice Smith',
  institution: 'Smart College',
  degreeLevel: 'bachelor',
  gpa: 3.95,
  courses: [...],
  
  // Lifecycle
  issuedAt: '2024-08-27T12:34:56.789Z',
  expiresAt: '2029-08-27T12:34:56.789Z',
  
  // Cryptography
  signature: {
    algorithm: 'EdDSA',
    value: 'eyJhbGciOiJFZERTQSIsInR5cCI6Im1Eb2MiLCJraWQiOiJTQy1JU1N1RVItMDAxIn0...'
  },
  
  // Encoding
  cbor: {
    hex: '5843...',
    base64: 'WEM...',
    size: 512
  },
  
  // Distribution
  qrCode: {
    dataUrl: 'data:image/png;base64,...',
    ascii: '████████...',
    dataSize: 450
  },
  
  // Metadata
  metadata: {
    version: '1',
    keyName: 'SC-ISSUER-001',
    validated: true,
    signed: true,
    encoded: true
  }
}
```

## Storage Model

Credentials flow:
1. **Generated** in memory
2. **Stored temporarily** in session
3. **Distributed** to wallet via QR
4. **Stored permanently** in wallet (not server)

Database tracks only:
- Metadata (ID, issuer, student, dates, status)
- Audit trail (who accessed, when)
- Revocation status

NOT stored in database:
- Actual credential data (claims)
- CBOR encoded credential
- Private keys

## Security Features

### ED25519 Signatures
- Issuer's private key signs each credential
- Verifier uses issuer's public key to validate
- Cryptographically secure and efficient

### Key Rotation
- Old keys can be retired
- New credentials use latest key
- Old credentials remain valid with old key
- Revocation tracking supported

### Nonce & Session IDs
- Unique session ID for each generation
- Nonces prevent replay attacks
- Timeouts for device engagement

## Dependencies

- `jose`: ED25519 signature and JWK handling
- `cbor`: CBOR encoding/decoding
- `qrcode`: QR code generation
- `ajv`: Schema validation
- `nanoid`: Cryptographically secure IDs
- `crypto`: Built-in Node.js crypto

## Testing

40+ comprehensive unit tests:

```bash
npm test
```

Coverage:
- ✅ Schema validation (valid/invalid cases)
- ✅ Business rule validation
- ✅ Signature generation
- ✅ CBOR encoding
- ✅ QR generation
- ✅ Batch operations
- ✅ Error handling
- ✅ Edge cases (long names, max items, etc.)

## Related Stories

- P0-1: Define mDoc Credential Schema (validation)
- P0-12: ISO 18013-5 mDoc Protocol (QR, CBOR)
- P0-13: Key Management Service (ED25519)
- P0-4: Credential Storage Database (metadata)
- P0-5: Wallet QR Reception (distribution)
- P0-9: Signature Validation (verification)

## Future Enhancements

- Selective disclosure support
- Multiple credential types
- Batch processing optimization
- Template system for common credential patterns
- Performance profiling for high-volume issuance
