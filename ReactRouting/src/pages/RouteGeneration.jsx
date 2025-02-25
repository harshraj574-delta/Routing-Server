import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProfileList from '../components/ProfileList';
import Sidebar from '../components/Sidebar';
import LoadingOverlay from '../components/LoadingOverlay';
import { routeService } from '../services/api';
import { loadEmployeeData, loadZoneData } from '../utils/dataLoader';

function RouteGeneration() {
  const navigate = useNavigate();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [employeeData, setEmployeeData] = useState([]);
  const [zones, setZones] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [employees, zoneData] = await Promise.all([
          loadEmployeeData(),
          loadZoneData()
        ]);
        setEmployeeData(employees);
        setZones(zoneData.features || []);
      } catch (error) {
        console.error('Failed to load data:', error);
        setError('Failed to load employee or zone data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleProfileSelect = async (profile) => {
    setSelectedProfile(profile);
  };

  const handleGenerateRoutes = async () => {
    if (!selectedProfile) {
      setError('Please select a profile first');
      return;
    }

    if (employeeData.length === 0) {
      setError('No employee data available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Structure the route data as expected by the backend
      // Group employees by zone
      const employeesByZone = {};
      zones.forEach(zone => {
        const zoneName = zone.properties?.Name || 'Unknown Zone';
        employeesByZone[zoneName] = employeeData
          .filter(emp => emp.zone === zoneName)
          .map(emp => ({
            id: emp.id,
            name: emp.name,
            zone: emp.zone,
            address: emp.address || 'No address provided',
            location: emp.location // Include location coordinates
          }));
      });

      // Split zones with more than 6 employees into multiple routes
      const routeData = {
        profileId: selectedProfile.id,
        date: new Date().toISOString().split('T')[0],
        shift: 'morning',
        routeData: []
      };

      Object.entries(employeesByZone).forEach(([zoneName, zoneEmployees]) => {
        if (zoneEmployees.length === 0) return;

        // Split employees into groups of maximum 6
        for (let i = 0; i < zoneEmployees.length; i += 6) {
          const routeEmployees = zoneEmployees.slice(i, i + 6);
          const routeNumber = Math.floor(i / 6) + 1;
          const timestamp = Date.now(); // Add timestamp for uniqueness
          routeData.routeData.push({
            zone: zoneName,
            employees: routeEmployees,
            routeNumber: routeNumber,
            uniqueKey: `${zoneName}_${routeNumber}_${timestamp}` // Add timestamp to make key truly unique
          });
        }
      });

      const generatedRoutes = await routeService.create(routeData);
      setRoutes(generatedRoutes);
      console.log("these are the generated routes", generatedRoutes);
      navigate(`/routes/${selectedProfile.id}`, { state: { routes: generatedRoutes } });
    } catch (error) {
      console.error('Failed to generate routes:', error);
      setError('Failed to generate routes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRouteSelect = (route) => {
    setSelectedRoute(route);
  };

  return (
    <div className="route-generation-page">
      {isLoading && <LoadingOverlay />}
      {error && <div className="error-message">{error}</div>}
      
      <div className="route-generation-content">
        <div className="route-generation-layout">
          <ProfileList onProfileSelect={handleProfileSelect} />
          {selectedProfile && (
            <div className="generation-controls">
              <Sidebar
                employeeData={employeeData}
                zones={zones}
                onGenerateRoutes={handleGenerateRoutes}
                selectedProfile={selectedProfile}
                routes={routes}
                onRouteSelect={handleRouteSelect}
                selectedRoute={selectedRoute}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RouteGeneration;