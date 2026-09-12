'use client';

import { useState } from 'react';
import { parseCourses, requestTranscript } from '@/app/lib/presentationService';

/**
 * Trust University's postgraduate registration. A registrar asks for the transcript namespace,
 * so the holder's wallet offers their transcript rather than their qualification - and only the
 * values the verifier returns are shown, never anything read from the request itself.
 */
export default function ApplyPage() {
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
  const hasRecognition = Boolean(
    claims?.institutionId ||
      claims?.attestingOffice ||
      claims?.languageOfInstruction ||
      claims?.institutionNameAlt,
  );

  return (
    <>
      <h1>Apply with your academic transcript</h1>
      <p className="lede">
        For postgraduate admission we verify your record directly from your wallet. You will be
        asked to approve sharing your name, your student identifier, your modules and credits, your
        average, and how the record was attested. Nothing is sent until you approve it, and we do
        not contact your institution.
      </p>

      <button className="btn btn-primary" onClick={start} disabled={state === 'loading'}>
        {state === 'loading' ? 'Opening your wallet…' : 'Share my transcript'}
      </button>

      {message && (
        <p className={`notice ${state === 'error' ? 'err' : 'ok'}`} role="status">
          {message}
        </p>
      )}

      {state === 'received' && result?.success && (
        <section className="card" aria-label="Verified transcript">
          <h2>Verified transcript</h2>
          <p className="muted">
            Signature and revocation status checked · {new Date(result.verifiedAt).toLocaleString()}
          </p>

          <dl>
            <dt>Applicant</dt>
            <dd>{claims?.name || '—'}</dd>
            <dt>Institution</dt>
            <dd>
              {claims?.institution || '—'}
              {claims?.institutionNameAlt ? ` (${claims.institutionNameAlt})` : ''}
              {claims?.institutionId ? ` · ${claims.institutionIdScheme} ${claims.institutionId}` : ''}
            </dd>
            <dt>Programme</dt>
            <dd>
              {claims?.programmeTitle || '—'}
              {claims?.programmeCode
                ? ` · ${claims.programmeCodeScheme || 'code'} ${claims.programmeCode}`
                : ''}
            </dd>
            <dt>Level</dt>
            <dd>
              {claims?.programmeLevel || '—'}
              {claims?.programmeLevelFramework ? ` (${claims.programmeLevelFramework})` : ''}
            </dd>
            <dt>Award</dt>
            <dd>{claims?.awardTitle || '—'}</dd>
            <dt>Period of study</dt>
            <dd>
              {claims?.enrolmentStart || claims?.enrolmentEnd
                ? `${claims.enrolmentStart || '—'} to ${claims.enrolmentEnd || '—'}`
                : '—'}
            </dd>
            <dt>Student identifier</dt>
            <dd>
              {claims?.studentId || '—'}
              {claims?.studentIdScheme ? ` (${claims.studentIdScheme})` : ''}
            </dd>
            <dt>Credits earned</dt>
            <dd>
              {claims?.creditsEarned ?? claims?.totalCredits ?? '—'}
              {claims?.creditScheme ? ` ${claims.creditScheme}` : ''}
              {claims?.creditsAttempted != null && claims.creditsAttempted !== claims.creditsEarned
                ? ` of ${claims.creditsAttempted} attempted`
                : ''}
            </dd>
            <dt>Average</dt>
            <dd>
              {claims?.gpa != null
                ? `${claims.gpa} on ${claims.gpaScaleId || 'an unnamed scale'}${claims.gpaScaleMaximum ? ` (maximum ${claims.gpaScaleMaximum})` : ''}`
                : '—'}
            </dd>
            <dt>Outcome</dt>
            <dd>{claims?.outcome || claims?.completionStatus || '—'}</dd>
            <dt>Language of instruction</dt>
            <dd>{claims?.languageOfInstruction || '—'}</dd>
          </dl>

          {courses.length > 0 ? (
            <table>
              <caption className="muted">Modules verified in this transcript</caption>
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  <th scope="col">Title</th>
                  <th scope="col">Term</th>
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
                    <td>{course.courseName || '—'}</td>
                    <td>{course.term || '—'}</td>
                    <td>{course.credits ?? '—'}</td>
                    <td>
                      {course.grade ?? '—'}
                      {course.gradePoints != null ? ` (${course.gradePoints})` : ''}
                    </td>
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

          {hasRecognition && (
            <details>
              <summary>What we matched this record against</summary>
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
                    <dt>Registry identifier</dt>
                    <dd>{claims.institutionRor}</dd>
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
                      {claims.transcriptType} · {claims.documentStatus || '—'} ·{' '}
                      {claims.documentCompleteness || '—'}
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

          <p className="muted">
            Every value above was read from the credential&apos;s signature and its revocation
            status at the moment you shared it — not from anything you typed, and not from a copy we
            held.
          </p>

          {(!claims?.programmeTitle || !claims?.enrolmentStart || courses.some((c) => !c.term)) && (
            <p className="notice">
              A field above shows a dash because the credential did not contain it.{' '}
              {claims?.programmeTitle
                ? 'Some credentials carry the modules without the academic terms they were taken in.'
                : 'Credentials issued before the current claim set carry only the modules and the credits, without the programme, the level or the period of study.'}{' '}
              Nothing here is inferred: if you need a field that is missing, ask the applicant for a
              newly issued transcript.
            </p>
          )}
        </section>
      )}

      <section id="how" className="card">
        <h2>How this works</h2>
        <div className="steps">
          <div className="step">
            <h3>1. Your transcript stays with you</h3>
            <p>
              It lives in your wallet, signed by the institution that issued it. We never hold a
              copy, and you can see exactly which fields leave it.
            </p>
          </div>
          <div className="step">
            <h3>2. You approve the request</h3>
            <p>
              Your wallet shows what we asked for and lets you refuse. If you cancel, nothing is
              shared and we are told nothing.
            </p>
          </div>
          <div className="step">
            <h3>3. We verify, then read</h3>
            <p>
              We check the signature and the revocation status before showing anything, and we
              record what was verified and when.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
