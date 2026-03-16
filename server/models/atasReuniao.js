const { pool } = require('../db/pool');

const ALLOWED_COLUMNS = [
  'empreendimento_id',
  'titulo',
  'assunto',
  'local',
  'data',
  'horario',
  'data_reuniao',
  'conteudo',
  'participantes',
  'providencias',
  'folha',
  'rev',
  'controle',
  'emissao',
  'status'
];

const JSON_COLUMNS = new Set(['participantes', 'providencias']);

const SORT_COLUMN_MAP = {
  created_date: 'created_at',
  created_at: 'created_at',
  data: 'data',
  data_reuniao: 'data_reuniao',
  id: 'id'
};

let ataColumnsCache = null;

async function getAtaColumns() {
  if (ataColumnsCache) return ataColumnsCache;
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'atas_reuniao'`
  );
  ataColumnsCache = new Set(res.rows.map((row) => row.column_name));
  return ataColumnsCache;
}

function parseSortParam(sortParam) {
  const defaultSort = { column: 'created_at', direction: 'DESC' };
  if (!sortParam) return defaultSort;
  const columnKey = sortParam.replace(/^-/, '');
  const direction = sortParam.startsWith('-') ? 'DESC' : 'ASC';
  const column = SORT_COLUMN_MAP[columnKey] || 'created_at';
  return { column, direction };
}

function resolveSortColumn(column, availableColumns) {
  if (availableColumns.has(column)) return column;
  if (availableColumns.has('created_at')) return 'created_at';
  const iterator = availableColumns.values();
  const fallback = iterator.next();
  return fallback.done ? 'id' : fallback.value;
}

function normalizeToJsonValue(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    return String(value);
  }
}

function sanitizeJsonArray(value) {
  if (!Array.isArray(value)) return value;
  return value.map(normalizeToJsonValue);
}

function sanitizeProvidenciasArray(value) {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== 'object') return {};
    return {
      projeto: normalizeToJsonValue(item.projeto),
      providencias: normalizeToJsonValue(item.providencias),
      respostas: sanitizeJsonArray(item.respostas) || [],
      responsaveis: sanitizeJsonArray(item.responsaveis) || [],
      dataReuniao: normalizeToJsonValue(item.dataReuniao),
      dataRetorno: normalizeToJsonValue(item.dataRetorno),
      status: normalizeToJsonValue(item.status)
    };
  });
}

function sanitizeAtaJsonFields(payload = {}) {
  const sanitized = { ...payload };
  if (payload.participantes !== undefined) {
    sanitized.participantes = sanitizeJsonArray(payload.participantes);
  }
  if (payload.providencias !== undefined) {
    sanitized.providencias = sanitizeProvidenciasArray(payload.providencias);
  }
  return sanitized;
}

function encodeJsonValue(column, value) {
  if (!JSON_COLUMNS.has(column)) return value;
  if (value === undefined || value === null) return JSON.stringify([]);
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.error(`Failed to stringify JSON column ${column}:`, err);
    return JSON.stringify([]);
  }
}

async function runQuery(query, values, context) {
  try {
    return await pool.query(query, values);
  } catch (err) {
    if (err && err.code === '22P02') {
      console.error('JSON syntax error while running query', context, 'values:', values);
    }
    throw err;
  }
}

async function createAta(payload = {}) {
  const safePayload = sanitizeAtaJsonFields(payload);
  const availableColumns = await getAtaColumns();
  const columns = ALLOWED_COLUMNS.filter(
    (col) => safePayload[col] !== undefined && availableColumns.has(col)
  );

  if (!columns.length) {
    const res = await pool.query('INSERT INTO atas_reuniao DEFAULT VALUES RETURNING *');
    return res.rows[0];
  }

  const values = columns.map((col) => encodeJsonValue(col, safePayload[col]));
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
  const query = `INSERT INTO atas_reuniao (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const res = await runQuery(query, values, { op: 'createAta', columns });
  return res.rows[0];
}

async function getAtaById(id) {
  if (!id) return null;
  const res = await pool.query('SELECT * FROM atas_reuniao WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function listAtas({ sort, limit = 100, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);
  const { column, direction } = parseSortParam(sort);
  const availableColumns = await getAtaColumns();
  const sortColumn = resolveSortColumn(column, availableColumns);
  const res = await pool.query(
    `SELECT * FROM atas_reuniao ORDER BY ${sortColumn} ${direction} LIMIT $1 OFFSET $2`,
    [safeLimit, safeOffset]
  );
  return res.rows;
}

async function listAtasByEmpreendimento(empreendimentoId) {
  const res = await pool.query(
    'SELECT * FROM atas_reuniao WHERE empreendimento_id = $1 ORDER BY data_reuniao DESC',
    [empreendimentoId]
  );
  return res.rows;
}

async function updateAta(id, fields) {
  const safeFields = sanitizeAtaJsonFields(fields || {});
  const availableColumns = await getAtaColumns();
  const keys = Object.keys(safeFields || {}).filter((key) => availableColumns.has(key));
  if (!keys.length) {
    const row = (await pool.query('SELECT * FROM atas_reuniao WHERE id = $1', [id])).rows[0];
    return row || null;
  }
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map((k) => encodeJsonValue(k, safeFields[k]));
  const q = `UPDATE atas_reuniao SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  const result = await runQuery(q, [...values, id], { op: 'updateAta', keys });
  return result.rows[0] || null;
}

async function deleteAta(id) {
  await pool.query('DELETE FROM atas_reuniao WHERE id = $1', [id]);
}

module.exports = {
  createAta,
  getAtaById,
  listAtas,
  listAtasByEmpreendimento,
  updateAta,
  deleteAta
};
