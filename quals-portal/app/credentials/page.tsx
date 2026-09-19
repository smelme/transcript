'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader, StatusBadge, formatDate, shortId } from '../components/ui';
import { isPlatformAdmin, useAdmin } from '../components/session';
import {
  CREDENTIAL_KINDS,
  credentialKindLabel,
  listCredentials,
  revokeCredential,
  type Credential,
} from '../lib/api';

export default function CredentialsPage() {
  const admin = useAdmin();
  const platform = isPlatformAdmin(admin);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [target, setTarget] = useState<Credential | null>(null);
  const [reason, setReason] = useState('Withdrawn by the registry');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setCredentials(await listCredentials());
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return credentials.filter((c) => {
      if (statusFilter !== 'all' && (c.status || '') !== statusFilter) return false;
      // A credential holding no academic namespace has no kind to filter on, so it is
      // only ever shown under 'all' rather than being attributed to either kind.
      if (kindFilter !== 'all' && (c.kind || 'credential') !== kindFilter) return false;
      if (!q) return true;
      return [
        c.credentialId,
        c.full_name,
        c.studentId,
        c.institution,
        c.credentialType,
        credentialKindLabel(c),
        c.kind,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [credentials, query, statusFilter, kindFilter]);

  async function confirmRevoke() {
    if (!target) return;
    setBusy(true);
    try {
      await revokeCredential(target.credentialId, reason);
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
        title="Credentials"
        subtitle={
          platform
            ? 'Every credential issued across the network, and its current lifecycle state.'
            : `Credentials issued by ${admin?.institution ?? 'your organisation'}, and their current lifecycle state.`
        }
      />

      <div className="content stack">
        {error && <div className="notice err">{error}</div>}

        <div className="toolbar">
          <input
            placeholder="Search holder, student ID or credential ID"
            aria-label="Search credentials by holder, student ID or credential ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            aria-label="Filter by what the credential holds"
          >
            <option value="all">All credentials</option>
            {CREDENTIAL_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="muted">
            {filtered.length} of {credentials.length}
          </span>
        </div>

        <section className="card">
          {loading ? (
            <div className="empty">Loading credentials…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">No credentials match your filters.</div>
          ) : (
            <div className="table-wrap">
              <table aria-label="Issued credentials">
                <thead>
                  <tr>
                    <th>Holder</th>
                    <th>Institution</th>
                    <th>Student ID</th>
                    <th>Contents</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Credential ID</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const revoked = c.status === 'revoked';
                    return (
                      <tr key={c.credentialId}>
                        <td>{c.full_name || '—'}</td>
                        <td>{c.institution || '—'}</td>
                        <td className="mono">{c.studentId || '—'}</td>
                        <td>
                          <span className={`badge ${c.kind === 'credential' ? 'neutral' : 'ok'}`}>
                            {credentialKindLabel(c)}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={c.status} />
                        </td>
                        <td>{formatDate((c.issue_date as string) || c.createdAt)}</td>
                        <td className="mono" title={c.credentialId}>
                          {shortId(c.credentialId)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={revoked}
                            onClick={() => {
                              setTarget(c);
                              setReason('Withdrawn by the registry');
                            }}
                          >
                            {revoked ? 'Revoked' : 'Revoke'}
                          </button>
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

      {target && (
        <div className="backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Revoke this credential?</h2>
            <p>
              Verifiers will reject <strong>{target.full_name || target.credentialId}</strong> as
              soon as they check it. This cannot be undone. The holder will need a new credential.
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
                {busy ? 'Revoking…' : 'Revoke credential'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
