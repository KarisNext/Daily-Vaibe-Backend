// backend/routes/admin/systemServices.js
const express = require('express');
const router = express.Router();
const cleanupRouter = require('./systemservices/cleanup');
const GeoService = require('../../services/geoService'); // FIXED PATH

// Mount cleanup routes under /cleanup path
router.use('/cleanup', cleanupRouter);

// Geo tracking routes
router.get('/geo/stats', async (req, res) => {
  try {
    const stats = await GeoService.getGeoStats();
    return res.json(stats);
  } catch (error) {
    console.error('Geo stats error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      byCategory: [],
      byRegion: [],
      totalActive: 0
    });
  }
});

router.get('/geo/devices', async (req, res) => {
  try {
    const { category, county, limit, offset } = req.query;
    const filters = {
      category,
      county,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0
    };
    
    const result = await GeoService.getAllDevices(filters);
    return res.json(result);
  } catch (error) {
    console.error('Get devices error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      devices: [],
      total: 0
    });
  }
});

router.get('/geo/active', async (req, res) => {
  try {
    const result = await GeoService.getActiveDevices();
    return res.json(result);
  } catch (error) {
    console.error('Get active devices error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      total: 0
    });
  }
});

// ... rest of your geo routes remain the same
module.exports = router;