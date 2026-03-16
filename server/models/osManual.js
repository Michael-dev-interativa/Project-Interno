const { pool } = require('../db/pool');

async function createOSManual({ numero, descricao, empreendimento_id }) {
  const res = await pool.query(
    `INSERT INTO os_manual (numero, descricao, empreendimento_id) VALUES ($1,$2,$3) RETURNING *`,
    [numero, descricao, empreendimento_id]
  );
  return res.rows[0];
}

async function listOSPorEmpreendimento(empreendimentoId) {
  const res = await pool.query('SELECT * FROM os_manual WHERE empreendimento_id = $1 ORDER BY created_at DESC', [empreendimentoId]);
  return res.rows;
}

module.exports = { createOSManual, listOSPorEmpreendimento };
