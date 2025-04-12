import React, { useEffect, useState } from 'react';
import { calculateRouteDetails } from '../utils/routeCalculations';
import { facilityService } from '../services/api';
import './Sidebar.css';

function Sidebar({ 
  employeeData = [],
  zones = {},
  onGenerateRoutes,
  selectedProfile,
  routes = [],
  onRouteSelect,
  selectedRoute,
  showGenerationControls = false,
  onClose
}) {
  const [routesWithDuration, setRoutesWithDuration] = useState([]);
  const facility = [28.402910, 76.998015];
  const MAX_DURATION_MINUTES = 150; // 2.5 hours in minutes
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [selectedTripType, setSelectedTripType] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const calculateDurations = async () => {
      const updatedRoutes = await Promise.all(routes.map(async (route) => {
        if (!route.employees || !Array.isArray(route.employees)) {
          console.warn('Route has no employees or invalid employees data');
          return { ...route, duration: null, exceedsLimit: false };
        }

        // Get coordinates for the route including facility, filtering out employees with missing location data
        const routeCoordinates = [
          ...route.employees
            .filter(emp => emp && emp.location && typeof emp.location.lat === 'number' && typeof emp.location.lng === 'number')
            .map(emp => [emp.location.lat, emp.location.lng]),
          facility
        ];

        if (routeCoordinates.length <= 1) { // Only facility coordinate present
          console.warn('No valid employee coordinates found for route');
          return { ...route, duration: null, exceedsLimit: false };
        }

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

  useEffect(() => {
    const loadFacilities = async () => {
      try {
        const facilitiesData = await facilityService.getAll();
        setFacilities(facilitiesData);
      } catch (error) {
        console.error('Failed to load facilities:', error);
      }
    };
    loadFacilities();
  }, []);

  // Calculate summary statistics
  const totalEmployees = routesWithDuration.reduce((sum, route) => sum + (route.employees?.length || 0), 0);
  const totalRoutes = routesWithDuration.length;
  const avgOccupancy = totalRoutes > 0 ? (totalEmployees / totalRoutes).toFixed(1) : 0;
  const exceedingRoutes = routesWithDuration.filter(r => r.exceedsLimit).length;

  const shiftOptions = [
    { value: '1230', label: '12:30 PM' },
    { value: '1500', label: '3:00 PM' },
    { value: '1800', label: '6:00 PM' },
    { value: '2100', label: '9:00 PM' },
    // Add more shift times as needed
  ];

  const tripTypeOptions = [
    { value: 'pickup', label: 'Pickup' },
    { value: 'drop', label: 'Drop' }
  ];

  const handleGenerate = async () => {
    if (!selectedFacility || !selectedShift || !selectedTripType) {
      alert('Please select all required options');
      return;
    }

    setIsLoading(true);
    try {
      await onGenerateRoutes({
        facilityId: selectedFacility,
        shift: selectedShift,
        tripType: selectedTripType
      });
    } catch (error) {
      console.error('Failed to generate routes:', error);
      alert('Failed to generate routes');
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectedProfile) {
    return <div id="sidebar"><h2>Please select a profile</h2></div>;
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>{showGenerationControls ? 'Route Generation' : 'Route Visualization'}</h2>
        <button className="close-sidebar-button" onClick={onClose}>✖</button>
      </div>

      <div className="sidebar-content">
        {/* Route Generation Controls - Only show if showGenerationControls is true */}
        {showGenerationControls && (
          <div className="generation-controls">
            <h3>Route Generation Options</h3>
            <div className="facility-selector">
              <label>Select Facility:</label>
              <select 
                value={selectedFacility} 
                onChange={(e) => setSelectedFacility(e.target.value)}
              >
                <option value="">Select a facility</option>
                {facilities.map(facility => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="shift-selector">
              <label>Select Shift:</label>
              <select 
                value={selectedShift} 
                onChange={(e) => setSelectedShift(e.target.value)}
              >
                <option value="">Select a shift</option>
                {shiftOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="trip-type-selector">
              <label>Select Trip Type:</label>
              <select 
                value={selectedTripType} 
                onChange={(e) => setSelectedTripType(e.target.value)}
              >
                <option value="">Select trip type</option>
                {tripTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="generate-button">
              <button 
                onClick={handleGenerate}
                disabled={isLoading || !selectedFacility || !selectedShift || !selectedTripType}
              >
                {isLoading ? 'Generating...' : 'Generate Routes'}
              </button>
            </div>
          </div>
        )}

        {/* Route Summary Section */}
        {routesWithDuration.length > 0 && (
          <div className="route-summary">
            {/* <h3>Route Summary</h3> */}
            <div className="summary-stats">
              <div className="stat-item">
                <span className="stat-label">Total Routes:</span>
                <span className="stat-value">{totalRoutes}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Employees:</span>
                <span className="stat-value">{totalEmployees}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Avg. Occupancy:</span>
                <span className="stat-value">{avgOccupancy}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Exceeding 2.5h:</span>
                <span className="stat-value">{exceedingRoutes}</span>
              </div>
            </div>
          </div>
        )}

        {/* Route List */}
        {routes.length > 0 && (
          <div className="route-list">
            <h3>Generated Routes</h3>
            <div className="route-list-content">
              {routes.map(route => (
                <div
                  key={route.uniqueKey}
                  className={`route-item ${selectedRoute?.uniqueKey === route.uniqueKey ? 'selected' : ''}`}
                  onClick={() => onRouteSelect(route)}
                >
                  <div className="route-header">
                    <span className="route-number">Route {route.routeNumber}</span>
                    <span className="route-capacity">Capacity: {route.vehicleCapacity}</span>
                  </div>
                  <div className="route-details">
                    <span className="route-zone">{route.zone}</span>
                    <span className="route-employees">{route.employees.length} employees</span>
                    {route.duration && (
                      <span className="route-duration">
                        Duration: {route.duration} mins
                        {route.exceedsLimit && <span className="duration-warning"> (Exceeds 2.5hr limit!)</span>}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;