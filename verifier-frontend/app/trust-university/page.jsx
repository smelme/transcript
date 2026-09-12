'use client';

import { useState } from 'react';
import { parseCourses, requestTranscript } from '@/app/lib/presentationService';

/**
 * Trust University's postgraduate registration: the academic relying party a transcript
 * credential exists for. A registrar asks for the transcript namespace, so the holder's
 * wallet offers their transcript rather than their qualification, and only the fields
 * listed here are shown - taken from the verifier's response, never from the raw request.
 */
export default function TrustUniversityRegistration() {
  const [state, setState] = useState('idle'); // idle | loading | received | error
  const [message, setMessage] = useState(null);
  const [result, setResult] = useState(null);

  const start = async () => {
    setState('loading');
    setMessage(null);
    setResult(null);
    try {
      const verification = await requestTranscript();
      setState('received');
      setResult(verification);
    } catch (error) {
      setState('error');
      setMessage(
        error.name === 'AbortError'
          ? 'Sharing your transcript was cancelled. Nothing was sent to us.'
          : error.message,
      );
    }
  };

  const claims = result?.claims;
  const courses = parseCourses(claims?.courses);

  return (
    <section aria-labelledby="trust-title">
      <h1 id="trust-title">Register with Trust University</h1>
      <p>
        For postgraduate admission we verify your academic transcript directly from your wallet.
        You will be asked to approve sharing your name, student ID, modules, credits and completion
        status. Nothing is sent until you approve it, and we do not contact your institution.
      </p>

      <button className="btn btn-primary" onClick={start} disabled={state === 'loading'}>
        {state === 'loading' ? 'Opening wallet…' : 'Share my transcript'}
      </button>

      {message && (
        <p className="alert alert-error" role="status">
          {message}
        </p>
      )}

      {state === 'received' && result?.success && (
        <section
          className="card"
          aria-label="Verified transcript"
          style={{ marginTop: 20 }}
        >
          <h3>Verified transcript</h3>
          <p className="muted">
            Verified from your wallet · {new Date(result.verifiedAt).toLocaleString()}
          </p>

          <dl>
            <dt>Applicant</dt>
            <dd>{claims?.name || '—'}</dd>
            <dt>Institution</dt>
            <dd>{claims?.institution || '—'}</dd>
            <dt>Programme</dt>
            <dd>{claims?.programmeTitle || '—'}</dd>
            <dt>Award</dt>
            <dd>{claims?.awardTitle || '—'}</dd>
            <dt>Student ID</dt>
            <dd>{claims?.studentId || '—'}</dd>
            <dt>Credits earned</dt>
            <dd>{claims?.creditsEarned ?? claims?.totalCredits ?? '—'}</dd>
            <dt>Average</dt>
            <dd>
              {claims?.gpa != null ? `${claims.gpa} on ${claims.gpaScaleId}` : '—'}
            </dd>
            <dt>Completion</dt>
            <dd>{claims?.completionStatus || '—'}</dd>
          </dl>

          {courses.length > 0 ? (
            <table className="table">
              <caption className="muted">Modules verified in this transcript</caption>
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Title</th>
                  <th scope="col">Credits</th>
                  <th scope="col">Mark</th>
                  <th scope="col">Workload</th>
                  <th scope="col">Required</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course, index) => (
                  <tr key={course.courseCode || index}>
                    <td>{course.courseCode || '—'}</td>
                    <td>{course.courseName || course.courseTitle || '—'}</td>
                    <td>{course.credits ?? '—'}</td>
                    <td>{course.grade ?? '—'}</td>
                    <td>{course.workloadHours != null ? `${course.workloadHours} h` : '—'}</td>
                    <td>{course.grouping || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">
              The transcript was verified, but no module list was disclosed.
            </p>
          )}

          {(claims?.institutionId ||
            claims?.attestingOffice ||
            claims?.languageOfInstruction ||
            claims?.institutionNameAlt) && (
            <details style={{ marginTop: 16 }}>
              <summary>
                Recognition details the university matched this record against
              </summary>
              <dl>
                {claims?.institutionId && (
                  <>
                    <dt>Institution identifier</dt>
                    <dd>
                      {claims.institutionId} ({claims.institutionIdScheme})
                    </dd>
                  </>
                )}
                {claims?.institutionRor && (
                  <>
                    <dt>Research organisation registry</dt>
                    <dd>{claims.institutionRor}</dd>
                  </>
                )}
                {claims?.institutionNameAlt && (
                  <>
                    <dt>Recognised name</dt>
                    <dd>{claims.institutionNameAlt}</dd>
                  </>
                )}
                {claims?.programmeTitleAlt && (
                  <>
                    <dt>Recognised programme</dt>
                    <dd>{claims.programmeTitleAlt}</dd>
                  </>
                )}
                {claims?.languageOfInstruction && (
                  <>
                    <dt>Language of instruction</dt>
                    <dd>{claims.languageOfInstruction}</dd>
                  </>
                )}
                {claims?.transcriptType && (
                  <>
                    <dt>Document</dt>
                    <dd>
                      {claims.transcriptType} · {claims.documentStatus} ·{' '}
                      {claims.documentCompleteness}
                    </dd>
                  </>
                )}
                {claims?.attestingOffice && (
                  <>
                    <dt>Attested by</dt>
                    <dd>
                      {claims.attestingOffice}
                      {claims.attestingCapacity ? `, as ${claims.attestingCapacity}` : ''}
                    </dd>
                  </>
                )}
              </dl>
            </details>
          )}

          <p className="muted" style={{ marginTop: 12 }}>
            Nothing here is read from the credential we already hold: every value above was
            verified from the signature and the revocation status at the moment you shared it.
          </p>
        </section>
      )}
    </section>
  );
}
