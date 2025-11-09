// backend/routes/admin/chat.js
const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

/**
 * GET /api/admin/chat/messages
 * Get chat messages (either broadcast or between two admins)
 */
router.get('/messages', async (req, res) => {
  try {
    const adminId = req.session?.admin?.admin_id;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const { receiver_id } = req.query;
    const pool = getPool();

    let query;
    let params;

    if (receiver_id) {
      // Get conversation between current admin and specific receiver
      query = `
        SELECT 
          message_id,
          sender_id,
          sender_name,
          receiver_id,
          message_text,
          is_broadcast,
          is_read,
          created_at
        FROM admin_chat_messages
        WHERE (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1)
        ORDER BY created_at ASC
        LIMIT 100
      `;
      params = [adminId, receiver_id];
    } else {
      // Get all messages (broadcast and direct) for current admin
      query = `
        SELECT 
          message_id,
          sender_id,
          sender_name,
          receiver_id,
          message_text,
          is_broadcast,
          is_read,
          created_at
        FROM admin_chat_messages
        WHERE is_broadcast = TRUE
           OR receiver_id = $1
           OR sender_id = $1
        ORDER BY created_at ASC
        LIMIT 100
      `;
      params = [adminId];
    }

    const result = await pool.query(query, params);

    // Mark messages as read
    if (receiver_id) {
      await pool.query(`
        UPDATE admin_chat_messages
        SET is_read = TRUE
        WHERE receiver_id = $1 AND sender_id = $2 AND is_read = FALSE
      `, [adminId, receiver_id]);
    }

    return res.json({
      success: true,
      messages: result.rows
    });

  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/chat/messages
 * Send a new chat message
 */
router.post('/messages', async (req, res) => {
  try {
    const adminId = req.session?.admin?.admin_id;
    const adminName = req.session?.admin 
      ? `${req.session.admin.first_name} ${req.session.admin.last_name}`
      : 'Unknown Admin';

    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const { receiver_id, message_text, is_broadcast } = req.body;

    if (!message_text?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Message text is required'
      });
    }

    const pool = getPool();

    // Insert the message
    const result = await pool.query(`
      INSERT INTO admin_chat_messages (
        sender_id,
        sender_name,
        receiver_id,
        message_text,
        is_broadcast,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `, [
      adminId,
      adminName,
      receiver_id || null,
      message_text.trim(),
      is_broadcast || false
    ]);

    return res.json({
      success: true,
      message: result.rows[0]
    });

  } catch (error) {
    console.error('Error sending chat message:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send message',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/chat/online
 * Get list of online admins
 */
router.get('/online', async (req, res) => {
  try {
    const pool = getPool();

    // Get admins who were active in the last 5 minutes
    const result = await pool.query(`
      SELECT 
        a.admin_id,
        CONCAT(a.first_name, ' ', a.last_name) as name,
        a.email,
        a.role,
        COALESCE(aos.last_active, a.last_login) as last_active,
        SUBSTRING(a.first_name, 1, 1) || SUBSTRING(a.last_name, 1, 1) as avatar
      FROM admins a
      LEFT JOIN admin_online_status aos ON a.admin_id = aos.admin_id
      WHERE a.status = 'active'
        AND (aos.last_active > NOW() - INTERVAL '5 minutes' 
             OR (aos.last_active IS NULL AND a.last_login > NOW() - INTERVAL '5 minutes'))
      ORDER BY aos.last_active DESC NULLS LAST
    `);

    return res.json({
      success: true,
      admins: result.rows
    });

  } catch (error) {
    console.error('Error fetching online admins:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch online admins',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/chat/heartbeat
 * Update admin's last active timestamp
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const adminId = req.session?.admin?.admin_id;
    
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const pool = getPool();

    // Upsert online status
    await pool.query(`
      INSERT INTO admin_online_status (admin_id, last_active, is_online, updated_at)
      VALUES ($1, NOW(), TRUE, NOW())
      ON CONFLICT (admin_id)
      DO UPDATE SET
        last_active = NOW(),
        is_online = TRUE,
        updated_at = NOW()
    `, [adminId]);

    return res.json({
      success: true,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error updating heartbeat:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update heartbeat',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/chat/unread-count
 * Get count of unread messages for current admin
 */
router.get('/unread-count', async (req, res) => {
  try {
    const adminId = req.session?.admin?.admin_id;
    
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const pool = getPool();

    const result = await pool.query(`
      SELECT COUNT(*) as unread_count
      FROM admin_chat_messages
      WHERE receiver_id = $1 AND is_read = FALSE
    `, [adminId]);

    return res.json({
      success: true,
      unread_count: parseInt(result.rows[0].unread_count) || 0
    });

  } catch (error) {
    console.error('Error fetching unread count:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/chat/mark-read
 * Mark messages as read
 */
router.post('/mark-read', async (req, res) => {
  try {
    const adminId = req.session?.admin?.admin_id;
    
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const { sender_id } = req.body;
    const pool = getPool();

    await pool.query(`
      UPDATE admin_chat_messages
      SET is_read = TRUE
      WHERE receiver_id = $1 
        AND sender_id = $2 
        AND is_read = FALSE
    `, [adminId, sender_id]);

    return res.json({
      success: true,
      message: 'Messages marked as read'
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mark messages as read',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/chat/messages/:message_id
 * Delete a specific message (only own messages)
 */
router.delete('/messages/:message_id', async (req, res) => {
  try {
    const adminId = req.session?.admin?.admin_id;
    
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
    }

    const { message_id } = req.params;
    const pool = getPool();

    const result = await pool.query(`
      DELETE FROM admin_chat_messages
      WHERE message_id = $1 AND sender_id = $2
      RETURNING message_id
    `, [message_id, adminId]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found or unauthorized'
      });
    }

    return res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete message',
      message: error.message
    });
  }
});

module.exports = router;