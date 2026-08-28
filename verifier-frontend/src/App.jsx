import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import QRScanner from './pages/QRScanner';
import VerificationResult from './pages/VerificationResult';
import Dashboard from './pages/Dashboard';
import IssuersList from './pages/IssuersList';
import './styles/App.css';

export default function App() {
  const [verifierId] = useState('verifier-001');
  const [lastVerification, setLastVerification] = useState(null);

  return (
    <Router>
      <Navigation verifierId={verifierId} />
      <div className="app-container">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/scan" element={<QRScanner onVerificationComplete={setLastVerification} />} />
          <Route path="/result/:id" element={<VerificationResult />} />
          <Route path="/issuers" element={<IssuersList />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </Router>
  );
}
