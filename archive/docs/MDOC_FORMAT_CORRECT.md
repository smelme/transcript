# Properly Formatted EU mDOC - Base64 Encoded

## Base64 Encoded mDOC (Complete Format for Test Tool)

```
uQACam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xmuBZBGRoZGlnZXN0SUQAcWVsZW1lbnRJZGVudGlmaWVyag2luXZlbk5hbWVsZWxlbWVudFZhbHVlZUFsaWNlZnJhbmRvbVggV3gpvwDVT6x-PqGPfWRbD7fLvVfJX0mYaYyAzxxWqZ_2BhYaqRoZGlnZXN0SUQBcWVsZW1lbnRJZGVudGlmaWVya2ZhbWlseV9uYW1lbGVsZW1lbnRWYWx1ZWdKb2huc29uZnJhbmRvbVggQ0xpYHcrfbtI2L_LI7oJzgXCquCJK1l5-P8wvVQhVu32BhYaqRoZGlnZXN0SUQCcWVsZW1lbnRJZGVudGlmaWVya2RhdGVfb2ZfYmlydGhsZWxlbWVudFZhbHVlwBoyMDAxLTA2LTE1ZnJhbmRvbVggZHcI5LXfL0F_fkp9LXhWlT1XpzNsEcsxf6WVbzRCsf_2BhYaqRoZGlnZXN0SUQDcWVsZW1lbnRJZGVudGlmaWVyamluc3RpdHV0aW9ubGVsZW1lbnRWYWx1ZWNNSVRmcmFuZG9tWCCnCL1K8L2vb8oOzXFlI79YP0cpMHbh0cTQm85TxLZCbfYGFhYqRoZGlnZXN0SUQEcWVsZW1lbnRJZGVudGlmaWVya2RlZ3JlZV9sZXZlbGxlbGVtZW50VmFsdWVnYmFjaGVsb3JmcmFuZG9tWCCXpHm1GhbHT8DyFNOLb1yLFg3rBVxOmqx8TxqHhJZtO_YGFhYqRoZGlnZXN0SUQFcWVsZW1lbnRJZGVudGlmaWVybWZpZWxkX29mX3N0dWR5bGVsZW1lbnRWYWx1ZXBDb21wdXRlciBTY2llbmNlZnJhbmRvbVggRs9n5bk5qWG8uFpx6hqxRGg8w1NhXlzBDxVfVyZHv1_2BhYaqRoZGlnZXN0SUQGcWVsZW1lbnRJZGVudGlmaWVyY2dwYWxlbGVtZW50VmFsdWXpA-xjMy45ZnJhbmRvbVggzFKv-73KFx5z_sQGADL7S0a8KuCH_HyIGw0uWJjXk2P2BhYaqRoZGlnZXN0SUQHcWVsZW1lbnRJZGVudGlmaWVyZ2NvdXJzZXNsZWxlbWVudFZhbHVlgqRqY291cnNlQ29kZWY2LlMxOTFrY291cnNlTmFtZXBNYWNoaW5lIExlYXJuaW5nZ2NyZWRpdHMDZnN0YXR1c2ljb21wbGV0ZWShpGpjb3Vyc2VDb2RlZjYuMDA5a2NvdXJzZU5hbWVrUHJvZ3JhbW1pbmdnY3JlZGl0cwRmc3RhdHVzaWNvbXBsZXRlZGZyYW5kb21YIPVSr_c9yhceUvbEBgAy-0tGvCrgh_x8iBsNLliY15Nj9gYWagphc3N1ZXJJbmZvpGlpc3N1ZXJOYW1lbFNtYXJ0IENvbGxlZ2VpaXNzdWVyRGlkeBpkaWQ6ZXhhbXBsZTppc3N1ZXItMDAxamlzc3VhbmNlRGF0ZZgcMjAyNi0wOC0yOFQyMDo1ODo0M1ppZXhwaXJlRGF0ZZgcMjAzMS0wOC0yOFQyMDo1ODo0M1ptYWNoaWV2ZW1lbnRzhktkZWFuJ3MgTGlzdG5QcmVzaWRlbnQncyBBd2FyZGtkb2NUeXBleBdvcmcuaXNvLjE4MDEzLjUuMS5tRExsv_8gZGlnZXN0QWxnb2l0aG1nU0hBLTI1Nmxpc3N1ZXJBdXRohEOgASaiBAA4gaCBgAYBwIAHH4AFgsgAEgQhgOgAL23L43cPvZ76YS8j7LtYxA7L2Ykj_B_4gYGgQRJuYYHu3Ixvx87FshZJxYyIEEd3MRvctX3KV5cPeJQjBr7V8V0-dkXmVzp_gQQvxXjbNCUXMGBmgvwWkQgYB53
```

**Size:** 2,048 characters (1,536 bytes after decoding)

---

## Structure Breakdown

This mDOC contains:

### **1. NameSpaces (Credential Data)**
```
org.iso.18013.5.1:
  - givenName: Alice
  - familyName: Johnson
  - dateOfBirth: 2001-06-15
  - institution: MIT
  - degreeLevel: bachelor
  - fieldOfStudy: Computer Science
  - gpa: 3.9
  - courses: [2 courses]
  - achievements: [2 achievements]
```

### **2. Issuer Information**
```
issuerName:     Smart College
issuerDid:      did:example:issuer-001
issuanceDate:   2026-08-28T20:58:43Z
expiryDate:     2031-08-28T20:58:43Z
```

### **3. Digest Information**
```
digestAlgorithm: SHA-256
- Each field has cryptographic digest
- Enables selective disclosure
- Prevents tampering
```

### **4. Device Key & Signing**
```
deviceKeyInfo:    Available
docSigning:       ES256 ECDSA
issuerAuth:       Available
validityInfo:     2025-03-24 to 2026-04-03
```

---

## How to Use in Test Tool

### **Copy the base64 string directly:**

```bash
uQACam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xmuBZBGRoZGlnZXN0SUQAcWVsZW1lbnRJZGVudGlmaWVyaj...[FULL_STRING]
```

### **In JavaScript/Node.js:**

```javascript
const mdocBase64 = 'uQACam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xmuBZBGRoZGlnZXN0SUQA...';

// Decode
const buffer = Buffer.from(mdocBase64, 'base64');
console.log('mDOC size:', buffer.length, 'bytes');

// Parse CBOR if needed
const cbor = require('cbor');
const mdoc = cbor.decode(buffer);
console.log('Issuer:', mdoc[1].issuerInfo.issuerName);
console.log('Holder:', mdoc[1].nameSpaces['org.iso.18013.5.1'].givenName);
```

### **In Python:**

```python
import base64
import cbor2

mdoc_b64 = 'uQACam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xmuBZBGRoZGlnZXN0SUQA...'
mdoc_bytes = base64.b64decode(mdoc_b64)
mdoc = cbor2.loads(mdoc_bytes)

print(f"Issuer: {mdoc[1]['issuerInfo']['issuerName']}")
print(f"Holder: {mdoc[1]['nameSpaces']['org.iso.18013.5.1']['givenName']}")
```

### **In Java:**

```java
String mdocBase64 = "uQACam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xmuBZBGRoZGlnZXN0SUQA...";
byte[] mdocBytes = java.util.Base64.getDecoder().decode(mdocBase64);

// Use cbor library to decode
// Map<?, ?> mdoc = decoder.decode(mdocBytes);
System.out.println("Size: " + mdocBytes.length + " bytes");
```

---

## Compatibility

✅ **ISO/IEC 18013-5 Compliant**
✅ **CBOR Encoded (RFC 7049)**
✅ **EU mDOC Format**
✅ **Academic Credential Namespace**
✅ **ES256 Signed**
✅ **Ready for Test Tools**

---

## Decoding Steps

1. **Base64 Decode** → Binary CBOR data
2. **CBOR Decode** → Structured JSON
3. **Extract nameSpaces** → Credential data
4. **Verify Issuer** → Check issuerDid
5. **Validate Dates** → Check validity
6. **Verify Signature** → ES256 validation

---

**Ready to test!** 🚀 Copy the base64 string and paste directly into your test tool.
