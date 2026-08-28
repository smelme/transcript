/**
 * Create Credential Page
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { credentialService } from '../services/apiService.js';
import '../styles/Form.css';

export default function CredentialCreate() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    studentId: '',
    name: {
      givenName: '',
      familyName: ''
    },
    institution: '',
    degreeLevel: 'bachelor',
    fieldOfStudy: '',
    gpa: '',
    courses: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('name.')) {
      const field = name.split('.')[1];
      setFormData({
        ...formData,
        name: {
          ...formData.name,
          [field]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await credentialService.createCredential(formData);

    if (result.success) {
      navigate(`/credentials/${result.credentialId}`);
    } else {
      setError(result.error);
      if (result.validationErrors) {
        console.log('Validation errors:', result.validationErrors);
      }
    }

    setLoading(false);
  };

  return (
    <div className="form-container">
      <h1>Create New Credential</h1>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="credential-form">
        <fieldset>
          <legend>Student Information</legend>
          
          <div className="form-group">
            <label htmlFor="studentId">Student ID:</label>
            <input
              id="studentId"
              type="text"
              name="studentId"
              value={formData.studentId}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="givenName">First Name:</label>
              <input
                id="givenName"
                type="text"
                name="name.givenName"
                value={formData.name.givenName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="familyName">Last Name:</label>
              <input
                id="familyName"
                type="text"
                name="name.familyName"
                value={formData.name.familyName}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Academic Information</legend>
          
          <div className="form-group">
            <label htmlFor="institution">Institution:</label>
            <input
              id="institution"
              type="text"
              name="institution"
              value={formData.institution}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="degreeLevel">Degree Level:</label>
              <select
                id="degreeLevel"
                name="degreeLevel"
                value={formData.degreeLevel}
                onChange={handleChange}
              >
                <option value="high-school">High School</option>
                <option value="associate">Associate</option>
                <option value="bachelor">Bachelor</option>
                <option value="master">Master</option>
                <option value="doctorate">Doctorate</option>
                <option value="certificate">Certificate</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="gpa">GPA:</label>
              <input
                id="gpa"
                type="number"
                name="gpa"
                value={formData.gpa}
                onChange={handleChange}
                min="0"
                max="4.0"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="fieldOfStudy">Field of Study:</label>
            <input
              id="fieldOfStudy"
              type="text"
              name="fieldOfStudy"
              value={formData.fieldOfStudy}
              onChange={handleChange}
            />
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Creating...' : 'Create Credential'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/credentials')}
            className="btn btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
