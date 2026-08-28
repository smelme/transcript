# Issuer Admin Portal (P0-2)

Web-based admin portal for credential issuance, management, and verifier oversight.

## Overview

The Issuer Admin Portal is a React-based web application that enables administrators to:
- Issue and manage academic credentials
- View credential lifecycle and audit trails
- Manage verifier registrations and approvals
- Monitor trust scores and verification activity
- Dashboard with key statistics and recent activities

## Architecture

```
Frontend (React):
  ├── Pages (Dashboard, Credentials, Verifiers)
  ├── Components (Navigation, Forms, Tables)
  ├── Services (API calls)
  └── Styles (CSS)

API Integration:
  ├── Credentials Service
  ├── Verifiers Service
  └── Authentication Service
```

## Features

### Dashboard
- Real-time credential statistics (issued, pending, revoked, expired)
- Verifier overview (approved, pending, trust scores)
- Recent activity feed
- Quick stats cards with visual indicators

### Credentials Management
- **List View**: Browse all credentials with pagination and filtering
- **Create**: Issue new credentials with form validation
- **Detail View**: View full credential details and audit trail
- **Revocation**: Revoke credentials with reason tracking

### Verifiers Management
- **List View**: Browse verifiers by status with filtering
- **Detail View**: View verifier information and history
- **Approval**: Approve pending verifier registrations
- **Trust Management**: Update trust scores with reasoning
- **Actions**: Suspend or revoke verifiers as needed

### Authentication
- Login page with credential validation
- Session management with JWT tokens
- Automatic token injection in API requests
- Logout functionality

## Components

### Pages
- **Dashboard**: Overview of issuance and verification activity
- **CredentialsList**: Paginated list of all credentials
- **CredentialCreate**: Form for issuing new credentials
- **CredentialDetail**: Full credential information and audit trail
- **VerifiersList**: Filtered list of verifiers by status
- **VerifierDetail**: Verifier profile with management options
- **Login**: Authentication entry point

### Components
- **Navigation**: Top navigation bar with menu and user info
- **StatCard**: Dashboard statistic card component
- **RecentActivity**: Activity feed component

### Services
- **apiService.js**: Centralized API client with axios
  - credentialService (list, create, revoke, audit)
  - verifierService (list, approve, suspend, revoke, trust scoring)
  - authService (login, logout, session management)

## API Integration

### Credential Endpoints
```javascript
GET  /api/credentials                    // List credentials
GET  /api/credentials/:id                // Get credential detail
POST /api/credentials                    // Create credential
POST /api/credentials/:id/revoke         // Revoke credential
GET  /api/credentials/:id/audit          // Get audit trail
GET  /api/credentials/stats              // Get statistics
```

### Verifier Endpoints
```javascript
GET  /api/verifiers                      // List verifiers
GET  /api/verifiers/:id                  // Get verifier detail
POST /api/verifiers/:id/approve          // Approve verifier
POST /api/verifiers/:id/suspend          // Suspend verifier
POST /api/verifiers/:id/revoke           // Revoke verifier
POST /api/verifiers/:id/trust-score      // Update trust score
GET  /api/verifiers/:id/audit            // Get audit trail
GET  /api/verifiers/stats                // Get statistics
```

### Authentication Endpoints
```javascript
POST /api/auth/login                     // Login
POST /api/auth/logout                    // Logout
GET  /api/auth/me                        // Get current user
```

## Setup & Installation

### Prerequisites
- Node.js 18.17.0+
- npm or yarn

### Install Dependencies
```bash
npm install
```

### Development
```bash
npm run dev
```

Runs on `http://localhost:5173` (Vite default)

### Build
```bash
npm run build
```

Creates optimized production build in `dist/`

### Environment Variables
Create `.env` file:
```
REACT_APP_API_URL=http://localhost:3000/api
REACT_APP_AUTH_TIMEOUT=3600000
```

## UI/UX Features

### Design Principles
- Clean, professional interface consistent with Smart College branding
- Intuitive navigation and information hierarchy
- Responsive design for desktop and tablet
- Accessibility-first approach (semantic HTML, ARIA labels)
- Clear visual feedback for user actions

### Color Scheme
- Primary: #007bff (Blue)
- Success: #28a745 (Green)
- Warning: #ffc107 (Yellow)
- Danger: #dc3545 (Red)
- Neutral: #7f8c8d (Gray)

### Status Indicators
- Badges for credential/verifier status
- Color-coded status labels
- Trust score stars (⭐)
- Activity icons (📋, 🔍, ⏳, ✅, 🚫)

## Testing

30+ unit tests for API service layer:

```bash
npm test
```

Coverage:
- ✅ Credential operations (list, create, revoke, audit)
- ✅ Verifier operations (list, approve, suspend, revoke)
- ✅ Trust score management
- ✅ Authentication flows
- ✅ Error handling
- ✅ Request/response structures
- ✅ Pagination support
- ✅ Status filtering

## Security

### Authentication
- JWT token-based authentication
- Tokens stored in localStorage
- Automatic token injection in all requests
- Session validation on app load

### Data Protection
- API calls over HTTPS (production)
- Sensitive operations require confirmation
- Audit trails for all actions
- No credential claims displayed (only metadata)

### Error Handling
- User-friendly error messages
- Network error resilience
- Validation feedback
- Logging for debugging

## Related Stories

- **P0-3**: mDoc Generation Engine (provides credential creation data)
- **P0-4**: Credential Storage (data source for list/detail views)
- **P0-11**: Verifier Registry (data source for verifier management)
- **P0-5**: Wallet QR Reception (QR distribution to users)
- **P0-9**: Signature Validation (verification workflow)

## Future Enhancements

- Bulk credential issuance
- CSV import/export
- Advanced filtering and search
- Batch operations on credentials
- Verifier analytics and reporting
- Webhook notifications
- Dark mode support
- Mobile responsive improvements
- Accessibility audit and improvements
- Performance optimization (code splitting, lazy loading)
- Credential preview
- QR code generation & download
- Distribution tracking

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Pages

(TBD - see Phase 1 stories for implementation details)

- `/dashboard` - Admin dashboard
- `/issue` - Single credential issuance
- `/bulk-upload` - Bulk CSV upload
- `/credentials` - View issued credentials
- `/history` - Issuance audit log

## Tech Stack

- React 18
- Vite
- Keycloak OIDC
- Axios

## Development

See main repository README and system plan for full context.
