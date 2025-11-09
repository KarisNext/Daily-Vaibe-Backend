// backend/services/cookieCleanup.js

const { getPool } = require('../config/db');

class CookieCleanupService {
  static async cleanupExpiredSessions() {
    const pool = getPool();
    const startTime = Date.now();
    
    try {
      const beforeStats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM public_session_store) as public_sessions,
          (SELECT COUNT(*) FROM public_session_store WHERE expire < NOW()) as expired_public,
          (SELECT COUNT(*) FROM admin_session_store) as admin_sessions,
          (SELECT COUNT(*) FROM admin_session_store WHERE expire < NOW()) as expired_admin,
          (SELECT COUNT(*) FROM user_sessions) as user_sessions,
          (SELECT COUNT(*) FROM user_sessions WHERE expires_at < NOW()) as expired_user
      `);

      const [publicResult, adminResult, userResult] = await Promise.all([
        pool.query('DELETE FROM public_session_store WHERE expire < NOW()'),
        pool.query('DELETE FROM admin_session_store WHERE expire < NOW()'),
        pool.query('DELETE FROM user_sessions WHERE expires_at < NOW()')
      ]);

      const afterStats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM public_session_store) as public_sessions,
          (SELECT COUNT(*) FROM admin_session_store) as admin_sessions,
          (SELECT COUNT(*) FROM user_sessions) as user_sessions
      `);

      const duration = Date.now() - startTime;
      
      const results = {
        publicSessionsRemoved: publicResult.rowCount || 0,
        adminSessionsRemoved: adminResult.rowCount || 0,
        userSessionsRemoved: userResult.rowCount || 0,
        totalRemoved: (publicResult.rowCount || 0) + (adminResult.rowCount || 0) + (userResult.rowCount || 0),
        duration: duration,
        before: {
          public: parseInt(beforeStats.rows[0].public_sessions) || 0,
          admin: parseInt(beforeStats.rows[0].admin_sessions) || 0,
          user: parseInt(beforeStats.rows[0].user_sessions) || 0
        },
        after: {
          public: parseInt(afterStats.rows[0].public_sessions) || 0,
          admin: parseInt(afterStats.rows[0].admin_sessions) || 0,
          user: parseInt(afterStats.rows[0].user_sessions) || 0
        }
      };
      
      return {
        success: true,
        results: results
      };

    } catch (error) {
      console.error('Cleanup error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async getCleanupStats() {
    try {
      const pool = getPool();
      
      const stats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM public_session_store) as public_sessions,
          (SELECT COUNT(*) FROM public_session_store WHERE expire < NOW()) as expired_public_sessions,
          (SELECT COUNT(*) FROM admin_session_store) as admin_sessions,
          (SELECT COUNT(*) FROM admin_session_store WHERE expire < NOW()) as expired_admin_sessions,
          (SELECT COUNT(*) FROM user_sessions) as user_sessions,
          (SELECT COUNT(*) FROM user_sessions WHERE expires_at < NOW()) as expired_user_sessions,
          (SELECT COUNT(*) FROM cleanup_history) as total_cleanups,
          (SELECT COUNT(*) FROM cleanup_history WHERE status = 'success') as successful_cleanups,
          (SELECT COUNT(*) FROM session_geo) as session_geo,
          (SELECT COUNT(*) FROM session_geo WHERE last_seen > NOW() - INTERVAL '15 minutes') as active_devices
      `);

      return {
        success: true,
        stats: {
          publicSessions: parseInt(stats.rows[0].public_sessions) || 0,
          expiredPublicSessions: parseInt(stats.rows[0].expired_public_sessions) || 0,
          adminSessions: parseInt(stats.rows[0].admin_sessions) || 0,
          expiredAdminSessions: parseInt(stats.rows[0].expired_admin_sessions) || 0,
          userSessions: parseInt(stats.rows[0].user_sessions) || 0,
          expiredUserSessions: parseInt(stats.rows[0].expired_user_sessions) || 0,
          totalCleanups: parseInt(stats.rows[0].total_cleanups) || 0,
          successfulCleanups: parseInt(stats.rows[0].successful_cleanups) || 0,
          sessionGeo: parseInt(stats.rows[0].session_geo) || 0,
          activeDevices: parseInt(stats.rows[0].active_devices) || 0
        }
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return {
        success: false,
        error: error.message,
        stats: {
          publicSessions: 0,
          expiredPublicSessions: 0,
          adminSessions: 0,
          expiredAdminSessions: 0,
          userSessions: 0,
          expiredUserSessions: 0,
          totalCleanups: 0,
          successfulCleanups: 0,
          sessionGeo: 0,
          activeDevices: 0
        }
      };
    }
  }
}

module.exports = CookieCleanupService;