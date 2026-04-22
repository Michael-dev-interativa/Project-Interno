/*
  Debug: mostra os primeiros valores de atividade_id e empreendimento_id do CSV
*/

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csvParse = require('csv-parse');
const parse = (csvParse && (csvParse.parse || csvParse));

function readCsvTextWithBestEncoding(filePath) {
  const raw = fs.readFileSync(filePath);
  const utf8 = raw.toString('utf8');
  const latin1 = raw.toString('latin1');
  return utf8; // simplificado
}

function detectDelimiter(filePath) {
  const text = readCsvTextWithBestEncoding(filePath);
  const firstLine = (text || '').split(/\r?\n/, 1)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

async function main() {
  const csvArg = process.argv[2];
  if (!csvArg) {
    console.error('Uso: node debug_csv.js <caminho_csv>');
    process.exit(1);
  }

  const csvPath = path.isAbsolute(csvArg) ? csvArg : path.resolve(process.cwd(), csvArg);
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo não encontrado:', csvPath);
    process.exit(1);
  }

  const delimiter = detectDelimiter(csvPath);
  const text = readCsvTextWithBestEncoding(csvPath);
  const parser = Readable.from([text]).pipe(parse({
    columns: true,
    trim: true,
    skip_empty_lines: true,
    relax_quotes: true,
    delimiter,
  }));

  let count = 0;
  console.log('Primeiras 10 linhas - Valores de atividade_id e empreendimento_id:');
  console.log('---');

  for await (const row of parser) {
    count++;
    if (count > 10) break;

    console.log(`Linha ${count}:`);
    console.log(`  atividade_id: [${typeof row.atividade_id}] "${row.atividade_id}"`);
    console.log(`  empreendimento_id: [${typeof row.empreendimento_id}] "${row.empreendimento_id}"`);
    console.log(`  executor_principal: [${typeof row.executor_principal}] "${row.executor_principal}"`);
    console.log('');
  }
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
