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
        console.log('Employee data with shift times:', employees);
        setEmployeeData(employees);
        console.log("employees",employees);
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
      // Process data in smaller batches to prevent UI freezing
      const BATCH_SIZE = 50;
      const employeesByZone = {};
  
      // Group employees by zone in batches
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const zoneName = zone.properties?.Name || 'Unknown Zone';
        const zoneEmployees = employeeData
          .filter(emp => emp.zone === zoneName)
          .map(emp => ({
            id: emp.id,
            name: emp.name,
            zone: emp.zone,
            address: emp.address || 'No address provided',
            location: emp.location,
            gender: emp.gender,
            shift: emp.shift
          }));
  
        if (zoneEmployees.length > 0) {
          employeesByZone[zoneName] = zoneEmployees;
          // Allow UI to update every few zones
          if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
  
      const routeData = {
        profileId: selectedProfile._id,
        date: new Date().toISOString().split('T')[0],
        shift: selectedProfile.shiftTime || 'morning',
        routeData: []
      };
  
      const processedZones = new Set();
      const { zonePairingMatrix = {}, highCapacityZones = [] } = selectedProfile;
      const facility = [28.402910, 76.998015];
  
      // Cache distance calculations
      const distanceCache = new Map();
      const calculateDistance = (point1, point2) => {
        const key = `${point1[0]},${point1[1]}-${point2[0]},${point2[1]}`;
        if (!distanceCache.has(key)) {
          distanceCache.set(key, Math.sqrt(
            Math.pow(point2[0] - point1[0], 2) +
            Math.pow(point2[1] - point1[1], 2)
          ));
        }
        return distanceCache.get(key);
      };
  
      // Process zones in batches
      if (selectedProfile.zoneClubbing) {
        const zonePairs = Object.entries(zonePairingMatrix);
        for (let i = 0; i < zonePairs.length; i++) {
          const [zone1, pairedZones] = zonePairs[i];
          if (processedZones.has(zone1)) continue;
  
          for (const zone2 of pairedZones) {
            if (processedZones.has(zone2)) continue;
  
            const combinedEmployees = [
              ...(employeesByZone[zone1] || []),
              ...(employeesByZone[zone2] || [])
            ];
  
            if (combinedEmployees.length === 0) continue;
  
            const maxCapacity = highCapacityZones.includes(zone1) || 
                               highCapacityZones.includes(zone2) ? 12 : 6;
  
            // Process employees in batches
            for (let j = 0; j < combinedEmployees.length; j += BATCH_SIZE) {
              const batch = combinedEmployees.slice(j, j + BATCH_SIZE);
              const routes = await processEmployeeBatch(batch, maxCapacity, facility, calculateDistance);
              routeData.routeData.push(...routes.map(route => ({
                ...route,
                zone: `${zone1}-${zone2}`,
                isClubbed: true
              })));
  
              // Allow UI to update between batches
              await new Promise(resolve => setTimeout(resolve, 0));
            }
  
            processedZones.add(zone1);
            processedZones.add(zone2);
          }
        }
      }
  
      // Handle remaining zones in batches
      const remainingZones = Object.entries(employeesByZone)
        .filter(([zoneName]) => !processedZones.has(zoneName));
  
      for (let i = 0; i < remainingZones.length; i++) {
        const [zoneName, zoneEmployees] = remainingZones[i];
        if (zoneEmployees.length === 0) continue;
  
        const maxCapacity = highCapacityZones.includes(zoneName) ? 12 : 6;
  
        // Process employees in batches
        for (let j = 0; j < zoneEmployees.length; j += BATCH_SIZE) {
          const batch = zoneEmployees.slice(j, j + BATCH_SIZE);
          const routes = await processEmployeeBatch(batch, maxCapacity, facility, calculateDistance);
          routeData.routeData.push(...routes.map(route => ({
            ...route,
            zone: zoneName,
            isClubbed: false
          })));
  
          // Allow UI to update between batches
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
  
      if (routeData.routeData.length === 0) {
        throw new Error('No valid routes could be generated. Please check employee data and zone assignments.');
      }
  
      const generatedRoutes = await routeService.create(routeData);
      setRoutes(generatedRoutes);
      navigate(`/routes/${selectedProfile.id}`, { state: { routes: generatedRoutes } });
    } catch (error) {
      console.error('Failed to generate routes:', error);
      setError('Failed to generate routes. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  const processEmployeeBatch = async (employees, maxCapacity, facility, calculateDistance) => {
    const routes = [];
    
    // Validate and filter employees with valid locations
    const validEmployees = employees.filter(emp => {
      return emp.location && 
             typeof emp.location.lat === 'number' && 
             typeof emp.location.lng === 'number' && 
             !isNaN(emp.location.lat) && 
             !isNaN(emp.location.lng);
    });

    if (validEmployees.length === 0) {
      console.warn('No valid employee locations found in batch');
      return [];
    }

    // Sort employees by distance from facility (farthest first)
    validEmployees.sort((a, b) => {
      const distA = calculateDistance([a.location.lat, a.location.lng], facility);
      const distB = calculateDistance([b.location.lat, b.location.lng], facility);
      return distB - distA;
    });
  
    // Create routes for this batch
    for (let i = 0; i < validEmployees.length; i += maxCapacity) {
      const routeGroup = validEmployees.slice(i, i + maxCapacity);
      const routeEmployees = [routeGroup[0]];
      let currentEmployee = routeGroup[0];
      const remainingEmployees = routeGroup.slice(1);
  
      // Build sequence
      while (remainingEmployees.length > 0) {
        let bestScore = -1;
        let bestIndex = -1;
  
        remainingEmployees.forEach((emp, index) => {
          const distance = calculateDistance(
            [currentEmployee.location.lat, currentEmployee.location.lng],
            [emp.location.lat, emp.location.lng]
          );
          const score = 1 / (distance + 0.1);
  
          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });
  
        if (bestIndex !== -1) {
          const bestEmployee = remainingEmployees[bestIndex];
          routeEmployees.push(bestEmployee);
          remainingEmployees.splice(bestIndex, 1);
          currentEmployee = bestEmployee;
        }
      }
  
      routes.push({
        employees: routeEmployees,
        routeNumber: Math.floor(i / maxCapacity) + 1,
        vehicleCapacity: maxCapacity,
        uniqueKey: `${routeEmployees[0].zone}_${Math.floor(i / maxCapacity) + 1}_${Date.now()}`
      });
    }
  
    return routes;
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