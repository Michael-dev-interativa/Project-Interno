/*
  Mapeia atividade_id baseado em descritivo (descrição)

  Uso:
    node scripts/map_atividade_by_descritivo.js [--dry-run]
*/

require('dotenv').config();
const { pool } = require('../db/pool');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const client = await pool.connect();

  try {
    console.log('🔍 Buscando atividades para mapear...');

    if (!dryRun) {
      await client.query('BEGIN');
    }

    // Buscar planejamentos sem atividade_id
    const planejamentos = await client.query(`
      SELECT id, descricao
      FROM planejamento_atividades
      WHERE atividade_id IS NULL AND descricao IS NOT NULL
      LIMIT 100
    `);

    const rows = planejamentos.rows;
    console.log(`📊 Encontrados ${rows.length} planejamentos para mapear`);

    let mapped = 0;
    let notFound = 0;

    for (const planej of rows) {
      // Tentar encontrar atividade com título similar
      const result = await client.query(`
        SELECT id, titulo
        FROM atividades
        WHERE lower(titulo) ILIKE lower($1) OR lower(descricao) ILIKE lower($1)
        LIMIT 1
      `, [`%${planej.descricao}%`]);

      if (result.rows.length > 0) {
        const atividadeId = result.rows[0].id;
        if (!dryRun) {
          await client.query(
            'UPDATE planejamento_atividades SET atividade_id = $1 WHERE id = $2',
            [atividadeId, planej.id]
          );
        }
        console.log(`✅ Planejamento ${planej.id}: "${planej.descricao}" -> Atividade ${atividadeId}`);
        mapped++;
      } else {
        console.log(`❌ Planejamento ${planej.id}: "${planej.descricao}" -> Não encontrou atividade`);
        notFound++;
      }
    }

    if (!dryRun) {
      await client.query('COMMIT');
    }

    console.log('\n✅ Processo finalizado!');
    console.log(`📈 Mapeadas: ${mapped}`);
    console.log(`⚠️  Não encontradas: ${notFound}`);

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
