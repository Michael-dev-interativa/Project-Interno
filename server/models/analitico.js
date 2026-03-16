const { pool } = require('../db/pool');

async function createAnalitico({ empreendimento_id, titulo, dados }) {
  const res = await pool.query(
    `INSERT INTO analiticos (empreendimento_id, titulo, dados) VALUES ($1,$2,$3) RETURNING *`,
    [empreendimento_id, titulo, dados]
  );
  return res.rows[0];
}

async function listAnaliticos(limit = 100) {
  const res = await pool.query('SELECT * FROM analiticos ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows;
}

module.exports = { createAnalitico, listAnaliticos };
