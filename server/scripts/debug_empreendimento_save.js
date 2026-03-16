require('dotenv').config();
const { pool } = require('../db/pool');
const model = require('../models/empreendimento');

async function main() {
  const pick = await pool.query(
    "SELECT id, nome, cliente, endereco FROM empreendimentos WHERE nome ILIKE '%Ativa Logistica%' OR nome ILIKE '%Ativa Logística%' ORDER BY id DESC LIMIT 1"
  );

  if (!pick.rows.length) {
    console.log('no empreendimento found');
    return;
  }

  const emp = pick.rows[0];
  console.log('before:', emp);

  const stamp = new Date().toISOString();
  const cliente = `Cliente Teste ${stamp}`;
  const endereco = `Endereco Teste ${stamp}`;

  const updated = await model.updateEmpreendimento(emp.id, { cliente, endereco });
  console.log('updated:', { id: updated?.id, cliente: updated?.cliente, endereco: updated?.endereco });

  const after = await pool.query('SELECT id, nome, cliente, endereco FROM empreendimentos WHERE id = $1', [emp.id]);
  console.log('after:', after.rows[0]);
}

main()
  .catch((err) => {
    console.error('debug_empreendimento_save failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await pool.end(); } catch (_) { }
  });
