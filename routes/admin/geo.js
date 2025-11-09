// backend/routes/admin/geo.js
const express = require('express');
const router = express.Router();
const GeoService = require('../../services/geoService');

const requireAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

router.use(requireAdmin);

router.get('/stats', async (req, res) => {
  try {
    const stats = await GeoService.getGeoStats();
    res.json(stats);
  } catch (error) {
    console.error('Geo stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/devices', async (req, res) => {
  try {
    const { category, county, limit, offset } = req.query;
    const filters = {
      category,
      county,
      limit: limit ? parseInt(limit) : 100,
      offset: offset ? parseInt(offset) : 0
    };
    
    const result = await GeoService.getAllDevices(filters);
    res.json(result);
  } catch (error) {
    console.error('Get devices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/devices/active', async (req, res) => {
  try {
    const result = await GeoService.getActiveDevices();
    res.json(result);
  } catch (error) {
    console.error('Get active devices error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/county/:county', async (req, res) => {
  try {
    const { county } = req.params;
    const details = await GeoService.getCountyDetails(county);
    res.json(details);
  } catch (error) {
    console.error('Get county details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/trends', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const result = await GeoService.getGeoTrends(days);
    res.json(result);
  } catch (error) {
    console.error('Get geo trends error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    const result = await GeoService.cleanupOldSessions(daysOld);
    res.json(result);
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/device/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const updates = req.body;
    const result = await GeoService.updateDeviceInfo(sessionId, updates);
    res.json(result);
  } catch (error) {
    console.error('Update device error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;