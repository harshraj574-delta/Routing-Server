import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { routeService } from '../services/api';
import LoadingOverlay from '../components/LoadingOverlay';
import './GeneratedRoutes.css';

function GeneratedRoutes() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        console.log('Attempting to fetch routes...');
        
        setLoading(true);
        
        try {
          const healthResponse = await fetch('http://localhost:5001/api/health');
          console.log('Server health check:', await healthResponse.text());
          
          // Also check database directly
          const dbResponse = await fetch('http://localhost:5001/api/debug/database');
          console.log('Database check:', await dbResponse.json());
        } catch (err) {
          console.error('Server health check failed:', err);
        }
        
        try {
          console.log('Making API request to get all routes...');
          const fetchedRoutes = await routeService.getAllRoutes();
          console.log('Fetched routes:', fetchedRoutes);
          
          if (!fetchedRoutes || fetchedRoutes.length === 0) {
            setError('No routes found. Please generate some routes first.');
          } else {
            setRoutes(fetchedRoutes);
          }
        } catch (err) {
          console.error('Error fetching routes:', err);
          setError(`Failed to fetch routes: ${err.message || 'Unknown error'}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, []);

  const handleRouteClick = (route) => {
    navigate(`/routes/${route.uuid}`, {
      state: {
        routes: route,
        profile: route.profile,
        facility: route.facility,
        shift: route.shift,
        tripType: route.tripType,
        employeeData: route.employeeData
      }
    });
  };

  if (loading) return <LoadingOverlay />;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="generated-routes-page">
      <h1>Generated Routes</h1>
      <div className="routes-grid">
        {routes.map((route) => (
          <div 
            key={route.uuid} 
            className="route-card"
            onClick={() => handleRouteClick(route)}
          >
            <h3>Route {new Date(route.date).toLocaleDateString()}</h3>
            <div className="route-info">
              <p>Profile: {route.profile?.name || 'N/A'}</p>
              <p>Shift: {route.shift}</p>
              <p>Trip Type: {route.tripType}</p>
              <p>Total Routes: {route.totalRoutes}</p>
              <p>Date Generated: {new Date(route.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GeneratedRoutes; 