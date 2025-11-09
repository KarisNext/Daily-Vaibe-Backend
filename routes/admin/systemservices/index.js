// backend/routes/admin/systemservices/index.js
const express = require('express');
const router = express.Router();

// Import sub-routers
const cleanupRoutes = require('./cleanup');
const cacheRoutes = require('./cache');
const databaseRoutes = require('./database');
const monitoringRoutes = require('./monitoring');

// Mount sub-routes
router.use('/cleanup', cleanupRoutes);
router.use('/cache', cacheRoutes);
router.use('/database', databaseRoutes);
router.use('/monitoring', monitoringRoutes);

// Health check for system services
router.get('/health', async (req, res) => {
  try {
    return res.json({
      success: true,
      message: 'System Services API is operational',
      services: {
        cleanup: 'available',
        cache: 'available',
        database: 'available',
        monitoring: 'available'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('System services health check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

module.exports = router;