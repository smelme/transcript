#!/usr/bin/env node

/**
 * Generate properly formatted ISO 18013-5 mDOC for Paradym tool
 * Converts base64 to base64url format
 */

import fs from 'fs';

// This is the properly structured mDOC in base64
// Based on the ISO 18013-5 standard with academic credentials
const mdocBase64 = 'uQACam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xmuBZBGRoZGlnZXN0SUQAcWVsZW1lbnRJZGVudGlmaWVyag2luXZlbk5hbWVsZWxlbWVudFZhbHVlZUFsaWNlZnJhbmRvbVggV3gpvwDVT6x+PqGPfWRbD7fLvVfJX0mYaYyAzxxWqZ/2BhYaqRoZGlnZXN0SUQBcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1lbGVsZW1lbnRWYWx1ZWdKb2huc29uZnJhbmRvbVggQ0xpYHcrfbtI2L/LI7oJzgXCquCJK1l5+P8wvVQhVu32BhYaqRoZGlnZXN0SUQCcWVsZW1lbnRJZGVudGlmaWVya2RhdGVfb2ZfYmlydGhsZWxlbWVudFZhbHVlwBoyMDAxLTA2LTE1ZnJhbmRvbVggZHcI5LXfL0F/fkp9LXhWlT1XpzNsEcsxf6WVbzRCsf/2BhYaqRoZGlnZXN0SUQDcWVsZW1lbnRJZGVudGlmaWVyamluc3RpdHV0aW9ubGVsZW1lbnRWYWx1ZWNNSVRmcmFuZG9tWCCnCL1K8L2vb8oOzXFlI79YP0cpMHbh0cTQm85TxLZCbfYGFhYqRoZGlnZXN0SUQEcWVsZW1lbnRJZGVudGlmaWVya2RlZ3JlZV9sZXZlbGxlbGVtZW50VmFsdWVnYmFjaGVsb3JmcmFuZG9tWCCXpHm1GhbHT8DyFNOLb1yLFg3rBVxOmqx8TxqHhJZtO/YGFhYqRoZGlnZXN0SUQFcWVsZW1lbnRJZGVudGlmaWVybWZpZWxkX29mX3N0dWR5bGVsZW1lbnRWYWx1ZXBDb21wdXRlciBTY2llbmNlZnJhbmRvbVggRs9n5bk5qWG8uFpx6hqxRGg8w1NhXlzBDxVfVyZHv1/2BhYaqRoZGlnZXN0SUQGcWVsZW1lbnRJZGVudGlmaWVyY2dwYWxlbGVtZW50VmFsdWXpA+xjMy45ZnJhbmRvbVggzFKv+73KFx5z/sQGADL7S0a8KuCH/HyIGw0uWJjXk2P2BhYaqRoZGlnZXN0SUQHcWVsZW1lbnRJZGVudGlmaWVyZ2NvdXJzZXNsZWxlbWVudFZhbHVlgqRqY291cnNlQ29kZWY2LlMxOTFrY291cnNlTmFtZXBNYWNoaW5lIExlYXJuaW5nZ2NyZWRpdHMDZnN0YXR1c2ljb21wbGV0ZWShpGpjb3Vyc2VDb2RlZjYuMDA5a2NvdXJzZU5hbWVrUHJvZ3JhbW1pbmdnY3JlZGl0cwRmc3RhdHVzaWNvbXBsZXRlZGZyYW5kb21YIPVSr/c9yhceUvbEBgAy+0tGvCrgh/x8iBsNLliY15Nj9gYWagphc3N1ZXJJbmZvpGlpc3N1ZXJOYW1lbFNtYXJ0IENvbGxlZ2VpaXNzdWVyRGlkeBpkaWQ6ZXhhbXBsZTppc3N1ZXItMDAxamlzc3VhbmNlRGF0ZZgcMjAyNi0wOC0yOFQyMDo1ODo0M1ppZXhwaXJlRGF0ZZgcMjAzMS0wOC0yOFQyMDo1ODo0M1ptYWNoaWV2ZW1lbnRzhktkZWFuJ3MgTGlzdG5QcmVzaWRlbnQncyBBd2FyZGtkb2NUeXBleBdvcmcuaXNvLjE4MDEzLjUuMS5tRExsv/8gZGlnZXN0QWxnb3JpdGhtZ1NIQSI1Nmxpc3N1ZXJBdXRohEOgASaiBAA4gaCBgAYBwIAHH4AFgsgAEgQhgOgAL23L43cPvZ76YS8j7LtYxA7L2Ykj/B/4gYGgQRJuYYHu3Ixvx87FshZJxYyIEEd3MRvctX3KV5cPeJQjBr7V8V0+dkXmVzp/gQQvxXjbNCUXMGBmgvwWkQgYB53';

// Convert standard base64 to base64url
function base64ToBase64Url(base64String) {
  return base64String
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// The reverse
function base64UrlToBase64(base64urlString) {
  // Add padding
  const padding = (4 - (base64urlString.length % 4)) % 4;
  const padded = base64urlString + '='.repeat(padding);
  
  return padded
    .replace(/-/g, '+')
    .replace(/_/g, '/');
}

const mdocBase64Url = base64ToBase64Url(mdocBase64);

console.log('🔐 ISO 18013-5 mDOC Generator for Paradym Tool\n');
console.log('═══════════════════════════════════════════════════\n');

console.log('Standard Base64:');
console.log('───────────────');
console.log(mdocBase64);
console.log(`Length: ${mdocBase64.length} characters\n`);

console.log('Base64URL (For Paradym Tool):');
console.log('────────────────────────────');
console.log(mdocBase64Url);
console.log(`Length: ${mdocBase64Url.length} characters\n`);

console.log('📋 Credential Information:');
console.log('──────────────────────────');
console.log('Holder: Alice Johnson (STU-2026-001)');
console.log('Institution: MIT');
console.log('Degree: Bachelor');
console.log('Field: Computer Science');
console.log('GPA: 3.9');
console.log('Courses: 2 (Machine Learning, Programming)');
console.log('Achievements: Dean\'s List, President\'s Award');
console.log('Issued: 2026-08-28');
console.log('Expires: 2031-08-28\n');

console.log('📝 How to Use:');
console.log('──────────────');
console.log('1. Go to: https://paradym.id/tools/mdoc');
console.log('2. Paste the Base64URL string above');
console.log('3. The tool will decode and display the mDOC structure\n');

// Save formats to files
fs.writeFileSync('mdoc-base64.txt', mdocBase64);
fs.writeFileSync('mdoc-base64url.txt', mdocBase64Url);

console.log('✅ Files saved:');
console.log('  - mdoc-base64.txt');
console.log('  - mdoc-base64url.txt\n');

console.log('═══════════════════════════════════════════════════');
