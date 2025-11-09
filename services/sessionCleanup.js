// backend/services/sessionCleanup.js

const { getPool } = require('../config/db');

async function cleanupExpiredSessions() {
  const pool = getPool();
  const startTime = Date.now();
  
  try {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const publicResult = await client.query(`
        DELETE FROM public_session_store 
        WHERE expire < NOW()
        RETURNING sid;
      `);

      const adminResult = await client.query(`
        DELETE FROM admin_session_store 
        WHERE expire < NOW()
        RETURNING sid;
      `);

      const geoResult = await client.query(`
        DELETE FROM session_geo 
        WHERE last_seen < NOW() - INTERVAL '48 hours'
        RETURNING session_id;
      `);

      await client.query('COMMIT');

      const duration = Date.now() - startTime;

      await client.query(`
        INSERT INTO cleanup_history (type, results, duration, status)
        VALUES ('automatic', $1, $2, 'success')
      `, [
        JSON.stringify({
          publicSessions: publicResult.rowCount,
          adminSessions: adminResult.rowCount,
          sessionGeo: geoResult.rowCount,
          errors: []
        }),
        duration
      ]);

      return {
        success: true,
        publicSessions: publicResult.rowCount,
        adminSessions: adminResult.rowCount,
        sessionGeo: geoResult.rowCount
      };

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    
    try {
      const client = await pool.connect();
      await client.query(`
        INSERT INTO cleanup_history (type, results, duration, status, error)
        VALUES ('automatic', $1, $2, 'failed', $3)
      `, [
        JSON.stringify({ errors: [error.message] }),
        duration,
        error.message
      ]);
      client.release();
    } catch (logError) {
      console.error('Failed to log cleanup error:', logError);
    }

    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { cleanupExpiredSessions };