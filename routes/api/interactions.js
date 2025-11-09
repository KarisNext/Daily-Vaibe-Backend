// backend/routes/api/interactions.js

const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

router.post('/track', async (req, res) => {
  try {
    const { news_id, session_id, interaction_type, county, town } = req.body;
    
    if (!news_id || !session_id || !interaction_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const pool = getPool();
    
    await pool.query(`
      INSERT INTO news_interactions (news_id, session_id, interaction_type, county, town)
      VALUES ($1, $2, $3, $4, $5)
    `, [news_id, session_id, interaction_type, county, town]);

    if (interaction_type === 'like') {
      await pool.query(`
        UPDATE news SET likes_count = likes_count + 1 WHERE news_id = $1
      `, [news_id]);
    } else if (interaction_type === 'share') {
      await pool.query(`
        UPDATE news SET share_count = share_count + 1 WHERE news_id = $1
      `, [news_id]);
    } else if (interaction_type === 'view') {
      await pool.query(`
        UPDATE news SET views = views + 1 WHERE news_id = $1
      `, [news_id]);
    }

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/analytics/:news_id', async (req, res) => {
  try {
    const { news_id } = req.params;
    const pool = getPool();
    
    const stats = await pool.query(`
      SELECT 
        interaction_type,
        COUNT(*) as count,
        county,
        COUNT(DISTINCT session_id) as unique_users
      FROM news_interactions
      WHERE news_id = $1
      GROUP BY interaction_type, county
      ORDER BY count DESC
    `, [news_id]);

    return res.json({
      success: true,
      analytics: stats.rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;