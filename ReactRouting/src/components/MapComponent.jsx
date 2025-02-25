import React, { useEffect, useState } from 'react';
import { useMap, Marker, Polyline, Popup, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import './MapComponent.css';

// Create custom icons
const maleEmployeeIcon = L.divIcon({
  className: 'employee-icon male',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const femaleEmployeeIcon = L.divIcon({
  className: 'employee-icon female',
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

const facilityIcon = L.divIcon({
  className: 'facility-icon',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

function MapComponent({ route, facility }) {
  const map = useMap();
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [key, setKey] = useState(0);
  const [zoneData, setZoneData] = useState(null);

  useEffect(() => {
    // Load zone data
    fetch('/delhi_ncr_zones.json')
      .then(response => response.json())
      .then(data => setZoneData(data));

    // Add facility marker if coordinates are available
    if (facility) {
      const facilityMarker = L.marker([facility[0], facility[1]], { icon: facilityIcon })
        .addTo(map)
        .bindPopup('Facility Location');
    }
  }, [facility, map]);

  // Store markers reference
  const [markers, setMarkers] = useState([]);

  useEffect(() => {
    // Clear previous route, markers and force re-render when route changes
    setRouteCoordinates([]);
    setKey(prev => prev + 1);

    // Clear existing markers from the map
    markers.forEach(marker => marker.remove());
    setMarkers([]);

    if (route?.employees?.length > 0) {
      const geocodeEmployees = async () => {
        try {
          const employeeCoordinates = route.employees.map(emp => {
            // Use actual location coordinates from employee data
            return emp.location ? [emp.location.lat, emp.location.lng] : [28.4, 77.0];
          });
      
          // Add employee markers
          route.employees.forEach((emp, index) => {
            const coords = employeeCoordinates[index];
            const icon = emp.gender === 'female' ? femaleEmployeeIcon : maleEmployeeIcon;
            const marker = L.marker(coords, { icon })
              .addTo(map)
              .bindPopup(`<div class="popup-content">
                <h3>${emp.name}</h3>
                <p><strong>ID:</strong> ${emp.id}</p>
                <p><strong>Gender:</strong> ${emp.gender}</p>
                <p><strong>Pick-up Time:</strong> ${emp.pickupTime || 'N/A'}</p>
              </div>`);
            setMarkers(prevMarkers => [...prevMarkers, marker]);
          });

          // Fit bounds to show all markers
          const bounds = L.latLngBounds([
            ...employeeCoordinates,
            facility
          ]);
          map.fitBounds(bounds, { padding: [50, 50] });
      
          // Get new route
          const waypoints = [
            ...employeeCoordinates,
            facility
          ];
          
          const waypointsString = waypoints
            .map(point => `${point[1]},${point[0]}`)
            .join(';');
      
          const response = await fetch(`http://localhost:5000/route/v1/driving/${waypointsString}?overview=full&geometries=geojson`);
          const data = await response.json();
          
          if (data.routes && data.routes[0]) {
            const coordinates = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
            setRouteCoordinates(coordinates);
          }
        } catch (error) {
          console.error('Error processing route:', error);
        }
      };
    
      geocodeEmployees();
    }
  }, [route, facility, map]);

  // Render the route polyline
  return (
    <>
      {routeCoordinates.length > 0 && (
        <Polyline
          key={key}
          positions={routeCoordinates}
          color="#2196F3"
          weight={3}
          opacity={0.7}
        />
      )}
      {zoneData && <GeoJSON 
        data={zoneData}
        style={(feature) => ({
          fillColor: feature.properties.fill || '#3388ff',
          fillOpacity: 0.4,
          weight: 2,
          opacity: 1,
          color: 'white',
          dashArray: '3'
        })}
      />}
    </>
  );
}

export default MapComponent;