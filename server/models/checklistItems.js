const { pool } = require('../db/pool');

const JSON_COLUMNS = new Set(['status_por_periodo', 'folhas']);
const INTEGER_COLUMNS = new Set(['checklist_id', 'section_id', 'ordem', 'responsavel_id']);
const ALLOWED_COLUMNS = new Set([
  'checklist_id',
  'secao',
  'numero_item',
  'descricao',
  'contribuicao',
  'tempo',
  'observacoes',
  'conclusao',
  'status',
  'folhas',
  'ordem',
  'status_por_periodo',
  'section_id',
  'titulo',
  'concluido',
  'responsavel_id'
]);

function normalizeJsonColumn(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return value;
  return [];
}

function sanitizeItemPayload(payload = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!ALLOWED_COLUMNS.has(key)) continue;
    let normalized = value;
    if (JSON_COLUMNS.has(key)) {
      normalized = normalizeJsonColumn(value);
    }
    if (INTEGER_COLUMNS.has(key) && normalized !== null && normalized !== undefined) {
      const parsed = Number(normalized);
      normalized = Number.isNaN(parsed) ? null : parsed;
    }
    sanitized[key] = normalized;
  }
  return sanitized;
}

function encodeJsonValue(column, value) {
  if (!JSON_COLUMNS.has(column)) return value;
  try {
    return JSON.stringify(value || []);
  } catch (err) {
    console.error('Invalid JSON value for checklist item column', column, err);
    return '[]';
  }
}

async function listItems(filters = {}) {
  const conditions = [];
  const values = [];
  let idx = 1;
  if (filters.checklist_id) {
    conditions.push(`checklist_id = $${idx++}`);
    values.push(filters.checklist_id);
  }
  if (filters.secao) {
    conditions.push(`secao = $${idx++}`);
    values.push(filters.secao);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT * FROM checklist_items ${where} ORDER BY ordem ASC, id ASC`,
    values
  );
  return result.rows;
}

async function createItem(payload = {}) {
  const sanitized = sanitizeItemPayload(payload);
  const columns = Object.keys(sanitized);
  if (!columns.length) {
    const res = await pool.query('INSERT INTO checklist_items DEFAULT VALUES RETURNING *');
    return res.rows[0];
  }
  const values = columns.map((col) => encodeJsonValue(col, sanitized[col]));
  const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
  const query = `INSERT INTO checklist_items (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const res = await pool.query(query, values);
  return res.rows[0];
}

async function updateItem(id, payload = {}) {
  const sanitized = sanitizeItemPayload(payload);
  const keys = Object.keys(sanitized);
  if (!keys.length) {
    const res = await pool.query('SELECT * FROM checklist_items WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
  const sets = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
  const values = keys.map((key) => encodeJsonValue(key, sanitized[key]));
  const res = await pool.query(
    `UPDATE checklist_items SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return res.rows[0] || null;
}

async function deleteItem(id) {
  const res = await pool.query('DELETE FROM checklist_items WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

module.exports = {
  listItems,
  createItem,
  updateItem,
  deleteItem
};
