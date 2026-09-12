'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader, formatDate, shortId } from '../components/ui';
import { getAuditLog, type AuditEntry } from '../lib/api';

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      try {
        const log = await getAuditLog(300);
        setEntries(log.reverse());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action))).sort(),
    [entries],
  );

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.action === filter)),
    [entries, filter],
  );

  return (
    <main>
      <PageHeader
        title="Audit log"
        subtitle="Every credential, share and account event recorded by the issuer."
      />

      <div className="content stack">
        {error && <div className="notice err">{error}</div>}

        <div className="toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 220 }}>
            <option value="all">All events</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <span className="muted">
            {filtered.length} of {entries.length} events
          </span>
        </div>

        <section className="card">
          {loading ? (
            <div className="empty">Loading audit log…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No events recorded yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Kind</th>
                    <th>Subject</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry, i) => (
                    <tr key={`${entry.timestamp}-${i}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.timestamp)}</td>
                      <td>
                        <span className="badge neutral">{entry.action.replace(/_/g, ' ')}</span>
                      </td>
                      <td>{entry.kindLabel || entry.kind || '—'}</td>
                      <td className="mono">
                        {entry.credentialId
                          ? `cred ${shortId(entry.credentialId, 10)}`
                          : entry.shareId
                            ? `share ${shortId(entry.shareId, 10)}`
                            : entry.studentId
                              ? `student ${entry.studentId}`
                              : '—'}
                      </td>
                      <td className="muted">
                        {entry.details && Object.keys(entry.details).length > 0
                          ? Object.entries(entry.details)
                              .filter(([, v]) => v !== null && v !== undefined && v !== '')
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
