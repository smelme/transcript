'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestCredentials, type AcademyRequestResult, type CredentialChoice } from '../lib/api';

/** The three choices, each with the one-line description of what it holds. */
const CHOICES: { value: CredentialChoice; label: string; description: string }[] = [
  {
    value: 'qualification',
    label: 'Qualification certificate',
    description: 'Your degree, the programme and your graduation date.',
  },
  {
    value: 'transcript',
    label: 'Academic transcript',
    description: 'Every module you completed, with its credits and your overall result.',
  },
  {
    value: 'both',
    label: 'Both',
    description: 'Two credentials, held separately so you can present one without the other.',
  },
];

export default function GetCredentialsPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [include, setInclude] = useState<CredentialChoice>('qualification');
  // On by default for the demo, so what a relying party can recognise is visible. A holder
  // who would rather disclose less can turn it off before the credential is issued.
  const [recognition, setRecognition] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AcademyRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await requestCredentials({ email, fullName: fullName || undefined, include, recognition });
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

              <fieldset style={{ border: 0, padding: 0, margin: '24px 0 0' }}>
                <legend style={{ padding: 0, fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
                  What would you like to receive?
                </legend>
                <div style={{ display: 'grid', gap: 12 }}>
                  {CHOICES.map((choice) => (
                    <label
                      key={choice.value}
                      className={`credential-card${include === choice.value ? ' selected' : ''}`}
                    >
                      <input
                        className="checkbox"
                        type="radio"
                        name="include"
                        value={choice.value}
                        checked={include === choice.value}
                        onChange={() => setInclude(choice.value)}
                      />
                      <span style={{ flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: 15, marginBottom: 4 }}>
                          {choice.label}
                        </strong>
                        <span className="meta">{choice.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label
                className="credential-card"
                style={{ marginTop: 14, alignItems: 'flex-start' }}
              >
                <input
                  className="checkbox"
                  type="checkbox"
                  checked={recognition}
                  onChange={(e) => setRecognition(e.target.checked)}
                />
                <span style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: 15, marginBottom: 4 }}>
                    Include recognition details
                  </strong>
                  <span className="meta">
                    How your institution and modules are identified to a registrar: institution
                    identifiers, the recognised programme title, the language of instruction, how
                    much work each module was, and the office that attested the record. Detailed
                    records are accepted abroad more easily; leaving this off keeps the credential
                    smaller and discloses less.
                  </span>
                </span>
              </label>

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
          <div className="panel" aria-live="polite">
            <div className="notice ok" style={{ marginBottom: 20 }}>
              {result.emailSent
                ? `We have emailed a secure link to ${result.email}.`
                : 'Your credentials are ready. Email delivery is not configured, so use the link below.'}
            </div>

            <dl className="definition-list" style={{ marginBottom: 18 }}>
              <dt>Prepared for</dt>
              <dd>{result.email}</dd>
            </dl>

            {result.credentials && result.credentials.length > 0 && (
              <ul
                style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'grid', gap: 10 }}
              >
                {result.credentials.map((credential) => (
                  <li
                    key={credential.sessionId}
                    style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}
                  >
                    <span className="badge kind">{credential.label}</span>
                    <span>{credential.title}</span>
                    {credential.recognition && (
                      <span className="muted">Recognition details included</span>
                    )}
                    {credential.inWallet ? (
                      <span className="badge ok">Already in your wallet</span>
                    ) : (
                      credential.reused && (
                        <span className="muted">Already prepared — nothing new was issued</span>
                      )
                    )}
                  </li>
                ))}
              </ul>
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
