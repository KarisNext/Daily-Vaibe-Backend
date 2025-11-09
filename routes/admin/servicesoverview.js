// backend/routes/admin/servicesoverview.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    
    const [
      sessionStats,
      onlineVisitors,
      contentStats,
      userStats,
      geoStats
    ] = await Promise.all([
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM public_session_store WHERE expire > NOW()) as public_sessions,
          (SELECT COUNT(*) FROM admin_session_store WHERE expire > NOW()) as admin_sessions,
          (SELECT COUNT(*) FROM user_sessions WHERE expires_at > NOW()) as user_sessions
      `),
      
      pool.query(`
        SELECT 
          session_id,
          county,
          town,
          category,
          visit_count,
          first_seen,
          last_seen,
          raw_data
        FROM session_geo 
        WHERE last_seen > NOW() - INTERVAL '15 minutes'
        ORDER BY last_seen DESC
        LIMIT 100
      `),
      
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM news WHERE status = 'published') as total_articles,
          (SELECT COUNT(*) FROM news WHERE status = 'draft') as draft_articles,
          (SELECT COUNT(*) FROM categories WHERE active = true) as active_categories
      `),
      
      pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE status = 'active') as total_users,
          (SELECT COUNT(*) FROM admins WHERE status = 'active') as total_admins
      `),
      
      pool.query(`
        SELECT 
          COUNT(DISTINCT session_id) as geo_tracked_devices,
          COUNT(DISTINCT session_id) FILTER (WHERE last_seen > NOW() - INTERVAL '15 minutes') as online_visitors
        FROM session_geo
      `)
    ]);

    const stats = {
      publicSessions: parseInt(sessionStats.rows[0].public_sessions) || 0,
      adminSessions: parseInt(sessionStats.rows[0].admin_sessions) || 0,
      userSessions: parseInt(sessionStats.rows[0].user_sessions) || 0,
      
      registeredDevices: parseInt(geoStats.rows[0].geo_tracked_devices) || 0,
      activeDevices: parseInt(geoStats.rows[0].online_visitors) || 0,
      onlineVisitors: parseInt(geoStats.rows[0].online_visitors) || 0,
      onlineClientUsers: 0,
      
      totalArticles: parseInt(contentStats.rows[0].total_articles) || 0,
      draftArticles: parseInt(contentStats.rows[0].draft_articles) || 0,
      activeCategories: parseInt(contentStats.rows[0].active_categories) || 0,
      
      totalUsers: parseInt(userStats.rows[0].total_users) || 0,
      totalAdmins: parseInt(userStats.rows[0].total_admins) || 0,
    };

    const enhancedVisitors = onlineVisitors.rows.map(visitor => {
      const rawData = typeof visitor.raw_data === 'object' ? visitor.raw_data : {};
      return {
        sessionId: visitor.session_id,
        ipAddress: rawData.ip || 'Unknown',
        userAgent: rawData.userAgent || 'Unknown',
        deviceType: 'Web',
        region: visitor.county,
        country: visitor.category === 'GLOBAL' ? 'International' : 
                 visitor.category === 'AFRICA' ? 'Africa' :
                 visitor.category === 'EAST_AFRICA' ? 'East Africa' : 'Kenya',
        county: visitor.county,
        town: visitor.town,
        lastActive: visitor.last_seen,
        visitCount: parseInt(visitor.visit_count) || 0,
        isClientUser: false
      };
    });

    return res.json({
      success: true,
      stats,
      onlineVisitors: enhancedVisitors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching service stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch service statistics',
      message: error.message,
      stats: {
        publicSessions: 0,
        adminSessions: 0,
        userSessions: 0,
        registeredDevices: 0,
        activeDevices: 0,
        onlineVisitors: 0,
        onlineClientUsers: 0,
        totalArticles: 0,
        totalUsers: 0,
        totalAdmins: 0
      },
      onlineVisitors: []
    });
  }
});

router.post('/cleanup', async (req, res) => {
  try {
    console.log('Manual cleanup triggered by admin');
    return res.json({
      success: true,
      message: 'Cleanup functionality moved to system-services endpoints',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error during manual cleanup:', error);
    return res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

router.post('/cleanup/start', async (req, res) => {
  try {
    return res.json({
      success: true,
      message: 'Use /api/admin/system-services/cleanup/scheduler-start instead',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error starting cleanup scheduler:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to start cleanup scheduler',
      message: error.message
    });
  }
});

router.post('/cleanup/stop', async (req, res) => {
  try {
    return res.json({
      success: true,
      message: 'Use /api/admin/system-services/cleanup/scheduler-stop instead',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error stopping cleanup scheduler:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to stop cleanup scheduler',
      message: error.message
    });
  }
});

module.exports = router;