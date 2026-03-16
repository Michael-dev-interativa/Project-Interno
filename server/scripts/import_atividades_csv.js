/*
  Importa CSV para a tabela atividades.

  Uso:
    node scripts/import_atividades_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run] [--empreendimentos-csv=<caminho>]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

const ALLOWED_FIELDS = new Set([
  'titulo', 'etapa', 'predecessora', 'funcao', 'subdisciplina', 'tempo',
  'id_atividade', 'descricao', 'status', 'inicio_previsto', 'fim_previsto',
  'empreendimento_id', 'equipe_id', 'disciplina_id', 'responsavel_id'
]);

const NUMERIC_FIELDS = new Set(['tempo', 'empreendimento_id', 'equipe_id', 'disciplina_id', 'responsavel_id']);
const DATETIME_FIELDS = new Set(['inicio_previsto', 'fim_previsto']);

const HEADER_ALIASES = {
  id: null,
  created_at: null,
  updated_at: null,
  created_date: null,
  updated_date: null,
  created_by_id: null,
  created_by: null,
  is_sample: null,

  atividade: 'titulo',
  nome: 'titulo',
  titulo: 'titulo',

  codigo: 'id_atividade',
  codigo_atividade: 'id_atividade',
  id_atividade: 'id_atividade',

  descricao: 'descricao',
  descritivo: 'descricao',

  inicio: 'inicio_previsto',
  fim: 'fim_previsto',

  disciplina: '__disciplina_nome__',
  disciplina_nome: '__disciplina_nome__',

  empreendimento: '__empreendimento_nome__',
  empreendimento_nome: '__empreendimento_nome__',
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
  // Penaliza sinais comuns de mojibake e caractere de substituicao.
  const replacement = (text.match(/\uFFFD/g) || []).length;
  const mojibake = (text.match(/[ÃÂ�]/g) || []).length;
  return replacement * 4 + mojibake;
}

function fixMojibake(text) {
  if (!text) return text;
  // Tentativa simples: reinterpreta latin1->utf8 quando houver padrao tipico de mojibake.
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
    empreendimentosCsv: null,
    allowUnresolvedEmpreendimentoAsGeneric: false,
  };

  for (const arg of argv) {
    if (arg === '--insert-only') out.insertOnly = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--allow-unresolved-empreendimento-as-generic') out.allowUnresolvedEmpreendimentoAsGeneric = true;
    else if (arg.startsWith('--sep=')) out.delimiter = arg.slice('--sep='.length);
    else if (arg.startsWith('--empreendimentos-csv=')) out.empreendimentosCsv = arg.slice('--empreendimentos-csv='.length);
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
    else if (NUMERIC_FIELDS.has(targetField)) {
      if (targetField === 'empreendimento_id') {
        aux.__empreendimento_id_raw__ = normalizeText(value);
      }
      payload[targetField] = parseNumber(value);
    }
    else payload[targetField] = normalizeText(value);
  }

  if (!payload.titulo) {
    payload.titulo = payload.id_atividade || aux.__empreendimento_nome__ || 'ATIVIDADE IMPORTADA';
  }
  if (!payload.subdisciplina) {
    payload.subdisciplina = 'Sem Subdisciplina';
  }
  if (!payload.status) payload.status = 'pendente';

  return { payload, aux };
}

async function loadEmpreendimentoLegacyMap(client, legacyCsvPath) {
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
    const nome = normalizeText(row.nome || row.name || row.empreendimento || row.titulo);
    if (legacyId && nome) map.set(legacyId, nome);
  }

  return map;
}

async function resolveEmpreendimentoId(client, rawEmpreendimentoId, empreendimentoNomeAux, legacyEmpMap, cache) {
  if (rawEmpreendimentoId != null) {
    if (Number.isInteger(rawEmpreendimentoId) && rawEmpreendimentoId > 0) return rawEmpreendimentoId;

    const legacyKey = String(rawEmpreendimentoId);
    const mappedName = legacyEmpMap.get(legacyKey);
    if (mappedName) {
      const cacheKey = `empname:${mappedName.toLowerCase()}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      const r = await client.query('SELECT id FROM empreendimentos WHERE lower(nome) = lower($1) ORDER BY id DESC LIMIT 1', [mappedName]);
      const id = r.rows[0]?.id || null;
      cache.set(cacheKey, id);
      return id;
    }
  }

  if (empreendimentoNomeAux) {
    const cacheKey = `empname:${empreendimentoNomeAux.toLowerCase()}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const r = await client.query('SELECT id FROM empreendimentos WHERE lower(nome) = lower($1) ORDER BY id DESC LIMIT 1', [empreendimentoNomeAux]);
    const id = r.rows[0]?.id || null;
    cache.set(cacheKey, id);
    return id;
  }

  return null;
}

async function resolveDisciplinaId(client, payloadDisciplinaId, disciplinaNomeAux, cache) {
  if (payloadDisciplinaId != null && Number.isInteger(payloadDisciplinaId) && payloadDisciplinaId > 0) {
    return payloadDisciplinaId;
  }

  if (!disciplinaNomeAux) return null;

  const cacheKey = `disc:${disciplinaNomeAux.toLowerCase()}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const existing = await client.query('SELECT id FROM disciplinas WHERE lower(nome) = lower($1) ORDER BY id DESC LIMIT 1', [disciplinaNomeAux]);
  if (existing.rows.length) {
    const id = existing.rows[0].id;
    cache.set(cacheKey, id);
    return id;
  }

  const created = await client.query('INSERT INTO disciplinas (nome) VALUES ($1) RETURNING id', [disciplinaNomeAux]);
  const id = created.rows[0].id;
  cache.set(cacheKey, id);
  return id;
}

async function upsertAtividade(client, payload, insertOnly) {
  const fields = Object.keys(payload).filter((k) => ALLOWED_FIELDS.has(k));
  if (!fields.length) return { action: 'skipped' };

  let targetId = null;
  if (!insertOnly && payload.id_atividade) {
    if (payload.empreendimento_id) {
      const r = await client.query(
        'SELECT id FROM atividades WHERE id_atividade = $1 AND empreendimento_id = $2 ORDER BY id DESC LIMIT 1',
        [payload.id_atividade, payload.empreendimento_id]
      );
      if (r.rows.length) targetId = r.rows[0].id;
    } else {
      const r = await client.query(
        'SELECT id FROM atividades WHERE id_atividade = $1 ORDER BY id DESC LIMIT 1',
        [payload.id_atividade]
      );
      if (r.rows.length) targetId = r.rows[0].id;
    }
  }

  if (targetId) {
    const setSql = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const values = fields.map((f) => payload[f]);
    const sql = `UPDATE atividades SET ${setSql}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING id`;
    const out = await client.query(sql, [...values, targetId]);
    return { action: 'updated', id: out.rows[0]?.id || targetId };
  }

  const colsSql = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const values = fields.map((f) => payload[f]);
  const sql = `INSERT INTO atividades (${colsSql}) VALUES (${placeholders}) RETURNING id`;
  const out = await client.query(sql, values);
  return { action: 'inserted', id: out.rows[0]?.id || null };
}

async function main() {
  const [, , csvArg, ...argv] = process.argv;
  if (!csvArg) {
    console.error('Uso: node scripts/import_atividades_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run] [--empreendimentos-csv=<caminho>]');
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
    unresolvedEmpreendimento: 0,
    skippedUnresolvedEmpreendimento: 0,
    resolvedDisciplinaByName: 0,
  };
  const errors = [];

  const client = await pool.connect();
  const cache = new Map();

  try {
    const legacyEmpMap = await loadEmpreendimentoLegacyMap(client, opts.empreendimentosCsv);

    if (!opts.dryRun) await client.query('BEGIN');

    for await (const row of parser) {
      stats.processed += 1;
      const built = buildPayload(row, headerMap);
      const payload = built.payload;
      const aux = built.aux;

      try {
        const rawEmpreendimentoRef = payload.empreendimento_id != null
          ? payload.empreendimento_id
          : aux.__empreendimento_id_raw__;

        payload.empreendimento_id = await resolveEmpreendimentoId(
          client,
          rawEmpreendimentoRef,
          aux.__empreendimento_nome__,
          legacyEmpMap,
          cache
        );

        const hadEmpreendimentoReference = !!(normalizeText(rawEmpreendimentoRef) || normalizeText(aux.__empreendimento_nome__));
        if (!payload.empreendimento_id) {
          stats.unresolvedEmpreendimento += 1;
          if (hadEmpreendimentoReference && !opts.allowUnresolvedEmpreendimentoAsGeneric) {
            stats.skipped += 1;
            stats.skippedUnresolvedEmpreendimento += 1;
            continue;
          }
        }

        const originalDisc = payload.disciplina_id;
        payload.disciplina_id = await resolveDisciplinaId(client, payload.disciplina_id, aux.__disciplina_nome__, cache);
        if (!originalDisc && payload.disciplina_id && aux.__disciplina_nome__) {
          stats.resolvedDisciplinaByName += 1;
        }

        if (opts.dryRun) {
          if (payload.titulo) stats.inserted += 1;
          else stats.skipped += 1;
          continue;
        }

        const result = await upsertAtividade(client, payload, opts.insertOnly);
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
