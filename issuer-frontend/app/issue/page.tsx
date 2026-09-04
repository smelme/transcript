'use client';

import { useState } from 'react';
import { issueCredential, getCredentialMdoc, type IssueResult, type MdocResult } from '../lib/api';

const DEFAULT_COURSES = `[
  {"courseCode":"6.S191","courseName":"Machine Learning","credits":3,"grade":"A"},
  {"courseCode":"6.009","courseName":"Programming","credits":4,"grade":"A"}
]`;

export default function IssuePage() {
  const [form, setForm] = useState({
    full_name: 'Erika Mustermann',
    date_of_birth: '1964-08-12',
    document_number: 'Z021AB37X13',
    issuing_authority: 'Smart Academy',
    issuing_country: 'NL',
    issue_date: '2025-03-24',
    expiry_date: '2031-03-24',
    institution_name: 'MIT',
    degree_level: 'bachelor',
    field_of_study: 'Computer Science',
    graduation_date: '2026-05-15',
    gpa: '3.9',
    student_id: 'STU-2026-001',
    total_credits: '7',
    status: 'completed',
    courses: DEFAULT_COURSES,
  });

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IssueResult | null>(null);
  const [mdoc, setMdoc] = useState<MdocResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setMdoc(null);

    let courses;
    try {
      courses = JSON.parse(form.courses);
    } catch {
      setError('Courses must be valid JSON.');
      setBusy(false);
      return;
    }

    const portraitInput = (document.getElementById('portrait') as HTMLInputElement)?.files?.[0];
    let portrait: string | null = null;
    if (portraitInput) {
      portrait = await new Promise<string | null>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(',')[1] ?? null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(portraitInput);
      });
    }

    try {
      const res = await issueCredential({
        docType: 'org.iso.23220.photoid.1',
        full_name: form.full_name,
        date_of_birth: form.date_of_birth,
        document_number: form.document_number,
        issuing_authority: form.issuing_authority,
        issue_date: form.issue_date,
        expiry_date: form.expiry_date,
        issuing_country: form.issuing_country,
        portrait,
        education_qualification: {
          institution_name: form.institution_name,
          degree_level: form.degree_level,
          field_of_study: form.field_of_study,
          graduation_date: form.graduation_date,
          gpa: parseFloat(form.gpa) || undefined,
        },
        education_transcript: {
          student_id: form.student_id,
          courses,
          total_credits: parseInt(form.total_credits) || undefined,
          status: form.status,
        },
      });

      setResult(res);
      if (res.success && res.credentialId) {
        try {
          setMdoc(await getCredentialMdoc(res.credentialId));
        } catch {
          /* mdoc verification is optional */
        }
      } else {
        setError(res.error || 'Issuance failed.');
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
        <h1>Issue Photo ID Credential</h1>
        <form onSubmit={handleSubmit}>
          <h2>Photo ID Details</h2>
          <div className="grid">
            <div className="field full">
              <label>Full name</label>
              <input value={form.full_name} onChange={set('full_name')} />
            </div>
            <Field label="Date of birth" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
            <Field label="Document number" value={form.document_number} onChange={set('document_number')} />
            <Field label="Issuing authority" value={form.issuing_authority} onChange={set('issuing_authority')} />
            <Field label="Issuing country" value={form.issuing_country} onChange={set('issuing_country')} maxLength={2} />
            <Field label="Issue date" type="date" value={form.issue_date} onChange={set('issue_date')} />
            <Field label="Expiry date" type="date" value={form.expiry_date} onChange={set('expiry_date')} />
            <div className="field full">
              <label>Portrait (PNG/JPEG)</label>
              <input id="portrait" type="file" accept="image/png,image/jpeg" />
            </div>
          </div>

          <hr />

          <h2>Education Qualification</h2>
          <div className="grid">
            <Field label="Institution" value={form.institution_name} onChange={set('institution_name')} />
            <Field label="Degree level" value={form.degree_level} onChange={set('degree_level')} />
            <Field label="Field of study" value={form.field_of_study} onChange={set('field_of_study')} />
            <Field label="Graduation date" type="date" value={form.graduation_date} onChange={set('graduation_date')} />
            <Field label="GPA" type="number" step="0.1" value={form.gpa} onChange={set('gpa')} />
          </div>

          <hr />

          <h2>Education Transcript</h2>
          <div className="grid">
            <Field label="Student ID" value={form.student_id} onChange={set('student_id')} />
            <Field label="Total credits" type="number" value={form.total_credits} onChange={set('total_credits')} />
            <Field label="Status" value={form.status} onChange={set('status')} />
            <div className="field full">
              <label>Courses (JSON)</label>
              <textarea value={form.courses} onChange={set('courses')} />
            </div>
          </div>

          <hr />

          <button type="submit" disabled={busy}>
            {busy ? 'Issuing…' : 'Issue Credential'}
          </button>
          {error && (
            <div className="result-box" style={{ marginTop: 12 }}>
              <span className="badge err">Issuance failed</span>
              <div className="mono">{error}</div>
            </div>
          )}
        </form>
      </div>

      {result?.success && (
        <div className="card">
          <h1>Issued Credential</h1>
          <div className="kv">
            <b>Credential ID:</b> <span className="mono">{result.credentialId}</span>
          </div>
          <div className="kv">
            <b>Status:</b> <span className="badge ok">{result.status}</span>
          </div>
          <div className="kv">
            <b>docType:</b> <span className="mono">{result.docType}</span>
          </div>
          {mdoc?.verification && (
            <div className="kv">
              <b>Verification:</b>{' '}
              {mdoc.verification.signatureValid ? (
                <span className="badge ok">signature valid</span>
              ) : (
                <span className="badge err">signature invalid</span>
              )}{' '}
              {mdoc.verification.digestsValid ? (
                <span className="badge ok">digests valid</span>
              ) : (
                <span className="badge err">digests invalid</span>
              )}
            </div>
          )}
          {result.mdocBase64url && (
            <>
              <div className="kv">
                <b>mDOC (base64url):</b>
              </div>
              <div className="result-box mono">{result.mdocBase64url}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => navigator.clipboard.writeText(result.mdocBase64url || '')}>
                  Copy base64url
                </button>
                <a href="https://paradym.id/tools/mdoc" target="_blank" rel="noopener noreferrer">
                  Open Paradym debugger
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
  step,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  maxLength?: number;
  step?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} value={value} onChange={onChange} maxLength={maxLength} step={step} />
    </div>
  );
}
