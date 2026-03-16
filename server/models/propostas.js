const { pool } = require('../db/pool');

const JSON_FIELDS = new Set(['parceiros', 'disciplinas', 'codisciplinas', 'pavimentos']);
const UPDATABLE_FIELDS = new Set([
  'numero', 'data_solicitacao', 'solicitante', 'cliente', 'empreendimento',
  'tipo_empreendimento', 'tipo_obra', 'utilizacao',
  'parceiros', 'disciplinas', 'codisciplinas', 'pavimentos',
  'escopo', 'area', 'estado', 'valor_bim', 'valor_cad',
  'data_aprovacao', 'status', 'email', 'telefone', 'observacao',
  // Legacy compatibility fields
  'titulo', 'valor'
]);

function normalizeField(key, value) {
  if (value === undefined) return null;
  if (JSON_FIELDS.has(key)) {
    if (value === null) return null;
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value));
      } catch (e) {
        return JSON.stringify([]);
      }
    }
    return JSON.stringify(value);
  }
  return value;
}

async function createProposta(data = {}) {
  const payload = {
    numero: data.numero || null,
    data_solicitacao: data.data_solicitacao || null,
    solicitante: data.solicitante || null,
    cliente: data.cliente || null,
    empreendimento: data.empreendimento || null,
    tipo_empreendimento: data.tipo_empreendimento || null,
    tipo_obra: data.tipo_obra || null,
    utilizacao: data.utilizacao || null,
    parceiros: data.parceiros || [],
    disciplinas: data.disciplinas || [],
    codisciplinas: data.codisciplinas || [],
    pavimentos: data.pavimentos || [],
    escopo: data.escopo || null,
    area: data.area ?? null,
    estado: data.estado || null,
    valor_bim: data.valor_bim ?? null,
    valor_cad: data.valor_cad ?? null,
    data_aprovacao: data.data_aprovacao || null,
    status: data.status || 'solicitado',
    email: data.email || null,
    telefone: data.telefone || null,
    observacao: data.observacao || null,
    // Legacy fields
    titulo: data.titulo || data.numero || null,
    valor: data.valor ?? data.valor_cad ?? null,
  };

  const cols = Object.keys(payload);
  const vals = cols.map((k) => normalizeField(k, payload[k]));
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
  const q = `INSERT INTO propostas (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`;
  const res = await pool.query(q, vals);
  return res.rows[0] || null;
}

async function listPropostas(filter = {}, limit = 100) {
  const where = [];
  const params = [];
  let idx = 1;

  if (filter.status) {
    where.push(`status = $${idx++}`);
    params.push(filter.status);
  }
  if (filter.cliente) {
    where.push(`cliente ILIKE $${idx++}`);
    params.push(`%${filter.cliente}%`);
  }

  let q = 'SELECT * FROM propostas';
  if (where.length) q += ` WHERE ${where.join(' AND ')}`;
  q += ` ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT $${idx}`;
  params.push(limit);

  const res = await pool.query(q, params);
  return res.rows;
}

async function getPropostaById(id) {
  const res = await pool.query('SELECT * FROM propostas WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateProposta(id, fields = {}) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE_FIELDS.has(k));
  if (!keys.length) return getPropostaById(id);

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const vals = keys.map((k) => normalizeField(k, fields[k]));
  const q = `UPDATE propostas SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...vals, id]);
  return res.rows[0] || null;
}

async function deleteProposta(id) {
  await pool.query('DELETE FROM propostas WHERE id = $1', [id]);
  return true;
}

module.exports = {
  createProposta,
  listPropostas,
  getPropostaById,
  updateProposta,
  deleteProposta,
};
