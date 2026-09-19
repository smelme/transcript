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
   * What the applicant asked for, carried in the link by the request step. Compared against the
   * namespaces a credential holds, not against its kind: a combined credential is one document
   * holding both, so it answers a request for either one - and a student part-way through a
   * programme who asked for both is shown the transcript-only credential they actually hold.
   */
  const requestedNamespaces = (() => {
    const include = (params.get('include') || '').trim().toLowerCase();
    if (include === 'both') {
      return [
        'org.iso.23220.education.qualification.1',
        'org.iso.23220.education.transcript.1',
      ];
    }
    if (include === 'transcript') return ['org.iso.23220.education.transcript.1'];
    if (include === 'qualification') return ['org.iso.23220.education.qualification.1'];
    return null;
  })();
  const [showAll, setShowAll] = useState(false);

  const [email, setEmail] = useState(invitedEmail);
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<AcademyCredential[] | null>(null);
  /** Everything ticked on step 2. Both is the usual answer, so this is a list, not a choice. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Still to hand over, in order. The wallet claims one offer per scan, so they are walked
   *  through one at a time rather than pretending a single action adds them all. */
  const [queue, setQueue] = useState<string[]>([]);
  /** The credential whose offer is currently on screen. */
  const [current, setCurrent] = useState<string | null>(null);
  /** Handed over in this visit, including any the wallet already held. */
  const [added, setAdded] = useState<string[]>([]);
  const [offer, setOffer] = useState<{ qrDataUrl?: string; offerUrl?: string; appLinkUrl?: string | null } | null>(null);
  /** True when the offer on screen issues another copy of a credential the wallet already holds. */
  const [reissued, setReissued] = useState(false);
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
    // Tick everything not already in the wallet: a holder asking for a transcript usually asked
    // for the qualification too, and the previous behaviour of adding one per visit meant
    // starting over for the second.
    const available = (list.credentials || []).filter((c) => !c.inWallet).map((c) => c.sessionId);
    setSelectedIds((currentSelection) => {
      const kept = currentSelection.filter((id) => available.includes(id));
      return kept.length ? kept : available;
    });
  }, []);

  /** What the holder is being shown: what they asked for, unless they asked to see everything. */
  const visibleCredentials = (credentials || []).filter(
    (credential) =>
      showAll ||
      !requestedNamespaces ||
      (credential.academicNamespaces || []).some((namespace) =>
        requestedNamespaces.includes(namespace),
      ),
  );

  // Keep the selection on what is on screen: after filtering, a previously ticked credential may
  // no longer be shown. The state is only replaced when something actually changed, so this cannot
  // loop.
  useEffect(() => {
    if (!credentials) return;
    // Everything on screen stays selectable, including a credential the wallet already holds:
    // asking for it again is how a holder gets a copy onto another device, or replaces one they
    // no longer have.
    const selectable = new Set(visibleCredentials.map((c) => c.sessionId));
    setSelectedIds((currentSelection) => {
      const kept = currentSelection.filter((id) => selectable.has(id));
      return kept.length === currentSelection.length ? currentSelection : kept;
    });
  }, [credentials, showAll]);

  /** Tick or untick one credential. */
  function toggle(sessionId: string) {
    setSelectedIds((currentSelection) =>
      currentSelection.includes(sessionId)
        ? currentSelection.filter((id) => id !== sessionId)
        : [...currentSelection, sessionId],
    );
  }

  /** The credentials that can be ticked right now: all of them, whether the wallet holds one or not. */
  const selectableCredentials = visibleCredentials;

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

  /**
   * Ask the issuer for the next credential's offer.
   *
   * One at a time by necessity: a wallet claims a single offer per scan, so the holder is walked
   * through their selection instead of the page pretending one action adds them all. A credential
   * the wallet already holds is recorded and skipped rather than stopping the run, and a failure
   * keeps the rest of the queue so nothing has to be reselected.
   */
  async function startNext(remaining: string[], alreadyAdded: string[]) {
    if (!token || !remaining.length) return;
    setBusy(true);
    setError(null);
    setReissued(false);
    const done = [...alreadyAdded];
    let rest = remaining;
    try {
      while (rest.length) {
        const [next, ...tail] = rest;
        setCurrent(next);
        const r = await createAcademyOffer(next, token);
        if (!r.success) throw new Error(r.error || 'Could not start the issuance');
        setAdded(done);
        setQueue(tail);
        setOffer({ qrDataUrl: r.qrDataUrl, offerUrl: r.offerUrl, appLinkUrl: r.appLinkUrl });
        // A credential the wallet already holds is issued again rather than skipped: the holder
        // asked for it, and a copy they no longer want can be revoked from the portal.
        setReissued(Boolean(r.reissued));
        return;
      }
      // Everything selected was already held: nothing left to hand over.
      setAdded(done);
      setQueue([]);
      setCurrent(null);
      setOffer(null);
    } catch (err) {
      setError((err as Error).message);
      setQueue(rest);
      // A failure for one credential must not lose the others: keep them queued and refresh the
      // list so the holder can see what is still available.
      await loadCredentials(token).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  /** Start handing over everything ticked on step 2. */
  async function handleStartAdding() {
    if (!token || !selectedIds.length) return;
    setAdded([]);
    setError(null);
    await startNext(selectedIds, []);
  }

  /** The holder has added the credential on screen: move to the next one, or finish. */
  async function handleAddedCurrent() {
    if (!token || busy) return;
    setBusy(true);
    const done = current ? [...added, current] : added;
    setAdded(done);
    setOffer(null);
    setCurrent(null);
    try {
      await loadCredentials(token).catch(() => undefined);
      if (queue.length) {
        await startNext(queue, done);
      } else {
        setQueue([]);
      }
    } finally {
      setBusy(false);
    }
  }

  /** Go back to the list without losing the rest of the queue. */
  function handleBackToSelection() {
    if (current) setQueue((pending) => [current, ...pending]);
    setOffer(null);
    setCurrent(null);
    if (token) loadCredentials(token).catch(() => undefined);
  }

  /** How many credentials this visit covers, and where the holder is in that list. */
  const totalThisVisit = added.length + (current ? 1 : 0) + queue.length;
  const positionThisVisit = current ? added.length + 1 : added.length;
  const finished = added.length > 0 && !offer && !queue.length && !current;
  const step = offer || finished ? 3 : credentials ? 2 : codeSent ? 2 : 1;

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

        {credentials && !offer && !finished && (
          <>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              Your credentials
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 28 }}>
              {requestedNamespaces && !showAll
                ? `You asked for ${requestedNamespaces.length > 1 ? 'your qualification and transcript' : requestedNamespaces[0] === 'org.iso.23220.education.transcript.1' ? 'an academic transcript' : 'your qualification certificate'}. Tick what you want and add it — a completed programme comes as one credential holding both.`
                : 'Tick what you want to add. A completed programme is one credential holding both.'}
            </p>

            {credentials.length === 0 ? (
              <div className="panel">
                <p className="muted" style={{ margin: 0 }}>
                  We could not find any credentials for {email}. Check the address you used, and
                  note that credentials can only be claimed at the address the academy holds on
                  your record.
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
                role="group"
                aria-label="Choose the credentials to add to your wallet"
                style={{ display: 'grid', gap: 14, marginBottom: 26 }}
              >
                {selectableCredentials.length > 1 && (
                  <p style={{ margin: 0 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() =>
                        setSelectedIds(
                          selectedIds.length === selectableCredentials.length
                            ? []
                            : selectableCredentials.map((credential) => credential.sessionId),
                        )
                      }
                    >
                      {selectedIds.length === selectableCredentials.length
                        ? 'Clear selection'
                        : `Select all ${selectableCredentials.length}`}
                    </button>
                  </p>
                )}
                {visibleCredentials.map((c) => {
                  const isSelected = selectedIds.includes(c.sessionId);
                  return (
                    <label
                      key={c.sessionId}
                      className={`credential-card${isSelected ? ' selected' : ''}`}
                    >
                      <input
                        className="checkbox"
                        type="checkbox"
                        value={c.sessionId}
                        checked={isSelected}
                        onChange={() => toggle(c.sessionId)}
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
                      {c.inWallet && <span className="badge ok">In wallet · add again</span>}
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
                onClick={handleStartAdding}
                disabled={busy || selectedIds.length === 0}
              >
                {busy
                  ? 'Preparing…'
                  : selectedIds.length > 1
                    ? `Add ${selectedIds.length} credentials to wallet`
                    : selectedIds.length === 1
                      ? `Add ${labelFor(selectedIds[0])} to wallet`
                      : 'Add to wallet'}
              </button>
              <span className="muted">
                {selectedIds.length > 1
                  ? 'The wallet takes one credential at a time, so you will be taken through each in turn.'
                  : 'You must accept the terms to continue.'}
              </span>
            </div>

            {requestedNamespaces && !showAll && (
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
              {totalThisVisit > 1 && (
                <>
                  <strong>
                    Credential {positionThisVisit} of {totalThisVisit}
                  </strong>{' '}
                  — {labelFor(current)}.{' '}
                </>
              )}
              {isMobile && !showQr
                ? 'Tap the button below to open the Quals wallet app and add this credential to your device.'
                : 'Open the Quals wallet app, scan this code, and your credential will be added to your device.'}
            </p>

            {reissued && (
              <div className="notice" style={{ marginBottom: 18 }}>
                This credential is already in your wallet. Adding it now issues a new copy — the
                one you already hold stays valid until your institution revokes it.
              </div>
            )}

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
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={handleAddedCurrent}
                    disabled={busy}
                  >
                    {busy
                      ? 'Preparing…'
                      : queue.length
                        ? `Added it — next: ${labelFor(queue[0])}`
                        : 'Added it — finish'}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setShowQr(true)}>
                    Show QR code
                  </button>
                  <button type="button" className="btn btn-outline" onClick={handleBackToSelection}>
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {offer.qrDataUrl && (
                  <div className="qr-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={offer.qrDataUrl} alt="QR code to add this credential to your wallet" />
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
                      className="btn btn-dark"
                      onClick={handleAddedCurrent}
                      disabled={busy}
                    >
                      {busy
                        ? 'Preparing…'
                        : queue.length
                          ? `Added it — next: ${labelFor(queue[0])}`
                          : 'Added it — finish'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleBackToSelection}
                    >
                      Back
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {finished && (
          <>
            <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>
              That is everything
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: 'var(--muted)', marginBottom: 28 }}>
              {added.length > 1
                ? 'Both credentials are on your device.'
                : 'Your credential is on your device.'}
            </p>
            <div className="panel">
              <h3 style={{ marginTop: 0 }}>In your wallet</h3>
              <ul style={{ margin: '0 0 14px', paddingLeft: 18, lineHeight: 1.9 }}>
                {added.map((sessionId) => (
                  <li key={sessionId}>{labelFor(sessionId)}</li>
                ))}
              </ul>
              <p className="muted" style={{ marginBottom: 0 }}>
                Open the Quals wallet app to see them. This link keeps working, so you can come back
                if you need to add something else.
              </p>
            </div>
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
