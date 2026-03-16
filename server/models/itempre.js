const { pool } = require('../db/pool');

async function createItem(data) {
  const q = `INSERT INTO itempre (
    empreendimento_id, item, data, de, descritiva, localizacao, assunto, comentario, disciplina, status, resposta, imagens
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`;

  let imagensVal = null;
  if (data.imagens !== undefined && data.imagens !== null) {
    if (typeof data.imagens === 'string') {
      try { imagensVal = JSON.stringify(JSON.parse(data.imagens)); } catch (e) { imagensVal = JSON.stringify([String(data.imagens)]); }
    } else {
      try { imagensVal = JSON.stringify(data.imagens); } catch (e) { imagensVal = null; }
    }
  }

  const vals = [
    data.empreendimento_id || null,
    data.item || null,
    data.data || null,
    data.de || null,
    data.descritiva || null,
    data.localizacao || null,
    data.assunto || null,
    data.comentario || null,
    data.disciplina || null,
    data.status || 'Em andamento',
    data.resposta || null,
    imagensVal
  ];

  const res = await pool.query(q, vals);
  return res.rows[0];
}

async function listItems(filter = {}, limit = 200) {
  const parts = [];
  const vals = [];
  let idx = 1;
  if (filter.empreendimento_id) {
    parts.push(`empreendimento_id = $${idx++}`);
    vals.push(filter.empreendimento_id);
  }
  if (filter.item) {
    parts.push(`item = $${idx++}`);
    vals.push(filter.item);
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  const q = `SELECT * FROM itempre ${where} ORDER BY id DESC LIMIT $${idx}`;
  vals.push(limit);
  const res = await pool.query(q, vals);
  return res.rows;
}

async function getItemById(id) {
  const res = await pool.query('SELECT * FROM itempre WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateItem(id, fields) {
  const keys = Object.keys(fields || {});
  if (!keys.length) return await getItemById(id);

  const sets = [];
  const values = [];

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    sets.push(`${k} = $${i + 1}`);
    let v = fields[k];

    if (k === 'imagens') {
      if (v === null || v === undefined) {
        v = null;
      } else if (typeof v === 'string') {
        try { const parsed = JSON.parse(v); v = JSON.stringify(parsed); } catch (e) { v = JSON.stringify([String(v)]); }
      } else {
        try { v = JSON.stringify(v); } catch (e) { v = null; }
      }
    }

    values.push(v);
  }

  const q = `UPDATE itempre SET ${sets.join(', ')}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  try {
    const res = await pool.query(q, [...values, id]);
    return res.rows[0] || null;
  } catch (err) {
    console.error('itempre.updateItem error', err && err.message, 'fields:', fields);
    throw err;
  }
}

async function deleteItem(id) {
  await pool.query('DELETE FROM itempre WHERE id = $1', [id]);
  return true;
}

module.exports = { createItem, listItems, getItemById, updateItem, deleteItem };
