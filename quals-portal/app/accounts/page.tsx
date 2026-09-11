'use client';

import { useEffect, useState } from 'react';
import { PageHeader, formatDate, shortId } from '../components/ui';
import {
  activateAccount,
  deactivateAccount,
  deleteAccount,
  listAccounts,
  type WalletAccount,
} from '../lib/api';

type Action = { kind: 'deactivate' | 'activate' | 'delete'; account: WalletAccount } | null;

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setAccounts(await listAccounts());
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

  async function run() {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'deactivate') await deactivateAccount(action.account.sub);
      if (action.kind === 'activate') await activateAccount(action.account.sub);
      if (action.kind === 'delete') await deleteAccount(action.account.sub);
      setAction(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const copy =
    action?.kind === 'deactivate'
      ? {
          title: 'Deactivate this wallet account?',
          body: `The holder will immediately lose the ability to refresh their session, and will have to be re-invited. Their credentials stay in their wallet.`,
          cta: 'Deactivate',
        }
      : action?.kind === 'delete'
        ? {
            title: 'Delete this wallet account?',
            body: `The account is marked as deleted and every refresh token is revoked. The holder can no longer sign in.`,
            cta: 'Delete account',
          }
        : {
            title: 'Reactivate this wallet account?',
            body: 'Sign-in is restored. Previously revoked refresh tokens stay revoked, so the holder must sign in again.',
            cta: 'Reactivate',
          };

  return (
    <main>
      <PageHeader
        title="Wallet accounts"
        subtitle="Holders provisioned by an institute, and whether their sessions are still valid."
      />

      <div className="content stack">
        {error && <div className="notice err">{error}</div>}

        <div className="toolbar">
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="muted">{accounts.length} accounts</span>
        </div>

        <section className="card">
          {loading ? (
            <div className="empty">Loading accounts…</div>
          ) : accounts.length === 0 ? (
            <div className="empty">No wallet accounts have been provisioned yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Institute links</th>
                    <th>Status</th>
                    <th>Active sessions</th>
                    <th>Created</th>
                    <th>Subject</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => {
                    const deleted = !!a.deletedAt;
                    const status = deleted ? 'deleted' : a.active ? 'active' : 'inactive';
                    const cls = status === 'active' ? 'ok' : status === 'deleted' ? 'err' : 'warn';
                    return (
                      <tr key={a.sub}>
                        <td>
                          <div>{a.email}</div>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {a.emailVerified ? 'Email verified' : 'Email not verified'}
                          </div>
                        </td>
                        <td>
                          {a.links.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            a.links.map((l) => (
                              <span className="chip" key={`${l.institution}-${l.studentId}`}>
                                {l.institution} · {l.studentId}
                              </span>
                            ))
                          )}
                        </td>
                        <td>
                          <span className={`badge ${cls}`}>{status}</span>
                        </td>
                        <td>{a.activeRefreshTokens}</td>
                        <td>{formatDate(a.createdAt)}</td>
                        <td className="mono" title={a.sub}>
                          {shortId(a.sub, 10)}
                        </td>
                        <td>
                          <div className="row">
                            {a.active && !deleted ? (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setAction({ kind: 'deactivate', account: a })}
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => setAction({ kind: 'activate', account: a })}
                              >
                                Reactivate
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={deleted}
                              onClick={() => setAction({ kind: 'delete', account: a })}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {action && (
        <div className="backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{copy.title}</h2>
            <p>
              {copy.body} <br />
              <strong>{action.account.email}</strong>
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>
                {busy ? 'Working…' : copy.cta}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
