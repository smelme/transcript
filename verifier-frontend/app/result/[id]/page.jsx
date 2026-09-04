'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import TrustScoreIndicator from '@/app/components/TrustScoreIndicator';
import { getVerification } from '@/app/lib/verifierService';

export default function VerificationResult() {
  const { id } = useParams();
  const router = useRouter();
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getVerification(id)
      .then(setVerification)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p>Loading…</p>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!verification) return <p>Verification not found</p>;

  const status = verification.status || 'pending';
  const isVerified = status === 'verified';

  return (
    <section>
      <h1>Verification Result</h1>

      <div className="result-card">
        <div className="result-icon">
          {isVerified ? '✓' : status === 'rejected' ? '✗' : '⏳'}
        </div>

        <h2 className="result-status">
          {isVerified ? 'VERIFIED' : status === 'rejected' ? 'REJECTED' : 'PENDING'}
        </h2>

        <div className="result-details">
          <Detail label="Verification ID" value={verification.verificationId} />
          <Detail label="Credential ID" value={verification.credentialId} />
          <Detail label="Issuer ID" value={verification.issuerId} />
          {verification.studentId && <Detail label="Student ID" value={verification.studentId} />}
          {verification.credentialType && (
            <Detail label="Credential Type" value={verification.credentialType} />
          )}
          <Detail
            label="Status"
            value={status}
            className={`status-${status}`}
          />
          {verification.trustScore !== undefined && (
            <div className="detail-item">
              <label>Issuer Trust Score</label>
              <TrustScoreIndicator score={verification.trustScore} />
            </div>
          )}
          <Detail
            label="Verified At"
            value={verification.createdAt ? new Date(verification.createdAt).toLocaleString() : '—'}
          />
        </div>

        {verification.reason && (
          <div className="reason-box">
            <strong>Note:</strong> {verification.reason}
          </div>
        )}
      </div>

      <button className="btn btn-primary" onClick={() => router.push('/scan')}>
        Scan Another Credential
      </button>
    </section>
  );
}

function Detail({ label, value, className }) {
  return (
    <div className="detail-item">
      <label>{label}</label>
      <span className={className || ''}>{value}</span>
    </div>
  );
}
