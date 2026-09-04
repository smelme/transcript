import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getVerification } from '../services/verifierService';
import TrustScoreIndicator from '../components/TrustScoreIndicator';
import '../styles/VerificationResult.css';

export default function VerificationResult() {
  const { id } = useParams();
  const [verification, setVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchVerification();
  }, [id]);

  const fetchVerification = async () => {
    try {
      setLoading(true);
      const result = await getVerification(id);
      setVerification(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="result-page"><p>Loading...</p></div>;
  if (error) return <div className="result-page alert alert-error">{error}</div>;
  if (!verification) return <div className="result-page"><p>Not found</p></div>;

  const isVerified = verification.status === 'verified';

  return (
    <div className="result-page">
      <h2>Verification Result</h2>

      <div className={`result-card ${verification.status}`}>
        <div className="result-icon">
          {isVerified ? '✓' : verification.status === 'rejected' ? '✗' : '⏳'}
        </div>

        <h3 className="result-status">
          {isVerified ? 'VERIFIED' : verification.status === 'rejected' ? 'REJECTED' : 'PENDING'}
        </h3>

        <div className="result-details">
          <div className="detail-item">
            <label>Verification ID:</label>
            <span>{verification.verificationId}</span>
          </div>

          <div className="detail-item">
            <label>Credential ID:</label>
            <span>{verification.credentialId}</span>
          </div>

          <div className="detail-item">
            <label>Issuer ID:</label>
            <span>{verification.issuerId}</span>
          </div>

          {verification.studentId && (
            <div className="detail-item">
              <label>Student ID:</label>
              <span>{verification.studentId}</span>
            </div>
          )}

          {verification.credentialType && (
            <div className="detail-item">
              <label>Credential Type:</label>
              <span>{verification.credentialType}</span>
            </div>
          )}

          <div className="detail-item">
            <label>Status:</label>
            <span className={`status-${verification.status}`}>{verification.status}</span>
          </div>

          {verification.trustScore !== undefined && (
            <div className="detail-item trust-section">
              <label>Issuer Trust Score:</label>
              <TrustScoreIndicator score={verification.trustScore} />
            </div>
          )}

          <div className="detail-item">
            <label>Verified At:</label>
            <span>{new Date(verification.createdAt).toLocaleString()}</span>
          </div>
        </div>

        {verification.reason && (
          <div className={`reason-box ${verification.status}`}>
            <strong>Note:</strong> {verification.reason}
          </div>
        )}
      </div>

      <button className="btn-primary" onClick={() => window.location.href = '/scan'}>
        Scan Another Credential
      </button>
    </div>
  );
}
