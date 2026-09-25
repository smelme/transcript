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
  reissued?: boolean;
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'loading' | 'signin' | 'code' | 'ready' | 'issued'>('loading');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInvitationId(params.get('invitation') || '');
    setToken(params.get('token') || '');
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
      const res = await fetch(`/api/issuance/invitations/${encodeURIComponent(invitationId)}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'We could not send the code');
      setEmail(data.email);
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

  async function takeOffer(sessionId: string) {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/issuance/items/${encodeURIComponent(sessionId)}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ termsAccepted: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'We could not prepare the credential');
      setOffer(data);
      if (invitationId) {
        await fetch(`/api/issuance/invitations/${encodeURIComponent(invitationId)}/claimed`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => undefined);
      }
      await loadItems(accessToken).catch(() => undefined);
      setStage('issued');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
          <button className="btn btn-primary" onClick={sendCode} disabled={busy || !invitationId}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
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
            They stay in your wallet, signed by the institution that issued them. Adding one does not
            send it anywhere.
          </p>
          {items.length === 0 && (
            <p className="issue-note">Nothing is waiting for this address. Ask your institution to publish again.</p>
          )}
          <ul className="issue-list">
            {items.map((item) => (
              <li key={item.sessionId} className="issue-item">
                <div className="issue-item-head">
                  <h2>{item.title}</h2>
                  {item.label && <span className="badge kind">{item.label}</span>}
                  {item.inWallet && <span className="badge ok">In your wallet</span>}
                </div>
                {subtitleFor(item) && <p className="issue-item-sub">{subtitleFor(item)}</p>}
                {item.holderName && <p className="issue-item-sub">Issued to {item.holderName}</p>}
                <label className="issue-terms">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                  />
                  I agree to hold this credential in my wallet and to the terms of issue.
                </label>
                <button
                  className="btn btn-primary"
                  onClick={() => takeOffer(item.sessionId)}
                  disabled={busy || !termsAccepted}
                >
                  {item.inWallet ? 'Add another copy' : 'Add to my wallet'}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {stage === 'issued' && offer && (
        <>
          <h1>{offer.reissued ? 'Add another copy' : 'Add it to your wallet'}</h1>
          <p className="issue-lede">
            Scan this with your Quals wallet, or open it directly if the wallet is on this device. The
            code expires quickly, so use it now.
          </p>
          <div className="issue-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={offer.qrDataUrl} alt="QR code for the credential offer" width={240} height={240} />
          </div>
          <div className="issue-actions">
            {offer.appLinkUrl && (
              <a className="btn btn-primary" href={offer.appLinkUrl}>
                Open in the Quals wallet
              </a>
            )}
            <button className="btn" onClick={() => setStage('ready')}>
              Back to my credentials
            </button>
          </div>
          <p className="issue-note">
            Nothing was shared with anybody by adding this. Sharing is a separate step you take later,
            from the wallet.
          </p>
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
