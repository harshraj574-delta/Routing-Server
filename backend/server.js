const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Simple CORS setup
app.use(cors());

// Middleware
app.use(express.json({ limit: '50mb' }));

// Import routes
const employeeRoutes = require('./routes/employeeRoutes');
const profileRoutes = require('./routes/profileRoutes');
const routeRoutes = require('./routes/routeRoutes');

// Define routes with explicit paths
app.use('/api/employees', employeeRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/routes', routeRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Handle 404
app.use((req, res) => {
  console.log('404 for URL:', req.url);
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/api/health`);
});

module.exports = { app };