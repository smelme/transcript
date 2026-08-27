# Key Management Service

ED25519 Key Management for mDoc Credential Signing and Verification

## Overview

Handles secure generation, storage, rotation, and distribution of ED25519 cryptographic keys used for signing academic credentials. Provides both file-based storage (development) and HSM-ready integration (production).

## Features

- ✓ ED25519 key pair generation (cryptographically secure)
- ✓ PEM and JWK export formats
- ✓ Secure key storage (environment variables in production, file-based in development)
- ✓ Public key registry for distribution to verifiers
- ✓ Key versioning and rotation support
- ✓ Key metadata tracking
- ✓ CLI tools for key management

## Installation

```bash
npm install
```

### Dependencies

- `jose` - JWT/JWK/COSE handling
- `tweetnacl` - Alternative ED25519 implementation
- `nanoid` - Key ID generation
- `dotenv` - Environment variable management

## Usage

### Generate Keys

```bash
npm run generate-keys
# Output: key ID, PEM files, JWK for distribution
```

With custom key name:

```bash
node src/cli/generate-keys.js my-issuer-key
```

### List Keys

```bash
npm run list-keys
# Output: All keys in registry with metadata
```

### Programmatic Usage

```javascript
import { KeyManagementService } from './src/index.js';

const keyMgmt = new KeyManagementService({ keysDir: './keys' });

// Generate key pair
const keyData = await keyMgmt.generateKeyPair('issuer-key');

// Store securely
await keyMgmt.storeKeyPair('issuer-key', keyData);

// Load public key for distribution
const publicKey = await keyMgmt.loadPublicKey('issuer-key');

// Load private key for signing (from env)
const privateKey = await keyMgmt.loadPrivateKey(keyData.keyId);
```

## Key Storage

### Development

```
keys/
  ├── issuer-key.json           # Public key + metadata
  └── issuer-key.private.pem    # Private key (stored locally)
```

### Production

```
Environment Variables:
ISSUER_PRIVATE_KEY_<keyId>=<PEM content>  # Private key in HSM or vault
```

## API Reference

### KeyManagementService

#### generateKeyPair(keyName, options)

Generate an ED25519 key pair.

**Returns:**
```javascript
{
  keyId: 'abc123...',
  keyName: 'issuer-key',
  publicKey: '-----BEGIN PUBLIC KEY-----\n...',
  privateKey: '-----BEGIN PRIVATE KEY-----\n...',
  publicKeyJWK: { kty: 'OKP', crv: 'Ed25519', ... },
  metadata: { algorithm: 'EdDSA', status: 'active', ... }
}
```

#### storeKeyPair(keyName, keyData)

Store key pair securely.

#### loadPublicKey(keyName)

Load public key from registry (safe to distribute).

#### loadPrivateKey(keyId)

Load private key for signing (from environment or file).

#### listPublicKeys()

List all keys in registry with metadata.

#### rotateKey(keyName)

Perform key rotation (retire old, activate new).

#### getKeyMetadata(keyName)

Get key metadata (algorithm, status, version, etc.).

## Security Considerations

- **Private Keys**: Never logged or exposed in errors
- **Storage**: 
  - Development: File-based (./keys/*.private.pem)
  - Production: Environment variables or HSM
- **Distribution**: Only public keys shared with verifiers
- **Rotation**: Support for key versioning and rotation
- **Access Control**: Restrict key file permissions (chmod 600)

## Database Schema (Verifier Registry)

```sql
CREATE TABLE public_keys (
  id SERIAL PRIMARY KEY,
  issuer_id UUID NOT NULL,
  key_id VARCHAR(255) NOT NULL UNIQUE,
  key_name VARCHAR(255),
  algorithm VARCHAR(50),
  public_key TEXT NOT NULL,
  public_key_jwk JSONB,
  status VARCHAR(50) DEFAULT 'active',
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  retired_at TIMESTAMP,
  metadata JSONB,
  UNIQUE(issuer_id, key_name)
);
```

## Testing

```bash
npm run test
```

Coverage includes:
- Key generation (80%+ coverage)
- Storage and retrieval
- Key rotation
- Hash verification
- Error handling

## Best Practices

1. **Generate keys once** at system setup
2. **Store private keys securely** (never in git/config files)
3. **Distribute public keys** via secure channels to verifiers
4. **Rotate keys periodically** (annual or on security events)
5. **Audit key usage** - log all signing operations
6. **HSM Integration** - use hardware security modules in production

## Compliance

- Supports NIST standards for ED25519 (RFC 8032)
- Compatible with ISO/IEC 18013-5 (mDoc specification)
- GDPR compliance - no personal data in keys

## Related Stories

- P0-13: Implement Key Management (this story) ✓
- P0-12: Implement ISO 18013-5 mDoc Protocol
- P0-3: Implement mDoc Credential Generation Engine

## Next Steps

1. Integrate with Issuer Service (P0-3) for credential signing
2. Publish public keys to Verifier Registry (P0-11)
3. Implement key rotation strategy (Phase 2)
4. HSM integration for production (Phase 2)
