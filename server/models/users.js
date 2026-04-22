const { pool } = require('../db/pool');

async function createUser(payload = {}) {
  const email = String(payload.email || '').trim().toLowerCase();
  const name = payload.name || payload.nome || null;
  const password_hash = payload.password_hash || null;
  const role = payload.role || payload.perfil || 'user';
  const datas_indisponiveis = Array.isArray(payload.datas_indisponiveis)
    ? payload.datas_indisponiveis
    : [];
  const usuarios_permitidos_visualizar = Array.isArray(payload.usuarios_permitidos_visualizar)
    ? payload.usuarios_permitidos_visualizar
    : [];
  const result = await pool.query(
    `INSERT INTO users (email, name, password_hash, role, datas_indisponiveis, usuarios_permitidos_visualizar) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [email, name, password_hash, role, JSON.stringify(datas_indisponiveis), JSON.stringify(usuarios_permitidos_visualizar)]
  );
  return result.rows[0];
}

async function getUserById(id) {
  const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getUserByEmail(email) {
  const res = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return res.rows[0] || null;
}

async function updateUser(id, fields = {}) {
  // map common frontend keys (Portuguese) to DB columns
  const mapped = { ...fields };
  if ('nome' in mapped) mapped.name = mapped.nome;
  if ('perfil' in mapped) mapped.role = mapped.perfil;
  if ('email' in mapped) mapped.email = String(mapped.email || '').trim().toLowerCase();

  // only allow updating known columns
  const allowed = new Set(['email', 'name', 'password_hash', 'role', 'datas_indisponiveis', 'usuarios_permitidos_visualizar']);
  const keys = Object.keys(mapped).filter(k => allowed.has(k));
  if (!keys.length) return getUserById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => mapped[k] && (k === 'datas_indisponiveis' || k === 'usuarios_permitidos_visualizar') ? JSON.stringify(mapped[k]) : mapped[k]);
  const q = `UPDATE users SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = { createUser, getUserById, getUserByEmail, updateUser, deleteUser };
