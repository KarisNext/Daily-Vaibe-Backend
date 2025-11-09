// backend/routes/admin/databaseOptimization.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

// GET /api/admin/database-optimization/stats - Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    
    const [tableStats, indexStats, performanceStats] = await Promise.all([
      // Table statistics
      pool.query(`
        SELECT 
          schemaname,
          relname as table_name,
          n_live_tup as row_count,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
      `),
      
      // Index statistics
      pool.query(`
        SELECT 
          schemaname,
          relname as table_name,
          indexrelname as index_name,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
      `),
      
      // Performance statistics
      pool.query(`
        SELECT 
          datname as database_name,
          numbackends as connections,
          xact_commit as transactions_committed,
          xact_rollback as transactions_rolled_back,
          blks_read as blocks_read,
          blks_hit as blocks_hit,
          tup_returned as tuples_returned,
          tup_fetched as tuples_fetched,
          tup_inserted as tuples_inserted,
          tup_updated as tuples_updated,
          tup_deleted as tuples_deleted
        FROM pg_stat_database 
        WHERE datname = current_database()
      `)
    ]);

    return res.json({
      success: true,
      stats: {
        tables: tableStats.rows,
        indexes: indexStats.rows,
        performance: performanceStats.rows[0],
        totalTables: tableStats.rows.length,
        totalIndexes: indexStats.rows.length,
        cacheHitRatio: performanceStats.rows[0] ? 
          (performanceStats.rows[0].blocks_hit / (performanceStats.rows[0].blocks_read + performanceStats.rows[0].blocks_hit) * 100).toFixed(2) : 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching database stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch database statistics',
      message: error.message
    });
  }
});

// POST /api/admin/database-optimization/vacuum - Run VACUUM operation
router.post('/vacuum', async (req, res) => {
  try {
    const pool = getPool();
    const { table, analyze } = req.body;
    
    let query = 'VACUUM';
    if (analyze) query += ' ANALYZE';
    if (table) query += ` ${table}`;
    
    await pool.query(query);
    
    return res.json({
      success: true,
      message: `VACUUM ${analyze ? 'ANALYZE ' : ''}operation completed successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running VACUUM:', error);
    return res.status(500).json({
      success: false,
      error: 'VACUUM operation failed',
      message: error.message
    });
  }
});

// POST /api/admin/database-optimization/reindex - Rebuild indexes
router.post('/reindex', async (req, res) => {
  try {
    const pool = getPool();
    const { index, table } = req.body;
    
    let query = 'REINDEX';
    if (index) query += ` INDEX ${index}`;
    else if (table) query += ` TABLE ${table}`;
    else query += ' DATABASE current_database()';
    
    await pool.query(query);
    
    return res.json({
      success: true,
      message: 'Reindex operation completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running REINDEX:', error);
    return res.status(500).json({
      success: false,
      error: 'Reindex operation failed',
      message: error.message
    });
  }
});

module.exports = router;