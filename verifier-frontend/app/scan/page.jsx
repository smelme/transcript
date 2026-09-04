'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TrustScoreIndicator from '@/app/components/TrustScoreIndicator';
import { verifyCredential } from '@/app/lib/verifierService';

export default function QRScanner() {
  const router = useRouter();
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

      if (result.success) {
        setTimeout(() => {
          router.push(`/result/${result.verificationId}`);
        }, 1200);
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
      setManualInput('');
      handleScan(qrData);
    } catch {
      setError('Invalid QR data format');
    }
  };

  return (
    <section>
      <h1>Scan Credential QR Code</h1>

      <div className="scanner-container">
        <div className="camera-feed">
          <div className="camera-placeholder">
            <div style={{ fontSize: 40 }}>◎</div>
            <p>Point camera at the QR code</p>
          </div>
        </div>

        <div className="manual-input">
          <label htmlFor="qr-data">Or paste QR data:</label>
          <textarea
            id="qr-data"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder='{"credentialId": "cred-001", "issuerId": "issuer-001", ...}'
            rows="4"
          />
          <button className="btn btn-primary" onClick={handleManualScan} disabled={scanning}>
            {scanning ? 'Verifying…' : 'Verify'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {verification && (
        <div className={`card ${verification.success ? 'status-verified' : 'status-rejected'}`}>
          <h3>{verification.success ? '✓ Verified' : '✗ Not Verified'}</h3>
          <p>{verification.status}</p>
          {verification.trustScore !== undefined && (
            <TrustScoreIndicator score={verification.trustScore} label="Issuer Trust" />
          )}
          <p>{verification.reason || 'Verification successful'}</p>
        </div>
      )}
    </section>
  );
}
