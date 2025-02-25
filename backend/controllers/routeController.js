const { Route, Profile } = require('../models');

const routeController = {
  // Create new routes for a profile
  async create(req, res) {
    try {
      const { profileId, date, shift, routeData } = req.body;

      // Validate required fields
      if (!profileId || !date || !shift || !routeData) {
        return res.status(400).json({ error: 'Missing required fields: profileId, date, shift, routeData' });
      }

      // Validate route data structure
      if (!Array.isArray(routeData)) {
        return res.status(400).json({ error: 'routeData must be an array' });
      }

      // Validate each route has required structure
      for (const route of routeData) {
        if (!route.zone || !Array.isArray(route.employees)) {
          return res.status(400).json({ error: 'Each route must have zone and employees array' });
        }
        for (const emp of route.employees) {
          if (!emp.id || !emp.name || !emp.zone || !emp.address) {
            return res.status(400).json({ error: 'Each employee must have id, name, zone, and address' });
          }
        }
      }
      
      // Validate profile exists
      const profile = await Profile.findByPk(profileId);
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      // Calculate route statistics
      const totalEmployees = routeData.reduce((sum, route) => sum + route.employees.length, 0);
      const totalRoutes = routeData.length;
      const averageOccupancy = totalEmployees / totalRoutes;

      if (totalRoutes === 0) {
        return res.status(400).json({ error: 'No valid routes provided' });
      }

      const route = await Route.create({
        profileId,
        date,
        shift,
        routeData,
        totalEmployees,
        totalRoutes,
        averageOccupancy
      });

      res.status(201).json(route);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Get routes by date and shift
  async getByDateAndShift(req, res) {
    try {
      const { date, shift } = req.query;
      const routes = await Route.findAll({
        where: { date, shift },
        include: [{ model: Profile }]
      });
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get route by ID
  async getById(req, res) {
    try {
      const route = await Route.findByPk(req.params.id, {
        include: [{ model: Profile }]
      });
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }
      res.json(route);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Get routes by profile ID
  async getByProfile(req, res) {
    try {
      const routes = await Route.findAll({
        where: { profileId: req.params.profileId },
        include: [{ model: Profile }]
      });
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = routeController;