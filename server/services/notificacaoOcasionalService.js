const { pool } = require('../db/pool');
const notificacaoModel = require('../models/notificacaoAtividade');
const { sendNotificacaoOcasional } = require('./emailService');

function getStartOfWeek() {
  const today = new Date();
  const dow = today.getDay();
  const diff = dow === 0 ? -6 : 1 - dow; // Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

async function dispararNotificacoesOcasionais() {
  const semanaInicio = getStartOfWeek();
  let totalEnviados = 0;
  let totalJaExistiam = 0;
  const erros = [];

  console.log(`🔔 Disparando notificações ocasionais — semana a partir de ${semanaInicio}`);

  const [usersResult, atvsResult] = await Promise.all([
    pool.query(`SELECT id, email, name, cargo FROM users WHERE cargo IS NOT NULL AND cargo <> '' AND email IS NOT NULL`),
    pool.query(`SELECT * FROM atividade_funcoes WHERE frequencia = 'ocasional' AND funcao IS NOT NULL`),
  ]);

  const usuarios = usersResult.rows;
  const atividades = atvsResult.rows;

  for (const user of usuarios) {
    const atvsDoUsuario = atividades.filter(a => a.funcao === user.cargo);

    for (const atv of atvsDoUsuario) {
      try {
        const existing = await pool.query(
          `SELECT id FROM notificacoes_atividade
           WHERE usuario_email = $1 AND atividade_funcao_id = $2 AND data_notificacao >= $3`,
          [user.email, atv.id, semanaInicio]
        );

        if (existing.rows.length > 0) {
          // Se existe mas email não foi enviado, tentar enviar agora
          const notifExistente = await pool.query(
            `SELECT id, token_resposta FROM notificacoes_atividade
             WHERE usuario_email = $1 AND atividade_funcao_id = $2 AND data_notificacao >= $3 AND email_enviado = FALSE LIMIT 1`,
            [user.email, atv.id, semanaInicio]
          );
          if (notifExistente.rows.length > 0) {
            const n = notifExistente.rows[0];
            const enviado = await sendNotificacaoOcasional({
              to: user.email,
              usuario_nome: user.name,
              atividade_nome: atv.nome,
              tempo_estimado: atv.tempo_estimado,
              token: n.token_resposta,
            });
            if (enviado) {
              await notificacaoModel.updateNotificacao(n.id, { email_enviado: true });
              totalEnviados++;
            } else {
              totalJaExistiam++;
            }
          } else {
            totalJaExistiam++;
          }
          continue;
        }

        const notif = await notificacaoModel.createNotificacao({
          usuario_email: user.email,
          atividade_funcao_id: atv.id,
          atividade_nome: atv.nome,
          tempo_estimado: atv.tempo_estimado,
          status: 'pendente',
          data_notificacao: new Date().toISOString().split('T')[0],
        });

        const enviado = await sendNotificacaoOcasional({
          to: user.email,
          usuario_nome: user.name,
          atividade_nome: atv.nome,
          tempo_estimado: atv.tempo_estimado,
          token: notif.token_resposta,
        });

        if (enviado) {
          await notificacaoModel.updateNotificacao(notif.id, { email_enviado: true });
          totalEnviados++;
        }
      } catch (err) {
        erros.push({ usuario: user.email, atividade: atv.nome, erro: err.message });
        console.error(`❌ Erro ao processar ${user.email} / ${atv.nome}:`, err.message);
      }
    }
  }

  const resultado = { totalEnviados, totalJaExistiam, erros };
  console.log('📊 Resultado disparo:', resultado);
  return resultado;
}

module.exports = { dispararNotificacoesOcasionais };
