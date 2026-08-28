/**
 * API Service Layer
 * Handles all communication with backend services
 */

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

/**
 * Create axios instance with default config
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * Add auth token to requests
 */
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Credential Service
 */
export const credentialService = {
  /**
   * List credentials
   */
  async listCredentials(limit = 50, offset = 0) {
    try {
      const response = await apiClient.get('/credentials', {
        params: { limit, offset }
      });
      return {
        success: true,
        credentials: response.data.credentials,
        total: response.data.total
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get credential details
   */
  async getCredential(credentialId) {
    try {
      const response = await apiClient.get(`/credentials/${credentialId}`);
      return {
        success: true,
        credential: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Create new credential
   */
  async createCredential(credentialData) {
    try {
      const response = await apiClient.post('/credentials', credentialData);
      return {
        success: true,
        credential: response.data,
        credentialId: response.data.credentialId
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        validationErrors: error.response?.data?.errors
      };
    }
  },

  /**
   * Revoke credential
   */
  async revokeCredential(credentialId, reason) {
    try {
      const response = await apiClient.post(`/credentials/${credentialId}/revoke`, {
        reason
      });
      return {
        success: true,
        credential: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get credential audit trail
   */
  async getAuditTrail(credentialId) {
    try {
      const response = await apiClient.get(`/credentials/${credentialId}/audit`);
      return {
        success: true,
        auditLog: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get statistics
   */
  async getStatistics() {
    try {
      const response = await apiClient.get('/credentials/stats');
      return {
        success: true,
        stats: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
};

/**
 * Verifier Service
 */
export const verifierService = {
  /**
   * List verifiers
   */
  async listVerifiers(status = 'approved', limit = 50, offset = 0) {
    try {
      const response = await apiClient.get('/verifiers', {
        params: { status, limit, offset }
      });
      return {
        success: true,
        verifiers: response.data.verifiers,
        total: response.data.total
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get verifier details
   */
  async getVerifier(verifierId) {
    try {
      const response = await apiClient.get(`/verifiers/${verifierId}`);
      return {
        success: true,
        verifier: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Approve verifier
   */
  async approveVerifier(verifierId) {
    try {
      const response = await apiClient.post(`/verifiers/${verifierId}/approve`, {});
      return {
        success: true,
        verifier: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Suspend verifier
   */
  async suspendVerifier(verifierId, reason) {
    try {
      const response = await apiClient.post(`/verifiers/${verifierId}/suspend`, {
        reason
      });
      return {
        success: true,
        verifier: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Revoke verifier
   */
  async revokeVerifier(verifierId, reason) {
    try {
      const response = await apiClient.post(`/verifiers/${verifierId}/revoke`, {
        reason
      });
      return {
        success: true,
        verifier: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Update trust score
   */
  async updateTrustScore(verifierId, score, reason) {
    try {
      const response = await apiClient.post(`/verifiers/${verifierId}/trust-score`, {
        score,
        reason
      });
      return {
        success: true,
        verifier: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get verifier audit trail
   */
  async getAuditTrail(verifierId) {
    try {
      const response = await apiClient.get(`/verifiers/${verifierId}/audit`);
      return {
        success: true,
        auditLog: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Get registry statistics
   */
  async getStatistics() {
    try {
      const response = await apiClient.get('/verifiers/stats');
      return {
        success: true,
        stats: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
};

/**
 * Auth Service
 */
export const authService = {
  /**
   * Login
   */
  async login(username, password) {
    try {
      const response = await apiClient.post('/auth/login', {
        username,
        password
      });
      localStorage.setItem('authToken', response.data.token);
      return {
        success: true,
        token: response.data.token,
        user: response.data.user
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  },

  /**
   * Logout
   */
  logout() {
    localStorage.removeItem('authToken');
    return { success: true };
  },

  /**
   * Get current user
   */
  async getCurrentUser() {
    try {
      const response = await apiClient.get('/auth/me');
      return {
        success: true,
        user: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
};

export default {
  credentialService,
  verifierService,
  authService
};
