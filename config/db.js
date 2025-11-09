// File: backend/config/db.js
const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

const createPool = () => {
  if (!pool) {
    // Prefer DATABASE_URL if available (Render/Postgre hosted)
    if (process.env.DATABASE_URL) {
      console.log('🔗 Using Render/PostgreSQL connection string...');
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false, // Required by Render's managed PostgreSQL
        },
      });
    } else {
      console.log('🧩 Using Local PostgreSQL configuration...');
      pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'vybeztribe',
        password: process.env.DB_PASS || 'dere84ELIJOOH',
        port: process.env.DB_PORT || 5432,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 20,
      });
    }

    pool.on('connect', () => console.log('✅ Database connected.'));
    pool.on('error', (err) => console.error('❌ Database pool error:', err.message));
    pool.on('remove', () => console.log('🔒 Connection removed from pool'));
  }

  return pool;
};

const getPool = () => createPool();

const query = async (text, params) => {
  const poolInstance = getPool();
  return poolInstance.query(text, params);
};

const testConnection = async () => {
  try {
    const poolInstance = getPool();
    const client = await poolInstance.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    client.release();
    console.log('✅ DB connection OK:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ DB connection failed:', error.message);
    return false;
  }
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔻 Database pool closed.');
  }
};

process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

module.exports = {
  getPool,
  query,
  testConnection,
  closePool,
  pool: () => getPool(),
};