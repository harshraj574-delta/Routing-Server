import React, { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const OSRM_SERVER = 'http://localhost:5000';

function Map({ routes = [], selectedRoute = null }) {
  useEffect(() => {
    // Initialize map
    const map = L.map('map').setView([28.6139, 77.2090], 10); // Default center on Delhi

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Clear existing layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    // Fetch and display zone data
    fetch('/delhi_ncr_zones.json')
      .then(response => response.json())
      .then(data => {
        console.log("this is data",data);
        L.geoJSON(data, {
          style: (feature) => ({
            fillColor: feature.properties.fill || '#FF0000',
            fillOpacity: 0.6,
            color: feature.properties.fill || '#FF0000',
            weight: 2,
            opacity: 0.8
          }),
          onEachFeature: (feature, layer) => {
            layer.bindPopup(feature.properties.Name);
          }
        }).addTo(map);
      });

    // Plot routes and markers
    routes.forEach((route) => {
      const isSelected = selectedRoute && selectedRoute.uniqueKey === route.uniqueKey;
      
      // Plot employees as markers using geoX and geoY
      const employeeCoordinates = route.employees.map(employee => {
        if (employee.location && Array.isArray(employee.location)) {
          const [lng, lat] = employee.location;
          const marker = L.marker([lat, lng])
            .bindPopup(`${employee.name}<br>${employee.address}`)
            .addTo(map);

          if (isSelected) {
            marker.openPopup();
          }
          return [lat, lng];
        }
        return null;
      }).filter(coord => coord !== null);

      // If route is selected and has employee coordinates, calculate and draw route
      if (isSelected && employeeCoordinates.length > 0) {
        // Create waypoints string for OSRM
        const waypoints = employeeCoordinates
          .map(coord => `${coord[1]},${coord[0]}`) // OSRM expects lng,lat format
          .join(';');

        // Fetch route from OSRM
        fetch(`${OSRM_SERVER}/route/v1/driving/${waypoints}?overview=full&geometries=geojson`)
          .then(response => response.json())
          .then(data => {
            if (data.code === 'Ok' && data.routes[0]) {
              const routeCoordinates = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
              const routeLine = L.polyline(routeCoordinates, {
                color: '#2563eb',
                weight: 4,
                opacity: 0.8
              }).addTo(map);

              // Fit map bounds to selected route
              map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
            }
          });
      }
    });

    return () => {
      map.remove(); // Cleanup on unmount
    };
  }, [routes, selectedRoute]);

  return <div id="map" style={{ height: '100vh', width: '100%' }} />;
}

export default Map;