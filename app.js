const express = require('express');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
require('dotenv').config();

const { getPool, testConnection } = require('./config/db');
const CleanupScheduler = require('./services/cleanupScheduler');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

console.log('\n🚀 Initializing VybesTribe Backend...');
console.log('Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');

testConnection().then(connected => {
  if (!connected) {
    console.error('❌ Failed to connect to database');
    process.exit(1);
  }
  console.log('✅ Database connected');
  
  CleanupScheduler.start(6).then(result => {
    if (result.success) {
      console.log('✅ Cleanup scheduler started');
    } else {
      console.error('❌ Failed to start cleanup scheduler:', result.error);
    }
  });
  
}).catch(err => {
  console.error('❌ Database connection error:', err);
  process.exit(1);
});

const allowedOrigins = isProduction 
  ? ['https://vybeztribe.com', 'https://www.vybeztribe.com', 'https://vybeztribe-frontend.onrender.com', process.env.FRONTEND_URL].filter(Boolean)
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://localhost:3001'];

console.log('✅ Allowed Origins:', allowedOrigins);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else if (!isProduction) {
      console.log('⚠️ DEV MODE: Allowing origin:', origin);
      callback(null, true);
    } else {
      console.error('❌ CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
}));

if (isProduction) {
  app.set('trust proxy', 1);
  console.log('✅ Trust proxy enabled');
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const adminSessionConfig = {
  store: new pgSession({
    pool: getPool(),
    tableName: 'admin_session_store',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'vybeztribe-admin-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  },
  name: 'vybeztribe_admin_session',
  rolling: true,
  proxy: isProduction
};

const publicSessionConfig = {
  store: new pgSession({
    pool: getPool(),
    tableName: 'public_session_store',
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'vybeztribe-public-secret-2024',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/'
  },
  name: 'vybeztribe_public_session',
  rolling: true,
  proxy: isProduction
};

// Session middleware
const adminSessionMiddleware = session(adminSessionConfig);
const publicSessionMiddleware = session(publicSessionConfig);
const geoMiddleware = require('./middleware/geo');

console.log('✅ Session middleware configured');

// Import routes
const newsRoutes = require('./routes/api/news');
const articlesRoutes = require('./routes/api/articles');
const categoriesRoutes = require('./routes/api/categories');
const footerCategoriesRoutes = require('./routes/api/footer-categories');
const categoryGroupsRouter = require('./routes/api/category-groups');
const authRoutes = require('./routes/admin/auth');
const usersRoutes = require('./routes/admin/user');
const adminRoutes = require('./routes/admin/admin');
const userProfileRoutes = require('./routes/admin/userprofile');
const retrieveRoutes = require('./routes/retrieve/retrieval');
const clientAuthRoutes = require('./routes/client/auth');
const clientRoutes = require('./routes/client/client');
const adsRoutes = require('./routes/api/ads');
const interactionsRoutes = require('./routes/api/interactions');
const geoRoutes = require('./routes/api/geo');
const systemServicesRoutes = require('./routes/admin/systemServices');
const adminGeoRoutes = require('./routes/admin/geo');

// Apply public session middleware and geo middleware to public routes
app.use(publicSessionMiddleware);
app.use(geoMiddleware);

// Admin routes (with admin session middleware)
app.use('/api/admin/auth', adminSessionMiddleware, authRoutes);
app.use('/api/admin/users', adminSessionMiddleware, usersRoutes);
app.use('/api/admin', adminSessionMiddleware, adminRoutes);
app.use('/api/admin/userprofile', adminSessionMiddleware, userProfileRoutes);
app.use('/api/retrieve', adminSessionMiddleware, retrieveRoutes);
app.use('/api/admin/geo', adminSessionMiddleware, adminGeoRoutes);
app.use('/api/admin/system-services', adminSessionMiddleware, systemServicesRoutes);

// Public API routes
app.use('/api/news', newsRoutes);
app.use('/api/articles', articlesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/category-groups', categoryGroupsRouter);
app.use('/api/footer-categories', footerCategoriesRoutes);
app.use('/api/client/auth', clientAuthRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/geo', geoRoutes);

console.log('✅ All routes configured');

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();
    const schedulerStatus = CleanupScheduler.getStatus();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'Connected' : 'Disconnected',
      cleanupScheduler: {
        running: schedulerStatus.isRunning,
        processing: schedulerStatus.isProcessing,
        nextRun: schedulerStatus.nextRun
      },
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 5000
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'VybesTribe API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    cleanupScheduler: CleanupScheduler.getStatus()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Global error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: !isProduction ? err.message : undefined
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  CleanupScheduler.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  CleanupScheduler.stop();
  process.exit(0);
});

module.exports = app;