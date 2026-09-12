'use client';

import { useEffect, useState } from 'react';
import { PageHeader, StatusBadge, formatDate } from '../components/ui';
import { listShares, revokeShare, type Share } from '../lib/api';

const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Personal information',
  qualification: 'Qualification',
  transcript: 'Transcript',
};

export default function SharesPage() {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Share | null>(null);
  const [reason, setReason] = useState('Withdrawn by the sender');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setShares(await listShares());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function confirmRevoke() {
    if (!target) return;
    setBusy(true);
    try {
      await revokeShare(target.shareId, reason);
      setTarget(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <PageHeader
        title="Sharing"
        subtitle="Credentials shared by holders with third parties, and whether they have been opened."
      />

      <div className="content stack">
        {error && <div className="notice err">{error}</div>}

        <div className="toolbar">
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="muted">{shares.length} shares</span>
        </div>

        <section className="card">
          {loading ? (
            <div className="empty">Loading shares…</div>
          ) : shares.length === 0 ? (
            <div className="empty">No credentials have been shared yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Shared by</th>
                    <th>Disclosed</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Opened</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shares.map((s) => (
                    <tr key={s.shareId}>
                      <td>
                        <div>{s.recipientName}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {s.recipientEmail}
                        </div>
                      </td>
                      <td className="muted">{s.senderEmail || '—'}</td>
                      <td>
                        {(s.categories || []).map((c) => (
                          <span className="chip" key={c}>
                            {CATEGORY_LABELS[c] || c}
                          </span>
                        ))}
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {s.disclosedFields ?? 0} fields
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>{formatDate(s.createdAt)}</td>
                      <td>{formatDate(s.expiresAt)}</td>
                      <td className="muted">
                        {s.downloadedAt
                          ? `Downloaded ${formatDate(s.downloadedAt)}`
                          : s.viewedAt
                            ? `Viewed ${formatDate(s.viewedAt)}`
                            : 'Not yet opened'}
                      </td>
                      <td>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setTarget(s)}>
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {target && (
        <div className="backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Revoke this share?</h2>
            <p>
              The link sent to <strong>{target.recipientEmail}</strong> will stop working
              immediately, even if it has not been opened yet.
            </p>
            <label className="muted" htmlFor="reason" style={{ display: 'block', marginBottom: 6 }}>
              Reason (recorded in the audit log)
            </label>
            <input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ width: '100%', marginBottom: 20 }}
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmRevoke} disabled={busy}>
                {busy ? 'Revoking…' : 'Revoke share'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
