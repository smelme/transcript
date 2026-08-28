/**
 * Credential Detail Page
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { credentialService } from '../services/apiService.js';
import '../styles/Detail.css';

export default function CredentialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [credential, setCredential] = useState(null);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCredential();
  }, [id]);

  const loadCredential = async () => {
    const result = await credentialService.getCredential(id);
    const auditResult = await credentialService.getAuditTrail(id);

    if (result.success) {
      setCredential(result.credential);
    } else {
      setError(result.error);
    }

    if (auditResult.success) {
      setAuditLog(auditResult.auditLog);
    }

    setLoading(false);
  };

  const handleRevoke = async () => {
    if (!window.confirm('Are you sure you want to revoke this credential?')) {
      return;
    }

    const reason = prompt('Reason for revocation:');
    if (!reason) return;

    const result = await credentialService.revokeCredential(id, reason);
    if (result.success) {
      setCredential(result.credential);
      alert('Credential revoked successfully');
    } else {
      alert('Error: ' + result.error);
    }
  };

  if (loading) {
    return <div className="loading">Loading credential...</div>;
  }

  if (error || !credential) {
    return <div className="error-message">{error || 'Credential not found'}</div>;
  }

  return (
    <div className="detail-container">
      <div className="detail-header">
        <h1>Credential Details</h1>
        <button onClick={() => navigate('/credentials')} className="btn">
          Back
        </button>
      </div>

      <div className="detail-section">
        <h2>Information</h2>
        <div className="detail-grid">
          <div className="detail-item">
            <label>Credential ID:</label>
            <span>{credential.credentialId}</span>
          </div>
          <div className="detail-item">
            <label>Status:</label>
            <span className={`status status-${credential.status}`}>
              {credential.status}
            </span>
          </div>
          <div className="detail-item">
            <label>Student ID:</label>
            <span>{credential.studentId}</span>
          </div>
          <div className="detail-item">
            <label>Issue Date:</label>
            <span>{new Date(credential.issueDate).toLocaleDateString()}</span>
          </div>
          <div className="detail-item">
            <label>Expiry Date:</label>
            <span>{new Date(credential.expiryDate).toLocaleDateString()}</span>
          </div>
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

      {credential.status !== 'revoked' && (
        <div className="detail-actions">
          <button onClick={handleRevoke} className="btn btn-danger">
            Revoke Credential
          </button>
        </div>
      )}
    </div>
  );
}
