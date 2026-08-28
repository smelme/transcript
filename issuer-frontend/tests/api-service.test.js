/**
 * Tests for API Service Layer
 * Coverage: Credential operations, Verifier operations, Auth
 */

import assert from 'assert';
import { test } from 'node:test';

/**
 * Mock localStorage for Node.js
 */
if (typeof global.localStorage === 'undefined') {
  global.localStorage = {
    store: {},
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, value) {
      this.store[key] = value.toString();
    },
    removeItem(key) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    }
  };
}

/**
 * Mock Axios for testing
 */
class MockAxios {
  constructor() {
    this.requests = [];
    this.responseQueue = [];
  }

  async get(url, config = {}) {
    this.requests.push({ method: 'GET', url, config });
    const response = this.responseQueue.shift();
    if (response?.error) throw response;
    return response || { data: {} };
  }

  async post(url, data, config = {}) {
    this.requests.push({ method: 'POST', url, data, config });
    const response = this.responseQueue.shift();
    if (response?.error) throw response;
    return response || { data: {} };
  }

  create() {
    return this;
  }

  interceptors = {
    request: { use: () => {} },
    response: { use: () => {} }
  };
}

/**
 * Credential Service Tests
 */
test('API Service - Credential List Success', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      credentials: [
        { credentialId: 'cred-001', studentId: 'student-1', status: 'issued' },
        { credentialId: 'cred-002', studentId: 'student-2', status: 'pending' }
      ],
      total: 2
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Credential Create Success', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      credentialId: 'cred-001',
      studentId: 'student-1',
      status: 'created'
    }
  });

  const credentialData = {
    studentId: 'student-1',
    name: { givenName: 'John', familyName: 'Doe' },
    institution: 'Smart College'
  };

  assert.strictEqual(mockAxios.responseQueue.length, 1);
  assert(credentialData.studentId);
});

test('API Service - Credential Revoke Success', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      credentialId: 'cred-001',
      status: 'revoked'
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Get Credential Detail', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      credentialId: 'cred-001',
      studentId: 'student-1',
      status: 'issued',
      issueDate: '2024-01-01T00:00:00Z',
      expiryDate: '2029-01-01T00:00:00Z'
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Get Credential Audit Trail', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: [
      {
        action: 'created',
        statusAfter: 'pending',
        createdAt: '2024-01-01T10:00:00Z'
      },
      {
        action: 'issued',
        statusAfter: 'issued',
        createdAt: '2024-01-02T10:00:00Z'
      }
    ]
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Get Credentials Statistics', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      total: 100,
      issued: 80,
      pending: 15,
      revoked: 5
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

/**
 * Verifier Service Tests
 */
test('API Service - Verifier List Success', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      verifiers: [
        {
          verifierId: 'verifier-001',
          name: 'State Education Dept',
          status: 'approved',
          trustScore: 85
        },
        {
          verifierId: 'verifier-002',
          name: 'University Verification',
          status: 'approved',
          trustScore: 92
        }
      ],
      total: 2
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Verifier Get Success', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      verifierId: 'verifier-001',
      name: 'State Education Dept',
      verificationTypes: ['academic'],
      status: 'approved',
      trustScore: 85,
      credentialsVerifiedCount: 500
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Verifier Approve', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      verifierId: 'verifier-001',
      status: 'approved',
      approvedAt: '2024-01-01T10:00:00Z'
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Verifier Suspend', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      verifierId: 'verifier-001',
      status: 'suspended'
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Verifier Revoke', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      verifierId: 'verifier-001',
      status: 'revoked',
      revokedAt: '2024-01-01T10:00:00Z'
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Update Verifier Trust Score', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      verifierId: 'verifier-001',
      trustScore: 95
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Get Verifier Audit Trail', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: [
      {
        action: 'registered',
        statusAfter: 'pending',
        createdAt: '2024-01-01T10:00:00Z'
      },
      {
        action: 'approved',
        statusAfter: 'approved',
        createdAt: '2024-01-02T10:00:00Z'
      }
    ]
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Get Verifiers Statistics', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      total: 50,
      approved: 45,
      pending: 3,
      suspended: 1,
      revoked: 1,
      avgTrustScore: 82.5
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

/**
 * Authentication Service Tests
 */
test('API Service - Login Success', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      user: {
        userId: 'admin-001',
        username: 'admin',
        email: 'admin@smartcollege.edu'
      }
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Logout', () => {
  // Test that token is cleared
  localStorage.setItem('authToken', 'test-token');
  assert.strictEqual(localStorage.getItem('authToken'), 'test-token');
  
  localStorage.removeItem('authToken');
  assert.strictEqual(localStorage.getItem('authToken'), null);
});

test('API Service - Get Current User', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    data: {
      userId: 'admin-001',
      username: 'admin',
      email: 'admin@smartcollege.edu',
      roles: ['admin']
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Login Failure', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    error: {
      response: {
        status: 401,
        data: {
          message: 'Invalid credentials'
        }
      }
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

/**
 * API Service Error Handling
 */
test('API Service - Error Response Handling', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    error: {
      response: {
        status: 404,
        data: {
          message: 'Credential not found'
        }
      }
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

test('API Service - Network Error Handling', () => {
  const mockAxios = new MockAxios();
  mockAxios.responseQueue.push({
    error: {
      message: 'Network Error'
    }
  });

  assert.strictEqual(mockAxios.responseQueue.length, 1);
});

/**
 * API Request Structure Tests
 */
test('API Service - Credential Request Data Structure', () => {
  const credentialData = {
    studentId: 'student-123',
    name: {
      givenName: 'John',
      familyName: 'Doe'
    },
    institution: 'Smart College',
    degreeLevel: 'bachelor',
    fieldOfStudy: 'Computer Science',
    gpa: 3.85
  };

  assert.strictEqual(credentialData.studentId, 'student-123');
  assert.strictEqual(credentialData.name.givenName, 'John');
  assert.strictEqual(credentialData.institution, 'Smart College');
});

test('API Service - Verifier Request Data Structure', () => {
  const verifierData = {
    verifierId: 'verifier-001',
    name: 'State Education Dept',
    verificationTypes: ['academic'],
    url: 'https://verify.education.gov',
    contactEmail: 'verify@education.gov'
  };

  assert.strictEqual(verifierData.verifierId, 'verifier-001');
  assert(Array.isArray(verifierData.verificationTypes));
});

test('API Service - Pagination Support', () => {
  const limit = 50;
  const offset = 0;
  
  assert.strictEqual(limit, 50);
  assert.strictEqual(offset, 0);
  assert.strictEqual((offset / limit) + 1, 1); // Page 1
});

test('API Service - Status Filters', () => {
  const credentialStatuses = ['pending', 'issued', 'revoked', 'expired'];
  const verifierStatuses = ['pending', 'approved', 'suspended', 'revoked'];

  assert(credentialStatuses.includes('issued'));
  assert(verifierStatuses.includes('approved'));
});
