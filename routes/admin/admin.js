const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');
const isProduction = process.env.NODE_ENV === 'production';

const isAuthenticated = (req, res, next) => {
  const adminId = req.session?.adminId;
  
  if (!adminId) {
    if (!isProduction && process.env.BYPASS_AUTH === 'true') {
      console.warn("⚠️ Bypassing admin authentication for development!");
      req.adminId = 1;
      return next();
    }
    
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }
  
  req.adminId = adminId;
  next();
};

const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        'SELECT role FROM admins WHERE admin_id = $1 AND status = $2',
        [req.adminId, 'active']
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const userRole = result.rows[0].role;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed'
      });
    }
  };
};

router.post('/posts', isAuthenticated, requireRole(['super_admin', 'admin', 'editor']), async (req, res) => {
  const pool = getPool();
  let client;

  try {
    const { 
      title, content, excerpt, slug, category_id, featured, 
      image_url, status = 'draft', priority = 'medium', tags, 
      reading_time, youtube_url, published_at 
    } = req.body;
    
    if (!title || !content || !slug || !category_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: title, content, slug, category_id' 
      });
    }

    const author_id = req.adminId;

    client = await pool.connect();

    const result = await client.query(`
      INSERT INTO news (
        title, content, excerpt, slug, category_id, featured, 
        image_url, status, priority, tags, reading_time, youtube_url, 
        author_id, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      title, content, excerpt, slug, category_id, featured, 
      image_url, status, priority, tags, reading_time, youtube_url, 
      author_id, published_at || new Date()
    ]);

    await client.query(
      `INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [author_id, 'create_post', 'news', result.rows[0].news_id, `Created post: ${title}`]
    );

    return res.status(201).json({ 
      success: true, 
      message: 'Post created successfully', 
      post: result.rows[0] 
    });

  } catch (error) {
    console.error('⚠ Admin create post error:', error);
    
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Post with this slug already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/posts', isAuthenticated, requireRole(['super_admin', 'admin', 'editor', 'moderator']), async (req, res) => {
  const pool = getPool();
  let client;

  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search, 
      author_id,
      category_id,
      sort = 'created_at',
      order = 'DESC'
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`n.status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (search) {
      whereConditions.push(`(n.title ILIKE $${paramIndex} OR n.excerpt ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (author_id) {
      whereConditions.push(`n.author_id = $${paramIndex++}`);
      queryParams.push(parseInt(author_id));
    }

    if (category_id) {
      whereConditions.push(`n.category_id = $${paramIndex++}`);
      queryParams.push(parseInt(category_id));
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    client = await pool.connect();

    const countResult = await client.query(`
      SELECT COUNT(*) as total 
      FROM news n
      ${whereClause}
    `, queryParams);

    const totalPosts = parseInt(countResult.rows[0].total);

    const validSortColumns = ['created_at', 'published_at', 'views', 'likes_count', 'title'];
    const sortColumn = validSortColumns.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    queryParams.push(limitNum, offset);

    const postsResult = await client.query(`
      SELECT 
        n.news_id, n.title, n.slug, n.excerpt, n.status, n.priority, n.featured, 
        n.image_url, n.published_at, n.created_at, n.views, n.likes_count,
        n.comments_count, n.share_count, n.tags,
        COALESCE(a.first_name, 'VybesTribe') as first_name,
        COALESCE(a.last_name, 'Editor') as last_name,
        c.name as category_name, c.slug as category_slug
      FROM news n
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      ${whereClause}
      ORDER BY n.${sortColumn} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, queryParams);

    return res.json({
      success: true,
      news: postsResult.rows,
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total_posts: totalPosts,
        total_pages: Math.ceil(totalPosts / limitNum),
        has_next: pageNum < Math.ceil(totalPosts / limitNum),
        has_prev: pageNum > 1
      }
    });

  } catch (error) {
    console.error('⚠ Admin retrieve posts error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.get('/posts/:id', isAuthenticated, requireRole(['super_admin', 'admin', 'editor', 'moderator']), async (req, res) => {
  const pool = getPool();
  let client;

  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID'
      });
    }

    client = await pool.connect();

    const result = await client.query(`
      SELECT 
        n.*,
        COALESCE(a.first_name, 'VybesTribe') as author_first_name,
        COALESCE(a.last_name, 'Editor') as author_last_name,
        c.name as category_name, c.slug as category_slug
      FROM news n
      LEFT JOIN admins a ON n.author_id = a.admin_id
      LEFT JOIN categories c ON n.category_id = c.category_id
      WHERE n.news_id = $1
    `, [postId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    return res.json({
      success: true,
      post: result.rows[0]
    });

  } catch (error) {
    console.error('⚠ Admin get post error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.put('/posts/:id', isAuthenticated, requireRole(['super_admin', 'admin', 'editor']), async (req, res) => {
  const pool = getPool();
  let client;

  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID'
      });
    }

    const { 
      title, content, excerpt, slug, category_id, featured, 
      image_url, status, priority, tags, reading_time, youtube_url, 
      published_at 
    } = req.body;

    client = await pool.connect();

    const checkResult = await client.query(
      'SELECT author_id FROM news WHERE news_id = $1',
      [postId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      updateValues.push(title);
    }
    if (content !== undefined) {
      updateFields.push(`content = $${paramIndex++}`);
      updateValues.push(content);
    }
    if (excerpt !== undefined) {
      updateFields.push(`excerpt = $${paramIndex++}`);
      updateValues.push(excerpt);
    }
    if (slug !== undefined) {
      updateFields.push(`slug = $${paramIndex++}`);
      updateValues.push(slug);
    }
    if (category_id !== undefined) {
      updateFields.push(`category_id = $${paramIndex++}`);
      updateValues.push(category_id);
    }
    if (featured !== undefined) {
      updateFields.push(`featured = $${paramIndex++}`);
      updateValues.push(featured);
    }
    if (image_url !== undefined) {
      updateFields.push(`image_url = $${paramIndex++}`);
      updateValues.push(image_url);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(status);
    }
    if (priority !== undefined) {
      updateFields.push(`priority = $${paramIndex++}`);
      updateValues.push(priority);
    }
    if (tags !== undefined) {
      updateFields.push(`tags = $${paramIndex++}`);
      updateValues.push(tags);
    }
    if (reading_time !== undefined) {
      updateFields.push(`reading_time = $${paramIndex++}`);
      updateValues.push(reading_time);
    }
    if (youtube_url !== undefined) {
      updateFields.push(`youtube_url = $${paramIndex++}`);
      updateValues.push(youtube_url);
    }
    if (published_at !== undefined) {
      updateFields.push(`published_at = $${paramIndex++}`);
      updateValues.push(published_at);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(postId);

    const updateQuery = `
      UPDATE news 
      SET ${updateFields.join(', ')}
      WHERE news_id = $${paramIndex}
      RETURNING *
    `;

    const result = await client.query(updateQuery, updateValues);

    await client.query(
      `INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.adminId, 'update_post', 'news', postId, `Updated post: ${title || result.rows[0].title}`]
    );

    return res.json({
      success: true,
      message: 'Post updated successfully',
      post: result.rows[0]
    });

  } catch (error) {
    console.error('⚠ Admin update post error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Post with this slug already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.delete('/posts/:id', isAuthenticated, requireRole(['super_admin', 'admin']), async (req, res) => {
  const pool = getPool();
  let client;

  try {
    const postId = parseInt(req.params.id);

    if (isNaN(postId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid post ID'
      });
    }

    client = await pool.connect();

    const checkResult = await client.query(
      'SELECT title FROM news WHERE news_id = $1',
      [postId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const postTitle = checkResult.rows[0].title;

    await client.query('DELETE FROM news WHERE news_id = $1', [postId]);

    await client.query(
      `INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details) 
       VALUES ($1, $2, $3, $4, $5)`,
      [req.adminId, 'delete_post', 'news', postId, `Deleted post: ${postTitle}`]
    );

    return res.json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    console.error('⚠ Admin delete post error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: !isProduction ? error.message : undefined
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = router;