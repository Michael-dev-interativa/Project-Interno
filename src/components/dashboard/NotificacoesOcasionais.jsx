import { useState, useEffect, useContext } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Bell } from 'lucide-react';
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { NotificacaoAtividade, AtividadeFuncao, PlanejamentoAtividade } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';
import { format, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { distribuirHorasPorDias } from '../utils/DateCalculator';

export default function NotificacoesOcasionais() {
  const { user } = useContext(ActivityTimerContext);
  const [notificacoesPendentes, setNotificacoesPendentes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentNotification, setCurrentNotification] = useState(null);

  useEffect(() => {
    if (user?.email) {
      checkForNotifications();
    }
  }, [user]);

  const checkForNotifications = async () => {
    try {
      // Verificar se hoje é sexta-feira
      const hoje = new Date();
      const inicioDaSemana = format(startOfWeek(hoje, { weekStartsOn: 1 }), 'yyyy-MM-dd');

      // Buscar notificações pendentes desta semana
      const notificacoes = await retryWithBackoff(
        () => NotificacaoAtividade.filter({
          usuario_email: user.email,
          status: 'pendente',
          data_notificacao: { $gte: inicioDaSemana }
        }),
        3, 1000, 'checkNotifications'
      );

      if (notificacoes && notificacoes.length > 0) {
        setNotificacoesPendentes(notificacoes);
        setCurrentNotification(notificacoes[0]);
        setShowModal(true);
      }
    } catch {
    }
  };

  const handleAgendar = async () => {
    if (!selectedDate || !currentNotification) return;

    setIsProcessing(true);
    try {
      // Buscar a atividade função
      const atividadeFuncao = await retryWithBackoff(
        () => AtividadeFuncao.filter({ id: currentNotification.atividade_funcao_id }, null, 1),
        3, 1000, 'getAtividadeFuncao'
      );

      if (!atividadeFuncao || atividadeFuncao.length === 0) {
        throw new Error('Atividade não encontrada');
      }

      const atividade = atividadeFuncao[0];

      // Buscar planejamentos existentes para calcular carga
      const planejamentosExistentes = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({ 
          executor_principal: user.email,
          status: { $ne: 'concluido' }
        }),
        3, 1000, 'getPlanejamentosExistentes'
      );

      // Construir mapa de carga diária
      const cargaDiaria = {};
      (planejamentosExistentes || []).forEach(plano => {
        if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
          Object.entries(plano.horas_por_dia).forEach(([data, horas]) => {
            cargaDiaria[data] = (cargaDiaria[data] || 0) + Number(horas);
          });
        }
      });

      // Distribuir horas respeitando a agenda
      const resultado = distribuirHorasPorDias(
        selectedDate,
        atividade.tempo_estimado,
        8,
        cargaDiaria,
        false
      );

      // Criar planejamento
      const novoPlanejamento = await retryWithBackoff(
        () => PlanejamentoAtividade.create({
          descritivo: atividade.atividade,
          base_descritivo: atividade.atividade,
          tempo_planejado: atividade.tempo_estimado,
          executor_principal: user.email,
          executores: [user.email],
          status: 'nao_iniciado',
          inicio_planejado: format(selectedDate, 'yyyy-MM-dd'),
          termino_planejado: format(resultado.dataTermino, 'yyyy-MM-dd'),
          horas_por_dia: resultado.distribuicao,
          prioridade: 1,
          etapa: 'Execução'
        }),
        3, 1000, 'createPlanning'
      );

      // Atualizar notificação
      await retryWithBackoff(
        () => NotificacaoAtividade.update(currentNotification.id, {
          status: 'agendada',
          data_agendada: format(selectedDate, 'yyyy-MM-dd'),
          planejamento_id: novoPlanejamento.id
        }),
        3, 1000, 'updateNotification'
      );

      // Passar para próxima notificação ou fechar
      const proximasNotificacoes = notificacoesPendentes.filter(n => n.id !== currentNotification.id);
      if (proximasNotificacoes.length > 0) {
        setNotificacoesPendentes(proximasNotificacoes);
        setCurrentNotification(proximasNotificacoes[0]);
        setSelectedDate(null);
      } else {
        setShowModal(false);
        setNotificacoesPendentes([]);
        setCurrentNotification(null);
      }
    } catch (error) {
      alert('Erro ao agendar atividade: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIgnorar = async () => {
    if (!currentNotification) return;

    setIsProcessing(true);
    try {
      await retryWithBackoff(
        () => NotificacaoAtividade.update(currentNotification.id, {
          status: 'ignorada'
        }),
        3, 1000, 'ignoreNotification'
      );

      // Passar para próxima notificação ou fechar
      const proximasNotificacoes = notificacoesPendentes.filter(n => n.id !== currentNotification.id);
      if (proximasNotificacoes.length > 0) {
        setNotificacoesPendentes(proximasNotificacoes);
        setCurrentNotification(proximasNotificacoes[0]);
        setSelectedDate(null);
      } else {
        setShowModal(false);
        setNotificacoesPendentes([]);
        setCurrentNotification(null);
      }
    } catch {
      alert('Erro ao ignorar notificação');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentNotification) return null;

  return (
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <DialogTitle>Atividade Ocasional</DialogTitle>
          </div>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="font-medium text-amber-900 mb-1">{currentNotification.atividade_nome || 'Atividade'}</h3>
            <p className="text-sm text-amber-700">
              Tempo estimado: {currentNotification.tempo_estimado || '0'}h
            </p>
          </div>

          {notificacoesPendentes.length > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Notificação {notificacoesPendentes.indexOf(currentNotification) + 1} de {notificacoesPendentes.length}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Quando você quer realizar esta atividade?</label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={ptBR}
              disabled={(date) => date < new Date() || date.getDay() === 0 || date.getDay() === 6}
              className="rounded-md border"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handleIgnorar}
            disabled={isProcessing}
          >
            Não desta vez
          </Button>
          <Button
            onClick={handleAgendar}
            disabled={!selectedDate || isProcessing}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {isProcessing ? 'Agendando...' : 'Agendar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}