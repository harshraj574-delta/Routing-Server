import React, { useEffect, useState } from 'react';
import { calculateRouteDetails } from '../utils/routeCalculations';
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
  const [routesWithDuration, setRoutesWithDuration] = useState([]);
  const facility = [28.402910, 76.998015];
  const MAX_DURATION_MINUTES = 150; // 2.5 hours in minutes

  useEffect(() => {
    const calculateDurations = async () => {
      const updatedRoutes = await Promise.all(routes.map(async (route) => {
        // Get coordinates for the route including facility
        const routeCoordinates = [
          ...route.employees.map(emp => [emp.location.lat, emp.location.lng]),
          facility
        ];

        try {
          const details = await calculateRouteDetails(routeCoordinates, route.employees);
          const durationInMinutes = Math.round(details.totalDuration / 60);
          
          // Flag routes that exceed time limit
          const exceedsLimit = durationInMinutes > MAX_DURATION_MINUTES;
          
          return {
            ...route,
            duration: durationInMinutes,
            exceedsLimit
          };
        } catch (error) {
          console.error('Error calculating route duration:', error);
          return {
            ...route,
            duration: null,
            exceedsLimit: false
          };
        }
      }));

      setRoutesWithDuration(updatedRoutes);
    };

    if (routes.length > 0) {
      calculateDurations();
    }
  }, [routes]);

  // Calculate summary statistics
  const totalEmployees = routesWithDuration.reduce((sum, route) => sum + (route.employees?.length || 0), 0);
  const totalRoutes = routesWithDuration.length;
  const avgOccupancy = totalRoutes > 0 ? (totalEmployees / totalRoutes).toFixed(1) : 0;
  const exceedingRoutes = routesWithDuration.filter(r => r.exceedsLimit).length;

  if (!selectedProfile) {
    return <div id="sidebar"><h2>Please select a profile</h2></div>;
  }

  return (
    <div id="sidebar">
      <h2>Employee Routing</h2>
      
      {/* Route Summary Section */}
      {routesWithDuration.length > 0 && (
        <div id="summary">
          <div id="totalRoutesDiv">
            <p>Total Routes: <strong>{totalRoutes}</strong></p>
          </div>
          <div id="totalEmployeesDiv">
            <p>Total Employees: <strong>{totalEmployees}</strong></p>
          </div>
          <div id="avgOccupancyDiv">
            <p>Avg. Occupancy: <strong>{avgOccupancy}</strong></p>
          </div>
          <div id="exceedingRoutesDiv">
            <p>Exceeding 2.5h: <strong>{exceedingRoutes}</strong></p>
          </div>
        </div>
      )}

      {/* <div className="profile-info">
        <h3>Selected Profile: {selectedProfile.name}</h3>
        <p>Total Employees: {employeeData.length}</p>
        <p>Total Zones: {Array.isArray(zones) ? zones.length : 0}</p>
      </div> */}
      
      {routesWithDuration.length === 0 ? (
        <button 
          className="generate-routes-btn"
          onClick={onGenerateRoutes}
        >
          Generate Routes
        </button>
      ) : (
        <div className="routes-list">
          {/* <h3>Generated Routes</h3> */}
          {routesWithDuration.map((route) => (
            <div
              key={route.uniqueKey || `route_${route.zone}_${route.routeNumber}`}
              className={`route-item ${selectedRoute?.uniqueKey === route.uniqueKey ? 'selected' : ''} 
                         ${route.exceedsLimit ? 'exceeds-limit' : ''}`}
              onClick={() => onRouteSelect(route)}
            >
              <h4>{route.zone || 'Unknown Zone'}</h4>
              <p>Route {route.routeNumber || 'N/A'}</p>
              <p>{route.employees?.length || 0} employees</p>
              <p className="duration">
                Duration: {route.duration ? `${route.duration} mins` : 'Calculating...'}
                {route.exceedsLimit && 
                  <span className="duration-warning"> (Exceeds 2.5hr limit!)</span>
                }
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Sidebar;