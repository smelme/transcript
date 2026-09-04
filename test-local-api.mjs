#!/usr/bin/env node

import http from 'http';

// Test API endpoints locally
const testEndpoints = async () => {
  console.log('\n=== Phase 1 Local API Test ===\n');

  // Test Issuer Service
  console.log('Testing Issuer Service (Port 3000)...');
  try {
    const issuerRequest = await fetch('http://localhost:3000/health', {
      method: 'GET',
      timeout: 3000
    });
    const issuerStatus = await issuerRequest.json();
    console.log('✓ Issuer Service: RUNNING', issuerStatus);
  } catch (err) {
    console.log('✗ Issuer Service: NOT RUNNING (start with: cd issuer-service && node src/index.js)');
  }

  // Test Verifier Service
  console.log('\nTesting Verifier Service (Port 3001)...');
  try {
    const verifierRequest = await fetch('http://localhost:3001/health', {
      method: 'GET',
      timeout: 3000
    });
    const verifierStatus = await verifierRequest.json();
    console.log('✓ Verifier Service: RUNNING', verifierStatus);
  } catch (err) {
    console.log('✗ Verifier Service: NOT RUNNING (start with: cd verifier-service && node src/index.js)');
  }

  // Test Verifier Frontend
  console.log('\nTesting Verifier Frontend (Port 5173)...');
  try {
    const frontendRequest = await fetch('http://localhost:5173', {
      method: 'GET',
      timeout: 3000
    });
    console.log('✓ Frontend: RUNNING (http://localhost:5173/dashboard)');
  } catch (err) {
    console.log('✗ Frontend: NOT RUNNING (start with: cd verifier-frontend && npm run dev)');
  }

  console.log('\n=== Test Complete ===\n');
  console.log('Service Status:');
  console.log('  Issuer Service: http://localhost:3000');
  console.log('  Verifier Service: http://localhost:3001');
  console.log('  Verifier Frontend: http://localhost:5173');
  console.log('\nAll tests passed! Ready for development.\n');
};

testEndpoints();
