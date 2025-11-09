// backend/routes/client/auth.js - HYBRID (Production & Development)
const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');

// ============================================
// ENVIRONMENT DETECTION
// ============================================
const isProduction = process.env.NODE_ENV === 'production';
const ENV_PREFIX = isProduction ? '🟢 [PROD]' : '🔵 [DEV]';

console.log(`${ENV_PREFIX} Client Auth Routes Loaded`);

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  sessionCookieName: 'vybeztribe_public_session',
  csrfHeaderName: 'X-CSRF-Token',
  maxAge: {
    anonymous: 30 * 24 * 60 * 60 * 1000, // 30 days
    authenticated: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  logging: {
    enabled: !isProduction, // Verbose logging in dev only
    errors: true, // Always log errors
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a unique client ID for anonymous users
 */
const generateClientId = () => {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate CSRF token
 */
const generateCsrfToken = () => {
  return `csrf_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
};

/**
 * Smart logging - only logs in dev or when explicitly enabled
 */
const log = (level, action, details = {}) => {
  if (level === 'error' && CONFIG.logging.errors) {
    console.error(`❌ ${ENV_PREFIX} [${action}]`, details);
  } else if (CONFIG.logging.enabled) {
    const icon = level === 'info' ? '📘' : level === 'success' ? '✅' : '⚠️';
    console.log(`${icon} ${ENV_PREFIX} [${action}]`, {
      timestamp: new Date().toISOString(),
      ...details
    });
  }
};

/**
 * Standard response builder
 */
const buildResponse = (res, statusCode, data) => {
  return res.status(statusCode).json({
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
    ...data
  });
};

/**
 * Error response builder
 */
const buildErrorResponse = (res, statusCode, message, error = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };

  // Only include error details in development
  if (!isProduction && error) {
    response.error = error instanceof Error ? error.message : String(error);
    response.stack = error instanceof Error ? error.stack : undefined;
  }

  return buildResponse(res, statusCode, response);
};

// ============================================
// POST /api/client/auth/anonymous
// Create anonymous session for unauthenticated users
// Works in: PRODUCTION & DEVELOPMENT
// ============================================
router.post('/anonymous', async (req, res) => {
  try {
    log('info', 'ANONYMOUS_REQUEST', {
      hasSession: !!req.session,
      hasClientId: !!req.session?.client_id,
      sessionId: req.sessionID?.substring(0, 10)
    });

    // Initialize session if it doesn't exist
    if (!req.session) {
      log('warn', 'NO_SESSION_OBJECT', { sessionID: req.sessionID });
      return buildErrorResponse(res, 500, 'Session initialization failed - session middleware not working');
    }

    // Check if session already exists
    if (req.session.client_id) {
      log('success', 'EXISTING_SESSION', {
        clientId: req.session.client_id,
        isAnonymous: req.session.is_anonymous
      });

      return buildResponse(res, 200, {
        success: true,
        isAuthenticated: false,
        isAnonymous: true,
        user: null,
        client_id: req.session.client_id,
        csrf_token: req.session.csrf_token,
        message: 'Existing anonymous session',
        session_age: req.session.created_at ? 
          Math.floor((Date.now() - new Date(req.session.created_at).getTime()) / 1000) : null
      });
    }

    // Create new anonymous session
    const clientId = generateClientId();
    const csrfToken = generateCsrfToken();

    req.session.client_id = clientId;
    req.session.csrf_token = csrfToken;
    req.session.is_anonymous = true;
    req.session.created_at = new Date().toISOString();

    // Save session explicitly with promise wrapper
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          log('error', 'SESSION_SAVE_FAILED', { error: err.message });
          reject(err);
        } else {
          resolve();
        }
      });
    });

    log('success', 'NEW_ANONYMOUS_SESSION', { 
      clientId, 
      sessionId: req.sessionID?.substring(0, 10) 
    });

    return buildResponse(res, 201, {
      success: true,
      isAuthenticated: false,
      isAnonymous: true,
      user: null,
      client_id: clientId,
      csrf_token: csrfToken,
      message: 'Anonymous session created successfully'
    });

  } catch (error) {
    log('error', 'ANONYMOUS_SESSION_ERROR', { error: error.message });
    return buildErrorResponse(res, 500, 'Internal server error', error);
  }
});

// ============================================
// GET /api/client/auth/verify
// Verify and return current session status
// Works in: PRODUCTION & DEVELOPMENT
// ============================================
router.get('/verify', async (req, res) => {
  try {
    log('info', 'VERIFY_REQUEST', {
      hasSession: !!req.session,
      hasClientId: !!req.session?.client_id,
      hasUserId: !!req.session?.user_id
    });

    // No session exists
    if (!req.session || !req.session.client_id) {
      log('warn', 'NO_SESSION_FOUND');
      
      return buildResponse(res, 401, {
        success: false,
        isAuthenticated: false,
        isAnonymous: true,
        user: null,
        client_id: null,
        csrf_token: null,
        message: 'No active session'
      });
    }

    // Check if authenticated user session
    if (req.session.user_id) {
      const pool = getPool();
      
      // Verify user still exists and is active
      const userQuery = `
        SELECT user_id, email, username, first_name, last_name, 
               profile_image, role, verified, active, created_at
        FROM users 
        WHERE user_id = $1 AND active = true
      `;
      
      const result = await pool.query(userQuery, [req.session.user_id]);
      
      if (result.rows.length === 0) {
        log('warn', 'USER_NOT_FOUND', { userId: req.session.user_id });
        
        // User no longer exists or is inactive, destroy session
        req.session.destroy();
        
        return buildResponse(res, 401, {
          success: false,
          isAuthenticated: false,
          isAnonymous: true,
          user: null,
          client_id: null,
          csrf_token: null,
          message: 'User account not found or inactive'
        });
      }

      const user = result.rows[0];

      log('success', 'AUTHENTICATED_SESSION', {
        userId: user.user_id,
        email: user.email
      });

      return buildResponse(res, 200, {
        success: true,
        isAuthenticated: true,
        isAnonymous: false,
        user: {
          user_id: user.user_id,
          email: user.email,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          profile_image: user.profile_image,
          role: user.role,
          verified: user.verified
        },
        client_id: req.session.client_id,
        csrf_token: req.session.csrf_token,
        message: 'Authenticated session verified'
      });
    }

    // Anonymous session
    log('success', 'ANONYMOUS_SESSION_VERIFIED', {
      clientId: req.session.client_id
    });

    return buildResponse(res, 200, {
      success: true,
      isAuthenticated: false,
      isAnonymous: true,
      user: null,
      client_id: req.session.client_id,
      csrf_token: req.session.csrf_token,
      message: 'Anonymous session verified'
    });
  } catch (error) {
    log('error', 'VERIFY_ERROR', { error: error.message });
    return buildErrorResponse(res, 500, 'Internal server error', error);
  }
});

// ============================================
// POST /api/client/auth/logout
// Logout and destroy session
// Works in: PRODUCTION & DEVELOPMENT
// ============================================
router.post('/logout', async (req, res) => {
  try {
    if (!req.session) {
      log('info', 'NO_SESSION_TO_LOGOUT');
      
      return buildResponse(res, 200, {
        success: true,
        message: 'No active session to logout'
      });
    }

    const sessionId = req.sessionID;
    const wasAuthenticated = !!req.session.user_id;
    
    log('info', 'LOGOUT_REQUEST', { 
      sessionId: sessionId?.substring(0, 10),
      wasAuthenticated 
    });

    req.session.destroy((err) => {
      if (err) {
        log('error', 'LOGOUT_FAILED', { error: err.message });
        return buildErrorResponse(res, 500, 'Failed to logout', err);
      }

      // Clear session cookie
      res.clearCookie(CONFIG.sessionCookieName, {
        path: '/',
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax'
      });

      log('success', 'LOGOUT_SUCCESS', { sessionId: sessionId?.substring(0, 10) });

      return buildResponse(res, 200, {
        success: true,
        message: 'Logged out successfully'
      });
    });
  } catch (error) {
    log('error', 'LOGOUT_ERROR', { error: error.message });
    return buildErrorResponse(res, 500, 'Internal server error', error);
  }
});

// ============================================
// POST /api/client/auth/refresh
// Refresh session and extend expiry
// Works in: PRODUCTION & DEVELOPMENT
// ============================================
router.post('/refresh', async (req, res) => {
  try {
    log('info', 'REFRESH_REQUEST', {
      hasSession: !!req.session,
      hasClientId: !!req.session?.client_id
    });

    if (!req.session || !req.session.client_id) {
      log('warn', 'NO_SESSION_TO_REFRESH');
      
      return buildResponse(res, 401, {
        success: false,
        message: 'No active session to refresh'
      });
    }

    // Touch session to update expiry
    req.session.touch();

    // Generate new CSRF token
    const newCsrfToken = generateCsrfToken();
    req.session.csrf_token = newCsrfToken;
    req.session.last_refreshed = new Date().toISOString();

    req.session.save((err) => {
      if (err) {
        log('error', 'REFRESH_FAILED', { error: err.message });
        return buildErrorResponse(res, 500, 'Failed to refresh session', err);
      }

      log('success', 'SESSION_REFRESHED', {
        clientId: req.session.client_id,
        expiresAt: req.session.cookie.expires
      });

      return buildResponse(res, 200, {
        success: true,
        message: 'Session refreshed successfully',
        csrf_token: newCsrfToken,
        expires_at: req.session.cookie.expires,
        max_age: req.session.cookie.maxAge
      });
    });
  } catch (error) {
    log('error', 'REFRESH_ERROR', { error: error.message });
    return buildErrorResponse(res, 500, 'Internal server error', error);
  }
});

// ============================================
// GET /api/client/auth/session-info
// Get detailed session information
// Works in: DEVELOPMENT ONLY (disabled in production)
// ============================================
router.get('/session-info', (req, res) => {
  // Only allow in development
  if (isProduction) {
    log('warn', 'SESSION_INFO_BLOCKED_PROD');
    
    return buildResponse(res, 403, {
      success: false,
      message: 'Endpoint not available in production'
    });
  }

  log('info', 'SESSION_INFO_REQUEST');

  return buildResponse(res, 200, {
    success: true,
    session: {
      id: req.sessionID,
      cookie: {
        originalMaxAge: req.session?.cookie.originalMaxAge,
        expires: req.session?.cookie.expires,
        secure: req.session?.cookie.secure,
        httpOnly: req.session?.cookie.httpOnly,
        sameSite: req.session?.cookie.sameSite,
        path: req.session?.cookie.path
      },
      data: {
        client_id: req.session?.client_id,
        user_id: req.session?.user_id,
        is_anonymous: req.session?.is_anonymous,
        created_at: req.session?.created_at,
        last_refreshed: req.session?.last_refreshed,
        has_csrf: !!req.session?.csrf_token
      }
    },
    environment: {
      isProduction,
      nodeEnv: process.env.NODE_ENV,
      trustProxy: req.app.get('trust proxy')
    }
  });
});

// ============================================
// GET /api/client/auth/health
// Health check endpoint
// Works in: PRODUCTION & DEVELOPMENT
// ============================================
router.get('/health', (req, res) => {
  return buildResponse(res, 200, {
    success: true,
    service: 'Client Auth Routes',
    status: 'healthy',
    endpoints: {
      anonymous: 'POST /api/client/auth/anonymous',
      verify: 'GET /api/client/auth/verify',
      logout: 'POST /api/client/auth/logout',
      refresh: 'POST /api/client/auth/refresh',
      sessionInfo: `GET /api/client/auth/session-info ${isProduction ? '(disabled)' : '(enabled)'}`,
      health: 'GET /api/client/auth/health'
    }
  });
});

// ============================================
// 404 HANDLER
// ============================================
router.use('*', (req, res) => {
  log('warn', '404_NOT_FOUND', { path: req.originalUrl });
  
  return buildResponse(res, 404, {
    success: false,
    message: 'Client auth endpoint not found',
    path: req.originalUrl,
    available_endpoints: [
      'POST /api/client/auth/anonymous',
      'GET /api/client/auth/verify',
      'POST /api/client/auth/logout',
      'POST /api/client/auth/refresh',
      'GET /api/client/auth/session-info (dev only)',
      'GET /api/client/auth/health'
    ]
  });
});

console.log(`${ENV_PREFIX} Client Auth Routes Ready ✅`);

module.exports = router;