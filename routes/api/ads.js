// backend/routes/api/ads.js

const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM advertisers WHERE status = 'active') as active_advertisers,
        (SELECT COUNT(*) FROM advertisements WHERE status = 'active') as active_ads,
        (SELECT SUM(impressions) FROM advertisements) as total_impressions,
        (SELECT SUM(clicks) FROM advertisements) as total_clicks,
        (SELECT COUNT(*) FROM ad_impressions WHERE created_at > NOW() - INTERVAL '24 hours') as impressions_24h,
        (SELECT COUNT(*) FROM ad_clicks WHERE created_at > NOW() - INTERVAL '24 hours') as clicks_24h
    `);

    return res.json({
      success: true,
      stats: stats.rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/tiers', async (req, res) => {
  try {
    const pool = getPool();
    
    const tiers = await pool.query(`
      SELECT * FROM ad_tiers WHERE active = true ORDER BY priority_level
    `);

    return res.json({
      success: true,
      tiers: tiers.rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/track-impression', async (req, res) => {
  try {
    const { ad_id, session_id, county, town } = req.body;
    const pool = getPool();
    
    await pool.query(`
      INSERT INTO ad_impressions (ad_id, session_id, county, town)
      VALUES ($1, $2, $3, $4)
    `, [ad_id, session_id, county, town]);

    await pool.query(`
      UPDATE advertisements SET impressions = impressions + 1 WHERE ad_id = $1
    `, [ad_id]);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/track-click', async (req, res) => {
  try {
    const { ad_id, session_id, county, town } = req.body;
    const pool = getPool();
    
    await pool.query(`
      INSERT INTO ad_clicks (ad_id, session_id, county, town)
      VALUES ($1, $2, $3, $4)
    `, [ad_id, session_id, county, town]);

    await pool.query(`
      UPDATE advertisements SET clicks = clicks + 1 WHERE ad_id = $1
    `, [ad_id]);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/active', async (req, res) => {
  try {
    const { placement, county } = req.query;
    const pool = getPool();
    
    let query = `
      SELECT a.*, adv.company_name, t.tier_name, t.priority_level
      FROM advertisements a
      JOIN advertisers adv ON a.advertiser_id = adv.advertiser_id
      JOIN ad_tiers t ON adv.tier_id = t.tier_id
      WHERE a.status = 'active'
      AND a.start_date <= NOW()
      AND (a.end_date IS NULL OR a.end_date >= NOW())
    `;
    
    const params = [];
    let paramCount = 1;
    
    if (placement) {
      query += ` AND a.placement = $${paramCount}`;
      params.push(placement);
      paramCount++;
    }
    
    if (county) {
      query += ` AND ($${paramCount} = ANY(a.target_counties) OR a.target_counties IS NULL)`;
      params.push(county);
    }
    
    query += ` ORDER BY t.priority_level DESC, a.priority DESC, RANDOM() LIMIT 10`;
    
    const ads = await pool.query(query, params);

    return res.json({
      success: true,
      ads: ads.rows
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;