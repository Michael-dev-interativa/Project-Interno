require('dotenv').config();
const { runImport } = require('./import_csv');

const DEFAULT_COLUMNS = [
  'assunto',
  'rev',
  'data',
  'horario',
  'providencias',
  'emissao',
  'folha',
  'controle',
  'local',
  'participantes',
  'status',
  'created_date',
  'updated_date'
].join(',');

async function main() {
  const [, , csvPath, columnsArg] = process.argv;
  if (!csvPath) {
    console.error('Usage: node import_atas_csv.js <csv_path> [columns]');
    process.exit(1);
  }
  const columns = columnsArg || DEFAULT_COLUMNS;
  try {
    await runImport({ csvPath, table: 'atas_reuniao', columns });
  } catch (err) {
    console.error('❌ Falha ao importar ATAs:', err.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
