const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/images');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|bmp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const generateSlug = (title) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-');
};

const extractYouTubeData = (url) => {
  if (!url) return { id: null, title: null, thumbnail: null };
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  if (match) {
    const videoId = match[1];
    return {
      id: videoId,
      title: null,
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }
  return { id: null, title: null, thumbnail: null };
};

const calculateReadingTime = (content) => {
  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};

const processContentFormatting = (content) => {
  if (!content) return { processedContent: '', rawContent: content };
  const rawContent = content;
  let processedContent = content
    .replace(/\[QUOTE\](.*?)\[\/QUOTE\]/gs, '<blockquote class="news-large-quote">$1</blockquote>')
    .replace(/\[HIGHLIGHT\](.*?)\[\/HIGHLIGHT\]/gs, '<span class="news-highlight">$1</span>')
    .replace(/\[BOLD\](.*?)\[\/BOLD\]/gs, '<strong>$1</strong>')
    .replace(/\[ITALIC\](.*?)\[\/ITALIC\]/gs, '<em>$1</em>')
    .replace(/\[HEADING\](.*?)\[\/HEADING\]/gs, '<h3 class="content-heading">$1</h3>');
  return { processedContent, rawContent };
};

const extractQuotes = (content) => {
  if (!content) return [];
  const quoteRegex = /\[QUOTE\](.*?)\[\/QUOTE\]/gs;
  const quotes = [];
  let match;
  while ((match = quoteRegex.exec(content)) !== null) {
    quotes.push({ text: match[1].trim(), position: match.index });
  }
  return quotes;
};

router.post('/', upload.array('images', 10), async (req, res) => {
  try {
    const { getPool } = require('../../config/db');
    const pool = getPool();
    
    const {
      title, content, excerpt, category_ids, primary_category_id, priority = 'medium',
      featured = false, tags = '', meta_description = '',
      seo_keywords = '', youtube_url = '', status = 'draft', author_id
    } = req.body;

    if (!title || !content || !author_id) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and author are required'
      });
    }

    let parsedCategoryIds = [];
    try {
      parsedCategoryIds = JSON.parse(category_ids || '[]');
    } catch (e) {
      parsedCategoryIds = [];
    }

    if (parsedCategoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one category must be selected'
      });
    }

    if (!primary_category_id || !parsedCategoryIds.includes(parseInt(primary_category_id))) {
      return res.status(400).json({
        success: false,
        message: 'Primary category must be one of the selected categories'
      });
    }

    const slug = generateSlug(title);
    const readingTime = calculateReadingTime(content);
    const youtubeData = extractYouTubeData(youtube_url);
    const { processedContent, rawContent } = processContentFormatting(content);
    const quotes = extractQuotes(content);

    const existingSlug = await pool.query('SELECT slug FROM news WHERE slug = $1', [slug]);
    let finalSlug = slug;
    if (existingSlug.rows.length > 0) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    let imageUrls = [];
    let featuredImageUrl = null;
    
    if (req.files && req.files.length > 0) {
      req.files.forEach((file, index) => {
        const imageUrl = `/uploads/images/${file.filename}`;
        const metadataKey = `image_metadata_${index}`;
        let metadata = { caption: '', order: index, is_featured: false };
        
        if (req.body[metadataKey]) {
          try {
            metadata = JSON.parse(req.body[metadataKey]);
          } catch (e) {
            console.error('Failed to parse image metadata:', e);
          }
        }
        
        imageUrls.push({
          url: imageUrl,
          caption: metadata.caption || '',
          order: metadata.order || index,
          is_featured: metadata.is_featured || false
        });
        
        if (metadata.is_featured) {
          featuredImageUrl = imageUrl;
        }
      });
      
      if (!featuredImageUrl && imageUrls.length > 0) {
        featuredImageUrl = imageUrls[0].url;
        imageUrls[0].is_featured = true;
      }
    }

    const newsQuery = `
      INSERT INTO news (
        title, content, processed_content, excerpt, slug, category_id, featured, featured_until,
        image_url, images_data, status, tags, meta_description, seo_keywords, reading_time,
        author_id, youtube_url, youtube_id, youtube_thumbnail, priority, published_at,
        quotes_data, category_ids
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      ) RETURNING *
    `;

    const featuredUntil = featured ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
    const publishedAt = status === 'published' ? new Date() : null;

    const result = await pool.query(newsQuery, [
      title, rawContent, processedContent,
      excerpt || title.substring(0, 200) + '...',
      finalSlug, primary_category_id, featured, featuredUntil,
      featuredImageUrl, JSON.stringify(imageUrls), status, tags, meta_description, seo_keywords,
      readingTime, author_id, youtube_url || null,
      youtubeData.id, youtubeData.thumbnail, priority,
      publishedAt, JSON.stringify(quotes), JSON.stringify(parsedCategoryIds)
    ]);

    const newsId = result.rows[0].news_id;

    for (const categoryId of parsedCategoryIds) {
      await pool.query(
        'INSERT INTO news_categories (news_id, category_id, is_primary) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [newsId, categoryId, categoryId === parseInt(primary_category_id)]
      );
    }

    await pool.query(
      'INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [author_id, status === 'published' ? 'publish_news' : 'create_news', 'news',
       newsId, `${status === 'published' ? 'Published' : 'Created'} news: ${title} (Categories: ${parsedCategoryIds.length})`,
       req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip]
    );

    return res.json({
      success: true,
      message: `News ${status} successfully`,
      news: result.rows[0]
    });

  } catch (error) {
    console.error('Error creating news:', error);
    if (req.files) {
      for (const file of req.files) {
        try { await fs.unlink(file.path); } catch (e) { console.error('Error removing file:', e); }
      }
    }
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'A post with this title already exists' });
    }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { getPool } = require('../../config/db');
    const pool = getPool();
    const { id } = req.params;

    const newsQuery = `
      SELECT 
        n.*,
        c.name as category_name,
        c.slug as category_slug,
        COALESCE(a.first_name, 'Unknown') as first_name,
        COALESCE(a.last_name, 'Author') as last_name,
        a.email as author_email,
        (
          SELECT json_agg(json_build_object(
            'category_id', cat.category_id,
            'name', cat.name,
            'slug', cat.slug,
            'is_primary', nc.is_primary
          ) ORDER BY nc.is_primary DESC, cat.name)
          FROM news_categories nc
          JOIN categories cat ON nc.category_id = cat.category_id
          WHERE nc.news_id = n.news_id
        ) as all_categories
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.category_id
      LEFT JOIN admins a ON n.author_id = a.admin_id
      WHERE n.news_id = $1
    `;

    const result = await pool.query(newsQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    return res.json({ success: true, news: result.rows[0] });

  } catch (error) {
    console.error('Error fetching news by ID:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const { getPool } = require('../../config/db');
    const pool = getPool();
    
    const {
      page = 1, limit = 10, status, category_id,
      priority, featured, search, sort = 'created_at', order = 'DESC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (status) {
      paramCount++;
      whereConditions.push(`n.status = $${paramCount}`);
      queryParams.push(status);
    }
    if (category_id) {
      paramCount++;
      whereConditions.push(`(n.category_id = $${paramCount} OR $${paramCount} = ANY(n.category_ids))`);
      queryParams.push(parseInt(category_id));
    }
    if (priority) {
      paramCount++;
      whereConditions.push(`n.priority = $${paramCount}`);
      queryParams.push(priority);
    }
    if (featured === 'true') {
      whereConditions.push(`n.featured = true`);
    }
    if (search) {
      paramCount++;
      whereConditions.push(`(n.title ILIKE $${paramCount} OR n.content ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const newsQuery = `
      SELECT 
        n.*,
        c.name as category_name,
        c.slug as category_slug,
        COALESCE(a.first_name, 'Unknown') as first_name,
        COALESCE(a.last_name, 'Author') as last_name,
        (
          SELECT json_agg(json_build_object(
            'category_id', cat.category_id,
            'name', cat.name,
            'slug', cat.slug
          ))
          FROM unnest(n.category_ids) cat_id
          JOIN categories cat ON cat.category_id = cat_id
        ) as all_categories
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.category_id
      LEFT JOIN admins a ON n.author_id = a.admin_id
      ${whereClause}
      ORDER BY n.${sort} ${order}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(parseInt(limit), offset);

    const countQuery = `SELECT COUNT(*) as total FROM news n ${whereClause}`;
    const [newsResult, countResult] = await Promise.all([
      pool.query(newsQuery, queryParams),
      pool.query(countQuery, queryParams.slice(0, -2))
    ]);

    const totalNews = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(totalNews / parseInt(limit));

    return res.json({
      success: true,
      news: newsResult.rows,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_news: totalNews,
        has_next: parseInt(page) < totalPages,
        has_prev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Error fetching news list:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

router.put('/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { getPool } = require('../../config/db');
    const pool = getPool();
    const { id } = req.params;
    const { title, content, excerpt, category_ids, primary_category_id, priority, featured, tags,
            meta_description, seo_keywords, youtube_url, status, author_id } = req.body;

    const existingNews = await pool.query('SELECT * FROM news WHERE news_id = $1', [id]);
    if (existingNews.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    let updateFields = [];
    let updateValues = [];
    let paramCount = 0;

    if (title) {
      paramCount++;
      updateFields.push(`title = $${paramCount}`);
      updateValues.push(title);
      const slug = generateSlug(title);
      paramCount++;
      updateFields.push(`slug = $${paramCount}`);
      updateValues.push(slug);
    }
    if (content) {
      const { processedContent, rawContent } = processContentFormatting(content);
      const quotes = extractQuotes(content);
      paramCount++;
      updateFields.push(`content = $${paramCount}`);
      updateValues.push(rawContent);
      paramCount++;
      updateFields.push(`processed_content = $${paramCount}`);
      updateValues.push(processedContent);
      paramCount++;
      updateFields.push(`quotes_data = $${paramCount}`);
      updateValues.push(JSON.stringify(quotes));
      paramCount++;
      updateFields.push(`reading_time = $${paramCount}`);
      updateValues.push(calculateReadingTime(content));
    }
    if (excerpt !== undefined) {
      paramCount++;
      updateFields.push(`excerpt = $${paramCount}`);
      updateValues.push(excerpt);
    }
    if (category_ids) {
      let parsedCategoryIds = [];
      try {
        parsedCategoryIds = JSON.parse(category_ids);
      } catch (e) {
        parsedCategoryIds = [];
      }
      if (parsedCategoryIds.length > 0) {
        paramCount++;
        updateFields.push(`category_ids = $${paramCount}`);
        updateValues.push(JSON.stringify(parsedCategoryIds));
        
        await pool.query('DELETE FROM news_categories WHERE news_id = $1', [id]);
        
        for (const categoryId of parsedCategoryIds) {
          await pool.query(
            'INSERT INTO news_categories (news_id, category_id, is_primary) VALUES ($1, $2, $3)',
            [id, categoryId, categoryId === parseInt(primary_category_id)]
          );
        }
      }
    }
    if (primary_category_id) {
      paramCount++;
      updateFields.push(`category_id = $${paramCount}`);
      updateValues.push(primary_category_id);
    }
    if (priority) {
      paramCount++;
      updateFields.push(`priority = $${paramCount}`);
      updateValues.push(priority);
    }
    if (featured !== undefined) {
      paramCount++;
      updateFields.push(`featured = $${paramCount}`);
      updateValues.push(featured);
      if (featured) {
        paramCount++;
        updateFields.push(`featured_until = $${paramCount}`);
        updateValues.push(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      }
    }
    if (tags !== undefined) {
      paramCount++;
      updateFields.push(`tags = $${paramCount}`);
      updateValues.push(tags);
    }
    if (meta_description !== undefined) {
      paramCount++;
      updateFields.push(`meta_description = $${paramCount}`);
      updateValues.push(meta_description);
    }
    if (seo_keywords !== undefined) {
      paramCount++;
      updateFields.push(`seo_keywords = $${paramCount}`);
      updateValues.push(seo_keywords);
    }
    if (youtube_url !== undefined) {
      const youtubeData = extractYouTubeData(youtube_url);
      paramCount++;
      updateFields.push(`youtube_url = $${paramCount}`);
      updateValues.push(youtube_url || null);
      paramCount++;
      updateFields.push(`youtube_id = $${paramCount}`);
      updateValues.push(youtubeData.id);
      paramCount++;
      updateFields.push(`youtube_thumbnail = $${paramCount}`);
      updateValues.push(youtubeData.thumbnail);
    }
    
    if (req.files && req.files.length > 0) {
      let imageUrls = [];
      let featuredImageUrl = null;
      
      req.files.forEach((file, index) => {
        const imageUrl = `/uploads/images/${file.filename}`;
        const metadataKey = `image_metadata_${index}`;
        let metadata = { caption: '', order: index, is_featured: false };
        
        if (req.body[metadataKey]) {
          try {
            metadata = JSON.parse(req.body[metadataKey]);
          } catch (e) {
            console.error('Failed to parse image metadata:', e);
          }
        }
        
        imageUrls.push({
          url: imageUrl,
          caption: metadata.caption || '',
          order: metadata.order || index,
          is_featured: metadata.is_featured || false
        });
        
        if (metadata.is_featured) {
          featuredImageUrl = imageUrl;
        }
      });
      
      if (!featuredImageUrl && imageUrls.length > 0) {
        featuredImageUrl = imageUrls[0].url;
        imageUrls[0].is_featured = true;
      }
      
      paramCount++;
      updateFields.push(`image_url = $${paramCount}`);
      updateValues.push(featuredImageUrl);
      paramCount++;
      updateFields.push(`images_data = $${paramCount}`);
      updateValues.push(JSON.stringify(imageUrls));
    }
    
    if (status) {
      paramCount++;
      updateFields.push(`status = $${paramCount}`);
      updateValues.push(status);
      if (status === 'published' && existingNews.rows[0].status !== 'published') {
        paramCount++;
        updateFields.push(`published_at = $${paramCount}`);
        updateValues.push(new Date());
      }
    }

    paramCount++;
    updateFields.push(`updated_at = $${paramCount}`);
    updateValues.push(new Date());
    paramCount++;
    updateValues.push(id);

    const updateQuery = `UPDATE news SET ${updateFields.join(', ')} WHERE news_id = $${paramCount} RETURNING *`;
    const result = await pool.query(updateQuery, updateValues);

    await pool.query(
      'INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [author_id, 'update_news', 'news', id, `Updated news: ${title || existingNews.rows[0].title}`,
       req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip]
    );

    return res.json({ success: true, message: 'News updated successfully', news: result.rows[0] });

  } catch (error) {
    console.error('Error updating news:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { getPool } = require('../../config/db');
    const pool = getPool();
    const { id } = req.params;
    const { author_id } = req.body;

    const existingNews = await pool.query('SELECT * FROM news WHERE news_id = $1', [id]);
    if (existingNews.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    await pool.query('DELETE FROM news_categories WHERE news_id = $1', [id]);
    await pool.query('DELETE FROM news WHERE news_id = $1', [id]);
    
    await pool.query(
      'INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [author_id, 'delete_news', 'news', id, `Deleted news: ${existingNews.rows[0].title}`,
       req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip]
    );

    return res.json({ success: true, message: 'News deleted successfully' });

  } catch (error) {
    console.error('Error deleting news:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;