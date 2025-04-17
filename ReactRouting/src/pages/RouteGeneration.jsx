import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ProfileList from "../components/ProfileList";
import Sidebar from "../components/Sidebar";
import LoadingOverlay from "../components/LoadingOverlay";
import {
  routeService,
  facilityService,
  employeeService,
} from "../services/api";
import { loadZoneData } from "../utils/dataLoader";
import {
  calculateRouteDuration,
  calculateRouteDetails,
} from "../utils/routeCalculations";

function RouteGeneration() {
  const navigate = useNavigate();
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [employeeData, setEmployeeData] = useState([]);
  const [zones, setZones] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [zoneData, facilitiesData] = await Promise.all([
          loadZoneData(),
          facilityService.getAll(),
        ]);
        setZones(zoneData.features || []);
        setFacilities(facilitiesData);
      } catch (error) {
        console.error("Failed to load data:", error);
        setError("Failed to load zone or facility data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleProfileSelect = async (profile) => {
    const completeProfile = {
      ...profile,
      _id: profile._id || profile.id,
      id: profile._id || profile.id,
      shiftTime: profile.shiftTime || "8am-8pm",
      zonePairingMatrix: profile.zonePairingMatrix || {},
      highCapacityZones: profile.highCapacityZones || [],
    };
    setSelectedProfile(completeProfile);
    setIsSidebarOpen(true);
  };

  const handleGenerateRoutes = async ({ facilityId, shift, tripType }) => {
    if (!selectedProfile) {
      setError("Please select a profile first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log("Starting route generation with:", {
        facilityId,
        shift,
        tripType,
      });

      // Extract the shift time from the shift parameter
      const shiftTime = shift.split("-")[0]; // This will give us the start time (e.g., "0900" from "0900-1700")
      console.log("Using shift time for calculations:", shiftTime);

      // Load employees based on selected shift
      const employees = await employeeService.getEmployeeData(shift);
      if (!employees || employees.length === 0) {
        setError("No employees found for the selected shift");
        return;
      }

      console.log(`Found ${employees.length} employees for shift ${shift}`);
      console.log("Sample employee data:", employees[0]); // Log sample employee data
      setEmployeeData(employees);

      const selectedFacility = facilities.find(
        (f) => f.id === parseInt(facilityId)
      );
      if (!selectedFacility) {
        throw new Error("Selected facility not found");
      }

      console.log("Selected facility:", selectedFacility);
      const facility = [selectedFacility.geoX, selectedFacility.geoY];
      const BATCH_SIZE = 50;
      const employeesByZone = {};

      // Group employees by zone in batches
      console.log("Starting to group employees by zone...");
      console.log(
        "Available zones:",
        zones.map((z) => z.properties?.Name)
      );

      for (let i = 0; i < zones.length; i++) {
        const zone = zones[i];
        const zoneName = zone.properties?.Name || "Unknown Zone";
        console.log(`Processing zone: ${zoneName}`);

        // Get zone boundaries
        const zonePolygon = zone.geometry.coordinates[0];
        const zoneEmployees = employees
          .filter((emp) => {
            if (!emp.location) {
              console.log("Employee without location:", emp);
              return false;
            }

            // Check if employee location is within zone boundaries
            const isInZone = isPointInPolygon(
              [emp.location.lng, emp.location.lat],
              zonePolygon
            );

            if (isInZone) {
              console.log(`Employee ${emp.id} assigned to zone ${zoneName}`);
            }

            return isInZone;
          })
          .map((emp) => ({
            id: emp.id,
            name: emp.name,
            zone: zoneName,
            address: emp.address || "No address provided",
            location: emp.location,
            gender: emp.gender,
            shift: emp.shift,
          }));

        if (zoneEmployees.length > 0) {
          employeesByZone[zoneName] = zoneEmployees;
          console.log(
            `Found ${zoneEmployees.length} employees in zone ${zoneName}`
          );
          if (i % 10 === 0)
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      console.log("Employees grouped by zone:", Object.keys(employeesByZone));
      console.log(
        "Zone assignments:",
        Object.entries(employeesByZone).map(
          ([zone, emps]) => `${zone}: ${emps.length} employees`
        )
      );

      if (Object.keys(employeesByZone).length === 0) {
        setError(
          "No employees found in any zones. Please check zone assignments."
        );
        return;
      }

      let routeData = {
        date: new Date().toISOString().split("T")[0],
        shift,
        tripType,
        facilityId: parseInt(facilityId),
        facility: selectedFacility,
        profile: selectedProfile,
        employeeData: employees,
        routeData: [],
      };

      console.log("Starting route generation with profile:", selectedProfile);

      const processedZones = new Set();
      const { zonePairingMatrix = {}, highCapacityZones = [] } =
        selectedProfile;

      // Cache distance calculations
      const distanceCache = new Map();
      const calculateDistance = (point1, point2) => {
        const key = `${point1[0]},${point1[1]}-${point2[0]},${point2[1]}`;
        if (!distanceCache.has(key)) {
          distanceCache.set(
            key,
            Math.sqrt(
              Math.pow(point2[0] - point1[0], 2) +
                Math.pow(point2[1] - point1[1], 2)
            )
          );
        }
        return distanceCache.get(key);
      };

      // Process zones in batches
      if (selectedProfile.zoneClubbing) {
        console.log("Processing zones with clubbing enabled");
        // Ensure we have shift time for pickup calculations
        const shiftTime = shift.split("-")[0].replace(/[^0-9]/g, ""); // Extract numeric shift time
        const zonePairs = Object.entries(zonePairingMatrix);
        for (let i = 0; i < zonePairs.length; i++) {
          const [zone1, pairedZones] = zonePairs[i];
          if (processedZones.has(zone1)) continue;

          for (const zone2 of pairedZones) {
            if (processedZones.has(zone2)) continue;

            const combinedEmployees = [
              ...(employeesByZone[zone1] || []),
              ...(employeesByZone[zone2] || []),
            ];

            if (combinedEmployees.length === 0) continue;

            console.log(
              `Processing clubbed zones: ${zone1}-${zone2} with ${combinedEmployees.length} employees`
            );

            const maxCapacity =
              highCapacityZones.includes(zone1) ||
              highCapacityZones.includes(zone2)
                ? 12
                : 6;

            for (let j = 0; j < combinedEmployees.length; j += BATCH_SIZE) {
              const batch = combinedEmployees.slice(j, j + BATCH_SIZE);
              const routes = await processEmployeeBatch(
                batch,
                maxCapacity,
                facility,
                calculateDistance
              );

              // Calculate pickup times for each route
              routes.forEach((route) => {
                calculatePickupTimes(route, shiftTime);
              });

              routeData.routeData.push(
                ...routes.map((route) => ({
                  ...route,
                  zone: `${zone1}-${zone2}`,
                  isClubbed: true,
                }))
              );

              await new Promise((resolve) => setTimeout(resolve, 0));
            }

            processedZones.add(zone1);
            processedZones.add(zone2);
          }
        }
      }

      // Handle remaining zones in batches
      const remainingZones = Object.entries(employeesByZone).filter(
        ([zoneName]) => !processedZones.has(zoneName)
      );

      console.log(
        "Processing remaining zones:",
        remainingZones.map(([zone]) => zone)
      );

      for (let i = 0; i < remainingZones.length; i++) {
        const [zoneName, zoneEmployees] = remainingZones[i];
        if (zoneEmployees.length === 0) continue;

        console.log(
          `Processing zone ${zoneName} with ${zoneEmployees.length} employees`
        );

        const maxCapacity = highCapacityZones.includes(zoneName) ? 12 : 6;

        for (let j = 0; j < zoneEmployees.length; j += BATCH_SIZE) {
          const batch = zoneEmployees.slice(j, j + BATCH_SIZE);
          const routes = await processEmployeeBatch(
            batch,
            maxCapacity,
            facility,
            calculateDistance
          );
          routeData.routeData.push(
            ...routes.map((route) => ({
              ...route,
              zone: zoneName,
              isClubbed: false,
            }))
          );

          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      console.log(`Generated ${routeData.routeData.length} routes`);

      if (routeData.routeData.length === 0) {
        throw new Error(
          "No valid routes could be generated. Please check employee data and zone assignments."
        );
      }

      // After generating routes, calculate pickup and drop times
      for (const route of routeData.routeData) {
        // Ensure routeData is structured correctly
        const routeCoordinates = route.employees.map((emp) => [
          emp.location.lat,
          emp.location.lng,
        ]);
        const facilityCoordinates = [facility[0], facility[1]];
        const allCoordinates = [...routeCoordinates, facilityCoordinates]; // Employee → Facility

        const durationDetails = await calculateRouteDetails(
          allCoordinates,
          route.employees
        );

        // Log the duration details for debugging
        console.log("Duration Details:", durationDetails);

        // Check if durationDetails has employees and is an array
        if (Array.isArray(durationDetails.employees)) {
          // Update each employee with pickup and drop times
          route.employees = route.employees.map((emp, index) => ({
            ...emp,
            pickupTime: durationDetails.employees[index]?.pickupTime || "N/A",
            dropTime: durationDetails.employees[index]?.dropTime || "N/A",
          }));
        } else {
          console.warn(
            "No employees found in duration details:",
            durationDetails
          );
          // Handle the case where employees are not available
          route.employees = route.employees.map((emp) => ({
            ...emp,
            pickupTime: "N/A",
            dropTime: "N/A",
          }));
        }
      }

      // After all employees have been assigned to routes and before saving to the database
      for (const route of routeData.routeData) {
        // Create properly formatted coordinates based on trip type
        const coordinates = [];

        // Always start at facility
        coordinates.push([selectedFacility.geoX, selectedFacility.geoY]);

        // Store the sequence order in each employee object
        route.employees.forEach((emp, idx) => {
          emp.pickupOrder = idx + 1;
        });

        // Add all employee locations in the correct order
        // The order of employees in the array determines pickup order
        route.employees.forEach((emp, idx) => {
          if (emp.location && emp.location.lat && emp.location.lng) {
            coordinates.push([emp.location.lng, emp.location.lat]);
            console.log(
              `Added employee ${emp.name || "Unnamed"} at position ${idx + 1}`
            );
          }
        });

        // For pickup or round trips, end at facility
        if (
          tripType.toLowerCase() === "pickup" ||
          tripType.toLowerCase() === "round" ||
          tripType.toLowerCase() === "roundtrip"
        ) {
          coordinates.push([selectedFacility.geoX, selectedFacility.geoY]);
        }

        // Add geometry data to each route (this should be a GeoJSON LineString)
        route.geometry = {
          type: "LineString",
          coordinates: coordinates,
        };

        // Also store the trip type explicitly with the route
        route.tripType = tripType;

        // Log to verify the geometry is properly structured
        console.log(
          `Route ${route.routeNumber} geometry:`,
          route.geometry.coordinates.length + " points, trip type: " + tripType
        );
        console.log(
          "Employee pickup order:",
          route.employees
            .map(
              (emp) => `${emp.name || "Unnamed"} (order: ${emp.pickupOrder})`
            )
            .join(", ")
        );
      }

      // First, check if OSRM is available
      let osrmAvailable = false;
      try {
        const osrmResponse = await fetch("http://localhost:5000/health", {
          signal: AbortSignal.timeout(1000),
        });
        osrmAvailable = osrmResponse.ok;
      } catch (error) {
        console.warn("OSRM service not available:", error.message);
      }

      // For each route, calculate and save the road-following polyline if OSRM is available
      for (const route of routeData.routeData) {
        try {
          // Get employee waypoints in correct order
          const waypoints = route.employees
            .filter(
              (emp) => emp.location && emp.location.lat && emp.location.lng
            )
            .map((emp) => [emp.location.lat, emp.location.lng]);

          // Create OSRM waypoints string
          // IMPORTANT: For OSRM, coordinates must be in [longitude,latitude] order
          let osrmWaypoints = waypoints.map(
            (point) => `${point[1]},${point[0]}`
          ); // [lng,lat] for OSRM

          // Add facility as the final destination for pickup/round trips
          if (
            tripType.toLowerCase() === "pickup" ||
            tripType.toLowerCase() === "round" ||
            tripType.toLowerCase() === "roundtrip"
          ) {
            // IMPORTANT: facility is [geoX, geoY] which is already in [longitude,latitude] order
            osrmWaypoints.push(
              `${selectedFacility.geoX},${selectedFacility.geoY}`
            );
            console.log(
              "Added facility as final destination:",
              `[${selectedFacility.geoX}, ${selectedFacility.geoY}]`
            );
          }

          const waypointsString = osrmWaypoints.join(";");
          console.log("OSRM waypoints string:", waypointsString);
          console.log("type of waypointstring",typeof waypointsString);

          try {
            const response = await fetch(
              `http://localhost:5000/route/v1/driving/${waypointsString}?overview=full&geometries=polyline&steps=true`
            );

            if (!response.ok) {
              throw new Error(`OSRM request failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.code === "Ok" && data.routes && data.routes[0]) {
              // Store the encoded polyline directly from OSRM response
              route.encodedPolyline = data.routes[0].geometry;

              // Store basic geometry as fallback
              route.geometry = {
                type: "LineString",
                coordinates: [
                  ...waypoints.map((point) => [point[1], point[0]]), // Convert to [lng,lat]
                  [selectedFacility.geoX, selectedFacility.geoY], // Facility is already [lng,lat]
                ],
              };

              // Verify the last point matches the facility
              const lastPoint =
                route.roadGeometry.coordinates[
                  route.roadGeometry.coordinates.length - 1
                ];
              console.log("Last point in road geometry:", lastPoint);
              console.log("Facility coordinates:", [
                selectedFacility.geoX,
                selectedFacility.geoY,
              ]);

              if (
                Math.abs(lastPoint[0] - selectedFacility.geoX) > 0.0001 ||
                Math.abs(lastPoint[1] - selectedFacility.geoY) > 0.0001
              ) {
                console.warn(
                  "Warning: Last point does not match facility coordinates"
                );
              }

              // Store route details
              route.routeDetails = {
                distance: data.routes[0].distance,
                duration: data.routes[0].duration,
                legs: data.routes[0].legs,
              };

              // Calculate pickup times
              calculatePickupTimes(route, shiftTime);
            }
          } catch (error) {
            console.warn("Failed to calculate road geometry:", error);
            // Set up fallback geometry
            route.geometry = {
              type: "LineString",
              coordinates: [
                ...waypoints.map((point) => [point[1], point[0]]), // Convert to [lng,lat]
                [selectedFacility.geoX, selectedFacility.geoY], // Facility is already [lng,lat]
              ],
            };
          }
        } catch (error) {
          console.error("Error processing route:", error);
        }
      }

      console.log("Creating routes in database...", routeData);
      const generatedRoutes = await routeService.create(routeData);
      console.log("Routes created successfully:", generatedRoutes);
      setRoutes(generatedRoutes);

      // Navigate to the route visualization page with all necessary data
      console.log("Navigating to route visualization page...");
      navigate(`/routes/${generatedRoutes.uuid}`, {
        state: {
          routes: generatedRoutes,
          profile: selectedProfile,
          facility: selectedFacility,
          shift,
          tripType,
          employeeData: employees,
        },
      });
    } catch (error) {
      console.error("Failed to generate routes:", error);
      setError("Failed to generate routes. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const processEmployeeBatch = async (
    employees,
    maxCapacity,
    facility,
    calculateDistance
  ) => {
    const routes = [];

    // Validate and filter employees with valid locations
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
      console.warn("No valid employee locations found in batch");
      return [];
    }

    // Helper function to calculate direction vector
    const calculateDirectionVector = (from, to) => {
      const dx = to[0] - from[0];
      const dy = to[1] - from[1];
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      return magnitude > 0 ? [dx / magnitude, dy / magnitude] : [0, 0];
    };

    // Helper function to calculate direction similarity
    const calculateDirectionSimilarity = (dir1, dir2) => {
      return dir1[0] * dir2[0] + dir1[1] * dir2[1];
    };

    let remainingEmployees = [...validEmployees];

    while (remainingEmployees.length > 0) {
      const routeEmployees = [];

      // Start with the farthest employee from facility
      remainingEmployees.sort((a, b) => {
        const distA = calculateDistance(
          [a.location.lat, a.location.lng],
          facility
        );
        const distB = calculateDistance(
          [b.location.lat, b.location.lng],
          facility
        );
        return distB - distA;
      });

      const firstEmployee = remainingEmployees.shift();
      routeEmployees.push(firstEmployee);

      // Try to fill the route up to maxCapacity
      while (
        routeEmployees.length < maxCapacity &&
        remainingEmployees.length > 0
      ) {
        const currentEmployee = routeEmployees[routeEmployees.length - 1];
        const lastPickup = [
          currentEmployee.location.lng,
          currentEmployee.location.lat,
        ];
        const directionToFacility = calculateDirectionVector(
          lastPickup,
          facility
        );

        // Score each remaining employee
        const scoredEmployees = remainingEmployees.map((emp) => {
          const distance = calculateDistance(
            [currentEmployee.location.lat, currentEmployee.location.lng],
            [emp.location.lat, emp.location.lng]
          );
          const direction = calculateDirectionVector(lastPickup, [
            emp.location.lng,
            emp.location.lat,
          ]);
          const directionScore = calculateDirectionSimilarity(
            direction,
            directionToFacility
          );

          // Score calculation:
          // Lower score is better
          // Distance * (2 - directionScore) means:
          // - Shorter distances are preferred
          // - Better direction alignment (directionScore closer to 1) reduces the effective distance
          const score = distance * (2 - directionScore);

          return { emp, score };
        });

        // Sort by score (lower is better)
        scoredEmployees.sort((a, b) => a.score - b.score);
        const nextEmployee = scoredEmployees[0].emp;

        routeEmployees.push(nextEmployee);
        remainingEmployees = remainingEmployees.filter(
          (emp) => emp !== nextEmployee
        );
      }

      routes.push({
        employees: routeEmployees,
        routeNumber: routes.length + 1,
        vehicleCapacity: maxCapacity,
        uniqueKey: `${routeEmployees[0].zone}_${
          routes.length + 1
        }_${Date.now()}`,
      });
    }

    return routes;
  };

  const handleRouteSelect = (route) => {
    setSelectedRoute(route);
  };

  // Helper function to check if a point is inside a polygon
  const isPointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];

      const intersect =
        yi > point[1] !== yj > point[1] &&
        point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const calculatePickupTimes = (route, shiftTime) => {
    if (!route || !route.employees || !shiftTime) {
      console.warn("Missing required data for pickup time calculation:", {
        route,
        shiftTime,
      });
      return;
    }

    const EMPLOYEE_BUFFER_MINUTES = 3; // Buffer time for each employee pickup
    const TRAFFIC_BUFFER_PERCENTAGE = 0.3; // 20% extra time for traffic

    try {
      // Parse shift time (facility arrival time)
      let facilityArrivalTime;
      shiftTime = String(shiftTime);

      if (shiftTime.match(/^\d{3,4}$/)) {
        const timeString = shiftTime.padStart(4, "0");
        const hours = parseInt(timeString.substring(0, 2), 10);
        const minutes = parseInt(timeString.substring(2), 10);

        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
          facilityArrivalTime = new Date();
          facilityArrivalTime.setHours(hours);
          facilityArrivalTime.setMinutes(minutes);
          facilityArrivalTime.setSeconds(0);
        } else {
          throw new Error(
            `Invalid time values: hours=${hours}, minutes=${minutes}`
          );
        }
      } else {
        throw new Error(`Unrecognized shift time format: ${shiftTime}`);
      }

      console.log(
        "Target facility arrival time:",
        facilityArrivalTime.toLocaleTimeString()
      );

      // For pickup trips, calculate backwards from facility arrival time
      if (route.tripType.toLowerCase() === "pickup") {
        // Sort employees by pickup order
        const sortedEmployees = [...route.employees].sort(
          (a, b) => a.pickupOrder - b.pickupOrder
        );

        // Get the OSRM route legs
        const legs = route.routeDetails?.legs || [];
        console.log(
          "Original route legs:",
          legs.map((leg) => Math.round(leg.duration / 60) + " minutes")
        );

        // Add traffic buffer to all leg durations
        const legsWithBuffer = legs.map((leg) => ({
          ...leg,
          duration: leg.duration * (1 + TRAFFIC_BUFFER_PERCENTAGE), // Add 20% for traffic
        }));

        console.log(
          "Route legs with traffic buffer:",
          legsWithBuffer.map(
            (leg) => Math.round(leg.duration / 60) + " minutes"
          )
        );

        // Start from facility arrival time and work backwards
        let currentTime = new Date(facilityArrivalTime);

        // First, subtract the last leg duration (last employee to facility)
        const lastLegDuration =
          legsWithBuffer[legsWithBuffer.length - 1]?.duration || 0;
        currentTime = new Date(currentTime.getTime() - lastLegDuration * 1000);

        // Process employees in reverse order (from last pickup to first)
        for (let i = sortedEmployees.length - 1; i >= 0; i--) {
          const employee = sortedEmployees[i];

          // Add employee buffer time (3 minutes per pickup)
          currentTime = new Date(
            currentTime.getTime() - EMPLOYEE_BUFFER_MINUTES * 60 * 1000
          );

          // Set pickup time for current employee
          employee.pickupTime = currentTime.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });

          // If not the first employee, subtract the leg duration to the previous employee
          if (i > 0) {
            // Get the leg duration between this employee and the previous one
            const legDuration = legsWithBuffer[i - 1]?.duration || 0;
            currentTime = new Date(currentTime.getTime() - legDuration * 1000);
          }

          console.log(
            `Employee ${employee.name || "Unnamed"} (Order: ${
              employee.pickupOrder
            }):`,
            {
              pickupTime: employee.pickupTime,
              legDuration: `${Math.round(
                legsWithBuffer[i]?.duration / 60 || 0
              )} minutes`,
              bufferTime: `${EMPLOYEE_BUFFER_MINUTES} minutes`,
            }
          );
        }

        // Update the original employees array with calculated times
        route.employees.forEach((emp) => {
          const sortedEmp = sortedEmployees.find((e) => e.id === emp.id);
          if (sortedEmp) {
            emp.pickupTime = sortedEmp.pickupTime;
          }
        });

        // Set facility arrival time
        route.facilityArrivalTime = facilityArrivalTime.toLocaleTimeString(
          "en-US",
          {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }
        );

        // Calculate route start time
        const routeStartTime = new Date(currentTime);

        // Verification logs
        console.log("Route timing details:");
        console.log("Route start time:", routeStartTime.toLocaleTimeString());
        console.log("Pickup sequence with buffers:");
        sortedEmployees.forEach((emp) => {
          console.log(
            `${emp.name || "Unnamed"} (Order: ${emp.pickupOrder}): ${
              emp.pickupTime
            }`
          );
        });
        console.log(
          "Facility arrival (shift time):",
          route.facilityArrivalTime
        );

        // Calculate and log total route duration including buffers
        const totalDuration =
          (facilityArrivalTime - routeStartTime) / 1000 / 60; // in minutes
        console.log(
          "Total route duration (including buffers):",
          Math.round(totalDuration),
          "minutes"
        );

        // Store buffer information in route details
        route.bufferDetails = {
          employeeBufferMinutes: EMPLOYEE_BUFFER_MINUTES,
          trafficBufferPercentage: TRAFFIC_BUFFER_PERCENTAGE * 100,
          totalBufferTime: Math.round(
            sortedEmployees.length * EMPLOYEE_BUFFER_MINUTES +
              (route.routeDetails.duration * TRAFFIC_BUFFER_PERCENTAGE) / 60
          ),
        };

        // Verify time gaps between pickups
        for (let i = 0; i < sortedEmployees.length - 1; i++) {
          const current = new Date(
            `2024-01-01 ${sortedEmployees[i].pickupTime}`
          );
          const next = new Date(
            `2024-01-01 ${sortedEmployees[i + 1].pickupTime}`
          );
          const gap = (next - current) / 1000 / 60; // gap in minutes
          console.log(
            `Time gap between employee ${i + 1} and ${i + 2}: ${Math.round(
              gap
            )} minutes`
          );
        }
      }
    } catch (error) {
      console.error("Error in calculatePickupTimes:", error);
      console.error("Problematic shift time:", shiftTime);
      route.employees.forEach((employee) => {
        employee.pickupTime = "N/A";
      });
      route.facilityArrivalTime = "N/A";
    }
  };

  return (
    <div className="route-generation-page">
      {isLoading && <LoadingOverlay />}
      {error && <div className="error-message">{error}</div>}

      <div className="px-6 pt-6 pb-3 max-w-screen-xl mx-auto heading">
  <h1 className="mb-4 text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-grey">
    Route Generation with{" "}
    <span className="text-blue-600 dark:text-blue-500">
      smart optimization
    </span>
  </h1>
  <p className="text-lg font-normal text-gray-500 lg:text-xl dark:text-gray-600">
    Plan and optimize employee pickup & drop routes efficiently using smart zone-based cab routing.
  </p>
</div>


      <div className="route-generation-content">
        <div className="route-generation-layout">
          <ProfileList onProfileSelect={handleProfileSelect} />
          {selectedProfile && (
            <div className="generation-controls">
              {isSidebarOpen && (
                <Sidebar
                  employeeData={employeeData}
                  zones={zones}
                  onGenerateRoutes={handleGenerateRoutes}
                  selectedProfile={selectedProfile}
                  routes={routes}
                  onRouteSelect={handleRouteSelect}
                  selectedRoute={selectedRoute}
                  showGenerationControls={true}
                  onClose={closeSidebar}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RouteGeneration;
