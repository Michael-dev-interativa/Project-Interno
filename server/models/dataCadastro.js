const { pool } = require('../db/pool');

const UPDATABLE_FIELDS = new Set(['empreendimento_id', 'ordem', 'documento_id', 'datas']);

function normalizeDatas(value) {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return {};
    }
  }
  return value;
}

async function createDataCadastro({ empreendimento_id, ordem, documento_id = null, datas = {} }) {
  const res = await pool.query(
    `INSERT INTO data_cadastro (empreendimento_id, ordem, documento_id, datas)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *`,
    [empreendimento_id, ordem, documento_id, JSON.stringify(normalizeDatas(datas))]
  );
  return res.rows[0];
}

async function listDataCadastro(filter = {}, limit = 200) {
  const parts = [];
  const values = [];
  let idx = 1;

  if (filter.empreendimento_id !== undefined && filter.empreendimento_id !== null) {
    parts.push(`empreendimento_id = $${idx++}`);
    values.push(filter.empreendimento_id);
  }

  if (filter.documento_id !== undefined && filter.documento_id !== null) {
    parts.push(`documento_id = $${idx++}`);
    values.push(filter.documento_id);
  }

  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  values.push(limit);

  const q = `SELECT * FROM data_cadastro ${where} ORDER BY ordem ASC, id ASC LIMIT $${idx}`;
  const res = await pool.query(q, values);
  return res.rows;
}

async function getById(id) {
  const res = await pool.query('SELECT * FROM data_cadastro WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateById(id, fields = {}) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE_FIELDS.has(k));
  if (!keys.length) return getById(id);

  const sets = [];
  const values = [];

  keys.forEach((k, i) => {
    if (k === 'datas') {
      sets.push(`${k} = $${i + 1}::jsonb`);
      values.push(JSON.stringify(normalizeDatas(fields[k])));
      return;
    }
    sets.push(`${k} = $${i + 1}`);
    values.push(fields[k]);
  });

  const q = `UPDATE data_cadastro
             SET ${sets.join(', ')}, updated_at = now()
             WHERE id = $${keys.length + 1}
             RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteById(id) {
  await pool.query('DELETE FROM data_cadastro WHERE id = $1', [id]);
  return true;
}

module.exports = {
  createDataCadastro,
  listDataCadastro,
  getById,
  updateById,
  deleteById,
};
