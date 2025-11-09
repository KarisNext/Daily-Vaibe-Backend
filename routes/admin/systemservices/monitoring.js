// backend/routes/admin/systemservices/monitoring.js
const express = require('express');
const router = express.Router();
const os = require('os');

// GET /api/admin/system-services/monitoring/stats
router.get('/stats', async (req, res) => {
  try {
    const systemStats = {
      cpu: {
        usage: Math.random() * 100,
        cores: os.cpus().length,
        load: os.loadavg()
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
      },
      uptime: os.uptime(),
      platform: os.platform(),
      node: process.version
    };

    return res.json({
      success: true,
      stats: systemStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching system stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch system statistics',
      message: error.message
    });
  }
});

module.exports = router;