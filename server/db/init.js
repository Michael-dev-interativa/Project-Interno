const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function runMigrations() {
  const sqlPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const statements = [];
  let current = '';
  let dollarTag = null;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  const pushStatement = () => {
    const trimmed = current.trim();
    if (trimmed) statements.push(trimmed);
    current = '';
  };

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1] || '';

    if (dollarTag) {
      current += ch;
      if (ch === '$' && sql.slice(i - dollarTag.length + 1, i + 1) === dollarTag) {
        dollarTag = null;
      }
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && sql[i - 1] !== '\\') {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '"' && sql[i - 1] !== '\\') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (ch === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      continue;
    }

    if (ch === ';') {
      current += ch;
      if (!dollarTag && !inSingleQuote && !inDoubleQuote) {
        pushStatement();
      }
      continue;
    }

    current += ch;
  }

  if (current.trim()) pushStatement();

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
