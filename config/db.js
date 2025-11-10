const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

const createPool = () => {
  if (pool) return pool;
  
  const config = process.env.DATABASE_URL 
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 20,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'dailyvaibe',
        password: process.env.DB_PASS || 'dere84ELIJOOH',
        port: process.env.DB_PORT || 5432,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      };

  pool = new Pool(config);

  pool.on('connect', () => {
    console.log('✅ Database pool client connected');
  });

  pool.on('error', (err) => {
    console.error('❌ Database pool error:', err.message);
  });

  return pool;
};

const getPool = () => createPool();

const query = async (text, params) => {
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

const testConnection = async () => {
  let attempts = 5;
  
  while (attempts > 0) {
    try {
      const client = await getPool().connect();
      const result = await client.query('SELECT NOW() as current_time, current_database() as db_name');
      console.log('✅ DB connection OK');
      console.log('📊 Database:', result.rows[0].db_name);
      console.log('⏰ Server time:', result.rows[0].current_time);
      
      const tables = await client.query(`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`);
      console.log('📋 Tables found:', tables.rows[0].count);
      
      client.release();
      return true;
    } catch (error) {
      attempts--;
      console.error(`❌ Connection failed (${attempts} left):`, error.message);
      if (attempts === 0) return false;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return false;
};

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('🔻 Database pool closed');
  }
};

process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);

module.exports = { getPool, query, testConnection, closePool, pool: () => getPool() };
