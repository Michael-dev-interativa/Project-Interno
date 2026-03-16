const { pool } = require('../db/pool');

async function createOrcamento({ proposta_id, descricao, valor }) {
  const res = await pool.query(
    `INSERT INTO orcamentos (proposta_id, descricao, valor) VALUES ($1,$2,$3) RETURNING *`,
    [proposta_id, descricao, valor]
  );
  return res.rows[0];
}

async function listOrcamentosByProposta(propostaId) {
  const res = await pool.query('SELECT * FROM orcamentos WHERE proposta_id = $1 ORDER BY id DESC', [propostaId]);
  return res.rows;
}

module.exports = { createOrcamento, listOrcamentosByProposta };
