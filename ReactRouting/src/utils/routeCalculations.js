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

// Convert military time number to hours and minutes (e.g., 1230 -> { hours: 12, minutes: 30 })
const parseMilitaryTime = (timeNumber) => {
  if (!timeNumber && timeNumber !== 0) return null;
  
  // Convert to string and pad with leading zeros if needed
  const timeStr = String(timeNumber).padStart(4, '0');
  
  // Extract hours and minutes
  const hours = parseInt(timeStr.slice(0, 2));
  const minutes = parseInt(timeStr.slice(2));
  
  // Validate the time
  if (isNaN(hours) || isNaN(minutes) || hours >= 24 || minutes >= 60) {
    console.log('Invalid time format:', timeNumber);
    return null;
  }
  
  return { hours, minutes };
};

// Calculate ETA based on duration and shift time
const calculateETA = (durationInSeconds, shiftTime) => {
  if (!shiftTime && shiftTime !== 0) {
    console.log('No shift time provided');
    return 'N/A';
  }
  
  try {
    const parsedTime = parseMilitaryTime(shiftTime);
    if (!parsedTime) {
      console.log('Could not parse shift time:', shiftTime);
      return 'N/A';
    }

    const eta = new Date();
    eta.setHours(parsedTime.hours, parsedTime.minutes, 0, 0); // Set to shift time
    
    // Subtract duration to get pickup time
    eta.setSeconds(eta.getSeconds() - durationInSeconds);
    
    const pickupTime = eta.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    return pickupTime;
  } catch (error) {
    console.error('Error calculating ETA:', error);
    return 'N/A';
  }
};

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
  console.log("waypoint string",waypointsString);

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

export const calculateRouteDetails = async (routeCoordinates, employees) => {
  try {
    // Prepare waypoints for OSRM request
    const waypointsString = routeCoordinates.map(coord => `${coord[1]},${coord[0]}`).join(';');
    
    // Make request to OSRM server
    const url = `http://localhost:5000/route/v1/driving/${waypointsString}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    const legs = data.routes[0].legs;
    
    // Constants for time calculations
    const TRAFFIC_BUFFER_FACTOR = 1.6; // 40% extra time for traffic
    const PICKUP_TIME_PER_EMPLOYEE = 180; // 3 minutes (180 seconds) per employee pickup

    // Calculate total route time including traffic and pickups
    const totalBaseTime = legs.reduce((sum, leg) => sum + (leg?.duration || 0), 0);
    const totalTimeWithTraffic = totalBaseTime * TRAFFIC_BUFFER_FACTOR;
    const totalPickupTime = PICKUP_TIME_PER_EMPLOYEE * employees.length;
    const totalRouteTime = totalTimeWithTraffic + totalPickupTime;

    // Calculate start time by working backwards from shift time
    const employeeDetails = employees.map((employee, index) => {
        const durationToNextPoint = legs[index]?.duration || 0;
        const distanceToNextPoint = legs[index]?.distance || 0;
        
        // Calculate time needed after this pickup including time to facility
        const remainingLegs = legs.slice(index);  // Include all remaining legs including to facility
        const remainingBaseTime = remainingLegs.reduce((sum, leg) => sum + (leg?.duration || 0), 0);
        const remainingTimeWithTraffic = remainingBaseTime * TRAFFIC_BUFFER_FACTOR;
        const remainingPickups = employees.length - index;
        const remainingPickupTime = remainingPickups * PICKUP_TIME_PER_EMPLOYEE;
        const timeNeededAfterPickup = remainingTimeWithTraffic + remainingPickupTime;

        // Calculate pickup time by subtracting from shift time
        const pickupTime = calculateETA(timeNeededAfterPickup, employee.shiftTime);

        console.log(`Employee ${employee.id} (order ${index + 1}):`, {
            remainingBaseTime,
            remainingTimeWithTraffic,
            remainingPickupTime,
            timeNeededAfterPickup,
            pickupTime,
            shiftTime: employee.shiftTime
        });

        return {
            ...employee,
            duration: durationToNextPoint,
            distance: distanceToNextPoint,
            pickupTime: pickupTime,
            order: index + 1
        };
    });

    return {
        employees: employeeDetails,
        totalDistance: legs.reduce((sum, leg) => sum + (leg?.distance || 0), 0),
        totalDuration: totalRouteTime
    };
  } catch (error) {
    console.error('Error calculating route details:', error);
    throw error;
  }
};