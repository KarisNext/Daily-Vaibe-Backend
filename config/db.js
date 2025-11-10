const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let isConnecting = false;

const createPool = () => {
  if (pool) return pool;
  if (isConnecting) {
    while (isConnecting) {}
    return pool;
  }
  
  isConnecting = true;
  
  try {
    if (process.env.DATABASE_URL) {
      console.log('🔗 Using Render/PostgreSQL connection string...');
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
      });
    } else {
      console.log('🧩 Using Local PostgreSQL configuration...');
      pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'vybeztribe',
        password: process.env.DB_PASS || 'dere84ELIJOOH',
        port: process.env.DB_PORT || 5432,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }

    pool.on('connect', () => {
      console.log('✅ Database pool client connected');
    });

    pool.on('error', (err) => {
      console.error('❌ Database pool error:', err.message);
      if (err.message.includes('terminated') || err.message.includes('ECONNREFUSED')) {
        console.error('🔄 Attempting to recreate pool...');
        pool = null;
        isConnecting = false;
      }
    });

    pool.on('remove', () => {
      console.log('🔓 Connection removed from pool');
    });

    isConnecting = false;
    return pool;
  } catch (error) {
    console.error('❌ Failed to create pool:', error.message);
    isConnecting = false;
    throw error;
  }
};

const getPool = () => {
  return createPool();
};

const query = async (text, params) => {
  const poolInstance = getPool();
  let retries = 3;
  
  while (retries > 0) {
    try {
      return await poolInstance.query(text, params);
    } catch (error) {
      retries--;
      if (retries === 0) throw error;
      console.error(`Query failed, retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

const testConnection = async () => {
  let retries = 5;
  
  while (retries > 0) {
    try {
      const poolInstance = getPool();
      const client = await poolInstance.connect();
      const result = await client.query('SELECT NOW() as current_time, version() as db_version');
      client.release();
      console.log('✅ DB connection OK:', result.rows[0].current_time);
      return true;
    } catch (error) {
      retries--;
      console.error(`❌ DB connection attempt failed (${retries} retries left):`, error.message);
      
      if (retries === 0) return false;
      
      pool = null;
      isConnecting = false;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return false;
};

const closePool = async () => {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      isConnecting = false;
      console.log('🔻 Database pool closed.');
    } catch (error) {
      console.error('❌ Error closing pool:', error.message);
    }
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
