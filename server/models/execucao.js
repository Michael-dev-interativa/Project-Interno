const { pool } = require('../db/pool');

const INTEGER_COLUMNS = new Set([
  'planejamento_atividade_id',
  'planejamento_id',
  'usuario_id',
  'minutos',
  'empreendimento_id'
]);

const BOOLEAN_COLUMNS = new Set([
  'pausado_automaticamente'
]);

function normalizeExecucaoPayload(payload = {}) {
  const out = {};

  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined) continue;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      const lower = trimmed.toLowerCase();

      if (lower === 'null' || lower === 'undefined') {
        out[key] = null;
        continue;
      }

      if (INTEGER_COLUMNS.has(key)) {
        if (trimmed === '') {
          out[key] = null;
          continue;
        }
        const asNumber = Number(trimmed);
        if (Number.isFinite(asNumber)) {
          out[key] = Math.trunc(asNumber);
          continue;
        }
      }

      if (BOOLEAN_COLUMNS.has(key)) {
        if (lower === 'true') {
          out[key] = true;
          continue;
        }
        if (lower === 'false') {
          out[key] = false;
          continue;
        }
      }

      out[key] = value;
      continue;
    }

    if (INTEGER_COLUMNS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.trunc(value);
      continue;
    }

    out[key] = value;
  }

  return out;
}

async function createExecucao(payload = {}) {
  // allow flexible payloads coming from frontend (planejamento_id, usuario, inicio, status, descritivo, empreendimento_id, etc)
  const normalizedPayload = normalizeExecucaoPayload(payload);
  const cols = Object.keys(normalizedPayload || {});
  if (cols.length === 0) {
    const res = await pool.query('INSERT INTO execucoes DEFAULT VALUES RETURNING *');
    return res.rows[0];
  }

  const params = cols.map((_, i) => `$${i + 1}`);
  const values = cols.map(k => {
    const v = normalizedPayload[k];
    // convert objects to JSON
    return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  });

  const q = `INSERT INTO execucoes (${cols.join(',')}) VALUES (${params.join(',')}) RETURNING *`;
  const res = await pool.query(q, values);
  return res.rows[0];
}

async function listExecucoesByPlanejamento(planejamentoId) {
  // support both coluna names for backward compatibility
  try {
    const res = await pool.query('SELECT * FROM execucoes WHERE planejamento_id = $1 ORDER BY inicio DESC', [planejamentoId]);
    return res.rows;
  } catch (e) {
    const res = await pool.query('SELECT * FROM execucoes WHERE planejamento_atividade_id = $1 ORDER BY data_execucao DESC', [planejamentoId]);
    return res.rows;
  }
}

async function getExecucaoById(id) {
  const res = await pool.query('SELECT * FROM execucoes WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateExecucao(id, fields = {}) {
  const normalizedFields = normalizeExecucaoPayload(fields);
  const keys = Object.keys(normalizedFields);
  if (!keys.length) return getExecucaoById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => normalizedFields[k]);
  const q = `UPDATE execucoes SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteExecucao(id) {
  const res = await pool.query('DELETE FROM execucoes WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

module.exports = { createExecucao, listExecucoesByPlanejamento, getExecucaoById, updateExecucao, deleteExecucao };
