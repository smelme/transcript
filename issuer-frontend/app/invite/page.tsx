'use client';

import { useState } from 'react';
import {
  inviteWallet,
  createIssuanceSession,
  acceptIssuanceTerms,
  getOfferQr,
  type InvitationResult,
  type IssuanceSessionResult,
} from '../lib/api';

export default function InvitePage() {
  const [email, setEmail] = useState('');
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('Erika Mustermann');
  const [dateOfBirth, setDateOfBirth] = useState('1964-08-12');
  const [documentNumber, setDocumentNumber] = useState('Z021AB37X13');
  const [degreeLevel, setDegreeLevel] = useState('Bachelor');
  const [graduationDate, setGraduationDate] = useState('2025-06-30');
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<InvitationResult | null>(null);
  const [session, setSession] = useState<IssuanceSessionResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInvite(null);
    try {
      const r = await inviteWallet({ email, studentId });
      if (r.success) setInvite(r);
      else setError(r.error || 'Invitation failed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSession(null);
    setQrDataUrl(null);
    setTermsAccepted(false);
    try {
      const r = await createIssuanceSession({
        studentId,
        credentialData: {
          docType: 'org.iso.23220.photoid.1',
          full_name: fullName,
          date_of_birth: dateOfBirth,
          document_number: documentNumber,
          issuing_authority: 'Smart College',
          issue_date: '2025-03-24',
          expiry_date: '2031-03-24',
          issuing_country: 'NL',
          education_qualification: {
            institution_name: 'Smart College',
            degree_level: degreeLevel,
            graduation_date: graduationDate,
          },
        },
      });
      if (r.success) {
        setSession(r);
        if (r.sessionId) {
          const qr = await getOfferQr(r.sessionId);
          if (qr.success && qr.qrDataUrl) setQrDataUrl(qr.qrDataUrl);
        }
      } else {
        setError(r.error || 'Session creation failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptTerms() {
    if (!session?.sessionId) return;

    setBusy(true);
    setError(null);
    try {
      const r = await acceptIssuanceTerms(session.sessionId);
      if (r.success) {
        setSession((current) => current ? { ...current, status: r.status } : current);
        setTermsAccepted(true);
      } else {
        setError(r.error || 'Terms acceptance failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card">
        <h1>Invite Wallet Account</h1>
        <p className="muted">
          Invite a student by email + student ID. The invitation creates (or links) a wallet
          account and sends a one-time code.
        </p>
        <form onSubmit={handleInvite}>
          <div className="grid">
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label>Student ID</label>
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
            </div>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </form>
        {invite && (
          <div className="result-box" style={{ marginTop: 12 }}>
            <span className="badge ok">Invited</span>
            <div className="kv">
              <b>Wallet subject:</b> <span className="mono">{invite.sub}</span>
            </div>
            <div className="kv">
              <b>Account created:</b> {invite.accountCreated ? 'yes' : 'no (existing)'} ·{' '}
              <b>Link added:</b> {invite.linkAdded ? 'yes' : 'no (already linked)'}
            </div>
            {invite.otp && (
              <div className="kv">
                <b>Dev code (email not configured):</b> <span className="mono">{invite.otp}</span>
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="result-box" style={{ marginTop: 12 }}>
            <span className="badge err">Error</span>
            <div className="mono">{error}</div>
          </div>
        )}
      </div>

      <div className="card">
        <h1>Create Issuance Session</h1>
        <p className="muted">
          Create an issuance session for a student. The wallet scans the resulting offer URL and
          receives the credential directly.
        </p>
        <form onSubmit={handleCreateSession}>
          <div className="grid">
            <div className="field">
              <label>Student ID</label>
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} required />
            </div>
            <div className="field">
              <label>Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="field">
              <label>Date of birth</label>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div className="field">
              <label>Document number</label>
              <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
            </div>
            <div className="field">
              <label>Degree level</label>
              <input value={degreeLevel} onChange={(e) => setDegreeLevel(e.target.value)} required />
            </div>
            <div className="field">
              <label>Graduation date</label>
              <input type="date" value={graduationDate} onChange={(e) => setGraduationDate(e.target.value)} required />
            </div>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create session'}
          </button>
        </form>
        {session && (
          <div className="result-box" style={{ marginTop: 12 }}>
            <span className="badge ok">Session ready</span>
            <div className="kv">
              <b>Session ID:</b> <span className="mono">{session.sessionId}</span>
            </div>
            <div className="kv">
              <b>Offer URL:</b>
            </div>
            <div className="mono" style={{ wordBreak: 'break-all' }}>{session.offerUrl}</div>
            <div className="result-box" style={{ marginTop: 12 }}>
              <b>Terms acceptance required</b>
              <p className="muted">Accept the terms before scanning this credential offer.</p>
              <button type="button" onClick={handleAcceptTerms} disabled={busy || termsAccepted}>
                {termsAccepted ? 'Terms accepted' : busy ? 'Accepting…' : 'Accept terms and enable offer'}
              </button>
            </div>
            {termsAccepted && qrDataUrl && (
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Credential offer QR code" width={240} height={240} />
                <div className="muted">Scan with the wallet app</div>
              </div>
            )}
            <div className="row" style={{ marginTop: 8 }}>
              <button type="button" onClick={() => navigator.clipboard.writeText(session.offerUrl || '')}>
                Copy offer URL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
