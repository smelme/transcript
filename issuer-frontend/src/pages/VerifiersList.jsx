/**
 * Verifiers List Page
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { verifierService } from '../services/apiService.js';
import '../styles/List.css';

export default function VerifiersList() {
  const [verifiers, setVerifiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('approved');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadVerifiers();
  }, [status, offset]);

  const loadVerifiers = async () => {
    setLoading(true);
    const result = await verifierService.listVerifiers(status, limit, offset);
    
    if (result.success) {
      setVerifiers(result.verifiers || []);
      setError(null);
    } else {
      setError(result.error);
      setVerifiers([]);
    }
    
    setLoading(false);
  };

  return (
    <div className="list-container">
      <div className="list-header">
        <h1>Verifiers</h1>
      </div>

      <div className="filter-section">
        <label htmlFor="status-filter">Filter by Status:</label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setOffset(0);
          }}
        >
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading verifiers...</div>
      ) : verifiers.length === 0 ? (
        <div className="empty-state">No verifiers found</div>
      ) : (
        <div className="table-container">
          <table className="list-table">
            <thead>
              <tr>
                <th>Verifier ID</th>
                <th>Name</th>
                <th>Types</th>
                <th>Status</th>
                <th>Trust Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {verifiers.map((verifier) => (
                <tr key={verifier.verifierId}>
                  <td>
                    <Link to={`/verifiers/${verifier.verifierId}`}>
                      {verifier.verifierId}
                    </Link>
                  </td>
                  <td>{verifier.name}</td>
                  <td>{(verifier.verificationTypes || []).join(', ')}</td>
                  <td>
                    <span className={`status status-${verifier.status}`}>
                      {verifier.status}
                    </span>
                  </td>
                  <td>
                    <span className="trust-score">
                      {verifier.trustScore}⭐
                    </span>
                  </td>
                  <td>
                    <Link to={`/verifiers/${verifier.verifierId}`} className="btn btn-small">
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
          disabled={verifiers.length < limit}
          className="btn"
        >
          Next
        </button>
      </div>
    </div>
  );
}
