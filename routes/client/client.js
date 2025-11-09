// ============================================
// FILE 3: backend/routes/client/client.js
// ============================================
const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

const isProduction = process.env.NODE_ENV === 'production';

router.get('/category', async (req, res) => {
  try {
    const { slug, type = 'news', page = 1, limit = 20 } = req.query;
    
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Category slug is required' });
    }

    const pool = getPool();
    const categoryResult = await pool.query(
      'SELECT category_id, name, slug, description, color, icon, active FROM categories WHERE slug = $1 AND active = true',
      [slug]
    );
    
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Category '${slug}' not found` });
    }
    
    const category = categoryResult.rows[0];
    
    if (type === 'news') {
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;
      
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM news WHERE category_id = $1 AND status = $2',
        [category.category_id, 'published']
      );
      const totalNews = parseInt(countResult.rows[0].total);
      
      const newsResult = await pool.query(`
        SELECT n.news_id, n.title, n.excerpt, n.slug, n.category_id, n.featured, n.image_url,
               n.status, n.priority, n.tags, n.reading_time, n.views, n.likes_count,
               n.comments_count, n.share_count, n.published_at, n.created_at, n.updated_at,
               COALESCE(a.first_name, 'VybesTribe') as first_name,
               COALESCE(a.last_name, 'Editor') as last_name,
               a.email as author_email, c.name as category_name, c.slug as category_slug
        FROM news n
        LEFT JOIN admins a ON n.author_id = a.admin_id
        LEFT JOIN categories c ON n.category_id = c.category_id
        WHERE n.category_id = $1 AND n.status = 'published'
        ORDER BY n.published_at DESC OFFSET $2 LIMIT $3
      `, [category.category_id, offset, limitNum]);
      
      return res.json({
        success: true,
        category,
        news: newsResult.rows,
        pagination: {
          current_page: pageNum,
          per_page: limitNum,
          total_news: totalNews,
          total_pages: Math.ceil(totalNews / limitNum),
          has_next: pageNum < Math.ceil(totalNews / limitNum),
          has_prev: pageNum > 1
        }
      });
    } else if (type === 'stats') {
      const statsResult = await pool.query(`
        SELECT COUNT(*) as total_articles,
               COUNT(*) FILTER (WHERE status = 'published') as published_articles,
               COUNT(*) FILTER (WHERE featured = true AND status = 'published') as featured_articles,
               COALESCE(SUM(views), 0) as total_views,
               COALESCE(SUM(likes_count), 0) as total_likes
        FROM news WHERE category_id = $1
      `, [category.category_id]);
      
      return res.json({ success: true, category, stats: statsResult.rows[0] });
    }
    
    return res.status(400).json({ success: false, message: 'Invalid type parameter' });
  } catch (error) {
    console.error('❌ Client category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  }
});

router.get('/home', async (req, res) => {
  try {
    const { type = 'all', limit = 10 } = req.query;
    const pool = getPool();
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    
    const baseQuery = `
      SELECT n.news_id, n.title, n.excerpt, n.slug, n.image_url, n.published_at,
             n.reading_time, n.views, n.likes_count, n.featured, n.priority,
             COALESCE(a.first_name, 'VybesTribe') as first_name,
             COALESCE(a.last_name, 'Editor') as last_name,
             c.name as category_name, c.slug as category_slug
      FROM news n
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      WHERE n.status = 'published'
    `;
    
    if (type === 'breaking') {
      const result = await pool.query(`${baseQuery} AND (n.priority = 'high' OR n.featured = true) ORDER BY n.published_at DESC LIMIT $1`, [limitNum]);
      return res.json({ success: true, breaking_news: result.rows });
    }
    if (type === 'featured') {
      const result = await pool.query(`${baseQuery} AND n.featured = true ORDER BY n.published_at DESC LIMIT $1`, [limitNum]);
      return res.json({ success: true, featured_news: result.rows });
    }
    if (type === 'trending') {
      const result = await pool.query(`${baseQuery} AND n.published_at >= NOW() - INTERVAL '7 days' ORDER BY COALESCE(n.views, 0) DESC LIMIT $1`, [limitNum]);
      return res.json({ success: true, trending_news: result.rows });
    }
    if (type === 'categories') {
      const result = await pool.query('SELECT * FROM categories WHERE active = true ORDER BY COALESCE(order_index, 999) ASC');
      return res.json({ success: true, categories: result.rows });
    }
    
    const [breakingResult, featuredResult, trendingResult, categoriesResult] = await Promise.all([
      pool.query(`${baseQuery} AND (n.priority = 'high' OR n.featured = true) ORDER BY n.published_at DESC LIMIT 10`),
      pool.query(`${baseQuery} AND n.featured = true ORDER BY n.published_at DESC LIMIT 10`),
      pool.query(`${baseQuery} AND n.published_at >= NOW() - INTERVAL '7 days' ORDER BY COALESCE(n.views, 0) DESC LIMIT 10`),
      pool.query('SELECT * FROM categories WHERE active = true ORDER BY COALESCE(order_index, 999) ASC')
    ]);
    
    return res.json({
      success: true,
      breaking_news: breakingResult.rows,
      featured_news: featuredResult.rows,
      trending_news: trendingResult.rows,
      categories: categoriesResult.rows
    });
  } catch (error) {
    console.error('❌ Client home error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  }
});

router.get('/article', async (req, res) => {
  try {
    const { slug } = req.query;
    
    if (!slug) {
      return res.status(400).json({ success: false, message: 'Article slug is required' });
    }
    
    const pool = getPool();
    const result = await pool.query(`
      SELECT n.*, COALESCE(a.first_name, 'VybesTribe') as first_name,
             COALESCE(a.last_name, 'Editor') as last_name, a.email as author_email,
             c.name as category_name, c.slug as category_slug,
             c.color as category_color, c.icon as category_icon
      FROM news n
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      WHERE n.slug = $1 AND n.status = 'published'
    `, [slug]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    
    await pool.query('UPDATE news SET views = COALESCE(views, 0) + 1 WHERE slug = $1', [slug]);
    
    return res.json({ success: true, article: result.rows[0] });
  } catch (error) {
    console.error('❌ Client article error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  }
});

module.exports = router;