import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, Calendar } from "lucide-react";
import { Execucao, PlanejamentoAtividade, PlanejamentoDocumento } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';
import { realocarAtividadesDoDiaSeguinte } from '../utils/ReagendamentoAutomatico';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function FinalizarAtividadeButton({ plano, displayName, onSuccess }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [observacao, setObservacao] = useState('');

  const handleOpenModal = () => {
    setObservacao('');
    setShowModal(true);
  };

  const handleFinalizarAtividade = async () => {
    setIsProcessing(true);
    try {
      // Buscar todas as execuções da atividade
      const execucoesAtividade = await retryWithBackoff(
        () => Execucao.filter({ planejamento_id: plano.id }),
        3, 1000, 'finalizarAtividade.buscarExecucoes'
      );

      const tempoTotalExecutado = (execucoesAtividade || []).reduce((total, exec) => {
        return total + (Number(exec.tempo_total) || 0);
      }, 0);


      // Mapear horas executadas por dia (calculadas a partir das execuções)
      const horasExecutadasPorDia = {};
      (execucoesAtividade || []).forEach(exec => {
        if (exec.inicio) {
          const diaExec = format(new Date(exec.inicio), 'yyyy-MM-dd');
          const tempoExec = Number(exec.tempo_total) || 0;
          horasExecutadasPorDia[diaExec] = (horasExecutadasPorDia[diaExec] || 0) + tempoExec;
        }
      });


      const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;

      const updateData = {
        tempo_executado: tempoTotalExecutado,
        status: 'concluido',
        termino_real: format(new Date(), 'yyyy-MM-dd'),
        horas_executadas_por_dia: horasExecutadasPorDia
      };

      if (observacao && observacao.trim()) {
        updateData.observacao = observacao.trim();
      }

      
      await retryWithBackoff(
        () => entityToUpdate.update(plano.id, updateData),
        3, 1000, 'finalizarAtividade.update'
      );

      
      // **CRÍTICO**: Verificar se realmente foi atualizado
      const verificacao = await retryWithBackoff(
        () => entityToUpdate.filter({ id: plano.id }),
        3, 1000, 'finalizarAtividade.verificar'
      );
      

      setShowModal(false);
      
      // **CRÍTICO**: Chamar onSuccess ANTES de fazer outras operações
      if (onSuccess) {
        onSuccess();
      }

      const horasLiberadas = plano.tempo_planejado - tempoTotalExecutado;
      

      // **REALOCAÇÃO AUTOMÁTICA**: Tentar antecipar atividades do dia seguinte
      let atividadesMovidas = [];
      if (horasLiberadas > 0.1 && plano.executor_principal && plano.inicio_planejado) {
        atividadesMovidas = await realocarAtividadesDoDiaSeguinte(
          plano.executor_principal,
          plano.inicio_planejado,
          horasLiberadas
        );
      }

      // Mensagem de sucesso aprimorada
      let mensagem = `✅ Atividade finalizada com sucesso!\n\n📊 Resumo:\n• Tempo executado: ${tempoTotalExecutado.toFixed(1)}h\n• Tempo planejado: ${plano.tempo_planejado.toFixed(1)}h\n• Horas liberadas: ${horasLiberadas.toFixed(1)}h`;
      
      if (atividadesMovidas.length > 0) {
        mensagem += `\n\n🚀 Realocação Automática:\n✓ ${atividadesMovidas.length} atividade(s) antecipada(s) automaticamente:`;
        atividadesMovidas.forEach(ativ => {
          mensagem += `\n  • ${ativ.nome} (+${ativ.horas.toFixed(1)}h)`;
        });
        mensagem += '\n\n💡 Seu cronograma foi otimizado!';
      } else if (horasLiberadas > 0.1) {
        mensagem += '\n\nℹ️ Não havia atividades disponíveis para antecipar.';
      }
      
      alert(mensagem);
      
    } catch {
      alert('Erro ao finalizar atividade. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleOpenModal}
        disabled={isProcessing}
        size="sm"
        className="flex-1 h-6 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
        title="Finalizar e otimizar cronograma automaticamente"
      >
        <CheckCircle className="w-3 h-3 mr-1" />
        Finalizar
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">🎯 Finalizar Atividade</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-sm text-gray-600 mb-1">
                <strong>Atividade:</strong>
              </p>
              <p className="text-base font-medium text-gray-900">{displayName}</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="observacao">Observações finais (opcional)</Label>
              <Textarea
                id="observacao"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Adicione comentários sobre a conclusão da atividade..."
                className="h-24"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-700 text-sm font-semibold mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                O sistema irá automaticamente:
              </p>
              <ul className="text-blue-700 text-sm space-y-1.5 ml-4">
                <li>✓ Calcular o tempo total executado</li>
                <li>✓ Ajustar a alocação de horas na agenda</li>
                <li>✓ Liberar horas não utilizadas</li>
                <li>✓ <strong>Antecipar atividades do dia seguinte</strong></li>
                <li>✓ Marcar como concluída</li>
              </ul>
            </div>

            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 text-sm font-medium mb-2">
                🚀 Otimização Inteligente de Cronograma
              </p>
              <p className="text-green-700 text-sm">
                Se você concluir esta atividade antes do planejado, o sistema automaticamente <strong>puxará atividades do próximo dia</strong> para preencher as horas livres, otimizando sua produtividade!
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)} disabled={isProcessing}>
              Cancelar
            </Button>
            <Button onClick={handleFinalizarAtividade} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Finalizando e Otimizando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Finalizar e Otimizar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}