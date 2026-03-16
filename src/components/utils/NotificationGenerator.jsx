import { useEffect, useContext } from 'react';
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { NotificacaoAtividade, AtividadeFuncao } from '@/entities/all';
import { retryWithBackoff } from './apiUtils';
import { format, startOfWeek, isFriday } from 'date-fns';

/**
 * Hook que verifica e cria notificações de atividades ocasionais
 * quando o usuário acessa o sistema às sextas-feiras
 */
export default function NotificationGenerator() {
  const { user } = useContext(ActivityTimerContext);

  useEffect(() => {
    if (!user?.email || !user?.cargo) return;

    const gerarNotificacoes = async () => {
      try {
        const hoje = new Date();
        
        // Só processar às sextas-feiras
        if (!isFriday(hoje)) {
          return;
        }

        const inicioDaSemana = format(startOfWeek(hoje, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const hojeStr = format(hoje, 'yyyy-MM-dd');

        // Verificar se já existe notificação para este usuário nesta semana
        const notificacoesExistentes = await retryWithBackoff(
          () => NotificacaoAtividade.filter({
            usuario_email: user.email,
            data_notificacao: { $gte: inicioDaSemana }
          }),
          3, 1000, 'checkExistingNotifications'
        );

        if (notificacoesExistentes && notificacoesExistentes.length > 0) {
          console.log('✅ Notificações já criadas esta semana para', user.email);
          return;
        }

        // Buscar atividades ocasionais para o cargo do usuário
        const atividadesOcasionais = await retryWithBackoff(
          () => AtividadeFuncao.filter({
            funcao: user.cargo,
            frequencia: 'ocasional'
          }),
          3, 1000, 'getOccasionalActivities'
        );

        if (!atividadesOcasionais || atividadesOcasionais.length === 0) {
          console.log('ℹ️ Nenhuma atividade ocasional encontrada para o cargo:', user.cargo);
          return;
        }

        // Criar notificações para cada atividade ocasional
        const notificacoesCriadas = [];
        for (const atividade of atividadesOcasionais) {
          try {
            const novaNotificacao = await retryWithBackoff(
              () => NotificacaoAtividade.create({
                usuario_email: user.email,
                atividade_funcao_id: atividade.id,
                atividade_nome: atividade.atividade,
                tempo_estimado: atividade.tempo_estimado,
                status: 'pendente',
                data_notificacao: hojeStr
              }),
              3, 1000, 'createNotification'
            );
            notificacoesCriadas.push(novaNotificacao);
            console.log(`✅ Notificação criada: ${atividade.atividade} para ${user.email}`);
          } catch (error) {
            console.error(`❌ Erro ao criar notificação para ${atividade.atividade}:`, error);
          }
        }

        if (notificacoesCriadas.length > 0) {
          console.log(`🔔 ${notificacoesCriadas.length} notificação(ões) criada(s) para ${user.email}`);
        }

      } catch (error) {
        console.error('❌ Erro ao gerar notificações ocasionais:', error);
      }
    };

    // Executar após 2 segundos para dar tempo do sistema carregar
    const timer = setTimeout(gerarNotificacoes, 2000);

    return () => clearTimeout(timer);
  }, [user]);

  return null; // Componente invisível
}