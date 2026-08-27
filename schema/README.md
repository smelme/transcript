# mDoc Academic Credential Schema

ISO/IEC 18013-5:2021 Compliant Schema for Academic Transcripts and Qualifications

## Overview

Defines the data structure for academic credentials (transcripts, degrees, certificates) in mDoc format. This schema is used by:
- **Issuer Service**: Issue credentials
- **Verifier Service**: Validate credential structure
- **Mobile Wallet**: Display and store credentials

## Namespace

```
org.smartcollege.academic/v1
```

## Schema Definition

### Required Fields

- `studentId` (string) - Unique student identifier
- `name` (object) - Student name
- `institution` (object) - Issuing institution
- `courses` (array) - List of completed courses
- `issueDate` (date-time) - Credential issuance timestamp
- `expiryDate` (date-time) - Credential expiry timestamp

### Optional Fields

- `dateOfBirth` (date) - Student birth date
- `degreeLevel` (enum) - Degree or qualification level
- `fieldOfStudy` (string) - Major or field of study
- `gpa` (number) - Cumulative GPA
- `achievements` (array) - Honors, awards, recognitions
- `issuerId` (string) - Issuer identifier

## Field Details

### studentId

**Type**: String  
**Length**: 1-50 characters  
**Pattern**: Alphanumeric, underscore, hyphen (^[A-Za-z0-9_-]+$)  
**Example**: `STU-2024-001234`, `student_001`

### name

**Type**: Object

```json
{
  "givenName": "Alice",
  "familyName": "Smith",
  "middleNames": ["Grace"]
}
```

- `givenName` (required): 1-100 characters
- `familyName` (required): 1-100 characters
- `middleNames` (optional): Array of up to 3 names

### dateOfBirth

**Type**: ISO 8601 Date  
**Format**: YYYY-MM-DD  
**Example**: `2000-01-15`

### institution

**Type**: Object

```json
{
  "name": "Smart College",
  "code": "SC-001",
  "country": "US"
}
```

- `name` (required): Institution name (1-200 chars)
- `code` (required): Institution code (1-50 chars)
- `country` (optional): ISO 3166-1 alpha-2 code

### degreeLevel

**Type**: Enum  
**Valid Values**:
- `high-school`
- `associate`
- `bachelor`
- `master`
- `doctorate`
- `certificate`
- `diploma`

**Example**: `bachelor`

### fieldOfStudy

**Type**: String  
**Length**: 1-200 characters  
**Example**: `Computer Science`, `Business Administration`

### courses

**Type**: Array of Objects  
**Min Items**: 1  
**Max Items**: 100

Each course must include:

```json
{
  "name": "Introduction to Programming",
  "code": "CS-101",
  "grade": "A",
  "credits": 3,
  "completionDate": "2023-05-15"
}
```

- `name` (required): Course name (1-200 chars)
- `code` (required): Course code (1-50 chars)
- `grade` (required): Grade received (1-5 chars)
- `credits` (required): Credit hours (0-999)
- `completionDate` (optional): ISO 8601 date

### gpa

**Type**: Number  
**Range**: 0.0 - 4.0  
**Example**: `3.9`, `3.5`

### achievements

**Type**: Array of Objects  
**Max Items**: 20

```json
{
  "title": "Dean's List",
  "date": "2023-06-01"
}
```

- `title` (required): Achievement title (1-200 chars)
- `date` (optional): ISO 8601 date

### issueDate

**Type**: ISO 8601 DateTime  
**Format**: YYYY-MM-DDTHH:MM:SSZ  
**Example**: `2024-01-10T10:00:00Z`

### expiryDate

**Type**: ISO 8601 DateTime  
**Format**: YYYY-MM-DDTHH:MM:SSZ  
**Example**: `2029-01-10T10:00:00Z`

**Business Rule**: Must be after `issueDate`

### issuerId

**Type**: String  
**Length**: 1-100 characters  
**Example**: `SC-ISSUER-001`, `university-123`

## Validation Rules

### Schema Validation
- All fields validated against JSON Schema (draft-07)
- Type checking and range validation
- Format validation (dates, emails, etc.)

### Business Rules
1. **Date Range**: `issueDate` must be before `expiryDate`
2. **GPA**: Must be between 0.0 and 4.0
3. **Courses**: At least one course required
4. **Credits**: Each course must have valid credits (0-999)
5. **No Extra Fields**: Additional properties are rejected

## Examples

### Minimal Valid Credential

```json
{
  "studentId": "STU-001",
  "name": {
    "givenName": "John",
    "familyName": "Doe"
  },
  "institution": {
    "name": "Smart College",
    "code": "SC-001"
  },
  "courses": [
    {
      "name": "Introduction to Computer Science",
      "code": "CS-101",
      "grade": "A",
      "credits": 3
    }
  ],
  "issueDate": "2024-01-10T10:00:00Z",
  "expiryDate": "2029-01-10T10:00:00Z"
}
```

### Complete Credential

```json
{
  "studentId": "STU-2024-001234",
  "name": {
    "givenName": "Alice",
    "familyName": "Smith",
    "middleNames": ["Grace"]
  },
  "dateOfBirth": "2000-01-15",
  "institution": {
    "name": "Smart College",
    "code": "SC-001",
    "country": "US"
  },
  "degreeLevel": "bachelor",
  "fieldOfStudy": "Computer Science",
  "courses": [
    {
      "name": "Introduction to Programming",
      "code": "CS-101",
      "grade": "A",
      "credits": 3,
      "completionDate": "2023-05-15"
    },
    {
      "name": "Data Structures",
      "code": "CS-201",
      "grade": "A+",
      "credits": 4,
      "completionDate": "2023-12-20"
    },
    {
      "name": "Algorithms",
      "code": "CS-301",
      "grade": "A",
      "credits": 4,
      "completionDate": "2024-01-15"
    }
  ],
  "gpa": 3.95,
  "achievements": [
    {
      "title": "Dean's List",
      "date": "2023-06-01"
    },
    {
      "title": "Scholarship Recipient",
      "date": "2023-09-01"
    }
  ],
  "issueDate": "2024-01-20T14:30:00Z",
  "expiryDate": "2029-01-20T14:30:00Z",
  "issuerId": "SC-ISSUER-001"
}
```

## Database Schema

### credential_schemas Table

Stores schema definitions and versions:

```sql
CREATE TABLE credential_schemas (
  id SERIAL PRIMARY KEY,
  namespace VARCHAR(255) NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  schema_definition JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### issued_credentials Table

Stores issued credential instances:

```sql
CREATE TABLE issued_credentials (
  id SERIAL PRIMARY KEY,
  credential_id UUID NOT NULL UNIQUE,
  issuer_id UUID NOT NULL,
  schema_id INTEGER NOT NULL REFERENCES credential_schemas(id),
  student_id VARCHAR(255) NOT NULL,
  credential_data JSONB NOT NULL,
  credential_cbor BYTEA,
  qr_code_data TEXT,
  status VARCHAR(50) NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### revocation_list Table

Tracks revoked credentials:

```sql
CREATE TABLE revocation_list (
  id SERIAL PRIMARY KEY,
  credential_id UUID NOT NULL REFERENCES issued_credentials(credential_id),
  issuer_id UUID NOT NULL,
  revocation_reason VARCHAR(255),
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### credential_audit_log Table

Audit trail for credential operations:

```sql
CREATE TABLE credential_audit_log (
  id SERIAL PRIMARY KEY,
  credential_id UUID,
  action VARCHAR(50) NOT NULL,
  actor_id UUID NOT NULL,
  issuer_id UUID,
  changes JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Usage

### Node.js

```javascript
import { SchemaValidator } from './src/index.js';

const validator = new SchemaValidator();

const credential = {
  studentId: 'STU-001',
  name: { givenName: 'John', familyName: 'Doe' },
  institution: { name: 'College', code: 'C-001' },
  courses: [{ name: 'Course', code: 'CS-101', grade: 'A', credits: 3 }],
  issueDate: '2024-01-01T00:00:00Z',
  expiryDate: '2029-01-01T00:00:00Z'
};

const result = validator.validateCompletely(credential);

if (result.valid) {
  console.log('✅ Credential is valid');
} else {
  console.log('❌ Validation errors:', result.errors);
}
```

### CLI

```bash
npm run validate sample-credential.json
```

## Versioning Strategy

Schema versions are managed independently:

- **Current Version**: 1.0
- **Namespace Format**: `org.smartcollege.academic/v1`
- **Database**: `credential_schemas` table tracks versions
- **Migration Path**: Define new version without breaking existing credentials

### Future Versions

- **v2.0**: Support additional credential types (certificates, licenses)
- **v3.0**: Multi-language name support
- **v4.0**: Selective disclosure fields

## Compliance

- **ISO/IEC 18013-5:2021**: mDoc specification
- **JSON Schema**: Draft-07 for schema definition
- **Date Format**: ISO 8601
- **Security**: Compatible with ED25519 signatures

## Testing

Unit tests cover:
- ✅ Valid credentials
- ✅ Missing required fields
- ✅ Invalid field types
- ✅ Business rules (dates, GPA, credits)
- ✅ Boundary conditions
- ✅ Edge cases

Run tests:
```bash
npm run test
```

## Security Considerations

1. **No Sensitive Data**: Schema contains only non-sensitive academic records
2. **Data Validation**: All input validated before storage
3. **Audit Trail**: All operations logged to `credential_audit_log`
4. **Signature**: Entire credential signed with issuer's ED25519 key
5. **CBOR Encoding**: Efficient, secure encoding for QR codes

## References

- ISO/IEC 18013-5:2021: Mobile Driving License
- JSON Schema: https://json-schema.org/
- CBOR RFC 8949: https://tools.ietf.org/html/rfc8949
- ED25519 RFC 8032: https://tools.ietf.org/html/rfc8032

## Related Stories

- P0-1: Define mDoc Credential Schema (this story)
- P0-3: Implement mDoc Generation Engine (uses schema)
- P0-4: Credential Storage Database (stores schema-validated data)
- P0-9: Signature Validation (validates schema structure)
