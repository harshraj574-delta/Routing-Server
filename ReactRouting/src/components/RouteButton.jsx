import React from 'react';
import './RouteButton.css';

function RouteButton({ route, index }) {
  const formatDuration = (duration) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getDurationClass = (duration) => {
    return duration > 2 * 3600 ? 'duration-warning' : '';
  };

  return (
    <button 
      className="route-btn"
      onClick={() => route.onClick && route.onClick()}
    >
      <span className="route-number">Route {index + 1}</span>
      <span className="zone-info">Zone: {route.zoneName}</span>
      <span className="employee-count">
        Employees: {route.employees.length}
      </span>
      <span className="duration-breakdown">
        Duration: {Math.round(route.duration / 60)} minutes
      </span>
    </button>
  );
}

export default RouteButton; 