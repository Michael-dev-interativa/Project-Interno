/*
  Importa CSV de PlanejamentoDocumento para a tabela planejamento_documentos.

  O CSV contém IDs no formato Base44 (strings hex) para documento_id e empreendimento_id.
  Este script faz a correspondência pelo campo `descritivo` → numero do documento
  e pelo empreendimento (única empresa no CSV).

  Uso:
    node scripts/import_planejamento_documentos_csv.js <caminho_csv> [--empreendimento-id=<id>] [--dry-run]

  Flags:
    --empreendimento-id=<id>   ID local do empreendimento (inteiro). Se omitido, o script lista os disponíveis.
    --dry-run                  Não insere nada, apenas mostra o que seria feito.
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { pool } = require('../db/pool');

// ── Argumentos da linha de comando ──────────────────────────────────────────
const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const empIdArg = args.find(a => a.startsWith('--empreendimento-id='));
const forcedEmpId = empIdArg ? Number(empIdArg.split('=')[1]) : null;

if (!csvPath) {
  console.error('Uso: node scripts/import_planejamento_documentos_csv.js <caminho_csv> [--empreendimento-id=<id>] [--dry-run]');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseJsonField(value) {
  if (!value || value.trim() === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseNumero(descritivo) {
  if (!descritivo) return null;
  // "191 - Projeto Executivo" → "191"
  const match = String(descritivo).match(/^(\S+)/);
  return match ? match[1].trim() : null;
}

function toDate(value) {
  if (!value || value.trim() === '') return null;
  // Accept YYYY-MM-DD or ISO timestamp
  const d = new Date(value.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNumeric(value) {
  if (value === '' || value == null) return null;
  const n = parseFloat(String(value).replace(',', '.'));
  return isNaN(n) ? null : n;
}

async function main() {
  // ── Ler CSV ────────────────────────────────────────────────────────────────
  const raw = fs.readFileSync(csvPath, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  console.log(`📄 ${records.length} linhas lidas do CSV`);

  // empreendimento é usado apenas se --empreendimento-id for passado para restringir documentos
  let empreendimentoId = forcedEmpId || null;
  if (!empreendimentoId) {
    const empRes = await pool.query('SELECT id, nome FROM empreendimentos ORDER BY id');
    if (empRes.rows.length === 1) {
      empreendimentoId = empRes.rows[0].id;
      console.log(`✅ Empreendimento único: id=${empreendimentoId} — ${empRes.rows[0].nome}`);
    }
    // Se múltiplos, não aborta — usa todos os documentos
  }

  // ── Carregar mapa de documentos (numero → id) ──────────────────────────────
  // Busca de TODOS os empreendimentos; se --empreendimento-id for fornecido, filtra só ele.
  let docRes;
  if (forcedEmpId) {
    docRes = await pool.query(
      'SELECT id, numero, empreendimento_id FROM documentos WHERE empreendimento_id = $1',
      [forcedEmpId]
    );
  } else {
    docRes = await pool.query('SELECT id, numero, empreendimento_id FROM documentos');
  }
  const docMap = new Map();
  docRes.rows.forEach(d => {
    if (d.numero) {
      const key = String(d.numero).trim();
      if (!docMap.has(key)) docMap.set(key, { id: d.id, empreendimento_id: d.empreendimento_id });
    }
  });
  console.log(`📚 ${docMap.size} documentos carregados (todos os empreendimentos)`);

  // ── Estatísticas ───────────────────────────────────────────────────────────
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of records) {
    const numero = parseNumero(row.descritivo);
    if (!numero) {
      console.warn(`⚠️  Sem número no descritivo: "${row.descritivo}" — linha pulada`);
      skipped++;
      continue;
    }

    const docEntry = docMap.get(numero);
    if (!docEntry) {
      console.warn(`⚠️  Documento numero="${numero}" não encontrado — linha pulada`);
      skipped++;
      continue;
    }
    const documentoId = docEntry.id;

    const executores = parseJsonField(row.executores);
    const horasPorDia = parseJsonField(row.horas_por_dia);
    const horasExecutadasPorDia = parseJsonField(row.horas_executadas_por_dia);

    const payload = {
      documento_id: documentoId,
      etapa: row.etapa || null,
      executor_principal: row.executor_principal || null,
      executores: executores ? JSON.stringify(executores) : null,
      inicio_planejado: toDate(row.inicio_planejado),
      termino_planejado: toDate(row.termino_planejado),
      inicio_real: toDate(row.inicio_real),
      termino_real: toDate(row.termino_real),
      tempo_planejado: toNumeric(row.tempo_planejado),
      tempo_executado: toNumeric(row.tempo_executado),
      horas_por_dia: horasPorDia ? JSON.stringify(horasPorDia) : null,
      horas_executadas_por_dia: horasExecutadasPorDia ? JSON.stringify(horasExecutadasPorDia) : null,
      status: row.status || 'nao_iniciado',
    };

    if (dryRun) {
      console.log(`[DRY-RUN] Inserir: doc ${numero} (id=${documentoId}), etapa=${payload.etapa}, executor=${payload.executor_principal}, inicio=${payload.inicio_planejado}, termino=${payload.termino_planejado}, horas=${payload.tempo_planejado}`);
      inserted++;
      continue;
    }

    try {
      const keys = Object.keys(payload).filter(k => payload[k] !== null && payload[k] !== undefined);
      const vals = keys.map(k => payload[k]);
      const params = keys.map((_, i) => `$${i + 1}`);
      const sql = `INSERT INTO planejamento_documentos (${keys.join(', ')}) VALUES (${params.join(', ')}) RETURNING id`;
      await pool.query(sql, vals);
      inserted++;
    } catch (err) {
      console.error(`❌ Erro ao inserir documento ${numero}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n✅ Importação concluída!');
  console.log(`   Inseridos : ${inserted}`);
  console.log(`   Pulados   : ${skipped}`);
  console.log(`   Erros     : ${errors}`);
  if (dryRun) console.log('   (dry-run: nenhum dado foi modificado)');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
