const { v4: uuidv4 } = require('uuid');
const { Route, RouteLeg } = require('../models');
const routeGenerationService = require('../services/routeGenerationService');

// Helper function to process a route with its legs for response
const processRouteWithLegs = (route) => {
  if (!route) return null;
  const routeObj = route.toJSON ? route.toJSON() : { ...route };

  // The associated legs are now in routeObj.legs
  // We rename/map 'legs' to 'routeData' for frontend compatibility
  // Ensure legs are sorted by legIndex for correct order
  routeObj.routeData = (routeObj.legs || [])
    .sort((a, b) => a.legIndex - b.legIndex)
    .map(leg => ({
      // Map leg data back to the structure expected by the frontend
      encodedPolyline: leg.encodedPolyline,
      distance: leg.distance,
      duration: leg.duration,
      employees: leg.employees, // Already JSON
    }));
  delete routeObj.legs; // Remove the original legs array

  // Parse other top-level JSON fields on the Route object itself
  const fieldsToParse = ['profile', 'facility', 'employeeData', 'roadPathDetails', 'geometry', 'roadGeometry', 'routeDetails'];
  fieldsToParse.forEach(field => {
    if (routeObj[field] && typeof routeObj[field] === 'string') {
      try {
        routeObj[field] = JSON.parse(routeObj[field]);
      } catch (e) {
        console.warn(`Failed to parse ${field} JSON for route UUID ${routeObj.uuid}:`, e);
      }
    }
  });

  console.log(`Processed route ${routeObj.uuid} with ${routeObj.routeData?.length || 0} legs for response.`);
  return routeObj;
};

const routeGenerationController = {
  // Generate routes based on data provided in the request body
  generateRoutes: async (req, res) => {
    let transaction;
    try {
      // Extract all necessary data from request body
      const { 
        employees,       // Array of employee data
        facility,        // Facility data
        shiftTime,       // Shift time information
        date,            // Date for route generation
        profile,         // Profile with routing preferences
        saveToDatabase = false, // Flag to determine if routes should be saved to database
        pickupTimePerEmployee,
        reportingTime,
        tripType,
        guard = false // <-- add this line
      } = req.body;

      // Validate tripType: only allow "P" or "D"
      if (
        typeof tripType !== 'string' ||
        !['P', 'D'].includes(tripType.toUpperCase())
      ) {
        return res.status(200).json({
          errorCode: "400",
          error: 'tripType is invalid. Only "P" (pickup) or "D" (dropoff) are allowed.'
        });
      }

      // Validate required data
      if (!employees || !Array.isArray(employees) || employees.length === 0) {
        return res.status(200).json({errorCode: "400" ,error: 'Employee data is required and must be an array' });
      }

      // 2. Validate geoX and geoY for all employees and that they are within India
      const invalidGeoEmployees = employees.filter(
        emp =>
          typeof emp.geoX !== 'number' ||
          typeof emp.geoY !== 'number' ||
          isNaN(emp.geoX) ||
          isNaN(emp.geoY) ||
          emp.geoY < 6 || emp.geoY > 38 ||   // Latitude for India
          emp.geoX < 68 || emp.geoX > 98     // Longitude for India
      );

      if (invalidGeoEmployees.length > 0) {
        return res.status(200).json({
          errorCode: "400",
          error: `All employees must have valid geoX and geoY coordinates within India. Invalid for empCodes: ${invalidGeoEmployees.map(e => e.empCode).join(', ')}`
        });
      }
      
      if (!facility) {
        return res.status(200).json({errorCode: "400", error: 'Facility data is required' });
      }

      // Validate facility geocodes
      if (
        typeof facility.geoX !== 'number' ||
        typeof facility.geoY !== 'number' ||
        isNaN(facility.geoX) ||
        isNaN(facility.geoY) ||
        facility.geoY < 6 || facility.geoY > 38 ||   // Latitude for India
        facility.geoX < 68 || facility.geoX > 98     // Longitude for India
      ) {
        return res.status(200).json({
          errorCode: "400",
          error: 'Facility must have valid geoX and geoY coordinates within India.'
        });
      }

      if (!date) {
        return res.status(200).json({erroCode: "400" ,error: 'Date is required' });
      }

      if (!shiftTime) {
        return res.status(200).json({errorCode: "400" ,error: 'Shift time is required' });// 0-2359
      }

      // Validate pickupTimePerEmployee
      if (
        pickupTimePerEmployee == null ||
        typeof pickupTimePerEmployee !== 'number' ||
        isNaN(pickupTimePerEmployee) ||
        pickupTimePerEmployee <= 0
      ) {
        return res.status(200).json({
          errorCode: "400",
          error: 'pickupTimePerEmployee is required and must be a positive number (in seconds).'
        });
      }

      // Validate reportingTime
      if (
        reportingTime == null ||
        typeof reportingTime !== 'number' ||
        isNaN(reportingTime) ||
        reportingTime < 0
      ) {
        return res.status(200).json({
          errorCode: "400",
          error: 'reportingTime is required and must be a positive number (in seconds).'
        });
      }

      // Normalize tripType
      let normalizedTripType = tripType || 'PICKUP';
      if (typeof normalizedTripType === 'string') {
        if (normalizedTripType.toUpperCase() === 'P') normalizedTripType = 'PICKUP';
        else if (normalizedTripType.toUpperCase() === 'D') normalizedTripType = 'DROPOFF';
        else normalizedTripType = normalizedTripType.toUpperCase();
      }

      // --- Shift time validation: only accept HHMM format ---
let hours, minutes;
const timeStr = shiftTime.toString().padStart(4, '0');

// Must be exactly 4 digits and all numeric
    if (!/^\d{4}$/.test(timeStr)) {
      return res.status(200).json({
        errorCode: "400",
        error: 'Shift time is invalid. It must be in HHMM (0000-2359) format.'
      });
    }

    hours = parseInt(timeStr.substring(0, 2), 10);
    minutes = parseInt(timeStr.substring(2, 4), 10);

    if (
      isNaN(hours) || isNaN(minutes) ||
      hours < 0 || hours > 23 ||
      minutes < 0 || minutes > 59
    ) {
      return res.status(200).json({
        errorCode: "400",
        error: 'Shift time is invalid. It must be in HHMM (0000-2359) format.'
      });
    }

      if (!profile) {
        return res.status(200).json({errorCode: "400" ,error: 'Profile data is required' });
      }

      console.log(`Generating routes for ${employees.length} employees, date: ${date}, shift: ${shiftTime}`);

      // Generate a UUID for this route batch
      const uuid = uuidv4();
      
      // Get zone data from request body if provided
      // If not provided, the service will load it from the data file
      const zones = req.body.zones;
      
      // Zones are now optional in the request as they can be loaded from the backend data file
      // We'll log whether zones were provided or will be loaded from file
      if (zones && Array.isArray(zones) && zones.length > 0) {
        console.log(`Using ${zones.length} zones provided in request`);
      } else {
        console.log('No zones provided in request, will use zones from backend data file');
      }
      
      // Prepare data for route generation service
      const routeGenerationData = {
        uuid,
        employees,
        facility,
        shiftTime,
        date,
        profile,
        zones,
        tripType: normalizedTripType,
        pickupTimePerEmployee,
        reportingTime,
        guard // <-- add this line
      };
      
      // Call the route generation service to generate routes
      const routeResponse = await routeGenerationService.generateRoutes(routeGenerationData);
      
      // The service returns a complete route response with all necessary data
      // including route legs, distances, durations, etc.

      // If saveToDatabase flag is true, save the generated routes to the database
      if (saveToDatabase) {
        transaction = await Route.sequelize.transaction();

        // Create the main route batch record
        const newRoute = await Route.create({
          uuid: routeResponse.uuid,
          date: routeResponse.date,
          shift: routeResponse.shift,
          tripType: routeResponse.tripType,
          facilityId: facility.id,
          facility: routeResponse.facility,
          profile: routeResponse.profile,
          employeeData: routeResponse.employeeData,
          totalEmployees: routeResponse.totalEmployees,
          totalRoutes: routeResponse.totalRoutes,
          averageOccupancy: routeResponse.averageOccupancy,
          routeDetails: routeResponse.routeDetails
        }, { transaction });

        // Create individual RouteLeg records for each leg
        for (let i = 0; i < routeResponse.routeData.length; i++) {
          const route = routeResponse.routeData[i];
          await RouteLeg.create({
            routeUuid: routeResponse.uuid,
            legIndex: i,
            encodedPolyline: route.encodedPolyline,
            distance: route.routeDetails?.distance || 0,
            duration: route.routeDetails?.duration || 0,
            employees: route.employees
          }, { transaction });
        }

        await transaction.commit();
        console.log('Transaction committed for route:', routeResponse.uuid);

        // Fetch the complete route with legs to return
        const finalRouteWithLegs = await Route.findOne({
          where: { uuid: routeResponse.uuid },
          include: [{ model: RouteLeg, as: 'legs' }]
        });
        
        const processedFinalRoute = processRouteWithLegs(finalRouteWithLegs);
        return res.status(201).json(processedFinalRoute);
      }

      // If not saving to database, just return the generated route data
      return res.status(200).json(routeResponse);

    } catch (error) {
      if (transaction && !transaction.finished) {
        try { 
          await transaction.rollback(); 
          console.log('Transaction rolled back due to error.'); 
        } catch (rollbackError) { 
          console.error('Error rolling back transaction:', rollbackError); 
        }
      }
      console.error('Error generating routes:', error);
      res.status(500).json({ error: 'Failed to generate routes', details: error.message });
    }
  }
};

module.exports = routeGenerationController;