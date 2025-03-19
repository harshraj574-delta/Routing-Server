import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProfileList from '../components/ProfileList';
import Sidebar from '../components/Sidebar';
import LoadingOverlay from '../components/LoadingOverlay';
import { routeService, facilityService, employeeService } from '../services/api';
import { loadZoneData } from '../utils/dataLoader';
import { calculateRouteDuration, calculateRouteDetails } from '../utils/routeCalculations';

function RouteGeneration() {
  const navigate = useNavigate();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [employeeData, setEmployeeData] = useState([]);
  const [zones, setZones] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [facilities, setFacilities] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [zoneData, facilitiesData] = await Promise.all([
          loadZoneData(),
          facilityService.getAll()
        ]);
        setZones(zoneData.features || []);
        setFacilities(facilitiesData);
      } catch (error) {
        console.error('Failed to load data:', error);
        setError('Failed to load zone or facility data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleProfileSelect = async (profile) => {
    const completeProfile = {
      ...profile,
      _id: profile._id || profile.id,
      id: profile._id || profile.id,
      shiftTime: profile.shiftTime || '8am-8pm',
      zonePairingMatrix: profile.zonePairingMatrix || {},
      highCapacityZones: profile.highCapacityZones || []
    };
    setSelectedProfile(completeProfile);
  };

  const handleGenerateRoutes = async ({ facilityId, shift, tripType }) => {
    if (!selectedProfile) {
      setError('Please select a profile first');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Starting route generation with:', { facilityId, shift, tripType });
      
      // Load employees based on selected shift
      const employees = await employeeService.getEmployeeData(shift);
      if (!employees || employees.length === 0) {
        setError('No employees found for the selected shift');
        return;
      }

      console.log(`Found ${employees.length} employees for shift ${shift}`);
      console.log('Sample employee data:', employees[0]); // Log sample employee data
      setEmployeeData(employees);

      const selectedFacility = facilities.find(f => f.id === parseInt(facilityId));
      if (!selectedFacility) {
        throw new Error('Selected facility not found');
      }

      console.log('Selected facility:', selectedFacility);
      const facility = [selectedFacility.geoX, selectedFacility.geoY];
      const BATCH_SIZE = 50;
      const employeesByZone = {};

      // Group employees by zone in batches
      console.log('Starting to group employees by zone...');
      console.log('Available zones:', zones.map(z => z.properties?.Name));
      
      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const zoneName = zone.properties?.Name || 'Unknown Zone';
        console.log(`Processing zone: ${zoneName}`);
        
        // Get zone boundaries
        const zonePolygon = zone.geometry.coordinates[0];
        const zoneEmployees = employees.filter(emp => {
          if (!emp.location) {
            console.log('Employee without location:', emp);
            return false;
          }
          
          // Check if employee location is within zone boundaries
          const isInZone = isPointInPolygon(
            [emp.location.lng, emp.location.lat],
            zonePolygon
          );
          
          if (isInZone) {
            console.log(`Employee ${emp.id} assigned to zone ${zoneName}`);
          }
          
          return isInZone;
        }).map(emp => ({
          id: emp.id,
          name: emp.name,
          zone: zoneName,
          address: emp.address || 'No address provided',
          location: emp.location,
          gender: emp.gender,
          shift: emp.shift
        }));

        if (zoneEmployees.length > 0) {
          employeesByZone[zoneName] = zoneEmployees;
          console.log(`Found ${zoneEmployees.length} employees in zone ${zoneName}`);
          if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.log('Employees grouped by zone:', Object.keys(employeesByZone));
      console.log('Zone assignments:', Object.entries(employeesByZone).map(([zone, emps]) => 
        `${zone}: ${emps.length} employees`
      ));

      if (Object.keys(employeesByZone).length === 0) {
        setError('No employees found in any zones. Please check zone assignments.');
        return;
      }

      const routeData = {
        profileId: selectedProfile._id,
        date: new Date().toISOString().split('T')[0],
        shift,
        tripType,
        facilityId: parseInt(facilityId),
        routeData: []
      };

      console.log('Starting route generation with profile:', selectedProfile);

      const processedZones = new Set();
      const { zonePairingMatrix = {}, highCapacityZones = [] } = selectedProfile;

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
        console.log('Processing zones with clubbing enabled');
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

            console.log(`Processing clubbed zones: ${zone1}-${zone2} with ${combinedEmployees.length} employees`);

            const maxCapacity = highCapacityZones.includes(zone1) || 
                               highCapacityZones.includes(zone2) ? 12 : 6;

            for (let j = 0; j < combinedEmployees.length; j += BATCH_SIZE) {
              const batch = combinedEmployees.slice(j, j + BATCH_SIZE);
              const routes = await processEmployeeBatch(batch, maxCapacity, facility, calculateDistance);
              routeData.routeData.push(...routes.map(route => ({
                ...route,
                zone: `${zone1}-${zone2}`,
                isClubbed: true
              })));

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

      console.log('Processing remaining zones:', remainingZones.map(([zone]) => zone));

      for (let i = 0; i < remainingZones.length; i++) {
        const [zoneName, zoneEmployees] = remainingZones[i];
        if (zoneEmployees.length === 0) continue;

        console.log(`Processing zone ${zoneName} with ${zoneEmployees.length} employees`);

        const maxCapacity = highCapacityZones.includes(zoneName) ? 12 : 6;

        for (let j = 0; j < zoneEmployees.length; j += BATCH_SIZE) {
          const batch = zoneEmployees.slice(j, j + BATCH_SIZE);
          const routes = await processEmployeeBatch(batch, maxCapacity, facility, calculateDistance);
          routeData.routeData.push(...routes.map(route => ({
            ...route,
            zone: zoneName,
            isClubbed: false
          })));

          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      console.log(`Generated ${routeData.routeData.length} routes`);

      if (routeData.routeData.length === 0) {
        throw new Error('No valid routes could be generated. Please check employee data and zone assignments.');
      }

      // After generating routes, calculate pickup and drop times
      for (const route of routeData.routeData) {
        // Ensure routeData is structured correctly
        const routeCoordinates = route.employees.map(emp => [emp.location.lat, emp.location.lng]);
        
        // Add the facility coordinates to the routeCoordinates
        const facilityCoordinates = [facility[0], facility[1]]; // Assuming facility is defined as [lat, lng]
        const allCoordinates = [facilityCoordinates,...routeCoordinates];

        const durationDetails = await calculateRouteDetails(allCoordinates, route.employees);
        
        // Log the duration details for debugging
        console.log('Duration Details:', durationDetails);

        // Check if durationDetails has employees and is an array
        if (Array.isArray(durationDetails.employees)) {
          // Update each employee with pickup and drop times
          route.employees = route.employees.map((emp, index) => ({
            ...emp,
            pickupTime: durationDetails.employees[index]?.pickupTime || 'N/A',
            dropTime: durationDetails.employees[index]?.dropTime || 'N/A'
          }));
        } else {
          console.warn('No employees found in duration details:', durationDetails);
          // Handle the case where employees are not available
          route.employees = route.employees.map(emp => ({
            ...emp,
            pickupTime: 'N/A',
            dropTime: 'N/A'
          }));
        }
      }

      console.log('Creating routes in database...', routeData);
      const generatedRoutes = await routeService.create(routeData);
      console.log('Routes created successfully:', generatedRoutes);
      setRoutes(generatedRoutes);
      
      // Navigate to the route visualization page with all necessary data
      console.log('Navigating to route visualization page...');
      navigate(`/routes/${selectedProfile.id}`, { 
        state: { 
          routes: generatedRoutes,
          profile: selectedProfile,
          facility: selectedFacility,
          shift,
          tripType,
          employeeData: employees
        } 
      });
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

    // Helper function to calculate direction vector
    const calculateDirectionVector = (from, to) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      return magnitude > 0 ? [dx / magnitude, dy / magnitude] : [0, 0];
    };

    // Helper function to calculate direction similarity
    const calculateDirectionSimilarity = (dir1, dir2) => {
      return dir1[0] * dir2[0] + dir1[1] * dir2[1];
    };

    let remainingEmployees = [...validEmployees];
    
    while (remainingEmployees.length > 0) {
      const routeEmployees = [];
      
      // Start with the farthest employee from facility
      remainingEmployees.sort((a, b) => {
        const distA = calculateDistance([a.location.lat, a.location.lng], facility);
        const distB = calculateDistance([b.location.lat, b.location.lng], facility);
        return distB - distA;
      });

      const firstEmployee = remainingEmployees.shift();
      routeEmployees.push(firstEmployee);

      // Try to fill the route up to maxCapacity
      while (routeEmployees.length < maxCapacity && remainingEmployees.length > 0) {
        const currentEmployee = routeEmployees[routeEmployees.length - 1];
        const lastPickup = [currentEmployee.location.lng, currentEmployee.location.lat];
        const directionToFacility = calculateDirectionVector(lastPickup, facility);

        // Score each remaining employee
        const scoredEmployees = remainingEmployees.map(emp => {
          const distance = calculateDistance(
            [currentEmployee.location.lat, currentEmployee.location.lng],
            [emp.location.lat, emp.location.lng]
          );
          const direction = calculateDirectionVector(lastPickup, [emp.location.lng, emp.location.lat]);
          const directionScore = calculateDirectionSimilarity(direction, directionToFacility);
          
          // Score calculation:
          // Lower score is better
          // Distance * (2 - directionScore) means:
          // - Shorter distances are preferred
          // - Better direction alignment (directionScore closer to 1) reduces the effective distance
          const score = distance * (2 - directionScore);
          
          return { emp, score };
        });

        // Sort by score (lower is better)
        scoredEmployees.sort((a, b) => a.score - b.score);
        const nextEmployee = scoredEmployees[0].emp;

        routeEmployees.push(nextEmployee);
        remainingEmployees = remainingEmployees.filter(emp => emp !== nextEmployee);
      }
  
      routes.push({
        employees: routeEmployees,
        routeNumber: routes.length + 1,
        vehicleCapacity: maxCapacity,
        uniqueKey: `${routeEmployees[0].zone}_${routes.length + 1}_${Date.now()}`
      });
    }
  
    return routes;
  };

  const handleRouteSelect = (route) => {
    setSelectedRoute(route);
  };

  // Helper function to check if a point is inside a polygon
  const isPointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > point[1]) !== (yj > point[1]))
          && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
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
                showGenerationControls={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RouteGeneration;