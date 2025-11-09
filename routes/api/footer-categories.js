const express = require('express');
const { getPool } = require('../../config/db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    
    const categoriesQuery = `
      SELECT 
        category_id,
        name,
        slug,
        description,
        color,
        order_index,
        active
      FROM categories 
      WHERE active = true
      ORDER BY order_index ASC
    `;
    
    const result = await pool.query(categoriesQuery);
    const categories = result.rows;
    
    const groups = {
      'live-world': {
        title: 'Live & World',
        icon: '🌍',
        description: 'Breaking news and global coverage',
        mainSlug: null,
        categories: categories.filter(c => ['live', 'world', 'gender'].includes(c.slug))
      },
      'counties': {
        title: 'Counties',
        icon: '🏢',
        description: 'Regional news coverage',
        mainSlug: null,
        categories: categories.filter(c => 
          ['nairobi', 'coast', 'mountain', 'lake-region', 'rift-valley', 'northern'].includes(c.slug)
        )
      },
      'politics': {
        title: 'Politics',
        icon: '🏛️',
        description: 'Political news and analysis',
        mainSlug: null,
        categories: categories.filter(c => 
          ['politics', 'live-news', 'national-news', 'world-news', 'international', 'legal'].includes(c.slug)
        )
      },
      'business': {
        title: 'Business',
        icon: '💼',
        description: 'Business and economy news',
        mainSlug: null,
        categories: categories.filter(c => 
          ['companies', 'finance-markets', 'seeds-of-gold', 'enterprise'].includes(c.slug)
        )
      },
      'opinion': {
        title: 'Opinion',
        icon: '💭',
        description: 'Editorials and commentary',
        mainSlug: null,
        categories: categories.filter(c => 
          ['editorials', 'columnists', 'guest-blogs', 'letters', 'cutting-edge', 'cartoons'].includes(c.slug)
        )
      },
      'sports': {
        title: 'Sports',
        icon: '⚽',
        description: 'Sports news and analysis',
        mainSlug: null,
        categories: categories.filter(c => 
          ['football', 'athletics', 'rugby', 'motorsport', 'talkup', 'other-sports'].includes(c.slug)
        )
      },
      'lifestyle': {
        title: 'Life & Style',
        icon: '🎭',
        description: 'Lifestyle and culture',
        mainSlug: null,
        categories: categories.filter(c => 
          ['motoring', 'culture', 'family', 'relationships', 'art-books', 'travel', 'wellness'].includes(c.slug)
        )
      },
      'entertainment': {
        title: 'Entertainment',
        icon: '🎉',
        description: 'Entertainment and celebrity news',
        mainSlug: null,
        categories: categories.filter(c => 
          ['buzz', 'trending', 'gossip', 'life-stories', 'more-entertainment'].includes(c.slug)
        )
      },
      'tech': {
        title: 'Technology',
        icon: '💻',
        description: 'Tech news and innovations',
        mainSlug: null,
        categories: categories.filter(c => 
          ['innovations', 'gadgets', 'startups', 'digital-life'].includes(c.slug)
        )
      }
    };
    
    const filteredGroups = Object.fromEntries(
      Object.entries(groups).filter(([key, group]) => group.categories.length > 0)
    );
    
    return res.json({
      success: true,
      groups: filteredGroups,
      total_categories: categories.length
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch grouped categories',
      groups: {},
      total_categories: 0
    });
  }
});

module.exports = router;