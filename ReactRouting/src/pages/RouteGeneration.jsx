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
    // Ensure profile has all required fields
    const completeProfile = {
      ...profile,
      _id: profile._id || profile.id, // Prioritize MongoDB _id format
      id: profile._id || profile.id, // Keep id for backward compatibility
      shiftTime: profile.shiftTime || '8am-8pm', // Ensure shift time is set
      zonePairingMatrix: profile.zonePairingMatrix || {},
      highCapacityZones: profile.highCapacityZones || []
    };
    setSelectedProfile(completeProfile);
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

      // Initialize route data with profile settings
      const routeData = {
        profileId: selectedProfile._id, // Use MongoDB _id format
        date: new Date().toISOString().split('T')[0],
        shift: selectedProfile.shiftTime || 'morning',
        routeData: []
      };

      // Process zones based on profile settings
      const processedZones = new Set();
      const { zonePairingMatrix = {}, highCapacityZones = [] } = selectedProfile;

      // First, handle clubbed zones if zone clubbing is enabled
      if (selectedProfile.zoneClubbing) {
        Object.entries(zonePairingMatrix).forEach(([zone1, pairedZones]) => {
          if (processedZones.has(zone1)) return;

          pairedZones.forEach(zone2 => {
            if (processedZones.has(zone2)) return;

            // Combine employees from paired zones
            const combinedEmployees = [
              ...(employeesByZone[zone1] || []),
              ...(employeesByZone[zone2] || [])
            ];

            if (combinedEmployees.length === 0) return;

            // Determine vehicle capacity based on zone settings
            const maxCapacity = highCapacityZones.includes(zone1) || highCapacityZones.includes(zone2) ? 12 : 6;

            // Split combined employees into appropriate sized groups
            for (let i = 0; i < combinedEmployees.length; i += maxCapacity) {
              const routeEmployees = combinedEmployees.slice(i, i + maxCapacity);
              const routeNumber = Math.floor(i / maxCapacity) + 1;
              const timestamp = Date.now();
              
              routeData.routeData.push({
                zone: `${zone1}-${zone2}`,
                employees: routeEmployees,
                routeNumber: routeNumber,
                isClubbed: true,
                vehicleCapacity: maxCapacity,
                uniqueKey: `${zone1}_${zone2}_${routeNumber}_${timestamp}`
              });
            }

            processedZones.add(zone1);
            processedZones.add(zone2);
          });
        });
      }

      // Handle remaining zones
      Object.entries(employeesByZone).forEach(([zoneName, zoneEmployees]) => {
        if (processedZones.has(zoneName) || zoneEmployees.length === 0) return;

        // Determine vehicle capacity based on zone settings
        const maxCapacity = highCapacityZones.includes(zoneName) ? 12 : 6;

        // Split employees into groups based on vehicle capacity
        for (let i = 0; i < zoneEmployees.length; i += maxCapacity) {
          const routeEmployees = zoneEmployees.slice(i, i + maxCapacity);
          const routeNumber = Math.floor(i / maxCapacity) + 1;
          const timestamp = Date.now();
          
          routeData.routeData.push({
            zone: zoneName,
            employees: routeEmployees,
            routeNumber: routeNumber,
            isClubbed: false,
            vehicleCapacity: maxCapacity,
            uniqueKey: `${zoneName}_${routeNumber}_${timestamp}`
          });
        }
      });

      // Validate route data before making the API call
      if (routeData.routeData.length === 0) {
        throw new Error('No valid routes could be generated. Please check employee data and zone assignments.');
      }

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