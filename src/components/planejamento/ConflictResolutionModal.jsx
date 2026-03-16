import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Função para obter o nome da atividade
const getActivityName = (task) => {
  if (!task) return 'Atividade não identificada';
  
  // Priorizar descritivo (atividades manuais)
  if (task.descritivo && task.descritivo.trim()) {
    return task.descritivo;
  }
  
  // Tentar obter da atividade relacionada
  if (task.atividade?.atividade && !task.atividade.atividade.startsWith('Carregando')) {
    return task.atividade.atividade;
  }
  
  // Fallback para documento
  if (task.documento?.arquivo) {
    return `Doc: ${task.documento.arquivo}`;
  }
  
  // Usar ID do analítico se disponível
  if (task.analitico_id) {
    return `Atividade ID: ${task.analitico_id.slice(-6)}`;
  }
  
  // Último fallback
  return `Atividade ${task.id ? task.id.slice(-6) : 'N/A'}`;
};

export default function ConflictResolutionModal({ isOpen, onClose, onConfirm, conflictData }) {
  const [selectedTasksToBump, setSelectedTasksToBump] = useState([]);

  const { overdueTask, conflictingTasks = [], targetDate } = conflictData || {};

  const horasNecessarias = useMemo(() => {
    if (!overdueTask || !overdueTask.horas_por_dia || !targetDate) return 0;
    // Assume que a hora a ser movida é a do dia anterior ao alvo
    const dataAnterior = new Date(targetDate);
    dataAnterior.setDate(dataAnterior.getDate() - 1);
    const dataAnteriorFormatada = format(dataAnterior, 'yyyy-MM-dd');
    return overdueTask.horas_por_dia[dataAnteriorFormatada] || overdueTask.tempo_planejado || 0;
  }, [overdueTask, targetDate]);

  const horasLiberadas = useMemo(() => {
    if (!Array.isArray(conflictingTasks) || !targetDate) return 0;
    return conflictingTasks
      .filter(task => selectedTasksToBump.includes(task.id))
      .reduce((total, task) => {
        const dataFormatada = format(new Date(targetDate), 'yyyy-MM-dd');
        return total + (task.horas_por_dia?.[dataFormatada] || 0);
      }, 0);
  }, [selectedTasksToBump, conflictingTasks, targetDate]);

  const canConfirm = horasLiberadas >= horasNecessarias;

  const handleToggleTask = (taskId) => {
    setSelectedTasksToBump(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };
  
  const handleConfirmClick = () => {
    if (!Array.isArray(conflictingTasks)) return;
    const tasksToBump = conflictingTasks.filter(task => selectedTasksToBump.includes(task.id));
    onConfirm(overdueTask, tasksToBump, new Date(targetDate));
    onClose();
  };

  if (!isOpen || !conflictData || !overdueTask) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-yellow-500" />
            Conflito de Agendamento
          </DialogTitle>
          <DialogDescription>
            O dia {targetDate ? format(new Date(targetDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'} já está com a carga horária máxima. Para reagendar a atividade atrasada, você precisa adiar outra(s) atividade(s).
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="border p-3 rounded-lg bg-red-50 border-red-200">
            <h4 className="font-semibold text-red-800 mb-1">Atividade Atrasada a ser Reagendada:</h4>
            <div className="flex justify-between items-center">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-900 font-medium truncate" title={getActivityName(overdueTask)}>
                  {getActivityName(overdueTask)}
                </p>
                {overdueTask.empreendimento?.nome && (
                  <p className="text-xs text-red-700 mt-1">
                    {overdueTask.empreendimento.nome}
                  </p>
                )}
                {overdueTask.executor?.nome && (
                  <p className="text-xs text-red-700">
                    Executor: {overdueTask.executor.nome || overdueTask.executor.email}
                  </p>
                )}
              </div>
              <Badge variant="destructive">{horasNecessarias.toFixed(1)}h</Badge>
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-gray-800 mb-2">Selecione as atividades para adiar:</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
              {Array.isArray(conflictingTasks) && conflictingTasks.map(task => {
                if (!targetDate) return null;
                const dataFormatada = format(new Date(targetDate), 'yyyy-MM-dd');
                const horasNaqueleDia = task.horas_por_dia?.[dataFormatada] || 0;
                const taskName = getActivityName(task);
                
                return (
                  <div 
                    key={task.id} 
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleToggleTask(task.id)}
                  >
                    <Checkbox
                      id={`task-${task.id}`}
                      checked={selectedTasksToBump.includes(task.id)}
                      onCheckedChange={() => handleToggleTask(task.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <label htmlFor={`task-${task.id}`} className="block text-sm text-gray-900 font-medium cursor-pointer truncate" title={taskName}>
                        {taskName}
                      </label>
                      {task.empreendimento?.nome && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          {task.empreendimento.nome}
                        </p>
                      )}
                      {task.executor && (
                        <p className="text-xs text-gray-500">
                          {task.executor.nome || task.executor.email}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary">{horasNaqueleDia.toFixed(1)}h</Badge>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-center items-center gap-4 pt-4 border-t">
              <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{horasNecessarias.toFixed(1)}h</div>
                  <div className="text-xs text-gray-500">Horas Necessárias</div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400"/>
               <div className="text-center">
                  <div className={`text-lg font-bold ${canConfirm ? 'text-green-600' : 'text-gray-600'}`}>
                      {horasLiberadas.toFixed(1)}h
                  </div>
                  <div className="text-xs text-gray-500">Horas Liberadas</div>
              </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleConfirmClick} disabled={!canConfirm}>
            Confirmar Substituição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}