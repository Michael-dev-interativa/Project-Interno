const { pool } = require('../db/pool');

async function createPlanejamentoAtividade(data = {}) {
  const cols = [
    'titulo', 'descricao', 'atividade_id', 'empreendimento_id', 'executor_principal', 'executores', 'executor_id',
    'inicio_previsto', 'fim_previsto', 'inicio_planejado', 'termino_planejado', 'tempo_planejado', 'tempo_executado',
    'horas_por_dia', 'horas_executadas_por_dia', 'status'
  ];

  const keys = [];
  const values = [];
  const params = [];
  cols.forEach((c) => {
    if (data[c] !== undefined) {
      keys.push(c);
      values.push(data[c]);
      params.push(`$${params.length + 1}`);
    }
  });

  // titulo is required for frontend flows; fallback to provided data.titulo or null
  if (!keys.includes('titulo')) {
    keys.unshift('titulo');
    values.unshift(data.titulo || data.titulo || null);
    params.unshift('$1');
  }

  const converted = values.map(v => (typeof v === 'object' ? JSON.stringify(v) : v));
  const q = `INSERT INTO planejamento_atividades (${keys.join(',')}) VALUES (${params.join(',')}) RETURNING *`;
  const res = await pool.query(q, converted);
  return res.rows[0];
}

async function listPlanejamentos(limit = 200) {
  const res = await pool.query('SELECT * FROM planejamento_atividades ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows;
}

async function getPlanejamentoById(id) {
  const res = await pool.query('SELECT * FROM planejamento_atividades WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function deletePlanejamento(id) {
  await pool.query('DELETE FROM planejamento_atividades WHERE id = $1', [id]);
}

async function updatePlanejamento(id, fields = {}) {
  const keys = Object.keys(fields);
  if (!keys.length) return getPlanejamentoById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  const q = `UPDATE planejamento_atividades SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

module.exports = { createPlanejamentoAtividade, listPlanejamentos, getPlanejamentoById, deletePlanejamento, updatePlanejamento };
