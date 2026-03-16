/*
  Importa CSV para a tabela execucoes.

  Uso:
    node scripts/import_execucoes_csv.js <caminho_csv> [--sep=;] [--dry-run] [--insert-only] [--update-existing]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

const ALLOWED_FIELDS = new Set([
  'planejamento_atividade_id',
  'planejamento_id',
  'usuario_id',
  'usuario',
  'inicio',
  'termino',
  'minutos',
  'tempo_total',
  'data_execucao',
  'descritivo',
  'base_descritivo',
  'usuario_ajudado',
  'nota',
  'status',
  'pausado_automaticamente',
  'empreendimento_id',
  'tipo_planejamento',
  'created_at',
  'updated_at'
]);

const NUMERIC_FIELDS = new Set(['planejamento_atividade_id', 'planejamento_id', 'usuario_id', 'minutos', 'tempo_total', 'empreendimento_id']);
const DATETIME_FIELDS = new Set(['inicio', 'termino', 'data_execucao', 'created_at', 'updated_at']);

const HEADER_ALIASES = {
  id: 'id',
  execucao_id: 'id',
  execucao: 'descritivo',
  lancamento: 'descritivo',
  usuario_email: '__usuario_email__',
  responsavel_email: '__usuario_email__',
  usuario_nome: '__usuario_nome__',
  usuario: 'usuario',
  usuario_id: 'usuario_id',
  planejamento_id: 'planejamento_id',
  planejamento_atividade_id: 'planejamento_atividade_id',
  planejamentoatividade_id: 'planejamento_atividade_id',
  inicio: 'inicio',
  termino: 'termino',
  data: 'data_execucao',
  data_execucao: 'data_execucao',
  descritivo: 'descritivo',
  base_descritivo: 'base_descritivo',
  minutos: 'minutos',
  tempo_total: 'tempo_total',
  status: 'status',
  pausado: 'pausado_automaticamente',
  pausado_automaticamente: 'pausado_automaticamente',
  empreendimento_id: 'empreendimento_id',
  tipo_planejamento: 'tipo_planejamento',
  nota: 'nota'
};

function normalizeHeader(header) {
  if (header == null) return '';
  return String(header)
    .trim()
    .normalize('NFD')
    .replace(/[\u0000-\u001f]/g, '')
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

function stripBom(text) {
  if (!text) return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function scoreDecodedText(text) {
  const replacement = (text.match(/\uFFFD/g) || []).length;
  return replacement;
}

function fixMojibake(text) {
  if (!text) return text;
  if (!/[ÃƒÃ‚]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');
    if (scoreDecodedText(repaired) < scoreDecodedText(text)) return repaired;
  } catch (_) {
    // ignore
  }
  return text;
}

function readCsvTextWithBestEncoding(filePath) {
  const raw = fs.readFileSync(filePath);
  const utf8 = fixMojibake(stripBom(raw.toString('utf8')));
  const latin1 = fixMojibake(stripBom(raw.toString('latin1')));
  const utf8Score = scoreDecodedText(utf8);
  const latin1Score = scoreDecodedText(latin1);
  return {
    text: utf8Score <= latin1Score ? utf8 : latin1,
    encoding: utf8Score <= latin1Score ? 'utf8' : 'latin1',
    utf8Score,
    latin1Score,
  };
}

function detectDelimiter(filePath) {
  const { text } = readCsvTextWithBestEncoding(filePath);
  const firstLine = (text || '').split(/\r?\n/, 1)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

function parseArgs(argv) {
  const opts = {
    delimiter: null,
    dryRun: false,
    insertOnly: false,
    updateExisting: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--insert-only') opts.insertOnly = true;
    else if (arg === '--update-existing') opts.updateExisting = true;
    else if (arg.startsWith('--sep=')) opts.delimiter = arg.slice('--sep='.length);
  }

  return opts;
}

const MAX_NUMERIC_VALUE = 99999999.99;

function parseNumber(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  let normalized = text;
  const comma = normalized.indexOf(',');
  const dot = normalized.indexOf('.');
  if (comma !== -1 && dot !== -1) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (comma !== -1) {
    normalized = normalized.replace(',', '.');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  if (Math.abs(parsed) > MAX_NUMERIC_VALUE) {
    return 0;
  }
  return parsed;
}

function parseDateTime(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    const hh = (dmy[4] || '00').padStart(2, '0');
    const mm = (dmy[5] || '00').padStart(2, '0');
    const ss = (dmy[6] || '00').padStart(2, '0');
    return `${year}-${month}-${day}T${hh}:${mm}:${ss}Z`;
  }
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseBoolean(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'sim', 's', 'yes'].includes(text)) return true;
  if (['false', '0', 'nao', 'não', 'n', 'no'].includes(text)) return false;
  return null;
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function buildPayload(row, headerMap) {
  const payload = {};
  const aux = {};

  for (const [header, target] of headerMap.entries()) {
    if (!target) continue;
    const rawValue = row[header];
    if (target === '__usuario_email__') {
      aux.__usuario_email__ = normalizeText(rawValue);
      continue;
    }
    if (target === '__usuario_nome__') {
      aux.__usuario_nome__ = normalizeText(rawValue);
      continue;
    }

    if (DATETIME_FIELDS.has(target)) payload[target] = parseDateTime(rawValue);
    else if (NUMERIC_FIELDS.has(target)) payload[target] = parseNumber(rawValue);
    else if (target === 'pausado_automaticamente') payload[target] = parseBoolean(rawValue);
    else payload[target] = normalizeText(rawValue);
  }

  if (payload.tempo_total == null && payload.minutos != null) {
    payload.tempo_total = Number(payload.minutos) / 60;
  }

  if (!payload.status) payload.status = 'pendente';

  return { payload, aux };
}

async function resolveUsuarioId(client, aux, cache) {
  if (!aux?.__usuario_email__) return null;
  const email = aux.__usuario_email__;
  const cacheKey = `email:${email.toLowerCase()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const res = await client.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
  const found = res.rows[0]?.id || null;
  cache.set(cacheKey, found);
  return found;
}

async function findExistingExecucao(client, payload) {
  if (!payload.planejamento_atividade_id || !payload.inicio) return null;
  const res = await client.query(
    'SELECT id FROM execucoes WHERE planejamento_atividade_id = $1 AND inicio = $2 ORDER BY id DESC LIMIT 1',
    [payload.planejamento_atividade_id, payload.inicio]
  );
  return res.rows[0]?.id || null;
}

async function upsertExecucao(client, payload, opts) {
  const fields = Object.keys(payload).filter((key) => key !== 'id' && ALLOWED_FIELDS.has(key));
  if (!fields.length) return { action: 'skipped' };

  let targetId = Number.isInteger(payload.id) ? payload.id : null;
  if (!targetId && opts.updateExisting) {
    targetId = await findExistingExecucao(client, payload);
  }

  const insertFields = fields;
  const insertPlaceholders = insertFields.map((_, idx) => `$${idx + 1}`).join(', ');
  const insertValues = insertFields.map((field) => payload[field]);

  if (!opts.insertOnly && targetId) {
    const updateFields = fields.filter((field) => field !== 'created_at');
    if (!updateFields.length) return { action: 'skipped' };

    const setClauses = updateFields.map((field, idx) => `${field} = $${idx + 1}`).join(', ');
    const updatedAtIndex = updateFields.length + 1;
    const whereIndex = updatedAtIndex + 1;
    const values = [...updateFields.map((field) => payload[field]), payload.updated_at || null, targetId];

    const updateSql = `UPDATE execucoes SET ${setClauses}, updated_at = COALESCE($${updatedAtIndex}, now()) WHERE id = $${whereIndex}`;
    await client.query(updateSql, values);
    return { action: 'updated', id: targetId };
  }

  const insertSql = `INSERT INTO execucoes (${insertFields.join(',')}) VALUES (${insertPlaceholders})`;
  await client.query(insertSql, insertValues);
  return { action: 'inserted' };
}

async function main() {
  const [, , csvArg, ...args] = process.argv;
  if (!csvArg) {
    console.error('Uso: node scripts/import_execucoes_csv.js <caminho_csv> [--sep=;] [--dry-run] [--insert-only] [--update-existing]');
    process.exit(1);
  }

  if (typeof parse !== 'function') {
    console.error('Dependencia csv-parse nao encontrada. Rode: npm install');
    process.exit(1);
  }

  const opts = parseArgs(args);
  const csvPath = path.isAbsolute(csvArg) ? csvArg : path.resolve(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV nao encontrado:', csvPath);
    process.exit(1);
  }

  const autoDelimiter = detectDelimiter(csvPath);
  const delimiter = opts.delimiter || autoDelimiter;
  const decoded = readCsvTextWithBestEncoding(csvPath);
  const actualDelimiter = opts.delimiter && opts.delimiter !== autoDelimiter ? autoDelimiter : delimiter;

  const headerMap = new Map();
  const parser = Readable.from([decoded.text]).pipe(parse({
    columns: (headers) => {
      headers.forEach((header) => headerMap.set(header, mapHeader(header)));
      return headers;
    },
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter: actualDelimiter,
  }));

  const stats = {
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  const errors = [];
  const userCache = new Map();
  const client = await pool.connect();

  try {
    if (!opts.dryRun) await client.query('BEGIN');

    for await (const row of parser) {
      stats.processed += 1;
      const { payload, aux } = buildPayload(row, headerMap);

      const resolvedUserId = await resolveUsuarioId(client, aux, userCache);
      if (resolvedUserId) payload.usuario_id = resolvedUserId;

      try {
        if (opts.dryRun) {
          stats.inserted += 1;
          continue;
        }

        const result = await upsertExecucao(client, payload, opts);
        if (result.action === 'inserted') stats.inserted += 1;
        else if (result.action === 'updated') stats.updated += 1;
        else stats.skipped += 1;
      } catch (rowErr) {
        stats.errors += 1;
        errors.push({ line: stats.processed + 1, message: rowErr.message || String(rowErr) });
      }

      if (stats.processed % 500 === 0) {
        process.stdout.write(`Processadas ${stats.processed} linhas...\r`);
      }
    }

    if (!opts.dryRun) {
      if (stats.errors > 0) await client.query('ROLLBACK');
      else await client.query('COMMIT');
    }
  } catch (err) {
    if (!opts.dryRun) {
      try { await client.query('ROLLBACK'); } catch (_) { }
    }
    throw err;
  } finally {
    client.release();
  }

  console.log('\nImportacao finalizada');
  console.log('Arquivo:', csvPath);
  console.log('Encoding escolhido:', decoded.encoding, `(score utf8=${decoded.utf8Score}, latin1=${decoded.latin1Score})`);
  console.log('Delimitador usado:', JSON.stringify(actualDelimiter));
  console.log('Cabecalhos mapeados:', Array.from(headerMap.entries()).map(([k, v]) => `${k}->${v || '[ignorado]'}`).join(' | '));
  console.log('Resumo:', JSON.stringify(stats));

  if (errors.length) {
    console.log('Erros detectados nas primeiras entradas:');
    errors.slice(0, 10).forEach((err) => console.log(`- linha ${err.line}: ${err.message}`));
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log('Dry-run: nenhuma linha foi gravada.');
  }
}

main().catch((err) => {
  console.error('Falha na importacao:', err.message || err);
  process.exit(1);
});
