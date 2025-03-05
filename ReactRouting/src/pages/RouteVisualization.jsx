import React, { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { MapContainer, TileLayer } from 'react-leaflet';
import MapComponent from '../components/MapComponent';
import RouteTracker from '../components/RouteTracker';
import Sidebar from '../components/Sidebar';
import LoadingOverlay from '../components/LoadingOverlay';
import { loadZoneData } from '../utils/dataLoader';
import { calculateRouteDuration, calculateRouteDetails } from '../utils/routeCalculations';
import ZoneLayer from '../components/ZoneLayer';
import 'leaflet/dist/leaflet.css';
import './RouteVisualization.css';

function RouteVisualization() {
  const { profileId } = useParams();
  const location = useLocation();
  const routeData = location.state?.routes || { routeData: [] };
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [highCapacityZones, setHighCapacityZones] = useState(new Set());
  const [routeDurations, setRouteDurations] = useState({});
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const facility = [28.402910, 76.998015];

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const zoneData = await loadZoneData();
        setZones(zoneData.features || []);

        // Process routes from the route data
        const routes = routeData.routeData || [];
        
        // Create set of high capacity zones
        const highCapacityZoneSet = new Set(routes.reduce((acc, route) => {
          if (route.vehicleCapacity > 4) {
            acc.push(route.zone);
          }
          return acc;
        }, []));
        setHighCapacityZones(highCapacityZoneSet);

        // Process only the first route initially
        if (routes.length > 0) {
          const firstRoute = routes[0];
          const coordinates = firstRoute.employees.map(emp => [emp.location.lat, emp.location.lng]);
          coordinates.push(facility);

          // Add shift time to each employee
          const employeesWithShift = firstRoute.employees.map(emp => ({
            ...emp,
            shiftTime: 1230 // Add the shift time here
          }));

          const routeDetails = await calculateRouteDetails(coordinates, employeesWithShift);
          const processedRoute = {
            ...firstRoute,
            employees: routeDetails.employees,
            totalDistance: routeDetails.totalDistance,
            totalDuration: routeDetails.totalDuration
          };

          setSelectedRoute(processedRoute);
          setSelectedEmployee(processedRoute.employees[0]);
          setRoutes(routes); // Store unprocessed routes
        }

      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [routeData]);

  const handleRouteSelect = async (route) => {
    try {
      setLoading(true);
      const coordinates = route.employees.map(emp => [emp.location.lat, emp.location.lng]);
      coordinates.push(facility);

      // Add shift time to each employee
      const employeesWithShift = route.employees.map(emp => ({
        ...emp,
        shiftTime: 1230 // Add the shift time here
      }));

      const routeDetails = await calculateRouteDetails(coordinates, employeesWithShift);
      const processedRoute = {
        ...route,
        employees: routeDetails.employees,
        totalDistance: routeDetails.totalDistance,
        totalDuration: routeDetails.totalDuration
      };

      setSelectedRoute(processedRoute);
      setSelectedEmployee(processedRoute.employees[0]);
    } catch (error) {
      console.error('Error processing route:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeSelect = (employee) => {
    setSelectedEmployee(employee);
  };

  return (
    <div className="route-visualization">
      {loading && <LoadingOverlay />}
      
      <Sidebar
        routes={routes}
        selectedRoute={selectedRoute}
        onRouteSelect={handleRouteSelect}
        selectedProfile={routeData}
      />

      <div className="visualization-content">
        <div className="map-container">
          <MapContainer
            center={[28.6139, 77.2090]}
            zoom={10}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <ZoneLayer zones={zones} highCapacityZones={highCapacityZones} />
            {selectedRoute && (
              <MapComponent
                route={selectedRoute}
                facility={facility}
                onEmployeeSelect={handleEmployeeSelect}
              />
            )}
          </MapContainer>
        </div>

        <div className="route-details">
          {selectedRoute && (
            <div className="route-section">
              <h3>Route Details - {selectedRoute.zone}</h3>
              {selectedRoute.employees.map((employee, index) => (
                <RouteTracker
                  key={`employee-${index}`}
                  employee={employee}
                  isSelected={selectedEmployee?.id === employee.id}
                  onClick={() => handleEmployeeSelect(employee)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RouteVisualization;