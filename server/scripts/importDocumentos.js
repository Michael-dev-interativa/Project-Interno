/**
 * Script de importação: Documento.csv → tabela documentos
 *
 * Uso (rodar dentro de server/):
 *   node scripts/importDocumentos.js [--dry-run]
 *
 * --dry-run  Mostra resumo sem gravar nada no banco
 *
 * O script:
 *  1. Infere o mapeamento MongoDB-ID → local-integer-ID cruzando
 *     arquivos já existentes no banco (por arquivo+numero)
 *  2. Importa apenas documentos que ainda NÃO existem no banco
 *     (evita duplicatas)
 *  3. Ignora documentos de empreendimentos que não conseguiu mapear
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { pool } = require('../db/pool');

const CSV_DOCUMENTOS = path.resolve('C:/Users/Michael Rocha/Desktop/import/Documento.csv');
const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ────────────────────────────────────────────────
function toNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toBool(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().toLowerCase();
  if (s === 'true'  || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return null;
}
function toJsonStr(v) {
  if (!v || v === '') return null;
  try { JSON.parse(v); return v; } catch { return null; }
}
function toDate(v) {
  if (!v || v === '') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function docKey(arquivo, numero) {
  return (arquivo || '').trim().toLowerCase() + '|' + (numero || '').trim();
}

// ── Main ───────────────────────────────────────────────────
async function run() {
  // 1. Ler CSV
  console.log('📂 Lendo Documento.csv...');
  const csvDocs = parse(fs.readFileSync(CSV_DOCUMENTOS, 'utf8'), {
    columns: true, skip_empty_lines: true, relax_column_count: true,
  });
  console.log(`   ${csvDocs.length} linhas lidas`);

  // 2. Carregar documentos locais (para inferir mapeamento e detectar duplicatas)
  console.log('\n🔍 Carregando documentos do banco local...');
  const { rows: localDocs } = await pool.query(
    'SELECT numero, arquivo, empreendimento_id FROM documentos WHERE arquivo IS NOT NULL'
  );
  console.log(`   ${localDocs.length} documentos existentes`);

  // Mapa de chaves já existentes (para evitar duplicatas)
  const existingKeys = new Set(localDocs.map(d => docKey(d.arquivo, d.numero)));

  // 3. Inferir mapeamento MongoDB → local integer ID
  console.log('\n🔗 Inferindo mapeamento de empreendimentos...');
  const mongoToLocal = {}; // mongoId → { localId: count }
  csvDocs.forEach(d => {
    const key = docKey(d.arquivo, d.numero);
    const found = localDocs.find(l => docKey(l.arquivo, l.numero) === key);
    if (found && found.empreendimento_id) {
      const mId = d.empreendimento_id;
      if (!mongoToLocal[mId]) mongoToLocal[mId] = {};
      const lId = found.empreendimento_id;
      mongoToLocal[mId][lId] = (mongoToLocal[mId][lId] || 0) + 1;
    }
  });

  // Para cada mongoId, escolher o localId com mais matches
  const mapping = {};
  const ambiguous = [];
  Object.entries(mongoToLocal).forEach(([mId, counts]) => {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    mapping[mId] = Number(sorted[0][0]);
    if (sorted.length > 1 && sorted[1][1] > 5) {
      ambiguous.push({ mId, sorted });
    }
  });

  console.log(`   Mapeados:  ${Object.keys(mapping).length} empreendimentos`);
  if (ambiguous.length) {
    console.warn(`   ⚠️  Ambíguos (escolheu o com mais matches):`);
    ambiguous.forEach(({ mId, sorted }) =>
      console.warn(`     ${mId} → ${sorted.map(([id,c])=>id+'('+c+')').join(', ')}`)
    );
  }

  // 4. Separar documentos novos vs já existentes vs sem mapeamento
  const novos = [];
  let semMapeamento = 0;
  let duplicatas = 0;

  csvDocs.forEach(d => {
    const localEmpId = mapping[d.empreendimento_id];
    if (!localEmpId) { semMapeamento++; return; }

    const key = docKey(d.arquivo, d.numero);
    if (existingKeys.has(key)) { duplicatas++; return; }

    novos.push({ ...d, _localEmpId: localEmpId });
  });

  console.log(`\n📊 Resumo:`);
  console.log(`   Já existentes (duplicatas): ${duplicatas}`);
  console.log(`   Sem mapeamento de emp:      ${semMapeamento}`);
  console.log(`   ✅ Novos a importar:         ${novos.length}`);

  if (novos.length === 0) {
    console.log('\nNada a importar. Encerrando.');
    await pool.end();
    return;
  }

  if (DRY_RUN) {
    console.log('\n🔍 [DRY-RUN] Primeiros 10 que seriam inseridos:');
    novos.slice(0, 10).forEach(d =>
      console.log(`  emp_local=${d._localEmpId} numero="${d.numero}" arquivo="${d.arquivo}" subdisciplinas="${d.subdisciplinas}"`)
    );
    console.log('\n[DRY-RUN] Nada gravado. Remova --dry-run para importar.');
    await pool.end();
    return;
  }

  // 5. Inserir
  console.log('\n⬆️  Importando...');
  let ok = 0, erros = 0;

  for (const d of novos) {
    try {
      await pool.query(
        `INSERT INTO documentos (
          titulo, empreendimento_id, numero, arquivo, descritivo,
          disciplinas, subdisciplinas, escala, fator_dificuldade,
          tempo_total, tempo_estudo_preliminar, tempo_ante_projeto,
          tempo_projeto_basico, tempo_projeto_executivo, tempo_liberado_obra,
          tempo_concepcao, tempo_planejamento, tempo_execucao_total,
          inicio_planejado, termino_planejado, executor_principal, multiplos_executores,
          created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6::jsonb,$7::jsonb,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,
          now(), now()
        )`,
        [
          d.arquivo || d.numero || d.descritivo || 'Sem título',
          d._localEmpId,
          d.numero   || null,
          d.arquivo  || null,
          d.descritivo || null,
          toJsonStr(d.disciplinas),
          toJsonStr(d.subdisciplinas),
          d.escala   || null,
          toNum(d.fator_dificuldade),
          toNum(d.tempo_total),
          toNum(d.tempo_estudo_preliminar),
          toNum(d.tempo_ante_projeto),
          toNum(d.tempo_projeto_basico),
          toNum(d.tempo_projeto_executivo),
          toNum(d.tempo_liberado_obra),
          toNum(d.tempo_concepcao),
          toNum(d.tempo_planejamento),
          toNum(d.tempo_execucao_total),
          toDate(d.inicio_planejado)  || null,
          toDate(d.termino_planejado) || null,
          d.executor_principal || null,
          toBool(d.multiplos_executores),
        ]
      );
      ok++;
      if (ok % 100 === 0) process.stdout.write(`\r   ${ok}/${novos.length}...`);
    } catch (err) {
      erros++;
      if (erros <= 5) console.error(`\n  ❌ "${d.numero || d.arquivo}": ${err.message}`);
    }
  }

  console.log(`\n\n✅ Importação concluída: ${ok} inseridos, ${erros} erros.`);
  await pool.end();
}

run().catch(err => {
  console.error('Erro fatal:', err.message);
  process.exit(1);
});
