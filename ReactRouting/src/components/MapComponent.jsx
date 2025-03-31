import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useMap, Polyline , GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import './MapComponent.css';

const createEmployeeIcon = (gender, order) => {
  const genderClass = gender && typeof gender === 'string' ? gender.toLowerCase() : 'unknown';
  return L.divIcon({
    className: `employee-icon ${genderClass}`,
    iconSize: [36, 18],
    iconAnchor: [18, 9],
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

function MapComponent({ route, facility, onEmployeeSelect }) {
  const map = useMap();
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [zoneData, setZoneData] = useState(null);
  const markersRef = useRef([]);

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

  // Handle route changes
  useEffect(() => {
    if (!route?.employees?.length) return;

    cleanupMarkers();

    const setupMarkersAndRoute = async () => {
      try {
        // Add employee markers
        const newMarkers = route.employees.map((emp, index) => {
          const coords = employeeCoordinates[index];
          const icon = createEmployeeIcon(emp.gender, index + 1);
          const marker = L.marker(coords, { icon })
            .addTo(map)
            .bindPopup(`<div class="popup-content">
              <h3>${emp.name}</h3>
              <p><strong>ID:</strong> ${emp.id}</p>
              <p><strong>Gender:</strong> ${emp.gender}</p>
              <p><strong>Pick-up Time:</strong> ${emp.pickupTime || 'N/A'}</p>
              <p><strong>Pick-up Order:</strong> ${index + 1}</p>
            </div>`);

          marker.on('click', () => {
            onEmployeeSelect(emp);
            marker.openPopup();
          });

          return marker;
        });

        // Add facility marker
        const facilityMarker = L.marker(facility, { icon: facilityIcon })
          .addTo(map)
          .bindPopup('<div class="popup-content"><h3>Facility</h3></div>');

        // Store all markers
        markersRef.current = [...newMarkers, facilityMarker];

        // Fit bounds to show all markers
        const bounds = L.latLngBounds(allCoordinates);
        map.fitBounds(bounds, { padding: [50, 50] });

        // Calculate and draw route
        const waypointsString = allCoordinates.map(point => `${point[1]},${point[0]}`).join(';');
        
        try {
          const response = await fetch(`http://localhost:5000/route/v1/driving/${waypointsString}?overview=full&geometries=geojson`);
          if (!response.ok) throw new Error('Failed to fetch route');
          const data = await response.json();
          console.log('Route data:', data);
          
          if (data.routes && data.routes[0]) {
            const routeLayer = L.geoJSON(data.routes[0].geometry, {
              style: {
                color: '#4169E1',
                weight: 3,
                opacity: 0.8
              }
            }).addTo(map);
            
            markersRef.current.push(routeLayer);
            setRouteCoordinates(data.routes[0].geometry.coordinates);
          }
        } catch (error) {
          console.error('Error fetching route:', error);
        }
      } catch (error) {
        console.error('Error in setupMarkersAndRoute:', error);
      }
    };

    setupMarkersAndRoute();

    return () => {
      cleanupMarkers();
    };
  }, [route, facility, map, employeeCoordinates, allCoordinates, onEmployeeSelect, cleanupMarkers]);

  // Memoize GeoJSON style
  const geoJsonStyle = useCallback((feature) => ({
    fillColor: feature.properties.fill || '#3388ff',
    fillOpacity: 0.3,
    weight: 2,
    opacity: 1,
    color: 'white',
    dashArray: '4 4'
  }), []);

  return (
    <>
      {routeCoordinates.length > 0 && (
        <Polyline
          positions={routeCoordinates}
          color="#2196F3"
          weight={3}
          opacity={0.7}
        />
      )}
      {zoneData && <GeoJSON 
        data={zoneData}
        style={geoJsonStyle}
      />}
    </>
  );
}

export default React.memo(MapComponent);