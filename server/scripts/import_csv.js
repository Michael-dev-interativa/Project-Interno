// Usage: node import_csv.js <csv_path> <table> <columns(comma-separated)>
// Example: node import_csv.js C:/tmp/disciplinas.csv disciplinas nome,cor,icone

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool: sharedPool } = require('../db/pool');

const BASE_ALIAS_MAP = {
  atividade: 'titulo',
  created_date: 'created_at',
  updated_date: 'updated_at',
  disciplina: 'disciplina_id',
  responsavel_email: 'responsavel_email',
  id_atividade: 'id'
};

async function runImport({ csvPath, table, columns, aliasMap = {}, logger = console } = {}) {
  if (!csvPath || !table || !columns) {
    throw new Error('csvPath, table, and columns are required to run the import');
  }

  const absPath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`CSV file not found: ${absPath}`);
  }

  const columnList = Array.isArray(columns)
    ? columns.map((c) => String(c || '').trim()).filter(Boolean)
    : String(columns || '').split(',').map((c) => c.trim()).filter(Boolean);

  if (!columnList.length) {
    throw new Error('No columns provided for import');
  }

  const mergedAliasMap = { ...BASE_ALIAS_MAP, ...aliasMap };
  const mappedCols = columnList.map((column) => mergedAliasMap[column] || column);

  const pool = sharedPool;
  let client;

  try {
    client = await pool.connect();
  } catch (err) {
    throw new Error(`Failed to connect to database: ${err.message || err}`);
  }

  if (typeof parse !== 'function') {
    client.release();
    throw new Error('CSV parser is unavailable; ensure "csv-parse" is installed.');
  }

  const parser = fs.createReadStream(absPath).pipe(parse({ columns: true, trim: true }));

  try {
    await client.query('BEGIN');

    const colRes = await client.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1',
      [table]
    );
    const tableCols = new Set(colRes.rows.map((r) => r.column_name.toLowerCase()));
    const colTypes = new Map(colRes.rows.map((r) => [r.column_name.toLowerCase(), r.data_type]));

    const fieldMappings = [];
    const seenDbCols = new Set();
    for (let i = 0; i < columnList.length; i++) {
      const originalCol = columnList[i];
      const dbCol = mappedCols[i];
      const dbColLc = String(dbCol || '').toLowerCase();
      if (dbColLc === 'id') {
        logger.log(`Skipping CSV column '${originalCol}' -> db 'id' (auto-generated)`);
        continue;
      }
      if (!tableCols.has(dbColLc)) {
        logger.log(`Skipping CSV column '${originalCol}' -> db '${dbCol}' (not present on table ${table})`);
        continue;
      }
      if (seenDbCols.has(dbColLc)) {
        logger.log(`Skipping CSV column '${originalCol}' -> db '${dbCol}' (duplicate mapping)`);
        continue;
      }
      seenDbCols.add(dbColLc);
      fieldMappings.push({ originalCol, dbCol });
    }

    if (!fieldMappings.length) {
      throw new Error('No valid columns were detected after mapping; aborting import');
    }

    const insertCols = fieldMappings.map((f) => f.dbCol);
    const insertSql = `INSERT INTO ${table} (${insertCols.join(',')}) VALUES (${insertCols
      .map((_, index) => `$${index + 1}`)
      .join(',')})`;
    logger.log('Insert SQL:', insertSql);

    const isAtividades = table === 'atividades' || table === 'atividades_genericas';
    const disciplinaCache = new Map();
    const userCache = new Map();

    let rowCount = 0;
    for await (const record of parser) {
      const values = [];
      for (const mapping of fieldMappings) {
        let val = record[mapping.originalCol] !== undefined ? record[mapping.originalCol] : null;
        if (val === '') val = null;

        if (isAtividades) {
          if (
            mapping.dbCol === 'disciplina_id' &&
            (record.disciplina || record.disciplina_id)
          ) {
            const nome = (record.disciplina || '').trim();
            if (!nome) {
              val = null;
            } else if (disciplinaCache.has(nome)) {
              val = disciplinaCache.get(nome);
            } else {
              const r = await client.query('SELECT id FROM disciplinas WHERE nome = $1 LIMIT 1', [nome]);
              if (r.rows.length) {
                disciplinaCache.set(nome, r.rows[0].id);
                val = r.rows[0].id;
              } else {
                const ins = await client.query('INSERT INTO disciplinas (nome) VALUES ($1) RETURNING id', [nome]);
                disciplinaCache.set(nome, ins.rows[0].id);
                val = ins.rows[0].id;
              }
            }
          }

          if (mapping.dbCol === 'responsavel_id' && record.responsavel_email) {
            const email = String(record.responsavel_email).trim();
            if (!email) {
              val = null;
            } else if (userCache.has(email)) {
              val = userCache.get(email);
            } else {
              const r = await client.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
              if (r.rows.length) {
                userCache.set(email, r.rows[0].id);
                val = r.rows[0].id;
              } else {
                userCache.set(email, null);
                val = null;
              }
            }
          }
        }

        const dtype = colTypes.get(String(mapping.dbCol).toLowerCase());
        if (val != null && dtype) {
          const lower = String(dtype).toLowerCase();
          if (/int|numeric|decimal|double|real/.test(lower)) {
            const parsed = Number(val);
            val = Number.isNaN(parsed) ? null : parsed;
          } else if (/timestamp|date|time/.test(lower)) {
            const iso = tryParseDate(val);
            val = iso ? iso : null;
          }
        }

        values.push(val);
      }

      await client.query(insertSql, values);
      rowCount += 1;
      if (rowCount % 500 === 0) {
        process.stdout.write(`Imported ${rowCount} rows\r`);
      }
    }

    await client.query('COMMIT');
    logger.log(`\n✓ Import concluído: ${rowCount} linhas inseridas em ${table}`);
    return { rowCount };
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK');
    }
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
}

async function main() {
  const [, , csvPath, table, columns] = process.argv;
  if (!csvPath || !table || !columns) {
    console.error('Usage: node import_csv.js <csv_path> <table> <columns(comma-separated)>');
    process.exit(1);
  }
  try {
    await runImport({ csvPath, table, columns });
  } catch (err) {
    console.error('❌ Erro durante importação:', err.message || err);
    process.exit(1);
  }
}

function tryParseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const match = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const candidate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    if (!Number.isNaN(candidate.getTime())) return candidate.toISOString();
  }
  return null;
}

if (require.main === module) {
  main();
}

module.exports = { runImport };
