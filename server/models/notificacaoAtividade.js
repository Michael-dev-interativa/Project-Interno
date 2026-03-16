const { pool } = require('../db/pool');

async function createNotificacao({ planejamento_atividade_id, tipo, payload }) {
  const res = await pool.query(
    `INSERT INTO notificacoes_atividade (planejamento_atividade_id, tipo, payload) VALUES ($1,$2,$3) RETURNING *`,
    [planejamento_atividade_id, tipo, payload]
  );
  return res.rows[0];
}

async function listNotificacoes(usuarioId, limit = 100) {
  const res = await pool.query('SELECT * FROM notificacoes_atividade ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows;
}

module.exports = { createNotificacao, listNotificacoes };
