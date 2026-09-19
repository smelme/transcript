'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  createAcademyOffer,
  exchangeToken,
  listAcademyCredentials,
  requestCredentials,
  requestSignInOtp,
  type AcademyCredential,
  type AcademyOfferResult,
} from '../lib/api';

/**
 * Get your credentials.
 *
 * The academy knows who you are from your email address, so this is a sign-in and then a list -
 * not a form that asks you what you would like. What each credential contains is decided by the
 * programme you are on and how far through it you are, and the list says so in the credential's
 * own name: a completed degree is one credential holding the qualification and the transcript, a
 * study still under way is a transcript for the terms so far, and a certification is the award
 * alone.
 *
 * You choose which of them to take, one at a time, because each arrives in your wallet on its own
 * offer. Nothing is prepared twice: signing in again shows the same items, and the ones already in
 * your wallet are marked rather than offered again.
 */
type Step = 'identify' | 'code' | 'choosing' | 'offering';

/** What a credential carries, said plainly: the label is the explanation. */
function describes(credential: AcademyCredential): string {
  const parts = [credential.label];
  if (credential.degreeLevel) parts.push(credential.degreeLevel);
  if (credential.fieldOfStudy) parts.push(credential.fieldOfStudy);
  return parts.filter(Boolean).join(' · ');
}

export default function GetCredentialsPage() {
  const [step, setStep] = useState<Step>('identify');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [items, setItems] = useState<AcademyCredential[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [offers, setOffers] = useState<AcademyOfferResult[]>([]);
  const [offerIndex, setOfferIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(sessionId: string) {
    setSelected((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId],
    );
  }

  /** Send the code, and say where it went. */
  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // The academy has to know the address before it can be signed in with: this is the record
      // check, and the record is also what ties the address to the student it belongs to. It
      // prepares what that student holds at the same time, since the record is right here.
      await requestCredentials({ email: email.trim() });

      const r = await requestSignInOtp(email.trim());
      if (!r.success) throw new Error(r.error || 'We could not send a code to that address.');
      // Email delivery is off in the demo, so the code comes back in the response instead.
      setDevCode(r.otp || null);
      setStep('code');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Sign in, then ask what this student holds. */
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const signedIn = await exchangeToken(email.trim(), code.trim());
      const accessToken = signedIn.accessToken;
      if (!accessToken) throw new Error(signedIn.error || 'That code was not accepted.');
      setToken(accessToken);

      const listed = await listAcademyCredentials(accessToken);
      if (!listed.success) throw new Error(listed.error || 'We could not read your record.');
      setItems(listed.credentials || []);
      setStep('choosing');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** One offer per chosen credential, taken in turn. */
  async function startOffers() {
    if (!token || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const made: AcademyOfferResult[] = [];
      for (const sessionId of selected) {
        const offer = await createAcademyOffer(sessionId, token);
        if (!offer.success) throw new Error(offer.error || 'We could not prepare that credential.');
        made.push(offer);
      }
      setOffers(made);
      setOfferIndex(0);
      setStep('offering');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = offers[offerIndex];
  // The offer itself carries only machine names, so what the holder is shown comes from the item
  // they chose: its own title and what it holds, in words.
  const currentItem = items.find((item) => item.sessionId === current?.sessionId);

  return (
    <section className="section" style={{ minHeight: '62vh' }}>
      <div className="container-narrow">
        {step === 'offering' ? (
          <>
            <span className="eyebrow" style={{ color: 'var(--link)' }}>
              Step {offerIndex + 1} of {offers.length}
            </span>
            <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Add your credential
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 24 }}>
              Open the Quals wallet on your phone and scan this code, or use the button if you are
              reading this on the phone itself.
            </p>

            {current?.qrDataUrl && (
              <div className="qr-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.qrDataUrl} alt="QR code to add this credential to your wallet" />
                <div className="qr-caption">Smart Academy · Quals wallet</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
              {current?.appLinkUrl || current?.offerUrl ? (
                <a href={current.appLinkUrl || current.offerUrl} className="btn btn-dark">
                  Add to your wallet
                </a>
              ) : null}
              {offerIndex + 1 < offers.length ? (
                <button type="button" className="btn btn-primary" onClick={() => setOfferIndex(offerIndex + 1)}>
                  Next credential ({offerIndex + 2} of {offers.length})
                </button>
              ) : (
                <Link href="/credentials" className="btn btn-primary">
                  Finish
                </Link>
              )}
            </div>

            {currentItem && (
              <p className="muted" style={{ marginTop: 16 }}>
                You are adding: {currentItem.title} — {currentItem.label}
              </p>
            )}
          </>
        ) : step === 'choosing' ? (
          <>
            <span className="eyebrow" style={{ color: 'var(--link)' }}>
              Step 2 of 3
            </span>
            <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Your credentials are ready
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 24 }}>
              Everything Smart Academy holds for you. Choose the ones you would like in your wallet;
              you can add the rest whenever you like.
            </p>

            {items.length === 0 ? (
              <div className="panel">
                <p>We have no credentials recorded for {email}.</p>
                <p className="muted">
                  If that is unexpected, contact the registry and quote the address you signed in
                  with.
                </p>
              </div>
            ) : (
              <div className="panel">
                {items.map((credential) => (
                  <label
                    key={credential.sessionId}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '12px 0',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(credential.sessionId)}
                      onChange={() => toggle(credential.sessionId)}
                      style={{ marginTop: 4 }}
                    />
                    <span>
                      <strong>{credential.title}</strong>
                      <br />
                      <span className="muted" style={{ fontSize: 14 }}>
                        {describes(credential)}
                      </span>
                      {credential.inWallet && (
                        <>
                          <br />
                          <span className="badge ok" style={{ marginTop: 6, display: 'inline-block' }}>
                            In your wallet · you can add it again
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                ))}

                {error && <p style={{ color: 'var(--err)', marginTop: 14 }}>{error}</p>}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 20 }}
                  disabled={busy || selected.length === 0}
                  onClick={startOffers}
                >
                  {busy
                    ? 'Preparing…'
                    : selected.length === 1
                      ? 'Continue with 1 credential'
                      : `Continue with ${selected.length} credentials`}
                </button>
              </div>
            )}

            <p className="muted" style={{ marginTop: 18 }}>
              <Link href="/">Back to Smart Academy</Link>
            </p>
          </>
        ) : (
          <>
            <span className="eyebrow" style={{ color: 'var(--link)' }}>
              Step 1 of 3
            </span>
            <h1 style={{ fontSize: 32, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Get your credentials
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 30 }}>
              {step === 'identify'
                ? 'Sign in with the email address Smart Academy holds for you, and we will show you what is ready to be added to your wallet.'
                : `We have sent a six-digit code to ${email}.`}
            </p>

            <div className="panel">
              {step === 'identify' ? (
                <form onSubmit={sendCode}>
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
                  <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
                    {busy ? 'Sending…' : 'Send me a code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={signIn}>
                  <label htmlFor="code">Your code</label>
                  <input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                  />
                  {devCode && (
                    <p className="muted">
                      Email delivery is off in the demo, so your code is {devCode}.
                    </p>
                  )}
                  {error && <p style={{ color: 'var(--err)' }}>{error}</p>}
                  <button type="submit" className="btn btn-primary" disabled={busy || !code.trim()}>
                    {busy ? 'Signing you in…' : 'Show me my credentials'}
                  </button>
                </form>
              )}
            </div>

            <p className="muted" style={{ marginTop: 18 }}>
              <Link href="/">Back to Smart Academy</Link>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
