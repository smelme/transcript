'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestCredentials, type AcademyRequestResult } from '../lib/api';

export default function GetCredentialsPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AcademyRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await requestCredentials({ email, fullName: fullName || undefined });
      if (r.success) setResult(r);
      else setError(r.error || 'We could not prepare your credentials.');
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" style={{ minHeight: '62vh' }}>
      <div className="container-narrow">
        <span className="eyebrow" style={{ color: 'var(--link)' }}>
          Step 1 of 3
        </span>
        <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
          Get your digital credentials
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 30 }}>
          Enter the email address Smart Academy holds for you. We will check your record and email
          you a secure link to add your credentials to your wallet.
        </p>

        {!result && (
          <div className="panel">
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gap: 18 }}>
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <span className="field-help">
                    Use the address the academy has on file for you.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="fullName">Full name (optional)</label>
                  <input
                    id="fullName"
                    autoComplete="name"
                    placeholder="As it appears on your record"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div className="notice err" style={{ marginTop: 20 }}>
                  {error}
                </div>
              )}

              <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
                <button type="submit" className="btn btn-dark" disabled={busy || !email}>
                  {busy ? 'Checking your record…' : 'Send me the link'}
                </button>
                <Link href="/credentials" className="muted">
                  Learn what you will receive
                </Link>
              </div>
            </form>
          </div>
        )}

        {result && (
          <div className="panel">
            <div className="notice ok" style={{ marginBottom: 20 }}>
              {result.emailSent
                ? `We have emailed a secure link to ${result.email}.`
                : 'Your credentials are ready. Email delivery is not configured, so use the link below.'}
            </div>

            {result.credential?.title && (
              <dl className="definition-list" style={{ marginBottom: 22 }}>
                <dt>Prepared for</dt>
                <dd>{result.email}</dd>
                <dt>Credential</dt>
                <dd>{result.credential.title}</dd>
                {result.credential.graduationDate && (
                  <>
                    <dt>Graduated</dt>
                    <dd>{result.credential.graduationDate}</dd>
                  </>
                )}
              </dl>
            )}

            {result.claimUrl && (
              <div style={{ marginBottom: 18 }}>
                <p className="muted" style={{ marginBottom: 8 }}>
                  {result.emailSent ? 'Your link:' : 'Continue to your credentials:'}
                </p>
                <Link href={result.claimUrl.replace(/^https?:\/\/[^/]+/, '')} className="btn btn-primary">
                  Continue to your credentials
                </Link>
              </div>
            )}

            <p className="muted" style={{ marginBottom: 0 }}>
              Next, you will confirm it is you with a one-time code, then scan the credential into
              the Quals wallet app.
            </p>

            <div style={{ marginTop: 22 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setResult(null);
                  setEmail('');
                  setFullName('');
                }}
              >
                Use a different email
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
