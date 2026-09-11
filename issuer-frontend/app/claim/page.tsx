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

  const [email, setEmail] = useState(invitedEmail);
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AcademyCredential[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [offer, setOffer] = useState<{ qrDataUrl?: string; offerUrl?: string } | null>(null);
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
        await loadCredentials(token);
        setError('That credential is already in your wallet.');
        return;
      }
      setOffer({ qrDataUrl: r.qrDataUrl, offerUrl: r.offerUrl });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
              Select a credential to add to your wallet. You can add the rest later.
            </p>

            {credentials.length === 0 ? (
              <div className="panel">
                <p className="muted" style={{ margin: 0 }}>
                  We could not find any credentials for {email}. Please check the address you used,
                  or contact the academy registry.
                </p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 14, marginBottom: 26 }}>
                {credentials.map((c) => {
                  const isSelected = selected === c.sessionId;
                  return (
                    <label
                      key={c.sessionId}
                      className={`credential-card${isSelected ? ' selected' : ''}`}
                      style={{ opacity: c.inWallet ? 0.7 : 1 }}
                    >
                      <input
                        className="checkbox"
                        type="checkbox"
                        checked={isSelected}
                        disabled={c.inWallet}
                        onChange={() => !c.inWallet && setSelected(c.sessionId)}
                      />
                      <div style={{ flex: 1 }}>
                        <h3>{c.title}</h3>
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
              <div className="notice err" style={{ marginBottom: 18 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-dark"
                onClick={handleStartIssuance}
                disabled={busy || !selected}
              >
                {busy ? 'Preparing…' : 'Start issuance'}
              </button>
              <span className="muted">You must accept the terms to continue.</span>
            </div>
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
                <a href={offer.offerUrl} className="btn btn-dark" style={{ width: '100%', justifyContent: 'center' }}>
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
                      <a href={offer.offerUrl} className="btn btn-dark">
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
