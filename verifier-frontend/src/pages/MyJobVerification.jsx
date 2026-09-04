import React, { useState } from 'react';
import { requestAcademicCredential } from '../services/presentationService';

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
      setMessage(error.name === 'AbortError' ? 'Credential sharing was cancelled.' : error.message);
    }
  };

  return (
    <section className="result-page" aria-labelledby="myjob-title">
      <h2 id="myjob-title">Verify an academic credential</h2>
      <p>MyJob requests your name, institution, degree level, and graduation date. Your wallet asks for approval before sharing.</p>
      <button className="btn-primary" onClick={start} disabled={state === 'loading'}>
        {state === 'loading' ? 'Opening wallet…' : 'Share credential with MyJob'}
      </button>

      {message && <p className="alert alert-error" role="status">{message}</p>}

      {result?.success && (
        <section aria-label="Verified academic credential">
          <h3>Verified academic details</h3>
          <dl>
            <dt>Name</dt><dd>{result.claims?.name || '—'}</dd>
            <dt>Institution</dt><dd>{result.claims?.institution || '—'}</dd>
            <dt>Degree level</dt><dd>{result.claims?.degreeLevel || '—'}</dd>
            <dt>Graduation date</dt><dd>{result.claims?.graduationDate || '—'}</dd>
            <dt>Status</dt><dd>{result.status}</dd>
            <dt>Verified</dt><dd>{new Date(result.verifiedAt).toLocaleString()}</dd>
          </dl>
        </section>
      )}
    </section>
  );
}