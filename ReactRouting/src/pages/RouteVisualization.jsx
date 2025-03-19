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

function RouteVisualization() {
  const { profileId } = useParams()
  const location = useLocation()
  const { routes, profile, facility, shift, tripType, employeeData } = location.state || {}

  // Memoize initial state values
  const [processedRoutes, setProcessedRoutes] = useState([])
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [zones, setZones] = useState([])
  const [highCapacityZones, setHighCapacityZones] = useState(new Set())
  const [selectedEmployee, setSelectedEmployee] = useState(null)

  // Memoize facility coordinates
  const facilityCoordinates = useMemo(
    () => (facility ? [facility.geoY, facility.geoX] : [28.40291, 76.998015]),
    [facility],
  )

  // Memoize route processing function
  const processRoutes = useCallback(
    async (routesData) => {
      if (!routesData?.routeData) return []

      // Create set of high capacity zones
      const highCapacityZoneSet = new Set(
        routesData.routeData.reduce((acc, route) => {
          if (route.vehicleCapacity > 4) {
            acc.push(route.zone)
          }
          return acc
        }, []),
      )
      setHighCapacityZones(highCapacityZoneSet)

      // Process all routes
      const processed = await Promise.all(
        routesData.routeData.map(async (route) => {
          const coordinates = [
            ...route.employees.map((emp) => [emp.location.lat, emp.location.lng]),
            facilityCoordinates,
          ]

          try {
            const details = await calculateRouteDetails(coordinates, route.employees)
            return {
              ...route,
              employees: details.employees,
              totalDistance: details.totalDistance,
              totalDuration: details.totalDuration,
            }
          } catch (error) {
            console.error("Error calculating route details:", error)
            return route
          }
        }),
      )

      return processed
    },
    [facilityCoordinates],
  )

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
    setSelectedEmployee(route.employees[0])
  }, [])

  const handleEmployeeSelect = useCallback((employee) => {
    setSelectedEmployee(employee)
  }, [])

  // Memoize the map center
  const mapCenter = useMemo(() => [28.6139, 77.209], [])

  return (
    <div className="route-visualization">
      {loading && <LoadingOverlay />}

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
              key={`map-${selectedRoute.zone}-${selectedRoute.routeNumber}`}
              route={selectedRoute}
              facility={facilityCoordinates}
              onEmployeeSelect={handleEmployeeSelect}
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
            <h3>Route Details - {selectedRoute.zone}</h3>
            {selectedRoute.employees.map((employee, index) => (
              <RouteTracker
                key={`employee-${employee.id}-${index}`}
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

