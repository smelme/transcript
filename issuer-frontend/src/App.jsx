/**
 * Admin Portal App Component
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { authService } from './services/apiService.js';
import Dashboard from './pages/Dashboard.jsx';
import CredentialsList from './pages/CredentialsList.jsx';
import CredentialCreate from './pages/CredentialCreate.jsx';
import CredentialDetail from './pages/CredentialDetail.jsx';
import VerifiersList from './pages/VerifiersList.jsx';
import VerifierDetail from './pages/VerifierDetail.jsx';
import Login from './pages/Login.jsx';
import Navigation from './components/Navigation.jsx';
import './App.css';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const result = await authService.getCurrentUser();
      if (result.success) {
        setUser(result.user);
      }
      setLoading(false);
    };

    const token = localStorage.getItem('authToken');
    if (token) {
      checkAuth();
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (user) => {
    setUser(user);
    setAuthError(null);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <div className="app-container">
        <Navigation user={user} onLogout={handleLogout} />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/credentials" element={<CredentialsList />} />
            <Route path="/credentials/create" element={<CredentialCreate />} />
            <Route path="/credentials/:id" element={<CredentialDetail />} />
            <Route path="/verifiers" element={<VerifiersList />} />
            <Route path="/verifiers/:id" element={<VerifierDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
