# Academic Credential - mDOC Format

## Issued Credential

**Credential ID:** `29238018-d473-4f8a-b724-f259714769bb`  
**Issuer:** Smart College (MIT)  
**Status:** Active  
**Issued:** 2026-08-28T20:58:43.832Z  
**Expires:** 2031-08-28T20:58:43.832Z

---

## mDOC Structure (ISO/IEC 18013-5 Adapted for Academic)

```json
{
  "docType": "org.iso.18013.5.1.mDL",
  "credentialType": "AcademicCredential",
  "issuer": {
    "issuerDid": "did:example:issuer-001",
    "issuerName": "Smart College",
    "issuerUrl": "https://mit.edu",
    "issueDate": "2026-08-28T20:58:43.832Z"
  },
  "nameSpaces": {
    "org.iso.18013.5.1": {
      "family_name": "Johnson",
      "given_name": "Alice",
      "date_of_birth": "2001-06-15"
    },
    "org.iso.23220.1.academic": {
      "student_id": "STU-2026-001",
      "institution": "MIT",
      "degree_level": "bachelor",
      "field_of_study": "Computer Science",
      "gpa": 3.9,
      "issue_date": "2026-08-28T20:58:43.832Z",
      "expiry_date": "2031-08-28T20:58:43.832Z"
    }
  },
  "courses": [
    {
      "course_code": "6.S191",
      "course_name": "Machine Learning",
      "credits": 3,
      "status": "completed"
    },
    {
      "course_code": "6.009",
      "course_name": "Programming",
      "credits": 4,
      "status": "completed"
    }
  ],
  "achievements": [
    "Deans List 2025",
    "Presidents Award"
  ],
  "proofOfOwnership": {
    "signatureAlgorithm": "ES256",
    "certificateChain": [
      "cert_issuer_001"
    ],
    "signature": "sig_1556d5f8-5956-4e32-9cb4-9048401d457c"
  },
  "mobileSecurityObject": {
    "valueDigests": {
      "SHA256": {
        "given_name": "hash_value_1",
        "family_name": "hash_value_2",
        "date_of_birth": "hash_value_3",
        "student_id": "hash_value_4",
        "institution": "hash_value_5"
      }
    },
    "digestAlgorithm": "SHA256",
    "authenticationType": "ECDSA_WITH_SHA256"
  }
}
```

---

## Credential Data (Full Details)

```json
{
  "credentialId": "29238018-d473-4f8a-b724-f259714769bb",
  "credentialType": "AcademicCredential",
  "status": "active",
  "issuer": {
    "issuerId": "issuer-001",
    "issuerDid": "did:example:issuer-001",
    "issuerName": "Smart College"
  },
  "subject": {
    "studentId": "STU-2026-001",
    "name": {
      "givenName": "Alice",
      "familyName": "Johnson"
    },
    "dateOfBirth": "2001-06-15"
  },
  "institution": {
    "name": "MIT",
    "degreeLevel": "bachelor",
    "fieldOfStudy": "Computer Science",
    "gpa": 3.9
  },
  "courses": [
    {
      "courseCode": "6.S191",
      "courseName": "Machine Learning",
      "credits": 3
    },
    {
      "courseCode": "6.009",
      "courseName": "Programming",
      "credits": 4
    }
  ],
  "achievements": [
    "Deans List 2025",
    "Presidents Award"
  ],
  "dates": {
    "issuanceDate": "2026-08-28T20:58:43.832Z",
    "expiryDate": "2031-08-28T20:58:43.832Z"
  },
  "signature": {
    "algorithm": "ES256",
    "value": "sig_1556d5f8-5956-4e32-9cb4-9048401d457c"
  }
}
```

---

## QR Code Payload (Compact Format)

```json
{
  "credentialId": "29238018-d473-4f8a-b724-f259714769bb",
  "issuerId": "issuer-001",
  "issuerName": "Smart College",
  "credentialType": "AcademicCredential",
  "subject": {
    "givenName": "Alice",
    "familyName": "Johnson",
    "studentId": "STU-2026-001"
  },
  "institution": "MIT",
  "issuanceDate": "2026-08-28T20:58:43.832Z",
  "expiryDate": "2031-08-28T20:58:43.832Z"
}
```

---

## Verification Flow

### 1. **Scan QR Code**
- Extract credentialId: `29238018-d473-4f8a-b724-f259714769bb`
- Extract issuerId: `issuer-001`

### 2. **Register Issuer** (if new)
```bash
POST http://localhost:3001/registry/verifiers
{
  "name": "MIT",
  "url": "https://mit.edu",
  "credentialTypes": ["academic"]
}
```

### 3. **Approve Issuer**
```bash
POST http://localhost:3001/registry/verifiers/issuer-001/approve
```

### 4. **Verify Credential**
```bash
POST http://localhost:3001/verify/scan
{
  "credentialId": "29238018-d473-4f8a-b724-f259714769bb",
  "issuerId": "issuer-001",
  "credentialType": "AcademicCredential"
}
```

### 5. **Verification Result**
```json
{
  "success": true,
  "status": "verified",
  "credentialId": "29238018-d473-4f8a-b724-f259714769bb",
  "issuerId": "issuer-001",
  "issuerName": "Smart College",
  "trustScore": 85,
  "verificationId": "ver-xyz-123"
}
```

---

## Storage in Mobile Wallet

The credential is stored locally on the mobile device with:

```json
{
  "storedAt": "2026-08-29T10:00:00.000Z",
  "lastAccessedAt": "2026-08-29T10:15:00.000Z",
  "shareCount": 0,
  "credential": {
    "credentialId": "29238018-d473-4f8a-b724-f259714769bb",
    "credentialType": "AcademicCredential",
    "issuerName": "Smart College",
    "holderName": "Alice Johnson",
    "institution": "MIT",
    "isExpired": false,
    "expiryDate": "2031-08-28T20:58:43.832Z"
  }
}
```

---

## Key Features

| Feature | Details |
|---------|---------|
| **Credential ID** | 29238018-d473-4f8a-b724-f259714769bb |
| **Issuer** | Smart College (MIT) |
| **Holder** | Alice Johnson (STU-2026-001) |
| **Degree** | Bachelor in Computer Science |
| **GPA** | 3.9/4.0 |
| **Courses** | 2 (7 credits total) |
| **Issued** | Aug 28, 2026 |
| **Expires** | Aug 28, 2031 (5 years) |
| **Status** | Active ✅ |
| **Signature** | ES256 (ECDSA) |

---

## Next Steps

1. ✅ **Credential Issued** - ID: `29238018-d473-4f8a-b724-f259714769bb`
2. **Register Issuer** - Add MIT to trusted issuers
3. **Approve Issuer** - Set trust score (currently 50)
4. **Verify** - Use web UI at http://localhost:5173/scan
5. **Store** - Save in mobile wallet
6. **Share** - Present to verifiers via NFC or QR code

You can now:
- Generate more credentials for other students
- Batch issue credentials
- Manage issuer trust scores
- Track verification statistics
