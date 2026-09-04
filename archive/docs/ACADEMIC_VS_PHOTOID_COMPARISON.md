# Academic vs Photo ID Credentials - Comparison Guide

## 🔄 Format Evolution

The credential system now supports **two major credential types**:

### 1. **Academic Credentials (Original)**
- **Document Type:** `org.iso.18013.5.1.mDL`
- **Use Case:** University degree certificates
- **Focus:** Education-specific data
- **Namespaces:** Single (org.iso.18013.5.1)

### 2. **Photo ID Credentials (New)**
- **Document Type:** `org.iso.23220.photoid.1`
- **Use Case:** Personal identification + education
- **Focus:** Multi-purpose (ID + education)
- **Namespaces:** Multiple (PhotoID + Education Qualification + Transcript)

---

## 📊 Side-by-Side Comparison

### **Academic Credential Structure**

```json
{
  "studentId": "STU-2026-001",
  "name": {
    "givenName": "Alice",
    "familyName": "Johnson"
  },
  "institution": "MIT",
  "courses": [
    {
      "courseCode": "6.S191",
      "courseName": "Machine Learning",
      "credits": 3
    }
  ],
  "degreeLevel": "bachelor",
  "fieldOfStudy": "Computer Science",
  "gpa": 3.9,
  "issuanceDate": "2026-08-28T20:58:43Z",
  "expiryDate": "2031-08-28T20:58:43Z"
}
```

**Characteristics:**
- ✓ Focused on education data
- ✓ Single field per element (name as object)
- ✓ No personal identification
- ✓ No date of birth or document number
- ✓ Simple flat namespace

---

### **Photo ID Credential Structure**

```json
{
  "docType": "org.iso.23220.photoid.1",
  "namespaces": {
    "org.iso.23220.photoid.1": {
      "full_name": "Erika Muster",
      "date_of_birth": "1964-08-12",
      "document_number": "Z021AB37X13",
      "issuing_authority": "Bundesrepublik Deutschland",
      "issue_date": "2025-03-24",
      "expiry_date": "2031-03-24",
      "issuing_country": "NL",
      "portrait": "[base64_image_data]"
    },
    "org.iso.23220.education.qualification.1": {
      "institution_name": "MIT",
      "degree_level": "bachelor",
      "field_of_study": "Computer Science",
      "graduation_date": "2026-05-15",
      "gpa": 3.9
    },
    "org.iso.23220.education.transcript.1": {
      "student_id": "STU-2026-001",
      "courses": [
        {
          "courseCode": "6.S191",
          "courseName": "Machine Learning",
          "credits": 3,
          "grade": "A"
        }
      ],
      "total_credits": 7,
      "status": "completed"
    }
  }
}
```

**Characteristics:**
- ✓ Multi-purpose (ID + education)
- ✓ Organized by namespace
- ✓ Full name as single field
- ✓ Personal ID elements (DOB, document number)
- ✓ Photo/portrait support
- ✓ Course grades included
- ✓ Extensible structure

---

## 🔑 Field Comparison

| Aspect | Academic | Photo ID |
|--------|----------|----------|
| **Document Type** | org.iso.18013.5.1.mDL | org.iso.23220.photoid.1 |
| **Namespaces** | 1 | 3 |
| **Has Portrait** | No | Yes |
| **Has DOB** | Optional | Required |
| **Has Document #** | No | Required |
| **Course Grades** | No | Yes (in transcript) |
| **Issuing Country** | No | Yes |
| **Personal ID** | No | Yes |
| **Extensible** | Limited | Yes |

---

## 🔄 API Endpoint Comparison

### **Academic Credential - Issue**
```http
POST /credentials/issue
{
  "studentId": "STU-2026-001",
  "name": {
    "givenName": "Alice",
    "familyName": "Johnson"
  },
  "institution": "MIT",
  "courses": [...],
  "gpa": 3.9
}
```

### **Photo ID Credential - Issue**
```http
POST /credentials/issue
{
  "docType": "org.iso.23220.photoid.1",
  "full_name": "Erika Muster",
  "date_of_birth": "1964-08-12",
  "document_number": "Z021AB37X13",
  "issuing_authority": "Bundesrepublik Deutschland",
  "issue_date": "2025-03-24",
  "expiry_date": "2031-03-24",
  "issuing_country": "NL",
  "portrait": "[base64_image]",
  "education_qualification": {...},
  "education_transcript": {...}
}
```

---

## 📈 Use Cases

### **Academic Credentials Best For:**
- ✓ University degree verification
- ✓ Transcript sharing with employers
- ✓ Educational program applications
- ✓ Scholarship verification
- ✓ Continuing education tracking

### **Photo ID Credentials Best For:**
- ✓ Personal identification verification
- ✓ Age/address verification
- ✓ Combined ID + education (e.g., student ID cards)
- ✓ International credential recognition
- ✓ Cross-border employment verification
- ✓ Government/legal document requirements

---

## 🔐 Security Considerations

### **Academic Credentials**
- **Signing:** ED25519 signatures
- **Key:** Issuer public key
- **Revocation:** Via credential ID
- **Scope:** Education-focused

### **Photo ID Credentials**
- **Signing:** ES256 (ECDSA) signatures
- **Key:** X.509 certificates
- **Revocation:** Via document number or credential ID
- **Scope:** Personal + Educational
- **Additional:** Photo/portrait data encryption recommended

---

## 🧪 Testing Both Types

### **Test Academic Credential**
```bash
node test-academic-credential.js
```

### **Test Photo ID Credential**
```bash
node test-photo-id-issuance.js
```

### **Test Complete Workflow**
```bash
node test-photo-id-e2e-workflow.js
```

---

## 📋 Validation Rules

### **Academic Credential Requires:**
- [x] studentId (non-empty string)
- [x] name.givenName (string)
- [x] name.familyName (string)
- [x] institution (string)
- [x] courses (array, minimum 1 item)

### **Photo ID Credential Requires:**
- [x] docType = "org.iso.23220.photoid.1"
- [x] full_name (string)
- [x] date_of_birth (ISO 8601 date)
- [x] document_number (string)
- [x] issuing_authority (string)
- [x] issue_date (ISO 8601 date)
- [x] expiry_date (ISO 8601 date)
- [x] Optional: issuing_country, portrait, education fields

---

## 🎯 Migration Guide

### **If You're Using Academic Credentials:**

**Before:**
```json
{
  "studentId": "STU-001",
  "name": { "givenName": "John", "familyName": "Doe" },
  "institution": "MIT"
}
```

**After (Photo ID with academic data):**
```json
{
  "docType": "org.iso.23220.photoid.1",
  "full_name": "John Doe",
  "date_of_birth": "2000-01-15",
  "document_number": "ID-2026-001",
  "issuing_authority": "University of Record",
  "issue_date": "2026-01-01",
  "expiry_date": "2031-01-01",
  "issuing_country": "US",
  "education_qualification": {
    "institution_name": "MIT",
    "degree_level": "bachelor"
  },
  "education_transcript": {
    "student_id": "STU-001"
  }
}
```

**Benefits:**
- ✓ Personal identification support
- ✓ International standard (ISO 23220)
- ✓ Better privacy control (separated namespaces)
- ✓ Photo/image support
- ✓ Professional document format

---

## 🚀 Implementation Timeline

| Phase | Academic | Photo ID | Status |
|-------|----------|----------|--------|
| Phase 0 | ✅ Completed | - | Foundation |
| Phase 1 | ✅ Completed | 🚀 New | In Development |
| Phase 2 | 🔄 Enhanced | ✅ Core | Next |
| Phase 3 | 📦 Batch | 📦 Batch | Future |
| Phase 4 | 📱 Mobile | 📱 Mobile | Future |

---

## 📞 Support Matrix

| Feature | Academic | Photo ID |
|---------|----------|----------|
| Issue Credential | ✅ | ✅ |
| Retrieve Credential | ✅ | ✅ |
| List Credentials | ✅ | ✅ |
| Generate QR | ✅ | ✅ |
| Revoke Credential | ✅ | ✅ |
| Batch Issue | ✅ | 🔄 |
| Verify Credential | ✅ | ✅ |
| Register Issuer | ✅ | ✅ |
| Paradym Tool | ❌ | ✅ |

---

## 🎓 Standards Reference

| Type | Standard | Version | URL |
|------|----------|---------|-----|
| Academic | ISO/IEC 18013-5 | 2021 | mDOC/mDL |
| Photo ID | ISO/IEC 23220-1 | 2023 | Personal ID |
| Encoding | RFC 7049 | - | CBOR |
| Base64URL | RFC 4648 | - | Section 5 |

---

**Last Updated:** 2026-08-29  
**Credential Types Supported:** 2 (Academic + Photo ID)  
**Primary Innovation:** Multi-namespace Photo ID with education integration  
**Next Generation:** Full cryptographic signing (ES256/ED25519)
