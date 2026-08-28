import React, { useState, useEffect } from 'react';
import { getStatistics } from '../services/verifierService';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const result = await getStatistics();
      setStats(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="dashboard-page"><p>Loading...</p></div>;
  if (error) return <div className="dashboard-page alert alert-error">{error}</div>;
  if (!stats) return <div className="dashboard-page"><p>No data</p></div>;

  const verificationRate = stats.totalVerifications > 0 
    ? ((stats.verifiedCount / stats.totalVerifications) * 100).toFixed(1)
    : 0;

  return (
    <div className="dashboard-page">
      <h2>Verification Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.totalVerifications}</div>
          <div className="stat-label">Total Verifications</div>
        </div>

        <div className="stat-card success">
          <div className="stat-number">{stats.verifiedCount}</div>
          <div className="stat-label">Verified</div>
        </div>

        <div className="stat-card error">
          <div className="stat-number">{stats.rejectedCount}</div>
          <div className="stat-label">Rejected</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{stats.trustedIssuersCount}</div>
          <div className="stat-label">Trusted Issuers</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{stats.blockedIssuersCount}</div>
          <div className="stat-label">Blocked Issuers</div>
        </div>

        <div className="stat-card">
          <div className="stat-number">{verificationRate}%</div>
          <div className="stat-label">Verification Rate</div>
        </div>
      </div>

      <div className="breakdown-section">
        <h3>Verifications by Type</h3>
        <div className="breakdown-list">
          {Object.entries(stats.byType || {}).map(([type, count]) => (
            <div key={type} className="breakdown-item">
              <span>{type}</span>
              <span className="count">{count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="breakdown-section">
        <h3>Top Issuers</h3>
        <div className="breakdown-list">
          {Object.entries(stats.byIssuer || {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([issuer, count]) => (
              <div key={issuer} className="breakdown-item">
                <span>{issuer}</span>
                <span className="count">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
