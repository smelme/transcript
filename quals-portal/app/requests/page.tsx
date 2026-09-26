'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, formatDate, shortId } from '../components/ui';
import { isPlatformAdmin, useAdmin } from '../components/session';
import {
  CSV_TEMPLATE,
  decideRequest,
  getRequest,
  issueRequest,
  listRequests,
  previewRequestPayload,
  uploadRequestPayload,
  type CredentialRequest,
  type RequestDetail,
  type RequestPreview,
} from '../lib/requests';

/** What the queue's states are called on screen, in the words the institution uses. */
const STATUS_LABELS: Record<string, string> = {
  submitted: 'With the school',
  in_review: 'Being checked',
  accepted: 'Accepted',
  declined: 'Declined',
  payload_received: 'Record uploaded',
  issued: 'Issued',
  collected: 'Collected',
  withdrawn: 'Withdrawn',
  abandoned: 'Abandoned',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'All statuses' },
  { value: 'submitted', label: 'Waiting for a decision' },
  { value: 'in_review', label: 'Being checked' },
  { value: 'accepted', label: 'Accepted, waiting for the record' },
  { value: 'payload_received', label: 'Record uploaded, ready to issue' },
  { value: 'issued', label: 'Issued' },
  { value: 'declined', label: 'Declined' },
];

function statusClass(status: string): string {
  if (status === 'declined' || status === 'abandoned' || status === 'withdrawn') return 'err';
  if (status === 'issued' || status === 'collected') return 'ok';
  if (status === 'accepted' || status === 'payload_received') return 'ok';
  return 'neutral';
}

function money(fee?: { amount: number; currency: string } | null): string {
  if (!fee) return '—';
  // Stored in the provider's lower case, shown the way a person writes it.
  return `${(fee.amount / 100).toFixed(2)} ${fee.currency.toUpperCase()}`;
}

function wantedLabel(wanted: string[]): string {
  if (wanted.includes('both')) return 'Qualification and transcript';
  if (wanted.includes('transcript')) return 'Transcript';
  if (wanted.includes('qualification')) return 'Qualification';
  return wanted.join(', ') || '—';
}

export default function RequestsPage() {
  const admin = useAdmin();
  const platform = isPlatformAdmin(admin);

  const [requests, setRequests] = useState<CredentialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<RequestDetail | null>(null);
  const [busy, setBusy] = useState(false);

  // The decision, kept as a form rather than a pair of buttons: the reason is required and is
  // shared with the applicant, so it has to be written before it can be sent.
  const [decision, setDecision] = useState<'accepted' | 'declined'>('accepted');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const [csv, setCsv] = useState('');
  const [filename, setFilename] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ error: string; details?: { errors?: string[]; rows?: Array<{ line: number; errors: string[] }> } } | null>(null);

  const [preview, setPreview] = useState<RequestPreview | null>(null);
  const [issued, setIssued] = useState<{ link?: string | null; expiresAt?: string | null; emailSent?: boolean | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await listRequests(statusFilter));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const open = useCallback(async (requestId: string) => {
    setBusy(true);
    setRefusal(null);
    setPreview(null);
    setIssued(null);
    setNotice(null);
    try {
      const detail = await getRequest(requestId);
      setSelected(detail);
      setDecision('accepted');
      setReason(detail.decisionReason || '');
      setNote('');
      setCsv('');
      setFilename(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  async function submitDecision() {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await decideRequest(selected.requestId, { decision, reason, note });
      setNotice(
        result.emailSent
          ? `Recorded, and the applicant has been told.`
          : `Recorded. The applicant could not be emailed, so tell them yourself.`,
      );
      await open(selected.requestId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File) {
    setFilename(file.name);
    setCsv(await file.text());
  }

  async function submitPayload() {
    if (!selected) return;
    setBusy(true);
    setRefusal(null);
    setNotice(null);
    try {
      const result = await uploadRequestPayload(selected.requestId, { csv, filename });
      if (!result.ok) {
        setRefusal({ error: result.error, details: result.details });
        return;
      }
      setNotice(
        `Stored ${result.rowCount} credential${result.rowCount === 1 ? '' : 's'}: ${result.credentials
          .map((credential) => credential.label)
          .join(', ')}.`,
      );
      await open(selected.requestId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview() {
    if (!selected) return;
    setBusy(true);
    try {
      setPreview(await previewRequestPayload(selected.requestId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitIssue() {
    if (!selected) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await issueRequest(selected.requestId);
      setIssued(result);
      setNotice(
        result.reused
          ? 'This request had already been issued; the existing collection link is shown below.'
          : result.emailSent
            ? 'Issued, and the holder has been emailed the collection link.'
            : 'Issued. The holder could not be emailed, so send them the link below.',
      );
      await open(selected.requestId);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overdue = useMemo(() => requests.filter((row) => row.overdue).length, [requests]);

  return (
    <main>
      <PageHeader
        title="Manual requests"
        subtitle={
          platform
            ? 'Credential requests from people an institution could not identify on its own, and what is waiting to be done about each.'
            : `Requests made to ${admin?.institution ?? 'your institution'}, and what is waiting to be done about each.`
        }
      />

      <div className="content stack">
        {error && (
          <div className="notice err">
            {error}{' '}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {notice && <div className="notice ok">{notice}</div>}

        <div className="toolbar">
          <select
            value={statusFilter}
            aria-label="Filter requests by status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <span className="muted">
            {requests.length} request{requests.length === 1 ? '' : 's'}
            {overdue > 0 ? ` · ${overdue} past the promised period` : ''}
          </span>
        </div>

        <section className="card">
          {loading ? (
            <div className="empty">Loading requests…</div>
          ) : requests.length === 0 ? (
            <div className="empty">Nothing is waiting. Requests appear here once an applicant submits one.</div>
          ) : (
            <div className="table-wrap">
              <table aria-label="Credential requests">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>School</th>
                    <th>Asked for</th>
                    <th>Identity</th>
                    <th>Fee</th>
                    <th>Status</th>
                    <th>With them for</th>
                    <th>Reference</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => (
                    <tr key={row.requestId}>
                      <td>
                        {row.applicantName || '—'}
                        <div className="muted">{row.applicantEmail}</div>
                      </td>
                      <td>{row.school}</td>
                      <td>{wantedLabel(row.wanted)}</td>
                      <td>
                        <span className={`badge ${row.identityStatus === 'verified' ? 'ok' : row.identityStatus === 'failed' ? 'err' : 'neutral'}`}>
                          {row.identityStatus}
                        </span>
                      </td>
                      <td>{money(row.fee)}</td>
                      <td>
                        <span className={`badge ${statusClass(row.status)}`}>
                          {STATUS_LABELS[row.status] || row.status}
                        </span>
                      </td>
                      <td>
                        {row.submittedAt ? `${row.ageWorkingDays} working day${row.ageWorkingDays === 1 ? '' : 's'}` : '—'}
                        {row.overdue && <div className="muted">past the {row.dueAt ? formatDate(row.dueAt) : 'promise'}</div>}
                      </td>
                      <td className="mono" title={row.requestId}>
                        {shortId(row.requestId)}
                      </td>
                      <td>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => open(row.requestId)} disabled={busy}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selected && (
          <section className="card">
            <div className="toolbar">
              <h2 style={{ margin: 0, fontSize: 20 }}>{selected.applicantName || selected.applicantEmail}</h2>
              <span className={`badge ${statusClass(selected.status)}`}>
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
              <span className="muted">
                {selected.applicantEmail}
                {selected.applicantPhone ? ` · ${selected.applicantPhone}` : ''}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div className="table-wrap">
              <table aria-label="Request details">
                <tbody>
                  <tr>
                    <th>Reference</th>
                    <td className="mono">{selected.requestId}</td>
                  </tr>
                  <tr>
                    <th>School</th>
                    <td>{selected.school}</td>
                  </tr>
                  <tr>
                    <th>Asked for</th>
                    <td>{wantedLabel(selected.wanted)}</td>
                  </tr>
                  <tr>
                    <th>Identity</th>
                    <td>
                      {selected.identityStatus}
                      {selected.extract ? (
                        <div className="muted">
                          {Object.entries(selected.extract)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(' · ')}
                        </div>
                      ) : (
                        <div className="muted">Nothing extracted</div>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th>Fee</th>
                    <td>
                      {money(selected.fee)} · payment {selected.paymentStatus}
                      {selected.paymentStatus !== 'paid' && (
                        <div className="muted">The fee has not been confirmed, so this request is not with the school yet.</div>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th>Submitted</th>
                    <td>
                      {selected.submittedAt ? formatDate(selected.submittedAt) : '—'}
                      {selected.dueAt && (
                        <div className="muted">
                          Promised by {formatDate(selected.dueAt)} ({selected.ageWorkingDays} working days so far)
                        </div>
                      )}
                    </td>
                  </tr>
                  {selected.decision && (
                    <tr>
                      <th>Decision</th>
                      <td>
                        {selected.decision} by {selected.reviewedBy} on {formatDate(selected.reviewedAt)}
                        <div className="muted">{selected.decisionReason}</div>
                      </td>
                    </tr>
                  )}
                  {selected.issuedAt && (
                    <tr>
                      <th>Issued</th>
                      <td>
                        {formatDate(selected.issuedAt)}
                        <div className="muted">
                          The holder has until {formatDate(selected.expiresAt)} to collect it.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {selected.canDecide && (
              <div className="stack" style={{ marginTop: 24 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>Record the decision</h3>
                <p className="muted" style={{ margin: 0 }}>
                  The claim is confirmed against the institution&rsquo;s own record before anything is
                  signed. The reason is shared with the applicant; the note is not.
                </p>
                <div className="toolbar">
                  <label>
                    <input
                      type="radio"
                      name="decision"
                      checked={decision === 'accepted'}
                      onChange={() => setDecision('accepted')}
                    />{' '}
                    The record is confirmed
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="decision"
                      checked={decision === 'declined'}
                      onChange={() => setDecision('declined')}
                    />{' '}
                    We cannot confirm it
                  </label>
                </div>
                <input
                  aria-label="Reason, shared with the applicant"
                  placeholder={decision === 'accepted' ? 'Record confirmed (shared with the applicant)' : 'Why it cannot be confirmed (shared with the applicant)'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <input
                  aria-label="Reviewer's note, not shared"
                  placeholder="Your own note (kept in the history, not sent)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="toolbar">
                  <button type="button" className="btn btn-primary" onClick={submitDecision} disabled={busy || reason.trim() === ''}>
                    {busy ? 'Recording…' : 'Record the decision'}
                  </button>
                  <span className="muted">
                    {decision === 'declined'
                      ? 'Declining tells the applicant, and the fee is returned by hand for now.'
                      : 'Accepting moves the request to the record step below.'}
                  </span>
                </div>
              </div>
            )}

            {(selected.canUpload || selected.payloads.length > 0) && (
              <div className="stack" style={{ marginTop: 28 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>The record the institution is asserting</h3>
                <p className="muted" style={{ margin: 0 }}>
                  One row per credential. The file is refused whole if any row fails, and it must name
                  the address this request was opened for. Nothing is signed until you have seen the
                  preview.
                </p>

                {selected.payloads.length > 0 && (
                  <div className="table-wrap">
                    <table aria-label="Uploaded records">
                      <thead>
                        <tr>
                          <th>File</th>
                          <th>Rows</th>
                          <th>Uploaded by</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.payloads.map((payload) => (
                          <tr key={payload.payload_id}>
                            <td>{payload.filename || '—'}</td>
                            <td>{payload.row_count}</td>
                            <td>{payload.uploaded_by || '—'}</td>
                            <td>{formatDate(payload.uploaded_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selected.canUpload && (
                  <>
                    <div className="toolbar">
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        aria-label="Choose the CSV file"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) readFile(file);
                        }}
                      />
                      <span className="muted">{filename ? `Chosen: ${filename}` : 'or paste it below'}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setCsv(CSV_TEMPLATE);
                          setFilename('example.csv');
                        }}
                      >
                        Use the example
                      </button>
                    </div>
                    <textarea
                      aria-label="The CSV contents"
                      rows={8}
                      className="mono"
                      value={csv}
                      onChange={(e) => setCsv(e.target.value)}
                      placeholder="email,full_name,student_id,credential,..."
                      style={{ width: '100%' }}
                    />
                    <div className="toolbar">
                      <button type="button" className="btn btn-primary" onClick={submitPayload} disabled={busy || csv.trim() === ''}>
                        {busy ? 'Uploading…' : 'Upload the record'}
                      </button>
                      {selected.payloads.length > 0 && (
                        <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={busy}>
                          Preview the documents
                        </button>
                      )}
                    </div>

                    {refusal && (
                      <div className="notice err">
                        <strong>{refusal.error}</strong>
                        <ul>
                          {(refusal.details?.errors || []).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        <span className="muted">Nothing was stored, so the request is where it was.</span>
                      </div>
                    )}
                  </>
                )}

                {!selected.canUpload && selected.payloads.length > 0 && (
                  <div className="toolbar">
                    <button type="button" className="btn btn-secondary" onClick={loadPreview} disabled={busy}>
                      Preview the documents
                    </button>
                  </div>
                )}
              </div>
            )}

            {preview && (
              <div className="stack" style={{ marginTop: 28 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>What will be signed</h3>
                <p className="muted" style={{ margin: 0 }}>
                  {preview.payload.rowCount} row{preview.payload.rowCount === 1 ? '' : 's'} from{' '}
                  {preview.payload.filename || 'the uploaded file'}, for {preview.holder.email}
                  {preview.holder.verifiedName ? ` (identity check: ${preview.holder.verifiedName})` : ''}.
                </p>

                {preview.credentials.map((credential) => (
                  <div key={`${credential.kind}-${credential.display.title}`} className="card">
                    <h4 style={{ marginTop: 0 }}>{credential.display.title}</h4>
                    <div className="table-wrap">
                      <table aria-label="Credential preview">
                        <tbody>
                          <tr>
                            <th>Kind</th>
                            <td>
                              {credential.label}
                              <div className="muted mono">{credential.namespaces.join(' ')}</div>
                            </td>
                          </tr>
                          <tr>
                            <th>Institution</th>
                            <td>{String(credential.display.institution || '—')}</td>
                          </tr>
                          <tr>
                            <th>Level and field</th>
                            <td>
                              {[credential.display.degreeLevel, credential.display.fieldOfStudy]
                                .filter(Boolean)
                                .join(' · ') || '—'}
                            </td>
                          </tr>
                          <tr>
                            <th>Graduation</th>
                            <td>
                              {String(credential.display.graduationDate || '—')}
                              {credential.display.studentId ? ` · student ${credential.display.studentId}` : ''}
                            </td>
                          </tr>
                          {credential.display.totalCredits != null && (
                            <tr>
                              <th>Credits</th>
                              <td>
                                {credential.display.totalCredits} over {credential.display.courseCount} modules
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {credential.courses.length > 0 && (
                      <div className="table-wrap">
                        <table aria-label="Modules">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Module</th>
                              <th>Credits</th>
                              <th>Grade</th>
                            </tr>
                          </thead>
                          <tbody>
                            {credential.courses.map((course, index) => (
                              <tr key={`${course.courseCode}-${index}`}>
                                <td className="mono">{course.courseCode}</td>
                                <td>{course.courseName}</td>
                                <td>{course.credits}</td>
                                <td>{course.grade}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {selected.canIssue && (
              <div className="stack" style={{ marginTop: 28 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>Issue</h3>
                <p className="muted" style={{ margin: 0 }}>
                  Issuing sends {selected.applicantEmail} a link to collect, and starts the same
                  30-day window every other credential gets. Pressing it twice does not issue twice.
                </p>
                <div className="toolbar">
                  <button type="button" className="btn btn-primary" onClick={submitIssue} disabled={busy}>
                    {busy ? 'Issuing…' : 'Issue the credentials'}
                  </button>
                  <span className="muted">Preview the documents first — this is the last check before signing.</span>
                </div>
              </div>
            )}

            {issued && (
              <div className="notice ok">
                {issued.link ? (
                  <>
                    Collection link (also emailed):<br />
                    <a href={issued.link} target="_blank" rel="noreferrer">
                      {issued.link}
                    </a>
                    {issued.expiresAt && <div className="muted">Held until {formatDate(issued.expiresAt)}.</div>}
                  </>
                ) : (
                  'Already issued; the holder has the link.'
                )}
              </div>
            )}

            <div className="stack" style={{ marginTop: 28 }}>
              <h3 style={{ margin: 0, fontSize: 17 }}>History</h3>
              <div className="table-wrap">
                <table aria-label="Request history">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>By</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.events.map((event, index) => (
                      <tr key={`${event.event}-${index}`}>
                        <td>{event.event}</td>
                        <td>{event.actor || '—'}</td>
                        <td>{formatDate(event.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
