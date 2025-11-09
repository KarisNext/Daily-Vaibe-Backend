// backend/routes/client/geo.js

const express = require('express');
const router = express.Router();
const GeoService = require('../../services/geoService');

router.get('/current', async (req, res) => {
  try {
    const location = req.geo || { county: null, town: null, category: 'UNKNOWN' };
    
    res.json({
      success: true,
      location: {
        county: location.county,
        town: location.town,
        category: location.category
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get current location',
      location: { county: null, town: null, category: 'UNKNOWN' }
    });
  }
});

router.post('/update', async (req, res) => {
  try {
    const sessionId = req.session?.id || req.sessionID;
    const { county, town, category } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'No session found'
      });
    }

    const result = await GeoService.updateDeviceInfo(sessionId, {
      county,
      town,
      category
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json({
      success: true,
      location: {
        county: result.device.county,
        town: result.device.town,
        category: result.device.category
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update location'
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await GeoService.getGeoStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get geo stats'
    });
  }
});

router.get('/county/:county', async (req, res) => {
  try {
    const { county } = req.params;
    const details = await GeoService.getCountyDetails(county);
    res.json(details);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get county details'
    });
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
    res.status(500).json({
      success: false,
      error: 'Failed to get devices'
    });
  }
});

router.get('/devices/active', async (req, res) => {
  try {
    const result = await GeoService.getActiveDevices();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get active devices'
    });
  }
});

router.get('/trends', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : 7;
    const result = await GeoService.getGeoTrends(days);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get geo trends'
    });
  }
});

module.exports = router;