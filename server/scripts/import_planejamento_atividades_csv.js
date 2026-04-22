/*
  Importa CSV para a tabela planejamento_atividades.

  Uso:
    node scripts/import_planejamento_atividades_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run] [--atividades-csv=<caminho>]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

const ALLOWED_FIELDS = new Set([
  'titulo', 'descricao', 'atividade_id', 'empreendimento_id', 'executor_principal',
  'executores', 'executor_id', 'inicio_previsto', 'fim_previsto', 'inicio_planejado',
  'termino_planejado', 'tempo_planejado', 'tempo_executado', 'horas_por_dia',
  'horas_executadas_por_dia', 'status', 'inicio_real', 'termino_real'
]);

const NUMERIC_FIELDS = new Set(['tempo_planejado', 'tempo_executado', 'atividade_id', 'empreendimento_id', 'executor_id']);
const DATETIME_FIELDS = new Set(['inicio_previsto', 'fim_previsto', 'inicio_planejado', 'termino_planejado']);
const DATE_FIELDS = new Set(['inicio_real', 'termino_real']);

const HEADER_ALIASES = {
  id: null,
  created_at: null,
  updated_at: null,
  created_date: null,
  updated_date: null,

  atividade: '__atividade_nome__',
  atividade_nome: '__atividade_nome__',

  titulo: 'titulo',
  nome: 'titulo',

  descricao: 'descricao',
  descritivo: 'descricao',

  empreendimento: '__empreendimento_nome__',
  empreendimento_nome: '__empreendimento_nome__',

  executor: 'executor_principal',
  responsavel: 'executor_principal',

  inicio: 'inicio_previsto',
  fim: 'fim_previsto',

  tempo: 'tempo_planejado',
  tempo_planejado: 'tempo_planejado',
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

function parseNumber(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;

  let normalized = text;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
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

function parseDate(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

function normalizeText(value) {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

function stripBom(text) {
  if (!text) return text;
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function scoreDecodedText(text) {
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const mojibake = (text.match(/[ÃÂ�]/g) || []).length;
  return replacement * 4 + mojibake;
}

function fixMojibake(text) {
  if (!text) return text;
  if (!/[ÃÂ]/.test(text)) return text;
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
  const out = {
    insertOnly: false,
    dryRun: false,
    delimiter: null,
    atividadesCsv: null,
  };

  for (const arg of argv) {
    if (arg === '--insert-only') out.insertOnly = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--sep=')) out.delimiter = arg.slice('--sep='.length);
    else if (arg.startsWith('--atividades-csv=')) out.atividadesCsv = arg.slice('--atividades-csv='.length);
  }

  return out;
}

function buildPayload(record, headerMap) {
  const payload = {};
  const aux = {};

  for (const [rawHeader, targetField] of headerMap.entries()) {
    if (!targetField) continue;
    const value = record[rawHeader];

    if (targetField.startsWith('__')) {
      aux[targetField] = normalizeText(value);
      continue;
    }

    if (DATETIME_FIELDS.has(targetField)) payload[targetField] = parseDateTime(value);
    else if (DATE_FIELDS.has(targetField)) payload[targetField] = parseDate(value);
    else if (NUMERIC_FIELDS.has(targetField)) {
      if (targetField === 'empreendimento_id') {
        const num = parseNumber(value);
        if (num != null && num > 0) {
          payload[targetField] = num;
        } else {
          aux.__empreendimento_id_raw__ = normalizeText(value);
        }
      } else if (targetField === 'atividade_id') {
        const num = parseNumber(value);
        if (num != null && num > 0) {
          payload[targetField] = num;
        } else {
          aux.__atividade_id_raw__ = normalizeText(value);
        }
      } else {
        const num = parseNumber(value);
        if (num != null) payload[targetField] = num;
      }
    }
    else {
      const txt = normalizeText(value);
      if (txt != null) payload[targetField] = txt;
    }
  }

  // Gerar título se não houver
  if (!payload.titulo) {
    // Tentar usar descricao (que vem do descritivo do CSV)
    const descricaoValue = payload.descricao || normalizeText(record['descritivo']);

    if (descricaoValue) {
      payload.titulo = descricaoValue.substring(0, 255);
    } else if (payload.executor_principal) {
      payload.titulo = `Atividade - ${payload.executor_principal}`.substring(0, 255);
    } else if (aux.__atividade_nome__) {
      payload.titulo = aux.__atividade_nome__.substring(0, 255);
    } else {
      payload.titulo = 'Planejamento Importado';
    }
  }

  if (!payload.status) payload.status = 'planejado';

  return { payload, aux };
}

async function loadAtividadeLegacyMap(client, legacyCsvPath) {
  if (!legacyCsvPath) return new Map();
  const abs = path.isAbsolute(legacyCsvPath) ? legacyCsvPath : path.resolve(process.cwd(), legacyCsvPath);
  if (!fs.existsSync(abs)) return new Map();

  const delimiter = detectDelimiter(abs);
  const decoded = readCsvTextWithBestEncoding(abs);
  const parser = Readable.from([decoded.text]).pipe(parse({
    columns: true,
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter,
  }));

  const map = new Map();
  for await (const row of parser) {
    const legacyId = normalizeText(row.id);
    const nome = normalizeText(row.titulo || row.nome || row.atividade);
    if (legacyId && nome) map.set(legacyId, nome);
  }

  return map;
}

async function resolveAtividadeId(client, rawAtividadeId, atividadeNomeAux, legacyAtivMap, cache) {
  if (rawAtividadeId != null) {
    if (Number.isInteger(rawAtividadeId) && rawAtividadeId > 0) return rawAtividadeId;

    const legacyKey = String(rawAtividadeId);
    const mappedName = legacyAtivMap.get(legacyKey);
    if (mappedName) {
      const cacheKey = `ativ:${mappedName.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const r = await client.query('SELECT id FROM atividades WHERE lower(titulo) = lower($1) ORDER BY id DESC LIMIT 1', [mappedName]);
      const id = r.rows[0]?.id || null;
      cache.set(cacheKey, id);
      return id;
    }
  }

  if (atividadeNomeAux) {
    const cacheKey = `ativ:${atividadeNomeAux.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const r = await client.query('SELECT id FROM atividades WHERE lower(titulo) = lower($1) ORDER BY id DESC LIMIT 1', [atividadeNomeAux]);
    const id = r.rows[0]?.id || null;
    cache.set(cacheKey, id);
    return id;
  }

  return null;
}

async function resolveEmpreendimentoId(client, rawEmpreendimentoId, empreendimentoNomeAux, cache) {
  if (rawEmpreendimentoId != null) {
    // Se for número direto ou string numérica
    if (Number.isInteger(rawEmpreendimentoId) && rawEmpreendimentoId > 0) return rawEmpreendimentoId;

    // Se for string numérica
    const numValue = Number(rawEmpreendimentoId);
    if (Number.isFinite(numValue) && numValue > 0 && Number.isInteger(numValue)) {
      return numValue;
    }
  }

  if (empreendimentoNomeAux) {
    const cacheKey = `emp:${empreendimentoNomeAux.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const r = await client.query('SELECT id FROM empreendimentos WHERE lower(nome) = lower($1) ORDER BY id DESC LIMIT 1', [empreendimentoNomeAux]);
    const id = r.rows[0]?.id || null;
    cache.set(cacheKey, id);
    return id;
  }

  return null;
}

async function upsertPlanejamentoAtividade(client, payload, insertOnly) {
  const fields = Object.keys(payload).filter((k) => ALLOWED_FIELDS.has(k) && payload[k] != null);
  if (!fields.length) return { action: 'skipped' };

  if (insertOnly) {
    // Insert only mode
    const colsSql = fields.join(', ');
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
    const values = fields.map((f) => {
      const v = payload[f];
      return typeof v === 'object' ? JSON.stringify(v) : v;
    });
    const sql = `INSERT INTO planejamento_atividades (${colsSql}) VALUES (${placeholders}) RETURNING id`;
    const out = await client.query(sql, values);
    return { action: 'inserted', id: out.rows[0]?.id || null };
  }

  // Upsert by titulo if provided
  const colsSql = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const values = fields.map((f) => {
    const v = payload[f];
    return typeof v === 'object' ? JSON.stringify(v) : v;
  });
  const sql = `INSERT INTO planejamento_atividades (${colsSql}) VALUES (${placeholders}) RETURNING id`;
  const out = await client.query(sql, values);
  return { action: 'inserted', id: out.rows[0]?.id || null };
}

async function main() {
  const [, , csvArg, ...argv] = process.argv;
  if (!csvArg) {
    console.error('Uso: node scripts/import_planejamento_atividades_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run] [--atividades-csv=<caminho>]');
    process.exit(1);
  }

  if (typeof parse !== 'function') {
    console.error('Dependencia csv-parse nao encontrada. Rode: npm install');
    process.exit(1);
  }

  const opts = parseArgs(argv);
  const csvPath = path.isAbsolute(csvArg) ? csvArg : path.resolve(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV nao encontrado:', csvPath);
    process.exit(1);
  }

  const autoDelimiter = detectDelimiter(csvPath);
  let delimiter = opts.delimiter || autoDelimiter;
  const decodedMain = readCsvTextWithBestEncoding(csvPath);

  if (opts.delimiter && opts.delimiter !== autoDelimiter) {
    console.log(`Aviso: delimitador informado (${JSON.stringify(opts.delimiter)}) difere do detectado no arquivo (${JSON.stringify(autoDelimiter)}). Usando o detectado.`);
    delimiter = autoDelimiter;
  }

  const headerMap = new Map();
  let parserHeaders = [];
  const parser = Readable.from([decodedMain.text]).pipe(parse({
    columns: (headers) => {
      parserHeaders = headers;
      headers.forEach((h) => headerMap.set(h, mapHeader(h)));
      return headers;
    },
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter,
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
  const cache = new Map();

  try {
    const legacyAtivMap = await loadAtividadeLegacyMap(client, opts.atividadesCsv);

    if (!opts.dryRun) await client.query('BEGIN');

    for await (const row of parser) {
      stats.processed += 1;
      const built = buildPayload(row, headerMap);
      const payload = built.payload;
      const aux = built.aux;

      try {
        const rawAtividadeRef = payload.atividade_id != null
          ? payload.atividade_id
          : aux.__atividade_id_raw__;

        payload.atividade_id = await resolveAtividadeId(
          client,
          rawAtividadeRef,
          aux.__atividade_nome__,
          legacyAtivMap,
          cache
        );

        const rawEmpreendimentoRef = payload.empreendimento_id != null
          ? payload.empreendimento_id
          : aux.__empreendimento_id_raw__;

        payload.empreendimento_id = await resolveEmpreendimentoId(
          client,
          rawEmpreendimentoRef,
          aux.__empreendimento_nome__,
          cache
        );

        if (opts.dryRun) {
          if (payload.titulo) stats.inserted += 1;
          else stats.skipped += 1;
          continue;
        }

        const result = await upsertPlanejamentoAtividade(client, payload, opts.insertOnly);
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
  console.log('Encoding escolhido:', decodedMain.encoding, `(score utf8=${decodedMain.utf8Score}, latin1=${decodedMain.latin1Score})`);
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

  if (opts.dryRun) {
    console.log('Dry-run: nenhuma linha foi gravada no banco.');
  }
}

main().catch((err) => {
  console.error('Falha na importacao:', err.message || err);
  process.exit(1);
});
