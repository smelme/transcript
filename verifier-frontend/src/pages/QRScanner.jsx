import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TrustScoreIndicator from '../components/TrustScoreIndicator';
import { verifyCredential } from '../services/verifierService';
import '../styles/QRScanner.css';

export default function QRScanner({ onVerificationComplete }) {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [verification, setVerification] = useState(null);
  const [error, setError] = useState(null);
  const [manualInput, setManualInput] = useState('');

  const handleScan = async (qrData) => {
    setScanning(true);
    setError(null);

    try {
      const result = await verifyCredential(qrData);
      setVerification(result);
      onVerificationComplete?.(result);

      if (result.success) {
        setTimeout(() => {
          navigate(`/result/${result.verificationId}`);
        }, 1500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  const handleManualScan = () => {
    if (!manualInput.trim()) {
      setError('Please enter QR data');
      return;
    }

    try {
      const qrData = JSON.parse(manualInput);
      handleScan(qrData);
      setManualInput('');
    } catch (err) {
      setError('Invalid QR data format');
    }
  };

  return (
    <div className="qr-scanner-page">
      <h2>Scan Credential QR Code</h2>

      <div className="scanner-container">
        <div className="camera-feed">
          <div className="camera-placeholder">
            📷 Camera Feed
            <p>Point camera at QR code</p>
          </div>
        </div>

        <div className="manual-input">
          <label>Or paste QR data:</label>
          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder='{"credentialId": "cred-001", "issuerId": "issuer-001", ...}'
            rows="4"
          />
          <button onClick={handleManualScan} disabled={scanning}>
            {scanning ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {verification && (
        <div className={`verification-result ${verification.success ? 'success' : 'error'}`}>
          <h3>{verification.success ? '✓ Verified' : '✗ Not Verified'}</h3>
          <p>{verification.status}</p>
          {verification.trustScore !== undefined && (
            <TrustScoreIndicator score={verification.trustScore} label="Issuer Trust" />
          )}
          <p className="reason">{verification.reason || 'Verification successful'}</p>
        </div>
      )}
    </div>
  );
}
