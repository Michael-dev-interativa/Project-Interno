const { pool } = require('../db/pool');

async function createAlteracao({ atividade_id, etapa_anterior, etapa_nova, criado_por }) {
  const res = await pool.query(
    `INSERT INTO alteracoes_etapa (atividade_id, etapa_anterior, etapa_nova, criado_por) VALUES ($1,$2,$3,$4) RETURNING *`,
    [atividade_id, etapa_anterior, etapa_nova, criado_por]
  );
  return res.rows[0];
}

async function listAlteracoesByAtividade(atividadeId) {
  const res = await pool.query('SELECT * FROM alteracoes_etapa WHERE atividade_id = $1 ORDER BY created_at DESC', [atividadeId]);
  return res.rows;
}

module.exports = { createAlteracao, listAlteracoesByAtividade };
