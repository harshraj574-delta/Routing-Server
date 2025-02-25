import React from 'react';
import './Sidebar.css';

function Sidebar({ 
  employeeData = [],
  zones = {},
  onGenerateRoutes,
  selectedProfile,
  routes = [],
  onRouteSelect,
  selectedRoute
}) {
  if (!selectedProfile) {
    return <div id="sidebar"><h2>Please select a profile</h2></div>;
  }

  // Ensure routes is always an array
  const routesList = Array.isArray(routes) ? routes : [];

  return (
    <div id="sidebar">
      <h2>Employee Routing</h2>
      <div className="profile-info">
        <h3>Selected Profile: {selectedProfile.name}</h3>
        <p>Total Employees: {employeeData.length}</p>
        <p>Total Zones: {Array.isArray(zones) ? zones.length : 0}</p>
      </div>
      
      {routesList.length === 0 ? (
        <button 
          className="generate-routes-btn"
          onClick={onGenerateRoutes}
        >
          Generate Routes
        </button>
      ) : (
        <div className="routes-list">
          <h3>Generated Routes</h3>
          {routesList.map((route) => (
            <div
              key={route.uniqueKey || `route_${route.zone}_${route.routeNumber}`}
              className={`route-item ${selectedRoute?.uniqueKey === route.uniqueKey ? 'selected' : ''}`}
              onClick={() => onRouteSelect(route)}
            >
              <h4>{route.zone || 'Unknown Zone'}</h4>
              <p>Route {route.routeNumber || 'N/A'}</p>
              <p>{(route.employees?.length || 0)} employees</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Sidebar;