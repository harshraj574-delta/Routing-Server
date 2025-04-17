import React, { useEffect, useRef } from 'react';
import { Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import './MapComponent.css';
// Assuming calculateRouteDetails is not needed here anymore unless used for other purposes
// import { calculateRouteDetails } from '../utils/routeCalculations';

// Define marker icons (or import them)
const facilityIcon = new L.Icon({
    iconUrl: '/facility-icon.png', // Using relative path from public directory
    iconSize: [35, 35],
    iconAnchor: [17, 35],
    popupAnchor: [0, -35]
});

const createEmployeeIcon = (gender, index) => {
    const color = gender === 'F' ? '#FF69B4' : '#4169E1'; // Pink for Female, Blue for Male
    const size = 24; // Size of the circle
    const fontSize = 12; // Font size for the index number

    return L.divIcon({
        html: `
            <div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; justify-content: center; align-items: center; color: white; font-size: ${fontSize}px; font-weight: bold; border: 1px solid white;">
                ${index}
            </div>
        `,
        className: 'employee-marker-icon', // Add a class for potential additional styling
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2], // Center the icon
        popupAnchor: [0, -size / 2] // Position popup above the icon
    });
};


function MapComponent({ route, facility, onEmployeeSelect, tripType }) {
  const map = useMap();
  const polylineRef = useRef();

  // Effect to fit map bounds to the route or facility
  useEffect(() => {
    if (!map) return;

    // Use the decoded coordinates passed in the route prop
    if (route && route.decodedCoordinates && route.decodedCoordinates.length > 0) {
      try {
        const bounds = L.latLngBounds(route.decodedCoordinates);
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] }); // Add some padding
            console.log('Map bounds fitted to decoded route coordinates.');
        } else {
            console.warn('Calculated bounds from decoded coordinates are invalid.');
            if (facility && facility.length === 2) map.setView(facility, 12);
        }
      } catch (error) {
        console.error("Error fitting bounds to decoded coordinates:", error);
        if (facility && facility.length === 2) map.setView(facility, 12);
      }
    } else if (facility && facility.length === 2) {
      // If no route, center on facility
      map.setView(facility, 12);
      console.log('No route coordinates, centering on facility.');
    } else {
      // Default view if no data
      map.setView([28.6139, 77.209], 10);
      console.warn("No valid route or facility coordinates available.");
    }
  }, [map, route, facility]); // Dependencies: map, the whole route object, and facility

  // Effect to potentially style the polyline (optional)
  useEffect(() => {
    if (!polylineRef.current || !route) return;
    // Example: Change color based on some condition, though it's set in Polyline component now
    // if (route.decodedCoordinates && route.decodedCoordinates.length > 0) {
    //   try {
    //     // polylineRef.current.setStyle({ color: 'red' });
    //   } catch (error) {
    //     console.error("Error setting polyline style:", error);
    //   }
    // }
  }, [route]);

  // Determine facility location and popup text
  const facilityLocation = facility; // Assuming facility is [lat, lng]
  const facilityPopupText = tripType === 'PICKUP' ? 'Pickup Facility' : 'Dropoff Facility';

  return (
    <>
      {/* Draw the route using decoded coordinates */}
      {route && route.decodedCoordinates && route.decodedCoordinates.length > 0 ? (
        <Polyline
          ref={polylineRef}
          positions={route.decodedCoordinates} // Directly use the decoded coordinates
          color="#007bff" // Example color
          weight={4}
        />
      ) : (
        console.log("MapComponent: No decoded coordinates to draw polyline.")
      )}

      {/* Draw Facility Marker */}
      {facilityLocation && facilityLocation.length === 2 && (
          <Marker position={facilityLocation} icon={facilityIcon}>
              <Popup>{facilityPopupText}</Popup>
          </Marker>
      )}

      {/* Draw Employee Markers */}
      {route && route.employees && route.employees.map((employee, index) => {
        // Check if location coordinates exist
        const lat = employee.location?.lat;
        const lng = employee.location?.lng;
        console.log("MapComponent: Processing employee marker for employee:", employee);

        return lat && lng ? (
          <Marker
            key={`emp-${employee.id || index}`}
            position={[lat, lng]}
            icon={createEmployeeIcon(employee.gender, index + 1)} // Pass index+1 for numbering
            eventHandlers={{
              click: () => onEmployeeSelect && onEmployeeSelect(employee)
            }}
          >
            <Popup>
              <div>
                <h3>{employee.name || `Employee ${index + 1}`}</h3>
                <p><strong>Order: #{index + 1}</strong></p>
                <p>{employee.address || 'No address'}</p>
                {employee.pickupTime && (
                  <p><strong>ETA:</strong> {employee.pickupTime}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ) : (
          console.warn(`Skipping marker for employee ${employee.id || index} due to missing coordinates.`)
        );
      })}
    </>
  );
}

export default MapComponent;
