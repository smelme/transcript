import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/Navigation.css';

export default function Navigation({ verifierId }) {
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  console.log('Navigation rendering - current path:', location.pathname);

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1>Credential Verifier</h1>
        <span className="verifier-id">{verifierId}</span>
      </div>
      <ul className="navbar-menu">
        <li>
          <Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>
            Dashboard
          </Link>
        </li>
        <li>
          <Link to="/verify-academic" className={isActive('/verify-academic') ? 'active' : ''}>
            Verify for MyJob
          </Link>
        </li>
        <li>
          <Link to="/scan" className={isActive('/scan') ? 'active' : ''}>
            Scan QR Code
          </Link>
        </li>
        <li>
          <Link to="/issuers" className={isActive('/issuers') ? 'active' : ''}>
            Trusted Issuers
          </Link>
        </li>
      </ul>
    </nav>
  );
}
