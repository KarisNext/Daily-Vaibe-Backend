// backend/routes/admin/news.js
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per image
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed'), false);
    }
  }
});

// Utility Functions
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

// CREATE NEWS WITH MULTI-IMAGE SUPPORT
router.post('/', upload.array('images', 5), async (req, res) => {
  const client = await req.app.locals.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      title, content, excerpt, category_id, priority = 'medium',
      featured = false, tags = '', meta_description = '',
      seo_keywords = '', youtube_url = '', status = 'draft', author_id
    } = req.body;

    if (!title || !content || !author_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'Title, content, and author are required'
      });
    }

    if (!req.files || req.files.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'At least one image is required'
      });
    }

    const slug = generateSlug(title);
    const readingTime = calculateReadingTime(content);
    const youtubeData = extractYouTubeData(youtube_url);
    const { processedContent, rawContent } = processContentFormatting(content);
    const quotes = extractQuotes(content);

    // Check for existing slug
    const existingSlug = await client.query('SELECT slug FROM news WHERE slug = $1', [slug]);
    let finalSlug = slug;
    if (existingSlug.rows.length > 0) {
      finalSlug = `${slug}-${Date.now()}`;
    }

    // Insert news article
    const newsQuery = `
      INSERT INTO news (
        title, content, processed_content, excerpt, slug, category_id, featured, featured_until,
        image_url, status, tags, meta_description, seo_keywords, reading_time,
        author_id, youtube_url, youtube_id, youtube_thumbnail, priority, published_at,
        quotes_data
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *
    `;

    const featuredUntil = featured ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null;
    const publishedAt = status === 'published' ? new Date() : null;

    // The main image_url will be the featured image
    const featuredImage = req.files.find((file, index) => {
      const metadata = req.body[`image_metadata_${index}`];
      return metadata && JSON.parse(metadata).is_featured;
    }) || req.files[0];

    const newsResult = await client.query(newsQuery, [
      title, rawContent, processedContent,
      excerpt || title.substring(0, 200) + '...',
      finalSlug, category_id || null, featured, featuredUntil,
      `/uploads/images/${featuredImage.filename}`, status, tags, meta_description, seo_keywords,
      readingTime, author_id, youtube_url || null,
      youtubeData.id, youtubeData.thumbnail, priority,
      publishedAt, JSON.stringify(quotes)
    ]);

    const newsId = newsResult.rows[0].news_id;

    // Insert all images into news_images table
    const imageInsertPromises = req.files.map((file, index) => {
      const metadataStr = req.body[`image_metadata_${index}`];
      const metadata = metadataStr ? JSON.parse(metadataStr) : {};
      
      return client.query(`
        INSERT INTO news_images (news_id, image_url, image_caption, image_order, is_featured, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        newsId,
        `/uploads/images/${file.filename}`,
        metadata.caption || '',
        metadata.order || index,
        metadata.is_featured || false,
        JSON.stringify({ 
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype
        })
      ]);
    });

    await Promise.all(imageInsertPromises);

    // Log activity
    await client.query(
      'INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [author_id, status === 'published' ? 'publish_news' : 'create_news', 'news',
       newsId, `${status === 'published' ? 'Published' : 'Created'} news: ${title} with ${req.files.length} images`,
       req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `News ${status} successfully with ${req.files.length} images`,
      news: newsResult.rows[0],
      images: req.files.length
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating news:', error);
    
    // Clean up uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        try { 
          await fs.unlink(file.path); 
        } catch (e) { 
          console.error('Error removing file:', e); 
        }
      }
    }
    
    if (error.code === '23505') {
      return res.status(400).json({ 
        success: false, 
        message: 'A post with this title already exists' 
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// GET NEWS BY ID (with images)
router.get('/:id', async (req, res) => {
  try {
    const { getPool } = require('../../config/db');
    const pool = getPool();
    const { id } = req.params;

    // Get news article
    const newsQuery = `
      SELECT 
        n.*,
        c.name as category_name,
        c.slug as category_slug,
        COALESCE(a.first_name, 'Unknown') as first_name,
        COALESCE(a.last_name, 'Author') as last_name,
        a.email as author_email
      FROM news n
      LEFT JOIN categories c ON n.category_id = c.category_id
      LEFT JOIN admins a ON n.author_id = a.admin_id
      WHERE n.news_id = $1
    `;

    const newsResult = await pool.query(newsQuery, [id]);

    if (newsResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    // Get all images for this news article
    const imagesQuery = `
      SELECT image_id, image_url, image_caption, image_order, is_featured
      FROM news_images
      WHERE news_id = $1
      ORDER BY image_order ASC
    `;

    const imagesResult = await pool.query(imagesQuery, [id]);

    return res.json({ 
      success: true, 
      news: {
        ...newsResult.rows[0],
        images: imagesResult.rows
      }
    });

  } catch (error) {
    console.error('Error fetching news by ID:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
});

// GET ALL NEWS (with pagination)
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
      whereConditions.push(`n.category_id = $${paramCount}`);
      queryParams.push(category_id);
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
        (SELECT COUNT(*) FROM news_images WHERE news_id = n.news_id) as image_count
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

// UPDATE NEWS
router.put('/:id', upload.array('images', 5), async (req, res) => {
  const client = await req.app.locals.pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { title, content, excerpt, category_id, priority, featured, tags,
            meta_description, seo_keywords, youtube_url, status, author_id,
            remove_image_ids } = req.body;

    const existingNews = await client.query('SELECT * FROM news WHERE news_id = $1', [id]);
    if (existingNews.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    let updateFields = [];
    let updateValues = [];
    let paramCount = 0;

    // ... (similar update logic as before)

    // Handle image deletions
    if (remove_image_ids) {
      const idsToRemove = JSON.parse(remove_image_ids);
      if (idsToRemove.length > 0) {
        await client.query(
          'DELETE FROM news_images WHERE image_id = ANY($1) AND news_id = $2',
          [idsToRemove, id]
        );
      }
    }

    // Add new images
    if (req.files && req.files.length > 0) {
      const imageInsertPromises = req.files.map((file, index) => {
        const metadataStr = req.body[`image_metadata_${index}`];
        const metadata = metadataStr ? JSON.parse(metadataStr) : {};
        
        return client.query(`
          INSERT INTO news_images (news_id, image_url, image_caption, image_order, is_featured, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          id,
          `/uploads/images/${file.filename}`,
          metadata.caption || '',
          metadata.order || index,
          metadata.is_featured || false,
          JSON.stringify({ 
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype
          })
        ]);
      });

      await Promise.all(imageInsertPromises);
    }

    await client.query('COMMIT');

    return res.json({ success: true, message: 'News updated successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating news:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// DELETE NEWS
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

    // Get all images to delete files
    const images = await pool.query('SELECT image_url FROM news_images WHERE news_id = $1', [id]);
    
    // Delete news (will cascade to news_images due to foreign key)
    await pool.query('DELETE FROM news WHERE news_id = $1', [id]);
    
    // Delete physical image files
    for (const img of images.rows) {
      try {
        const imagePath = path.join(__dirname, '../../', img.image_url);
        await fs.unlink(imagePath);
      } catch (e) {
        console.error('Error deleting image file:', e);
      }
    }
    
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