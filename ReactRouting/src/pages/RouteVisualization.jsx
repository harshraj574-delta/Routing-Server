import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import ZoneLayer from '../components/ZoneLayer';
import MapComponent from '../components/MapComponent';
import LoadingOverlay from '../components/LoadingOverlay';
import { loadZoneData } from '../utils/dataLoader';
import { calculateRouteDuration } from '../utils/routeCalculations';
import 'leaflet/dist/leaflet.css';
import './RouteVisualization.css';

function RouteVisualization() {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const routeData = location.state?.routes || {};
  const routes = Array.isArray(routeData.routeData) ? routeData.routeData : [];
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [zones, setZones] = useState([]);
  const [highCapacityZones, setHighCapacityZones] = useState(new Set());
  const [routeDurations, setRouteDurations] = useState({});

  const facility = [28.402910, 76.998015];

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const zoneData = await loadZoneData();
        setZones(zoneData.features || []);
        
        // Set initial selected route
        if (routes.length > 0) {
          setSelectedRoute(routes[0]);
        }

        // Calculate durations for all routes
        const durations = {};
        for (const route of routes) {
          if (route.employees?.length > 0) {
            const duration = await calculateRouteDuration(route, facility, routeData.shift || 'morning');
            durations[route.uniqueKey || route.zone] = duration;
          }
        }
        setRouteDurations(durations);

        // Identify high capacity zones based on employee count
        const highCapacityZoneSet = new Set();
        routes.forEach(route => {
          if (route.employees && route.employees.length > routeData.averageOccupancy) {
            highCapacityZoneSet.add(route.zone);
          }
        });
        setHighCapacityZones(highCapacityZoneSet);
      } catch (error) {
        console.error('Failed to load zone data:', error);
        setError('Failed to load zone data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [routes, routeData.averageOccupancy, routeData.shift]);

  return (
    <div className="route-visualization-page">
      {isLoading && <LoadingOverlay />}
      {error && <div className="error-message">{error}</div>}
      
      <div className="route-visualization-content">
        <div className="left-panel">
          <h2>Route Information</h2>
          <div className="route-summary">
            <p data-label="Total Routes">{routeData.totalRoutes || 0}</p>
            <p data-label="Total Employees">{routeData.totalEmployees || 0}</p>
            <p data-label="Average Occupancy">{routeData.averageOccupancy?.toFixed(2) || '0.00'}</p>
            <p data-label="Date">{routeData.date || 'N/A'}</p>
          </div>
          <div className="route-list">
            {Array.isArray(routes) && routes.map((route, index) => (
              <div
                key={route.uniqueKey || `route_${index}`}
                className={`route-item ${selectedRoute === route ? 'selected' : ''}`}
                onClick={() => setSelectedRoute(route)}
              >
                <h3>Route {index + 1} - {route.zone}</h3>
                <p>Employees: {route.employees?.length || 0}</p>
                {route.employees?.length > routeData.averageOccupancy && (
                  <p className="high-capacity-warning">High Capacity Zone</p>
                )}
                {route.employees?.length > 0 && routeDurations[route.uniqueKey || route.zone] && (
                  <div className="route-duration">
                    <p>Total Duration: {routeDurations[route.uniqueKey || route.zone].total} mins</p>
                    <p>Travel Time: {routeDurations[route.uniqueKey || route.zone].travel} mins</p>
                    <p>Pickup Time: {routeDurations[route.uniqueKey || route.zone].pickup} mins</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        <div className="map-container">
          <MapContainer
            center={facility}
            zoom={11}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <ZoneLayer zones={zones} highCapacityZones={highCapacityZones} />
            <MapComponent
              route={selectedRoute}
              facility={facility}
            />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

export default RouteVisualization;