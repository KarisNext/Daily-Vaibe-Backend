// backend/services/cleanupScheduler.js

const { getPool } = require('../config/db');

class CleanupScheduler {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.isProcessing = false;
    this.intervalHours = 6;
    this.failureCount = 0;
    this.maxFailures = 5;
    this.lastRun = null;
  }

  async start(intervalHours = 6) {
    try {
      if (this.isRunning) {
        this.stop();
      }

      this.intervalHours = intervalHours;
      const intervalMs = this.intervalHours * 60 * 60 * 1000;

      console.log(`✅ Starting cleanup scheduler with ${this.intervalHours}-hour interval`);
      
      await this.runCleanup('automatic');
      
      this.intervalId = setInterval(async () => {
        await this.runCleanup('automatic');
      }, intervalMs);

      this.isRunning = true;
      this.failureCount = 0;

      await this.logSchedulerEvent('started', {
        interval_hours: this.intervalHours,
        started_at: new Date().toISOString()
      });

      return {
        success: true,
        message: `Cleanup scheduler started with ${this.intervalHours}-hour interval`,
        interval: this.intervalHours,
        nextRun: new Date(Date.now() + intervalMs).toISOString()
      };

    } catch (error) {
      console.error('❌ Failed to start cleanup scheduler:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    console.log('⏹️ Cleanup scheduler stopped');

    return {
      success: true,
      message: 'Cleanup scheduler stopped successfully'
    };
  }

  async runCleanup(type = 'manual') {
    if (this.isProcessing) {
      console.log('⚠️ Cleanup already in progress, skipping...');
      return {
        success: false,
        error: 'Cleanup already in progress'
      };
    }

    this.isProcessing = true;
    const startTime = Date.now();
    console.log(`🧹 Starting ${type} cleanup at ${new Date().toISOString()}`);

    try {
      const pool = getPool();
      
      const beforeStats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM public_session_store) as public_total,
          (SELECT COUNT(*) FROM public_session_store WHERE expire < NOW()) as public_expired,
          (SELECT COUNT(*) FROM admin_session_store) as admin_total,
          (SELECT COUNT(*) FROM admin_session_store WHERE expire < NOW()) as admin_expired,
          (SELECT COUNT(*) FROM user_sessions) as user_total,
          (SELECT COUNT(*) FROM user_sessions WHERE expires_at < NOW()) as user_expired
      `);

      console.log('📊 Before cleanup:', {
        publicTotal: beforeStats.rows[0].public_total,
        publicExpired: beforeStats.rows[0].public_expired,
        adminTotal: beforeStats.rows[0].admin_total,
        adminExpired: beforeStats.rows[0].admin_expired,
        userTotal: beforeStats.rows[0].user_total,
        userExpired: beforeStats.rows[0].user_expired
      });

      const [publicResult, adminResult, userResult] = await Promise.all([
        pool.query('DELETE FROM public_session_store WHERE expire < NOW() RETURNING sid'),
        pool.query('DELETE FROM admin_session_store WHERE expire < NOW() RETURNING sid'),
        pool.query('DELETE FROM user_sessions WHERE expires_at < NOW() RETURNING session_id')
      ]);

      const publicRemoved = publicResult.rowCount || 0;
      const adminRemoved = adminResult.rowCount || 0;
      const userRemoved = userResult.rowCount || 0;
      const totalRemoved = publicRemoved + adminRemoved + userRemoved;

      const duration = Date.now() - startTime;
      this.lastRun = new Date().toISOString();
      
      console.log(`✅ Cleanup completed: ${totalRemoved} sessions removed in ${duration}ms`);
      console.log(`   - Public: ${publicRemoved}, Admin: ${adminRemoved}, User: ${userRemoved}`);
      
      await this.logCleanupHistory({
        type: type,
        publicSessions: publicRemoved,
        adminSessions: adminRemoved,
        userSessions: userRemoved,
        totalSessions: totalRemoved,
        duration: duration,
        status: 'success',
        triggeredBy: type === 'manual' ? 'admin' : 'system'
      });
      
      this.failureCount = 0;
      
      return {
        success: true,
        results: {
          publicSessions: publicRemoved,
          adminSessions: adminRemoved,
          userSessions: userRemoved,
          preservedDeviceInfo: 0,
          preservedGeographicData: 0,
          totalRemoved: totalRemoved,
          errors: [],
          duration: duration
        }
      };
      
    } catch (error) {
      this.failureCount++;
      const duration = Date.now() - startTime;
      
      console.error(`❌ Cleanup failed (attempt ${this.failureCount}/${this.maxFailures}):`, error.message);
      
      await this.logCleanupHistory({
        type: type,
        publicSessions: 0,
        adminSessions: 0,
        userSessions: 0,
        totalSessions: 0,
        duration: duration,
        status: 'failed',
        error: error.message,
        triggeredBy: type === 'manual' ? 'admin' : 'system'
      });

      if (this.failureCount >= this.maxFailures && type === 'automatic') {
        console.error(`❌ Maximum failures reached (${this.maxFailures}), stopping scheduler`);
        this.stop();
      }

      return {
        success: false,
        error: error.message,
        results: {
          publicSessions: 0,
          adminSessions: 0,
          userSessions: 0,
          preservedDeviceInfo: 0,
          preservedGeographicData: 0,
          totalRemoved: 0,
          errors: [error.message],
          duration: duration
        }
      };
    } finally {
      this.isProcessing = false;
    }
  }

  async logCleanupHistory(cleanupData) {
    try {
      const pool = getPool();
      
      await pool.query(
        `INSERT INTO cleanup_history 
         (type, public_sessions, admin_sessions, user_sessions, device_fingerprints, preserved_device_info, preserved_geographic_data, total_sessions, duration, status, error_message, triggered_by) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          cleanupData.type,
          cleanupData.publicSessions || 0,
          cleanupData.adminSessions || 0,
          cleanupData.userSessions || 0,
          0,
          0,
          0,
          cleanupData.totalSessions || 0,
          cleanupData.duration,
          cleanupData.status,
          cleanupData.error || null,
          cleanupData.triggeredBy || 'system'
        ]
      );
    } catch (error) {
      console.error('❌ Failed to log cleanup history:', error);
    }
  }

  async logSchedulerEvent(eventType, eventData) {
    try {
      const pool = getPool();
      
      await pool.query(
        `INSERT INTO scheduler_logs (event_type, event_data) VALUES ($1, $2)`,
        [eventType, JSON.stringify(eventData)]
      );
    } catch (error) {
      console.error('❌ Failed to log scheduler event:', error);
    }
  }

  async getCleanupHistory(limit = 20) {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT 
          cleanup_id as id,
          type,
          public_sessions,
          admin_sessions,
          user_sessions,
          device_fingerprints,
          preserved_device_info,
          preserved_geographic_data,
          total_sessions,
          duration,
          status,
          error_message,
          triggered_by,
          cleaned_at as timestamp
         FROM cleanup_history 
         ORDER BY cleaned_at DESC 
         LIMIT $1`,
        [limit]
      );
      
      return result.rows.map(row => ({
        id: row.id.toString(),
        type: row.type,
        results: {
          publicSessions: row.public_sessions || 0,
          adminSessions: row.admin_sessions || 0,
          userSessions: row.user_sessions || 0,
          preservedDeviceInfo: row.preserved_device_info || 0,
          preservedGeographicData: row.preserved_geographic_data || 0,
          totalRemoved: row.total_sessions || 0
        },
        duration: row.duration,
        status: row.status,
        error: row.error_message,
        triggeredBy: row.triggered_by,
        timestamp: row.timestamp
      }));
    } catch (error) {
      console.error('❌ Failed to get cleanup history:', error);
      return [];
    }
  }

  getStatus() {
    const nextRunTime = this.intervalId && this.isRunning 
      ? new Date(Date.now() + (this.intervalHours * 60 * 60 * 1000)).toISOString()
      : null;

    return {
      isRunning: this.isRunning,
      isProcessing: this.isProcessing,
      lastRun: this.lastRun,
      nextRun: nextRunTime,
      interval: `${this.intervalHours} hours`,
      intervalHours: this.intervalHours,
      failureCount: this.failureCount,
      maxFailures: this.maxFailures
    };
  }

  async updateInterval(newIntervalHours) {
    console.log(`🔄 Updating interval from ${this.intervalHours}h to ${newIntervalHours}h`);
    
    if (this.isRunning) {
      await this.start(newIntervalHours);
    } else {
      this.intervalHours = newIntervalHours;
    }
    
    return {
      success: true,
      interval: this.intervalHours,
      isRunning: this.isRunning
    };
  }
}

const cleanupScheduler = new CleanupScheduler();

module.exports = cleanupScheduler;