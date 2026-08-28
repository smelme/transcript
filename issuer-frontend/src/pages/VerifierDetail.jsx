/**
 * Verifier Detail Page
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { verifierService } from '../services/apiService.js';
import '../styles/Detail.css';

export default function VerifierDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [verifier, setVerifier] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTrustScore, setNewTrustScore] = useState('');

  useEffect(() => {
    loadVerifier();
  }, [id]);

  const loadVerifier = async () => {
    const result = await verifierService.getVerifier(id);
    const auditResult = await verifierService.getAuditTrail(id);

    if (result.success) {
      setVerifier(result.verifier);
      setNewTrustScore(result.verifier.trustScore);
    } else {
      setError(result.error);
    }

    if (auditResult.success) {
      setAuditLog(auditResult.auditLog);
    }

    setLoading(false);
  };

  const handleApprove = async () => {
    const result = await verifierService.approveVerifier(id);
    if (result.success) {
      setVerifier(result.verifier);
      alert('Verifier approved');
    } else {
      alert('Error: ' + result.error);
    }
  };

  const handleSuspend = async () => {
    const reason = prompt('Reason for suspension:');
    if (!reason) return;

    const result = await verifierService.suspendVerifier(id, reason);
    if (result.success) {
      setVerifier(result.verifier);
      alert('Verifier suspended');
    } else {
      alert('Error: ' + result.error);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Are you sure you want to revoke this verifier?')) {
      return;
    }

    const reason = prompt('Reason for revocation:');
    if (!reason) return;

    const result = await verifierService.revokeVerifier(id, reason);
    if (result.success) {
      setVerifier(result.verifier);
      alert('Verifier revoked');
    } else {
      alert('Error: ' + result.error);
    }
  };

  const handleUpdateTrustScore = async () => {
    const score = parseInt(newTrustScore);
    if (isNaN(score) || score < 0 || score > 100) {
      alert('Trust score must be between 0 and 100');
      return;
    }

    const reason = prompt('Reason for trust score update:');
    if (!reason) return;

    const result = await verifierService.updateTrustScore(id, score, reason);
    if (result.success) {
      setVerifier(result.verifier);
      alert('Trust score updated');
    } else {
      alert('Error: ' + result.error);
    }
  };

  if (loading) {
    return <div className="loading">Loading verifier...</div>;
  }

  if (error || !verifier) {
    return <div className="error-message">{error || 'Verifier not found'}</div>;
  }

  return (
    <div className="detail-container">
      <div className="detail-header">
        <h1>Verifier Details</h1>
        <button onClick={() => navigate('/verifiers')} className="btn">
          Back
        </button>
      </div>

      <div className="detail-section">
        <h2>Information</h2>
        <div className="detail-grid">
          <div className="detail-item">
            <label>Verifier ID:</label>
            <span>{verifier.verifierId}</span>
          </div>
          <div className="detail-item">
            <label>Name:</label>
            <span>{verifier.name}</span>
          </div>
          <div className="detail-item">
            <label>Status:</label>
            <span className={`status status-${verifier.status}`}>
              {verifier.status}
            </span>
          </div>
          <div className="detail-item">
            <label>Verification Types:</label>
            <span>{(verifier.verificationTypes || []).join(', ')}</span>
          </div>
          <div className="detail-item">
            <label>Trust Score:</label>
            <span>{verifier.trustScore}⭐</span>
          </div>
          <div className="detail-item">
            <label>URL:</label>
            <span>{verifier.url || 'N/A'}</span>
          </div>
          <div className="detail-item">
            <label>Contact Email:</label>
            <span>{verifier.contactEmail || 'N/A'}</span>
          </div>
          <div className="detail-item">
            <label>Verified Count:</label>
            <span>{verifier.credentialsVerifiedCount}</span>
          </div>
        </div>
      </div>

      <div className="detail-section">
        <h2>Trust Score Management</h2>
        <div className="trust-score-update">
          <div className="form-group">
            <label htmlFor="trustScore">New Trust Score:</label>
            <input
              id="trustScore"
              type="number"
              min="0"
              max="100"
              value={newTrustScore}
              onChange={(e) => setNewTrustScore(e.target.value)}
            />
          </div>
          <button onClick={handleUpdateTrustScore} className="btn btn-primary">
            Update Trust Score
          </button>
        </div>
      </div>

      <div className="detail-section">
        <h2>Audit Trail</h2>
        {auditLog.length === 0 ? (
          <p>No audit records</p>
        ) : (
          <table className="audit-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((log, idx) => (
                <tr key={idx}>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.action}</td>
                  <td>{log.statusAfter}</td>
                  <td>{JSON.stringify(log.details || {})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="detail-actions">
        {verifier.status === 'pending' && (
          <button onClick={handleApprove} className="btn btn-success">
            Approve
          </button>
        )}
        {verifier.status !== 'suspended' && verifier.status !== 'revoked' && (
          <button onClick={handleSuspend} className="btn btn-warning">
            Suspend
          </button>
        )}
        {verifier.status !== 'revoked' && (
          <button onClick={handleRevoke} className="btn btn-danger">
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
