import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useMap, Polyline, Marker, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import './MapComponent.css';

const createEmployeeIcon = (gender, order) => {
  const genderClass = gender && typeof gender === 'string' ? gender.toLowerCase() : 'unknown';
  return L.divIcon({
    html: `<div class="employee-icon ${genderClass}" style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      color: white;
      font-weight: bold;
      border: 2px solid white;
      box-shadow: 0 0 5px rgba(0,0,0,0.3);
    ">${order}</div>`,
    className: 'custom-employee-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
};

const facilityIcon = L.divIcon({
  html: `<div style="
    background-color: #FF0000;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    font-weight: bold;
    border: 2px solid white;
    box-shadow: 0 0 5px rgba(0,0,0,0.3);
  ">F</div>`,
  className: 'custom-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

function MapComponent({ route, facility, onEmployeeSelect, fromSaved = false }) {
  const map = useMap();
  const [routePath, setRoutePath] = useState([]);
  const [zoneData, setZoneData] = useState(null);
  const markersRef = useRef([]);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [tripType, setTripType] = useState(route?.tripType || 'pickup');
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Memoize employee coordinates
  const employeeCoordinates = useMemo(() => {
    if (!route?.employees?.length) return [];
    return route.employees.map(emp => 
      emp.location ? [emp.location.lat, emp.location.lng] : [28.4, 77.0]
    );
  }, [route?.employees]);

  // Memoize all coordinates including facility
  const allCoordinates = useMemo(() => {
    if (!employeeCoordinates.length) return [];
    return [...employeeCoordinates, facility];
  }, [employeeCoordinates, facility]);

  // Cleanup function to remove markers
  const cleanupMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

  // Load zone data only once
  useEffect(() => {
    let isMounted = true;
    fetch('/delhi_ncr_zones.json')
      .then(response => response.json())
      .then(data => {
        if (isMounted) {
          setZoneData(data);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Function to calculate OSRM route (used for newly generated routes)
  const calculateOsrmRoute = async (coordinates) => {
    try {
      // Ensure the facility is always the last point for pickup trips
      if (tripType.toLowerCase() === 'pickup' || 
          tripType.toLowerCase() === 'round' || 
          tripType.toLowerCase() === 'roundtrip') {
        // Remove facility if it's already in the coordinates
        const withoutFacility = coordinates.filter(coord => 
          !(coord[0] === facility[0] && coord[1] === facility[1])
        );
        // Add facility as the last point
        coordinates = [...withoutFacility, facility];
      }

      // If more than 25 waypoints, OSRM might have issues, so break it into segments
      if (coordinates.length > 25) {
        console.log('Large number of waypoints detected, breaking into segments');
        
        // First and last points are always included
        const start = coordinates[0];
        const end = coordinates[coordinates.length - 1];
        
        // Maximum waypoints per request (including start and end)
        const MAX_WAYPOINTS = 23; // 25 - 2 for start and end
        
        // Number of intermediate points to select
        const numIntermediatePoints = Math.min(MAX_WAYPOINTS, coordinates.length - 2);
        
        // Select evenly spaced intermediate points
        const selectedIndices = [];
        if (coordinates.length > 2) {
          const step = (coordinates.length - 2) / numIntermediatePoints;
          for (let i = 0; i < numIntermediatePoints; i++) {
            const index = 1 + Math.round(i * step);
            if (index > 0 && index < coordinates.length - 1) {
              selectedIndices.push(index);
            }
          }
        }
        
        // Create simplified waypoints array
        const simplifiedCoordinates = [
          start,
          ...selectedIndices.map(idx => coordinates[idx]),
          end
        ];
        
        console.log(`Simplified ${coordinates.length} waypoints to ${simplifiedCoordinates.length}`);
        coordinates = simplifiedCoordinates;
      }
      
      // Create the OSRM request format - requires [lng, lat] pairs
      const waypoints = coordinates.map(point => {
        // Handle different point formats
        if (Array.isArray(point)) {
          return `${point[1]},${point[0]}`; // [lat, lng] → "lng,lat"
        } else if (point && typeof point === 'object') {
          return `${point.lng},${point.lat}`; // {lat, lng} → "lng,lat"
        }
        return null;
      }).filter(Boolean).join(';');
      
      if (!waypoints) {
        throw new Error('No valid waypoints provided');
      }
      
      console.log('Requesting OSRM route with waypoints:', waypoints);
      
      // Try to fetch with the full path first
      let response = await fetch(`http://localhost:5000/route/v1/driving/${waypoints}?overview=full&geometries=polyline`);
      
      // If that fails, try with fewer details
      if (!response.ok) {
        console.warn('Initial OSRM request failed, trying simplified request');
        response = await fetch(`http://localhost:5000/route/v1/driving/${waypoints}?overview=simplified&geometries=polyline`);
      }
      
      if (!response.ok) {
        throw new Error(`OSRM service error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
        throw new Error('Invalid OSRM response');
      }
      
      // Decode the polyline
      const polyline = data.routes[0].geometry;
      const decodedCoordinates = decodePolyline(polyline);
      
      console.log('OSRM returned polyline with', decodedCoordinates.length, 'points');
      return decodedCoordinates;
    } catch (error) {
      console.error('OSRM route calculation failed:', error);
      return null;
    }
  };

  // Polyline decoder helper function
  const decodePolyline = (encoded) => {
    // This is a modified version of the algorithm provided by OSRM
    let index = 0;
    const len = encoded.length;
    const decoded = [];
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
      
      shift = 0;
      result = 0;
      
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      
      // Convert to [lat, lng] format for Leaflet
      decoded.push([lat * 1e-5, lng * 1e-5]);
    }
    
    return decoded;
  };

  // Handle route changes
  useEffect(() => {
    if (!route) return;
    
    console.log('MapComponent render with route:', route);
    console.log('fromSaved:', fromSaved);
    console.log('Trip type:', route.tripType || 'pickup');
    console.log('Has geometry?', route.geometry ? 'Yes' : 'No');
    
    // Update the local trip type when route changes
    setTripType(route.tripType || 'pickup');
    
    const bounds = new L.LatLngBounds();
    
    // Add facility to bounds
    if (facility && Array.isArray(facility) && facility.length === 2) {
      bounds.extend([facility[0], facility[1]]);
    }
    
    // Add employees to bounds
    if (route.employees && route.employees.length > 0) {
      route.employees.forEach(employee => {
        if (employee.location && employee.location.lat && employee.location.lng) {
          bounds.extend([employee.location.lat, employee.location.lng]);
        }
      });
    }
    
    const processRoute = async () => {
      if (!route) return;
      
      console.log('Processing route:', route);
      const bounds = new L.LatLngBounds();
      
      // Always use the stored road geometry if available, otherwise fall back to basic geometry
      if (route.roadGeometry && 
          route.roadGeometry.coordinates && 
          Array.isArray(route.roadGeometry.coordinates)) {
        console.log('Using stored road geometry');
        
        const roadPath = route.roadGeometry.coordinates.map(coord => [coord[1], coord[0]]);
        setRoutePath(roadPath);
        
        // Add path points to bounds
        roadPath.forEach(point => bounds.extend(point));
      } else if (route.geometry && 
                 route.geometry.coordinates && 
                 Array.isArray(route.geometry.coordinates)) {
        // Fallback to basic geometry
        console.log('Using basic geometry (fallback)');
        
        const basicPath = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        setRoutePath(basicPath);
        
        // Add points to bounds
        basicPath.forEach(point => bounds.extend(point));
      }
      
      // Add employee markers to bounds
      if (route.employees) {
        route.employees.forEach(emp => {
          if (emp.location && emp.location.lat && emp.location.lng) {
            bounds.extend([emp.location.lat, emp.location.lng]);
          }
        });
      }
      
      // Add facility to bounds
      if (facility) {
        bounds.extend(facility);
      }
      
      // Fit bounds
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    };
    
    processRoute();
  }, [route, facility, map, fromSaved]);

  // Memoize GeoJSON style
  const geoJsonStyle = useCallback((feature) => ({
    fillColor: feature.properties.fill || '#3388ff',
    fillOpacity: 0.3,
    weight: 2,
    opacity: 1,
    color: 'white',
    dashArray: '4 4'
  }), []);

  // Add a recalculate function
  const recalculateRoadRoute = async () => {
    if (!route || !facility || isRecalculating) return;
    
    setIsRecalculating(true);
    
    try {
      // Get waypoints from employees and facility
      const waypoints = [];
      
      // Start with employee locations
      if (route.employees && Array.isArray(route.employees)) {
        route.employees.forEach(emp => {
          if (emp.location && emp.location.lat && emp.location.lng) {
            waypoints.push([emp.location.lat, emp.location.lng]);
          }
        });
      }
      
      // Always end at the facility
      waypoints.push(facility);
      
      if (waypoints.length >= 2) {
        // Call OSRM to get proper road-following path
        const osrmPath = await calculateOsrmRoute(waypoints);
        
        if (osrmPath && osrmPath.length > 0) {
          console.log('Successfully recalculated OSRM road-following path');
          setRoutePath(osrmPath);
          setIsUsingFallback(false);
          
          // Fit bounds to new path
          const bounds = new L.LatLngBounds();
          osrmPath.forEach(point => bounds.extend(point));
          map.fitBounds(bounds, { padding: [50, 50] });
        } else {
          console.warn('OSRM returned empty path');
          alert('Failed to calculate road-following route. Server might be unavailable.');
        }
      }
    } catch (error) {
      console.error('Error recalculating route:', error);
      alert('Failed to calculate road-following route. Server might be unavailable.');
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div className="map-container">
      <div id="map" className="map"></div>
      {/* Render facility marker */}
      {facility && (
        <Marker 
          position={[facility[0], facility[1]]} 
          icon={facilityIcon}
        >
          <Popup>
            <div>
              <h3>Facility</h3>
              <p>Main pickup/drop-off location</p>
            </div>
          </Popup>
        </Marker>
      )}
      
      {/* Render route polyline with Google Maps style */}
      {routePath.length > 1 && (
        <Polyline
          positions={routePath}
          color="#4285F4"  // Google Maps blue color
          weight={4}       // Line thickness
          opacity={0.8}    // Slight transparency
        >
          <Popup>
            {isUsingFallback ? 
              "Using simplified route" : 
              "Using road-following route"}
          </Popup>
        </Polyline>
      )}
      
      {/* Route quality indicator */}
      {routePath.length > 0 && (
        <div className={`route-quality-indicator ${isUsingFallback ? 'fallback' : 'optimal'}`}>
          {isUsingFallback ? 
            "Using simplified route" : 
            "Using road-following route"}
          {fromSaved && isUsingFallback && 
            " (OSRM service not available to calculate actual road paths)"}
        </div>
      )}
      
      {/* Recalculate button */}
      {isUsingFallback && (
        <button 
          className="recalculate-route-btn"
          onClick={recalculateRoadRoute}
          disabled={isRecalculating}
        >
          {isRecalculating ? 'Calculating...' : 'Show Road-Following Route'}
        </button>
      )}
      
      {/* Render employee markers */}
      {route && route.employees && route.employees.map((employee, index) => (
        employee.location && employee.location.lat && employee.location.lng ? (
          <Marker
            key={`emp-${employee.id || index}`}
            position={[employee.location.lat, employee.location.lng]}
            icon={createEmployeeIcon(employee.gender, index + 1)}
            eventHandlers={{
              click: () => onEmployeeSelect && onEmployeeSelect(employee)
            }}
          >
            <Popup>
              <div>
                <h3>{employee.name || `Employee ${index + 1}`}</h3>
                <p><strong>Pickup Order: #{employee.pickupOrder || index + 1}</strong></p>
                <p>{employee.address || 'No address'}</p>
                {employee.pickupTime && (
                  <p>Pickup: {employee.pickupTime}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ) : null
      ))}
      
      {/* Render zone data */}
      {zoneData && (
        <GeoJSON 
          data={zoneData}
          style={geoJsonStyle}
        />
      )}
    </div>
  );
}

export default MapComponent;