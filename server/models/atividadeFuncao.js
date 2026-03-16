const { pool } = require('../db/pool');

async function createAtividadeFuncao({ nome, descricao }) {
  const res = await pool.query(
    `INSERT INTO atividade_funcoes (nome, descricao) VALUES ($1,$2) RETURNING *`,
    [nome, descricao]
  );
  return res.rows[0];
}

async function listAtividadeFuncoes() {
  const res = await pool.query('SELECT * FROM atividade_funcoes ORDER BY id');
  return res.rows;
}

module.exports = { createAtividadeFuncao, listAtividadeFuncoes };
