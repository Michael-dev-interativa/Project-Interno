require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('../db/pool');

const ITEMS = [
  'Verificação de e-mail',
  'Planejamento Global',
  'Planejamento Individual',
  'Respostas ao Cliente',
  'Realocação de Projeto',
  'Confecção de propostas',
  'Estudo e concepção',
  'Leitura de email',
  'Atividade particular',
  'Reunião interna',
  'Ajuda a colaborador',
  'Reunião externa',
];

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atividades_genericas (
      nome TEXT NOT NULL
    )
  `);
}

async function insertMissingItems() {
  for (const nome of ITEMS) {
    await pool.query(
      `
      INSERT INTO atividades_genericas (nome)
      SELECT $1
      WHERE NOT EXISTS (
        SELECT 1
        FROM atividades_genericas
        WHERE LOWER(TRIM(nome)) = LOWER(TRIM($1))
      )
      `,
      [nome]
    );
  }
}

async function main() {
  try {
    await ensureTable();
    await insertMissingItems();
    const result = await pool.query('SELECT nome FROM atividades_genericas ORDER BY nome ASC');
    console.log('Itens de atividades rápidas atualizados com sucesso.');
    console.table(result.rows);
  } catch (error) {
    console.error('Erro ao adicionar atividades rápidas:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
