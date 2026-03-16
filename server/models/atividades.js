const { pool } = require('../db/pool');

async function createAtividade(data) {
  const {
    titulo,
    etapa,
    predecessora,
    funcao,
    subdisciplina,
    tempo,
    id_atividade,
    descricao,
    status,
    inicio_previsto,
    fim_previsto,
    empreendimento_id,
    equipe_id,
    disciplina_id,
    responsavel_id
  } = data || {};

  try {
    const res = await pool.query(
      `INSERT INTO atividades (
        titulo, etapa, predecessora, funcao, subdisciplina, tempo, id_atividade,
        descricao, status, inicio_previsto, fim_previsto, empreendimento_id, equipe_id, disciplina_id, responsavel_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        titulo || null,
        etapa || null,
        predecessora || null,
        funcao || null,
        subdisciplina || null,
        (tempo == null ? null : Number(tempo)),
        id_atividade || null,
        descricao || null,
        status || null,
        inicio_previsto || null,
        fim_previsto || null,
        empreendimento_id || null,
        equipe_id || null,
        disciplina_id || null,
        responsavel_id || null
      ]
    );
    console.log('createAtividade fields:', JSON.stringify({ titulo, etapa, predecessora, funcao, subdisciplina, tempo, id_atividade }));
    console.log('createAtividade result:', res.rows[0]);
    return res.rows[0];
  } catch (err) {
    console.error('createAtividade error:', err, 'fields:', JSON.stringify(data));
    throw err;
  }
}

async function getAtividadeById(id) {
  const res = await pool.query('SELECT * FROM atividades WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function listAtividades(limit = 200) {
  const res = await pool.query('SELECT * FROM atividades ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows;
}

async function updateAtividade(id, fields = {}) {
  const keys = Object.keys(fields);
  if (!keys.length) return getAtividadeById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  const q = `UPDATE atividades SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteAtividade(id) {
  await pool.query('DELETE FROM atividades WHERE id = $1', [id]);
}

module.exports = { createAtividade, getAtividadeById, listAtividades, updateAtividade, deleteAtividade };
