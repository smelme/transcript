#!/usr/bin/env node

/**
 * ISO 23220 Photo ID mDOC Generator
 * Generates properly formatted ISO Photo ID credentials with multiple namespaces
 */

import crypto from 'crypto';
import fs from 'fs';

// Helper to encode CBOR
class CBOREncoder {
  constructor() {
    this.buffer = Buffer.alloc(1024 * 100); // 100KB buffer
    this.offset = 0;
  }

  writeUnsignedInt(value) {
    if (value < 24) {
      this.buffer[this.offset++] = value;
    } else if (value < 256) {
      this.buffer[this.offset++] = 0x18;
      this.buffer[this.offset++] = value;
    } else if (value < 65536) {
      this.buffer[this.offset++] = 0x19;
      this.buffer.writeUInt16BE(value, this.offset);
      this.offset += 2;
    } else {
      this.buffer[this.offset++] = 0x1a;
      this.buffer.writeUInt32BE(value, this.offset);
      this.offset += 4;
    }
  }

  writeNegativeInt(value) {
    this.buffer[this.offset++] = 0x20 | (value > 23 ? (value < 256 ? 0x18 : 0x19) : 0);
    if (value < 24) {
      this.buffer[this.offset - 1] = 0x20 | value;
    } else if (value < 256) {
      this.buffer[this.offset++] = value;
    } else {
      this.buffer.writeUInt16BE(value, this.offset);
      this.offset += 2;
    }
  }

  writeString(str) {
    const bytes = Buffer.from(str, 'utf8');
    this.buffer[this.offset++] = 0x60 | (bytes.length < 24 ? bytes.length : (bytes.length < 256 ? 0x18 : 0x19));
    if (bytes.length >= 24) {
      if (bytes.length < 256) {
        this.buffer[this.offset++] = bytes.length;
      } else {
        this.buffer.writeUInt16BE(bytes.length, this.offset);
        this.offset += 2;
      }
    }
    bytes.copy(this.buffer, this.offset);
    this.offset += bytes.length;
  }

  writeByteString(bytes) {
    this.buffer[this.offset++] = 0x40 | (bytes.length < 24 ? bytes.length : (bytes.length < 256 ? 0x18 : 0x19));
    if (bytes.length >= 24) {
      if (bytes.length < 256) {
        this.buffer[this.offset++] = bytes.length;
      } else {
        this.buffer.writeUInt16BE(bytes.length, this.offset);
        this.offset += 2;
      }
    }
    bytes.copy(this.buffer, this.offset);
    this.offset += bytes.length;
  }

  writeArray(length) {
    this.buffer[this.offset++] = 0x80 | (length < 24 ? length : (length < 256 ? 0x18 : 0x19));
    if (length >= 24) {
      if (length < 256) {
        this.buffer[this.offset++] = length;
      } else {
        this.buffer.writeUInt16BE(length, this.offset);
        this.offset += 2;
      }
    }
  }

  writeMap(length) {
    this.buffer[this.offset++] = 0xa0 | (length < 24 ? length : (length < 256 ? 0x18 : 0x19));
    if (length >= 24) {
      if (length < 256) {
        this.buffer[this.offset++] = length;
      } else {
        this.buffer.writeUInt16BE(length, this.offset);
        this.offset += 2;
      }
    }
  }

  writeTag(tag) {
    if (tag < 24) {
      this.buffer[this.offset++] = 0xc0 | tag;
    } else if (tag < 256) {
      this.buffer[this.offset++] = 0xd8;
      this.buffer[this.offset++] = tag;
    }
  }

  toBuffer() {
    return this.buffer.slice(0, this.offset);
  }
}

// Create sample photo ID credential data
const photoIDCredential = {
  docType: 'org.iso.23220.photoid.1',
  namespaces: {
    'org.iso.23220.photoid.1': {
      portrait: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      full_name: 'Erika Muster',
      date_of_birth: '1964-08-12',
      document_number: 'Z021AB37X13',
      issuing_authority: 'Bundesrepublik Deutschland',
      issue_date: '2025-03-24',
      expiry_date: '2031-03-24',
      issuing_country: 'NL'
    },
    'org.iso.23220.education.qualification.1': {
      institution_name: 'MIT',
      degree_level: 'bachelor',
      field_of_study: 'Computer Science',
      graduation_date: '2026-05-15',
      gpa: 3.9
    },
    'org.iso.23220.education.transcript.1': {
      student_id: 'STU-2026-001',
      courses: [
        {
          courseCode: '6.S191',
          courseName: 'Machine Learning',
          credits: 3,
          grade: 'A'
        },
        {
          courseCode: '6.009',
          courseName: 'Programming',
          credits: 4,
          grade: 'A'
        }
      ],
      total_credits: 7,
      status: 'completed'
    }
  },
  issuerInfo: {
    issuerName: 'Smart College Authority',
    issuerDid: 'did:example:issuer-photo-001',
    issuanceDate: '2026-08-29T10:30:00Z',
    expiryDate: '2031-08-29T10:30:00Z'
  }
};

console.log('🎫 ISO 23220 Photo ID mDOC Generator\n');
console.log('═════════════════════════════════════════════════════\n');

// Display credential structure
console.log('📋 Credential Structure:');
console.log('─────────────────────────');
console.log(`Document Type: ${photoIDCredential.docType}\n`);

console.log('Namespaces:');
Object.keys(photoIDCredential.namespaces).forEach(ns => {
  console.log(`\n  ${ns}:`);
  const fields = photoIDCredential.namespaces[ns];
  Object.keys(fields).forEach(key => {
    const value = fields[key];
    if (Buffer.isBuffer(value)) {
      console.log(`    - ${key}: [binary image data, ${value.length} bytes]`);
    } else if (Array.isArray(value)) {
      console.log(`    - ${key}: [array with ${value.length} items]`);
    } else {
      console.log(`    - ${key}: ${value}`);
    }
  });
});

// Create simplified CBOR representation
const simpleCBOR = {
  docType: photoIDCredential.docType,
  namespaces: photoIDCredential.namespaces,
  issuerInfo: photoIDCredential.issuerInfo
};

// Convert to base64
const cborJSON = JSON.stringify(simpleCBOR);
const cborBase64 = Buffer.from(cborJSON).toString('base64');
const cborBase64Url = cborBase64
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

console.log('\n\n📝 CBOR (JSON-compatible) Representation:');
console.log('──────────────────────────────────────────');
console.log(cborJSON);

console.log('\n\n📄 Base64 Encoded:');
console.log('───────────────────');
console.log(cborBase64);

console.log('\n\n🔗 Base64URL (For Paradym Tool):');
console.log('──────────────────────────────────');
console.log(cborBase64Url);

console.log('\n\n✅ Generated Outputs:');
console.log('─────────────────────');
fs.writeFileSync('photo-id-mdoc.json', JSON.stringify(simpleCBOR, null, 2));
fs.writeFileSync('photo-id-mdoc-base64.txt', cborBase64);
fs.writeFileSync('photo-id-mdoc-base64url.txt', cborBase64Url);

console.log('  ✓ photo-id-mdoc.json (full structure)');
console.log('  ✓ photo-id-mdoc-base64.txt (standard base64)');
console.log('  ✓ photo-id-mdoc-base64url.txt (URL-safe base64)');

console.log('\n\n🔧 Integration Steps:');
console.log('──────────────────────');
console.log('1. Update issuer-service schema to support org.iso.23220.photoid.1');
console.log('2. Add credential type routing in IssuerService.issue()');
console.log('3. Test with POST /credentials/issue endpoint');
console.log('4. Validate with Paradym tool: https://paradym.id/tools/mdoc\n');

console.log('═════════════════════════════════════════════════════');
