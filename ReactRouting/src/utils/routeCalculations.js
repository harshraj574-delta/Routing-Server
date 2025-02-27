// Utility functions for route calculations and timing simulations

// Average speed in kilometers per hour (adjusted for more realistic urban travel)
const averageSpeed = 40;

// Adjusted traffic factors for more realistic timing
const trafficFactors = {
  morning: 1.3,  // Moderate traffic during morning rush
  evening: 1.2,  // Moderate traffic during evening
  night: 1.0     // Low traffic at night
};

// Reduced pickup time per employee for efficiency
const pickupTimePerEmployee = 2;

// Maximum allowed route duration in minutes (2.5 hours)
const MAX_ROUTE_DURATION = 150;

/**
 * Calculate the estimated duration for a route
 * @param {Object} route - Route object containing employees and zone information
 * @param {Array} facility - Facility coordinates [latitude, longitude]
 * @param {string} shift - Shift timing (morning/evening/night)
 * @returns {Object} Duration details including total time and breakdown
 */
export const calculateRouteDuration = async (route, facility, shift = 'morning') => {
  if (!route || !route.employees || !facility) {
    return { total: 0, travel: 0, pickup: 0 };
  }

  // Prepare waypoints for OSRM request
  const employeeCoords = route.employees.map(emp => [emp.location.lat, emp.location.lng]);
  const waypoints = [...employeeCoords, facility];
  const waypointsString = waypoints.map(point => `${point[1]},${point[0]}`).join(';');

  try {
    // Make request to OSRM server
    const url = `http://localhost:5000/route/v1/driving/${waypointsString}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    // Calculate travel time with traffic factor
    const trafficFactor = trafficFactors[shift] || trafficFactors.morning;
    const baseDuration = data.routes[0].duration / 60; // Convert seconds to minutes
    const travelTimeWithTraffic = Math.round(baseDuration * trafficFactor);

    // Calculate pickup time
    const pickupTime = route.employees.length * pickupTimePerEmployee;

    // Ensure total duration doesn't exceed maximum allowed time
    const totalDuration = Math.min(travelTimeWithTraffic + pickupTime, MAX_ROUTE_DURATION);
    const adjustedTravelTime = Math.min(travelTimeWithTraffic, MAX_ROUTE_DURATION - pickupTime);

    return {
      total: totalDuration,
      travel: adjustedTravelTime,
      pickup: pickupTime
    };
  } catch (error) {
    console.error('Error calculating route duration:', error);
    return { total: 0, travel: 0, pickup: 0 };
  }
};

