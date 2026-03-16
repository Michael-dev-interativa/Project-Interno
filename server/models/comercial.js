const { pool } = require('../db/pool');

const JSON_FIELDS = new Set(['parceiros', 'disciplinas', 'codisciplinas', 'pavimentos']);
const UPDATABLE_FIELDS = new Set([
  'numero', 'data_solicitacao', 'solicitante', 'cliente', 'empreendimento',
  'tipo_empreendimento', 'tipo_obra', 'utilizacao',
  'parceiros', 'disciplinas', 'codisciplinas', 'pavimentos',
  'escopo', 'area', 'estado', 'valor_bim', 'valor_cad',
  'data_aprovacao', 'status', 'email', 'telefone', 'observacao',
  // Legacy compatibility fields
  'titulo', 'valor_estimate'
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

async function createComercial(data = {}) {
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
    valor_estimate: data.valor_estimate ?? data.valor_cad ?? null,
  };

  const cols = Object.keys(payload);
  const vals = cols.map((k) => normalizeField(k, payload[k]));
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
  const q = `INSERT INTO comerciais (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`;
  const res = await pool.query(q, vals);
  return res.rows[0] || null;
}

async function listComerciais(filter = {}, limit = 100) {
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

  let q = 'SELECT * FROM comerciais';
  if (where.length) q += ` WHERE ${where.join(' AND ')}`;
  q += ` ORDER BY COALESCE(updated_at, created_at) DESC, id DESC LIMIT $${idx}`;
  params.push(limit);

  const res = await pool.query(q, params);
  return res.rows;
}

async function getComercialById(id) {
  const res = await pool.query('SELECT * FROM comerciais WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateComercial(id, fields = {}) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE_FIELDS.has(k));
  if (!keys.length) return getComercialById(id);

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const vals = keys.map((k) => normalizeField(k, fields[k]));
  const q = `UPDATE comerciais SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...vals, id]);
  return res.rows[0] || null;
}

async function deleteComercial(id) {
  await pool.query('DELETE FROM comerciais WHERE id = $1', [id]);
  return true;
}

module.exports = {
  createComercial,
  listComerciais,
  getComercialById,
  updateComercial,
  deleteComercial,
};
