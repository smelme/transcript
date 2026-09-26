'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CHECKED_PATH, COPY, REQUEST_PAGE_URL, outcomeFor } from '../lib/doors';

/**
 * Sign in with your email - the one way in.
 *
 * Shaped like the sign-in everybody has already done a hundred times: one field, one button, and a
 * quiet line underneath for the case it cannot serve. That line is the whole of P0-35, and it is
 * deliberately the shape every sign-in screen uses for "forgot your password?" - a question about
 * circumstances rather than a verdict about the person reading it.
 *
 * Somebody who finished longer ago, or whom we cannot match, takes that line and lands on the
 * checked path. Nothing here accuses them of anything, and nothing here decides on their behalf:
 * the record says whether this way in can serve them, and the answer to that is never "you are not
 * who you say you are".
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

/** Dates arrive as ISO; a reader wants the day, not the millisecond. */
function formatDay(value?: string | null): string | null {
  if (!value) {return null;}
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {return null;}
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) {return null;}
  return `${Number(match[3])} ${months[month]} ${match[1]}`;
}

export default function GetCredentialsPage() {
  const [email, setEmail] = useState('');
  const [published, setPublished] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{ title: string; body: string } | null>(null);

  const issueUrl = `${ISSUE_SITE_URL}/issue?email=${encodeURIComponent(email.trim())}`;
  const expiry = formatDay(expiresAt);

  function startAgain() {
    setEmail('');
    setPublished(false);
    setExpiresAt(null);
    setRefusal(null);
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setRefusal(null);

    const address = email.trim();
    const answered = (reason: string, missing?: string[]) => {
      const fallback = outcomeFor({ verdict: 'unknown', reason, missing });
      setRefusal({ title: fallback.title, body: fallback.body });
    };

    try {
      // The question comes first: whether we hold this person, and whether they finished inside
      // the window. The answer decides which door this page shows, and only a positive one is
      // published for.
      const checked = await fetch('/api/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      }).then((response) => response.json());

      const outcome = outcomeFor(checked);
      if (outcome.door !== 'self') {
        setRefusal({ title: outcome.title, body: outcome.body });
        return;
      }

      // Publishing is the institution's own act, from the record it holds. Nothing here asks
      // anybody to invent a record, which is what this call replaced.
      const result = (await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      }).then((response) => response.json())) as {
        success?: boolean;
        reason?: string;
        missing?: string[];
        expiresAt?: string;
      };

      if (!result?.success) {
        answered(result?.reason || 'unreachable', result?.missing);
        return;
      }

      setExpiresAt(result.expiresAt || null);
      setPublished(true);
    } catch {
      answered('unreachable');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section" style={{ minHeight: '62vh' }}>
      <div className="container-narrow">
        <span className="eyebrow" style={{ color: 'var(--link)' }}>
          Smart Academy
        </span>
        <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
          Sign in with your email
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 30 }}>
          {COPY.intro}
        </p>
        {refusal ? (
          <>
            <div className="card">
              <h2 style={{ fontSize: 20, letterSpacing: '-0.01em', margin: '0 0 10px' }}>
                {refusal.title}
              </h2>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: 'var(--muted)' }}>
                {refusal.body}
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
                <a
                  className="btn btn-primary"
                  href={REQUEST_PAGE_URL}
                  style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                >
                  {CHECKED_PATH.action}
                </a>
                <button
                  type="button"
                  className="btn"
                  onClick={startAgain}
                  style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                >
                  Try another address
                </button>
              </div>
              <p className="muted" style={{ marginTop: 16 }}>
                Asking us to check costs {CHECKED_PATH.cost.toLowerCase()} and takes{' '}
                {CHECKED_PATH.wait.toLowerCase()}. You will need{' '}
                {CHECKED_PATH.needs.toLowerCase()}.
              </p>
            </div>
            <p className="muted" style={{ marginTop: 18 }}>
              Nothing has been changed on your record by this page.
            </p>
          </>
        ) : published ? (
          <>
            <span className="eyebrow" style={{ color: 'var(--link)' }}>
              Issued by Quals
            </span>
            <h2 style={{ fontSize: 24, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Your credentials are ready
            </h2>
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
                {expiry
                  ? `These are held for you until ${expiry}. Collect them before then, or they are cancelled and Smart Academy has to publish them again.`
                  : 'These are held for a limited time. Collect them soon, or they are cancelled and Smart Academy has to publish them again.'}
              </p>
              <p className="muted" style={{ marginTop: 8 }}>
                Once a credential is in your wallet it stays there, and nobody has to ask for it again.
              </p>
            </div>

            <p className="muted" style={{ marginTop: 18 }}>
              <Link href="/">Back to Smart Academy</Link>
            </p>
          </>
        ) : (
          <>
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
                  // The shared input styling works out at about 37px, which is under the 44px the flow
                  // asks for on the one control the whole page turns on.
                  style={{ minHeight: 44 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ marginTop: 16, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                  disabled={busy || !email.trim()}
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              {/* The way out, shaped like the one every sign-in screen has: quiet, under the form,
                  and a question about circumstances rather than a verdict about the person. */}
              <p className="muted" style={{ marginTop: 16 }}>
                {CHECKED_PATH.prompt} <a href={REQUEST_PAGE_URL}>{CHECKED_PATH.action}</a>. A person
                will look at it for you, and it is open to everyone.
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
