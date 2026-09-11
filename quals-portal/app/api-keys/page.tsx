'use client';

import { useEffect, useState } from 'react';
import { PageHeader, StatusBadge, formatDate } from '../components/ui';
import {
  createApiKey,
  listApiKeys,
  listOrgs,
  revokeApiKey,
  type ApiKey,
  type ClientOrg,
} from '../lib/api';

/**
 * API keys belong to a client organisation and are how that organisation's own
 * systems issue credentials. A key is shown once, when it is created: only its
 * hash is stored, so it cannot be displayed again — if it is lost, revoke it and
 * create another.
 */
export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [orgs, setOrgs] = useState<ClientOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdKey, setCreatedKey] = useState<{ key: string; institution: string } | null>(null);
  const [target, setTarget] = useState<ApiKey | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [nextKeys, nextOrgs] = await Promise.all([listApiKeys(), listOrgs()]);
      setKeys(nextKeys);
      setOrgs(nextOrgs);
      if (!institution && nextOrgs.length) setInstitution(nextOrgs[0].institution);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createApiKey({ institution: institution || undefined, name: name || undefined });
      setCreatedKey({ key: created.key, institution: created.institution });
      setName('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!target) return;
    setBusy(true);
    try {
      await revokeApiKey(target.keyId);
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
        title="API keys"
        subtitle="Keys for client organisations to issue credentials through this service."
      />

      <div className="content stack">
        {error && <div className="notice err">{error}</div>}

        {createdKey && (
          <div className="notice ok">
            <div>
              <strong>Copy this key now.</strong> It is shown once and cannot be retrieved again — only
              its hash is stored. If you lose it, revoke it and create another.
            </div>
            <div className="mono" style={{ marginTop: 8, wordBreak: 'break-all' }}>
              {createdKey.key}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Organisation: {createdKey.institution}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => setCreatedKey(null)}
            >
              Done
            </button>
          </div>
        )}

        <section className="card">
          <h2>Create a key</h2>
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="key-org">Organisation</label>
              <select id="key-org" value={institution} onChange={(e) => setInstitution(e.target.value)}>
                {orgs.length === 0 && <option value="">—</option>}
                {orgs.map((org) => (
                  <option key={org.institution} value={org.institution}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="key-name">Label</label>
              <input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Academy student records system"
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: 16 }} disabled={busy}>
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
            A credential issued with this key belongs to the organisation above, and only administrators
            of that organisation can see or revoke it.
          </p>
        </section>

        <div className="toolbar">
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="muted">{keys.length} keys</span>
        </div>

        <section className="card">
          {loading ? (
            <div className="empty">Loading keys…</div>
          ) : keys.length === 0 ? (
            <div className="empty">No API keys yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Organisation</th>
                    <th>Label</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last used</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.keyId}>
                      <td>
                        <span className="mono">{key.prefix}</span>
                      </td>
                      <td>{key.institution}</td>
                      <td className="muted">{key.name || '—'}</td>
                      <td>
                        <StatusBadge status={key.active ? 'active' : 'revoked'} />
                      </td>
                      <td>{formatDate(key.createdAt)}</td>
                      <td className="muted">{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}</td>
                      <td>
                        {key.active && (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setTarget(key)}>
                            Revoke
                          </button>
                        )}
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
            <h2>Revoke this API key?</h2>
            <p>
              Anything using <span className="mono">{target.prefix}</span> for{' '}
              <strong>{target.institution}</strong> will stop being able to issue credentials immediately.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmRevoke} disabled={busy}>
                {busy ? 'Revoking…' : 'Revoke key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
