const { pool } = require('../db/pool');

let empreendimentoColumnsCache = null;

async function ensureEmpreendimentoColumns() {
  await pool.query(`
    ALTER TABLE empreendimentos
    ADD COLUMN IF NOT EXISTS cliente VARCHAR(255),
    ADD COLUMN IF NOT EXISTS endereco TEXT,
    ADD COLUMN IF NOT EXISTS num_proposta VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ativo',
    ADD COLUMN IF NOT EXISTS foto_url TEXT,
    ADD COLUMN IF NOT EXISTS etapas JSONB
  `);
}

async function getEmpreendimentoColumns() {
  if (empreendimentoColumnsCache) return empreendimentoColumnsCache;
  await ensureEmpreendimentoColumns();
  const res = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'empreendimentos'`
  );
  empreendimentoColumnsCache = new Set(res.rows.map(r => r.column_name));
  return empreendimentoColumnsCache;
}

async function createEmpreendimento(fields = {}) {
  const {
    nome,
    descricao,
    cliente,
    endereco,
    num_proposta,
    status,
    foto_url,
    etapas,
  } = fields;

  const dbColumns = await getEmpreendimentoColumns();
  const payload = {
    nome: nome || null,
    descricao: descricao || null,
    cliente: cliente || null,
    endereco: endereco || null,
    num_proposta: num_proposta || null,
    status: status || null,
    foto_url: foto_url || null,
    etapas: jsonStringOrNull(etapas),
  };

  const entries = Object.entries(payload).filter(([key]) => dbColumns.has(key));
  if (!entries.some(([key]) => key === 'nome')) {
    throw new Error('Coluna obrigatória "nome" não encontrada na tabela empreendimentos');
  }

  const cols = [];
  const placeholders = [];
  const values = [];

  entries.forEach(([key, value], idx) => {
    cols.push(key);
    placeholders.push(key === 'etapas' ? `$${idx + 1}::jsonb` : `$${idx + 1}`);
    values.push(value);
  });

  const sql = `INSERT INTO empreendimentos (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  const res = await pool.query(sql, values);
  return res.rows[0];
}

async function listEmpreendimentos(limit = 50) {
  const res = await pool.query('SELECT * FROM empreendimentos ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows;
}

async function getEmpreendimentoById(id) {
  const res = await pool.query('SELECT * FROM empreendimentos WHERE id = $1', [id]);
  return res.rows[0] || null;
}

function jsonStringOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    try { JSON.parse(v); return v; } catch (e) { return JSON.stringify([v]); }
  }
  try { return JSON.stringify(v); } catch (e) { return null; }
}

async function updateEmpreendimento(id, fields = {}) {
  const allowedColumns = new Set([
    'nome', 'descricao', 'cliente', 'endereco', 'num_proposta', 'status', 'foto_url', 'etapas'
  ]);
  const jsonColumns = new Set(['etapas']);

  const dbColumns = await getEmpreendimentoColumns();
  const entries = Object.entries(fields || {}).filter(([key]) => allowedColumns.has(key) && dbColumns.has(key));
  if (!entries.length) return getEmpreendimentoById(id);

  const sets = [];
  const values = [];
  let idx = 1;

  for (const [key, rawValue] of entries) {
    let value = rawValue;
    if (jsonColumns.has(key)) {
      value = jsonStringOrNull(rawValue);
      sets.push(`${key} = $${idx}::jsonb`);
    } else {
      sets.push(`${key} = $${idx}`);
    }
    values.push(value);
    idx += 1;
  }

  const q = `UPDATE empreendimentos SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteEmpreendimento(id) {
  await pool.query('DELETE FROM empreendimentos WHERE id = $1', [id]);
}

module.exports = {
  createEmpreendimento,
  listEmpreendimentos,
  getEmpreendimentoById,
  updateEmpreendimento,
  deleteEmpreendimento,
};
