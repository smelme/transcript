'use client';

/**
 * Asking for a credential, for somebody the institution cannot identify from an address alone.
 *
 * This is the second door. The first one — the academy's — assumes the institution can recognise a
 * person from the address it holds, and for anybody it cannot, this is where they end up: they say
 * who they are, prove it with a document, say what they need, pay the fee, and wait while a person
 * checks the record.
 *
 * Three things shape the page.
 *
 * **It is phone-first and one question at a time.** The person using it is most likely holding a
 * phone, reading it because a paper process failed them, and has no reason to trust it yet.
 *
 * **It never claims more than it knows.** The period is stated where a person owns it, the states
 * are the five the applicant is told rather than the queue's vocabulary, and a failed check is
 * described as something to try again rather than as a verdict.
 *
 * **It resumes.** The applicant leaves for their document and comes back from a payment page, so the
 * handle to their case lives in local storage as well as the address bar, and returning lands them
 * on their own status rather than at the beginning.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import './request.css';

const STORAGE_KEY = 'quals-request';
const SCHOOLS = ['Smart Academy'];
const TERMS_VERSION = '2026-01';

type Wanted = 'qualification' | 'transcript' | 'both';
type Held = { requestId: string; token: string; email?: string };
type Fee = { amount: number; currency: string };
type Stage = 'details' | 'identity' | 'waiting' | 'review' | 'done' | 'status';

type StatusView = {
  requestId: string;
  school: string;
  status: 'received' | 'being-checked' | 'being-prepared' | 'sent' | 'declined';
  whatHappensNext?: string;
  dueAt?: string | null;
  overdue?: boolean;
  outcome?: string | null;
  reason?: string | null;
  issuedAt?: string | null;
  email?: string | null;
};

const WANTED_LABELS: Record<Wanted, string> = {
  both: 'Qualification and transcript',
  qualification: 'Qualification',
  transcript: 'Academic transcript',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Something went wrong (${response.status})`);
  }
  return data as T;
}

function money(fee?: Fee | null): string {
  if (!fee) return '—';
  return `${(fee.amount / 100).toFixed(2)} ${fee.currency.toUpperCase()}`;
}

function day(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toDateString();
}

export default function RequestPage() {
  const [stage, setStage] = useState<Stage>('details');
  const [held, setHeld] = useState<Held | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);
  const [workingDays, setWorkingDays] = useState(10);
  const [status, setStatus] = useState<StatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // What they entered, and what they are asking for.
  const [school, setSchool] = useState(SCHOOLS[0]);
  const [wanted, setWanted] = useState<Wanted>('both');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [identityProblem, setIdentityProblem] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);

  const store = useCallback((next: Held | null) => {
    setHeld(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // A browser with storage switched off still works; it just cannot resume.
    }
  }, []);

  const loadStatus = useCallback(async (current: Held) => {
    try {
      const view = await api<StatusView & { success: boolean }>(
        `/requests/${current.requestId}?token=${encodeURIComponent(current.token)}`,
      );
      setStatus(view);
      setStage('status');
    } catch (e) {
      // A handle that no longer resolves is no reason to strand anybody: start again.
      setError((e as Error).message);
      store(null);
      setStage('details');
    }
  }, [store]);

  const confirmPayment = useCallback(
    async (current: Held, sessionId: string | null) => {
      setBusy(true);
      setError(null);
      try {
        const done = await api<{ status: string; dueAt?: string | null; emailSent?: boolean }>(
          `/requests/${current.requestId}/payment/confirm`,
          {
            method: 'POST',
            body: JSON.stringify({ token: current.token, session_id: sessionId || undefined, termsVersion: TERMS_VERSION }),
          },
        );
        setStatus((previous) => ({
          ...(previous || { requestId: current.requestId, school: SCHOOLS[0], status: 'received' }),
          requestId: current.requestId,
          school,
          status: 'received',
          dueAt: done.dueAt || null,
        }));
        setStage('done');
      } catch (e) {
        setError((e as Error).message);
        setStage('review');
      } finally {
        setBusy(false);
      }
    },
    [school],
  );

  // What the applicant arrives with decides where they start: a return from the payment provider, a
  // link back to their own case, or nothing at all.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference');
    const token = params.get('token');
    const cancelled = params.get('cancelled');

    let remembered: Held | null = null;
    try {
      remembered = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch {
      remembered = null;
    }

    const current = reference && token ? { requestId: reference, token, email: remembered?.email } : remembered;
    if (remembered?.email) setEmail(remembered.email);
    if (!current) return;

    store(current);
    if (cancelled) setNotice('You did not finish paying, so nothing has been sent to the school yet.');
    if (params.get('paid')) {
      confirmPayment(current, params.get('session_id'));
      return;
    }
    loadStatus(current);
  }, [confirmPayment, loadStatus, store]);

  // Waiting on the document check. Polled rather than trusted to a redirect, because the provider
  // may send the browser anywhere once it is finished.
  useEffect(() => {
    if (stage !== 'waiting' || !held) return undefined;
    let stopped = false;

    const check = async () => {
      try {
        const result = await api<{ identityStatus: 'pending' | 'verified' | 'failed'; reason?: string | null }>(
          `/requests/${held.requestId}/identity?token=${encodeURIComponent(held.token)}`,
        );
        if (stopped) return;
        if (result.identityStatus === 'verified') {
          setIdentityProblem(null);
          setStage('review');
        } else if (result.identityStatus === 'failed') {
          setIdentityProblem(result.reason || 'We could not complete the check. You can try again.');
          setStage('identity');
        }
      } catch {
        // A poll that fails is not the applicant's problem: keep waiting and try again.
      }
    };

    const timer = window.setInterval(check, 3000);
    check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [stage, held]);

  const stepNumber = useMemo(() => (stage === 'details' ? 1 : stage === 'review' || stage === 'done' ? 3 : 2), [stage]);

  async function openRequest(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ requestId: string; token: string; fee: Fee; dueWorkingDays: number }>('/requests', {
        method: 'POST',
        body: JSON.stringify({ email, name, phone, school, wanted: [wanted] }),
      });
      store({ requestId: created.requestId, token: created.token, email });
      setFee(created.fee);
      setWorkingDays(created.dueWorkingDays);
      setStage('identity');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startIdentity() {
    if (!held) return;
    setBusy(true);
    setError(null);
    setIdentityProblem(null);
    try {
      const started = await api<{ url?: string | null; identityStatus: string }>(
        `/requests/${held.requestId}/identity`,
        { method: 'POST', body: JSON.stringify({ token: held.token }) },
      );
      // Opened rather than navigated: this page has to stay alive to notice the outcome, and a
      // second tab is easier to come back from than a lost one.
      if (started.url) window.open(started.url, '_blank', 'noopener');
      setStage('waiting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!held) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await api<{ checkoutUrl?: string | null; alreadyPaid?: boolean }>(
        `/requests/${held.requestId}/checkout`,
        { method: 'POST', body: JSON.stringify({ token: held.token }) },
      );
      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
        return;
      }
      await confirmPayment(held, null);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="req">
      <header className="req-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="req-mark" src="/quals-mark.svg" alt="" width={34} height={34} />
        <div className="req-brand">
          <b>Quals</b>
          <span>Verifiable credentials</span>
        </div>
        <div className="req-from">
          Requesting from {school}
          <small>Checked and issued by {school}</small>
        </div>
      </header>

      {stage !== 'status' && (
        <p className="req-eyebrow">
          Step {stepNumber} of 3 ·{' '}
          {stage === 'details' ? 'Your details' : stage === 'identity' || stage === 'waiting' ? 'Confirming who you are' : 'Review and pay'}
        </p>
      )}

      {error && (
        <div className="req-error" role="alert">
          {error}
        </div>
      )}
      {notice && <p className="req-note">{notice}</p>}

      {stage === 'details' && (
        <>
          <h1>Ask for your credentials</h1>
          <p className="req-lede">
            Use this if you studied with {school} more than five years ago, or if you are not sure
            whether we still hold a record for you. We will check with the school by hand, so it takes
            longer than collecting them from the school&rsquo;s own site — up to {workingDays} working
            days after you send this.
          </p>

          <form onSubmit={openRequest} className="req-form">
            <label className="req-field">
              <span>School</span>
              <select value={school} onChange={(e) => setSchool(e.target.value)}>
                {SCHOOLS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="req-field">
              <legend>What do you need?</legend>
              <div className="req-choices">
                {(Object.keys(WANTED_LABELS) as Wanted[]).map((option) => (
                  <label key={option} className={`req-choice${wanted === option ? ' chosen' : ''}`}>
                    <input
                      type="radio"
                      name="wanted"
                      value={option}
                      checked={wanted === option}
                      onChange={() => setWanted(option)}
                    />
                    <span>{WANTED_LABELS[option]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="req-field">
              <span>Your full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                placeholder="As it was when you studied"
              />
            </label>

            <label className="req-field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="Where we should send your credentials"
              />
              <small>This is where the credentials are sent, and we check it before you pay.</small>
            </label>

            <label className="req-field">
              <span>Phone number</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                placeholder="Optional, in case we need to reach you"
              />
            </label>

            <div className="req-actions">
              <button type="submit" className="req-btn" disabled={busy || !name.trim() || !email.trim()}>
                {busy ? 'Opening your request…' : 'Continue'}
              </button>
              <span className="req-note">Nothing is paid yet, and nothing is sent to the school yet.</span>
            </div>
          </form>
        </>
      )}

      {stage === 'identity' && (
        <>
          <h1>Confirm who you are</h1>
          <p className="req-lede">
            You will be asked for a photo identity document and a selfie. This is how the school can
            be sure the record it finds belongs to you, since we cannot check an address on its own
            for a record this old.
          </p>

          {identityProblem && <div className="req-error">{identityProblem}</div>}

          <ul className="req-list">
            <li>A passport, driving licence or national identity card</li>
            <li>A selfie taken during the check</li>
            <li>A few minutes and somewhere with reasonable light</li>
          </ul>

          <div className="req-actions">
            <button type="button" className="req-btn" onClick={startIdentity} disabled={busy}>
              {busy ? 'Opening the check…' : identityProblem ? 'Try the check again' : 'Start the check'}
            </button>
            <button type="button" className="req-btn req-btn-quiet" onClick={() => setStage('details')} disabled={busy}>
              Back
            </button>
          </div>
          <p className="req-note">
            We keep what the document says — your name, date of birth and the document number — for
            the school to check against its record. We do not keep a copy of the document itself.
          </p>
        </>
      )}

      {stage === 'waiting' && (
        <>
          <h1>Waiting for the check</h1>
          <p className="req-lede">
            Your document check is open in another tab. Once it is finished, this page will move on
            by itself &mdash; you can leave it open, or come back to it later.
          </p>
          <div className="req-pending" aria-live="polite">
            <span className="req-spinner" aria-hidden="true" />
            Checking with the identity provider…
          </div>
          <div className="req-actions">
            <button type="button" className="req-btn" onClick={() => setStage('review')} disabled={busy}>
              I have finished the check
            </button>
            <button type="button" className="req-btn req-btn-quiet" onClick={() => setStage('identity')}>
              Back
            </button>
          </div>
        </>
      )}

      {stage === 'review' && (
        <>
          <h1>Check this, then pay</h1>
          <p className="req-lede">
            {school} will check its record against what you have given us. We send it to them as soon
            as the fee is paid, and you will have an answer within {workingDays} working days.
          </p>

          <dl className="req-summary">
            <div>
              <dt>Name</dt>
              <dd>{name || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{email || '—'}</dd>
            </div>
            <div>
              <dt>School</dt>
              <dd>{school}</dd>
            </div>
            <div>
              <dt>Asked for</dt>
              <dd>{WANTED_LABELS[wanted]}</dd>
            </div>
            <div>
              <dt>Fee</dt>
              <dd>{money(fee)}</dd>
            </div>
            <div>
              <dt>Answer within</dt>
              <dd>
                {workingDays} working days
                {status?.dueAt ? ` · around ${day(status.dueAt)}` : ''}
              </dd>
            </div>
          </dl>

          <label className="req-terms">
            <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
            <span>
              I agree to hold these credentials in my wallet and to the terms of issue, and I understand
              the fee is for checking my record. If {school} cannot confirm it, the fee is returned.
            </span>
          </label>

          <div className="req-actions">
            <button type="button" className="req-btn" onClick={pay} disabled={busy || !termsAccepted}>
              {busy ? 'Taking you to the payment page…' : `Pay ${money(fee)} and send my request`}
            </button>
            <button type="button" className="req-btn req-btn-quiet" onClick={() => setStage('identity')} disabled={busy}>
              Back
            </button>
          </div>
          <p className="req-note">
            Payment is handled by our payment provider; your card details never reach us. Sending the
            request starts the {workingDays} working days.
          </p>
        </>
      )}

      {stage === 'done' && held && (
        <>
          <h1>Your request has been sent</h1>
          <p className="req-lede">
            {school} has your request. They check the record, and when they have confirmed it we issue
            your credentials and email you a link to collect them.
          </p>
          <dl className="req-summary">
            <div>
              <dt>Reference</dt>
              <dd className="req-mono">{held.requestId}</dd>
            </div>
            <div>
              <dt>Goes to</dt>
              <dd>{email || 'the address you gave us'}</dd>
            </div>
            <div>
              <dt>Answer within</dt>
              <dd>
                {workingDays} working days
                {status?.dueAt ? ` · around ${day(status.dueAt)}` : ''}
              </dd>
            </div>
          </dl>
          <div className="req-actions">
            <button type="button" className="req-btn" onClick={() => held && loadStatus(held)} disabled={busy}>
              See the status of this request
            </button>
          </div>
          <p className="req-note">
            Keep the reference. If the school cannot confirm your record, they will tell us, we will
            tell you, and the fee is returned.
          </p>
        </>
      )}

      {stage === 'status' && status && (
        <>
          <h1>{status.whatHappensNext || 'Your request'}</h1>
          <dl className="req-summary">
            <div>
              <dt>Reference</dt>
              <dd className="req-mono">{status.requestId}</dd>
            </div>
            <div>
              <dt>School</dt>
              <dd>{status.school}</dd>
            </div>
            <div>
              <dt>Where it is</dt>
              <dd className={`req-state req-state-${status.status}`}>{status.status.replace(/-/g, ' ')}</dd>
            </div>
            {status.dueAt && (
              <div>
                <dt>Answer within</dt>
                <dd>
                  {day(status.dueAt)}
                  {status.overdue ? ' · taking longer than promised, and we know' : ''}
                </dd>
              </div>
            )}
            {status.reason && (
              <div>
                <dt>What the school said</dt>
                <dd>{status.reason}</dd>
              </div>
            )}
          </dl>

          {status.status === 'sent' && (
            <div className="req-actions">
              <a className="req-btn req-btn-link" href={status.email ? `/issue?email=${encodeURIComponent(status.email)}` : '/issue'}>
                Collect your credentials
              </a>
            </div>
          )}
          {status.status === 'declined' && (
            <p className="req-note">
              If something here is wrong — a different name, an address we may have lost — you can
              ask again, and a person will look at it.
            </p>
          )}
          <div className="req-actions">
            <button
              type="button"
              className="req-btn req-btn-quiet"
              onClick={() => {
                store(null);
                setStage('details');
                window.history.replaceState(null, '', '/request');
              }}
            >
              Start a new request
            </button>
          </div>
        </>
      )}
    </div>
  );
}
