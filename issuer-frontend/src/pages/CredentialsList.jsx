/**
 * Credentials List Page
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { credentialService } from '../services/apiService.js';
import '../styles/List.css';

export default function CredentialsList() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadCredentials();
  }, [offset]);

  const loadCredentials = async () => {
    setLoading(true);
    const result = await credentialService.listCredentials(limit, offset);
    
    if (result.success) {
      setCredentials(result.credentials || []);
      setError(null);
    } else {
      setError(result.error);
      setCredentials([]);
    }
    
    setLoading(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="list-container">
      <div className="list-header">
        <h1>Credentials</h1>
        <Link to="/credentials/create" className="btn btn-primary">
          + Create Credential
        </Link>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading credentials...</div>
      ) : credentials.length === 0 ? (
        <div className="empty-state">No credentials found</div>
      ) : (
        <div className="table-container">
          <table className="list-table">
            <thead>
              <tr>
                <th>Credential ID</th>
                <th>Student ID</th>
                <th>Status</th>
                <th>Issue Date</th>
                <th>Expiry Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((cred) => (
                <tr key={cred.credentialId}>
                  <td>
                    <Link to={`/credentials/${cred.credentialId}`}>
                      {cred.credentialId}
                    </Link>
                  </td>
                  <td>{cred.studentId || 'N/A'}</td>
                  <td>
                    <span className={`status status-${cred.status}`}>
                      {cred.status}
                    </span>
                  </td>
                  <td>{formatDate(cred.issueDate)}</td>
                  <td>{formatDate(cred.expiryDate)}</td>
                  <td>
                    <Link to={`/credentials/${cred.credentialId}`} className="btn btn-small">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="btn"
        >
          Previous
        </button>
        <span>Page {Math.floor(offset / limit) + 1}</span>
        <button
          onClick={() => setOffset(offset + limit)}
          disabled={credentials.length < limit}
          className="btn"
        >
          Next
        </button>
      </div>
    </div>
  );
}
