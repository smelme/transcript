/**
 * Key Management Service for ED25519 Credential Signing
 * Handles key generation, storage, retrieval, and rotation
 */

import { generateKeyPair, exportSPKI, exportPKCS8 } from 'jose';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

export class KeyManagementService {
  constructor(config = {}) {
    this.config = {
      keysDir: config.keysDir || './keys',
      algorithm: 'EdDSA',
      ...config
    };
  }

  /**
   * Generate ED25519 Key Pair
   */
  async generateKeyPair(keyName, options = {}) {
    try {
      // Generate ED25519 key pair using jose
      const { publicKey, privateKey } = await generateKeyPair(this.config.algorithm);

      // Export keys to PEM format using jose
      const publicKeyPem = await exportSPKI(publicKey);
      const privateKeyPem = await exportPKCS8(privateKey);

      const keyId = nanoid(16);
      const keyMetadata = {
        keyId,
        keyName,
        algorithm: this.config.algorithm,
        createdAt: new Date().toISOString(),
        status: 'active',
        version: 1
      };

      return {
        keyId,
        keyName,
        publicKey: publicKeyPem,
        privateKey: privateKeyPem,
        publicKeyJWK: {
          kty: 'OKP',
          crv: 'Ed25519',
          use: 'sig',
          alg: 'EdDSA'
        },
        metadata: keyMetadata
      };
    } catch (error) {
      throw new Error(`Failed to generate key pair: ${error.message}`);
    }
  }

  /**
   * Export Public Key to PEM Format
   */
  async exportPublicKey(publicKey) {
    const pem = await exportSPKI(publicKey);
    return pem;
  }

  /**
   * Export Private Key to PEM Format
   */
  async exportPrivateKey(privateKey) {
    const pem = await exportPKCS8(privateKey);
    return pem;
  }

  /**
   * Export Public Key to JWK Format
   */
  async exportPublicKeyJWK(publicKey) {
    return {
      kty: 'OKP',
      crv: 'Ed25519',
      use: 'sig',
      alg: 'EdDSA'
    };
  }

  /**
   * Store Key Pair (File-based for development, env-based for production)
   */
  async storeKeyPair(keyName, keyData) {
    try {
      await fs.mkdir(this.config.keysDir, { recursive: true });

      const keyFile = path.join(this.config.keysDir, `${keyName}.json`);
      
      // Store metadata and public key
      const keyPackage = {
        keyId: keyData.keyId,
        keyName: keyData.keyName,
        publicKey: keyData.publicKey,
        publicKeyJWK: keyData.publicKeyJWK,
        metadata: keyData.metadata,
        privateKeyHash: this.hashString(keyData.privateKey)
      };

      await fs.writeFile(keyFile, JSON.stringify(keyPackage, null, 2), 'utf8');

      // Store private key locally for development
      if (process.env.NODE_ENV !== 'production') {
        const privateKeyFile = path.join(this.config.keysDir, `${keyName}.private.pem`);
        await fs.writeFile(privateKeyFile, keyData.privateKey, 'utf8');
      }

      return {
        success: true,
        keyId: keyData.keyId,
        message: `Key pair stored successfully`
      };
    } catch (error) {
      throw new Error(`Failed to store key pair: ${error.message}`);
    }
  }

  /**
   * Load Public Key from Registry
   */
  async loadPublicKey(keyName) {
    try {
      const keyFile = path.join(this.config.keysDir, `${keyName}.json`);
      const content = await fs.readFile(keyFile, 'utf8');
      const keyPackage = JSON.parse(content);

      return {
        keyId: keyPackage.keyId,
        keyName: keyPackage.keyName,
        publicKey: keyPackage.publicKey,
        publicKeyJWK: keyPackage.publicKeyJWK,
        metadata: keyPackage.metadata
      };
    } catch (error) {
      throw new Error(`Failed to load public key: ${error.message}`);
    }
  }

  /**
   * Load Private Key (from environment or file fallback)
   */
  async loadPrivateKey(keyId) {
    try {
      const envVarName = `ISSUER_PRIVATE_KEY_${keyId}`;
      const privateKeyFromEnv = process.env[envVarName];
      
      if (privateKeyFromEnv) {
        return privateKeyFromEnv;
      }

      // Fallback to file for development
      const keysDir = this.config.keysDir;
      const files = await fs.readdir(keysDir);
      const privateKeyFile = files.find(f => f.endsWith('.private.pem'));

      if (privateKeyFile) {
        return await fs.readFile(path.join(keysDir, privateKeyFile), 'utf8');
      }

      throw new Error(`Private key not found for ${keyId}`);
    } catch (error) {
      throw new Error(`Failed to load private key: ${error.message}`);
    }
  }

  /**
   * List All Public Keys in Registry
   */
  async listPublicKeys() {
    try {
      await fs.mkdir(this.config.keysDir, { recursive: true });

      const files = await fs.readdir(this.config.keysDir);
      const keyFiles = files.filter(f => f.endsWith('.json'));

      const keys = [];
      for (const file of keyFiles) {
        try {
          const content = await fs.readFile(
            path.join(this.config.keysDir, file),
            'utf8'
          );
          const keyPackage = JSON.parse(content);
          keys.push({
            keyId: keyPackage.keyId,
            keyName: keyPackage.keyName,
            algorithm: keyPackage.metadata.algorithm,
            status: keyPackage.metadata.status,
            version: keyPackage.metadata.version,
            createdAt: keyPackage.metadata.createdAt
          });
        } catch (error) {
          // Skip malformed files
        }
      }

      return keys;
    } catch (error) {
      throw new Error(`Failed to list keys: ${error.message}`);
    }
  }

  /**
   * Hash String using SHA256
   */
  hashString(str) {
    return createHash('sha256').update(str).digest('hex');
  }

  /**
   * Verify Private Key Hash
   */
  verifyPrivateKeyHash(privateKeyPem, hash) {
    return this.hashString(privateKeyPem) === hash;
  }

  /**
   * Get Key Metadata
   */
  async getKeyMetadata(keyName) {
    try {
      const key = await this.loadPublicKey(keyName);
      return key.metadata;
    } catch (error) {
      throw new Error(`Failed to get key metadata: ${error.message}`);
    }
  }

  /**
   * Rotate Key (Mark old as retired, generate new)
   */
  async rotateKey(keyName) {
    try {
      const oldKey = await this.loadPublicKey(keyName);
      
      // Generate new key pair
      const newKeyData = await this.generateKeyPair(keyName);
      
      // Store new key
      await this.storeKeyPair(keyName, newKeyData);

      return {
        success: true,
        oldKeyId: oldKey.keyId,
        newKeyId: newKeyData.keyId
      };
    } catch (error) {
      throw new Error(`Failed to rotate key: ${error.message}`);
    }
  }

  /**
   * Convert Buffer to PEM format
   */
  toPEM(der, type) {
    const base64 = der.toString('base64');
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----\n`;
  }
}

export default KeyManagementService;
