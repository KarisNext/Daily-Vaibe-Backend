const express = require('express');
const router = express.Router();
const { getPool } = require('../../../config/db');

router.get('/', async (req, res) => {
  try {
    const action = req.query.action || 'stats';
    const pool = getPool();
    
    if (action === 'stats') {
      const statsQuery = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM public_session_store) as public_sessions,
          (SELECT COUNT(*) FROM admin_session_store) as admin_sessions,
          (SELECT COUNT(*) FROM user_sessions WHERE is_active = true) as user_sessions,
          (SELECT COUNT(*) FROM session_geo) as session_geo,
          (SELECT COUNT(DISTINCT session_id) FROM session_geo WHERE last_seen > NOW() - INTERVAL '7 days') as active_devices
      `);
      
      const row = statsQuery.rows[0];
      
      return res.json({
        success: true,
        stats: {
          publicSessions: parseInt(row.public_sessions) || 0,
          adminSessions: parseInt(row.admin_sessions) || 0,
          userSessions: parseInt(row.user_sessions) || 0,
          sessionGeo: parseInt(row.session_geo) || 0,
          activeDevices: parseInt(row.active_devices) || 0
        }
      });
    }
    
    if (action === 'status') {
      return res.json({
        success: true,
        status: {
          isRunning: true,
          lastRun: new Date().toISOString(),
          nextRun: null,
          interval: 'manual'
        }
      });
    }
    
    if (action === 'history') {
      const limit = parseInt(req.query.limit) || 20;
      const historyQuery = await pool.query(
        'SELECT * FROM cleanup_history ORDER BY cleaned_at DESC LIMIT $1',
        [limit]
      );
      
      return res.json({
        success: true,
        history: historyQuery.rows
      });
    }
    
    return res.status(400).json({
      success: false,
      message: `Invalid action: ${action}`
    });
    
  } catch (error) {
    console.error('Cleanup GET error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process cleanup request',
      message: error.message
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const action = req.query.action || 'run-now';
    const pool = getPool();
    
    if (action === 'run-now') {
      const startTime = Date.now();

      const deletePublic = await pool.query(`
        DELETE FROM public_session_store 
        WHERE expire < NOW()
      `);
      
      const deleteUserSessions = await pool.query(`
        DELETE FROM user_sessions 
        WHERE expires_at < NOW()
      `);

      const duration = Date.now() - startTime;

      await pool.query(`
        INSERT INTO cleanup_history 
        (type, public_sessions, admin_sessions, user_sessions, total_sessions, duration, status, triggered_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        'manual',
        deletePublic.rowCount,
        0,
        deleteUserSessions.rowCount,
        deletePublic.rowCount + deleteUserSessions.rowCount,
        duration,
        'completed',
        'manual'
      ]);

      return res.json({
        success: true,
        message: 'Manual cleanup completed',
        results: {
          publicSessions: deletePublic.rowCount,
          userSessions: deleteUserSessions.rowCount,
          adminSessions: 0,
          duration
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      message: `Invalid action: ${action}`
    });
    
  } catch (error) {
    console.error('Cleanup POST error:', error);
    return res.status(500).json({
      success: false,
      error: 'Cleanup action failed',
      message: error.message
    });
  }
});

module.exports = router;