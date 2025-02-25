const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Import database configuration
const { sequelize } = require('./config/database');

// Import routes
const profileRoutes = require('./routes/profileRoutes');
const routeRoutes = require('./routes/routeRoutes');

// Define routes
app.use('/api/profiles', profileRoutes);
app.use('/api/routes', routeRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, sequelize };