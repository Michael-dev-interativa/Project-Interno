/*
  Importa CSV de Pavimento para a tabela pavimentos.

  O CSV usa empreendimento_id no formato Base44 (string hex).
  O script cruza hex_id → nome do empreendimento via três estratégias:
    1. Empreendimento.csv  (campo id → nome_empreendimento/nome)
    2. Arquivo de mapeamento manual (--mapping=<caminho.json>)
    3. Documento.csv       (cruzamento via documentos já no banco)

  Uso:
    node scripts/import_pavimentos_csv.js <caminho_csv> \
      [--emp-csv=<caminho>] \
      [--mapping=<caminho.json>] \
      [--doc-csv=<caminho>] \
      [--dry-run]
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { pool } = require('../db/pool');

const args = process.argv.slice(2);
const csvPath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!csvPath) {
  console.error('Uso: node scripts/import_pavimentos_csv.js <caminho_csv> [--emp-csv=<caminho>] [--mapping=<caminho.json>] [--dry-run]');
  process.exit(1);
}

const importDir = path.dirname(path.resolve(csvPath));
const empCsvPath  = (args.find(a => a.startsWith('--emp-csv=')) || '').split('=').slice(1).join('=')  || path.join(importDir, 'Empreendimento.csv');
const docCsvPath  = (args.find(a => a.startsWith('--doc-csv=')) || '').split('=').slice(1).join('=')  || path.join(importDir, 'Documento.csv');
const mappingPath = (args.find(a => a.startsWith('--mapping='))  || '').split('=').slice(1).join('=') || path.join(importDir, 'pavimentos_mapping.json');

// ── Estratégia 1: Empreendimento.csv ────────────────────────────────────────
function loadEmpCsv() {
  const map = {};
  if (!fs.existsSync(empCsvPath)) return map;
  const rows = parse(fs.readFileSync(empCsvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  for (const e of rows) {
    const id   = (e.id || '').trim();
    const nome = (e.nome_empreendimento || e.nome || '').trim();
    if (id && nome) map[id] = nome;
  }
  console.log(`🗂️  ${Object.keys(map).length} hex IDs mapeados via Empreendimento.csv`);
  return map;
}

// ── Estratégia 2: arquivo de mapeamento manual ───────────────────────────────
function loadManualMapping() {
  const map = {};
  if (!fs.existsSync(mappingPath)) return map;
  const raw = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
  let count = 0;
  for (const [hex, entry] of Object.entries(raw)) {
    if (hex.startsWith('_')) continue;
    const nome = (entry.db_nome || '').trim();
    if (nome) { map[hex] = nome; count++; }
  }
  console.log(`🗺️  ${count} hex IDs mapeados via arquivo de mapeamento manual`);
  return map;
}

// ── Estratégia 3: Documento.csv + banco ─────────────────────────────────────
async function resolveViaDocCsv(hexToNome) {
  if (!fs.existsSync(docCsvPath)) return;
  const docRows = parse(fs.readFileSync(docCsvPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  const hexToNumeros = {};
  for (const d of docRows) {
    const hex    = (d.empreendimento_id || '').trim();
    const numero = (d.numero || '').trim();
    if (hex && numero) {
      if (!hexToNumeros[hex]) hexToNumeros[hex] = [];
      hexToNumeros[hex].push(numero);
    }
  }
  const faltantes = Object.keys(hexToNumeros).filter(h => !hexToNome[h]);
  if (!faltantes.length) return;

  for (const hex of faltantes) {
    for (const numero of hexToNumeros[hex].slice(0, 5)) {
      const r = await pool.query(
        `SELECT e.nome FROM empreendimentos e
         JOIN documentos d ON d.empreendimento_id = e.id
         WHERE d.numero = $1 LIMIT 1`,
        [numero]
      );
      if (r.rows.length > 0) { hexToNome[hex] = r.rows[0].nome; break; }
    }
  }
  const resolvidos = faltantes.filter(h => hexToNome[h]).length;
  console.log(`🔗 ${resolvidos}/${faltantes.length} hex IDs adicionais resolvidos via Documento.csv`);
}

async function main() {
  const content = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`📄 ${rows.length} pavimentos lidos do CSV`);

  await pool.query('SELECT 1');
  console.log('✅ DB connection OK');

  // Construir mapa hex → nome (estratégias 1 + 2, depois 3 via DB)
  const hexToNome = { ...loadEmpCsv(), ...loadManualMapping() };
  await resolveViaDocCsv(hexToNome);

  // Empreendimentos do banco por nome (case-insensitive)
  const empResult = await pool.query('SELECT id, nome FROM empreendimentos');
  const empByNome = {};
  for (const e of empResult.rows) empByNome[e.nome.trim().toLowerCase()] = e;
  console.log(`🏢 ${empResult.rows.length} empreendimentos no banco`);

  // Pavimentos existentes por empreendimento (para calcular ordem)
  const existingResult = await pool.query('SELECT empreendimento_id, COUNT(*) as c FROM pavimentos GROUP BY empreendimento_id');
  const existingCount = {};
  for (const r of existingResult.rows) existingCount[r.empreendimento_id] = Number(r.c);

  // Agrupar pavimentos por hex empreendimento_id
  const byEmp = {};
  for (const row of rows) {
    const hex = (row.empreendimento_id || '').trim();
    if (!hex) continue;
    if (!byEmp[hex]) byEmp[hex] = [];
    byEmp[hex].push(row);
  }

  let inserted    = 0;
  let skipped     = 0;
  let empNotFound = 0;

  for (const [hexEmpId, empRows] of Object.entries(byEmp)) {
    const nomeEmp = hexToNome[hexEmpId];
    if (!nomeEmp) {
      console.log(`⚠️  hex "${hexEmpId}" sem mapeamento — ${empRows.length} pavimentos ignorados`);
      empNotFound += empRows.length;
      continue;
    }

    const emp = empByNome[nomeEmp.trim().toLowerCase()];
    if (!emp) {
      console.log(`⚠️  Empreendimento "${nomeEmp}" não encontrado no banco — ${empRows.length} pavimentos ignorados`);
      empNotFound += empRows.length;
      continue;
    }

    const baseOrdem = existingCount[emp.id] || 0;

    for (let i = 0; i < empRows.length; i++) {
      const row  = empRows[i];
      const nome = (row.nome || '').trim();
      if (!nome) { skipped++; continue; }

      const area   = row.area  && row.area.trim()  !== '' ? Number(row.area)  || null : null;
      const escala = row.escala && row.escala.trim() !== '' ? row.escala.trim() : null;
      const ordem  = baseOrdem + i + 1;

      if (dryRun) {
        console.log(`[DRY-RUN] emp="${emp.nome}" (id=${emp.id})  nome="${nome}"  ordem=${ordem}  area=${area}`);
        inserted++;
        continue;
      }

      const existing = await pool.query(
        'SELECT id FROM pavimentos WHERE empreendimento_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2))',
        [emp.id, nome]
      );
      if (existing.rows.length > 0) { skipped++; continue; }

      await pool.query(
        'INSERT INTO pavimentos (empreendimento_id, nome, ordem, area, escala) VALUES ($1,$2,$3,$4,$5)',
        [emp.id, nome, ordem, area, escala]
      );
      inserted++;
    }

    if (!dryRun) console.log(`  ✅ "${emp.nome}": ${empRows.length} processados`);
  }

  console.log(`\n📊 Resultado:`);
  console.log(`   Inseridos:                       ${inserted}`);
  console.log(`   Ignorados (duplicados/sem nome): ${skipped}`);
  console.log(`   Sem mapeamento:                  ${empNotFound} registros`);
  if (dryRun) console.log('\n⚠️  MODO DRY-RUN — nada foi inserido no banco');

  await pool.end();
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
