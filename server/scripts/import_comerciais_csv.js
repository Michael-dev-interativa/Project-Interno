/*
  Importa dados CSV para a tabela comerciais.

  Uso:
    node scripts/import_comerciais_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run]

  Exemplos:
    node scripts/import_comerciais_csv.js C:/tmp/comerciais.csv --sep=;
    node scripts/import_comerciais_csv.js C:/tmp/comerciais.csv --insert-only
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

const JSON_FIELDS = new Set(['parceiros', 'disciplinas', 'codisciplinas', 'pavimentos']);
const NUMERIC_FIELDS = new Set(['area', 'valor_bim', 'valor_cad', 'valor_estimate']);
const DATE_FIELDS = new Set(['data_solicitacao', 'data_aprovacao']);
const TEXT_FIELDS = new Set([
  'numero', 'solicitante', 'cliente', 'empreendimento', 'tipo_empreendimento',
  'tipo_obra', 'utilizacao', 'escopo', 'estado', 'status', 'email', 'telefone',
  'observacao', 'titulo'
]);

const ALLOWED_FIELDS = new Set([
  ...TEXT_FIELDS,
  ...NUMERIC_FIELDS,
  ...DATE_FIELDS,
  ...JSON_FIELDS,
]);

const HEADER_ALIASES = {
  id: null,
  created_at: null,
  updated_at: null,
  created_date: null,
  updated_date: null,

  numero_proposta: 'numero',
  numero_comercial: 'numero',

  data: 'data_solicitacao',
  data_solicitacao: 'data_solicitacao',
  dataaprovacao: 'data_aprovacao',
  data_aprovacao: 'data_aprovacao',

  valorbim: 'valor_bim',
  valor_bim: 'valor_bim',
  valorcad: 'valor_cad',
  valor_cad: 'valor_cad',
  valor: 'valor_estimate',
  valor_estimate: 'valor_estimate',

  tipoempreendimento: 'tipo_empreendimento',
  tipo_empreendimento: 'tipo_empreendimento',
  tipoobra: 'tipo_obra',
  tipo_obra: 'tipo_obra',

  co_disciplinas: 'codisciplinas',
  codisciplinas: 'codisciplinas',
  co_disciplinas_json: 'codisciplinas',
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

function parseDate(value) {
  if (value == null || value === '') return null;
  const input = String(value).trim();

  // dd/mm/yyyy
  const dmy = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // yyyy-mm-dd or parseable ISO
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const normalized = String(value)
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseJsonLike(value) {
  if (value == null || value === '') return [];
  if (typeof value !== 'string') {
    return Array.isArray(value) || typeof value === 'object' ? value : [];
  }

  const text = value.trim();
  if (!text) return [];

  // Common CSV export pattern for embedded JSON: doubled quotes inside a field.
  const normalizedJsonText = text.replace(/""/g, '"');

  if (normalizedJsonText.startsWith('[') || normalizedJsonText.startsWith('{')) {
    try {
      return JSON.parse(normalizedJsonText);
    } catch (_) {
      return [];
    }
  }

  // Fallback para listas simples: "a|b|c" / "a;b;c" / "a,b,c"
  const sep = text.includes('|') ? '|' : text.includes(';') ? ';' : ',';
  return text
    .split(sep)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeValue(field, rawValue) {
  if (rawValue === '') return null;

  if (DATE_FIELDS.has(field)) return parseDate(rawValue);
  if (NUMERIC_FIELDS.has(field)) return parseNumber(rawValue);
  if (JSON_FIELDS.has(field)) return parseJsonLike(rawValue);

  if (rawValue == null) return null;
  return String(rawValue).trim();
}

function buildRowPayload(record, mappedHeaders) {
  const payload = {};

  for (const [rawHeader, targetField] of mappedHeaders) {
    if (!targetField) continue;
    const rawValue = record[rawHeader];
    const normalized = normalizeValue(targetField, rawValue);

    if (normalized !== undefined) {
      payload[targetField] = normalized;
    }
  }

  if (!payload.status) payload.status = 'solicitado';
  if (!payload.titulo && payload.numero) payload.titulo = payload.numero;
  if (payload.valor_estimate == null && payload.valor_cad != null) {
    payload.valor_estimate = payload.valor_cad;
  }

  return payload;
}

function hasUsefulData(payload) {
  return Object.keys(payload).some((key) => {
    const value = payload[key];
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    return true;
  });
}

async function upsertComercial(client, payload, insertOnly) {
  if (!hasUsefulData(payload)) return { action: 'skipped' };

  const numero = payload.numero || null;
  let targetId = null;

  if (!insertOnly && numero) {
    const existing = await client.query(
      'SELECT id FROM comerciais WHERE numero = $1 ORDER BY id DESC LIMIT 1',
      [numero]
    );
    if (existing.rows.length) {
      targetId = existing.rows[0].id;
    }
  }

  const fields = Object.keys(payload).filter((k) => ALLOWED_FIELDS.has(k));
  if (!fields.length) return { action: 'skipped' };

  const dbValues = fields.map((field) => {
    const value = payload[field];
    if (JSON_FIELDS.has(field)) {
      if (value == null) return JSON.stringify([]);
      return JSON.stringify(value);
    }
    return value;
  });

  if (targetId) {
    const setSql = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
    const sql = `UPDATE comerciais SET ${setSql}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING id`;
    const result = await client.query(sql, [...dbValues, targetId]);
    return { action: 'updated', id: result.rows[0]?.id || targetId };
  }

  const colsSql = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO comerciais (${colsSql}) VALUES (${placeholders}) RETURNING id`;
  const result = await client.query(sql, dbValues);
  return { action: 'inserted', id: result.rows[0]?.id || null };
}

async function main() {
  const [, , csvPathArg, ...opts] = process.argv;

  if (!csvPathArg) {
    console.error('Uso: node scripts/import_comerciais_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run]');
    process.exit(1);
  }

  const separatorOpt = opts.find((o) => o.startsWith('--sep='));
  const delimiter = separatorOpt ? separatorOpt.slice('--sep='.length) : ',';
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

  const stats = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  const errors = [];
  const client = await pool.connect();

  try {
    if (!dryRun) await client.query('BEGIN');

    for await (const record of parser) {
      stats.processed += 1;
      const payload = buildRowPayload(record, headerMap);

      try {
        if (dryRun) {
          if (hasUsefulData(payload)) {
            stats.inserted += 1;
          } else {
            stats.skipped += 1;
          }
          continue;
        }

        const result = await upsertComercial(client, payload, insertOnly);
        if (result.action === 'inserted') stats.inserted += 1;
        else if (result.action === 'updated') stats.updated += 1;
        else stats.skipped += 1;
      } catch (rowErr) {
        stats.errors += 1;
        errors.push({
          line: stats.processed + 1,
          message: rowErr.message || String(rowErr),
        });
      }

      if (stats.processed % 200 === 0) {
        process.stdout.write(`Processadas ${stats.processed} linhas...\r`);
      }
    }

    if (!dryRun) {
      if (stats.errors > 0) {
        await client.query('ROLLBACK');
      } else {
        await client.query('COMMIT');
      }
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
    errors.slice(0, 10).forEach((e) => {
      console.log(`- linha ${e.line}: ${e.message}`);
    });
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
