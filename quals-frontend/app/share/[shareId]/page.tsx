'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type ShareView = {
  success: boolean;
  senderEmail?: string;
  recipientName?: string;
  message?: string;
  /** Which credential was shared. Both kinds share a docType, so this is the label. */
  kind?: string | null;
  kindLabel?: string | null;
  categories?: string[];
  claims?: Record<string, unknown>;
  sharedAt?: string;
  expiresAt?: string;
  error?: string;
};

/** A course as the credential carries it: one JSON string claim holding an array of these. */
type Course = {
  courseCode?: string;
  course_code?: string;
  courseName?: string;
  course_name?: string;
  term?: string;
  credits?: number | string;
  grade?: string | number;
  gradePoints?: number;
  workloadHours?: number;
  grouping?: string;
};

// Dates reach a shared view as `YYYY-MM-DD` from our own encoder, as `YYYYMMDD` from the wallet's
// claim set, or as a Date when a decoder expands CBOR tag 1004. A reader wants the same shape for
// all three, and every other value stays exactly as it was disclosed.
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatClaimDate(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/);
  const compact = iso ? null : value.match(/^(\d{4})(\d{2})(\d{2})$/);
  const match = iso || compact;
  if (!match) return value;
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return value;
  return `${day} ${MONTH_NAMES[month]} ${match[1]}`;
}

/**
 * The course list travels as one JSON string claim. It is read here rather than printed, because a
 * recipient reading `[{"courseCode":...}]` learns nothing and would reasonably think the page was
 * broken.
 */
function parseCourses(value: unknown): Course[] {
  if (Array.isArray(value)) return value as Course[];
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as Course[]) : [];
  } catch {
    return [];
  }
}

/** Course fields are camelCase in the credential and snake_case in older claims, so read both. */
function courseField(course: Course, camel: keyof Course, snake: keyof Course): string {
  const value = course[camel] ?? course[snake];
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default function SharePage() {
  const params = useParams<{ shareId: string }>();
  const shareId = params?.shareId || '';

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [recipientToken, setRecipientToken] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [view, setView] = useState<ShareView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'signin' | 'terms' | 'view'>('signin');

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as T;
  }

  useEffect(() => {
    const t = sessionStorage.getItem(`share-token-${shareId}`);
    if (t) {
      setRecipientToken(t);
      setStage('terms');
    }
  }, [shareId]);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<{ success: boolean; otpSent: boolean; otp?: string }>(
        `/shares/${shareId}/otp`,
        { email },
      );
      setOtpSent(true);
      setDevOtp(data.otp || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<{ success: boolean; recipientToken: string }>(
        `/shares/${shareId}/verify`,
        { email, otp },
      );
      setRecipientToken(data.recipientToken);
      sessionStorage.setItem(`share-token-${shareId}`, data.recipientToken);
      setStage('terms');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function acceptTerms() {
    setBusy(true);
    setError(null);
    try {
      await post(`/shares/${shareId}/accept-terms`, { recipientToken });
      await loadView();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadView() {
    setBusy(true);
    setError(null);
    try {
      const data = await post<ShareView>(`/shares/${shareId}/view`, { recipientToken });
      setView(data);
      setStage('view');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    if (!recipientToken) return;
    window.open(`/api/shares/${shareId}/pdf?token=${encodeURIComponent(recipientToken)}`, '_blank');
  }

  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (value instanceof Date) return formatClaimDate(value.toISOString().slice(0, 10));
    // A nested object is still a claim the holder disclosed, so it is shown as its parts rather
    // than as JSON, which reads as a fault in the page.
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => `${displayLabel(key)}: ${formatValue(item)}`)
        .join(' · ');
    }
    return typeof value === 'string' ? formatClaimDate(value) : String(value);
  }

  function displayLabel(key: string): string {
    const overrides: Record<string, string> = {
      given_name: 'Given name',
      family_name: 'Family name',
      birth_date: 'Date of birth',
      institution_name: 'Institution',
      degree_level: 'Degree level',
      field_of_study: 'Field of study',
      graduation_date: 'Graduation date',
      gpa: 'GPA',
      student_id: 'Student ID',
      courses: 'Courses',
      total_credits: 'Total credits',
      status: 'Status',
    };
    return overrides[key] || key.replace(/_/g, ' ');
  }

  const courses = parseCourses(view?.claims?.courses);
  const otherClaims = Object.entries(view?.claims || {}).filter(([key]) => key !== 'courses');

  return (
    <div className="card" style={{ maxWidth: 720, margin: '32px auto' }}>
      <h1>Shared documents</h1>

      {stage === 'signin' && (
        <div>
          <p className="muted">
            Someone sent you a document through Quals. Sign in with the email address it was sent
            to, and we will send you a one-time code.
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          {!otpSent ? (
            <button className="btn btn-primary" onClick={requestOtp} disabled={busy || !email} style={{ marginTop: 12 }}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          ) : (
            <div>
              <div className="field" style={{ marginTop: 12 }}>
                <label>One-time code</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" />
              </div>
              {devOtp && (
                <p className="muted" style={{ marginTop: 6 }}>
                  Dev code (email not configured): <b>{devOtp}</b>
                </p>
              )}
              <button className="btn btn-primary" onClick={verifyOtp} disabled={busy || !otp} style={{ marginTop: 12 }}>
                {busy ? 'Verifying…' : 'Verify and continue'}
              </button>
              <button className="btn" onClick={requestOtp} disabled={busy} style={{ marginTop: 8 }}>
                Resend code
              </button>
            </div>
          )}
        </div>
      )}

      {stage === 'terms' && (
        <div>
          <p>Before viewing, please review and accept the terms and conditions.</p>
          <div className="result-box" style={{ marginTop: 12 }}>
            <p>
              By accepting, you agree that you are the intended recipient of this share and that the
              information will only be used for the purpose for which it was shared. The sender is
              notified when you view or download these documents.
            </p>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
            />
            I acknowledge and agree to the terms and conditions
          </label>
          <button
            className="btn btn-primary"
            onClick={acceptTerms}
            disabled={busy || !termsAccepted}
            style={{ marginTop: 12 }}
          >
            {busy ? 'Loading…' : 'Continue'}
          </button>
        </div>
      )}

      {stage === 'view' && view && (
        <div>
          <p className="muted">
            Shared by <b>{view.senderEmail || 'a verified holder'}</b> with {view.recipientName}.
          </p>
          {view.kindLabel && (
            <p style={{ marginTop: 8 }}>
              <span className="badge kind">{view.kindLabel}</span>
            </p>
          )}
          {view.expiresAt && (
            <p className="muted" style={{ marginTop: 8 }}>
              This link can be opened until {formatClaimDate(view.expiresAt.slice(0, 10))}. After
              that, ask the sender to share it again.
            </p>
          )}
          {view.message && (
            <blockquote className="result-box" style={{ borderLeft: '4px solid var(--brand)' }}>
              {view.message}
            </blockquote>
          )}
          {view.categories && (
            <p className="muted">Sections shared: {view.categories.join(', ')}</p>
          )}

          {otherClaims.length > 0 && (
            <div className="table-scroll">
              <table className="table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {otherClaims.map(([key, value]) => (
                    <tr key={key}>
                      <td>{displayLabel(key)}</td>
                      <td>{formatValue(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {courses.length > 0 && (
            <>
              <h2 style={{ marginTop: 24, fontSize: 18 }}>Courses</h2>
              <div className="table-scroll">
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Title</th>
                      <th>Term</th>
                      <th>Credits</th>
                      <th>Mark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course, index) => (
                      <tr key={course.courseCode || course.course_code || index}>
                        <td>{courseField(course, 'courseCode', 'course_code')}</td>
                        <td>{courseField(course, 'courseName', 'course_name')}</td>
                        <td>{courseField(course, 'term', 'term')}</td>
                        <td>{courseField(course, 'credits', 'credits')}</td>
                        <td>
                          {course.grade !== undefined && course.grade !== ''
                            ? `${course.grade}${course.gradePoints != null ? ` (${course.gradePoints})` : ''}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <button className="btn btn-primary" onClick={downloadPdf} style={{ marginTop: 16 }}>
            Download PDF
          </button>
        </div>
      )}

      {error && (
        <div className="result-box" style={{ marginTop: 12 }}>
          <span className="badge err">Error</span>
          <div className="mono">{error}</div>
        </div>
      )}
    </div>
  );
}
