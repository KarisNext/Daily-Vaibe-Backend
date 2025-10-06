const { Client } = require('pg');
const https = require('https');

const connectionString = process.env.DATABASE_URL || 'postgresql://vybeztribe_user:TMrDMiE7XIZxRcwLqPNpcHasOwWzB4za@dpg-d3h9ciogjchc73ab2uc0-a.oregon-postgres.render.com/vybeztribe';

async function importDatabase() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to Render PostgreSQL database...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Downloading SQL file from GitHub...');
    const sqlContent = await downloadFile('https://raw.githubusercontent.com/KarisNext/VybezTribe-backend/main/vybeztribe_complete.sql');
    
    console.log('SQL file downloaded. Starting import...');
    console.log(`File size: ${sqlContent.length} characters`);
    
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt) {
        try {
          console.log(`[${i + 1}/${statements.length}] Executing...`);
          await client.query(stmt);
        } catch (err) {
          console.warn(`Warning on statement ${i + 1}: ${err.message}`);
        }
      }
    }
    
    console.log('Database import completed successfully!');
    
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\nImported tables:');
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('Error importing database:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        console.log('Download complete');
        resolve(data);
      });
    }).on('error', (err) => {
      reject(new Error(`Download failed: ${err.message}`));
    });
  });
}

importDatabase();