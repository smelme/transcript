'use client';

import { useEffect, useState } from 'react';
import { getAuditLog } from '../lib/api';

interface AuditEntry {
  timestamp?: string;
  action?: string;
  credentialId?: string;
  studentId?: string;
  [key: string]: unknown;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAuditLog()
      .then((log) => setEntries(log as AuditEntry[]))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="card">
      <h1>Audit History</h1>
      {error ? (
        <p className="muted">Unable to load audit log: {error}</p>
      ) : entries.length === 0 ? (
        <p className="muted">No audit entries yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Credential</th>
              <th>Student</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i}>
                <td className="mono">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}</td>
                <td>{entry.action || '—'}</td>
                <td className="mono">{entry.credentialId || '—'}</td>
                <td>{entry.studentId || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
