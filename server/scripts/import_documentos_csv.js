/*
  Importa CSV para a tabela documentos.

  Uso:
    node scripts/import_documentos_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

const VALUE_NORMALIZATION_MAP = new Map([
  ['El�trica', 'Elétrica'],
  ['Hidr�ulica', 'Hidráulica'],
  ['Gest�o', 'Gestão'],
  ['Inc�ndio', 'Incêndio'],
  ['Ilumina��o', 'Iluminação'],
  ['�guas pluviais', 'Águas pluviais'],
  ['Amplia��o - ESG', 'Ampliação - ESG'],
  ['�gua Fria', 'Água Fria'],
  ['Seguran�a', 'Segurança'],
  ['Isom�tricos - AF', 'Isométricos - AF'],
  ['Concession�ria - E', 'Concessionária - E'],
  ['G�s', 'Gás'],
  ['Comandos de Ilumina��o', 'Comandos de Iluminação'],
  ['�gua Quente', 'Água Quente'],
  ['ilumina��o', 'iluminação'],
  ['Distribui��o de SPDA', 'Distribuição de SPDA'],
  ['�gua quente', 'Água quente'],
  ['Automa��o', 'Automação'],
  ['EsLOcifica��es - El�trica', 'Especificações - Elétrica'],
  ['EsLOcifica��es - Sistemas', 'Especificações - Sistemas'],
  ['EsLOcifica��es - SPDA', 'Especificações - SPDA'],
  ['Esquema - G�s', 'Esquema - Gás'],
  ['�gua fria', 'Água fria'],
  ['Isom�tricos - HID', 'Isométricos - HID'],
  ['amplia��es - Sistemas', 'ampliações - Sistemas'],
  ['Briefing / Memorial descritivo - El�trica', 'Briefing / Memorial descritivo - Elétrica'],
  ['Concession�rias - E', 'Concessionárias - E'],
  ['Coordena��o', 'Coordenação'],
]);

const JSON_FIELDS = new Set(['disciplinas', 'subdisciplinas']);
const NUMERIC_FIELDS = new Set([
  'pavimento_id',
  'disciplina_id',
  'fator_dificuldade',
  'empreendimento_id',
  'tempo_total',
  'tempo_estudo_preliminar',
  'tempo_ante_projeto',
  'tempo_projeto_basico',
  'tempo_projeto_executivo',
  'tempo_liberado_obra',
  'tempo_concepcao',
  'tempo_planejamento',
  'tempo_execucao_total',
]);

const ALLOWED_FIELDS = new Set([
  'titulo', 'numero', 'tipo', 'arquivo', 'caminho', 'descritivo', 'area',
  'pavimento_id', 'disciplina_id', 'disciplinas', 'subdisciplinas',
  'executor_principal', 'multiplos_executores', 'inicio_planejado', 'termino_planejado',
  'escala', 'fator_dificuldade', 'empreendimento_id',
  'tempo_total', 'tempo_estudo_preliminar', 'tempo_ante_projeto',
  'tempo_projeto_basico', 'tempo_projeto_executivo', 'tempo_liberado_obra',
  'tempo_concepcao', 'tempo_planejamento', 'tempo_execucao_total',
]);

const HEADER_ALIASES = {
  id: null,
  created_at: null,
  updated_at: null,
  created_date: null,
  updated_date: null,

  descricao: 'descritivo',
  descricao_documento: 'descritivo',
  documento: 'titulo',
  nome_documento: 'titulo',

  pavimento: 'pavimento_id',
  disciplina: '__disciplina_ref__',
  disciplina_nome: '__disciplina_ref__',

  fator_dificuldade: 'fator_dificuldade',
  fator_dificuldade_documento: 'fator_dificuldade',
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
  const text = String(value)
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '');
  if (!text) return null;

  // Keep only numeric-related characters. This handles inputs like "1,25h".
  const compact = text.replace(/[^0-9,\.\-+eE]/g, '');
  if (!compact) return null;

  // Handles locale variants:
  // - 1.234,56 -> 1234.56
  // - 1234.56  -> 1234.56
  // - 9E+15    -> 9e15
  let normalized = compact;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    // Use the right-most separator as decimal separator.
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount > 1) {
      const lastComma = normalized.lastIndexOf(',');
      normalized = normalized.slice(0, lastComma).replace(/,/g, '') + '.' + normalized.slice(lastComma + 1);
    } else {
      normalized = normalized.replace(',', '.');
    }
  } else if (hasDot) {
    const dotCount = (normalized.match(/\./g) || []).length;
    if (dotCount > 1) {
      const lastDot = normalized.lastIndexOf('.');
      normalized = normalized.slice(0, lastDot).replace(/\./g, '') + '.' + normalized.slice(lastDot + 1);
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function detectDelimiter(csvText) {
  const lines = String(csvText || '').split(/\r?\n/);
  const firstLine = (lines.find((line) => line && line.trim()) || '').trim();
  if (!firstLine) return ',';

  const candidates = [',', ';', '\t'];
  let best = { delimiter: ',', score: -1 };
  candidates.forEach((delimiter) => {
    const score = firstLine.split(delimiter).length;
    if (score > best.score) {
      best = { delimiter, score };
    }
  });
  return best.delimiter;
}

function parseNumericByField(field, value) {
  const n = parseNumber(value);
  if (n == null) return null;

  if (field === 'empreendimento_id' || field === 'pavimento_id' || field === 'disciplina_id') {
    if (!Number.isInteger(n)) return null;
    if (n < -2147483648 || n > 2147483647) return null;
    return n;
  }

  if (field === 'fator_dificuldade') {
    if (Math.abs(n) > 99999.999) return null;
    return n;
  }

  // tempo_* and other numeric values should fit NUMERIC(10,2)
  if (Math.abs(n) > 99999999.99) return null;
  return n;
}

function parseBoolean(value) {
  if (value == null || value === '') return null;
  const t = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 's', 'yes', 'y'].includes(t)) return true;
  if (['0', 'false', 'nao', 'não', 'n', 'no'].includes(t)) return false;
  return null;
}

function parseDateTime(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();

  // dd/mm/yyyy [hh:mm[:ss]]
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

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeCorruptedText(value) {
  if (value == null) return value;
  const text = String(value).trim();
  if (!text) return text;
  return VALUE_NORMALIZATION_MAP.get(text) || text;
}

function scoreDecodedText(text) {
  // Prefer decodes without replacement char or mojibake hints.
  let score = 0;
  const replacementCount = (text.match(/�/g) || []).length;
  score += replacementCount * 200;

  const mojibakeHints = ['Ã', 'Â', '�'];
  for (const hint of mojibakeHints) {
    score += (text.match(new RegExp(hint, 'g')) || []).length * 20;
  }
  return score;
}

function readCsvTextWithBestEncoding(filePath) {
  const buf = fs.readFileSync(filePath);

  const utf8 = buf.toString('utf8').replace(/^\uFEFF/, '');
  const latin1 = buf.toString('latin1').replace(/^\uFEFF/, '');

  const utf8Score = scoreDecodedText(utf8);
  const latin1Score = scoreDecodedText(latin1);

  if (latin1Score < utf8Score) {
    return { text: latin1, encoding: 'latin1', utf8Score, latin1Score };
  }
  return { text: utf8, encoding: 'utf8', utf8Score, latin1Score };
}

function parseJsonLike(value) {
  if (value == null || value === '') return [];
  if (typeof value !== 'string') {
    return Array.isArray(value) || typeof value === 'object' ? value : [];
  }

  const text = value.trim();
  if (!text) return [];

  const unquoteOuter = (s) => {
    if (!s || s.length < 2) return s;
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return s.slice(1, -1).trim();
    }
    return s;
  };

  const normalizeToken = (token) => {
    let t = String(token || '').trim();
    if (!t) return '';

    // Handle entries like ["Água Fria"] that are not parsed as JSON at first.
    t = t.replace(/^\[\s*/, '').replace(/\s*\]$/, '');
    t = unquoteOuter(t);
    t = t.replace(/""/g, '"').trim();
    t = normalizeCorruptedText(t);
    return t;
  };

  const parseJsonArrayIfPossible = (candidate) => {
    const normalizedJsonText = candidate.replace(/""/g, '"');
    if (!(normalizedJsonText.startsWith('[') || normalizedJsonText.startsWith('{'))) {
      return null;
    }
    try {
      const parsed = JSON.parse(normalizedJsonText);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => normalizeToken(item)).filter(Boolean);
      }
      return [];
    } catch (_) {
      return null;
    }
  };

  // Try JSON directly first.
  const directJson = parseJsonArrayIfPossible(text);
  if (directJson) return [...new Set(directJson)];

  // Then try after removing outer quotes from values like "[\"Água Fria\"]".
  const unquoted = unquoteOuter(text);
  const unquotedJson = parseJsonArrayIfPossible(unquoted);
  if (unquotedJson) return [...new Set(unquotedJson)];

  const sep = unquoted.includes('|') ? '|' : unquoted.includes(';') ? ';' : ',';
  const split = unquoted
    .split(sep)
    .map((v) => normalizeToken(v))
    .filter(Boolean);

  return [...new Set(split)];
}

function normalizeValue(field, rawValue) {
  if (rawValue === '') return null;
  if (JSON_FIELDS.has(field)) return parseJsonLike(rawValue);
  if (NUMERIC_FIELDS.has(field)) return parseNumericByField(field, rawValue);
  if (field === 'multiplos_executores') return parseBoolean(rawValue);
  if (field === 'inicio_planejado' || field === 'termino_planejado') return parseDateTime(rawValue);
  if (rawValue == null) return null;
  return normalizeCorruptedText(rawValue);
}

function buildPayload(record, mappedHeaders) {
  const payload = {};
  const aux = {};
  for (const [rawHeader, targetField] of mappedHeaders) {
    if (!targetField) continue;
    if (targetField.startsWith('__')) {
      aux[targetField] = normalizeCorruptedText(record[rawHeader]);
      continue;
    }
    payload[targetField] = normalizeValue(targetField, record[rawHeader]);
  }

  if (!payload.titulo && payload.numero) payload.titulo = payload.numero;
  if (!payload.caminho && payload.arquivo) payload.caminho = payload.arquivo;
  if (!payload.titulo) {
    payload.titulo = payload.arquivo || payload.descritivo || 'DOCUMENTO IMPORTADO';
  }

  return { payload, aux };
}

async function resolveDisciplina(client, payloadDisciplinaId, disciplinaRef, cache) {
  const byId = async (id) => {
    const key = `disc-id:${id}`;
    if (cache.has(key)) return cache.get(key);
    const found = await client.query('SELECT id, nome FROM disciplinas WHERE id = $1 LIMIT 1', [id]);
    const row = found.rows[0] || null;
    cache.set(key, row);
    if (row && row.nome) cache.set(`disc-name:${String(row.nome).toLowerCase()}`, row);
    return row;
  };

  const byName = async (name) => {
    const normalized = String(name || '').trim();
    if (!normalized) return null;
    const key = `disc-name:${normalized.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);

    const found = await client.query(
      'SELECT id, nome FROM disciplinas WHERE lower(nome) = lower($1) ORDER BY id DESC LIMIT 1',
      [normalized]
    );
    if (found.rows.length) {
      const row = found.rows[0];
      cache.set(key, row);
      cache.set(`disc-id:${row.id}`, row);
      return row;
    }

    const created = await client.query('INSERT INTO disciplinas (nome) VALUES ($1) RETURNING id, nome', [normalized]);
    const row = created.rows[0] || null;
    cache.set(key, row);
    if (row) cache.set(`disc-id:${row.id}`, row);
    return row;
  };

  if (Number.isInteger(payloadDisciplinaId) && payloadDisciplinaId > 0) {
    const row = await byId(payloadDisciplinaId);
    if (row) return { id: row.id, nome: row.nome, resolvedByName: false };
  }

  const refText = String(disciplinaRef || '').trim();
  if (!refText) return { id: null, nome: null, resolvedByName: false };

  const asNumber = parseNumber(refText);
  if (Number.isInteger(asNumber) && asNumber > 0) {
    const row = await byId(asNumber);
    if (row) return { id: row.id, nome: row.nome, resolvedByName: false };
  }

  const row = await byName(normalizeCorruptedText(refText));
  if (!row) return { id: null, nome: null, resolvedByName: false };
  return { id: row.id, nome: row.nome, resolvedByName: true };
}

function hasUsefulData(payload) {
  return Object.keys(payload).some((k) => {
    const v = payload[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
  });
}

async function upsertDocumento(client, payload, insertOnly) {
  if (!hasUsefulData(payload)) return { action: 'skipped' };

  const fields = Object.keys(payload).filter((k) => ALLOWED_FIELDS.has(k));
  if (!fields.length) return { action: 'skipped' };

  const dbValues = fields.map((field) => {
    const value = payload[field];
    if (JSON_FIELDS.has(field)) return JSON.stringify(value == null ? [] : value);
    return value;
  });

  const numero = payload.numero || null;
  const empreendimentoId = payload.empreendimento_id || null;
  let targetId = null;

  if (!insertOnly && numero) {
    if (empreendimentoId != null) {
      const existing = await client.query(
        'SELECT id FROM documentos WHERE numero = $1 AND empreendimento_id = $2 ORDER BY id DESC LIMIT 1',
        [numero, empreendimentoId]
      );
      if (existing.rows.length) targetId = existing.rows[0].id;
    } else {
      const existing = await client.query(
        'SELECT id FROM documentos WHERE numero = $1 ORDER BY id DESC LIMIT 1',
        [numero]
      );
      if (existing.rows.length) targetId = existing.rows[0].id;
    }
  }

  if (targetId) {
    const setSql = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
    const sql = `UPDATE documentos SET ${setSql}, updated_at = now() WHERE id = $${fields.length + 1} RETURNING id`;
    const result = await client.query(sql, [...dbValues, targetId]);
    return { action: 'updated', id: result.rows[0]?.id || targetId };
  }

  const colsSql = fields.join(', ');
  const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO documentos (${colsSql}) VALUES (${placeholders}) RETURNING id`;
  const result = await client.query(sql, dbValues);
  return { action: 'inserted', id: result.rows[0]?.id || null };
}

async function main() {
  const [, , csvPathArg, ...opts] = process.argv;
  if (!csvPathArg) {
    console.error('Uso: node scripts/import_documentos_csv.js <caminho_csv> [--sep=;] [--insert-only] [--dry-run]');
    process.exit(1);
  }

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

  const csvDecoded = readCsvTextWithBestEncoding(csvPath);

  const separatorOpt = opts.find((o) => o.startsWith('--sep='));
  const delimiter = separatorOpt ? separatorOpt.slice('--sep='.length) : detectDelimiter(csvDecoded.text);
  const insertOnly = opts.includes('--insert-only');
  const dryRun = opts.includes('--dry-run');

  const headerMap = new Map();
  let parserHeaders = [];
  const parser = Readable.from([csvDecoded.text]).pipe(parse({
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
  const cache = new Map();

  const client = await pool.connect();
  try {
    if (!dryRun) await client.query('BEGIN');

    for await (const record of parser) {
      stats.processed += 1;
      const built = buildPayload(record, headerMap);
      const payload = built.payload;
      const aux = built.aux;

      try {
        const originalDisciplinaId = payload.disciplina_id;
        const disciplinaResolved = await resolveDisciplina(client, payload.disciplina_id, aux.__disciplina_ref__, cache);
        payload.disciplina_id = disciplinaResolved.id;

        if ((!Array.isArray(payload.disciplinas) || payload.disciplinas.length === 0) && disciplinaResolved.nome) {
          payload.disciplinas = [disciplinaResolved.nome];
        }

        if (!originalDisciplinaId && disciplinaResolved.id && disciplinaResolved.resolvedByName) {
          stats.resolvedDisciplinaByName = (stats.resolvedDisciplinaByName || 0) + 1;
        }

        if (dryRun) {
          if (hasUsefulData(payload)) stats.inserted += 1;
          else stats.skipped += 1;
          continue;
        }

        const result = await upsertDocumento(client, payload, insertOnly);
        if (result.action === 'inserted') stats.inserted += 1;
        else if (result.action === 'updated') stats.updated += 1;
        else stats.skipped += 1;
      } catch (rowErr) {
        stats.errors += 1;
        errors.push({ line: stats.processed + 1, message: rowErr.message || String(rowErr) });
      }

      if (stats.processed % 200 === 0) {
        process.stdout.write(`Processadas ${stats.processed} linhas...\r`);
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
  console.log(`Encoding escolhido: ${csvDecoded.encoding} (score utf8=${csvDecoded.utf8Score}, latin1=${csvDecoded.latin1Score})`);
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
