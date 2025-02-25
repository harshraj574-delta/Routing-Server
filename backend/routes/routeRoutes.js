const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');

// Create new routes for a profile
router.post('/', routeController.create);

// Get routes by date and shift
router.get('/by-date-shift', routeController.getByDateAndShift);

// Get routes by profile ID
router.get('/profile/:profileId', routeController.getByProfile);

// Get route by ID
router.get('/:id', routeController.getById);

module.exports = router;