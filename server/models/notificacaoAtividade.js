const { pool } = require('../db/pool');
const { randomUUID } = require('crypto');

async function createNotificacao(data) {
  const {
    usuario_email, atividade_funcao_id, atividade_nome, tempo_estimado,
    status = 'pendente', data_notificacao,
    planejamento_atividade_id = null, tipo = null, payload = null,
  } = data;

  const token_resposta = randomUUID();
  const res = await pool.query(
    `INSERT INTO notificacoes_atividade
       (usuario_email, atividade_funcao_id, atividade_nome, tempo_estimado,
        status, data_notificacao, planejamento_atividade_id, tipo, payload, token_resposta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      usuario_email, atividade_funcao_id || null, atividade_nome || null,
      tempo_estimado || null, status,
      data_notificacao || new Date().toISOString().split('T')[0],
      planejamento_atividade_id, tipo, payload ? JSON.stringify(payload) : null,
      token_resposta,
    ]
  );
  return res.rows[0];
}

async function listNotificacoes(filters = {}, limit = 200) {
  const conditions = [];
  const values = [];

  if (filters.usuario_email) {
    values.push(filters.usuario_email);
    conditions.push(`usuario_email = $${values.length}`);
  }
  if (filters.status && typeof filters.status === 'string') {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filters.data_notificacao_gte) {
    values.push(filters.data_notificacao_gte);
    conditions.push(`data_notificacao >= $${values.length}`);
  }

  values.push(limit);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await pool.query(
    `SELECT * FROM notificacoes_atividade ${where} ORDER BY id DESC LIMIT $${values.length}`,
    values
  );
  return res.rows;
}

async function updateNotificacao(id, data) {
  const allowed = ['status', 'data_agendada', 'planejamento_id', 'email_enviado'];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      values.push(data[key]);
      sets.push(`${key} = $${values.length}`);
    }
  }

  if (sets.length === 0) return null;

  values.push(id);
  const res = await pool.query(
    `UPDATE notificacoes_atividade SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
    values
  );
  return res.rows[0] || null;
}

async function getByToken(token) {
  const res = await pool.query(
    'SELECT * FROM notificacoes_atividade WHERE token_resposta = $1',
    [token]
  );
  return res.rows[0] || null;
}

async function getPendentesParaEmail() {
  const res = await pool.query(`
    SELECT n.*, u.name AS usuario_nome
    FROM notificacoes_atividade n
    LEFT JOIN users u ON u.email = n.usuario_email
    WHERE n.status = 'pendente' AND n.email_enviado = FALSE
    ORDER BY n.id ASC
  `);
  return res.rows;
}

module.exports = { createNotificacao, listNotificacoes, updateNotificacao, getByToken, getPendentesParaEmail };
