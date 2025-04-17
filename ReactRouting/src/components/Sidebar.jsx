import React, { useEffect, useState } from "react";
import { calculateRouteDetails } from "../utils/routeCalculations";
import { facilityService } from "../services/api";
import "./Sidebar.css";

function Sidebar({
  employeeData = [],
  zones = {},
  onGenerateRoutes,
  selectedProfile,
  routes = [],
  onRouteSelect,
  selectedRoute,
  showGenerationControls = false,
  onClose,
}) {
  const [routesWithDuration, setRoutesWithDuration] = useState([]);
  const facility = [28.40291, 76.998015];
  const MAX_DURATION_MINUTES = 150; // 2.5 hours in minutes
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedTripType, setSelectedTripType] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const calculateDurations = async () => {
      const updatedRoutes = await Promise.all(
        routes.map(async (route) => {
          if (!route.employees || !Array.isArray(route.employees)) {
            console.warn("Route has no employees or invalid employees data");
            return { ...route, duration: null, exceedsLimit: false };
          }

          // Get coordinates for the route including facility, filtering out employees with missing location data
          const routeCoordinates = [
            ...route.employees
              .filter(
                (emp) =>
                  emp &&
                  emp.location &&
                  typeof emp.location.lat === "number" &&
                  typeof emp.location.lng === "number"
              )
              .map((emp) => [emp.location.lat, emp.location.lng]),
            facility,
          ];

          if (routeCoordinates.length <= 1) {
            // Only facility coordinate present
            console.warn("No valid employee coordinates found for route");
            return { ...route, duration: null, exceedsLimit: false };
          }

          try {
            const details = await calculateRouteDetails(
              routeCoordinates,
              route.employees
            );
            const durationInMinutes = Math.round(details.totalDuration / 60);

            // Flag routes that exceed time limit
            const exceedsLimit = durationInMinutes > MAX_DURATION_MINUTES;

            return {
              ...route,
              duration: durationInMinutes,
              exceedsLimit,
            };
          } catch (error) {
            console.error("Error calculating route duration:", error);
            return {
              ...route,
              duration: null,
              exceedsLimit: false,
            };
          }
        })
      );

      setRoutesWithDuration(updatedRoutes);
    };

    if (routes.length > 0) {
      calculateDurations();
    }
  }, [routes]);

  useEffect(() => {
    const loadFacilities = async () => {
      try {
        const facilitiesData = await facilityService.getAll();
        setFacilities(facilitiesData);
      } catch (error) {
        console.error("Failed to load facilities:", error);
      }
    };
    loadFacilities();
  }, []);

  // Calculate summary statistics
  const totalEmployees = routesWithDuration.reduce(
    (sum, route) => sum + (route.employees?.length || 0),
    0
  );
  const totalRoutes = routesWithDuration.length;
  const avgOccupancy =
    totalRoutes > 0 ? (totalEmployees / totalRoutes).toFixed(1) : 0;
  const exceedingRoutes = routesWithDuration.filter(
    (r) => r.exceedsLimit
  ).length;

  const shiftOptions = [
    { value: "1230", label: "12:30 PM" },
    { value: "1500", label: "3:00 PM" },
    { value: "1800", label: "6:00 PM" },
    { value: "2100", label: "9:00 PM" },
    // Add more shift times as needed
  ];

  const tripTypeOptions = [
    { value: "pickup", label: "Pickup" },
    { value: "drop", label: "Drop" },
  ];

  const handleGenerate = async () => {
    if (!selectedFacility || !selectedShift || !selectedTripType) {
      alert("Please select all required options");
      return;
    }

    setIsLoading(true);
    try {
      await onGenerateRoutes({
        facilityId: selectedFacility,
        shift: selectedShift,
        tripType: selectedTripType,
      });
    } catch (error) {
      console.error("Failed to generate routes:", error);
      alert("Failed to generate routes");
    } finally {
      setIsLoading(false);
    }
  };

  if (!selectedProfile) {
    return (
      <div id="sidebar">
        <h2>Please select a profile</h2>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>
          {showGenerationControls ? "Route Generation" : "Route Visualization"}
        </h2>
        <button className="close-sidebar-button" onClick={onClose}>
          ✖
        </button>
      </div>

      <div className="sidebar-content">
        {/* Route Generation Controls - Only show if showGenerationControls is true */}
        {showGenerationControls && (
  <div className="generation-controls space-y-6">
    <h3 className="text-xl font-bold text-gray-800 mb-4">
      Route Generation Options
    </h3>

    {/* Facility Selector */}
    <div className="facility-selector max-w-sm">
      <label
        htmlFor="facility"
        className="block mb-2 text-sm font-medium text-gray-700"
      >
        Select Facility:
      </label>
      <select
        id="facility"
        value={selectedFacility}
        onChange={(e) => setSelectedFacility(e.target.value)}
        className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg
                   focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
      >
        <option value="">Select a facility</option>
        {facilities.map((facility) => (
          <option key={facility.id} value={facility.id}>
            {facility.name}
          </option>
        ))}
      </select>
    </div>

    {/* Shift Selector */}
    <div className="shift-selector max-w-sm">
      <label
        htmlFor="shift"
        className="block mb-2 text-sm font-medium text-gray-700"
      >
        Select Shift:
      </label>
      <select
        id="shift"
        value={selectedShift}
        onChange={(e) => setSelectedShift(e.target.value)}
        className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg
                   focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
      >
        <option value="">Select a shift</option>
        {shiftOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>

    {/* Trip Type Selector */}
    <div className="trip-type-selector max-w-sm">
      <label
        htmlFor="tripType"
        className="block mb-2 text-sm font-medium text-gray-700"
      >
        Select Trip Type:
      </label>
      <select
        id="tripType"
        value={selectedTripType}
        onChange={(e) => setSelectedTripType(e.target.value)}
        className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg
                   focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
      >
        <option value="">Select trip type</option>
        {tripTypeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>

    {/* Generate Button */}
    <div className="generate-button mt-4">
      <button
        onClick={handleGenerate}
        disabled={
          isLoading || !selectedFacility || !selectedShift || !selectedTripType
        }
        className="px-4 py-2 text-white bg-blue-600 rounded-lg disabled:opacity-50 hover:bg-blue-700 transition"
      >
        {isLoading ? "Generating..." : "Generate Routes"}
      </button>
    </div>
  </div>
)}


        {/* Route Summary Section */}
        {routesWithDuration.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: "Total Routes",
                  value: totalRoutes,
                  bg: "bg-blue-100",
                },
                {
                  label: "Total Employees",
                  value: totalEmployees,
                  bg: "bg-green-100",
                },
                {
                  label: "Avg. Occupancy",
                  value: avgOccupancy,
                  bg: "bg-yellow-100",
                },
                {
                  label: "Exceeding 2.5h",
                  value: exceedingRoutes,
                  bg: "bg-red-100",
                  highlight: true,
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`${item.bg} p-4 rounded-xl shadow-sm flex flex-col justify-center items-start`}
                >
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span
                    className={`text-lg font-semibold ${
                      item.highlight ? "text-red-600" : "text-gray-800"
                    }`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
        )}

        {/* Route List */}
        {routes.length > 0 && (
            <div className="route-list-content">
              {routesWithDuration.map((route, index) => (
                <div
                  key={`route-${index}`}
                  className={`route-item ${
                    selectedRoute?.routeNumber === route.routeNumber
                      ? "selected"
                      : ""
                  } ${route.exceedsLimit ? "exceeds-limit" : ""}`}
                  onClick={() => onRouteSelect(route)}
                >
                  {console.log("thi si",route)}
                    <div className="route-header">                      <span className="route-number">
                        Route {route.routeNumber || index + 1}
                      </span>
                      <span className="route-zone truncate max-w-[120px]" title={route.zone || route.employees?.[0]?.zone || "Unknown Zone"}>
  {route.zone || route.employees?.[0]?.zone || "Unknown Zone"}
</span>

                      <span className="employee-count">
                        {route.employees?.length || 0} employees
                      </span>
                      {route.duration && (
                        <span
                          className={`duration ${
                            route.exceedsLimit ? "exceeds-limit" : ""
                          }`}
                        >
                          {route.duration} min
                        </span>
                      )}
                    </div>
                  {/* Display leg-specific durations */}
                  {route.legs && route.legs.length > 0 && (
                    <div className="leg-details">
                      <h4>Route Legs:</h4>
                      {route.legs.map((leg, legIndex) => (
                        <div key={legIndex} className="leg-item">
                          <span>Leg {legIndex + 1}:</span>
                          <span>
                            Duration:{" "}
                            {leg.duration
                              ? Math.round(leg.duration / 60)
                              : "N/A"}{" "}
                            mins
                          </span>
                          <span>
                            Distance:{" "}
                            {leg.distance
                              ? (leg.distance / 1000).toFixed(1)
                              : "N/A"}{" "}
                            km
                          </span>
                          <span>Pickups: {leg.employees?.length || 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
