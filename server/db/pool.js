const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL || process.env.PG_CONNECTION || 'postgresql://postgres:postgres@localhost:5432/project';

if (typeof connectionString !== 'string') {
  try { connectionString = String(connectionString); } catch (e) { /* ignore */ }
}

function maskConnectionString(cs) {
  if (!cs || typeof cs !== 'string') return String(cs);
  try {
    return cs.replace(/:(.*?)@/, ':*****@');
  } catch (e) { return cs.slice(0, 40) + '...'; }
}

console.log('DB connectionString type=', typeof connectionString, 'sample=', maskConnectionString(connectionString).slice(0, 120));

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('render.com') || connectionString.includes('ondigitalocean.com')
    ? { rejectUnauthorized: false }
    : undefined
});

// Test DB connection early and give a clearer diagnostic if auth/connection fails
(async function testConnection() {
  try {
    const client = await pool.connect();
    client.release();
    console.log('✅ DB connection OK');
  } catch (err) {
    console.warn('⚠️ DB connection test failed:', err.message || err);
    console.warn('Check your DATABASE_URL or PG_CONNECTION environment variable. Sample (masked):', maskConnectionString(connectionString));
  }
})();

module.exports = { pool };

// Debug: print presence and types of common PG env vars (do NOT print values)
try {
  const envInfo = {
    DATABASE_URL: typeof process.env.DATABASE_URL,
    PG_CONNECTION: typeof process.env.PG_CONNECTION,
    PGPASSWORD: process.env.PGPASSWORD === undefined ? 'undefined' : typeof process.env.PGPASSWORD,
    PGUSER: process.env.PGUSER === undefined ? 'undefined' : typeof process.env.PGUSER,
    PGHOST: process.env.PGHOST === undefined ? 'undefined' : typeof process.env.PGHOST,
  };
  console.log('DB env types:', envInfo);
} catch (e) {
  /* ignore */
}
