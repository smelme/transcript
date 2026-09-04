#!/usr/bin/env node

/**
 * Generate mDOC using Latest ISO 23220 Photo ID Specification
 * Complete CBOR-encoded credential with all namespaces
 */

import fs from 'fs';

// Proper CBOR Encoding Implementation
class CBOREncoder {
  constructor() {
    this.buffer = Buffer.alloc(10 * 1024); // 10KB
    this.offset = 0;
  }

  // Encode CBOR unsigned integer
  encodeUnsignedInt(value) {
    if (value < 24) {
      this.buffer[this.offset++] = value;
    } else if (value < 256) {
      this.buffer[this.offset++] = 24;
      this.buffer[this.offset++] = value;
    } else if (value < 65536) {
      this.buffer[this.offset++] = 25;
      this.buffer.writeUInt16BE(value, this.offset);
      this.offset += 2;
    } else {
      this.buffer[this.offset++] = 26;
      this.buffer.writeUInt32BE(value, this.offset);
      this.offset += 4;
    }
  }

  // Encode CBOR text string
  encodeString(str) {
    const utf8 = Buffer.from(str, 'utf8');
    const len = utf8.length;
    
    if (len < 24) {
      this.buffer[this.offset++] = 0x60 | len;
    } else if (len < 256) {
      this.buffer[this.offset++] = 0x78;
      this.buffer[this.offset++] = len;
    } else if (len < 65536) {
      this.buffer[this.offset++] = 0x79;
      this.buffer.writeUInt16BE(len, this.offset);
      this.offset += 2;
    } else {
      this.buffer[this.offset++] = 0x7a;
      this.buffer.writeUInt32BE(len, this.offset);
      this.offset += 4;
    }
    
    utf8.copy(this.buffer, this.offset);
    this.offset += utf8.length;
  }

  // Encode CBOR byte string
  encodeBytes(bytes) {
    const len = bytes.length;
    
    if (len < 24) {
      this.buffer[this.offset++] = 0x40 | len;
    } else if (len < 256) {
      this.buffer[this.offset++] = 0x58;
      this.buffer[this.offset++] = len;
    } else if (len < 65536) {
      this.buffer[this.offset++] = 0x59;
      this.buffer.writeUInt16BE(len, this.offset);
      this.offset += 2;
    }
    
    bytes.copy(this.buffer, this.offset);
    this.offset += bytes.length;
  }

  // Encode CBOR map
  encodeMapHeader(itemCount) {
    if (itemCount < 24) {
      this.buffer[this.offset++] = 0xa0 | itemCount;
    } else if (itemCount < 256) {
      this.buffer[this.offset++] = 0xb8;
      this.buffer[this.offset++] = itemCount;
    } else {
      this.buffer[this.offset++] = 0xb9;
      this.buffer.writeUInt16BE(itemCount, this.offset);
      this.offset += 2;
    }
  }

  // Encode CBOR array
  encodeArrayHeader(itemCount) {
    if (itemCount < 24) {
      this.buffer[this.offset++] = 0x80 | itemCount;
    } else if (itemCount < 256) {
      this.buffer[this.offset++] = 0x98;
      this.buffer[this.offset++] = itemCount;
    } else {
      this.buffer[this.offset++] = 0x99;
      this.buffer.writeUInt16BE(itemCount, this.offset);
      this.offset += 2;
    }
  }

  // Encode CBOR float (simplified - use 32-bit)
  encodeFloat(value) {
    this.buffer[this.offset++] = 0xfa;
    this.buffer.writeFloatBE(value, this.offset);
    this.offset += 4;
  }

  // Encode CBOR tag
  encodeTag(tag) {
    if (tag < 24) {
      this.buffer[this.offset++] = 0xc0 | tag;
    } else if (tag < 256) {
      this.buffer[this.offset++] = 0xd8;
      this.buffer[this.offset++] = tag;
    } else {
      this.buffer[this.offset++] = 0xd9;
      this.buffer.writeUInt16BE(tag, this.offset);
      this.offset += 2;
    }
  }

  // Encode CBOR boolean
  encodeBoolean(value) {
    this.buffer[this.offset++] = value ? 0xf5 : 0xf4;
  }

  // Encode CBOR null
  encodeNull() {
    this.buffer[this.offset++] = 0xf6;
  }

  toBuffer() {
    return this.buffer.slice(0, this.offset);
  }
}

// Build complete mDOC structure with CBOR encoding
function generatePhotoIDmdoc() {
  const encoder = new CBOREncoder();

  // Main mDOC map with 2 items: docType and namespaces
  encoder.encodeMapHeader(2);

  // Key 1: "docType"
  encoder.encodeString('docType');
  encoder.encodeString('org.iso.23220.photoid.1');

  // Key 2: "namespaces"
  encoder.encodeString('namespaces');

  // Namespaces map with 3 namespaces
  encoder.encodeMapHeader(3);

  // ============================================================
  // NAMESPACE 1: org.iso.23220.photoid.1 (Photo Identification)
  // ============================================================
  encoder.encodeString('org.iso.23220.photoid.1');
  encoder.encodeMapHeader(8); // 8 fields

  // portrait (binary data - placeholder)
  encoder.encodeString('portrait');
  const portraitData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  encoder.encodeBytes(portraitData);

  // full_name
  encoder.encodeString('full_name');
  encoder.encodeString('Erika Muster');

  // date_of_birth
  encoder.encodeString('date_of_birth');
  encoder.encodeString('1964-08-12');

  // document_number
  encoder.encodeString('document_number');
  encoder.encodeString('Z021AB37X13');

  // issuing_authority
  encoder.encodeString('issuing_authority');
  encoder.encodeString('Bundesrepublik Deutschland');

  // issue_date
  encoder.encodeString('issue_date');
  encoder.encodeString('2025-03-24');

  // expiry_date
  encoder.encodeString('expiry_date');
  encoder.encodeString('2031-03-24');

  // issuing_country
  encoder.encodeString('issuing_country');
  encoder.encodeString('NL');

  // ============================================================
  // NAMESPACE 2: org.iso.23220.education.qualification.1
  // ============================================================
  encoder.encodeString('org.iso.23220.education.qualification.1');
  encoder.encodeMapHeader(5); // 5 fields

  // institution_name
  encoder.encodeString('institution_name');
  encoder.encodeString('MIT');

  // degree_level
  encoder.encodeString('degree_level');
  encoder.encodeString('bachelor');

  // field_of_study
  encoder.encodeString('field_of_study');
  encoder.encodeString('Computer Science');

  // graduation_date
  encoder.encodeString('graduation_date');
  encoder.encodeString('2026-05-15');

  // gpa
  encoder.encodeString('gpa');
  encoder.encodeFloat(3.9);

  // ============================================================
  // NAMESPACE 3: org.iso.23220.education.transcript.1
  // ============================================================
  encoder.encodeString('org.iso.23220.education.transcript.1');
  encoder.encodeMapHeader(4); // 4 fields

  // student_id
  encoder.encodeString('student_id');
  encoder.encodeString('STU-2026-001');

  // courses (array of 2 courses)
  encoder.encodeString('courses');
  encoder.encodeArrayHeader(2);

  // Course 1
  encoder.encodeMapHeader(4);
  encoder.encodeString('courseCode');
  encoder.encodeString('6.S191');
  encoder.encodeString('courseName');
  encoder.encodeString('Machine Learning');
  encoder.encodeString('credits');
  encoder.encodeUnsignedInt(3);
  encoder.encodeString('grade');
  encoder.encodeString('A');

  // Course 2
  encoder.encodeMapHeader(4);
  encoder.encodeString('courseCode');
  encoder.encodeString('6.009');
  encoder.encodeString('courseName');
  encoder.encodeString('Programming');
  encoder.encodeString('credits');
  encoder.encodeUnsignedInt(4);
  encoder.encodeString('grade');
  encoder.encodeString('A');

  // total_credits
  encoder.encodeString('total_credits');
  encoder.encodeUnsignedInt(7);

  // status
  encoder.encodeString('status');
  encoder.encodeString('completed');

  return encoder.toBuffer();
}

// Generate mDOC
const cborBuffer = generatePhotoIDmdoc();

// Encode to base64 and base64url
const base64 = cborBuffer.toString('base64');
const base64url = base64
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '');

console.log('🎫 Generated ISO 23220 Photo ID mDOC\n');
console.log('═════════════════════════════════════════════════════\n');

console.log('📊 CBOR Statistics:');
console.log(`   - CBOR Size: ${cborBuffer.length} bytes`);
console.log(`   - Base64 Length: ${base64.length} characters`);
console.log(`   - Base64URL Length: ${base64url.length} characters\n`);

console.log('📝 Base64 Encoded:\n');
console.log(base64);

console.log('\n\n🔗 Base64URL (For Paradym Tool):\n');
console.log(base64url);

console.log('\n\n📋 Credential Summary:\n');
console.log('Holder: Erika Muster');
console.log('Country: NL');
console.log('Document: Z021AB37X13');
console.log('Issuer: Bundesrepublik Deutschland');
console.log('Issue Date: 2025-03-24');
console.log('Expiry Date: 2031-03-24');
console.log('Institution: MIT');
console.log('Degree: Bachelor in Computer Science');
console.log('GPA: 3.9');
console.log('Total Credits: 7');
console.log('Status: Completed\n');

// Save to files
fs.writeFileSync('mdoc-cbor.bin', cborBuffer);
fs.writeFileSync('mdoc-base64-latest.txt', base64);
fs.writeFileSync('mdoc-base64url-latest.txt', base64url);

console.log('✅ Files saved:');
console.log('   - mdoc-cbor.bin (binary CBOR)');
console.log('   - mdoc-base64-latest.txt (standard base64)');
console.log('   - mdoc-base64url-latest.txt (URL-safe base64)\n');

console.log('═════════════════════════════════════════════════════\n');

console.log('🎯 Next Steps:\n');
console.log('1. Copy the Base64URL string above\n');
console.log('2. Visit: https://paradym.id/tools/mdoc\n');
console.log('3. Paste Base64URL into the input field\n');
console.log('4. Click "Decode" to verify the mDOC structure\n');

console.log('Expected Output:');
console.log('   ✓ org.iso.23220.photoid.1 (8 fields)');
console.log('   ✓ org.iso.23220.education.qualification.1 (5 fields)');
console.log('   ✓ org.iso.23220.education.transcript.1 (4 fields)\n');
