/*
  Importa CSV para a tabela empreendimentos.

  Uso:
    node scripts/import_empreendimentos_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

const ALLOWED_FIELDS = new Set(['nome', 'descricao']);

const HEADER_ALIASES = {
  id: null,
  created_at: null,
  updated_at: null,
  created_date: null,
  updated_date: null,

  name: 'nome',
  titulo: 'nome',
  empreendimento: 'nome',

  description: 'descricao',
  descricao: 'descricao',
};

function normalizeHeader(header) {
  if (header == null) return '';
  return String(header)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function mapHeader(rawHeader) {
  const normalized = normalizeHeader(rawHeader);
  if (Object.prototype.hasOwnProperty.call(HEADER_ALIASES, normalized)) {
    return HEADER_ALIASES[normalized];
  }
  if (ALLOWED_FIELDS.has(normalized)) return normalized;
  return null;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function buildPayload(record, mappedHeaders) {
  const payload = {};
  for (const [rawHeader, targetField] of mappedHeaders) {
    if (!targetField) continue;
    payload[targetField] = normalizeText(record[rawHeader]);
  }

  if (!payload.nome) {
    payload.nome = normalizeText(record.nome || record.name || record.empreendimento || record.titulo);
  }

  if (payload.descricao == null) payload.descricao = null;
  return payload;
}

function hasUsefulData(payload) {
  return !!(payload && payload.nome && String(payload.nome).trim());
}

async function upsertEmpreendimento(client, payload, insertOnly) {
  if (!hasUsefulData(payload)) return { action: 'skipped' };

  const fields = Object.keys(payload).filter((k) => ALLOWED_FIELDS.has(k));
  if (!fields.length) return { action: 'skipped' };

  const values = fields.map((f) => payload[f]);
  const nome = payload.nome;

  let targetId = null;
  if (!insertOnly && nome) {
    const existing = await client.query(
      'SELECT id FROM empreendimentos WHERE LOWER(nome) = LOWER($1) ORDER BY id DESC LIMIT 1',
      [nome]
    );
    if (existing.rows.length) targetId = existing.rows[0].id;
  }

  if (targetId) {
    const setSql = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const sql = `UPDATE empreendimentos SET ${setSql}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING id`;
    const result = await client.query(sql, [...values, targetId]);
    return { action: 'updated', id: result.rows[0]?.id || targetId };
  }

  const colsSql = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO empreendimentos (${colsSql}) VALUES (${placeholders}) RETURNING id`;
  const result = await client.query(sql, values);
  return { action: 'inserted', id: result.rows[0]?.id || null };
}

async function main() {
  const [, , csvPathArg, ...opts] = process.argv;
  if (!csvPathArg) {
    console.error('Uso: node scripts/import_empreendimentos_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run]');
    process.exit(1);
  }

  const separatorOpt = opts.find((o) => o.startsWith('--sep='));
  let delimiter = separatorOpt ? separatorOpt.slice('--sep='.length) : ',';
  const insertOnly = opts.includes('--insert-only');
  const dryRun = opts.includes('--dry-run');

  const csvPath = path.isAbsolute(csvPathArg)
    ? csvPathArg
    : path.resolve(process.cwd(), csvPathArg);

  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV nao encontrado:', csvPath);
    process.exit(1);
  }

  if (typeof parse !== 'function') {
    console.error('Dependencia csv-parse nao encontrada. Rode: npm install');
    process.exit(1);
  }

  // Auto-correct common delimiter mismatch: user passes ';' for a comma CSV (or vice-versa).
  const firstLine = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/, 1)[0] || '';
  const hasComma = firstLine.includes(',');
  const hasSemi = firstLine.includes(';');
  if (delimiter === ';' && hasComma && !hasSemi) {
    console.log('Aviso: cabecalho detectado com virgula. Ajustando delimitador para "," automaticamente.');
    delimiter = ',';
  } else if (delimiter === ',' && hasSemi && !hasComma) {
    console.log('Aviso: cabecalho detectado com ponto-e-virgula. Ajustando delimitador para ";" automaticamente.');
    delimiter = ';';
  }

  const headerMap = new Map();
  let parserHeaders = [];
  const parser = fs.createReadStream(csvPath).pipe(parse({
    columns: (headers) => {
      parserHeaders = headers;
      headers.forEach((h) => headerMap.set(h, mapHeader(h)));
      return headers;
    },
    trim: true,
    skip_empty_lines: true,
    delimiter,
    relax_quotes: true,
  }));

  const stats = { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
  const errors = [];

  const client = await pool.connect();
  try {
    if (!dryRun) await client.query('BEGIN');

    for await (const record of parser) {
      stats.processed += 1;
      const payload = buildPayload(record, headerMap);

      try {
        if (dryRun) {
          if (hasUsefulData(payload)) stats.inserted += 1;
          else stats.skipped += 1;
          continue;
        }

        const result = await upsertEmpreendimento(client, payload, insertOnly);
        if (result.action === 'inserted') stats.inserted += 1;
        else if (result.action === 'updated') stats.updated += 1;
        else stats.skipped += 1;
      } catch (rowErr) {
        stats.errors += 1;
        errors.push({ line: stats.processed + 1, message: rowErr.message || String(rowErr) });
      }
    }

    if (!dryRun) {
      if (stats.errors > 0) await client.query('ROLLBACK');
      else await client.query('COMMIT');
    }
  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('\nImportacao finalizada');
  console.log('Arquivo:', csvPath);
  console.log('Delimitador:', JSON.stringify(delimiter));
  console.log('Cabecalhos detectados:', parserHeaders.join(', '));
  console.log('Campos mapeados:', Array.from(headerMap.entries()).map(([k, v]) => `${k}->${v || '[ignorado]'}`).join(' | '));
  console.log('Resumo:', JSON.stringify(stats));

  if (errors.length) {
    console.log('Primeiros erros:');
    errors.slice(0, 10).forEach((e) => console.log(`- linha ${e.line}: ${e.message}`));
    console.log('Nenhuma linha foi gravada porque houve erro e a transacao foi revertida.');
    process.exit(1);
  }

  if (dryRun) {
    console.log('Dry-run: nenhuma linha foi gravada no banco.');
  }
}

main().catch((err) => {
  console.error('Falha na importacao:', err.message || err);
  process.exit(1);
});
