'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import '../share.css';

/** A section of the shared document, as the issuer built it. */
type ShareSection = {
  id: string;
  heading: string;
  rows: [string, string][];
};

/**
 * The document the issuer built from the shared credential. This page draws it, and the PDF is
 * rendered from the same object, so what a recipient reads here and what they download cannot
 * disagree. The page decides nothing about the content: headings, order and wording all arrive.
 */
type ShareDocument = {
  title: string;
  subtitle?: string | null;
  kindLabel?: string | null;
  lede?: string;
  sections: ShareSection[];
  courses?: { caption: string; columns: string[]; rows: string[][] } | null;
  share: {
    reference: string;
    sharedBy: string;
    sharedWith?: string | null;
    message?: string | null;
    sharedOn?: string | null;
    accessUntil?: string | null;
    disclosedSections?: string[];
    checks?: string[];
  };
  provenance?: string;
};

type ShareView = {
  success: boolean;
  senderEmail?: string;
  recipientName?: string;
  message?: string;
  kind?: string | null;
  kindLabel?: string | null;
  categories?: string[];
  claims?: Record<string, unknown>;
  document?: ShareDocument | null;
  sharedAt?: string;
  expiresAt?: string;
  error?: string;
};

function Masthead({ kindLabel, sharedOn }: { kindLabel?: string | null; sharedOn?: string | null }) {
  return (
    <header className="doc-head">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="doc-mark" src="/quals-mark.svg" alt="" width={34} height={34} />
      <div className="doc-brand">
        <b>Quals</b>
        <span>Verifiable credentials</span>
      </div>
      {kindLabel && (
        <div className="doc-kind">
          {kindLabel}
          {sharedOn && <small>Shared {sharedOn}</small>}
        </div>
      )}
    </header>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function SharePage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params?.shareId || '';

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [recipientToken, setRecipientToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [view, setView] = useState<ShareView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'signin' | 'terms' | 'view'>('signin');

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as T;
  }

  useEffect(() => {
    const t = sessionStorage.getItem(`share-token-${shareId}`);
    if (t) {
      setRecipientToken(t);
      setStage('terms');
    }
  }, [shareId]);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<{ success: boolean; otpSent: boolean; otp?: string }>(
        `/shares/${shareId}/otp`,
        { email },
      );
      setOtpSent(true);
      setDevOtp(data.otp || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<{ success: boolean; recipientToken: string }>(
        `/shares/${shareId}/verify`,
        { email, otp },
      );
      setRecipientToken(data.recipientToken);
      sessionStorage.setItem(`share-token-${shareId}`, data.recipientToken);
      setStage('terms');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptTerms() {
    setBusy(true);
    setError(null);
    try {
      await post(`/shares/${shareId}/accept-terms`, { recipientToken });
      await loadView();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadView() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<ShareView>(`/shares/${shareId}/view`, { recipientToken });
      setView(data);
      setStage('view');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    if (!recipientToken) return;
    window.open(`/api/shares/${shareId}/pdf?token=${encodeURIComponent(recipientToken)}`, '_blank');
  }

  const shared = view?.document || null;
  const courses = shared?.courses || null;
  // An issuer older than this page would return claims without a document. Rather than showing a
  // recipient nothing, the disclosed fields are listed plainly.
  const fallbackRows: [string, string][] = Object.entries(view?.claims || {})
    .filter(([key, value]) => key !== 'courses' && typeof value !== 'object')
    .map(([key, value]) => [
      key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .replace(/^./, (c) => c.toUpperCase()),
      String(value),
    ]);

  const shareRows: [string, string][] = shared
    ? [
        ['Shared by', shared.share.sharedBy],
        ...(shared.share.sharedWith
          ? ([['Shared with', shared.share.sharedWith]] as [string, string][])
          : []),
        ...(shared.share.sharedOn ? ([['Shared on', shared.share.sharedOn]] as [string, string][]) : []),
        ...(shared.share.accessUntil
          ? ([['Access until', shared.share.accessUntil]] as [string, string][])
          : []),
        ...(shared.share.disclosedSections?.length
          ? ([['Sections released', shared.share.disclosedSections.join(', ')]] as [string, string][])
          : []),
        ['Reference', shared.share.reference],
      ]
    : [];

  return (
    <>
      <div className="doc">
        <Masthead kindLabel={shared?.kindLabel} sharedOn={shared?.share.sharedOn} />

        {stage === 'signin' && (
          <section className="doc-section">
            <h1>Shared documents</h1>
            <p className="doc-lede">
              Someone sent you a document through Quals. Sign in with the email address it was sent
              to, and we will send you a one-time code.
            </p>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            {!otpSent ? (
              <button
                className="btn btn-primary"
                onClick={requestOtp}
                disabled={busy || !email}
                style={{ marginTop: 14 }}
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            ) : (
              <div>
                <div className="field" style={{ marginTop: 14 }}>
                  <label>One-time code</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" />
                </div>
                {devOtp && (
                  <p className="muted" style={{ marginTop: 6 }}>
                    Dev code (email not configured): <b>{devOtp}</b>
                  </p>
                )}
                <button
                  className="btn btn-primary"
                  onClick={verifyOtp}
                  disabled={busy || !otp}
                  style={{ marginTop: 14 }}
                >
                  {busy ? 'Verifying…' : 'Verify and continue'}
                </button>
                <button className="btn" onClick={requestOtp} disabled={busy} style={{ marginTop: 8 }}>
                  Resend code
                </button>
              </div>
            )}
          </section>
        )}

        {stage === 'terms' && (
          <section className="doc-section">
            <h1>Before you view this document</h1>
            <p className="doc-lede">Please review and accept the terms and conditions.</p>
            <div className="doc-message">
              By accepting, you agree that you are the intended recipient of this share and that the
              information will only be used for the purpose for which it was shared. The sender is
              notified when you view or download these documents.
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              I acknowledge and agree to the terms and conditions
            </label>
            <button
              className="btn btn-primary"
              onClick={acceptTerms}
              disabled={busy || !termsAccepted}
              style={{ marginTop: 14 }}
            >
              {busy ? 'Loading…' : 'Show the document'}
            </button>
          </section>
        )}

        {stage === 'view' && view && (
          <>
            <h1>{shared?.title || 'Shared credential'}</h1>
            {shared?.subtitle && <p className="doc-subtitle">{shared.subtitle}</p>}
            {shared?.lede && <p className="doc-lede">{shared.lede}</p>}

            {shared ? (
              <>
                {shared.sections.map((section) => (
                  <section className="doc-section" key={section.id}>
                    <h2>{section.heading}</h2>
                    <Rows rows={section.rows} />
                  </section>
                ))}

                {courses && courses.rows.length > 0 && (
                  <section className="doc-section">
                    <h2>Modules</h2>
                    <p className="doc-caption">{courses.caption}</p>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            {courses.columns.map((column) => (
                              <th key={column} scope="col">
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {courses.rows.map((row, index) => (
                            <tr key={`${row[0]}-${index}`}>
                              {row.map((cell, cellIndex) => (
                                <td key={courses.columns[cellIndex]}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                <section className="doc-section">
                  <h2>About this share</h2>
                  <Rows rows={shareRows} />
                  {shared.share.message && (
                    <blockquote className="doc-message">{shared.share.message}</blockquote>
                  )}
                  {shared.share.accessUntil && (
                    <p className="doc-caption" style={{ marginTop: 12 }}>
                      This link can be opened until {shared.share.accessUntil}. After that, ask the
                      sender to share it again.
                    </p>
                  )}
                </section>

                {shared.share.checks && shared.share.checks.length > 0 && (
                  <section className="doc-section">
                    <h2>What Quals checked</h2>
                    <ul className="doc-checks">
                      {shared.share.checks.map((check) => (
                        <li key={check}>{check}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {shared.provenance && <footer className="doc-foot">{shared.provenance}</footer>}
              </>
            ) : (
              <section className="doc-section">
                <h2>Disclosed details</h2>
                <Rows rows={fallbackRows} />
              </section>
            )}
          </>
        )}

        {error && (
          <section className="doc-section">
            <span className="badge err">Error</span>{' '}
            <span className="mono" style={{ marginLeft: 8 }}>
              {error}
            </span>
          </section>
        )}
      </div>

      {/* Outside the document, so a printed page carries no button. */}
      {stage === 'view' && view && (
        <div className="doc-actions">
          <button className="btn btn-primary" onClick={downloadPdf} disabled={busy}>
            Download PDF
          </button>
        </div>
      )}
    </>
  );
}
