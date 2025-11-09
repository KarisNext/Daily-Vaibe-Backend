// backend/services/geoService.js
const { getPool } = require('../config/db');

class GeoService {
  static async getGeoStats() {
    try {
      const pool = getPool();
      
      const categoryResult = await pool.query(`
        SELECT 
          category,
          COUNT(DISTINCT session_id) as total_sessions,
          COUNT(DISTINCT county) FILTER (WHERE county IS NOT NULL AND county != 'Unknown') as total_counties,
          COUNT(DISTINCT town) FILTER (WHERE town IS NOT NULL AND town != 'Unknown') as total_towns,
          SUM(visit_count) as total_visits,
          COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '15 minutes') as active_now
        FROM session_geo 
        GROUP BY category
        ORDER BY total_visits DESC
      `);

      const regionResult = await pool.query(`
        SELECT 
          category,
          county,
          COUNT(DISTINCT session_id) as unique_sessions,
          COUNT(DISTINCT town) as unique_towns,
          SUM(visit_count) as total_visits,
          MAX(last_seen) as last_activity
        FROM session_geo 
        WHERE county IS NOT NULL AND county != 'Unknown'
        GROUP BY category, county
        ORDER BY total_visits DESC
        LIMIT 50
      `);

      const totalActive = await pool.query(`
        SELECT COUNT(DISTINCT session_id) as total
        FROM session_geo
        WHERE last_seen > NOW() - INTERVAL '15 minutes'
      `);

      return {
        success: true,
        byCategory: categoryResult.rows.map(row => ({
          category: row.category,
          totalSessions: parseInt(row.total_sessions) || 0,
          totalCounties: parseInt(row.total_counties) || 0,
          totalTowns: parseInt(row.total_towns) || 0,
          totalVisits: parseInt(row.total_visits) || 0,
          activeNow: parseInt(row.active_now) || 0
        })),
        byRegion: regionResult.rows.map(row => ({
          category: row.category,
          county: row.county,
          uniqueSessions: parseInt(row.unique_sessions) || 0,
          uniqueTowns: parseInt(row.unique_towns) || 0,
          totalVisits: parseInt(row.total_visits) || 0,
          lastActivity: row.last_activity
        })),
        totalActive: parseInt(totalActive.rows[0]?.total) || 0
      };
    } catch (error) {
      console.error('Error fetching geo stats:', error);
      return { success: false, error: error.message };
    }
  }

  static async getAllDevices(filters = {}) {
    try {
      const pool = getPool();
      const { category, county, limit = 100, offset = 0 } = filters;
      
      let query = `
        SELECT 
          session_id,
          category,
          county,
          town,
          visit_count,
          first_seen,
          last_seen,
          CASE 
            WHEN last_seen > NOW() - INTERVAL '15 minutes' THEN 'online'
            WHEN last_seen > NOW() - INTERVAL '1 hour' THEN 'recent'
            WHEN last_seen > NOW() - INTERVAL '1 day' THEN 'today'
            ELSE 'inactive'
          END as status
        FROM session_geo 
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 0;

      if (category && category !== 'all') {
        paramCount++;
        query += ` AND category = $${paramCount}`;
        params.push(category);
      }

      if (county && county !== 'all') {
        paramCount++;
        query += ` AND county = $${paramCount}`;
        params.push(county);
      }

      query += ` ORDER BY last_seen DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      const countQuery = `SELECT COUNT(*) as total FROM session_geo WHERE 1=1` + 
        (category && category !== 'all' ? ` AND category = $1` : '') +
        (county && county !== 'all' ? ` AND county = $${category && category !== 'all' ? '2' : '1'}` : '');
      
      const countParams = [];
      if (category && category !== 'all') countParams.push(category);
      if (county && county !== 'all') countParams.push(county);
      
      const countResult = await pool.query(countQuery, countParams);

      return {
        success: true,
        devices: result.rows.map(row => ({
          sessionId: row.session_id,
          category: row.category,
          county: row.county,
          town: row.town,
          visitCount: parseInt(row.visit_count) || 0,
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          status: row.status
        })),
        total: parseInt(countResult.rows[0]?.total) || 0
      };
    } catch (error) {
      console.error('Error fetching devices:', error);
      return { success: false, error: error.message, devices: [], total: 0 };
    }
  }

  static async getActiveDevices() {
    try {
      const pool = getPool();
      
      const result = await pool.query(`
        SELECT COUNT(DISTINCT session_id) as total 
        FROM session_geo 
        WHERE last_seen > NOW() - INTERVAL '15 minutes'
      `);

      return {
        success: true,
        total: parseInt(result.rows[0]?.total) || 0
      };
    } catch (error) {
      console.error('Error fetching active devices:', error);
      return { success: false, error: error.message, total: 0 };
    }
  }

  static async getCountyDetails(county) {
    try {
      const pool = getPool();
      
      const result = await pool.query(`
        SELECT 
          county,
          COUNT(DISTINCT session_id) as total_devices,
          COUNT(DISTINCT town) FILTER (WHERE town IS NOT NULL AND town != 'Unknown') as total_towns,
          SUM(visit_count) as total_visits,
          MIN(first_seen) as first_activity,
          MAX(last_seen) as last_activity,
          COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '15 minutes') as active_now
        FROM session_geo 
        WHERE county = $1
        GROUP BY county
      `, [county]);

      if (result.rows.length === 0) {
        return { success: false, error: 'County not found' };
      }

      return {
        success: true,
        details: {
          county: result.rows[0].county,
          totalDevices: parseInt(result.rows[0].total_devices) || 0,
          totalTowns: parseInt(result.rows[0].total_towns) || 0,
          totalVisits: parseInt(result.rows[0].total_visits) || 0,
          firstActivity: result.rows[0].first_activity,
          lastActivity: result.rows[0].last_activity,
          activeNow: parseInt(result.rows[0].active_now) || 0
        }
      };
    } catch (error) {
      console.error('Error fetching county details:', error);
      return { success: false, error: error.message };
    }
  }

  static async getGeoTrends(days = 7) {
    try {
      const pool = getPool();
      
      const result = await pool.query(`
        SELECT 
          DATE(last_seen) as date,
          category,
          COUNT(DISTINCT session_id) as daily_sessions,
          COUNT(DISTINCT county) FILTER (WHERE county IS NOT NULL AND county != 'Unknown') as daily_counties,
          SUM(visit_count) as daily_visits
        FROM session_geo 
        WHERE last_seen > NOW() - INTERVAL '${days} days'
        GROUP BY DATE(last_seen), category
        ORDER BY date DESC, category
      `);

      return {
        success: true,
        trends: result.rows.map(row => ({
          date: row.date,
          category: row.category,
          dailySessions: parseInt(row.daily_sessions) || 0,
          dailyCounties: parseInt(row.daily_counties) || 0,
          dailyVisits: parseInt(row.daily_visits) || 0
        }))
      };
    } catch (error) {
      console.error('Error fetching geo trends:', error);
      return { success: false, error: error.message, trends: [] };
    }
  }

  static async cleanupOldSessions(daysOld = 30) {
    try {
      const pool = getPool();
      
      const result = await pool.query(`
        DELETE FROM session_geo 
        WHERE last_seen < NOW() - INTERVAL '${daysOld} days'
        RETURNING session_id
      `);

      return {
        success: true,
        deletedCount: result.rowCount || 0,
        message: `Cleaned up ${result.rowCount || 0} old sessions`
      };
    } catch (error) {
      console.error('Error cleaning up old sessions:', error);
      return { success: false, error: error.message, deletedCount: 0 };
    }
  }

  static async updateDeviceInfo(sessionId, updates) {
    try {
      const pool = getPool();
      const { county, town, category } = updates;
      
      const result = await pool.query(`
        UPDATE session_geo 
        SET county = COALESCE($1, county), 
            town = COALESCE($2, town), 
            category = COALESCE($3, category), 
            last_seen = NOW()
        WHERE session_id = $4
        RETURNING *
      `, [county, town, category, sessionId]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Session not found' };
      }

      return {
        success: true,
        device: result.rows[0]
      };
    } catch (error) {
      console.error('Error updating device info:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = GeoService;