'use client';

/**
 * The issuing page: where a credential the institution published is collected.
 *
 * It belongs to Quals, not to the institution, because the wallet and the credential do: the
 * institution publishes, and the person who holds the credential collects it here. The page is
 * reached two ways, and both are the same page: from the link the issuer emailed, or from the
 * institution redirecting somebody it just published for.
 *
 * Signing in is by a code to the address the institution supplied. Opening the link proves the
 * holder was given it, not who they are, so everything after it still needs the address to be
 * proved by a code. A stronger check is a later concern and this page does not imply one.
 */

import { useCallback, useEffect, useState } from 'react';
import './issue.css';

type Preview = {
  institution: string;
  holderEmail: string;
  holderName?: string | null;
  expiresAt?: string | null;
  status?: string;
};

type Item = {
  sessionId: string;
  status: string;
  inWallet: boolean;
  kind?: string | null;
  label?: string | null;
  title: string;
  institution?: string | null;
  degreeLevel?: string | null;
  fieldOfStudy?: string | null;
  graduationDate?: string | null;
  totalCredits?: string | number | null;
  courseCount?: number | null;
  holderName?: string | null;
};

type Offer = {
  sessionId: string;
  offerUrl: string;
  qrDataUrl: string;
  appLinkUrl?: string | null;
  label?: string | null;
};

/**
 * What the issuer answers when the holder says they are finished: its own records, item by item,
 * plus what it has stopped holding as a result.
 */
type Settled = {
  success: boolean;
  items: {
    sessionId: string;
    title: string;
    degreeLevel?: string | null;
    graduationDate?: string | null;
    inWallet: boolean;
    credentialId?: string | null;
    recordedAt?: string | null;
  }[];
  allInWallet: boolean;
  mdocsForgotten: number;
  error?: string;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Dates arrive as `YYYY-MM-DD` or `YYYYMMDD`; a reader wants one shape. */
function formatDate(value?: string | null): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/) || value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return value;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return value;
  return `${day} ${MONTH_NAMES[month]} ${match[1]}`;
}

export default function IssuePage() {
  const [invitationId, setInvitationId] = useState('');
  const [token, setToken] = useState('');
  const [emailFromLink, setEmailFromLink] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerIndex, setOfferIndex] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'loading' | 'signin' | 'code' | 'ready' | 'collecting' | 'done'>('loading');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInvitationId(params.get('invitation') || '');
    setToken(params.get('token') || '');
    // An institution may redirect somebody here with the address it holds, instead of sending a
    // link. That is the same journey, so it works here rather than on a second page.
    setEmailFromLink(params.get('email') || '');
  }, []);

  const loadPreview = useCallback(async () => {
    if (!invitationId) {
      setStage('signin');
      // No invitation in the address: somebody arrived without a link, which is what a redirect
      // from an institution looks like when it could not carry one. They sign in with the address
      // the institution holds, and the credentials waiting for it are listed the same way.
      return;
    }
    try {
      const res = await fetch(
        `/api/issuance/invitations/${encodeURIComponent(invitationId)}?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' },
      );
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'This invitation is not available');
      setPreview(data);
      setStage('signin');
    } catch (e) {
      setError((e as Error).message);
      setStage('signin');
    }
  }, [invitationId, token]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      // With an invitation the token authorises the send and the address is the one the
      // institution published for. Without one, the address came in the link and the code is what
      // proves the holder controls it, which is the same proof either way.
      const res = invitationId
        ? await fetch(`/api/issuance/invitations/${encodeURIComponent(invitationId)}/otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          })
        : await fetch('/api/auth/otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailFromLink, audience: 'academy' }),
          });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'We could not send the code');
      setEmail(data.email || emailFromLink);
      setDevOtp(data.otp || null);
      setOtpSent(true);
      setStage('code');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'That code was not accepted');
      setAccessToken(data.accessToken);
      await loadItems(data.accessToken);
      setStage('ready');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadItems(bearer: string) {
    const path = invitationId
      ? `/api/issuance/invitations/${encodeURIComponent(invitationId)}/items`
      : '/api/academy/credentials';
    const res = await fetch(path, { headers: { Authorization: `Bearer ${bearer}` }, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'We could not load your credentials');
    setItems(data.credentials || []);
  }

  function toggle(sessionId: string) {
    setSelected((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId],
    );
  }

  /**
   * One offer per chosen credential, made in turn.
   *
   * The holder chooses once and accepts the terms once, but a credential arrives in a wallet on its
   * own offer, so the codes come one at a time on the next screen rather than all at once.
   */
  async function collectSelected() {
    if (!accessToken || selected.length === 0) {return;}
    setBusy(true);
    setError(null);
    try {
      const made: Offer[] = [];
      for (const sessionId of selected) {
        const res = await fetch(`/api/issuance/items/${encodeURIComponent(sessionId)}/offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ termsAccepted: true }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'We could not prepare one of these credentials');
        }
        made.push(data);
      }
      setOffers(made);
      setOfferIndex(0);
      if (invitationId) {
        await fetch(`/api/issuance/invitations/${encodeURIComponent(invitationId)}/claimed`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => undefined);
      }
      await loadItems(accessToken).catch(() => undefined);
      setStage('collecting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const current = offers[offerIndex];
  // The offer carries machine names, so what the holder is shown comes from the item they chose.
  const currentItem = items.find((item) => item.sessionId === current?.sessionId);

  /**
   * The end of the flow. The holder saying "done" is not evidence that anything arrived, so this
   * asks the issuer to read its own records: it checks the session and the row the issue was
   * recorded in. Only when everything chosen is in the wallet is the collection finished.
   */
  async function confirmCollection() {
    if (!accessToken || selected.length === 0) {return;}
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/issuance/collection/confirmed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sessionIds: selected }),
      });
      const data = (await res.json()) as Settled;
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'We could not check that just now');
      }
      setSettled(data);
      if (data.allInWallet) {setStage('done');}
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  /** What the issuer could not see in the wallet yet, asked before telling anybody it failed. */
  const notArrived = settled?.items.filter((item) => !item.inWallet) ?? [];

  /**
   * Whether an item can still be added.
   *
   * A credential that has already been added is finished: the issuer handed the document over when
   * the wallet collected it and keeps no copy, so a second one is the institution's decision rather
   * than a button on this page (P0-44). Offering it here would only lead to a refusal.
   */
  const offerable = (item: Item) => item.status !== 'issued';
  const offerableItems = items.filter(offerable);

  const subtitleFor = (item: Item) => {
    const parts: string[] = [];
    if (item.degreeLevel) parts.push(item.degreeLevel);
    if (item.graduationDate) parts.push(`Graduated ${formatDate(item.graduationDate)}`);
    if (item.totalCredits != null) parts.push(`${item.totalCredits} credits`);
    if (item.courseCount != null) parts.push(`${item.courseCount} courses`);
    return parts.join(' · ');
  };

  return (
    <div className="issue">
      <header className="issue-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="issue-mark" src="/quals-mark.svg" alt="" width={34} height={34} />
        <div className="issue-brand">
          <b>Quals</b>
          <span>Verifiable credentials</span>
        </div>
        {preview?.institution && (
          <div className="issue-from">
            From {preview.institution}
            {preview.expiresAt && <small>Available until {formatDate(preview.expiresAt.slice(0, 10))}</small>}
          </div>
        )}
      </header>

      {stage === 'loading' && <p className="muted">Loading…</p>}

      {stage === 'signin' && (
        <>
          <h1>{preview ? `${preview.institution} has prepared your credentials` : 'Collect your credentials'}</h1>
          <p className="issue-lede">
            {preview
              ? 'These were published for you by your institution. Sign in with the address they were sent to and we will email you a code.'
              : 'Sign in with the address your institution holds for you, and we will email you a code.'}
          </p>
          {preview?.holderEmail && (
            <p className="issue-note">
              The code goes to <b>{preview.holderEmail}</b>.
            </p>
          )}
          {!preview && emailFromLink && (
            <p className="issue-note">
              The code goes to <b>{emailFromLink}</b>.
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={sendCode}
            disabled={busy || !(invitationId || emailFromLink)}
          >
            {busy ? 'Sending…' : 'Send me a code'}
          </button>

          {/* The other door. Anybody whose record is older than the window will not get a code
              whatever they type here, so the way out is offered before they are stuck rather than
              after a failed attempt. */}
          <p className="issue-note">
            Nothing prepared for you, or it is longer ago than five years?{' '}
            <a href={`/request${emailFromLink ? `?email=${encodeURIComponent(emailFromLink)}` : ''}`}>
              Ask us for your credentials
            </a>{' '}
            — you confirm your identity, tell us what you need, and the school checks its record by
            hand.
          </p>
        </>
      )}

      {stage === 'code' && (
        <>
          <h1>Enter your code</h1>
          <p className="issue-lede">
            We sent a code to <b>{email}</b>. It is good for one use.
          </p>
          <div className="field">
            <label htmlFor="otp">Code</label>
            <input
              id="otp"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          {devOtp && (
            <p className="issue-note">
              Dev code (email not configured): <b>{devOtp}</b>
            </p>
          )}
          <div className="issue-actions">
            <button className="btn btn-primary" onClick={verify} disabled={busy || !otp}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <button className="btn" onClick={sendCode} disabled={busy || !otpSent}>
              Send another code
            </button>
          </div>
        </>
      )}

      {stage === 'ready' && (
        <>
          <h1>{items.length === 1 ? 'Your credential is ready' : 'Your credentials are ready'}</h1>
          <p className="issue-lede">
            Choose the ones you would like in your wallet. They stay there, signed by the institution
            that issued them, and adding one does not send it anywhere.
          </p>
          {items.length === 0 && (
            <p className="issue-note">
              Nothing is waiting for this address. If you were expecting a credential, check that
              your institution used this address, or ask them to publish again.
            </p>
          )}
          {items.length > 0 && (
            <>
              <ul className="issue-list">
                {items.map((item) => (
                  <li key={item.sessionId} className="issue-item">
                    {offerable(item) ? (
                      <label className="issue-choice">
                        <input
                          type="checkbox"
                          checked={selected.includes(item.sessionId)}
                          onChange={() => toggle(item.sessionId)}
                        />                        <span>
                          <span className="issue-item-head">
                            <strong>{item.title}</strong>
                            {item.label && <span className="badge kind">{item.label}</span>}
                          </span>
                          {subtitleFor(item) && (
                            <span className="issue-item-sub">{subtitleFor(item)}</span>
                          )}
                          {item.holderName && (
                            <span className="issue-item-sub">Issued to {item.holderName}</span>
                          )}
                        </span>
                      </label>
                    ) : (
                      <span className="issue-choice">
                        <span>
                          <span className="issue-item-head">
                            <strong>{item.title}</strong>
                            {item.label && <span className="badge kind">{item.label}</span>}
                            <span className="badge ok">In your wallet</span>
                          </span>
                          {subtitleFor(item) && (
                            <span className="issue-item-sub">{subtitleFor(item)}</span>
                          )}
                          <span className="issue-item-sub">
                            Ask your institution if you need another copy.
                          </span>
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {offerableItems.length === 0 ? (
                <p className="issue-note">
                  Everything above is already in your wallet. Ask your institution if you need another
                  copy.
                </p>
              ) : (
                <>
                  <label className="issue-terms">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    I agree to hold these credentials in my wallet and to the terms of issue.
                  </label>

                  <div className="issue-actions">
                    <button
                      className="btn btn-primary"
                      onClick={collectSelected}
                      disabled={busy || !termsAccepted || selected.length === 0}
                    >
                      {/* Nothing selected reads as "Add to wallet" rather than "Add 0 to wallet": the
                          button is disabled until something is chosen, so a count of nought is never
                          an instruction. */}
                      {busy
                        ? 'Preparing…'
                        : selected.length > 1
                          ? `Add ${selected.length} to wallet`
                          : 'Add to wallet'}
                    </button>
                    <button
                      className="btn"
                      onClick={() => setSelected(offerableItems.map((item) => item.sessionId))}
                      disabled={busy || selected.length === offerableItems.length}
                    >
                      Select all
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {stage === 'collecting' && current && (
        <>
          <span className="issue-eyebrow">
            Credential {offerIndex + 1} of {offers.length}
          </span>
          <h1>Add it to your wallet</h1>
          <p className="issue-lede">
            Scan this with your Quals wallet, or open it directly if the wallet is on this device. The
            code expires quickly, so use it now.
          </p>
          <div className="issue-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.qrDataUrl}
              alt="QR code for the credential offer"
              width={240}
              height={240}
            />
          </div>
          <div className="issue-actions">
            {current.appLinkUrl && (
              <a className="btn btn-primary" href={current.appLinkUrl}>
                Open in the Quals wallet
              </a>
            )}
            {offerIndex + 1 < offers.length ? (
              <button className="btn" onClick={() => setOfferIndex(offerIndex + 1)}>
                Next credential ({offerIndex + 2} of {offers.length})
              </button>
            ) : (
              <button className="btn" onClick={confirmCollection} disabled={checking}>
                {checking ? 'Checking…' : 'Done'}
              </button>
            )}
          </div>
          {notArrived.length > 0 && (
            <p className="issue-note">
              Not in your wallet yet: {notArrived.map((item) => item.title).join(', ')}. If your
              wallet is still finishing, give it a moment and choose Done again. Nothing is lost by
              waiting.
            </p>
          )}
          {currentItem && (
            <p className="issue-note">
              You are adding: {currentItem.title}
              {currentItem.label ? ` · ${currentItem.label}` : ''}
            </p>
          )}
          <p className="issue-note">
            Nothing was shared with anybody by adding this. Sharing is a separate step you take later,
            from the wallet.
          </p>
        </>
      )}

      {/*
        The end of the flow, and nothing more than that. What the issuer does with its own records,
        and why it no longer holds a copy, is our business rather than the holder's: they asked for
        a credential, it arrived, and the screen says so in as many words as that takes.
      */}
      {stage === 'done' && settled && (
        <>
          <span className="issue-eyebrow">Thank you</span>
          <h1>All done</h1>
          <p className="issue-lede">
            {settled.items.length === 1
              ? 'Your credential is in your wallet.'
              : 'Your credentials are in your wallet.'}
          </p>

          <ul className="issue-list">
            {settled.items.map((item) => (
              <li key={item.sessionId} className="issue-item">
                <span className="issue-item-head">
                  <strong>{item.title}</strong>
                  <span className="badge ok">In your wallet</span>
                </span>
                {item.graduationDate && (
                  <span className="issue-item-sub">Graduated {formatDate(item.graduationDate)}</span>
                )}
              </li>
            ))}
          </ul>

          <p className="issue-note">You can close this page.</p>
        </>
      )}

      {error && (
        <div className="issue-error">
          <span className="badge err">Error</span> <span className="mono">{error}</span>
        </div>
      )}
    </div>
  );
}
