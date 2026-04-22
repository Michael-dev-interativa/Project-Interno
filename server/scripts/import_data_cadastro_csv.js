/*
  Importa CSV de DataCadastro para a tabela data_cadastro.

  O CSV contém IDs no formato Base44 (strings hex) para documento_id e empreendimento_id.
  Este script resolve os IDs usando Documento.csv como tabela de referência:
  - documento_id  → mapeado pelo campo `numero` do documento
  - empreendimento_id → derivado do documento mapeado (votação por maioria)

  Uso:
    node scripts/import_data_cadastro_csv.js <caminho_csv> [--documento-csv=<caminho>] [--dry-run] [--skip-existing]

  Flags:
    --documento-csv=<caminho>  Caminho para Documento.csv (default: mesmo diretório do CSV)
    --dry-run                  Não insere nada, apenas mostra o que seria feito.
    --skip-existing            Pula linhas cuja combinação (empreendimento_id, documento_id) já existe.
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { pool } = require('../db/pool');

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const skipExisting = args.includes('--skip-existing');
const docCsvArg = args.find(a => a.startsWith('--documento-csv='));
const docCsvPath = docCsvArg
  ? docCsvArg.split('=').slice(1).join('=')
  : csvPath ? path.join(path.dirname(csvPath), 'Documento.csv') : null;

if (!csvPath) {
  console.error('Uso: node scripts/import_data_cadastro_csv.js <caminho_csv> [--documento-csv=<caminho>] [--dry-run] [--skip-existing]');
  process.exit(1);
}
if (!docCsvPath || !fs.existsSync(docCsvPath)) {
  console.error('Documento.csv não encontrado em:', docCsvPath);
  console.error('Use --documento-csv=<caminho> para especificar o caminho.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function readCsv(filePath) {
  const buf = fs.readFileSync(filePath);
  const utf8 = buf.toString('utf8').replace(/^﻿/, '');
  return parse(utf8, { columns: true, skip_empty_lines: true, relax_quotes: true });
}

function normalizeNumero(numero) {
  if (!numero) return null;
  return String(numero).trim();
}

async function main() {
  // ── 1. Ler Documento.csv → mapa: old_doc_id → { numero, old_emp_id } ────────
  console.log('📄 Lendo Documento.csv:', docCsvPath);
  const docCsvRows = readCsv(docCsvPath);
  const docCsvById = new Map();
  for (const row of docCsvRows) {
    if (row.id) {
      docCsvById.set(row.id, {
        numero: normalizeNumero(row.numero),
        old_emp_id: row.empreendimento_id || null,
      });
    }
  }
  console.log(`   ${docCsvById.size} documentos carregados do CSV`);

  // ── 2. Ler DataCadastro.csv ───────────────────────────────────────────────
  console.log('📄 Lendo DataCadastro.csv:', csvPath);
  const dcRows = readCsv(csvPath);
  console.log(`   ${dcRows.length} linhas lidas`);

  // ── 3. Carregar documentos do banco → mapa: numero → [{ id, empreendimento_id }] ─
  console.log('🗄️  Carregando documentos do banco...');
  const dbDocsRes = await pool.query('SELECT id, numero, empreendimento_id FROM documentos WHERE numero IS NOT NULL');
  const dbDocsByNumero = new Map();
  for (const d of dbDocsRes.rows) {
    const key = normalizeNumero(d.numero);
    if (!key) continue;
    if (!dbDocsByNumero.has(key)) dbDocsByNumero.set(key, []);
    dbDocsByNumero.get(key).push({ id: d.id, empreendimento_id: d.empreendimento_id });
  }
  console.log(`   ${dbDocsRes.rows.length} documentos carregados (${dbDocsByNumero.size} números únicos)`);

  // ── 4. Construir mapa: old_emp_id → new_emp_id (por votação) ─────────────
  // Para cada old_emp_id, coletamos os números dos seus documentos,
  // encontramos esses documentos no banco e votamos no new_emp_id mais frequente.
  console.log('🔗 Construindo mapeamento de empreendimentos (old_id → new_id)...');

  // Coletar votos por old_emp_id
  const votes = new Map(); // old_emp_id → Map<new_emp_id, count>
  for (const [old_doc_id, docInfo] of docCsvById) {
    if (!docInfo.old_emp_id || !docInfo.numero) continue;
    const dbDocs = dbDocsByNumero.get(docInfo.numero) || [];
    for (const dbDoc of dbDocs) {
      if (!dbDoc.empreendimento_id) continue;
      const old_emp = docInfo.old_emp_id;
      if (!votes.has(old_emp)) votes.set(old_emp, new Map());
      const v = votes.get(old_emp);
      v.set(dbDoc.empreendimento_id, (v.get(dbDoc.empreendimento_id) || 0) + 1);
    }
  }

  const empMapping = new Map(); // old_emp_id → new_emp_id
  const empMappingConf = new Map(); // old_emp_id → { winner, total_votes }
  for (const [old_emp_id, voteMap] of votes) {
    let best = null, bestCount = 0;
    for (const [new_emp_id, count] of voteMap) {
      if (count > bestCount) { best = new_emp_id; bestCount = count; }
    }
    if (best) {
      empMapping.set(old_emp_id, best);
      empMappingConf.set(old_emp_id, { winner: best, votes: bestCount, total: [...voteMap.values()].reduce((a, b) => a + b, 0) });
    }
  }

  // Mostrar mapeamento
  const dbEmpsRes = await pool.query('SELECT id, nome FROM empreendimentos ORDER BY id');
  const dbEmpNames = new Map(dbEmpsRes.rows.map(e => [e.id, e.nome]));

  const uniqueOldEmpIds = [...new Set(dcRows.map(r => r.empreendimento_id))];
  let unmappedEmps = 0;
  for (const old_emp of uniqueOldEmpIds) {
    const conf = empMappingConf.get(old_emp);
    if (conf) {
      const empName = dbEmpNames.get(conf.winner) || '?';
      const confidence = ((conf.votes / conf.total) * 100).toFixed(0);
      console.log(`   ${old_emp} → id=${conf.winner} "${empName}" (${conf.votes}/${conf.total} votos, ${confidence}%)`);
    } else {
      console.warn(`   ⚠️  ${old_emp} → NÃO MAPEADO`);
      unmappedEmps++;
    }
  }
  if (unmappedEmps > 0) {
    console.warn(`\n⚠️  ${unmappedEmps} empreendimento(s) sem mapeamento — linhas correspondentes serão puladas`);
  }

  // ── 5. Construir mapa doc: (numero + new_emp_id) → db_doc_id ─────────────
  const dbDocByNumeroEmp = new Map(); // `${numero}::${emp_id}` → doc_id
  for (const d of dbDocsRes.rows) {
    const key = `${normalizeNumero(d.numero)}::${d.empreendimento_id}`;
    if (!dbDocByNumeroEmp.has(key)) dbDocByNumeroEmp.set(key, d.id);
  }

  // ── 6. Carregar data_cadastro existente → set de (doc_id, emp_id) ─────────
  let existingSet = new Set();
  if (skipExisting) {
    const existingRes = await pool.query('SELECT documento_id, empreendimento_id FROM data_cadastro');
    for (const r of existingRes.rows) {
      existingSet.add(`${r.documento_id}::${r.empreendimento_id}`);
    }
    console.log(`\n🔍 ${existingSet.size} registros existentes no banco (--skip-existing ativo)`);
  }

  // ── 7. Importar ────────────────────────────────────────────────────────────
  console.log('\n🚀 Iniciando importação...');
  const stats = { total: dcRows.length, inserted: 0, skipped: 0, noEmp: 0, noDoc: 0, alreadyExists: 0, errors: 0 };

  for (const row of dcRows) {
    const old_emp_id = row.empreendimento_id;
    const old_doc_id = row.documento_id;

    // Resolver empreendimento
    const new_emp_id = empMapping.get(old_emp_id);
    if (!new_emp_id) {
      stats.noEmp++;
      stats.skipped++;
      continue;
    }

    // Resolver documento via Documento.csv
    const docInfo = docCsvById.get(old_doc_id);
    let new_doc_id = null;

    if (docInfo && docInfo.numero) {
      const key = `${docInfo.numero}::${new_emp_id}`;
      new_doc_id = dbDocByNumeroEmp.get(key) || null;

      // Fallback: buscar só por numero (empreendimento pode ter mudado)
      if (!new_doc_id) {
        const docsWithNumero = dbDocsByNumero.get(docInfo.numero) || [];
        if (docsWithNumero.length === 1) {
          new_doc_id = docsWithNumero[0].id;
        }
      }
    }

    if (!new_doc_id) {
      stats.noDoc++;
      stats.skipped++;
      continue;
    }

    // Verificar existência se --skip-existing
    if (skipExisting) {
      const existKey = `${new_doc_id}::${new_emp_id}`;
      if (existingSet.has(existKey)) {
        stats.alreadyExists++;
        stats.skipped++;
        continue;
      }
    }

    // Normalizar datas (campo JSON)
    let datas = {};
    if (row.datas) {
      try { datas = JSON.parse(row.datas); } catch (_) { datas = {}; }
    }

    const ordem = row.ordem != null && row.ordem !== '' ? Number(row.ordem) : 0;

    if (dryRun) {
      console.log(`[DRY-RUN] empreendimento_id=${new_emp_id}, documento_id=${new_doc_id}, ordem=${ordem}, datas_keys=${Object.keys(datas).join(',') || '(vazio)'}`);
      stats.inserted++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO data_cadastro (empreendimento_id, documento_id, ordem, datas)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [new_emp_id, new_doc_id, ordem, JSON.stringify(datas)]
      );
      stats.inserted++;
      existingSet.add(`${new_doc_id}::${new_emp_id}`);
    } catch (err) {
      console.error(`❌ Erro: emp=${new_emp_id} doc=${new_doc_id}: ${err.message}`);
      stats.errors++;
    }

    if ((stats.inserted + stats.skipped) % 500 === 0) {
      process.stdout.write(`   Processados ${stats.inserted + stats.skipped}/${stats.total}...\r`);
    }
  }

  console.log('\n✅ Importação concluída!');
  console.log(`   Total linhas   : ${stats.total}`);
  console.log(`   Inseridos      : ${stats.inserted}`);
  console.log(`   Pulados        : ${stats.skipped}`);
  if (stats.noEmp > 0)        console.log(`     ↳ sem mapeamento de empreendimento : ${stats.noEmp}`);
  if (stats.noDoc > 0)        console.log(`     ↳ documento não encontrado no banco : ${stats.noDoc}`);
  if (stats.alreadyExists > 0) console.log(`     ↳ já existia no banco              : ${stats.alreadyExists}`);
  if (stats.errors > 0)       console.log(`   Erros          : ${stats.errors}`);
  if (dryRun) console.log('   (dry-run: nenhum dado foi modificado)');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
