const { pool } = require('../db/pool');

async function createDocumento(fields) {
  const {
    titulo,
    numero,
    tipo,
    arquivo,
    caminho,
    descritivo,
    area,
    executor_principal,
    multiplos_executores,
    inicio_planejado,
    termino_planejado,
    predecessora_id,
    pavimento_id,
    disciplina_id,
    disciplinas,
    subdisciplinas,
    escala,
    fator_dificuldade,
    empreendimento_id,
    tempo_total,
    tempo_estudo_preliminar,
    tempo_ante_projeto,
    tempo_projeto_basico,
    tempo_projeto_executivo,
    tempo_liberado_obra,
    tempo_concepcao,
    tempo_planejamento,
    tempo_execucao_total
  } = fields || {};

  const res = await pool.query(
    `INSERT INTO documentos (
      titulo, numero, tipo, arquivo, caminho, descritivo, area, pavimento_id,
      predecessora_id, disciplina_id, disciplinas, subdisciplinas,
      executor_principal, multiplos_executores, inicio_planejado, termino_planejado,
      escala, fator_dificuldade,
      empreendimento_id, tempo_total, tempo_estudo_preliminar, tempo_ante_projeto,
      tempo_projeto_basico, tempo_projeto_executivo, tempo_liberado_obra,
      tempo_concepcao, tempo_planejamento, tempo_execucao_total
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
    ) RETURNING *`,
    [
      titulo || null,
      numero || null,
      tipo || null,
      arquivo || null,
      caminho || null,
      descritivo || null,
      area || null,
      pavimento_id || null,
      toNumberOrNull(predecessora_id),
      disciplina_id || null,
      jsonStringOrNull(disciplinas),
      jsonStringOrNull(subdisciplinas),
      executor_principal || null,
      toBooleanOrNull(multiplos_executores),
      inicio_planejado || null,
      termino_planejado || null,
      escala || null,
      fator_dificuldade || null,
      empreendimento_id || null,
      toNumberOrNull(tempo_total),
      toNumberOrNull(tempo_estudo_preliminar),
      toNumberOrNull(tempo_ante_projeto),
      toNumberOrNull(tempo_projeto_basico),
      toNumberOrNull(tempo_projeto_executivo),
      toNumberOrNull(tempo_liberado_obra),
      toNumberOrNull(tempo_concepcao),
      toNumberOrNull(tempo_planejamento),
      toNumberOrNull(tempo_execucao_total)
    ]
  );
  return res.rows[0];
}

function disciplinesToJson(val) {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { return [val]; }
  }
  if (Array.isArray(val) || typeof val === 'object') return val;
  return [val];
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBooleanOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

function jsonOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    // try parse if it's valid JSON
    try { return JSON.parse(v); } catch (e) {
      // it's a plain string - wrap into array
      return [v];
    }
  }
  if (Array.isArray(v) || typeof v === 'object') return v;
  return [v];
}

function jsonStringOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    try { JSON.parse(v); return v; } catch (e) { return JSON.stringify([v]); }
  }
  try { return JSON.stringify(v); } catch (e) { return null; }
}

async function listDocumentos(filter = {}, limit = 100) {
  const res = await pool.query('SELECT * FROM documentos ORDER BY id DESC LIMIT $1', [limit]);
  return res.rows;
}

async function getDocumentoById(id) {
  const res = await pool.query('SELECT * FROM documentos WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateDocumento(id, fields = {}) {
  const allowedColumns = new Set([
    'titulo', 'numero', 'tipo', 'arquivo', 'caminho', 'descritivo', 'area',
    'executor_principal', 'multiplos_executores', 'inicio_planejado', 'termino_planejado',
    'predecessora_id', 'pavimento_id', 'disciplina_id', 'disciplinas', 'subdisciplinas',
    'escala', 'fator_dificuldade', 'empreendimento_id',
    'tempo_total', 'tempo_estudo_preliminar', 'tempo_ante_projeto',
    'tempo_projeto_basico', 'tempo_projeto_executivo', 'tempo_liberado_obra',
    'tempo_concepcao', 'tempo_planejamento', 'tempo_execucao_total'
  ]);

  const numericColumns = new Set([
    'predecessora_id', 'pavimento_id', 'disciplina_id', 'fator_dificuldade', 'empreendimento_id',
    'tempo_total', 'tempo_estudo_preliminar', 'tempo_ante_projeto',
    'tempo_projeto_basico', 'tempo_projeto_executivo', 'tempo_liberado_obra',
    'tempo_concepcao', 'tempo_planejamento', 'tempo_execucao_total'
  ]);

  const booleanColumns = new Set(['multiplos_executores']);

  const jsonColumns = new Set(['disciplinas', 'subdisciplinas']);

  const entries = Object.entries(fields || {}).filter(([key]) => allowedColumns.has(key));
  if (!entries.length) return getDocumentoById(id);

  const sets = [];
  const values = [];
  let idx = 1;

  for (const [key, rawValue] of entries) {
    let value = rawValue;
    if (jsonColumns.has(key)) {
      value = jsonStringOrNull(jsonOrNull(rawValue));
      sets.push(`${key} = $${idx}::jsonb`);
    } else if (booleanColumns.has(key)) {
      value = toBooleanOrNull(rawValue);
      sets.push(`${key} = $${idx}`);
    } else if (numericColumns.has(key)) {
      value = toNumberOrNull(rawValue);
      sets.push(`${key} = $${idx}`);
    } else {
      sets.push(`${key} = $${idx}`);
    }
    values.push(value);
    idx += 1;
  }

  const q = `UPDATE documentos SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`;
  const res = await pool.query(q, [...values, id]);
  return res.rows[0] || null;
}

async function deleteDocumento(id) {
  await pool.query('DELETE FROM documentos WHERE id = $1', [id]);
}

module.exports = { createDocumento, listDocumentos, getDocumentoById, updateDocumento, deleteDocumento };
