const { pool } = require('../db/pool');

const UPDATABLE_FIELDS = new Set(['empreendimento_id', 'nome', 'ordem', 'area', 'escala']);

async function createPavimento({ empreendimento_id, nome, ordem, area = null, escala = null }) {
  const res = await pool.query(
    `INSERT INTO pavimentos (empreendimento_id, nome, ordem, area, escala) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [empreendimento_id, nome, ordem, area, escala]
  );
  return res.rows[0];
}

async function listPavimentosByEmpreendimento(empreendimentoId) {
  const res = await pool.query('SELECT * FROM pavimentos WHERE empreendimento_id = $1 ORDER BY ordem', [empreendimentoId]);
  return res.rows;
}

async function updatePavimento(id, fields = {}) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE_FIELDS.has(k));
  if (!keys.length) return null;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  const q = `UPDATE pavimentos SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

module.exports = { createPavimento, listPavimentosByEmpreendimento, updatePavimento };
