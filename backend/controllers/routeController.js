const Route = require('../models/Route');
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

const routeController = {
  getAll: async (req, res) => {
    try {
      console.log('Fetching all routes');
      
      // Safely query the database
      let routes = [];
      try {
        routes = await Route.findAll();
        console.log(`Found ${routes.length} routes`);
      } catch (dbError) {
        console.error('Database error when fetching routes:', dbError);
        return res.status(500).json({ 
          error: 'Database error when fetching routes',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
      
      // Process routes to ensure JSON fields are parsed
      const processedRoutes = routes.map(route => {
        try {
          const routeObj = route.toJSON ? route.toJSON() : route;
          
          // Parse JSON fields if they're strings
          if (typeof routeObj.routeData === 'string') {
            try {
              routeObj.routeData = JSON.parse(routeObj.routeData);
            } catch (e) {
              console.warn('Failed to parse routeData JSON', e);
            }
          }
          
          if (typeof routeObj.profile === 'string') {
            try {
              routeObj.profile = JSON.parse(routeObj.profile);
            } catch (e) {
              console.warn('Failed to parse profile JSON', e);
            }
          }
          
          if (typeof routeObj.facility === 'string') {
            try {
              routeObj.facility = JSON.parse(routeObj.facility);
            } catch (e) {
              console.warn('Failed to parse facility JSON', e);
            }
          }
          
          if (typeof routeObj.employeeData === 'string') {
            try {
              routeObj.employeeData = JSON.parse(routeObj.employeeData);
            } catch (e) {
              console.warn('Failed to parse employeeData JSON', e);
            }
          }
          
          return routeObj;
        } catch (parseError) {
          console.error('Error processing route:', parseError);
          return route;
        }
      });
      
      res.json(processedRoutes);
    } catch (error) {
      console.error('Error in getAll controller:', error);
      res.status(500).json({ 
        error: 'Failed to fetch routes',
        message: error.message
      });
    }
  },

  create: async (req, res) => {
    try {
      console.log('Creating route with data:', {
        date: req.body.date,
        shift: req.body.shift,
        routeCount: req.body.routeData?.length
      });
      
      // Generate a UUID for this route
      const uuid = uuidv4();
      
      // Calculate required fields if not provided
      const routeData = req.body.routeData || [];
      const totalEmployees = routeData.reduce((total, route) => 
        total + (route.employees?.length || 0), 0);
      const totalRoutes = routeData.length;
      const averageOccupancy = totalEmployees > 0 && totalRoutes > 0 
        ? totalEmployees / totalRoutes 
        : 0;
      
      // Create the route with proper data mapping and UUID
      const route = await Route.create({
        ...req.body,
        uuid,
        totalEmployees,
        totalRoutes,
        averageOccupancy
      });
      
      console.log('Route created successfully with UUID:', uuid);
      res.status(201).json({
        ...route.toJSON(),
        uuid
      });
    } catch (error) {
      console.error('Error creating route:', error);
      res.status(500).json({ error: 'Failed to create route', details: error.message });
    }
  },

  getByDateAndShift: async (req, res) => {
    try {
      const { date, shift } = req.query;
      const routes = await Route.findAll({
        where: { date, shift },
        order: [['createdAt', 'DESC']]
      });
      res.json(routes);
    } catch (error) {
      console.error('Error fetching routes:', error);
      res.status(500).json({ error: 'Failed to fetch routes' });
    }
  },

  getByProfile: async (req, res) => {
    try {
      const { profileId } = req.params;
      const routes = await Route.findAll({
        where: { profileId },
        order: [['createdAt', 'DESC']]
      });
      res.json(routes);
    } catch (error) {
      console.error('Error fetching routes:', error);
      res.status(500).json({ error: 'Failed to fetch routes' });
    }
  },

  getById: async (req, res) => {
    try {
      console.log(`Looking for route with ID: ${req.params.id}`);
      
      // First, try to find by numeric ID
      let route = null;
      
      // If the ID looks like a UUID, search by UUID
      if (req.params.id.includes('-')) {
        console.log('Looking up by UUID');
        route = await Route.findOne({ where: { uuid: req.params.id } });
      } else {
        // Otherwise, treat it as a numeric ID
        console.log('Looking up by numeric ID');
        route = await Route.findByPk(req.params.id);
      }
      
      if (!route) {
        console.log('No route found');
        return res.status(404).json({ error: 'Route not found' });
      }
      
      console.log('Route found, processing data');
      // Process the route object to parse JSON fields
      const routeObj = route.toJSON ? route.toJSON() : route;
      
      // Parse JSON fields if they're strings
      if (typeof routeObj.routeData === 'string') {
        try {
          routeObj.routeData = JSON.parse(routeObj.routeData);
        } catch (e) {
          console.warn('Failed to parse routeData JSON', e);
        }
      }
      
      if (typeof routeObj.profile === 'string') {
        try {
          routeObj.profile = JSON.parse(routeObj.profile);
        } catch (e) {
          console.warn('Failed to parse profile JSON', e);
        }
      }
      
      if (typeof routeObj.facility === 'string') {
        try {
          routeObj.facility = JSON.parse(routeObj.facility);
        } catch (e) {
          console.warn('Failed to parse facility JSON', e);
        }
      }
      
      if (typeof routeObj.employeeData === 'string') {
        try {
          routeObj.employeeData = JSON.parse(routeObj.employeeData);
        } catch (e) {
          console.warn('Failed to parse employeeData JSON', e);
        }
      }
      
      res.json(routeObj);
    } catch (error) {
      console.error('Error fetching route:', error);
      res.status(500).json({ error: 'Failed to fetch route', details: error.message });
    }
  }
};

module.exports = routeController;