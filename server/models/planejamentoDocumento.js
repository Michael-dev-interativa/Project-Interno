const { pool } = require('../db/pool');

// Inserção flexível de planejamento por documento, armazenando horas_por_dia e metadados
async function linkDocumentoToPlanejamento(payload = {}) {
  const cols = [
    'planejamento_atividade_id', 'documento_id', 'etapa', 'executor_principal', 'executores',
    'inicio_planejado', 'termino_planejado', 'tempo_planejado', 'tempo_executado', 'horas_por_dia', 'horas_executadas_por_dia', 'status'
  ];

  const keys = [];
  const values = [];
  const params = [];
  cols.forEach((c) => {
    if (payload[c] !== undefined) {
      keys.push(c);
      values.push(payload[c]);
      params.push(`$${params.length + 1}`);
    }
  });

  // Always include minimal required fields if not provided
  if (!keys.includes('planejamento_atividade_id') && payload.planejamento_atividade_id !== undefined) {
    keys.push('planejamento_atividade_id');
    values.push(payload.planejamento_atividade_id);
    params.push(`$${params.length + 1}`);
  }
  if (!keys.includes('documento_id') && payload.documento_id !== undefined) {
    keys.push('documento_id');
    values.push(payload.documento_id);
    params.push(`$${params.length + 1}`);
  }

  // If still no keys, fallback to simple insert
  if (!keys.length) {
    const res = await pool.query(
      `INSERT INTO planejamento_documentos (planejamento_atividade_id, documento_id, etapa) VALUES ($1,$2,$3) RETURNING *`,
      [payload.planejamento_atividade_id || null, payload.documento_id || null, payload.etapa || null]
    );
    return res.rows[0];
  }

  // Convert objects/arrays to JSON where appropriate
  const converted = values.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v));

  const q = `INSERT INTO planejamento_documentos (${keys.join(',')}) VALUES (${params.join(',')}) RETURNING *`;
  const res = await pool.query(q, converted);
  return res.rows[0];
}

async function listByPlanejamento(planejamentoId) {
  const res = await pool.query('SELECT * FROM planejamento_documentos WHERE planejamento_atividade_id = $1 ORDER BY id', [planejamentoId]);
  return res.rows;
}

async function deleteById(id) {
  const res = await pool.query('DELETE FROM planejamento_documentos WHERE id = $1 RETURNING *', [id]);
  return res.rows[0] || null;
}

async function updateById(id, fields = {}) {
  const keys = Object.keys(fields || {});
  if (!keys.length) return (await pool.query('SELECT * FROM planejamento_documentos WHERE id = $1', [id])).rows[0] || null;

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => {
    const v = fields[k];
    return typeof v === 'object' ? JSON.stringify(v) : v;
  });

  const q = `UPDATE planejamento_documentos SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

module.exports = { linkDocumentoToPlanejamento, listByPlanejamento, deleteById, updateById };
