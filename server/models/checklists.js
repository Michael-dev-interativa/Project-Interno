const { pool } = require('../db/pool');

const JSON_COLUMNS = new Set(['periodos']);
const DATE_COLUMNS = new Set(['data_entrega', 'periodo_inicio', 'periodo_termino']);
const ALLOWED_COLUMNS = new Set([
  'tipo',
  'cliente',
  'numero_os',
  'tecnico_responsavel',
  'data_entrega',
  'periodo_inicio',
  'periodo_termino',
  'periodos',
  'status',
  'etapa',
  'referencia',
  'observacoes',
  'empreendimento_id'
]);

function parseJsonValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function sanitizeChecklistPayload(payload = {}) {
  const sanitized = {};
  for (const key of Object.keys(payload || {})) {
    if (!ALLOWED_COLUMNS.has(key)) continue;
    let value = payload[key];
    if (JSON_COLUMNS.has(key)) {
      value = parseJsonValue(value);
      if (value === undefined || value === null) {
        value = [];
      } else if (!Array.isArray(value)) {
        value = Array.isArray(value) ? value : [value];
      }
    }

    if (DATE_COLUMNS.has(key) && value) {
      value = new Date(value).toISOString().split('T')[0];
    }

    if (key === 'empreendimento_id' && value !== null && value !== undefined) {
      const parsed = Number(value);
      value = Number.isNaN(parsed) ? null : parsed;
    }

    sanitized[key] = value;
  }
  return sanitized;
}

function encodeJsonValue(column, value) {
  if (!JSON_COLUMNS.has(column)) return value;
  if (value === undefined || value === null) return '[]';
  try {
    return JSON.stringify(value);
  } catch (err) {
    console.error('Failed to stringify checklist JSON column', column, err);
    return JSON.stringify([]);
  }
}

async function listChecklists() {
  const res = await pool.query('SELECT * FROM checklists ORDER BY created_at DESC');
  return res.rows;
}

async function getChecklistById(id) {
  if (!id) return null;
  const res = await pool.query('SELECT * FROM checklists WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createChecklist(payload = {}) {
  const sanitized = sanitizeChecklistPayload(payload);
  const columns = Object.keys(sanitized);
  if (!columns.length) {
    const res = await pool.query('INSERT INTO checklists DEFAULT VALUES RETURNING *');
    return res.rows[0];
  }

  const values = columns.map((col) => encodeJsonValue(col, sanitized[col]));
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
  const query = `INSERT INTO checklists (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const res = await pool.query(query, values);
  return res.rows[0];
}

async function updateChecklist(id, payload = {}) {
  const sanitized = sanitizeChecklistPayload(payload);
  const keys = Object.keys(sanitized);
  if (!keys.length) {
    return getChecklistById(id);
  }
  const sets = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
  const values = keys.map((key) => encodeJsonValue(key, sanitized[key]));
  const query = `UPDATE checklists SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(query, [...values, id]);
  return res.rows[0] || null;
}

async function deleteChecklist(id) {
  const res = await pool.query('DELETE FROM checklists WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

module.exports = {
  listChecklists,
  getChecklistById,
  createChecklist,
  updateChecklist,
  deleteChecklist
};
