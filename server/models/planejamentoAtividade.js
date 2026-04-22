const { pool } = require('../db/pool');

// Frontend uses 'descritivo'; DB column is 'titulo'. Expose both so all callers work.
function mapRow(row) {
  if (!row) return row;
  return { ...row, descritivo: row.descritivo || row.titulo };
}

async function createPlanejamentoAtividade(data = {}) {
  const cols = [
    'titulo', 'descricao', 'atividade_id', 'empreendimento_id', 'executor_principal', 'executores', 'executor_id',
    'inicio_previsto', 'fim_previsto', 'inicio_planejado', 'termino_planejado', 'tempo_planejado', 'tempo_executado',
    'horas_por_dia', 'horas_executadas_por_dia', 'status'
  ];

  // Frontend sends 'descritivo'; the DB column is 'titulo'
  const payload = { titulo: data.titulo || data.descritivo || null, ...data };

  const keys = [];
  const values = [];
  const params = [];

  const numericFields = new Set(['atividade_id', 'empreendimento_id', 'executor_id', 'tempo_planejado', 'tempo_executado']);
  const jsonFields = new Set(['executores', 'horas_por_dia', 'horas_executadas_por_dia']);

  cols.forEach((c) => {
    if (payload[c] !== undefined) {
      keys.push(c);
      let value = payload[c];

      // Converter campos numéricos
      if (numericFields.has(c)) {
        if (value === '' || value === null) {
          value = null;
        } else {
          const num = Number(value);
          value = Number.isFinite(num) ? num : null;
        }
      }
      // Converter campos JSON
      else if (jsonFields.has(c) && typeof value === 'object') {
        value = JSON.stringify(value);
      }

      values.push(value);
      params.push(`$${params.length + 1}`);
    }
  });

  const q = `INSERT INTO planejamento_atividades (${keys.join(',')}) VALUES (${params.join(',')}) RETURNING *`;
  const res = await pool.query(q, values);
  return mapRow(res.rows[0]);
}

async function listPlanejamentos(limit = 200) {
  const res = await pool.query('SELECT * FROM planejamento_atividades ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows.map(mapRow);
}

async function getPlanejamentoById(id) {
  const res = await pool.query('SELECT * FROM planejamento_atividades WHERE id = $1', [id]);
  return mapRow(res.rows[0] || null);
}

async function deletePlanejamento(id) {
  await pool.query('DELETE FROM planejamento_atividades WHERE id = $1', [id]);
}

async function updatePlanejamento(id, fields = {}) {
  const keys = Object.keys(fields);
  if (!keys.length) return getPlanejamentoById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = keys.map(k => fields[k]);
  const q = `UPDATE planejamento_atividades SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return mapRow(res.rows[0] || null);
}

module.exports = { createPlanejamentoAtividade, listPlanejamentos, getPlanejamentoById, deletePlanejamento, updatePlanejamento };
