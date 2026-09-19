'use client';

import { useState } from 'react';
import { requestAcademicCredential } from '@/app/lib/presentationService';

// One shape for the moment of verification, matching the portal's date style rather than the
// browser's default, which varies by locale and by machine.
function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MyJobVerification() {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);
  const [result, setResult] = useState(null);

  const start = async () => {
    setState('loading');
    setMessage(null);
    setResult(null);
    try {
      const verification = await requestAcademicCredential();
      setState('received');
      setResult(verification);
    } catch (error) {
      setState('error');
      setMessage(
        error.name === 'AbortError'
          ? 'Credential sharing was cancelled.'
          : error.message,
      );
    }
  };

  // What an employer checks here is an awarded qualification. A transcript, or study still in
  // progress, verifies perfectly well and is still not that, so the outcome is stated rather than
  // left as a row of dashes for a reader to interpret.
  const claims = result?.claims;
  const outcome = String(claims?.outcome || claims?.completionStatus || '').toLowerCase();
  const hasCompletedQualification =
    Boolean(claims?.degreeLevel && claims?.graduationDate) && !outcome.includes('progress');

  return (
    <section aria-labelledby="myjob-title">
      <h1 id="myjob-title">Verify an academic credential</h1>
      <p>
        My Jobs requests your name, institution, degree level, and graduation
        date. Your wallet asks for approval before sharing.
      </p>

      <button
        className="btn btn-primary"
        onClick={start}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Opening wallet…' : 'Share credential with My Jobs'}
      </button>

      {message && (
        <p className="alert alert-error" role="status">
          {message}
        </p>
      )}

      {result?.success && (
        <section className="card" aria-label="Verified academic credential" style={{ marginTop: 20 }}>
          {!hasCompletedQualification ? (
            <p className="alert alert-error" role="status">
              This credential does not contain a completed qualification. It verified, but it holds
              study in progress or a transcript on its own, and neither is an awarded
              qualification. Ask the applicant for the credential for their completed award.
            </p>
          ) : (
            <>
              <h3>Verified academic details</h3>
              <dl>
                <dt>Name</dt>
                <dd>{result.claims?.name || '—'}</dd>
                <dt>Institution</dt>
                <dd>{result.claims?.institution || '—'}</dd>
                <dt>Degree level</dt>
                <dd>{result.claims?.degreeLevel || '—'}</dd>
                <dt>Graduation date</dt>
                <dd>{result.claims?.graduationDate || '—'}</dd>
                <dt>Status</dt>
                <dd>{result.status}</dd>
                <dt>Verified</dt>
                <dd>{formatTimestamp(result.verifiedAt)}</dd>
              </dl>
            </>
          )}
        </section>
      )}
    </section>
  );
}
