'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader, StatusBadge, formatDate } from './components/ui';
import {
  credentialKindLabel,
  getAuditLog,
  getStatistics,
  kindCountLabel,
  listAccounts,
  listCredentials,
  listShares,
  type AuditEntry,
  type Credential,
  type Share,
  type Statistics,
  type WalletAccount,
} from './lib/api';
import { isPlatformAdmin, useAdmin } from './components/session';

export default function OverviewPage() {
  const admin = useAdmin();
  const platform = isPlatformAdmin(admin);

  const [stats, setStats] = useState<Statistics | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Wait until the session says which scope this administrator has: network-wide
    // figures, shares and wallet accounts are not available to an organisation.
    if (!admin) return;
    (async () => {
      try {
        const [s, c, log] = await Promise.all([
          getStatistics(),
          listCredentials(),
          getAuditLog(15),
        ]);
        setStats(s);
        setCredentials(c);
        setAudit(log.reverse());

        if (platform) {
          const [sh, a] = await Promise.all([listShares(), listAccounts()]);
          setShares(sh);
          setAccounts(a);
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [admin, platform]);

  const activeShares = shares.filter((s) => s.status === 'shared').length;
  const revoked = credentials.filter((c) => c.status === 'revoked').length;
  const activeAccounts = accounts.filter((a) => a.active && !a.deletedAt).length;
  // Counts by kind, from the issuer's own figures: both kinds share a docType, so a
  // single total would hide which credential a student actually received.
  const kindCounts = Object.entries(stats?.byKindActive || {});

  return (
    <main>
      <PageHeader
        title="Overview"
        subtitle={
          platform
            ? 'Issued credentials, active sharing and wallet accounts across the network.'
            : `Credentials issued by ${admin?.institution ?? 'your organisation'}.`
        }
        actions={
          <Link href="/credentials" className="btn btn-secondary">
            View credentials
          </Link>
        }
      />

      <div className="content stack">
        {error && <div className="notice err">{error}</div>}

        {loading ? (
          <div className="card card-pad muted">Loading…</div>
        ) : (
          <>
            <div className="stat-grid">
              <Stat label="Credentials issued" value={stats?.totalIssued ?? credentials.length} hint="All time" />
              <Stat label="Active credentials" value={stats?.activeCredentials ?? credentials.length - revoked} hint="Currently valid" />
              {kindCounts.map(([kind, count]) => (
                <Stat
                  key={kind}
                  label={kindCountLabel(kind)}
                  value={count}
                  hint={kind === 'credential' ? 'No academic record' : 'Active'}
                />
              ))}
              <Stat label="Revoked" value={stats?.totalRevoked ?? revoked} hint="No longer valid" />
              {platform && (
                <>
                  <Stat label="Active shares" value={activeShares} hint={`${shares.length} total`} />
                  <Stat label="Wallet accounts" value={activeAccounts} hint={`${accounts.length} total`} />
                </>
              )}
            </div>

            <section className="card">
              <div className="card-head">
                <h2>Recent activity</h2>
                <Link href="/audit" className="btn btn-secondary btn-sm">
                  Full audit log
                </Link>
              </div>
              {audit.length === 0 ? (
                <div className="empty">No activity recorded yet.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Action</th>
                        <th>Credential</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry, i) => (
                        <tr key={`${entry.timestamp}-${i}`}>
                          <td>{formatDate(entry.timestamp)}</td>
                          <td>
                            <span className="badge neutral">{entry.action.replace(/_/g, ' ')}</span>
                          </td>
                          <td className="mono">
                            {entry.credentialId ? (
                              <Link href="/credentials">{entry.credentialId.slice(0, 14)}…</Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="muted">
                            {entry.shareId ? `share ${entry.shareId.slice(0, 8)}… ` : ''}
                            {entry.studentId ? `student ${entry.studentId}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Latest credentials</h2>
                <Link href="/credentials" className="btn btn-secondary btn-sm">
                  Manage
                </Link>
              </div>
              {credentials.length === 0 ? (
                <div className="empty">No credentials have been issued yet.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Holder</th>
                        <th>Institution</th>
                        <th>Student ID</th>
                        <th>Kind</th>
                        <th>Status</th>
                        <th>Issued</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.slice(0, 6).map((c) => (
                        <tr key={c.credentialId}>
                          <td>{c.full_name || '—'}</td>
                          <td>{c.institution || '—'}</td>
                          <td className="mono">{c.studentId || '—'}</td>
                          <td>{credentialKindLabel(c)}</td>
                          <td>
                            <StatusBadge status={c.status} />
                          </td>
                          <td>{formatDate((c.issue_date as string) || c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
