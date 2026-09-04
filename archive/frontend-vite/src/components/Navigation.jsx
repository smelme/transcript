import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/Navigation.css';

export default function Navigation({ issuerId }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1>Credential Issuer</h1>
        <span className="issuer-id">{issuerId}</span>
      </div>
      <ul className="navbar-menu">
        <li>
          <Link to="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>
            Dashboard
          </Link>
        </li>
        <li>
          <Link to="/issue" className={isActive('/issue') ? 'active' : ''}>
            Issue Credential
          </Link>
        </li>
        <li>
          <Link to="/credentials" className={isActive('/credentials') ? 'active' : ''}>
            Credentials
          </Link>
        </li>
        <li>
          <Link to="/history" className={isActive('/history') ? 'active' : ''}>
            Audit History
          </Link>
        </li>
      </ul>
    </nav>
  );
}
