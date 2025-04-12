/**
 * Checks if the OSRM server is available
 * @returns {Promise<boolean>} - True if OSRM is available, false otherwise
 */
export const isOsrmAvailable = async () => {
  try {
    const response = await fetch('http://localhost:5000/health', { 
      method: 'GET',
      timeout: 2000  // 2 second timeout
    });
    return response.ok;
  } catch (error) {
    console.warn('OSRM health check failed:', error);
    return false;
  }
};

/**
 * Calculates an OSRM route between waypoints
 * @param {Array} waypoints - Array of [lat, lng] coordinates
 * @returns {Promise<Array|null>} - Array of route coordinates or null if failed
 */
export const calculateOsrmRoute = async (waypoints) => {
  try {
    // Format waypoints as lng,lat pairs for OSRM
    const osrmWaypoints = waypoints.map(point => {
      // Handle different point formats
      if (Array.isArray(point)) {
        return `${point[1]},${point[0]}`; // [lat, lng] → "lng,lat"
      } else if (point && typeof point === 'object') {
        return `${point.lng},${point.lat}`; // {lat, lng} → "lng,lat"
      }
      return null;
    }).filter(Boolean).join(';');
    
    if (!osrmWaypoints) {
      throw new Error('No valid waypoints provided');
    }
    
    const response = await fetch(`http://localhost:5000/route/v1/driving/${osrmWaypoints}?overview=full`);
    
    if (!response.ok) {
      throw new Error(`OSRM service error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || !data.routes[0]) {
      throw new Error('Invalid OSRM response');
    }
    
    // Decode the polyline
    const decodedCoords = decodePolyline(data.routes[0].geometry);
    return decodedCoords;
  } catch (error) {
    console.error('OSRM route calculation failed:', error);
    return null;
  }
};

/**
 * Decodes a polyline string into an array of [lat, lng] coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array} - Array of [lat, lng] coordinates
 */
export const decodePolyline = (encoded) => {
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
    
    decoded.push([lat * 1e-5, lng * 1e-5]);
  }
  
  return decoded;
};

export const encodePolyline = (coordinates) => {
  let output = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const [lat, lng] of coordinates) {
    // Convert to integer representation
    const latInt = Math.round(lat * 1e5);
    const lngInt = Math.round(lng * 1e5);

    // Encode latitude difference
    const dLat = latInt - prevLat;
    prevLat = latInt;
    output += encodeNumber(dLat);

    // Encode longitude difference
    const dLng = lngInt - prevLng;
    prevLng = lngInt;
    output += encodeNumber(dLng);
  }

  return output;
};

const encodeNumber = (num) => {
  num = num < 0 ? ~(num << 1) : (num << 1);
  let output = '';
  while (num >= 0x20) {
    output += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  output += String.fromCharCode(num + 63);
  return output;
};