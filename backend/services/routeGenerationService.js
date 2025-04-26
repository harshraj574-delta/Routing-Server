const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const TRAFFIC_BUFFER_PERCENTAGE = 0.4; // 40% buffer for traffic
const MAX_SWAP_DISTANCE_KM = 4; // or your business threshold

const fetchApi = (...args) => {
  return import("node-fetch").then(({ default: fetch }) => fetch(...args));
};

const ZONES_DATA_FILE = path.join(__dirname, "../data/delhi_ncr_zones.json");

async function isOsrmAvailable() {
  try {
    const osrmUrl =
      "http://localhost:5000/route/v1/driving/77.1025,28.7041;77.1026,28.7042";
    const response = await fetchApi(osrmUrl, {
      method: "GET",
      timeout: 8000,
    });
    if (response.ok) {
      const data = await response.json();
      return data && data.code === "Ok";
    }
    return false;
  } catch (error) {
    return false;
  }
}

function decodePolyline(encoded) {
  let index = 0;
  const len = encoded.length;
  const decoded = [];
  let lat = 0;
  let lng = 0;
  while (index < len) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    decoded.push([lat * 1e-5, lng * 1e-5]);
  }
  return decoded;
}

function encodePolyline(coordinates) {
  let output = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of coordinates) {
    const latInt = Math.round(lat * 1e5);
    const lngInt = Math.round(lng * 1e5);
    const dLat = latInt - prevLat;
    prevLat = latInt;
    output += encodeNumber(dLat);
    const dLng = lngInt - prevLng;
    prevLng = lngInt;
    output += encodeNumber(dLng);
  }
  return output;
}

function encodeNumber(num) {
  num = num < 0 ? ~(num << 1) : num << 1;
  let output = "";
  while (num >= 0x20) {
    output += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  output += String.fromCharCode(num + 63);
  return output;
}

async function calculateDistance(point1, point2) {
  const [lat1, lng1] = point1;
  const [lat2, lng2] = point2;
  const url = `http://localhost:5000/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
  try {
    const response = await fetchApi(url);
    if (!response.ok) throw new Error(`OSRM error: ${response.status}`);
    const data = await response.json();
    if (
      data.routes &&
      data.routes[0] &&
      typeof data.routes[0].distance === "number"
    ) {
      return data.routes[0].distance / 1000; // meters to km
    }
    console.warn("Could not get distance from OSRM response:", data);
    return Infinity;
  } catch (err) {
    console.error("OSRM distance calculation error:", err);
    return Infinity;
  }
}

function isPointInPolygon(point, polygon) {
  if (!point || !polygon || !Array.isArray(polygon)) return false;
  const [lat, lng] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [lngI, latI] = polygon[i];
    const [lngJ, latJ] = polygon[j];
    const intersect =
      latI > lat !== latJ > lat &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;
    if (intersect) inside = !inside;
  }
  return inside;
}

async function loadZonesData() {
  const data = await fs.promises.readFile(ZONES_DATA_FILE, "utf8");
  const zonesData = JSON.parse(data);
  return zonesData.features;
}

function assignEmployeesToZones(employees, zones) {
  const employeesByZone = {};
  const assignedEmployees = new Set();
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    const zoneName = zone.properties?.Name || "Unknown Zone";
    const zonePolygon = zone.geometry.coordinates[0];
    const zoneEmployees = employees
      .filter((emp) => {
        if (!emp.geoX || !emp.geoY) return false;
        const isInZone = isPointInPolygon([emp.geoY, emp.geoX], zonePolygon);
        if (isInZone) assignedEmployees.add(emp.empCode);
        return isInZone;
      })
      .map((emp) => ({
        ...emp,
        zone: zoneName,
        location: { lat: emp.geoY, lng: emp.geoX },
      }));
    if (zoneEmployees.length > 0) employeesByZone[zoneName] = zoneEmployees;
  }
  const unassignedEmployees = employees.filter(
    (emp) => !assignedEmployees.has(emp.empCode) && emp.geoX && emp.geoY
  );
  if (unassignedEmployees.length > 0) {
    const defaultZoneName = "DEFAULT_ZONE";
    employeesByZone[defaultZoneName] = unassignedEmployees.map((emp) => ({
      ...emp,
      zone: defaultZoneName,
      location: { lat: emp.geoY, lng: emp.geoX },
    }));
  }
  return employeesByZone;
}

function findZoneGroups(zonePairingMatrix) {
  const visited = new Set();
  const groups = [];
  for (const zone in zonePairingMatrix) {
    if (visited.has(zone)) continue;
    const group = [];
    const queue = [zone];
    visited.add(zone);
    while (queue.length > 0) {
      const current = queue.shift();
      group.push(current);
      const neighbors = zonePairingMatrix[current] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (group.length > 0) groups.push(group);
  }
  return groups;
}

async function calculateRouteDetails(routeCoordinates, employees, pickupTimePerEmployee) {
  try {
    // Validate input
    if (!routeCoordinates?.length || !employees?.length) {
      throw new Error("Invalid input parameters");
    }

    // Convert coordinates to OSRM format (lng,lat)
    const coordinatesString = routeCoordinates
      .map(coord => `${coord[1]},${coord[0]}`) // Convert [lat,lng] to "lng,lat"
      .join(";");

    // For multiple waypoints, we need to use route service with alternatives=false
    const url = `http://localhost:5000/route/v1/driving/${coordinatesString}?overview=full&geometries=polyline&steps=true&alternatives=false&continue_straight=true`;

    const response = await fetchApi(url);
    if (!response.ok) {
      throw new Error(`OSRM service error: ${response.status}`);
    }

    const data = await response.json();
    
    // Check for valid route response
    if (!data.routes?.[0]) {
      throw new Error("Invalid OSRM response");
    }

    const route = data.routes[0];
    
    // Ensure we have valid geometry
    if (!route.geometry) {
      throw new Error("Missing route geometry");
    }

    // The route service doesn't provide leg info the same way trip does,
    // so we need to process it differently
    const legs = route.legs || [];
    
    return {
      employees: employees.map((emp, index) => ({
        ...emp,
        order: index + 1,
        duration: legs[index]?.duration || 0,
        distance: legs[index]?.distance || 0
      })),
      totalDistance: route.distance,
      totalDuration: route.duration * (1 + TRAFFIC_BUFFER_PERCENTAGE),
      encodedPolyline: route.geometry,
      legs: legs,
      geometry: {
        type: "LineString",
        coordinates: decodePolyline(route.geometry).map(coord => [coord[1], coord[0]])
      }
    };

  } catch (error) {
    console.error("Route calculation error:", error);
    // Return a valid structure even in error case
    return {
      employees: employees.map((emp, index) => ({
        ...emp,
        order: index + 1
      })),
      totalDistance: 0,
      totalDuration: 0,
      encodedPolyline: "",
      legs: [],
      geometry: null,
      error: error.message
    };
  }
}



async function processEmployeeBatch(
  employees,
  maxCapacity,
  facility,
  tripType = "pickup",
  maxDuration,
  pickupTimePerEmployee,
  guard = false // <-- pass this from controller/service
) {
  const routes = [];
  const isDropoff = tripType.toLowerCase() === "dropoff";

  // Filter for valid locations first
  const validEmployees = employees.filter((emp) => {
    return (
      emp.location &&
      typeof emp.location.lat === "number" &&
      typeof emp.location.lng === "number" &&
      !isNaN(emp.location.lat) &&
      !isNaN(emp.location.lng)
    );
  });

  if (validEmployees.length === 0) {
    console.warn("No valid employees found in the batch.");
    return { routes: [], swapCount: 0 }; // swapCount is no longer relevant here
  }

  let remainingEmployees = [...validEmployees];

  while (remainingEmployees.length > 0) {
    const routeEmployees = [];
    let needsGuard = false; // Reset for each route
    let actualVehicleCapacity = maxCapacity; // Reset for each route

    // --- OSRM-based sorting ---
    const distances = await Promise.all(
      remainingEmployees.map(async (emp) => ({
        emp,
        dist: await calculateDistance(
          [emp.location.lat, emp.location.lng],
          [facility.geoY, facility.geoX]
        ),
      }))
    );
    distances.sort((a, b) => (isDropoff ? a.dist - b.dist : b.dist - a.dist));
    remainingEmployees = distances.map((d) => d.emp);

    const firstEmployee = remainingEmployees.shift();
    if (!firstEmployee) break; // Should not happen if remainingEmployees > 0, but safety check
    routeEmployees.push(firstEmployee);

    // --- Greedy Nearest Neighbor ---
    while (
      routeEmployees.length < maxCapacity &&
      remainingEmployees.length > 0
    ) {
      const currentEmployee = routeEmployees[routeEmployees.length - 1];
      const scoredEmployees = await Promise.all(
        remainingEmployees.map(async (emp) => {
          const distance = await calculateDistance(
            [currentEmployee.location.lat, currentEmployee.location.lng],
            [emp.location.lat, emp.location.lng]
          );
          return { emp, score: distance };
        })
      );

      scoredEmployees.sort((a, b) => a.score - b.score); // Closest first

      if (scoredEmployees.length === 0 || scoredEmployees[0].score === Infinity) {
          console.warn("Could not find a reachable next employee.");
          break; // Stop adding if no reachable employee found
      }

      const nextEmployee = scoredEmployees[0].emp;
      routeEmployees.push(nextEmployee);
      remainingEmployees = remainingEmployees.filter(
        (emp) => emp.empCode !== nextEmployee.empCode // Use unique identifier
      );

      // --- Duration Check (Optional) ---
      if (maxDuration) {
        // Estimate duration quickly - maybe just use straight-line distance * factor?
        // Or a simplified OSRM call if performance allows.
        // For now, we'll skip the detailed check here and rely on the post-optimization check.
        // If implementing, ensure to break and potentially add the employee back to remaining.
      }
    }

    // --- GUARD CAPACITY LOGIC (Based on *last* employee in this initial list) ---
    if (guard && routeEmployees.length > 0) {
      // Check the gender of the *last* employee added in this batching phase
      const lastEmployeeInitial = routeEmployees[routeEmployees.length - 1];
      if (lastEmployeeInitial.gender === "F") {
        // Check if there's *any* male in the route to potentially swap with later
        const hasMale = routeEmployees.some((emp) => emp.gender === "M");
        // If the last person is female AND there are no males at all in the route,
        // a guard is needed, and capacity reduces.
        if (!hasMale) {
          needsGuard = true;
          actualVehicleCapacity = Math.max(1, maxCapacity - 1);
          // Remove excess employees if capacity reduced
          while (routeEmployees.length > actualVehicleCapacity) {
            const removed = routeEmployees.pop();
            if (removed) {
              remainingEmployees.unshift(removed); // Add back to remaining pool
            }
          }
        } else {
          // If there is a male, we *assume* a swap *might* be possible later after optimization.
          // So, we don't reduce capacity here based *only* on the last person being female.
          // The actual swap happens later in generateRoutes.
          needsGuard = false; // Assume swap is possible for now
        }
      } else {
        // Last person is male, no guard needed based on this check
        needsGuard = false;
      }
    } else {
      needsGuard = false; // Guard feature not enabled or no employees
    }

    // Add the route with the initial employee list and guard decision
    if (routeEmployees.length > 0) {
      routes.push({
        employees: [...routeEmployees], // Use a copy
        routeNumber: routes.length + 1, // Placeholder, will be updated
        vehicleCapacity: actualVehicleCapacity,
        guardNeeded: needsGuard, // Store the decision based on initial check
        // 'swapped' flag will be added later in generateRoutes
        uniqueKey: `${routeEmployees[0].zone}_${
          routes.length + 1
        }_${uuidv4()}`,
        zone: routeEmployees[0].zone,
        tripType: isDropoff ? "dropoff" : "pickup",
      });
    }
  }
  // swapCount is no longer calculated or returned here
  return { routes };
}

function calculatePickupTimes(route, shiftTime, pickupTimePerEmployee, reportingTimeSeconds = 0) {
  try {
    if (!route?.employees?.length || !shiftTime) {
      throw new Error("Invalid input parameters");
    }

    // Parse shift time
    const timeStr = shiftTime.toString().padStart(4, "0");
    const hours = parseInt(timeStr.substring(0, 2), 10);
    const minutes = parseInt(timeStr.substring(2, 4), 10);

    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error("Invalid shift time format");
    }

    const facilityTargetTime = new Date();
    facilityTargetTime.setHours(hours, minutes, 0, 0);

    // Calculate times for each employee
    const isDropoff = route.tripType?.toLowerCase() === "dropoff";
    let currentTime = new Date(facilityTargetTime);

    if (!isDropoff) {
      // Pickup calculation
      route.facilityArrivalTime = formatTime(currentTime);
      
      for (let i = route.employees.length - 1; i >= 0; i--) {
        const employee = route.employees[i];
        const legDuration = (route.routeDetails?.legs?.[i]?.duration || 0) * (1 + TRAFFIC_BUFFER_PERCENTAGE);
        
        currentTime.setSeconds(currentTime.getSeconds() - legDuration - pickupTimePerEmployee);
        employee.pickupTime = formatTime(currentTime);
      }
    } else {
      // Dropoff calculation
      route.facilityDepartureTime = formatTime(currentTime);
      
      for (let i = 0; i < route.employees.length; i++) {
        const employee = route.employees[i];
        const legDuration = (route.routeDetails?.legs?.[i]?.duration || 0) * (1 + TRAFFIC_BUFFER_PERCENTAGE);
        
        currentTime.setSeconds(currentTime.getSeconds() + legDuration + pickupTimePerEmployee);
        employee.dropoffTime = formatTime(currentTime);
        employee.pickupTime = employee.dropoffTime;
      }
    }
  } catch (error) {
    console.error("Time calculation error:", error);
    // Set default error values
    route.employees.forEach(emp => {
      emp.pickupTime = "Error";
      emp.dropoffTime = "Error";
    });
    route.facilityArrivalTime = "Error";
    route.facilityDepartureTime = "Error";
  }
}

function formatTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}


async function handleGuardRequirements(route, isDropoff, facility, pickupTimePerEmployee) {
  try {
    if (!route?.employees?.length) {
      return { guardNeeded: false, swapped: false };
    }

    // For pickup: check first employee
    // For dropoff: check last employee
    const checkIndex = isDropoff ? route.employees.length - 1 : 0;
    const criticalEmployee = route.employees[checkIndex];

    if (!criticalEmployee || criticalEmployee.gender !== "F") {
      return { guardNeeded: false, swapped: false };
    }

    // Find suitable male candidates for swap
    const swapCandidates = route.employees
      .map(async (emp, index) => {
        if (index === checkIndex || emp.gender !== "M") {
          return null;
        }

        // Calculate distance between critical employee and potential swap candidate
        const distance = await calculateDistance(
          [criticalEmployee.location.lat, criticalEmployee.location.lng],
          [emp.location.lat, emp.location.lng]
        );

        return {
          employee: emp,
          index,
          distance
        };
      })
      .filter(Boolean); // Remove null entries

    // Wait for all distance calculations
    const validCandidates = (await Promise.all(swapCandidates))
      .filter(candidate => 
        candidate && 
        candidate.distance !== Infinity && 
        candidate.distance <= MAX_SWAP_DISTANCE_KM
      )
      .sort((a, b) => a.distance - b.distance);

    if (validCandidates.length === 0) {
      // No suitable swap candidates found
      console.log(`Guard needed for route ${route.routeNumber}: No suitable swap candidates found`);
      return { guardNeeded: true, swapped: false };
    }

    // Perform swap with closest suitable candidate
    const bestCandidate = validCandidates[0];
    const newEmployees = [...route.employees];
    
    // Swap employees
    [newEmployees[checkIndex], newEmployees[bestCandidate.index]] = 
    [newEmployees[bestCandidate.index], newEmployees[checkIndex]];

    // Prepare new coordinates for route recalculation
    const newCoordinates = newEmployees.map(emp => [
      emp.location.lat,
      emp.location.lng
    ]);

    const facilityCoordinates = [facility.geoY, facility.geoX];
    const allCoordinates = isDropoff
      ? [facilityCoordinates, ...newCoordinates]
      : [...newCoordinates, facilityCoordinates];

    // Verify the new route is viable
    const routeDetails = await calculateRouteDetails(
      allCoordinates,
      newEmployees,
      pickupTimePerEmployee
    );

    if (routeDetails.error) {
      console.warn(`Swap validation failed for route ${route.routeNumber}: ${routeDetails.error}`);
      return { guardNeeded: true, swapped: false };
    }

    // Update route with swapped employees
    route.employees = newEmployees;

    console.log(`Successfully swapped employees in route ${route.routeNumber}:`, {
      original: criticalEmployee.empCode,
      swapped: bestCandidate.employee.empCode,
      distance: bestCandidate.distance
    });

    return {
      guardNeeded: false,
      swapped: true,
      newCoordinates: allCoordinates,
      routeDetails
    };

  } catch (error) {
    console.error(`Error in handleGuardRequirements for route ${route?.routeNumber}:`, error);
    return { guardNeeded: true, swapped: false };
  }
}

// Helper function to validate swap viability
async function validateSwap(route, emp1Index, emp2Index, facility, pickupTimePerEmployee) {
  try {
    const newEmployees = [...route.employees];
    [newEmployees[emp1Index], newEmployees[emp2Index]] = 
    [newEmployees[emp2Index], newEmployees[emp1Index]];

    const newCoordinates = newEmployees.map(emp => [
      emp.location.lat,
      emp.location.lng
    ]);

    const facilityCoordinates = [facility.geoY, facility.geoX];
    const isDropoff = route.tripType?.toLowerCase() === "dropoff";
    
    const allCoordinates = isDropoff
      ? [facilityCoordinates, ...newCoordinates]
      : [...newCoordinates, facilityCoordinates];

    const routeDetails = await calculateRouteDetails(
      allCoordinates,
      newEmployees,
      pickupTimePerEmployee
    );

    if (routeDetails.error) {
      return { viable: false };
    }

    // Check if the new route duration is acceptable (within 20% increase)
    const originalDuration = route.routeDetails?.duration || Infinity;
    const newDuration = routeDetails.totalDuration;
    const durationIncrease = (newDuration - originalDuration) / originalDuration;

    return {
      viable: durationIncrease <= 0.2, // Allow up to 20% increase
      routeDetails,
      newCoordinates: allCoordinates
    };

  } catch (error) {
    console.error("Swap validation error:", error);
    return { viable: false };
  }
}

// Additional helper function for complex swaps if needed
async function findComplexSwap(route, criticalIndex, facility, pickupTimePerEmployee) {
  // This could implement more sophisticated swap logic
  // For example, trying multiple swaps or considering chain swaps
  // Returns null if no viable complex swap is found
  return null;
}



// ... (Keep all the code from the previous response up to the start of generateRoutes)

async function generateRoutes(data) {
  try {
    const {
      employees,
      facility,
      shiftTime,
      date,
      profile,
      saveToDatabase = false,
      pickupTimePerEmployee,
      reportingTime,
      guard,
      tripType = "PICKUP"
    } = data;

    if (!employees?.length) throw new Error("Employee data is required");
    if (!facility?.geoX || !facility?.geoY) throw new Error("Valid facility data required");
    if (!date || !shiftTime || !profile) throw new Error("Missing required parameters");

    const osrmAvailable = await isOsrmAvailable();
    if (!osrmAvailable) throw new Error("OSRM routing service unavailable");

    let zones = data.zones || [];
    if (!zones.length) {
      try {
        zones = await loadZonesData();
        if (!zones.length) throw new Error("No zones data available");
      } catch (err) {
        throw new Error(`Failed to load zones: ${err.message}`);
      }
    }

    const employeesByZone = assignEmployeesToZones(employees, zones);
    if (Object.keys(employeesByZone).length === 0) {
      console.warn("No employees assigned to zones");
      return createEmptyResponse(data);
    }

    const routeData = {
      uuid: data.uuid || uuidv4(),
      date,
      shift: shiftTime,
      tripType: tripType.toUpperCase(),
      facility,
      profile,
      employeeData: employees,
      routeData: []
    };

    const processedZones = new Set();
    const {
      zonePairingMatrix = {},
      highCapacityZones = [],
      isAutoClubbing = false,
      maxDuration = 7200 // Default 2 hours
    } = profile;

    let totalRouteCount = 0;
    let finalTotalSwappedRoutes = 0;
    const allGeneratedRoutes = [];
    const removedForGuardByZone = {}; // <--- Collect removed employees by zone

    // Process zone groups if clubbing is enabled
    if (profile.zoneClubbing) {
      const zoneGroups = findZoneGroups(zonePairingMatrix);
      for (const group of zoneGroups) {
        const combinedEmployees = group.flatMap(zone => employeesByZone[zone] || []);
        if (combinedEmployees.length === 0) continue;

        const maxCapacity = group.some(z => highCapacityZones.includes(z)) ? 12 : 6;

        try {
          const { routes: batchRoutes } = await processEmployeeBatch(
            combinedEmployees,
            maxCapacity,
            facility,
            tripType,
            maxDuration,
            pickupTimePerEmployee,
            guard
          );

          batchRoutes.forEach(route => {
            route.zone = group.join("-");
            allGeneratedRoutes.push(route);
          });

          group.forEach(z => processedZones.add(z));
        } catch (error) {
          console.error(`Error processing zone group ${group.join("-")}:`, error);
        }
      }
    }

    // Process remaining individual zones
    const remainingZones = Object.entries(employeesByZone)
      .filter(([zoneName]) => !processedZones.has(zoneName));

    for (const [zoneName, zoneEmployees] of remainingZones) {
      if (zoneEmployees.length === 0) continue;

      const maxCapacity = highCapacityZones.includes(zoneName) ? 12 : 6;

      try {
        const { routes: batchRoutes } = await processEmployeeBatch(
          zoneEmployees,
          maxCapacity,
          facility,
          tripType,
          maxDuration,
          pickupTimePerEmployee,
          guard
        );

        batchRoutes.forEach(route => {
          route.zone = zoneName;
          allGeneratedRoutes.push(route);
        });
      } catch (error) {
        console.error(`Error processing zone ${zoneName}:`, error);
      }
    }

    // Process each generated route
    for (const route of allGeneratedRoutes) {
      try {
        totalRouteCount++;
        route.routeNumber = totalRouteCount;
        let routeModifiedBySwap = false;

        if (!route?.employees?.length) {
          console.warn(`Skipping invalid route ${route.routeNumber}`);
          continue;
        }

        const routeCoordinates = route.employees
          .filter(emp => emp.location?.lat && emp.location?.lng)
          .map(emp => [emp.location.lat, emp.location.lng]);

        if (routeCoordinates.length === 0) {
          console.warn(`No valid coordinates for route ${route.routeNumber}`);
          assignErrorState(route);
          routeData.routeData.push(route);
          continue;
        }

        const facilityCoordinates = [facility.geoY, facility.geoX];
        const isDropoff = route.tripType?.toLowerCase() === "dropoff";
        const allCoordinates = isDropoff
          ? [facilityCoordinates, ...routeCoordinates]
          : [...routeCoordinates, facilityCoordinates];

        let routeDetails = await calculateRouteDetails(
          allCoordinates,
          route.employees,
          pickupTimePerEmployee
        );

        if (routeDetails.error) {
          console.error(`Route calculation failed for route ${route.routeNumber}: ${routeDetails.error}`);
          assignErrorState(route);
          routeData.routeData.push(route);
          continue;
        }

        updateRouteWithDetails(route, routeDetails);

        // Handle guard requirements and swapping
        if (guard && route.employees.length > 1) {
          const swapResult = await handleGuardRequirements(
            route,
            isDropoff,
            facility,
            pickupTimePerEmployee
          );

          if (swapResult.swapped) {
            routeModifiedBySwap = true;
            finalTotalSwappedRoutes++;
            route.guardNeeded = false;

            // Recalculate route after swap
            routeDetails = await calculateRouteDetails(
              swapResult.newCoordinates,
              route.employees,
              pickupTimePerEmployee
            );

            if (!routeDetails.error) {
              updateRouteWithDetails(route, routeDetails);
            }
          } else if (swapResult.guardNeeded) {
            route.guardNeeded = true;

            // --- PATCH FOR GUARD CAPACITY ---
            // Remove one employee to make space for the guard
            if (route.employees.length > 0) {
              const removedEmp = route.employees.pop();
              if (removedEmp) {
                if (!removedForGuardByZone[route.zone]) removedForGuardByZone[route.zone] = [];
                removedForGuardByZone[route.zone].push(removedEmp);
              }
            }
            route.vehicleCapacity = Math.max(1, route.vehicleCapacity - 1);

            // Recalculate route details for the new employee list
            const newRouteCoordinates = route.employees
              .filter(emp => emp.location?.lat && emp.location?.lng)
              .map(emp => [emp.location.lat, emp.location.lng]);
            const newAllCoordinates = isDropoff
              ? [facilityCoordinates, ...newRouteCoordinates]
              : [...newRouteCoordinates, facilityCoordinates];

            const newRouteDetails = await calculateRouteDetails(
              newAllCoordinates,
              route.employees,
              pickupTimePerEmployee
            );
            if (!newRouteDetails.error) {
              updateRouteWithDetails(route, newRouteDetails);
            }
            // --- END PATCH ---
          }
        }

        calculatePickupTimes(route, shiftTime, pickupTimePerEmployee, reportingTime);

        if (maxDuration && route.routeDetails.duration > maxDuration) {
          route.durationExceeded = true;
          console.warn(`Route ${route.routeNumber} exceeds max duration`);
        }

        route.swapped = routeModifiedBySwap;
        routeData.routeData.push(route);

      } catch (error) {
        console.error(`Error processing route ${route.routeNumber}:`, error);
        assignErrorState(route);
        routeData.routeData.push(route);
      }
    }

    // --- RE-BATCH REMOVED EMPLOYEES BY ZONE ---
    for (const [zoneName, removedList] of Object.entries(removedForGuardByZone)) {
      if (!removedList.length) continue;
      const maxCapacity = (profile.highCapacityZones || []).includes(zoneName) ? 12 : 6;
      const { routes: extraRoutes } = await processEmployeeBatch(
        removedList,
        maxCapacity,
        facility,
        tripType,
        profile.maxDuration || 7200,
        pickupTimePerEmployee,
        guard
      );
      for (const route of extraRoutes) {
        route.zone = zoneName;
        allGeneratedRoutes.push(route);
        totalRouteCount++;
        route.routeNumber = totalRouteCount;
        // Calculate route details and pickup times for these new routes
        const routeCoordinates = route.employees
          .filter(emp => emp.location?.lat && emp.location?.lng)
          .map(emp => [emp.location.lat, emp.location.lng]);
        const facilityCoordinates = [facility.geoY, facility.geoX];
        const isDropoff = route.tripType?.toLowerCase() === "dropoff";
        const allCoordinates = isDropoff
          ? [facilityCoordinates, ...routeCoordinates]
          : [...routeCoordinates, facilityCoordinates];
        const routeDetails = await calculateRouteDetails(
          allCoordinates,
          route.employees,
          pickupTimePerEmployee
        );
        if (!routeDetails.error) {
          updateRouteWithDetails(route, routeDetails);
        }
        calculatePickupTimes(route, shiftTime, pickupTimePerEmployee, reportingTime);
        routeData.routeData.push(route);
      }
    }
    // --- END RE-BATCH ---

    const stats = calculateRouteStatistics(routeData, employees.length);

    const response = createSimplifiedResponse({
      ...routeData,
      ...stats,
      totalSwappedRoutes: finalTotalSwappedRoutes
    });

    if (saveToDatabase) {
      try {
        await saveRouteDataToDatabase(response);
      } catch (error) {
        console.error("Failed to save route data:", error);
      }
    }

    return response;

  } catch (error) {
    console.error("Route generation failed:", error);
    return createEmptyResponse(data);
  }
}


// Helper functions
function assignErrorState(route) {
  route.employees = route.employees.map((e, i) => ({
    ...e,
    order: i + 1,
    pickupTime: "Error",
    dropoffTime: "Error"
  }));
  route.encodedPolyline = "error_polyline";
  route.routeDetails = { distance: 0, duration: 0, legs: [] };
  route.swapped = false;
  route.error = true;
}

function updateRouteWithDetails(route, routeDetails) {
  route.employees = routeDetails.employees;
  route.encodedPolyline = routeDetails.encodedPolyline;
  route.routeDetails = {
    distance: routeDetails.totalDistance,
    duration: routeDetails.totalDuration,
    legs: routeDetails.legs
  };
}

function calculateRouteStatistics(routeData, totalEmployees) {
  const totalRoutes = routeData.routeData.length;
  const averageOccupancy = totalRoutes > 0 ? totalEmployees / totalRoutes : 0;
  
  let totalDistance = 0;
  let totalDuration = 0;

  routeData.routeData.forEach(route => {
    if (!route.error && route.routeDetails?.duration !== Infinity) {
      totalDistance += route.routeDetails?.distance || 0;
      totalDuration += route.routeDetails?.duration || 0;
    }
  });

  return {
    totalEmployees,
    totalRoutes,
    averageOccupancy,
    routeDetails: {
      totalDistance: totalDistance / 1000, // Convert to kilometers
      totalDuration
    }
  };
}

function createEmptyResponse(data) {
  return {
    uuid: data.uuid || uuidv4(),
    date: data.date,
    shift: data.shiftTime,
    tripType: data.tripType?.toUpperCase() === "PICKUP" ? "P" : "D",
    totalEmployees: 0,
    totalRoutes: 0,
    averageOccupancy: 0,
    routeDetails: { totalDistance: 0, totalDuration: 0 },
    totalSwappedRoutes: 0,
    routes: []
  };
}


// Helper functions

function assignErrorState(route) {
  route.employees = route.employees.map((e, i) => ({
    ...e,
    order: i + 1,
    pickupTime: "Error",
    dropoffTime: "Error"
  }));
  route.encodedPolyline = "error_polyline";
  route.routeDetails = { distance: 0, duration: 0, legs: [] };
  route.swapped = false;
}

function updateRouteWithDetails(route, routeDetails) {
  route.employees = routeDetails.employees;
  route.encodedPolyline = routeDetails.encodedPolyline;
  route.routeDetails = {
    distance: routeDetails.totalDistance,
    duration: routeDetails.totalDuration,
    legs: routeDetails.legs
  };
}

function calculateRouteStatistics(routeData, totalEmployees) {
  const totalRoutes = routeData.routeData.length;
  const averageOccupancy = totalRoutes > 0 ? totalEmployees / totalRoutes : 0;
  
  let totalDistance = 0;
  let totalDuration = 0;

  routeData.routeData.forEach(route => {
    if (route.routeDetails?.duration !== Infinity) {
      totalDistance += route.routeDetails?.distance || 0;
      totalDuration += route.routeDetails?.duration || 0;
    }
  });

  return {
    totalEmployees,
    totalRoutes,
    averageOccupancy,
    routeDetails: {
      totalDistance: totalDistance / 1000,
      totalDuration
    }
  };
}

function createSimplifiedResponse(routeData) {
  return {
    uuid: routeData.uuid,
    date: routeData.date,
    shift: routeData.shift,
    tripType: routeData.tripType === "PICKUP" ? "P" : "D",
    totalEmployees: routeData.totalEmployees,
    totalRoutes: routeData.totalRoutes,
    averageOccupancy: routeData.averageOccupancy,
    routeDetails: routeData.routeDetails,
    totalSwappedRoutes: routeData.totalSwappedRoutes,
    routes: routeData.routeData.map(route => ({
      routeNumber: route.routeNumber,
      zone: route.zone,
      vehicleCapacity: route.vehicleCapacity,
      guard: route.guardNeeded || false,
      swapped: route.swapped || false,
      durationExceeded: route.durationExceeded || false,
      uniqueKey: route.uniqueKey,
      distance: (route.routeDetails?.distance || 0) / 1000,
      duration: route.routeDetails?.duration || 0,
      encodedPolyline: route.encodedPolyline || "no_polyline",
      employees: route.employees.map((emp, index) => ({
        empCode: emp.empCode,
        gender: emp.gender,
        eta: route.tripType === "DROPOFF" ? emp.dropoffTime : emp.pickupTime,
        order: (emp.order !== undefined && emp.order >= 1) ? emp.order : index + 1,
        geoX: emp.geoX,
        geoY: emp.geoY
      }))
    }))
  };
}

function createEmptyResponse(data) {
  return {
    uuid: data.uuid || uuidv4(),
    date: data.date,
    shift: data.shiftTime,
    tripType: data.tripType?.toUpperCase() === "PICKUP" ? "P" : "D",
    totalEmployees: 0,
    totalRoutes: 0,
    averageOccupancy: 0,
    routeDetails: { totalDistance: 0, totalDuration: 0 },
    totalSwappedRoutes: 0,
    routes: []
  };
}



module.exports = {
  generateRoutes,
  isOsrmAvailable,
  // Export other functions if they are needed externally
  // calculateRouteDetails,
  // processEmployeeBatch,
  // calculatePickupTimes,
  // assignEmployeesToZones,
};
