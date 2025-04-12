"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useLocation } from "react-router-dom"
import { MapContainer, TileLayer } from "react-leaflet"
import MapComponent from "../components/MapComponent"
import RouteTracker from "../components/RouteTracker"
import Sidebar from "../components/Sidebar"
import LoadingOverlay from "../components/LoadingOverlay"
import { loadZoneData } from "../utils/dataLoader"
import { calculateRouteDetails } from "../utils/routeCalculations"
import ZoneLayer from "../components/ZoneLayer"
import "leaflet/dist/leaflet.css"
import "./RouteVisualization.css"
import { routeService } from "../services/api"
import polyline from '@mapbox/polyline'; // Import polyline decoder

function RouteVisualization() {
  const { id } = useParams()
  const location = useLocation()
  const { routes, profile, facility, shift, tripType, employeeData } = location.state || {}

  // Memoize initial state values
  const [processedRoutes, setProcessedRoutes] = useState([])
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [zones, setZones] = useState([])
  const [highCapacityZones, setHighCapacityZones] = useState(new Set())
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [error, setError] = useState(null)

  // Memoize facility coordinates
  const facilityCoordinates = useMemo(
    () => (facility ? [facility.geoY, facility.geoX] : [28.40291, 76.998015]),
    [facility],
  )

  // Memoize route processing function
  const processRoutes = useCallback(
    async (routesData) => {
      if (!routesData?.routeData) {
        console.log('No routeData found in routesData:', routesData);
        return [];
      }

      console.log('Processing routes data:', JSON.stringify(routesData).slice(0, 500) + '...');

      // Create set of high capacity zones
      const highCapacityZoneSet = new Set(
        routesData.routeData.reduce((acc, route) => {
          if (route.vehicleCapacity > 4) {
            acc.push(route.zone);
          }
          return acc;
        }, [])
      );
      setHighCapacityZones(highCapacityZoneSet);

      const processed = routesData.routeData.map((route, index) => {
        console.log(`Processing route ${index}:`, route);

        // Parse employee data if it's a string
        let employees = route.employees || [];
        if (typeof employees === 'string') {
          try {
            employees = JSON.parse(employees);
            console.log(`Parsed employees for route ${index}, count:`, employees.length);
          } catch (e) {
            console.warn(`Failed to parse employees for route ${index}:`, e);
            employees = [];
          }
        }

        // Decode polyline
        let decodedCoordinates = [];
        if (route.encodedPolyline) {
          try {
            decodedCoordinates = polyline.decode(route.encodedPolyline);
            console.log(`Decoded polyline for route ${index}, points:`, decodedCoordinates.length);
          } catch (e) {
            console.warn(`Failed to decode polyline for route ${index}:`, e);
            decodedCoordinates = [];
          }
        } else {
          console.warn(`No encodedPolyline found for route ${index}`);
        }

        return {
          ...route,
          decodedCoordinates, // Use decoded coordinates
          employees,
        };
      });

      return processed;
    },
    []
  );

  // Load initial data
  useEffect(() => {
    let isMounted = true

    const loadData = async () => {
      try {
        setLoading(true)
        const zoneData = await loadZoneData()

        if (isMounted) {
          setZones(zoneData.features || [])

          if (routes) {
            const processed = await processRoutes(routes)

            if (isMounted) {
              setProcessedRoutes(processed)

              // Set the first route as selected
              if (processed.length > 0) {
                setSelectedRoute(processed[0])
                setSelectedEmployee(processed[0].employees[0])
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error)
        setError("Failed to load route visualization data: " + error.message)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [routes, processRoutes])

  // Memoize handlers
  const handleRouteSelect = useCallback((route) => {
    setSelectedRoute(route)
    if (route && route.employees && route.employees.length > 0) {
      setSelectedEmployee(route.employees[0])
    }
  }, [])

  const handleEmployeeSelect = useCallback((employee) => {
    setSelectedEmployee(employee)
  }, [])

  // Memoize the map center
  const mapCenter = useMemo(() => [28.6139, 77.209], [])

  useEffect(() => {
    if (!routes && id) {
      const fetchRouteData = async () => {
        try {
          setLoading(true)
          console.log("Fetching route data for ID:", id)
          
          const routeData = await routeService.getById(id)
          console.log("Fetched route data:", routeData)
          
          if (routeData) {
            // Process the route data
            const processed = await processRoutes(routeData)
            setProcessedRoutes(processed)
            
            // Set initial selection
            if (processed.length > 0) {
              setSelectedRoute(processed[0])
              if (processed[0].employees && processed[0].employees.length > 0) {
                setSelectedEmployee(processed[0].employees[0])
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch route data:', error)
          setError('Failed to fetch route data: ' + error.message)
        } finally {
          setLoading(false)
        }
      }
      
      fetchRouteData()
    }
  }, [id, routes, processRoutes])

  return (
    <div className="route-visualization">
      {loading && <LoadingOverlay />}
      {error && <div className="error-message">{error}</div>}

      {/* Map Container - Full screen background */}
      <div className="map-container">
        <MapContainer center={mapCenter} zoom={10} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <ZoneLayer zones={zones} highCapacityZones={highCapacityZones} />
          {selectedRoute && (
            <MapComponent
              key={`map-${selectedRoute.zone || 'unknown'}-${selectedRoute.routeNumber || 'unknown'}`}
              route={selectedRoute}
              facility={facilityCoordinates}
              onEmployeeSelect={handleEmployeeSelect}
              fromSaved={!!id}
              tripType={selectedRoute.tripType || (routes ? routes.tripType : 'pickup')}
            />
          )}
        </MapContainer>
      </div>

      {/* Sidebar - Floating on top of map */}
      <Sidebar
        routes={processedRoutes}
        selectedRoute={selectedRoute}
        onRouteSelect={handleRouteSelect}
        selectedProfile={profile}
        employeeData={employeeData}
        zones={zones}
        showGenerationControls={false}
      />

      {/* Route Details - Floating on top of map */}
      {selectedRoute && selectedEmployee && (
        <div className="route-details">
          <div className="route-section">
            <h3>Route Details - {selectedRoute.zone || 'Unknown Zone'}</h3>
            {selectedRoute.employees && selectedRoute.employees.map((employee, index) => (
              <RouteTracker
                key={`employee-${employee.id || index}-${index}`}
                employee={employee}
                isSelected={selectedEmployee?.id === employee.id}
                onClick={() => handleEmployeeSelect(employee)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default React.memo(RouteVisualization)
