import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { routeService } from "../services/api";
import LoadingOverlay from "../components/LoadingOverlay";
import "./GeneratedRoutes.css";
import {
  CalendarIcon,
  MapIcon,
  ClockIcon,
  TruckIcon,
  CalendarDaysIcon,
} from "lucide-react";

function GeneratedRoutes() {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        console.log("Attempting to fetch routes...");

        setLoading(true);

        try {
          const healthResponse = await fetch(
            "http://localhost:5001/api/health"
          );
          console.log("Server health check:", await healthResponse.text());

          // Also check database directly
          const dbResponse = await fetch(
            "http://localhost:5001/api/debug/database"
          );
          console.log("Database check:", await dbResponse.json());
        } catch (err) {
          console.error("Server health check failed:", err);
        }

        try {
          console.log("Making API request to get all routes...");
          const fetchedRoutes = await routeService.getAllRoutes();
          console.log("Fetched routes:", fetchedRoutes);

          if (!fetchedRoutes || fetchedRoutes.length === 0) {
            setError("No routes found. Please generate some routes first.");
          } else {
            setRoutes(fetchedRoutes);
          }
        } catch (err) {
          console.error("Error fetching routes:", err);
          setError(`Failed to fetch routes: ${err.message || "Unknown error"}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, []);

  const handleRouteClick = (route) => {
    navigate(`/routes/${route.uuid}`, {
      state: {
        routes: route,
        profile: route.profile,
        facility: route.facility,
        shift: route.shift,
        tripType: route.tripType,
        employeeData: route.employeeData,
      },
    });
  };

  if (loading) return <LoadingOverlay />;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="generated-routes-page">
 <div class="px-6 pt-6 pb-3 max-w-screen-xl mx-auto heading">
  <h1 class="mb-4 text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-5xl lg:text-6xl dark:text-white">
    Route <span class="text-blue-600 dark:text-blue-500">Visualization</span> with smart optimization
  </h1>
</div>


      <div className="routes-grid">
        {routes.map((route) => (
          <div
            key={route.uuid}
            onClick={() => handleRouteClick(route)}
            className="w-full max-w-md p-5 mb-4 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <CalendarIcon className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                Route {new Date(route.date).toLocaleDateString()}
              </h3>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                {route.tripType}
              </span>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-start">
                <MapIcon className="w-4 h-4 mr-2 mt-0.5 text-gray-500 dark:text-gray-400" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white mr-1">
                    Profile:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {route.profile?.name || "N/A"}
                  </span>
                </div>
              </div>

              <div className="flex items-start">
                <ClockIcon className="w-4 h-4 mr-2 mt-0.5 text-gray-500 dark:text-gray-400" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white mr-1">
                    Shift:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {route.shift}
                  </span>
                </div>
              </div>

              <div className="flex items-start">
                <TruckIcon className="w-4 h-4 mr-2 mt-0.5 text-gray-500 dark:text-gray-400" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white mr-1">
                    Total Routes:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {route.totalRoutes}
                  </span>
                </div>
              </div>

              <div className="flex items-start">
                <CalendarDaysIcon className="w-4 h-4 mr-2 mt-0.5 text-gray-500 dark:text-gray-400" />
                <div>
                  <span className="font-medium text-gray-900 dark:text-white mr-1">
                    Date Generated:
                  </span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {new Date(route.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                className="w-full py-1.5 text-sm font-medium text-center text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRouteClick(route);
                }}
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default GeneratedRoutes;
