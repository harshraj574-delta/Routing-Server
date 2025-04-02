import React, { useState, useEffect } from 'react';
import { routeService } from '../services/api';

function RouteDebugger({ routeId }) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchRouteData() {
      try {
        setLoading(true);
        const data = await routeService.getById(routeId);
        setRoute(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (routeId) {
      fetchRouteData();
    }
  }, [routeId]);

  if (loading) return <div>Loading route data...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!route) return <div>No route data available</div>;

  return (
    <div style={{ margin: '20px', padding: '20px', border: '1px solid #ccc' }}>
      <h2>Route Debug Information</h2>
      <div>
        <h3>Basic Info</h3>
        <p>ID: {route.id}</p>
        <p>UUID: {route.uuid}</p>
        <p>Trip Type: {route.tripType || 'Not specified'}</p>
        <p>Date: {route.date}</p>
        <p>Shift: {route.shift}</p>
      </div>
      
      <div>
        <h3>Route Data ({route.routeData?.length || 0} routes)</h3>
        {route.routeData && route.routeData.map((r, i) => (
          <div key={i} style={{ margin: '10px 0', padding: '10px', border: '1px solid #ddd' }}>
            <p>Route #{r.routeNumber || i + 1}</p>
            <p>Zone: {r.zone || 'Unknown'}</p>
            <p>Employees: {r.employees?.length || 0}</p>
            <p>Trip Type: {r.tripType || route.tripType || 'Not specified'}</p>
            <p>Has Geometry: {r.geometry ? 'Yes' : 'No'}</p>
            {r.geometry && (
              <div>
                <p>Geometry Type: {r.geometry.type}</p>
                <p>Coordinates: {r.geometry.coordinates?.length || 0} points</p>
                <p>First Point: {JSON.stringify(r.geometry.coordinates?.[0] || 'None')}</p>
                <p>Last Point: {JSON.stringify(r.geometry.coordinates?.[r.geometry.coordinates.length - 1] || 'None')}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default RouteDebugger; 