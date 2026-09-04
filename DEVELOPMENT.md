# Phase 1 - Local Development Guide

## Quick Start

All Phase 1 services are ready for local development with 100% test coverage (150/150 tests passing).

### Prerequisites
- Node.js 18.17.0+ 
- npm 9.0.0+
- Git

### Services Overview

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| Issuer Service | 3000 | Credential issuance & management | ✅ Ready |
| Verifier Service | 3001 | Credential verification & registry | ✅ Ready |
| Verifier Frontend | 5173 | React web UI | ✅ Ready |
| Mobile Wallet | - | React Native app | ✅ Ready |
| E2E Tests | - | Integration testing | ✅ Ready |

## Running Services Locally

### 1. Issuer Service (Port 3000)

```bash
cd issuer-service

# Install dependencies
npm install

# Run tests
npm test

# Start service
npm start
# or
node src/index.js
```

**API Endpoints:**
- `POST /credentials/issue` - Issue single credential
- `POST /credentials/batch-issue` - Batch issue credentials
- `GET /credentials` - List all credentials
- `GET /credentials/:id` - Get credential details
- `DELETE /credentials/:id` - Revoke credential
- `GET /credentials/:id/qr` - Generate QR code
- `GET /statistics` - Get statistics
- `GET /health` - Health check

**Example Request:**
```bash
curl -X POST http://localhost:3000/credentials/issue \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STU001",
    "name": "John Doe",
    "institution": "University",
    "courses": [
      {"name": "CS101", "credits": 3, "grade": "A"}
    ]
  }'
```

### 2. Verifier Service (Port 3001)

```bash
cd verifier-service

# Install dependencies
npm install

# Run tests
npm test

# Start service
npm start
# or
node src/index.js
```

**API Endpoints:**
- `POST /verify/scan` - Verify credential
- `POST /registry/verifiers` - Register issuer
- `GET /registry/verifiers` - List issuers
- `POST /registry/verifiers/:id/approve` - Approve issuer
- `POST /registry/verifiers/:id/block` - Block issuer
- `GET /verify/verification/:id` - Get verification result
- `GET /verify/statistics` - Get statistics
- `GET /health` - Health check

**Example Request:**
```bash
curl -X POST http://localhost:3001/verify/scan \
  -H "Content-Type: application/json" \
  -d '{
    "credentialId": "cred-123",
    "issuerId": "issuer-456"
  }'
```

### 3. Verifier Frontend (Port 5173)

```bash
cd verifier-frontend

# Install dependencies (with legacy peer deps)
npm install --legacy-peer-deps

# Run tests
npm test

# Start dev server
npm run dev
```

**Access in browser:**
- Dashboard: http://localhost:5173/dashboard
- QR Scanner: http://localhost:5173/scan
- Issuers: http://localhost:5173/issuers
- Results: http://localhost:5173/result/:id

### 4. Mobile Wallet (React Native)

```bash
cd mobile-wallet-native

# Install dependencies
npm install

# Run tests
npm test

# For development (requires Expo or React Native CLI)
npm start
```

### 5. E2E Integration Tests

```bash
cd e2e-integration-tests

# Install dependencies
npm install

# Run all integration tests
npm test
```

### 6. DevOps Tests

```bash
cd devops

# Install dependencies
npm install

# Validate Docker configuration
npm test
```

## Running All Tests

```bash
cd c:\Users\Smelm\Transcript

# Run verification script (all 150 tests)
powershell -ExecutionPolicy Bypass -File START_LOCAL_SERVICES.ps1
```

**Expected Output:**
```
========================================
Test Results Summary
========================================
Total Tests: 150
Tests Passed: 150/150
Pass Rate: 100% SUCCESS
```

## Docker Deployment

### Prerequisites
- Docker Desktop installed and running

### Build and Run Stack

```bash
cd devops

# Build images
docker-compose build

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

**Services will be available at:**
- Issuer API: http://localhost:3000
- Verifier API: http://localhost:3001
- Frontend: http://localhost:5173
- Nginx Proxy: https://localhost (with SSL)

### Cleanup

```bash
docker-compose down
docker-compose down -v  # Remove volumes too
```

## Workflow: Issue → Verify → Store

### 1. Issue Credential (Issuer Service)
```bash
# Issue a credential
curl -X POST http://localhost:3000/credentials/issue \
  -H "Content-Type: application/json" \
  -d '{
    "studentId": "STU001",
    "name": "Alice Smith",
    "institution": "MIT",
    "courses": [
      {"name": "6.S191", "credits": 3, "grade": "A"}
    ]
  }'

# Response: { credentialId, issuerId, status, qrCode }
```

### 2. Register & Approve Issuer (Verifier Service)
```bash
# Register issuer
curl -X POST http://localhost:3001/registry/verifiers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MIT",
    "url": "https://mit.edu",
    "credentialTypes": ["academic"]
  }'

# Approve issuer (replace ID from response above)
curl -X POST http://localhost:3001/registry/verifiers/{id}/approve
```

### 3. Scan & Verify (Web UI)
1. Open http://localhost:5173/scan
2. Paste QR code data from Step 1
3. Click "Verify"
4. View verification result

### 4. Store in Wallet (Mobile)
```bash
# Mobile app automatically stores verified credentials
# Navigate to Wallet tab to view stored credentials
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
netstat -ano | findstr :3000

# Kill process (Windows)
taskkill /PID {PID} /F
```

### npm Install Failures
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules
rm -r node_modules
rm package-lock.json

# Reinstall
npm install --legacy-peer-deps
```

### Docker Connection Issues
- Ensure Docker Desktop is running
- Check: `docker ps`
- If error: restart Docker Desktop

### Test Failures
```bash
# Run with verbose output
npm test -- --reporter tap

# Run specific test file
npm test tests/specific.test.js
```

## Project Structure

```
Transcript/
├── issuer-service/           # Credential issuance backend
│   ├── src/
│   │   └── index.js         # Main service
│   └── tests/
│       └── issuer-service.test.js
├── verifier-service/         # Credential verification backend
│   ├── src/
│   │   └── index.js         # Main service
│   └── tests/
│       └── verifier-service.test.js
├── verifier-frontend/        # React web UI
│   ├── src/
│   │   ├── pages/           # Route pages
│   │   ├── components/      # React components
│   │   ├── services/        # API clients
│   │   └── styles/          # CSS stylesheets
│   └── tests/
│       └── components.test.js
├── mobile-wallet-native/     # React Native mobile app
│   ├── src/
│   │   ├── screens/         # Mobile screens
│   │   └── services/        # Wallet & NFC services
│   └── tests/
│       └── mobile-wallet.test.js
├── e2e-integration-tests/    # End-to-end workflow tests
│   └── tests/
│       └── e2e-integration.test.js
├── devops/                   # Docker & deployment
│   ├── docker-compose.yml   # Orchestration
│   ├── Dockerfile.*         # Service images
│   ├── nginx.conf           # Reverse proxy
│   └── tests/
│       └── devops.test.js
└── .github/
    └── workflows/
        └── ci-cd.yml        # GitHub Actions pipeline
```

## Testing Strategy

### Unit Tests
```bash
cd {service}
npm test
```

### Integration Tests
```bash
cd e2e-integration-tests
npm test
```

### Full Stack Test
```bash
# Run all 150 tests at once
START_LOCAL_SERVICES.ps1
```

## Environment Variables

### Issuer Service
- `PORT=3000` - Service port
- `NODE_ENV=development|production`
- `SERVICE_NAME=issuer-service`
- `ISSUER_ID=default-issuer`

### Verifier Service
- `PORT=3001` - Service port
- `NODE_ENV=development|production`
- `SERVICE_NAME=verifier-service`

### Verifier Frontend
- `REACT_APP_VERIFIER_API=http://localhost:3001` - Verifier API URL
- `NODE_ENV=development|production`

## Git Workflow

All work uses feature branches:

```bash
# Create feature branch
git checkout -b feature/issue-description

# Commit changes
git add .
git commit -m "Description"

# Push to GitHub
git push origin feature/issue-description

# Create pull request on GitHub
# After approval, merge to master
```

## CI/CD Pipeline

Automatic testing on every push:
- GitHub Actions runs 150 tests
- Build stage creates Docker images
- Security scanning checks dependencies
- Deploy stage (main branch only)

Monitor at: https://github.com/smelme/transcript/actions

## Support

For issues or questions:
1. Check test output: `npm test`
2. Review service logs: Start service and watch output
3. Check GitHub Issues: https://github.com/smelme/transcript/issues
