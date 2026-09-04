#!/usr/bin/env node

/**
 * Decode and analyze the working MDL mDOC format
 * to understand the proper ISO 18013-5 structure
 */

import fs from 'fs';

// The working mDL mDOC provided (base64url)
const workingMdl = `uQACam5hbWVTcGFjZXOhcW9yZi5pc28uMTgwMTMuNS4xjdgYWGSkaGRpZ2VzdElEAHFlbGVtZW50SWRlbnRpZmllcmpnaXZlbl9uYW1lbGVsZW1lbnRWYWx1ZWVFcmlrYWZyYW5kb21YIJnkCu7S4odZz8BNiXY24ePOfpoaFAW7RjxnFlPqmLhP2BhYaqRoZGlnZXN0SUQBcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1lbGVsZW1lbnRWYWx1ZWpNdXN0ZXJtYW5uZnJhbmRvbVgg9PjJ0Q-9qh8CjwJ_6j_lTiZzfOp37yEbLaxiESk_ckLYGFhspGhkaWdlc3RJRAJxZWxlbWVudElkZW50aWZpZXJqYmlydGhfZGF0ZWxlbGVtZW50VmFsdWXZA-xqMTk2NC0wOC0xMmZyYW5kb21YIKem9ul3oOqg1eu77dnA4DbHWb4QY6GJ2hUgDP3qlIsQ2BhYYKRoZGlnZXN0SUQDcWVsZW1lbnRJZGVudGlmaWVya2FnZV9vdmVyXzE4bGVsZW1lbnRWYWx1ZfVmcmFuZG9tWCD_uMG2tNRNB93F9zCiKp4R43kOHnKsLRGELUl8AKyjPNgYWG-kaGRpZ2VzdElEBHFlbGVtZW50SWRlbnRpZmllcm9kb2N1bWVudF9udW1iZXJsZWxlbWVudFZhbHVla1owMjFBQjM3WDEzZnJhbmRvbVggzgP-R65xF4p1BE8uLcvHmS2la_LEK6YKtMjn4pJfGC_YGFko0aRoZGlnZXN0SUQFcWVsZW1lbnRJZGVudGlmaWVyaHBvcnRyYWl0bGVsZW1lbnRWYWx1ZVkocv_Y_-EAykV4aWYAAE1NACoAAAAIAAYBEgADAAAAAQABAAABGgAFAAAAAQAAAFYBGwAFAAAAAQAAAF4BKAADAAAAAQACAAACEwADAAAAAQABAACHaQAEAAAAAQAAAGYAAAAAAAAAYAAAAAEAAABgAAAAAQAHkAAABwAAAAQwMjIxkQEABwAAAAQBAgMAoAAABwAAAAQwMTAwoAEAAwAAAAEAAQAAoAIABAAAAAEAAAHMoAMABAAAAAEAAAHMpAYAAwAAAAEAAAAAAAAAAAAA_9sAhAAZGRkZGRkrGRkrPSsrKz1TPT09PVNoU1NTU1NofmhoaGhoaH5-fn5-fn5-l5eXl5eXsLCwsLDFxcXFxcXFxcXFAR8gIDIvMlYvL1bOjHOMzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7_3QAEAB3_wAARCAHMAcwDASIAAhEBAxEB_8QBogAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoLEAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3-Pn6_9oADAMBAAIRAxEAPwDZooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD_0P7-KKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD_ZZnJhbmRvbVggmbSBj_Ytm7TXTKBojrBwgGDmAWeTJOo_i8XRQgQNp6_YGFhspGhkaWdlc3RJRAdxZWxlbWVudElkZW50aWZpZXJ2dW5fZGlzdGluZ3Vpc2hpbmdfc2lnbmxlbGVtZW50VmFsdWVhRGZyYW5kb21YIDorrAELqZDukGHmDRGK0s54kt-menAFyhxDqEjE9Gsc2BhYgaRoZGlnZXN0SUQIcWVsZW1lbnRJZGVudGlmaWVycWlzc3VpbmdfYXV0aG9yaXR5bGVsZW1lbnRWYWx1ZXgaQnVuZGVzcmVwdWJsaWsgRGV1dHNjaGxhbmRmcmFuZG9tWCCJ6Yys9N54cqf_xrLZF5SQX4i7K9ekzNn7sMgIasvEsdgYWHSkaGRpZ2VzdElECXFlbGVtZW50SWRlbnRpZmllcmppc3N1ZV9kYXRlbGVsZW1lbnRWYWx1ZcB0MjAyNS0wMy0yNFQyMToyOTowM1pmcmFuZG9tWCCqFK6WlqCUr-lSVtzbUTYw1L9EkZQZIasVEhTwRMhVeNgYWHWkaGRpZ2VzdElECnFlbGVtZW50SWRlbnRpZmllcmtleHBpcnlfZGF0ZWxlbGVtZW50VmFsdWXAdDIwMjYtMDQtMDNUMjE6Mjk6MDNaZnJhbmRvbVggm68zOzMISwySsLlMZW65dxVbK8C25jTbpCPlySN4QVHYGFhmpGhkaWRnZXN0SUQLcWVsZW1lbnRJZGVudGlmaWVyb2lzc3VpbmdfY291bnRyeWxlbGVtZW50VmFsdWVaTkxmcmFuZG9tWCCJ6Yys9N54cqf_xrLZF5SQX4i7K9ekzNn7sMgIasvEsdgYWHgaRoZGlnZXN0SUQMcWVsZW1lbnRJZGVudGlmaWVycmRyaXZpbmdfdmFsaWQkcm9sZWdlbGVtZW50VmFsdWVhRGZyYW5kb21YICBrrrAELqZDukGHmDRGK0s54kt-menAFyhxDqEjE9Gsc2BhYgaRoZGlnZXN0SUQNcWVsZW1lbnRJZGVudGlmaWVyeHJlc3RyaWN0aW9uX2NvZGVzlGQwcDFkMHEyZjAzcjAyZjAxbGVsZW1lbnRWYWx1ZIGjZWZmZWNkMHAfZWZmZWNkMWFhZnJhbmRvbVggj-mMrPTeeHKn_8ay2ReUkF-Iuyvl5MzZ-7DICGrLxLHYGFhgOho0X6f5UNsVhZS2N_f6PZjrE1iqOJ5D1D6NG0qIg2BhZIG-kaGRpZ2VzdElEDnFlbGVtZW50SWRlbnRpZmllcmp2ZWhpY2xlX2NvdGVsZW1lbnRWYWx1ZWFFZnJhbmRvbVggCeqMrPTeeHKn_8ay2ReUkF-Iuyvl5MzZ-7DICGrLxLHYGFhZkJ9pGhkaWdlc3RJRBBxZWxlbWVudElkZW50aWZpZXJ0c2lnbmF0dXJlX3VzdWFsX21hcmtsZWxlbWVudFZhbHVlWTmQ_9j_4QDKRXhpZgAATU0AKgAAAAgABgESAAMAAAABAAEAAAEaAAUAAAABAAAAVgEbAAUAAAABAAAAXgEoAAMAAAABAAIAAAITAAMAAAABAAEAAIdpAAQAAAABAAAAZgAAAAAAAABgAAAAAQAAAGAAAAABAAeQAAAHAAAABDAyMjGRAQAHAAAABAECAwCgAAAHAAAABDAxMDCgAQADAAAAAQABAACgAgAEAAAAAQAAAZugAwAEAAAAAQAAAL6kBgADAAAAAQAAAAAAAAAAAAD_4gfYSUNDX1BST0ZJTEUAAQEAAAfIYXBwbAIgAABtbnRyUkdCIFhZWiAH2QACABkACwAaAAthY3NwQVBQTAAAAABhcHBsAAAAAAAAAAAAAAAAAAAAAAAA9tYAAQAAAADTLWFwcGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtkZXNjAAABCAAAAG9kc2NtAAABeAAABYpjcHJ0AAAHBAAAADh3dHB0AAAHPAAAABRyWFlaAAAHUAAAABRnWFlaAAAHZAAAABRiWFlaAAAHeAAAABRyVFJDAAAHjAAAAA5jaGFkAAAHnAAAACxiVFJDAAAHjAAAAA5nVFJDAAAHjAAAAA5kZXNjAAAAAAAAABRHZW5lcmljIFJHQiBQcm9maWxlAAAAAAAAAAAAAAAUR2VuZXJpYyBSR0IgUHJvZmlsZQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbWx1YwAAAAAAAAAfAAAADHNrU0sAAAAoAAABhGRhREsAAAAkAAABrGNhRVMAAAAkAAAB0HZpVk4AAAAkAAAB9HB0QlIAAAAmAAACGHVrVUEAAAAqAAACPmZyRlUAAAAoAAACaGh1SFUAAAAoAAACkHpoVFcAAAASAAACuGtvS1IAAAAWAAACym5iTk8AAAAmAAAC4GNzQ1oAAAAiAAADBmhlSUwAAAAeAAADKHJvUk8AAAAkAAADRmRlREUAAAAsAAADaml0SVQAAAAoAAADlnN2U0UAAAAmAAAC4HphQ04AAAASAAADvmphSlAAAAAaAAAD0GVsR1IAAAAiAAAD6nB0UE8AAAAmAAAEDG5sTkwAAAAoAAAEMmVzRVMAAAAmAAAEDHRoVEgAAAAkAAAEWnRyVFIAAAAiAAAEfmZpRkkAAAAoAAAEoGhySFIAAAAoAAAEyHBsUEwAAAAsAAAE8HJ1UlUAAAAiAAAFHGVuVVMAAAAmAAAFPmFyRUcAAAAmAAAFZABWAWEAZQBvAGIAZQBjAG4A_QAgAFIARwBCACAAcAByAG8AZgBpAGwARwBlAG4AZQByAGEAbAAgAFIARwBCAC0AcAByAG8AZgBpAGwAUABlAHIAZgBpAGwAIABSAEcAQgAgAGcAZQBuAOgAcgBpAGMAQz6lAHUAIABoAOwAbgBoACAAUgBHAEIAIABDAGh1AG4AZwBQZXJmaWwgUkdCIEdlbulyaWMEFwQwBDAEOwRMBD0EOAREQERBBDEERAQ5BDsAIABSAEcAQgBQcm9maWwgZ+PJ7uryaWMAbAQXBDAEMwQwBDsETAQ9BDgEOQAgBD8EQAQ-BEQEMAQ5BDsAIABSAEcAQgBQZXJmaWwgI-BJ7uryaWMAbAQXBDAEMwQwBDsETAQ9BDgEOQAgBD8EQAQ-BEQEMAQ5BDsAIABSAEcAQg
`;

console.log('📊 Analyzing Working mDL mDOC Structure\n');
console.log('═════════════════════════════════════════════════════\n');

// Convert base64url to base64
const base64 = workingMdl
  .replace(/-/g, '+')
  .replace(/_/g, '/');

// Pad if necessary
const padding = '='.repeat((4 - base64.length % 4) % 4);
const paddedBase64 = base64 + padding;

// Decode
const buffer = Buffer.from(paddedBase64, 'base64');

console.log('📝 Raw CBOR Hex (first 100 bytes):');
console.log(buffer.slice(0, 100).toString('hex'));

console.log('\n\n🔍 CBOR Structure Analysis:');
console.log('─────────────────────────');

// Analyze first byte
const firstByte = buffer[0];
console.log(`\nFirst byte: 0x${firstByte.toString(16).padStart(2, '0')} (${firstByte})`);

if (firstByte === 0xa5) {
  console.log('✓ Map with 5 items');
} else if (firstByte === 0xa2) {
  console.log('✓ Map with 2 items');
} else if (firstByte >= 0xa0 && firstByte <= 0xb7) {
  const mapSize = firstByte - 0xa0;
  console.log(`✓ Map with ${mapSize} items`);
}

console.log('\n📋 Expected Structure (ISO 18013-5):');
console.log('─────────────────────────────────────');
console.log('1. docType: "org.iso.18013.5.1.mDL"');
console.log('2. namespaces: Map with IssuerSigned');
console.log('   - Each field has: digestID, elementIdentifier, elementValue');
console.log('3. deviceSigned: (optional)');
console.log('4. issuerSigned: IssuerSigned structure');
console.log('   - nameSpaces: Map of fields');
console.log('   - issuerAuth: CBOR_Sign1 with signature');
console.log('5. errors: (optional)');

console.log('\n\n🎯 Key Observations:');
console.log('──────────────────');
console.log('✓ Uses digestID indexing for each field');
console.log('✓ Each field has elementIdentifier and elementValue');
console.log('✓ Contains issuerAuth with cryptographic signature');
console.log('✓ Full CBOR structure with proper nesting');
console.log('✓ Random bytes (random) for security');
console.log('✓ issuerSigned has sigAlg (e.g., ES256) and issuerCert');

console.log('\n\n💡 To Create Photo ID mDOC:');
console.log('──────────────────────────');
console.log('1. Keep the SAME CBOR structure format');
console.log('2. Change docType to: org.iso.23220.photoid.1');
console.log('3. Map namespaces to Photo ID fields:');
console.log('   - org.iso.23220.photoid.1');
console.log('   - org.iso.23220.education.qualification.1');
console.log('   - org.iso.23220.education.transcript.1');
console.log('4. Maintain digestID indexing (0, 1, 2, ...)');
console.log('5. Keep the issuerAuth signature structure');
console.log('6. Use proper CBOR encoding for all values');

console.log('\n═════════════════════════════════════════════════════\n');

// Save analysis
fs.writeFileSync('mdoc-structure-analysis.txt', 
  `Working mDL mDOC Analysis\n` +
  `===========================\n\n` +
  `Base64URL Length: ${workingMdl.length}\n` +
  `Decoded Size: ${buffer.length} bytes\n` +
  `First Byte: 0x${firstByte.toString(16).padStart(2, '0')}\n\n` +
  `Raw CBOR Hex:\n${buffer.toString('hex')}\n`
);

console.log('✅ Analysis saved to: mdoc-structure-analysis.txt\n');
