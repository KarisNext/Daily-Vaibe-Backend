// backend/routes/admin/systemMonitoring.js
const express = require('express');
const router = express.Router();
const os = require('os');

router.get('/stats', async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    const systemStats = {
      cpu: {
        usage: Math.min(100, Math.max(0, Math.random() * 100)),
        cores: os.cpus().length,
        load: os.loadavg()
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usage: parseFloat(((usedMem / totalMem) * 100).toFixed(2))
      },
      disk: {
        total: 0,
        free: 0,
        used: 0,
        usage: 0
      },
      network: {
        interfaces: Object.keys(os.networkInterfaces()).length
      },
      uptime: os.uptime(),
      platform: os.platform(),
      node: process.version,
      hostname: os.hostname(),
      type: os.type(),
      release: os.release()
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