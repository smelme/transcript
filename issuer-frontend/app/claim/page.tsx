'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  createAcademyOffer,
  exchangeToken,
  listAcademyCredentials,
  requestSignInOtp,
  type AcademyCredential,
} from '../lib/api';

function ClaimFlow() {
  const params = useSearchParams();
  const invitedEmail = (params.get('email') || '').trim().toLowerCase();

  /**
   * What the applicant asked for, carried in the link by the request step. The claim page shows
   * that rather than every credential the account happens to hold from earlier requests - which is
   * otherwise confusing after a second request, or when testing. A link without a choice (an older
   * invitation) shows everything.
   */
  const requestedKinds = (() => {
    const include = (params.get('include') || '').trim().toLowerCase();
    if (include === 'both') return ['qualification', 'transcript'];
    if (include === 'transcript') return ['transcript'];
    if (include === 'qualification') return ['qualification'];
    return null;
  })();
  const [showAll, setShowAll] = useState(false);

  const [email, setEmail] = useState(invitedEmail);
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AcademyCredential[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ qrDataUrl?: string; offerUrl?: string; appLinkUrl?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setEmail(invitedEmail);
  }, [invitedEmail]);

  useEffect(() => {
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(ua));
  }, []);

  const loadCredentials = useCallback(async (accessToken: string) => {
    const list = await listAcademyCredentials(accessToken);
    if (!list.success) throw new Error(list.error || 'Could not load your credentials');
    setCredentials(list.credentials || []);
    const available = (list.credentials || []).filter((c) => !c.inWallet);
    setSelected(available[0]?.sessionId || null);
  }, []);

  /** What the holder is being shown: what they asked for, unless they asked to see everything. */
  const visibleCredentials = (credentials || []).filter(
    (credential) => showAll || !requestedKinds || requestedKinds.includes(credential.kind),
  );

  // Keep the selection on something visible: after filtering, the previously selected credential
  // may no longer be on screen.
  useEffect(() => {
    if (!credentials) return;
    if (visibleCredentials.some((credential) => credential.sessionId === selected)) return;
    setSelected(
      visibleCredentials.find((credential) => !credential.inWallet)?.sessionId || null,
    );
  }, [credentials, showAll, selected]);

  /** How a credential is named in messages: its kind, not its session id. */
  function labelFor(sessionId: string | null) {
    return (credentials || []).find((c) => c.sessionId === sessionId)?.label || 'credential';
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await requestSignInOtp(email);
      if (!r.success) throw new Error(r.error || 'Could not send a code');
      setCodeSent(true);
      setDevOtp(r.otp || null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await exchangeToken(email, otp);
      if (!r.success || !r.accessToken) throw new Error(r.error || 'That code was not accepted');
      setToken(r.accessToken);
      await loadCredentials(r.accessToken);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartIssuance() {
    if (!token || !selected) return;
    setBusy(true);
    setError(null);
    setOffer(null);
    try {
      const r = await createAcademyOffer(selected, token);
      if (!r.success) throw new Error(r.error || 'Could not start the issuance');
      if (r.alreadyInWallet) {
        // Idempotent by design: the wallet holds it already, so nothing is issued again.
        await loadCredentials(token);
        setError(`Your ${labelFor(selected)} is already in your wallet.`);
        return;
      }
      setOffer({ qrDataUrl: r.qrDataUrl, offerUrl: r.offerUrl, appLinkUrl: r.appLinkUrl });
    } catch (err) {
      setError((err as Error).message);
      // A failure for one credential must not stop the other: refresh the list so the
      // student can see what is still available and try again.
      await loadCredentials(token).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const selectedCredential = (credentials || []).find((c) => c.sessionId === selected) || null;
  const step = offer ? 3 : credentials ? 2 : codeSent ? 2 : 1;

  return (
    <section className="section" style={{ minHeight: '62vh' }}>
      <div className="container-narrow">
        <span className="eyebrow" style={{ color: 'var(--link)' }}>
          Step {step} of 3
        </span>

        {!credentials && (
          <>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              {codeSent ? 'Enter your one-time code' : 'Confirm it is you'}
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 28 }}>
              {codeSent
                ? `We sent a six-digit code to ${email}. It expires in 10 minutes.`
                : 'We will email you a one-time code to confirm you own this address.'}
            </p>

            {!codeSent ? (
              <div className="panel">
                <form onSubmit={handleSendCode}>
                  <div className="field">
                    <label htmlFor="email">Email address</label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  {error && (
                    <div className="notice err" style={{ marginTop: 20 }}>
                      {error}
                    </div>
                  )}
                  <div style={{ marginTop: 24 }}>
                    <button type="submit" className="btn btn-dark" disabled={busy || !email}>
                      {busy ? 'Sending…' : 'Email me a code'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="panel">
                <form onSubmit={handleVerify}>
                  <div className="field">
                    <label htmlFor="otp">One-time code</label>
                    <input
                      id="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      style={{ letterSpacing: '0.35em', fontSize: 20, maxWidth: 200 }}
                    />
                  </div>
                  {devOtp && (
                    <div className="notice" style={{ marginTop: 16 }}>
                      Development mode — email delivery is not configured. Your code is{' '}
                      <strong className="mono">{devOtp}</strong>.
                    </div>
                  )}
                  {error && (
                    <div className="notice err" style={{ marginTop: 16 }}>
                      {error}
                    </div>
                  )}
                  <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                    <button type="submit" className="btn btn-dark" disabled={busy || otp.length < 4}>
                      {busy ? 'Verifying…' : 'Continue'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setCodeSent(false);
                        setOtp('');
                        setDevOtp(null);
                        setError(null);
                      }}
                    >
                      Change email
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}

        {credentials && !offer && (
          <>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Your credentials
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 28 }}>
              {requestedKinds && !showAll
                ? `You asked for ${requestedKinds.map((kind) => (kind === 'transcript' ? 'an academic transcript' : 'your qualification certificate')).join(' and ')}. Add it to your wallet whenever you are ready.`
                : 'Select a credential to add to your wallet. You can add the rest later.'}
            </p>

            {credentials.length === 0 ? (
              <div className="panel">
                <p className="muted" style={{ margin: 0 }}>
                  We could not find any credentials for {email}. Please check the address you used,
                  or contact the academy registry.
                </p>
              </div>
            ) : visibleCredentials.length === 0 ? (
              <div className="panel">
                <p className="muted" style={{ margin: 0 }}>
                  Nothing waiting for {email} matches what you asked for. Your account may already
                  hold it, or you can see everything on it.
                </p>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ marginTop: 14 }}
                  onClick={() => setShowAll(true)}
                >
                  Show everything on my account
                </button>
              </div>
            ) : (
              <div
                role="radiogroup"
                aria-label="Choose a credential to add to your wallet"
                style={{ display: 'grid', gap: 14, marginBottom: 26 }}
              >
                {visibleCredentials.map((c) => {
                  const isSelected = selected === c.sessionId;
                  return (
                    <label
                      key={c.sessionId}
                      className={`credential-card${isSelected ? ' selected' : ''}`}
                      style={{ opacity: c.inWallet ? 0.7 : 1 }}
                    >
                      <input
                        className="checkbox"
                        type="radio"
                        name="credential"
                        value={c.sessionId}
                        checked={isSelected}
                        disabled={c.inWallet}
                        onChange={() => !c.inWallet && setSelected(c.sessionId)}
                      />
                      <div style={{ flex: 1 }}>
                        <h3>
                          {c.title} <span className="badge kind">{c.label}</span>
                        </h3>
                        <div className="meta">
                          {c.institution}
                          {c.degreeLevel ? ` · ${c.degreeLevel}` : ''}
                          {c.graduationDate ? ` · Graduated ${c.graduationDate}` : ''}
                        </div>
                        <div className="meta">
                          {c.holderName ? `${c.holderName} · ` : ''}Student ID {c.studentId}
                          {c.totalCredits ? ` · ${c.totalCredits} credits` : ''}
                          {c.courseCount ? ` · ${c.courseCount} modules` : ''}
                        </div>
                      </div>
                      {c.inWallet && <span className="badge ok">In wallet</span>}
                    </label>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="notice err" role="alert" style={{ marginBottom: 18 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-dark"
                onClick={handleStartIssuance}
                disabled={busy || !selected}
              >
                {busy
                  ? 'Preparing…'
                  : selectedCredential
                    ? `Add ${selectedCredential.label} to wallet`
                    : 'Add to wallet'}
              </button>
              <span className="muted">You must accept the terms to continue.</span>
            </div>

            {requestedKinds && !showAll && (
              <p style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowAll(true)}
                >
                  Show everything on my account
                </button>
              </p>
            )}
          </>
        )}

        {offer && (
          <>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              {isMobile && !showQr ? 'Add to your wallet' : 'Scan with your wallet'}
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 28 }}>
              {isMobile && !showQr
                ? 'Tap the button below to open the Quals wallet app and add this credential to your device.'
                : 'Open the Quals wallet app, scan this code, and your credential will be added to your device.'}
            </p>

            {isMobile && !showQr ? (
              <div className="panel" style={{ maxWidth: 520 }}>
                <a
                  href={offer.appLinkUrl || offer.offerUrl}
                  className="btn btn-dark"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Open in Quals wallet
                </a>
                <p className="muted" style={{ fontSize: 13, margin: '16px 0 0', lineHeight: 1.6 }}>
                  If the wallet does not open, make sure the Quals app is installed on this device.
                  You can also scan the code from another screen.
                </p>
                <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowQr(true)}>
                    Show QR code
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigator.clipboard.writeText(offer.offerUrl || '')}
                  >
                    Copy offer link
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setOffer(null);
                      if (token) loadCredentials(token).catch(() => undefined);
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {offer.qrDataUrl && (
                  <div className="qr-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={offer.qrDataUrl} alt="Credential offer QR code" />
                    <div className="qr-caption">Smart Academy · Quals wallet</div>
                  </div>
                )}
                <div style={{ maxWidth: 320, flex: '1 1 260px' }}>
                  <ol style={{ paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.9, fontSize: 14 }}>
                    <li>Open the Quals wallet app on your phone.</li>
                    <li>Choose to add a credential and scan this code.</li>
                    <li>Authenticate with your biometrics to store it.</li>
                  </ol>
                  <div style={{ marginTop: 18, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {isMobile && (
                      <a href={offer.appLinkUrl || offer.offerUrl} className="btn btn-dark">
                        Open in Quals wallet
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => {
                        setOffer(null);
                        if (token) loadCredentials(token).catch(() => undefined);
                      }}
                    >
                      Add another credential
                    </button>
                    {offer.offerUrl && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigator.clipboard.writeText(offer.offerUrl || '')}
                      >
                        Copy offer link
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {error && offer && (
          <div className="notice err" style={{ marginTop: 20 }}>
            {error}
          </div>
        )}

        <p className="muted" style={{ marginTop: 32 }}>
          <Link href="/">Back to Smart Academy</Link>
        </p>
      </div>
    </section>
  );
}

export default function ClaimPage() {
  return (
    <Suspense
      fallback={
        <section className="section">
          <div className="container-narrow">
            <p className="muted">Loading…</p>
          </div>
        </section>
      }
    >
      <ClaimFlow />
    </Suspense>
  );
}
