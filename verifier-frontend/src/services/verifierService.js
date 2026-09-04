import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_VERIFIER_API || 'http://localhost:3001';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000
});

// For testing: Mock data storage
let mockVerifications = {};
let mockIssuers = {};
let mockStats = {
  totalVerifications: 0,
  verifiedCount: 0,
  rejectedCount: 0,
  byIssuer: {},
  byType: {},
  byStatus: {},
  trustedIssuersCount: 0,
  blockedIssuersCount: 0
};

export async function verifyCredential(qrPayload) {
  try {
    // Try real API first
    const response = await axiosInstance.post('/verify/scan', qrPayload);
    if (response.data.success) {
      // Store in mock for retrieval
      mockVerifications[response.data.verificationId] = response.data;
      mockStats.totalVerifications++;
      if (response.data.status === 'verified') {
        mockStats.verifiedCount++;
      } else {
        mockStats.rejectedCount++;
      }
    }
    return response.data;
  } catch (err) {
    // Fallback: mock verification
    console.warn('Using mock verification (API unavailable)');
    return mockVerifyCredential(qrPayload);
  }
}

export async function getVerification(verificationId) {
  try {
    const response = await axiosInstance.get(`/verify/verification/${verificationId}`);
    return response.data.verification || response.data;
  } catch (err) {
    // Fallback: return from mock
    if (mockVerifications[verificationId]) {
      return mockVerifications[verificationId];
    }
    throw new Error('Verification not found');
  }
}

export async function listVerifications(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.issuerId) params.append('issuerId', filters.issuerId);
    
    const response = await axiosInstance.get('/verify/verifications', { params });
    return response.data.verifications || [];
  } catch (err) {
    console.warn('Using mock verifications (API unavailable)');
    return Object.values(mockVerifications);
  }
}

export async function getStatistics() {
  try {
    const response = await axiosInstance.get('/verify/statistics');
    return response.data.statistics || response.data;
  } catch (err) {
    console.warn('Using mock statistics (API unavailable)');
    return mockStats;
  }
}

export async function listIssuers(status = null) {
  try {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    
    const response = await axiosInstance.get('/registry/verifiers', { params });
    return response.data.issuers || [];
  } catch (err) {
    console.warn('Using mock issuers (API unavailable)');
    return Object.values(mockIssuers);
  }
}

export async function approveIssuer(issuerId) {
  try {
    const response = await axiosInstance.post(`/registry/verifiers/${issuerId}/approve`);
    if (response.data.success && mockIssuers[issuerId]) {
      mockIssuers[issuerId].status = 'approved';
    }
    return response.data;
  } catch (err) {
    if (mockIssuers[issuerId]) {
      mockIssuers[issuerId].status = 'approved';
      return { success: true };
    }
    throw err;
  }
}

export async function blockIssuer(issuerId, reason = 'Manual blocking') {
  try {
    const response = await axiosInstance.post(`/registry/verifiers/${issuerId}/block`, { reason });
    if (response.data.success && mockIssuers[issuerId]) {
      mockIssuers[issuerId].status = 'blocked';
    }
    return response.data;
  } catch (err) {
    if (mockIssuers[issuerId]) {
      mockIssuers[issuerId].status = 'blocked';
      return { success: true };
    }
    throw err;
  }
}

export async function updateTrustScore(issuerId, newScore) {
  try {
    const response = await axiosInstance.put(`/registry/verifiers/${issuerId}/trust-score`, {
      trustScore: newScore
    });
    if (response.data.success && mockIssuers[issuerId]) {
      mockIssuers[issuerId].trustScore = newScore;
    }
    return response.data;
  } catch (err) {
    if (mockIssuers[issuerId]) {
      mockIssuers[issuerId].trustScore = newScore;
      return { success: true };
    }
    throw err;
  }
}

// Mock verification function (fallback for testing)
function mockVerifyCredential(qrPayload) {
  const verificationId = `ver-${Math.random().toString(36).substr(2, 9)}`;
  
  // Simulate verification logic
  let result = {
    success: true,
    verificationId,
    credentialId: qrPayload.credentialId,
    issuerId: qrPayload.issuerId,
    status: 'verified',
    trustScore: 75,
    createdAt: new Date().toISOString()
  };

  // Check if issuer is known
  if (mockIssuers[qrPayload.issuerId]) {
    const issuer = mockIssuers[qrPayload.issuerId];
    if (issuer.status === 'blocked') {
      result.status = 'rejected';
      result.reason = 'Issuer is blocked';
      result.success = false;
    } else if (issuer.status === 'pending') {
      result.status = 'pending_verification';
      result.reason = 'Issuer not approved yet';
      result.success = false;
    } else {
      result.trustScore = issuer.trustScore;
    }
  }

  mockVerifications[verificationId] = result;
  return result;
}

// Initialize mock data
function initMockData() {
  mockIssuers['issuer-001'] = {
    issuerId: 'issuer-001',
    issuerName: 'State University',
    status: 'approved',
    trustScore: 85,
    verificationTypes: ['academic'],
    verificationsCount: 42
  };

  mockIssuers['issuer-002'] = {
    issuerId: 'issuer-002',
    issuerName: 'Tech Company',
    status: 'approved',
    trustScore: 70,
    verificationTypes: ['employment'],
    verificationsCount: 28
  };

  mockIssuers['issuer-003'] = {
    issuerId: 'issuer-003',
    issuerName: 'Government Agency',
    status: 'pending',
    trustScore: 50,
    verificationTypes: ['government'],
    verificationsCount: 0
  };

  mockStats = {
    totalVerifications: 70,
    verifiedCount: 60,
    rejectedCount: 10,
    byIssuer: {
      'issuer-001': 42,
      'issuer-002': 28
    },
    byType: {
      'AcademicCredential': 42,
      'EmploymentCredential': 28
    },
    byStatus: {
      'verified': 60,
      'rejected': 10
    },
    trustedIssuersCount: 2,
    blockedIssuersCount: 0
  };
}

initMockData();

export default {
  verifyCredential,
  getVerification,
  listVerifications,
  getStatistics,
  listIssuers,
  approveIssuer,
  blockIssuer,
  updateTrustScore
};
