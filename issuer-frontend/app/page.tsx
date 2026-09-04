'use client';

import { useEffect, useState } from 'react';
import { getStatistics } from './lib/api';

interface Stats {
  issuerId?: string;
  issuerName?: string;
  totalIssued?: number;
  totalRevoked?: number;
  totalVerified?: number;
  credentialsInSystem?: number;
  activeCredentials?: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStatistics()
      .then((s) => setStats(s as Stats))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <div className="card">
        <h1>Dashboard</h1>
        {error ? (
          <p className="muted">Unable to load statistics: {error}</p>
        ) : !stats ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p className="muted">
              Issuer: {stats.issuerName || stats.issuerId || 'Unknown'}
            </p>
            <div className="stat-grid" style={{ marginTop: 12 }}>
              <Stat label="Total issued" value={stats.totalIssued ?? 0} />
              <Stat label="Active credentials" value={stats.activeCredentials ?? 0} />
              <Stat label="Revoked" value={stats.totalRevoked ?? 0} />
              <Stat label="Verified" value={stats.totalVerified ?? 0} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
