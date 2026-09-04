import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import Dashboard from './pages/Dashboard';
import Issue from './pages/Issue';
import Credentials from './pages/Credentials';
import History from './pages/History';
import './styles/App.css';

export default function App() {
  const [issuerId] = useState('issuer-001');

  return (
    <Router>
      <Navigation issuerId={issuerId} />
      <div className="app-container">
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/issue" element={<Issue />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/history" element={<History />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<div style={{ padding: '2rem' }}>Page not found</div>} />
        </Routes>
      </div>
    </Router>
  );
}
