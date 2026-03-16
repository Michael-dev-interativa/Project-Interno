const { pool } = require('../db/pool');

const JSON_FIELDS = new Set(['atividades_vinculadas', 'planejamento', 'monitoramento', 'avanco']);

const UPDATABLE_FIELDS = new Set([
  'empreendimento_id', 'os', 'gestao', 'formalizacao', 'cronograma', 'markup', 'abertura_os_servidor',
  'atividades_planejamento', 'kickoff_cliente', 'art_ee_ais', 'art_hid_in', 'art_hvac', 'art_bomb',
  'conc_telefonia', 'conc_gas', 'conc_eletrica', 'conc_hidraulica', 'conc_agua_pluvial', 'conc_incendio',
  'atividades_vinculadas', 'planejamento', 'monitoramento', 'avanco', 'observacoes'
]);

const FIELD_DESCRIPTIONS = {
  empreendimento_id: 'ID do empreendimento relacionado',
  os: 'Número da OS',
  gestao: 'Responsável pela gestão (nome do usuário)',
  formalizacao: 'Descrição da formalização',
  cronograma: 'Status do Cronograma',
  markup: 'Status do Markup',
  abertura_os_servidor: 'Status da Abertura de OS - Servidor',
  atividades_planejamento: 'Status das Atividades de Planejamento',
  kickoff_cliente: 'Status do Kick off com Cliente',
  art_ee_ais: 'Status ART - EE/AIS',
  art_hid_in: 'Status ART - HID/IN',
  art_hvac: 'Status ART - HVAC',
  art_bomb: 'Status ART - BOMB',
  conc_telefonia: 'Status Concessionária Telefonia',
  conc_gas: 'Status Concessionária Gás',
  conc_eletrica: 'Status Concessionária Elétrica',
  conc_hidraulica: 'Status Concessionária Hidráulica',
  conc_agua_pluvial: 'Status Concessionária Água Pluvial',
  conc_incendio: 'Status Concessionária Incêndio',
  atividades_vinculadas: 'Mapa de atividades vinculadas do empreendimento (chave: nome_atividade, valor: status)',
  planejamento: 'Status de cada disciplina no planejamento (hidráulica, elétrica, etc) com sub-etapas',
  monitoramento: 'Status de monitoramento com briefing, cronograma, LMD e entregas x etapas',
  avanco: 'Lista de itens de avanço do projeto',
  observacoes: 'Observações gerais'
};

function serializeField(key, value) {
  if (value === undefined) return null;
  if (JSON_FIELDS.has(key)) {
    if (value === null) return null;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  return value;
}

async function createControle(data) {
  const cols = [
    'empreendimento_id', 'os', 'gestao', 'formalizacao', 'cronograma', 'markup', 'abertura_os_servidor',
    'atividades_planejamento', 'kickoff_cliente', 'art_ee_ais', 'art_hid_in', 'art_hvac', 'art_bomb',
    'conc_telefonia', 'conc_gas', 'conc_eletrica', 'conc_hidraulica', 'conc_agua_pluvial', 'conc_incendio',
    'atividades_vinculadas', 'planejamento', 'monitoramento', 'avanco', 'observacoes'
  ];

  const vals = cols.map(c => serializeField(c, data[c] !== undefined ? data[c] : (data.dados && data.dados[c] !== undefined ? data.dados[c] : null)));
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
  const q = `INSERT INTO controle_os (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`;
  const res = await pool.query(q, vals);
  return res.rows[0];
}

async function listControles(filter = {}, limit = 200) {
  const parts = [];
  const vals = [];
  let idx = 1;
  if (filter.empreendimento_id) {
    parts.push(`empreendimento_id = $${idx++}`);
    vals.push(filter.empreendimento_id);
  }
  const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  const q = `SELECT * FROM controle_os ${where} ORDER BY id DESC LIMIT $${idx}`;
  vals.push(limit);
  const res = await pool.query(q, vals);
  return res.rows.map(r => ({ ...r, atividades_vinculadas: r.atividades_vinculadas, planejamento: r.planejamento, monitoramento: r.monitoramento, avanco: r.avanco }));
}

async function getById(id) {
  const res = await pool.query('SELECT * FROM controle_os WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateById(id, fields) {
  const keys = Object.keys(fields || {}).filter((key) => UPDATABLE_FIELDS.has(key));
  if (!keys.length) return await getById(id);
  const sets = [];
  const vals = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    sets.push(`${k} = $${i + 1}`);
    vals.push(serializeField(k, fields[k]));
  }
  const q = `UPDATE controle_os SET ${sets.join(',')}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`;
  const res = await pool.query(q, [...vals, id]);
  return res.rows[0] || null;
}

async function deleteById(id) {
  await pool.query('DELETE FROM controle_os WHERE id = $1', [id]);
  return true;
}

module.exports = { createControle, listControles, getById, updateById, deleteById, FIELD_DESCRIPTIONS };
