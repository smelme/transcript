/**
 * Dashboard Page
 * Overview of credential issuance and verifier statistics
 */

import React, { useState, useEffect } from 'react';
import { credentialService, verifierService } from '../services/apiService.js';
import StatCard from '../components/StatCard.jsx';
import RecentActivity from '../components/RecentActivity.jsx';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const [credStats, setCredStats] = useState(null);
  const [verifyStats, setVerifyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const credResult = await credentialService.getStatistics();
        const verifyResult = await verifierService.getStatistics();

        if (credResult.success) {
          setCredStats(credResult.stats);
        }
        if (verifyResult.success) {
          setVerifyStats(verifyResult.stats);
        }

        if (!credResult.success || !verifyResult.success) {
          setError('Failed to load statistics');
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>
      
      {error && <div className="error-message">{error}</div>}

      <section className="stats-section">
        <h2>Credentials Overview</h2>
        <div className="stats-grid">
          <StatCard
            title="Total Issued"
            value={credStats?.total || 0}
            icon="📋"
          />
          <StatCard
            title="Pending"
            value={credStats?.pending || 0}
            icon="⏳"
          />
          <StatCard
            title="Issued"
            value={credStats?.issued || 0}
            icon="✅"
          />
          <StatCard
            title="Revoked"
            value={credStats?.revoked || 0}
            icon="🚫"
          />
        </div>
      </section>

      <section className="stats-section">
        <h2>Verifiers Overview</h2>
        <div className="stats-grid">
          <StatCard
            title="Total Verifiers"
            value={verifyStats?.total || 0}
            icon="🔍"
          />
          <StatCard
            title="Approved"
            value={verifyStats?.approved || 0}
            icon="✔️"
          />
          <StatCard
            title="Pending"
            value={verifyStats?.pending || 0}
            icon="⏳"
          />
          <StatCard
            title="Average Trust"
            value={verifyStats?.avgTrustScore?.toFixed(1) || 0}
            icon="⭐"
          />
        </div>
      </section>

      <section className="activity-section">
        <RecentActivity />
      </section>
    </div>
  );
}
