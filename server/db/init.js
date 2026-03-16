const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function runMigrations() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  // Split by semicolon may be naive but ok for initial schema
  const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Migrations applied');
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration error', err);
      process.exit(1);
    });
}

module.exports = { runMigrations };
