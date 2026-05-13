const nodemailer = require('nodemailer');

const APP_URL = process.env.APP_URL || 'http://localhost:3001';

function getNextWorkingDays(count = 5) {
  const days = [];
  const names = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const cur = new Date();
  cur.setDate(cur.getDate() + 1);

  while (days.length < count) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      days.push({ date: `${y}-${m}-${d}`, label: `${names[dow]}, ${d}/${m}` });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function buildEmailHtml({ atividade_nome, tempo_estimado, token, usuario_nome }) {
  const days = getNextWorkingDays(5);
  const base = APP_URL;

  const dayButtons = days.map(day => `
    <a href="${base}/api/notificacoes/responder?token=${token}&data=${day.date}"
       style="display:block;background:#3b82f6;color:#ffffff;text-decoration:none;
              padding:13px 16px;border-radius:6px;margin:7px 0;text-align:center;
              font-size:14px;font-weight:500;">
      📅 ${day.label}
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:480px;margin:32px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
    <div style="background:#f59e0b;padding:24px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">🔔</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">Atividade Ocasional</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 6px;color:#374151;">Olá, <strong>${usuario_nome || 'colaborador'}</strong>!</p>
      <p style="color:#6b7280;margin:0 0 20px;font-size:14px;">Você tem uma atividade ocasional pendente para esta semana:</p>

      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#92400e;">${atividade_nome}</p>
        <p style="margin:0;font-size:13px;color:#b45309;">⏱ Tempo estimado: ${tempo_estimado}h</p>
      </div>

      <p style="font-weight:600;color:#374151;margin:0 0 12px;">Em qual dia você vai realizar esta atividade?</p>
      ${dayButtons}

      <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:16px;">
        <a href="${base}/api/notificacoes/responder?token=${token}&ignorar=true"
           style="display:block;background:#f9fafb;color:#6b7280;text-decoration:none;
                  padding:13px 16px;border-radius:6px;text-align:center;
                  font-size:14px;border:1px solid #e5e7eb;">
          ❌ Não vai ocorrer esta semana
        </a>
      </div>

      <p style="color:#9ca3af;font-size:11px;margin:24px 0 0;text-align:center;line-height:1.5;">
        Este email foi enviado automaticamente pelo sistema de planejamento.<br>
        Você também pode responder diretamente pelo sistema.
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendNotificacaoOcasional({ to, usuario_nome, atividade_nome, tempo_estimado, token }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('⚠️  SMTP não configurado (SMTP_HOST/SMTP_USER ausentes). Email não enviado.');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
      from: `"Sistema de Planejamento" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to,
      subject: `🔔 Atividade Ocasional: ${atividade_nome}`,
      html: buildEmailHtml({ atividade_nome, tempo_estimado, token, usuario_nome }),
    });

    console.log(`✅ Email enviado para ${to} — ${atividade_nome}`);
    return true;
  } catch (err) {
    console.error(`❌ Falha ao enviar email para ${to}:`, err.message);
    return false;
  }
}

module.exports = { sendNotificacaoOcasional };
