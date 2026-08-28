/**
 * Navigation Component
 */

import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/Navigation.css';

export default function Navigation({ user, onLogout }) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h2>Smart College Admin</h2>
      </div>
      
      <ul className="navbar-menu">
        <li><Link to="/">Dashboard</Link></li>
        <li><Link to="/credentials">Credentials</Link></li>
        <li><Link to="/verifiers">Verifiers</Link></li>
      </ul>

      <div className="navbar-user">
        <span className="user-name">{user?.username || 'Admin'}</span>
        <button onClick={onLogout} className="btn btn-small">
          Logout
        </button>
      </div>
    </nav>
  );
}
