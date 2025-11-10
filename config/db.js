const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

const createPool = () => {
  if (pool) return pool;
  if (isConnecting) {
    const maxWait = 30;
    let waited = 0;
    while (isConnecting && waited < maxWait) {
      waited++;
      require('child_process').execSync('sleep 0.1');
    }
    return pool;
  }
  
  isConnecting = true;
  
  try {
    const connectionConfig = process.env.DATABASE_URL 
      ? {
          connectionString: process.env.DATABASE_URL,
          ssl: {
            rejectUnauthorized: false,
          },
          max: 25,
          min: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 15000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
          statement_timeout: 30000,
          query_timeout: 30000,
        }
      : {
          user: process.env.DB_USER || 'postgres',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'katadabazekavybez',
          password: process.env.DB_PASS || 'dere84ELIJOOH',
          port: process.env.DB_PORT || 5432,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        };

    if (process.env.DATABASE_URL) {
      console.log('🔗 Using Render/PostgreSQL connection string...');
    } else {
      console.log('🧩 Using Local PostgreSQL configuration...');
    }

    pool = new Pool(connectionConfig);

    pool.on('connect', (client) => {
      console.log('✅ Database pool client connected');
      reconnectAttempts = 0;
      client.query('SET statement_timeout = 30000');
      client.query('SET idle_in_transaction_session_timeout = 60000');
    });

    pool.on('error', async (err, client) => {
      console.error('❌ Database pool error:', err.message);
      
      if (err.message.includes('terminated') || 
          err.message.includes('ECONNREFUSED') ||
          err.message.includes('ENOTFOUND') ||
          err.message.includes('Connection terminated unexpectedly')) {
        
        reconnectAttempts++;
        
        if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
          console.error(`🔄 Attempting to recreate pool... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          
          if (pool) {
            try {
              await pool.end();
            } catch (endError) {
              console.error('Error ending pool:', endError.message);
            }
          }
          
          pool = null;
          isConnecting = false;
          
          setTimeout(() => {
            createPool();
          }, Math.min(1000 * reconnectAttempts, 10000));
        } else {
          console.error('💥 Max reconnection attempts reached. Manual intervention required.');
        }
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
      const result = await poolInstance.query(text, params);
      return result;
    } catch (error) {
      retries--;
      console.error(`Query failed: ${error.message} (${retries} retries left)`);
      
      if (retries === 0) throw error;
      
      if (error.message.includes('Connection terminated') || 
          error.message.includes('ECONNREFUSED')) {
        pool = null;
        isConnecting = false;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
};

const testConnection = async () => {
  let retries = 8;
  
  while (retries > 0) {
    try {
      const poolInstance = getPool();
      const client = await poolInstance.connect();
      
      const result = await client.query('SELECT NOW() as current_time, current_database() as db_name, version() as db_version');
      
      console.log('✅ DB connection OK');
      console.log('📊 Database:', result.rows[0].db_name);
      console.log('⏰ Server time:', result.rows[0].current_time);
      
      const tableCheck = await client.query(`
        SELECT COUNT(*) as table_count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log('📋 Tables found:', tableCheck.rows[0].table_count);
      
      client.release();
      return true;
    } catch (error) {
      retries--;
      console.error(`❌ DB connection attempt failed (${retries} retries left):`, error.message);
      
      if (retries === 0) {
        console.error('💥 All connection attempts failed');
        return false;
      }
      
      pool = null;
      isConnecting = false;
      reconnectAttempts = 0;
      
      const waitTime = Math.min(3000 * (8 - retries), 15000);
      console.log(`⏳ Waiting ${waitTime/1000}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
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
      reconnectAttempts = 0;
      console.log('🔻 Database pool closed');
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
