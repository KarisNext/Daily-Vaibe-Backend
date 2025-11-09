// backend/routes/api/articles.js

const express = require('express');
const { getPool } = require('../../config/db');
const router = express.Router();

router.get('/slugs', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT slug FROM news WHERE status = $1 ORDER BY published_at DESC',
      ['published']
    );
    res.json(result.rows.map(row => row.slug));
  } catch (error) {
    console.error('Error fetching article slugs:', error);
    res.status(500).json([]);
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const pool = getPool();
    const { slug } = req.params;
    
    const articleQuery = `
      SELECT 
        n.news_id,
        n.title,
        n.content,
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
        n.published_at,
        n.created_at,
        n.updated_at,
        n.youtube_url,
        n.share_count,
        n.social_videos,
        n.additional_images,
        COALESCE(a.first_name, 'VybesTribe') as first_name,
        COALESCE(a.last_name, 'Editor') as last_name,
        a.admin_id as author_id,
        a.email as author_email,
        a.role as author_role,
        c.name as category_name,
        c.slug as category_slug,
        c.color as category_color,
        c.description as category_description
      FROM news n
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      WHERE LOWER(n.slug) = LOWER($1) AND n.status = 'published'
      LIMIT 1
    `;

    const result = await pool.query(articleQuery, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const article = result.rows[0];

    // Fetch all images for this article
    const imagesQuery = `
      SELECT 
        image_id,
        image_url,
        image_caption,
        position,
        is_featured,
        alt_text,
        width,
        height
      FROM news_images
      WHERE news_id = $1
      ORDER BY position ASC, image_order ASC
    `;
    const imagesResult = await pool.query(imagesQuery, [article.news_id]);

    // Fetch all videos for this article
    const videosQuery = `
      SELECT 
        video_id,
        platform,
        video_url,
        position,
        caption,
        thumbnail_url,
        duration
      FROM news_videos
      WHERE news_id = $1
      ORDER BY position ASC
    `;
    const videosResult = await pool.query(videosQuery, [article.news_id]);

    const relatedQuery = `
      SELECT 
        n.news_id,
        n.title,
        n.excerpt,
        n.slug,
        n.image_url,
        n.published_at,
        n.reading_time,
        n.views,
        n.category_id,
        c.name as category_name,
        c.slug as category_slug,
        COALESCE(a.first_name, 'VybesTribe') as first_name,
        COALESCE(a.last_name, 'Editor') as last_name
      FROM news n
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      WHERE n.category_id = $1 
        AND n.news_id != $2 
        AND n.status = 'published'
      ORDER BY n.published_at DESC
      LIMIT 20
    `;

    const relatedResult = await pool.query(relatedQuery, [article.category_id, article.news_id]);

    const tagsArray = article.tags ? article.tags.split(',').map(tag => tag.trim()) : [];

    await pool.query(
      'UPDATE news SET views = COALESCE(views, 0) + 1 WHERE news_id = $1',
      [article.news_id]
    );

    // Parse social_videos and additional_images from JSONB
    let socialVideos = [];
    let additionalImages = [];

    try {
      socialVideos = article.social_videos || videosResult.rows || [];
      additionalImages = article.additional_images || imagesResult.rows.filter(img => !img.is_featured) || [];
    } catch (parseError) {
      console.warn('Error parsing media:', parseError);
    }

    return res.json({
      success: true,
      article: {
        ...article,
        tags: tagsArray,
        views: (article.views || 0) + 1,
        social_videos: socialVideos,
        additional_images: additionalImages,
        all_images: imagesResult.rows,
        all_videos: videosResult.rows,
        author: {
          author_id: article.author_id,
          first_name: article.first_name,
          last_name: article.last_name,
          email: article.author_email,
          role: article.author_role
        },
        category: {
          category_id: article.category_id,
          name: article.category_name,
          slug: article.category_slug,
          color: article.category_color,
          description: article.category_description
        }
      },
      related_articles: relatedResult.rows
    });

  } catch (error) {
    console.error(`Article API error for slug ${req.params.slug}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// NEW: Endpoint to add/update article media
router.post('/:slug/media', async (req, res) => {
  try {
    const pool = getPool();
    const { slug } = req.params;
    const { images, videos } = req.body;

    const articleResult = await pool.query(
      'SELECT news_id FROM news WHERE LOWER(slug) = LOWER($1)',
      [slug]
    );

    if (articleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const newsId = articleResult.rows[0].news_id;

    // Add images
    if (images && Array.isArray(images)) {
      for (const img of images) {
        await pool.query(`
          INSERT INTO news_images (news_id, image_url, image_caption, position, alt_text, is_featured)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (news_id, image_url) 
          DO UPDATE SET 
            image_caption = EXCLUDED.image_caption,
            position = EXCLUDED.position,
            alt_text = EXCLUDED.alt_text
        `, [newsId, img.url, img.caption || '', img.position || 0, img.alt_text || '', img.is_featured || false]);
      }
    }

    // Add videos
    if (videos && Array.isArray(videos)) {
      for (const vid of videos) {
        await pool.query(`
          INSERT INTO news_videos (news_id, platform, video_url, position, caption)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (news_id, video_url) 
          DO UPDATE SET 
            position = EXCLUDED.position,
            caption = EXCLUDED.caption
        `, [newsId, vid.platform, vid.url, vid.position || 0, vid.caption || '']);
      }
    }

    // Update JSONB columns for quick access
    await pool.query(`
      UPDATE news 
      SET 
        additional_images = $1::jsonb,
        social_videos = $2::jsonb
      WHERE news_id = $3
    `, [JSON.stringify(images || []), JSON.stringify(videos || []), newsId]);

    return res.json({
      success: true,
      message: 'Media updated successfully'
    });

  } catch (error) {
    console.error('Error updating article media:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update media'
    });
  }
});

// NEW: Get article media
router.get('/:slug/media', async (req, res) => {
  try {
    const pool = getPool();
    const { slug } = req.params;

    const articleResult = await pool.query(
      'SELECT news_id FROM news WHERE LOWER(slug) = LOWER($1)',
      [slug]
    );

    if (articleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const newsId = articleResult.rows[0].news_id;

    const [imagesResult, videosResult] = await Promise.all([
      pool.query('SELECT * FROM news_images WHERE news_id = $1 ORDER BY position', [newsId]),
      pool.query('SELECT * FROM news_videos WHERE news_id = $1 ORDER BY position', [newsId])
    ]);

    return res.json({
      success: true,
      images: imagesResult.rows,
      videos: videosResult.rows
    });

  } catch (error) {
    console.error('Error fetching article media:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch media'
    });
  }
});

router.get('/:slug/comments', async (req, res) => {
  try {
    const pool = getPool();
    const { slug } = req.params;
    const {
      page = 1,
      limit = 20,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;

    const articleQuery = `
      SELECT news_id FROM news 
      WHERE LOWER(slug) = LOWER($1) AND status = 'published'
    `;
    
    const articleResult = await pool.query(articleQuery, [slug]);
    
    if (articleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const newsId = articleResult.rows[0].news_id;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const allowedSortFields = ['created_at', 'updated_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const commentsQuery = `
      SELECT 
        c.comment_id,
        c.comment_text as content,
        c.author_name,
        c.author_email,
        c.status,
        c.created_at,
        c.updated_at,
        c.parent_id as parent_comment_id,
        (SELECT COUNT(*) FROM news_comments WHERE parent_id = c.comment_id AND status = 'approved') as replies_count
      FROM news_comments c
      WHERE c.news_id = $1 AND c.status = 'approved' AND c.parent_id IS NULL
      ORDER BY c.${sortField} ${sortOrder}
      OFFSET $2 LIMIT $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM news_comments 
      WHERE news_id = $1 AND status = 'approved' AND parent_id IS NULL
    `;

    const [commentsResult, countResult] = await Promise.all([
      pool.query(commentsQuery, [newsId, offset, parseInt(limit)]),
      pool.query(countQuery, [newsId])
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / parseInt(limit));

    return res.json({
      success: true,
      comments: commentsResult.rows,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total_comments: total,
        total_pages: totalPages,
        has_next: parseInt(page) < totalPages,
        has_prev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error(`Comments API error for article ${req.params.slug}:`, error);
    return res.status(500).json({
      success: false,
      comments: [],
      message: 'Internal server error'
    });
  }
});

router.get('/:slug/replies/:commentId', async (req, res) => {
  try {
    const pool = getPool();
    const { slug, commentId } = req.params;
    const limit = parseInt(req.query.limit || '10');

    const articleQuery = `
      SELECT news_id FROM news 
      WHERE LOWER(slug) = LOWER($1) AND status = 'published'
    `;
    
    const articleResult = await pool.query(articleQuery, [slug]);
    
    if (articleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const repliesQuery = `
      SELECT 
        c.comment_id,
        c.comment_text as content,
        c.author_name,
        c.created_at,
        c.parent_id as parent_comment_id
      FROM news_comments c
      WHERE c.parent_id = $1 AND c.status = 'approved'
      ORDER BY c.created_at ASC
      LIMIT $2
    `;

    const repliesResult = await pool.query(repliesQuery, [commentId, limit]);

    return res.json({
      success: true,
      replies: repliesResult.rows,
      parent_comment_id: commentId,
      total: repliesResult.rows.length
    });

  } catch (error) {
    console.error(`Replies API error for comment ${req.params.commentId}:`, error);
    return res.status(500).json({
      success: false,
      replies: [],
      message: 'Internal server error'
    });
  }
});

router.post('/:slug/view', async (req, res) => {
  try {
    const pool = getPool();
    const { slug } = req.params;
    const { user_agent, ip_address } = req.body;

    const updateQuery = `
      UPDATE news 
      SET views = COALESCE(views, 0) + 1,
          updated_at = NOW()
      WHERE LOWER(slug) = LOWER($1) AND status = 'published'
      RETURNING news_id, views, title
    `;

    const result = await pool.query(updateQuery, [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const article = result.rows[0];

    if (user_agent || ip_address) {
      try {
        const tableCheckQuery = `
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'article_views'
          )
        `;
        const tableExists = await pool.query(tableCheckQuery);
        
        if (tableExists.rows[0].exists) {
          await pool.query(`
            INSERT INTO article_views (news_id, ip_address, user_agent, viewed_at)
            VALUES ($1, $2, $3, NOW())
          `, [article.news_id, ip_address || 'unknown', user_agent || 'unknown']);
        }
      } catch (viewLogError) {
        console.warn('Failed to log detailed view:', viewLogError.message);
      }
    }

    return res.json({
      success: true,
      news_id: article.news_id,
      views: article.views,
      title: article.title
    });

  } catch (error) {
    console.error(`View tracking error for article ${req.params.slug}:`, error);
    return res.json({
      success: false,
      views: 0,
      message: 'View tracking failed'
    });
  }
});

router.post('/:slug/like', async (req, res) => {
  try {
    const pool = getPool();
    const { slug } = req.params;
    const { client_id } = req.body;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: 'Client ID required'
      });
    }

    const articleQuery = `
      SELECT news_id, likes_count FROM news 
      WHERE LOWER(slug) = LOWER($1) AND status = 'published'
    `;
    
    const articleResult = await pool.query(articleQuery, [slug]);
    
    if (articleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    const { news_id, likes_count } = articleResult.rows[0];

    const existingLikeQuery = `
      SELECT reaction_id FROM news_reactions 
      WHERE news_id = $1 AND ip_address = $2::inet
    `;
    
    const existingLike = await pool.query(existingLikeQuery, [news_id, client_id]);

    if (existingLike.rows.length > 0) {
      await pool.query('DELETE FROM news_reactions WHERE reaction_id = $1', [existingLike.rows[0].reaction_id]);
      await pool.query('UPDATE news SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) WHERE news_id = $1', [news_id]);
      
      return res.json({
        success: true,
        liked: false,
        likes_count: Math.max((likes_count || 0) - 1, 0),
        message: 'Article unliked'
      });
    } else {
      await pool.query(`
        INSERT INTO news_reactions (news_id, ip_address, reaction_type, created_at)
        VALUES ($1, $2::inet, 'like', NOW())
      `, [news_id, client_id]);
      
      await pool.query('UPDATE news SET likes_count = COALESCE(likes_count, 0) + 1 WHERE news_id = $1', [news_id]);
      
      return res.json({
        success: true,
        liked: true,
        likes_count: (likes_count || 0) + 1,
        message: 'Article liked'
      });
    }

  } catch (error) {
    console.error(`Like API error for article ${req.params.slug}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/author/:authorId', async (req, res) => {
  try {
    const pool = getPool();
    const { authorId } = req.params;
    const {
      page = 1,
      limit = 20,
      sort = 'published_at',
      order = 'DESC'
    } = req.query;

    const authorQuery = `
      SELECT 
        a.admin_id as author_id,
        a.first_name,
        a.last_name,
        a.email,
        a.role,
        (SELECT COUNT(*) FROM news WHERE author_id = a.admin_id AND status = 'published') as total_articles,
        (SELECT COALESCE(SUM(views), 0) FROM news WHERE author_id = a.admin_id AND status = 'published') as total_views
      FROM admins a
      WHERE a.admin_id = $1
    `;

    const authorResult = await pool.query(authorQuery, [authorId]);
    
    if (authorResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Author not found'
      });
    }

    const author = authorResult.rows[0];
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const allowedSortFields = ['published_at', 'views', 'likes_count', 'title'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'published_at';
    const sortOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const articlesQuery = `
      SELECT 
        n.news_id,
        n.title,
        n.excerpt,
        n.slug,
        n.image_url,
        n.published_at,
        n.reading_time,
        n.views,
        n.likes_count,
        c.name as category_name,
        c.slug as category_slug,
        COALESCE(a.first_name, 'VybesTribe') as first_name,
        COALESCE(a.last_name, 'Editor') as last_name
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.category_id
      LEFT JOIN admins a ON n.author_id = a.admin_id
      WHERE n.author_id = $1 AND n.status = 'published'
      ORDER BY n.${sortField} ${sortOrder}
      OFFSET $2 LIMIT $3
    `;

    const articlesResult = await pool.query(articlesQuery, [authorId, offset, parseInt(limit)]);

    const totalArticles = parseInt(author.total_articles);
    const totalPages = Math.ceil(totalArticles / parseInt(limit));

    return res.json({
      success: true,
      author: {
        ...author,
        full_name: `${author.first_name} ${author.last_name}`
      },
      articles: articlesResult.rows,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total_articles: totalArticles,
        total_pages: totalPages,
        has_next: parseInt(page) < totalPages,
        has_prev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error(`Author articles API error for ${req.params.authorId}:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/search/suggestions', async (req, res) => {
  try {
    const pool = getPool();
    const { q, limit = 5 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    const query = `
      SELECT DISTINCT title, slug
      FROM news 
      WHERE status = 'published' 
        AND (title ILIKE $1 OR excerpt ILIKE $1)
      ORDER BY published_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [`%${q.trim()}%`, parseInt(limit)]);

    return res.json({
      success: true,
      suggestions: result.rows
    });

  } catch (error) {
    console.error('Search suggestions API error:', error);
    return res.json({
      success: true,
      suggestions: []
    });
  }
});

module.exports = router;