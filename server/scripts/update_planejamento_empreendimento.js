/*
  Atualiza planejamento_atividades com empreendimento_id baseado em atividades.

  Uso:
    node scripts/update_planejamento_empreendimento.js [--dry-run]
*/

require('dotenv').config();
const { pool } = require('../db/pool');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const client = await pool.connect();

  try {
    console.log('🔍 Iniciando atualização de empreendimento_id...');

    if (!dryRun) {
      await client.query('BEGIN');
    }

    // Buscar todos os planejamentos sem empreendimento_id mas com atividade_id
    const result = await client.query(`
      SELECT pa.id, pa.atividade_id, a.empreendimento_id
      FROM planejamento_atividades pa
      LEFT JOIN atividades a ON pa.atividade_id = a.id
      WHERE pa.empreendimento_id IS NULL AND pa.atividade_id IS NOT NULL
    `);

    const rows = result.rows;
    console.log(`📊 Encontrados ${rows.length} registros para atualizar`);

    let updated = 0;
    let noEmpreendimento = 0;

    for (const row of rows) {
      if (row.empreendimento_id) {
        if (!dryRun) {
          await client.query(
            'UPDATE planejamento_atividades SET empreendimento_id = $1 WHERE id = $2',
            [row.empreendimento_id, row.id]
          );
        }
        updated++;
      } else {
        noEmpreendimento++;
      }

      if ((updated + noEmpreendimento) % 1000 === 0) {
        process.stdout.write(`Processados ${updated + noEmpreendimento} registros...\r`);
      }
    }

    if (!dryRun) {
      await client.query('COMMIT');
    }

    console.log('\n✅ Processo finalizado!');
    console.log(`📈 Atualizados: ${updated}`);
    console.log(`⚠️  Sem empreendimento vinculado: ${noEmpreendimento}`);

    if (dryRun) {
      console.log('🔒 Dry-run: nenhum dado foi modificado');
    }

  } catch (err) {
    if (!dryRun) {
      try { await client.query('ROLLBACK'); } catch (_) { }
    }
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();
