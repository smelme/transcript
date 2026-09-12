'use client';

import { useState, useEffect } from 'react';
import TrustScoreIndicator from '@/app/components/TrustScoreIndicator';
import {
  listIssuers,
  updateTrustScore,
  blockIssuer,
  approveIssuer,
} from '@/app/lib/verifierService';

export default function IssuersList() {
  const [issuers, setIssuers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    listIssuers(filter !== 'all' ? filter : null)
      .then(setIssuers)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filter]);

  const refresh = () => {
    listIssuers(filter !== 'all' ? filter : null)
      .then(setIssuers)
      .catch((err) => setError(err.message));
  };

  const handleApprove = async (issuerId) => {
    try {
      await approveIssuer(issuerId);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBlock = async (issuerId) => {
    if (!window.confirm('Are you sure you want to block this issuer?')) return;
    try {
      await blockIssuer(issuerId, 'Manual blocking');
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleTrustScoreChange = async (issuerId, newScore) => {
    try {
      await updateTrustScore(issuerId, newScore);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p>Loading…</p>;

  return (
    <section>
      <h1>Trusted Issuers</h1>

      <div className="filter-bar">
        <label htmlFor="status-filter">Filter by Status:</label>
        <select
          id="status-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="issuers-list">
        {issuers.length === 0 ? (
          <p>No issuers found</p>
        ) : (
          issuers.map((issuer) => (
            <div key={issuer.issuerId} className="issuer-card">
              <div className="issuer-header">
                <h3>{issuer.issuerName}</h3>
                <span className={`badge badge-${issuer.status}`}>{issuer.status.toUpperCase()}</span>
              </div>

              <div className="issuer-details">
                <p><strong>ID:</strong> {issuer.issuerId}</p>
                <p><strong>Verifications:</strong> {issuer.verificationsCount || 0}</p>
                <p><strong>Types:</strong> {issuer.verificationTypes?.join(', ') || '—'}</p>
              </div>

              <div className="trust-score-section">
                <TrustScoreIndicator score={issuer.trustScore} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label={`Trust score for ${issuer.name || issuer.issuerId}`}
                  value={issuer.trustScore}
                  onChange={(e) =>
                    handleTrustScoreChange(issuer.issuerId, parseInt(e.target.value, 10))
                  }
                  disabled={issuer.status === 'blocked'}
                />
              </div>

              <div className="issuer-actions">
                {issuer.status === 'pending' && (
                  <button className="btn btn-primary" onClick={() => handleApprove(issuer.issuerId)}>
                    Approve
                  </button>
                )}
                {issuer.status !== 'blocked' && (
                  <button className="btn btn-danger" onClick={() => handleBlock(issuer.issuerId)}>
                    Block
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
