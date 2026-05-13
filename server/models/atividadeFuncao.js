const { pool } = require('../db/pool');

async function createAtividadeFuncao(data) {
  const { nome, funcao, frequencia, tempo_estimado, dias_semana, dia_mes } = data;
  const res = await pool.query(
    `INSERT INTO atividade_funcoes (nome, funcao, frequencia, tempo_estimado, dias_semana, dia_mes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [nome, funcao || null, frequencia || null, tempo_estimado || null, dias_semana || null, dia_mes || null]
  );
  return res.rows[0];
}

async function listAtividadeFuncoes() {
  const res = await pool.query('SELECT * FROM atividade_funcoes ORDER BY id');
  return res.rows;
}

async function updateAtividadeFuncao(id, data) {
  const { nome, funcao, frequencia, tempo_estimado, dias_semana, dia_mes } = data;
  const res = await pool.query(
    `UPDATE atividade_funcoes
     SET nome=$1, funcao=$2, frequencia=$3, tempo_estimado=$4, dias_semana=$5, dia_mes=$6
     WHERE id=$7 RETURNING *`,
    [nome, funcao || null, frequencia || null, tempo_estimado || null, dias_semana || null, dia_mes || null, id]
  );
  return res.rows[0] || null;
}

async function deleteAtividadeFuncao(id) {
  await pool.query('DELETE FROM atividade_funcoes WHERE id=$1', [id]);
}

module.exports = { createAtividadeFuncao, listAtividadeFuncoes, updateAtividadeFuncao, deleteAtividadeFuncao };
