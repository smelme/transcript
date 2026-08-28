/**
 * Recent Activity Component
 */

import React, { useState, useEffect } from 'react';
import '../styles/RecentActivity.css';

export default function RecentActivity() {
  const [activities, setActivities] = useState([
    { id: 1, type: 'credential', action: 'Created', description: 'New credential issued', time: '2 hours ago' },
    { id: 2, type: 'verifier', action: 'Approved', description: 'Verifier registration approved', time: '5 hours ago' },
    { id: 3, type: 'credential', action: 'Revoked', description: 'Credential revoked due to expiry', time: '1 day ago' },
  ]);

  return (
    <div className="recent-activity">
      <h2>Recent Activity</h2>
      <div className="activity-list">
        {activities.map((activity) => (
          <div key={activity.id} className="activity-item">
            <div className="activity-type" data-type={activity.type}>
              {activity.type === 'credential' ? '📋' : '🔍'}
            </div>
            <div className="activity-content">
              <p className="activity-action">{activity.action}</p>
              <p className="activity-description">{activity.description}</p>
            </div>
            <div className="activity-time">{activity.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
