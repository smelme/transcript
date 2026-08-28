import React, { useState, useEffect } from 'react';
import { listIssuers, updateTrustScore, blockIssuer, approveIssuer } from '../services/verifierService';
import TrustScoreIndicator from '../components/TrustScoreIndicator';
import '../styles/IssuersList.css';

export default function IssuersList() {
  const [issuers, setIssuers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchIssuers();
  }, [filter]);

  const fetchIssuers = async () => {
    try {
      setLoading(true);
      const result = await listIssuers(filter !== 'all' ? filter : null);
      setIssuers(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (issuerId) => {
    try {
      await approveIssuer(issuerId);
      fetchIssuers();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleBlock = async (issuerId) => {
    if (confirm('Are you sure you want to block this issuer?')) {
      try {
        await blockIssuer(issuerId, 'Manual blocking');
        fetchIssuers();
      } catch (err) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  const handleTrustScoreChange = async (issuerId, newScore) => {
    try {
      await updateTrustScore(issuerId, newScore);
      fetchIssuers();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="issuers-page"><p>Loading...</p></div>;
  if (error) return <div className="issuers-page alert alert-error">{error}</div>;

  return (
    <div className="issuers-page">
      <h2>Trusted Issuers</h2>

      <div className="filter-bar">
        <label>Filter by Status:</label>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      <div className="issuers-list">
        {issuers.length === 0 ? (
          <p>No issuers found</p>
        ) : (
          issuers.map((issuer) => (
            <div key={issuer.issuerId} className={`issuer-card ${issuer.status}`}>
              <div className="issuer-header">
                <h3>{issuer.issuerName}</h3>
                <span className={`status-badge ${issuer.status}`}>{issuer.status.toUpperCase()}</span>
              </div>

              <div className="issuer-details">
                <p><strong>ID:</strong> {issuer.issuerId}</p>
                <p><strong>Verifications:</strong> {issuer.verificationsCount || 0}</p>
                <p><strong>Types:</strong> {issuer.verificationTypes.join(', ')}</p>
              </div>

              <div className="trust-score-section">
                <TrustScoreIndicator score={issuer.trustScore} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={issuer.trustScore}
                  onChange={(e) => handleTrustScoreChange(issuer.issuerId, parseInt(e.target.value))}
                  disabled={issuer.status === 'blocked'}
                />
              </div>

              <div className="issuer-actions">
                {issuer.status === 'pending' && (
                  <button className="btn-primary" onClick={() => handleApprove(issuer.issuerId)}>
                    Approve
                  </button>
                )}
                {issuer.status !== 'blocked' && (
                  <button className="btn-danger" onClick={() => handleBlock(issuer.issuerId)}>
                    Block
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
