const { pool } = require('../db/pool');

async function createSobra({ usuario_id, minutos, motivo }) {
  const res = await pool.query(
    `INSERT INTO sobras_usuario (usuario_id, minutos, motivo) VALUES ($1,$2,$3) RETURNING *`,
    [usuario_id, minutos, motivo]
  );
  return res.rows[0];
}

async function listSobrasByUsuario(usuarioId) {
  const res = await pool.query('SELECT * FROM sobras_usuario WHERE usuario_id = $1 ORDER BY created_at DESC', [usuarioId]);
  return res.rows;
}

module.exports = { createSobra, listSobrasByUsuario };
