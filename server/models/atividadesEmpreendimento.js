const { pool } = require('../db/pool');

async function createAtividadeEmp(fields) {
  const {
    id_atividade,
    empreendimento_id,
    documento_id,
    etapa,
    disciplina,
    subdisciplina,
    atividade,
    predecessora,
    tempo,
    funcao,
    documento_ids,
    status_planejamento,
    documento_id_original
  } = fields || {};

  try {
    // ensure documento_id_original is set (preserve original association)
    const documentoOrig = documento_id_original || documento_id || null;
    const statusFinal = status_planejamento || 'nao_planejada';

    const res = await pool.query(
      `INSERT INTO atividades_empreendimento (
        id_atividade, empreendimento_id, documento_id, documento_id_original, etapa, disciplina, subdisciplina,
        atividade, predecessora, tempo, funcao, documento_ids, status_planejamento
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13) RETURNING *`,
      [
        id_atividade || null,
        empreendimento_id || null,
        documento_id || null,
        documentoOrig,
        etapa || null,
        disciplina || null,
        subdisciplina || null,
        atividade || null,
        predecessora || null,
        tempo == null ? null : Number(tempo),
        funcao || null,
        documento_ids ? JSON.stringify(documento_ids) : null,
        statusFinal
      ]
    );
    console.log('createAtividadeEmp inserted:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('createAtividadeEmp error:', err, 'fields:', JSON.stringify(fields));
    throw err;
  }
}

async function listByFilter(filter = {}, limit = 500) {
  const where = [];
  const params = [];
  let idx = 1;
  if (filter.documento_id) { where.push(`documento_id = $${idx++}`); params.push(filter.documento_id); }
  if (filter.empreendimento_id) { where.push(`empreendimento_id = $${idx++}`); params.push(filter.empreendimento_id); }
  if (filter.id_atividade) { where.push(`id_atividade = $${idx++}`); params.push(filter.id_atividade); }

  const q = `SELECT * FROM atividades_empreendimento ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT $${idx}`;
  params.push(limit);
  const res = await pool.query(q, params);
  return res.rows;
}

async function getById(id) {
  const res = await pool.query('SELECT * FROM atividades_empreendimento WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateAtividadeEmp(id, fields = {}) {
  const keys = Object.keys(fields);
  if (!keys.length) return getById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  const q = `UPDATE atividades_empreendimento SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteAtividadeEmp(id) {
  await pool.query('DELETE FROM atividades_empreendimento WHERE id = $1', [id]);
}

module.exports = { createAtividadeEmp, listByFilter, getById, updateAtividadeEmp, deleteAtividadeEmp };
