const { pool } = require('../db/pool');

async function createAlocacao(payload) {
  const {
    empreendimento_id = null,
    usuario_id = null,
    usuario_email = null,
    data = null,
    tipo = null,
    referencia = null,
    label = null,
    cor = null
  } = payload || {};

  // Resolve usuario_id by email if missing
  let resolvedUsuarioId = usuario_id;
  try {
    if ((!resolvedUsuarioId || resolvedUsuarioId === null) && usuario_email) {
      const userRes = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [usuario_email]);
      if (userRes.rows && userRes.rows[0]) resolvedUsuarioId = userRes.rows[0].id;
    }
  } catch (err) {
    // ignore resolution errors, proceed with null id
    console.warn('alocacaoEquipe.createAlocacao: erro ao resolver usuario por email', err && err.message);
  }

  // Resolve empreendimento_id from os_manual.referencia if missing
  let resolvedEmpreendimentoId = empreendimento_id;
  try {
    if ((!resolvedEmpreendimentoId || resolvedEmpreendimentoId === null) && referencia) {
      // Try to find os_manual with numero matching referencia
      const osRes = await pool.query('SELECT empreendimento_id FROM os_manual WHERE numero = $1 LIMIT 1', [referencia]);
      if (osRes.rows && osRes.rows[0] && osRes.rows[0].empreendimento_id) {
        resolvedEmpreendimentoId = osRes.rows[0].empreendimento_id;
      }
    }
  } catch (err) {
    console.warn('alocacaoEquipe.createAlocacao: erro ao resolver empreendimento por referencia', err && err.message);
  }

  const res = await pool.query(
    `INSERT INTO alocacao_equipe (empreendimento_id, usuario_id, usuario_email, data, tipo, referencia, label, cor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [resolvedEmpreendimentoId, resolvedUsuarioId, usuario_email, data, tipo, referencia, label, cor]
  );
  return res.rows[0];
}

async function listAlocacao(filters = {}, limit = 200) {
  const where = [];
  const params = [];
  let idx = 1;

  if (filters.empreendimento_id !== undefined && filters.empreendimento_id !== null) {
    where.push(`ae.empreendimento_id = $${idx++}`);
    params.push(filters.empreendimento_id);
  }
  if (filters.usuario_id !== undefined && filters.usuario_id !== null) {
    where.push(`ae.usuario_id = $${idx++}`);
    params.push(filters.usuario_id);
  }
  if (filters.usuario_email) {
    where.push(`(ae.usuario_email = $${idx++} OR u.email = $${idx - 1})`);
    params.push(filters.usuario_email);
  }
  if (filters.data) {
    where.push(`ae.data = $${idx++}`);
    params.push(filters.data);
  }
  if (filters.tipo) {
    where.push(`ae.tipo = $${idx++}`);
    params.push(filters.tipo);
  }
  if (filters.os) {
    where.push(`ae.referencia = $${idx++}`);
    params.push(filters.os);
  }

  let q = `SELECT ae.*, u.email AS usuario_email_db, u.name AS usuario_name, emp.nome AS empreendimento_nome
           FROM alocacao_equipe ae
           LEFT JOIN users u ON ae.usuario_id = u.id
           LEFT JOIN empreendimentos emp ON ae.empreendimento_id = emp.id`;
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ` ORDER BY ae.id DESC LIMIT $${idx}`;
  params.push(limit);

  const result = await pool.query(q, params);

  // Normalize output: prefer existing usuario_email field, but include empreendimento_nome
  return (result.rows || []).map(r => ({
    ...r,
    usuario_email: r.usuario_email || r.usuario_email_db || null,
    usuario_name: r.usuario_name || null,
    empreendimento_nome: r.empreendimento_nome || null
  }));
}

async function updateAlocacao(id, fields) {
  const keys = Object.keys(fields || {});
  if (!keys.length) return (await pool.query('SELECT * FROM alocacao_equipe WHERE id = $1', [id])).rows[0] || null;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  const q = `UPDATE alocacao_equipe SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteAlocacao(id) {
  await pool.query('DELETE FROM alocacao_equipe WHERE id = $1', [id]);
}

module.exports = { createAlocacao, listAlocacao, updateAlocacao, deleteAlocacao };
