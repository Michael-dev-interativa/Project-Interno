/*
  Vincula documentos aos empreendimentos usando os CSVs de origem.

  Uso:
    node scripts/link_documentos_empreendimentos.js <documentos_csv> <empreendimentos_csv> [--dry-run]

  Exemplo:
    node scripts/link_documentos_empreendimentos.js C:/import/Documento_export.csv C:/import/Empreendimentos_export.csv
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));
const { pool } = require('../db/pool');

function detectDelimiter(filePath) {
  const firstLine = fs.readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

function norm(v) {
  return v == null ? '' : String(v).trim();
}

function normLower(v) {
  return norm(v).toLowerCase();
}

async function readCsvRows(filePath) {
  const delimiter = detectDelimiter(filePath);
  const rows = [];

  const parser = fs.createReadStream(filePath).pipe(parse({
    columns: true,
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter,
  }));

  for await (const row of parser) rows.push(row);
  return { rows, delimiter };
}

async function main() {
  const [, , docsCsvArg, empsCsvArg, ...opts] = process.argv;
  if (!docsCsvArg || !empsCsvArg) {
    console.error('Uso: node scripts/link_documentos_empreendimentos.js <documentos_csv> <empreendimentos_csv> [--dry-run]');
    process.exit(1);
  }

  if (typeof parse !== 'function') {
    console.error('Dependencia csv-parse nao encontrada. Rode: npm install');
    process.exit(1);
  }

  const dryRun = opts.includes('--dry-run');
  const docsCsvPath = path.isAbsolute(docsCsvArg) ? docsCsvArg : path.resolve(process.cwd(), docsCsvArg);
  const empsCsvPath = path.isAbsolute(empsCsvArg) ? empsCsvArg : path.resolve(process.cwd(), empsCsvArg);

  if (!fs.existsSync(docsCsvPath)) {
    console.error('Arquivo de documentos nao encontrado:', docsCsvPath);
    process.exit(1);
  }
  if (!fs.existsSync(empsCsvPath)) {
    console.error('Arquivo de empreendimentos nao encontrado:', empsCsvPath);
    process.exit(1);
  }

  const docsCsv = await readCsvRows(docsCsvPath);
  const empsCsv = await readCsvRows(empsCsvPath);

  // Mapa: id legado (empreendimentos csv) -> nome empreendimento
  const legacyEmpIdToName = new Map();
  for (const row of empsCsv.rows) {
    const legacyId = norm(row.id);
    const nome = norm(row.nome || row.name || row.empreendimento || row.titulo);
    if (!legacyId || !nome) continue;
    legacyEmpIdToName.set(legacyId, nome);
  }

  const client = await pool.connect();
  const stats = {
    docsRows: docsCsv.rows.length,
    empsRows: empsCsv.rows.length,
    mappingsByNumeroArquivo: 0,
    mappingsByNumeroOnly: 0,
    missingLegacyEmpIdOnDoc: 0,
    missingNumeroOnDoc: 0,
    missingArquivoOnDoc: 0,
    legacyEmpIdNotFoundInEmpCsv: 0,
    empNameNotFoundInDb: 0,
    conflictingNumeroArquivoMappings: 0,
    conflictingNumeroOnlyMappings: 0,
    updatedDocs: 0,
  };

  try {
    const empRes = await client.query('SELECT id, nome FROM empreendimentos');
    const dbEmpNameToId = new Map();
    for (const row of empRes.rows) {
      dbEmpNameToId.set(normLower(row.nome), row.id);
    }

    // chave precisa: numero|arquivo -> empreendimento_id
    const numeroArquivoToEmpId = new Map();
    // fallback: numero -> empreendimento_id (apenas quando nao houver conflito)
    const numeroToEmpId = new Map();
    const numeroConflicts = new Set();

    for (const row of docsCsv.rows) {
      const numero = norm(row.numero);
      const arquivo = norm(row.arquivo);
      const legacyEmpId = norm(row.empreendimento_id);

      if (!numero) {
        stats.missingNumeroOnDoc += 1;
        continue;
      }
      if (!arquivo) {
        stats.missingArquivoOnDoc += 1;
      }
      if (!legacyEmpId) {
        stats.missingLegacyEmpIdOnDoc += 1;
        continue;
      }

      const empName = legacyEmpIdToName.get(legacyEmpId);
      if (!empName) {
        stats.legacyEmpIdNotFoundInEmpCsv += 1;
        continue;
      }

      const empId = dbEmpNameToId.get(normLower(empName));
      if (!empId) {
        stats.empNameNotFoundInDb += 1;
        continue;
      }

      if (arquivo) {
        const k = `${numero}||${arquivo}`;
        if (numeroArquivoToEmpId.has(k) && numeroArquivoToEmpId.get(k) !== empId) {
          stats.conflictingNumeroArquivoMappings += 1;
          continue;
        }
        if (!numeroArquivoToEmpId.has(k)) {
          numeroArquivoToEmpId.set(k, empId);
        }
      }

      if (numeroToEmpId.has(numero) && numeroToEmpId.get(numero) !== empId) {
        numeroConflicts.add(numero);
        stats.conflictingNumeroOnlyMappings += 1;
        continue;
      }

      if (!numeroToEmpId.has(numero)) {
        numeroToEmpId.set(numero, empId);
      }
    }

    // Remove numero-only keys that are ambiguous in source CSV.
    for (const n of numeroConflicts.values()) {
      numeroToEmpId.delete(n);
    }

    stats.mappingsByNumeroArquivo = numeroArquivoToEmpId.size;
    stats.mappingsByNumeroOnly = numeroToEmpId.size;

    if (!dryRun) await client.query('BEGIN');

    for (const [k, empId] of numeroArquivoToEmpId.entries()) {
      if (dryRun) continue;
      const sep = '||';
      const i = k.indexOf(sep);
      const numero = k.slice(0, i);
      const arquivo = k.slice(i + sep.length);
      const upd = await client.query(
        `UPDATE documentos
         SET empreendimento_id = $1, updated_at = now()
         WHERE numero = $2
           AND arquivo = $3
           AND (empreendimento_id IS NULL OR empreendimento_id <> $1)`,
        [empId, numero, arquivo]
      );
      stats.updatedDocs += upd.rowCount || 0;
    }

    // Fallback: numero-only updates only for non-ambiguous numeros.
    for (const [numero, empId] of numeroToEmpId.entries()) {
      if (dryRun) continue;
      const upd = await client.query(
        `UPDATE documentos
         SET empreendimento_id = $1, updated_at = now()
         WHERE numero = $2
           AND empreendimento_id IS NULL`,
        [empId, numero]
      );
      stats.updatedDocs += upd.rowCount || 0;
    }

    if (!dryRun) await client.query('COMMIT');

    const check = await client.query(
      'SELECT count(*)::int AS total, count(*) FILTER (WHERE empreendimento_id IS NULL)::int AS sem_vinculo FROM documentos'
    );

    console.log('Vinculacao finalizada');
    console.log('Documentos CSV:', docsCsvPath, `delimitador=${JSON.stringify(docsCsv.delimiter)}`);
    console.log('Empreendimentos CSV:', empsCsvPath, `delimitador=${JSON.stringify(empsCsv.delimiter)}`);
    console.log('Resumo:', JSON.stringify(stats));
    console.log('Estado documentos:', JSON.stringify(check.rows[0] || {}));

    if (dryRun) {
      console.log('Dry-run: nenhuma alteracao foi gravada no banco.');
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // no-op
    }
    throw err;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error('Falha na vinculacao:', err.message || err);
  process.exit(1);
});
