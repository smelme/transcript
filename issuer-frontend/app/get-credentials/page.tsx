'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { requestCredentials } from '../lib/api';

/**
 * Get your credentials.
 *
 * The academy's part in issuing is one thing: it knows who you are from the address it holds, and
 * publishing your record is what happens here. Everything after that belongs to Quals, where the
 * credential is collected into the wallet, so this page hands over rather than running a flow of
 * its own: the holder is told what is waiting and sent to where they can collect it.
 *
 * It hands over with the address, not with an identity. The issuing page still sends a code to the
 * address the institution published for, which is the thing that proves the holder controls it.
 *
 * The address is passed on rather than looked up, so the hand-over works even if the holder is not
 * signed in here, which they no longer need to be: signing in is Quals' job now.
 */
const ISSUE_SITE_URL =
  process.env.NEXT_PUBLIC_ISSUE_SITE_URL || 'https://quals-production.up.railway.app';

const REDIRECT_AFTER_MS = 5000;

export default function GetCredentialsPage() {
  const [email, setEmail] = useState('');
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(Math.round(REDIRECT_AFTER_MS / 1000));

  const issueUrl = `${ISSUE_SITE_URL}/issue?email=${encodeURIComponent(email.trim())}`;

  // A countdown, so the hand-over is something the holder can see rather than a page that vanishes.
  useEffect(() => {
    if (!published) {return;}
    const tick = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    const go = setTimeout(() => {
      window.location.href = issueUrl;
    }, REDIRECT_AFTER_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [published, issueUrl]);

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Publishing is what puts the credential where it can be collected, and the email carries the
      // holder their own copy of the same link.
      const result = (await requestCredentials({ email: email.trim() })) as
        | { success?: boolean; error?: string }
        | undefined;
      if (result && result.success === false) {
        throw new Error(result.error || 'We could not prepare your credentials.');
      }
      setPublished(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" style={{ minHeight: '62vh' }}>
      <div className="container-narrow">
        {published ? (
          <>
            <span className="eyebrow" style={{ color: 'var(--link)' }}>
              Issued by Quals
            </span>
            <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Your credentials are ready
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 24 }}>
              They are waiting for you on Quals, where you can add them to your wallet. We have also
              emailed you the same link.
            </p>

            <div className="card">
              <p style={{ marginTop: 0 }}>
                <strong>Collect them from Quals</strong>
              </p>
              <p className="muted" style={{ marginTop: 6 }}>
                You will sign in with a code to <strong>{email.trim()}</strong>, the address Smart
                Academy holds for you.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                <a className="btn btn-primary" href={issueUrl}>
                  Go to Quals now
                </a>
              </div>
              <p className="muted" style={{ marginTop: 14 }}>
                Taking you there in {secondsLeft} {secondsLeft === 1 ? 'second' : 'seconds'}…
              </p>
            </div>

            <p className="muted" style={{ marginTop: 18 }}>
              <Link href="/">Back to Smart Academy</Link>
            </p>
          </>
        ) : (
          <>
            <span className="eyebrow" style={{ color: 'var(--link)' }}>
              Smart Academy
            </span>
            <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Get your credentials
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 30 }}>
              Sign in with the email address Smart Academy holds for you. We will prepare what you
              hold and send you straight to Quals, where it is added to your wallet.
            </p>

            <div className="card">
              <form onSubmit={publish}>
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                {error && <p style={{ color: 'var(--err)' }}>{error}</p>}
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ marginTop: 16 }}
                  disabled={busy || !email.trim()}
                >
                  {busy ? 'Preparing…' : 'Prepare my credentials'}
                </button>
              </form>
              <p className="muted" style={{ marginTop: 16 }}>
                Nothing is issued here. Your credentials are published to Quals, and you collect them
                there.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
