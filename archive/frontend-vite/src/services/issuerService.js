import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_ISSUER_API || 'http://localhost:3000';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

// In-memory fallbacks so the UI remains usable when the API is unavailable
let mockCredentials = {};
let mockAuditLog = [];
let mockStats = {
  totalIssued: 0,
  totalRevoked: 0,
  totalVerified: 0,
  byStudent: {},
  byType: {},
  credentialsInSystem: 0,
  activeCredentials: 0
};

export async function issueCredential(credentialData) {
  try {
    const response = await axiosInstance.post('/credentials/issue', credentialData);
    if (response.data.success) {
      mockCredentials[response.data.credentialId] = response.data;
      mockStats.totalIssued++;
      mockStats.credentialsInSystem++;
      mockStats.activeCredentials++;
    }
    return response.data;
  } catch (err) {
    console.warn('Using mock issuance (API unavailable)');
    const credentialId = 'mock-' + Math.random().toString(36).slice(2, 10);
    const result = {
      success: true,
      credentialId,
      docType: credentialData.docType || 'org.iso.23220.photoid.1',
      status: 'active',
      issuanceDate: new Date().toISOString(),
      expiryDate: credentialData.expiry_date
    };
    mockCredentials[credentialId] = result;
    return result;
  }
}

export async function listCredentials(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.status) params.append('status', filters.status);
    const response = await axiosInstance.get('/credentials', { params });
    return response.data.credentials || [];
  } catch (err) {
    console.warn('Using mock credentials (API unavailable)');
    return Object.values(mockCredentials);
  }
}

export async function getCredential(credentialId) {
  try {
    const response = await axiosInstance.get(`/credentials/${credentialId}`);
    return response.data.credential || response.data;
  } catch (err) {
    if (mockCredentials[credentialId]) return mockCredentials[credentialId];
    throw new Error('Credential not found');
  }
}

export async function getCredentialMdoc(credentialId) {
  try {
    const response = await axiosInstance.get(`/credentials/${credentialId}/mdoc`);
    return response.data;
  } catch (err) {
    throw new Error('mdoc not available');
  }
}

export async function getCredentialQr(credentialId) {
  try {
    const response = await axiosInstance.get(`/credentials/${credentialId}/qr`);
    return response.data;
  } catch (err) {
    throw new Error('QR not available');
  }
}

export async function revokeCredential(credentialId, reason = 'No reason provided') {
  try {
    const response = await axiosInstance.delete(`/credentials/${credentialId}`, {
      data: { reason }
    });
    if (response.data.success) mockStats.totalRevoked++;
    return response.data;
  } catch (err) {
    if (mockCredentials[credentialId]) {
      mockCredentials[credentialId].status = 'revoked';
      return { success: true, credentialId, status: 'revoked' };
    }
    throw err;
  }
}

export async function getStatistics() {
  try {
    const response = await axiosInstance.get('/statistics');
    return response.data.statistics || response.data;
  } catch (err) {
    console.warn('Using mock statistics (API unavailable)');
    return mockStats;
  }
}

export async function getAuditLog(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.action) params.append('action', filters.action);
    if (filters.limit) params.append('limit', filters.limit);
    const response = await axiosInstance.get('/audit-log', { params });
    return response.data.auditLog || [];
  } catch (err) {
    console.warn('Using mock audit log (API unavailable)');
    return mockAuditLog;
  }
}
