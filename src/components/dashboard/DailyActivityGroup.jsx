// @ts-nocheck
import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { ChevronRight, ChevronDown } from 'lucide-react';
import CalendarioActivityItem from './ActivityItemCalendar';

const normalizeActivityId = (value) => String(value ?? '');

export default function DailyActivityGroup({
  empreendimento,
  executor,
  atividades,
  isExpanded,
  onToggle,
  disciplinas,
  dayKey,
  onActivityDelete,
  onShowPrevisao,
  executorMap,
  allPlanejamentos,
  isReprogramando,
  canReprogram,
  selectedActivities,
  onToggleSelect,
  hasSelections,
  groupKey,
  provided,
  isDragging,
}) {
  const totalHorasAlocadas = atividades.reduce((sum, a) => sum + (Number(a.horas_por_dia?.[dayKey]) || 0), 0);
  const totalHorasExecutadas = atividades.reduce((sum, a) => sum + (Number(a.horas_executadas_por_dia?.[dayKey]) || 0), 0);

  const empNome = empreendimento?.nome || 'Atividades Gerais';
  const executorNome = executor?.email
    ? (executorMap?.[executor.email]?.nome || executor.email)
    : null;

  const allConcluded = atividades.every(a => a.status === 'concluido' || a.status === 'concluido_com_atraso');
  const anyAtrasado = atividades.some(a => a.status === 'atrasado' || a.status === 'atrasado_em_andamento' || a.status === 'atrasado_nao_iniciado' || a.status === 'replanejado_atrasado');
  const anyEmAndamento = atividades.some(a => a.status === 'em_andamento');

  const headerBg = allConcluded
    ? 'bg-green-50 border-green-200'
    : anyAtrasado
    ? 'bg-red-50 border-red-200'
    : anyEmAndamento
    ? 'bg-blue-50 border-blue-200'
    : 'bg-gray-50 border-gray-200';

  const innerRef = provided?.innerRef;
  const draggableProps = provided?.draggableProps || {};
  const dragHandleProps = provided?.dragHandleProps || {};

  return (
    <div
      ref={innerRef}
      {...draggableProps}
      className={`rounded border mb-1 overflow-hidden ${isDragging ? 'shadow-lg opacity-90' : ''}`}
    >
      {/* Group header */}
      <div
        className={`flex items-center justify-between px-2 py-1.5 cursor-pointer border-b ${headerBg}`}
        onClick={onToggle}
        {...dragHandleProps}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-700 truncate">{empNome}</p>
            {executorNome && (
              <p className="text-xs text-gray-500 truncate">{executorNome}</p>
            )}
          </div>
        </div>
        <div className="shrink-0 ml-2 text-right">
          <p className="text-xs font-mono font-semibold text-blue-700">
            {totalHorasAlocadas.toFixed(1)}/{totalHorasExecutadas.toFixed(1)}h
          </p>
          <p className="text-xs text-gray-400">{atividades.length} item{atividades.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Expanded activity list */}
      {isExpanded && (
        <div className="p-1.5 bg-white space-y-1">
          {atividades.map((atividade, index) => (
            <Draggable
              key={`${atividade.id}-${dayKey}`}
              draggableId={`${atividade.id}-${dayKey}`}
              index={index}
              isDragDisabled={
                !canReprogram ||
                atividade.status === 'concluido' ||
                atividade.status === 'concluido_com_atraso' ||
                atividade.isLegacyExecution ||
                normalizeActivityId(isReprogramando) === normalizeActivityId(atividade.id)
              }
            >
              {(itemProvided, itemSnapshot) => (
                <CalendarioActivityItem
                  plano={atividade}
                  dayKey={dayKey}
                  onDelete={onActivityDelete}
                  executorMap={executorMap}
                  allPlanejamentos={allPlanejamentos}
                  provided={itemProvided}
                  isDragging={itemSnapshot.isDragging}
                  isReprogramando={normalizeActivityId(isReprogramando) === normalizeActivityId(atividade.id)}
                  isSelected={selectedActivities?.has(normalizeActivityId(atividade.id))}
                  onToggleSelect={onToggleSelect}
                  hasSelections={hasSelections}
                />
              )}
            </Draggable>
          ))}
        </div>
      )}
    </div>
  );
}
