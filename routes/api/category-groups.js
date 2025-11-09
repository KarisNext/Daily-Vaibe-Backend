const express = require('express');
const { getPool } = require('../../config/db');
const router = express.Router();

const GROUP_MAPPINGS = {
  'live-world': ['live', 'world', 'gender'],
  'counties': ['nairobi', 'coast', 'mountain', 'lake-region', 'rift-valley', 'northern'],
  'politics': ['politics', 'international', 'national', 'legal'],
  'business': ['business', 'economy', 'investments', 'companies', 'finance-markets', 'seeds-of-gold', 'enterprise'],
  'opinion': ['opinion', 'editorials', 'columnists', 'guest-blogs', 'letters', 'cutting-edge', 'cartoons'],
  'sports': ['sports', 'football', 'athletics', 'rugby', 'motorsport', 'talkup', 'other-sports'],
  'lifestyle': ['culture', 'travel', 'motoring', 'family', 'relationships', 'art-books', 'wellness'],
  'entertainment': ['buzz', 'trending', 'gossip', 'life-stories', 'more-entertainment'],
  'tech': ['technology', 'innovations', 'gadgets', 'startups', 'digital-life']
};

const GROUP_INFO = {
  'live-world': { name: 'Live & World', description: 'Breaking news and global coverage', color: '#dc2626' },
  'counties': { name: 'Counties', description: 'Regional news coverage', color: '#16a34a' },
  'politics': { name: 'Politics', description: 'Political news and analysis', color: '#c0392b' },
  'business': { name: 'Business', description: 'Business and economy news', color: '#1e40af' },
  'opinion': { name: 'Opinion', description: 'Editorials and commentary', color: '#9333ea' },
  'sports': { name: 'Sports', description: 'Sports news and analysis', color: '#16a34a' },
  'lifestyle': { name: 'Life & Style', description: 'Lifestyle and culture', color: '#ec4899' },
  'entertainment': { name: 'Entertainment', description: 'Entertainment and celebrity news', color: '#f59e0b' },
  'tech': { name: 'Technology', description: 'Tech news and innovations', color: '#3b82f6' }
};

router.get('/:groupSlug/news', async (req, res) => {
  try {
    const pool = getPool();
    const { groupSlug } = req.params;
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20')));
    const offset = (page - 1) * limit;
    
    const categorySlugs = GROUP_MAPPINGS[groupSlug];
    const groupInfo = GROUP_INFO[groupSlug];
    
    if (!categorySlugs || !groupInfo) {
      return res.status(404).json({
        success: false,
        message: `Category group '${groupSlug}' not found`
      });
    }
    
    const categoryIdsQuery = `
      SELECT category_id FROM categories 
      WHERE slug = ANY($1) AND active = true
    `;
    
    const categoryIdsResult = await pool.query(categoryIdsQuery, [categorySlugs]);
    const categoryIds = categoryIdsResult.rows.map(row => row.category_id);
    
    if (categoryIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active categories found in this group'
      });
    }
    
    const countQuery = `
      SELECT COUNT(DISTINCT n.news_id) as total
      FROM news n
      INNER JOIN news_categories nc ON n.news_id = nc.news_id
      WHERE nc.category_id = ANY($1) AND n.status = 'published'
    `;
    
    const countResult = await pool.query(countQuery, [categoryIds]);
    const totalNews = parseInt(countResult.rows[0].total);
    
    const newsQuery = `
      SELECT DISTINCT ON (n.news_id)
        n.news_id,
        n.title,
        n.excerpt,
        n.slug,
        n.category_id,
        n.featured,
        n.image_url,
        n.status,
        n.priority,
        n.tags,
        n.reading_time,
        n.views,
        n.likes_count,
        n.comments_count,
        n.share_count,
        n.published_at,
        n.created_at,
        n.updated_at,
        COALESCE(a.first_name, 'VybesTribe') as first_name,
        COALESCE(a.last_name, 'Editor') as last_name,
        a.email as author_email,
        c.name as category_name,
        c.slug as category_slug
      FROM news n
      INNER JOIN news_categories nc ON n.news_id = nc.news_id
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      WHERE nc.category_id = ANY($1) AND n.status = 'published'
      ORDER BY n.news_id, n.published_at DESC
      OFFSET $2 LIMIT $3
    `;
    
    const newsResult = await pool.query(newsQuery, [categoryIds, offset, limit]);
    
    const totalPages = Math.ceil(totalNews / limit);
    
    return res.json({
      success: true,
      category: {
        category_id: 0,
        name: groupInfo.name,
        slug: groupSlug,
        description: groupInfo.description,
        color: groupInfo.color,
        active: true
      },
      news: newsResult.rows,
      pagination: {
        current_page: page,
        per_page: limit,
        total_news: totalNews,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    });

  } catch (error) {
    console.error(`Category group news error for ${req.params.groupSlug}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;