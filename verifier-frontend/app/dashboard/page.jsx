'use client';

import { useState, useEffect } from 'react';
import { getStatistics } from '@/app/lib/verifierService';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getStatistics()
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Loading dashboard…</p>;
  if (error) return <div className="alert alert-error">Error: {error}</div>;
  if (!stats) return <div className="alert alert-error">No statistics available</div>;

  const verificationRate =
    stats.totalVerifications > 0
      ? ((stats.verifiedCount / stats.totalVerifications) * 100).toFixed(1)
      : 0;

  return (
    <section>
      <h1>Verification Dashboard</h1>

      <div className="stats-grid">
        <Stat value={stats.totalVerifications} label="Total Verifications" />
        <Stat value={stats.verifiedCount} label="Verified" success />
        <Stat value={stats.rejectedCount} label="Rejected" error />
        <Stat value={stats.trustedIssuersCount} label="Trusted Issuers" />
        <Stat value={stats.blockedIssuersCount} label="Blocked Issuers" />
        <Stat value={`${verificationRate}%`} label="Verification Rate" />
      </div>

      <div className="breakdown-section card">
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

      <div className="breakdown-section card">
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
    </section>
  );
}

function Stat({ value, label, success, error }) {
  const cls = ['stat-card'];
  if (success) cls.push('success');
  if (error) cls.push('error');
  return (
    <div className={cls.join(' ')}>
      <div className="stat-number">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
