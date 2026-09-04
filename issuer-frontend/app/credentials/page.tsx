'use client';

import { useEffect, useState } from 'react';
import { listCredentials, type Credential } from '../lib/api';

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCredentials()
      .then(setCredentials)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="card">
      <h1>Credentials</h1>
      {error ? (
        <p className="muted">Unable to load credentials: {error}</p>
      ) : credentials.length === 0 ? (
        <p className="muted">No credentials issued yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Credential ID</th>
              <th>Type</th>
              <th>Subject</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((c) => (
              <tr key={c.credentialId}>
                <td className="mono">{c.credentialId}</td>
                <td>{c.credentialType || c.docType || '—'}</td>
                <td>{c.full_name || (c.name as { givenName?: string } | undefined)?.givenName || '—'}</td>
                <td>
                  <span className={`badge ${c.status === 'revoked' ? 'err' : 'ok'}`}>{c.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
