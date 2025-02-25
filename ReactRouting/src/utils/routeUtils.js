export async function checkRouteDuration(route, facility) {
  if (!Array.isArray(route) || route.length === 0 || !facility || !Array.isArray(facility)) {
    console.error('Invalid input parameters for checkRouteDuration');
    return null;
  }

  try {
    // Validate each location in the route
    const validLocations = route.every(emp => 
      emp && emp.location && 
      Array.isArray(emp.location) && 
      emp.location.length === 2 &&
      !isNaN(emp.location[0]) && 
      !isNaN(emp.location[1])
    );

    if (!validLocations) {
      console.error('Invalid location data in route');
      return null;
    }

    const waypoints = [
      ...route.map(emp => emp.location),
      facility
    ];

    const waypointsString = waypoints
      .map(point => `${point[1]},${point[0]}`)
      .join(';');

    const url = `http://localhost:5000/route/v1/driving/${waypointsString}?overview=false`;
    console.log('Requesting route duration for URL:', url);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    if (!data.routes || !data.routes[0] || typeof data.routes[0].duration !== 'number') {
      throw new Error('Invalid response format from routing service');
    }

    console.log('Route data received:', data);

    // Base duration from OSRM
    let baseDuration = data.routes[0].duration;

    // Add traffic buffer (40% of base duration)
    const trafficBuffer = baseDuration * 0.4;

    // Add pickup time for each employee (3 minutes = 180 seconds per employee)
    const pickupTime = route.length * 180;

    // Calculate total duration
    const totalDuration = baseDuration + trafficBuffer + pickupTime;

    console.log('Calculated duration:', {
      baseDuration,
      trafficBuffer,
      pickupTime,
      totalDuration
    });

    return totalDuration;
  } catch (error) {
    console.error('Error checking route duration:', error);
    return null;
  }
}

export function findZoneForEmployee(location, zones) {
  if (!location || !Array.isArray(location) || location.length !== 2 || !zones || !zones.features) {
    console.warn('Invalid input parameters for findZoneForEmployee');
    return null;
  }

  const [lat, lon] = location;
  
  for (const feature of zones.features) {
    if (!feature.properties || !feature.properties.name || !feature.geometry || !feature.geometry.coordinates) {
      console.warn('Invalid zone feature structure');
      continue;
    }

    const zoneName = feature.properties.name;
    const coordinates = feature.geometry.coordinates[0]; // First ring of the polygon
    
    // Convert array of coordinates to array of [lat, lon] pairs
    const polygonPoints = coordinates.map(coord => [coord[1], coord[0]]);
    
    if (isPointInPolygon([lat, lon], polygonPoints)) {
      return zoneName;
    }
  }
  return null;
}

export function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}