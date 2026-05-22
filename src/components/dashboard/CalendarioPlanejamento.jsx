// @ts-nocheck
import React, { useState, useMemo, useEffect, useContext, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, Filter, Trash2, CalendarDays, RefreshCw, Users, ListOrdered } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, parseISO, addWeeks, subWeeks, addDays, subDays, startOfDay, isValid, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from 'framer-motion';
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import PrevisaoEntregaModal from './PrevisaoEntregaModal';
import { PlanejamentoAtividade, Atividade, Documento, Empreendimento, Execucao, PlanejamentoDocumento } from '@/entities/all';
import { ChevronsUpDown } from 'lucide-react';
import { isActivityOverdue as isOverdueShared, distribuirHorasPorDias, getNextWorkingDay } from '../utils/DateCalculator';
import { retryWithBackoff } from '../utils/apiUtils';
import CalendarioActivityItem from './CalendarioActivityItem';
import DailyActivityGroup from './DailyActivityGroup';
const ActivityItem = (p) => <CalendarioActivityItem {...p} />;

// Função para converter string de data para Date local corretamente
const parseLocalDate = (dateString) => {
  if (!dateString) return null;

  // Se já for um objeto Date, retornar como está
  if (dateString instanceof Date) {
    return dateString;
  }

  // Se for string no formato YYYY-MM-DD, criar Date local
  if (typeof dateString === 'string') {
    // Verificar se é formato de data ISO (YYYY-MM-DD)
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day); // Cria data local
    }

    // Para outros formatos, usar parseISO mas ajustar para local
    try {
      const parsedDate = parseISO(dateString);
      if (!isNaN(parsedDate.getTime())) {
        // Ajustar para o fuso horário local para evitar mudança de dia
        // This adjustment aims to keep the "calendar day" consistent
        // even if the raw ISO string implies a time that would shift the day
        // when interpreted as UTC then converted to local.
        const localDate = new Date(parsedDate.getTime() + parsedDate.getTimezoneOffset() * 60000);
        return localDate;
      }
    } catch (e) {
      // Log removido para otimização de desempenho
    }
  }

  return null;
};

const normalizeActivityId = (value) => String(value ?? '');

// Format hours: always 1 decimal place
const formatHours = (h) => Number(h).toFixed(1);

// Função para verificar se uma atividade está atrasada (agora usando a compartilhada)
const isActivityOverdue = (plano) => {
  // Legacy executions (isLegacyExecution) are not overdue in the traditional sense
  // They are either 'concluido' or 'pausado' based on their execution status.
  if (plano.isLegacyExecution) return false;
  return isOverdueShared(plano);
};

// **CORRIGIDO**: Função para calcular o status real da atividade - PRIORIZAR CONCLUSÃO
const calculateActivityStatus = (plano, allPlanejamentos = []) => {
  // Se for uma atividade virtual (execução), seu status é direto
  if (plano.isLegacyExecution) {
    return plano.status;
  }

  // **PRIORIDADE 1**: Se está marcada explicitamente como concluída (com ou sem atraso)
  if (plano.status === 'concluido_com_atraso') {
    return 'concluido_com_atraso';
  }
  if (plano.status === 'concluido') {
    return 'concluido';
  }

  // **PRIORIDADE 2**: Se está marcada como atrasada manualmente OU automaticamente, retorna atrasado
  if (plano.status === 'atrasado' || isActivityOverdue(plano)) {
    return 'atrasado';
  }

  // **PRIORIDADE 3**: Verificar se foi replanejada para INICIAR mais tarde
  let foiReplanejadaParaIniciarMaisTarde = false;
  if (plano.inicio_ajustado && plano.inicio_planejado) {
    try {
      const ajustado = startOfDay(parseISO(plano.inicio_ajustado));
      const planejado = startOfDay(parseISO(plano.inicio_planejado));
      if (isValid(ajustado) && isValid(planejado) && isAfter(ajustado, planejado)) {
        foiReplanejadaParaIniciarMaisTarde = true;
      }
    } catch (e) {
    }
  }

  // Verificar se está em risco por causa de predecessora atrasada
  let predecessoraAtrasada = false;
  if (plano.predecessora_id) {
    const predecessora = allPlanejamentos.find(p => normalizeActivityId(p.id) === normalizeActivityId(plano.predecessora_id));
    if (predecessora && isActivityOverdue(predecessora)) {
      predecessoraAtrasada = true;
    }
  }

  if (foiReplanejadaParaIniciarMaisTarde || predecessoraAtrasada) {
    return 'impactado_por_atraso';
  }

  // Manter verificação de TÉRMINO para o status amarelo (replanejado_atrasado)
  let wasReplannedLaterTermino = false;
  if (plano.termino_ajustado && plano.termino_planejado) {
    try {
      const ajustado = startOfDay(parseISO(plano.termino_ajustado));
      const planejado = startOfDay(parseISO(plano.termino_planejado));
      if (isValid(ajustado) && isValid(planejado) && isAfter(ajustado, planejado)) {
        wasReplannedLaterTermino = true;
      }
    } catch (e) {
    }
  }

  if (wasReplannedLaterTermino) {
    return 'replanejado_atrasado';
  }

  // Caso contrário, manter o status original ou 'nao_iniciado'
  return plano.status || 'nao_iniciado';
};

// --- Sub-componente de Filtros ---
const CalendarFilters = ({
  users,
  disciplines,
  viewMode,
  onViewModeChange,
  filters,
  onFilterChange,
  onClearFilters,
  hasSelectedUser,
  isColaborador,
  isViewingAllUsers,
  isGestao,
  isApoio,
  podeVerOutros,
  usuariosPermitidos,
  currentUserEmail,
  viewType
}) => {
  // **MODIFICADO**: Filtrar e ordenar apenas usuários com nome cadastrado
  const usersOrdenados = useMemo(() => {
    return [...users]
      .filter(u => u.nome || u.full_name)
      .sort((a, b) => {
        const nomeA = a.nome || a.full_name || '';
        const nomeB = b.nome || b.full_name || '';
        return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
      });
  }, [users]);

  // **MODIFICADO**: Dropdown bloqueado para colaboradores, gestão e APOIO (sem permissão especial)
  const isDropdownDisabled = (isColaborador || isGestao || isApoio) && !podeVerOutros;


  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-gray-100 bg-gray-50/50">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-4">
        <Filter className="w-5 h-5 text-gray-500" />
        <Select value={filters.user} onValueChange={(value) => onFilterChange('user', value)} disabled={isDropdownDisabled}>
          <SelectTrigger className={`w-48 ${!hasSelectedUser && filters.user === '' ? 'border-red-300 bg-red-50' : 'bg-white'} ${isDropdownDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
            <SelectValue placeholder="⚠️ Selecione um usuário" />
          </SelectTrigger>
          <SelectContent>
            {usersOrdenados
              .filter(u => {
                // Se for colaborador, gestão ou apoio, filtra por permissões
                if (isColaborador || isGestao || isApoio) {
                  // Sempre mostra o próprio usuário
                  if (u.email === currentUserEmail) return true;
                  // Se tem usuários permitidos (array válido com conteúdo), mostra apenas esses
                  if (podeVerOutros && Array.isArray(usuariosPermitidos)) {
                    return usuariosPermitidos.includes(u.email);
                  }
                  // Sem permissões especiais, não mostra outros usuários
                  return false;
                }
                // Admin, líder, direção, coordenador veem todos
                return true;
              })
              .map(userItem => (
                <SelectItem key={userItem.id} value={userItem.email}>
                  {userItem.nome || userItem.full_name}
                </SelectItem>
              ))}
            {(!isColaborador && !isGestao && !isApoio) && usersOrdenados.length > 0 && (
              <SelectItem value="all">⚠️ Todos os Usuários (pode ser lento)</SelectItem>
            )}
          </SelectContent>
        </Select>
        {hasSelectedUser && (
          <>
            <Select value={filters.discipline} onValueChange={(value) => onFilterChange('discipline', value)}>
              <SelectTrigger className="w-48 bg-white">
                <SelectValue placeholder="Filtrar por disciplina" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Disciplinas</SelectItem>
                {disciplines.map(disc => (
                  <SelectItem key={disc.id} value={disc.nome}>{disc.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filters.discipline !== 'all' || filters.user !== '') && ((!isGestao && !isColaborador && !isApoio) || podeVerOutros) && (
              <Button variant="ghost" size="sm" onClick={onClearFilters} className="text-red-500 hover:text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar Filtros
              </Button>
            )}
          </>
        )}
      </div>

      {/* Controles de Visualização */}
      {hasSelectedUser && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'day' ? 'default' : 'outline'} size="sm" onClick={() => onViewModeChange('day')}>Dia</Button>
            <Button variant={viewMode === 'week' ? 'default' : 'outline'} size="sm" onClick={() => onViewModeChange('week')}>Semana</Button>
            <Button variant={viewMode === 'month' ? 'default' : 'outline'} size="sm" onClick={() => onViewModeChange('month')}>Mês</Button>
          </div>
          <div className="h-6 w-px bg-gray-300"></div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewType === 'sintetico' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onFilterChange('viewType', 'sintetico')}
              className={viewType === 'sintetico' ? 'bg-purple-600 hover:bg-purple-700' : ''}
            >
              Sintético
            </Button>
            <Button
              variant={viewType === 'analitico' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onFilterChange('viewType', 'analitico')}
              className={viewType === 'analitico' ? 'bg-purple-600 hover:bg-purple-700' : ''}
            >
              Analítico
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};


// --- Sub-componente para Container de Atividades (reutilizável) ---
const ActivityContainer = ({ activities, containerClass = "", disciplinas, dayKey, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType, modoOrdenacao, onClearDayOrder }) => {
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const activityGroups = useMemo(() => {
    const groups = {};

    activities.forEach(atividade => {
      let groupKey;
      let empreendimentoParaGrupo;

      if (atividade.isLegacyExecution) {
        groupKey = `virtual-${atividade.executor_principal || 'sem-executor'}`;
        empreendimentoParaGrupo = { nome: 'Atividades Rápidas' };
      } else {
        const empKey = atividade.empreendimento_id || 'sem-empreendimento';
        const userKey = atividade.executor_principal || 'sem-executor';

        if (empKey === 'sem-empreendimento') {
          groupKey = `geral-${userKey}`;
          empreendimentoParaGrupo = atividade.empreendimento || { nome: 'Atividades Gerais' };
        } else {
          groupKey = `${empKey}|${userKey}`;
          empreendimentoParaGrupo = atividade.empreendimento;
        }
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          empreendimento: empreendimentoParaGrupo,
          executor: { email: atividade.executor_principal },
          atividades: []
        };
      }
      groups[groupKey].atividades.push(atividade);
    });

    return groups;
  }, [activities, dayKey]);

  const toggleGroup = (groupKey) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  // **NOVO**: No modo analítico, mostrar atividades diretamente sem grupos
  if (viewType === 'analitico') {
    // Em modo de ordenação, mostrar todas as atividades; caso contrário, filtrar por horas
    const activitiesParaRenderizar = modoOrdenacao ? activities : activities.filter(atividade => {
      const horasAlocadas = Number(atividade.horas_por_dia?.[dayKey]) || 0;
      const horasExecutadas = Number(atividade.horas_executadas_por_dia?.[dayKey]) || 0;
      const tempoExecutado = Number(atividade.tempo_executado) || 0;

      if (atividade.isLegacyExecution) return tempoExecutado >= 0.05;

      if (atividade.isQuickActivity || atividade.is_quick_activity) {
        return horasExecutadas >= 0.05 || horasAlocadas >= 0.05 || atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso' || atividade.status === 'em_andamento';
      }

      return horasAlocadas >= 0.05 || horasExecutadas >= 0.05 ||
        ((atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso') && !atividade.atividade_id) ||
        atividade._isExtended || atividade._isPushed;
    });

    const temOrdemCustomizada = activities.length > 0 && (() => {
      try { const stored = JSON.parse(localStorage.getItem('calendar-activity-order') || '{}'); return !!stored[dayKey]; }
      catch { return false; }
    })();

    return (
      <div className={`space-y-1 ${containerClass}`}>
        {modoOrdenacao && temOrdemCustomizada && (
          <div className="flex justify-end mb-1">
            <button
              onClick={() => onClearDayOrder && onClearDayOrder(dayKey)}
              className="text-xs text-amber-600 hover:text-amber-800 underline"
            >
              Restaurar ordem padrão
            </button>
          </div>
        )}
        {activitiesParaRenderizar.map((atividade, index) => (
          <Draggable
            key={atividade.id}
            draggableId={`${atividade.id}`}
            index={index}
            isDragDisabled={
              modoOrdenacao
                ? (atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso')
                : (!canReprogram || atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso' || atividade.isLegacyExecution || normalizeActivityId(isReprogramando) === normalizeActivityId(atividade.id))
            }
          >
            {(provided, snapshot) => (
              <ActivityItem
                plano={atividade}
                dayKey={dayKey}
                onDelete={onActivityDelete}
                executorMap={executorMap}
                allPlanejamentos={allPlanejamentos}
                provided={provided}
                isDragging={snapshot.isDragging}
                isReprogramando={normalizeActivityId(isReprogramando) === normalizeActivityId(atividade.id)}
                isSelected={selectedActivities.has(normalizeActivityId(atividade.id))}
                onToggleSelect={onToggleSelect}
                hasSelections={hasSelections}
                orderIndex={index}
              />
            )}
          </Draggable>
        ))}
      </div>
    );
  }

  // **MODO SINTÉTICO**: Mostrar apenas os grupos (pastas)
  // Filtrar grupos vazios (onde todas as atividades têm 0.0h neste dia)
  const groupsComHoras = Object.entries(activityGroups).filter(([groupKey, groupData]) => {
    return groupData.atividades.some(atividade => {
      const horasAlocadas = Number(atividade.horas_por_dia?.[dayKey]) || 0;
      const horasExecutadas = Number(atividade.horas_executadas_por_dia?.[dayKey]) || 0;
      const tempoExecutado = Number(atividade.tempo_executado) || 0;

      if (atividade.isLegacyExecution) return tempoExecutado >= 0.05;
      if (atividade.isQuickActivity || atividade.is_quick_activity) {
        return horasExecutadas >= 0.05 || horasAlocadas >= 0.05 || atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso' || atividade.status === 'em_andamento';
      }
      return horasAlocadas >= 0.05 || horasExecutadas >= 0.05 || atividade._isExtended || atividade._isPushed;
    });
  });

  return (
    <div className={`space-y-1 ${containerClass}`}>
      {groupsComHoras.map(([groupKey, groupData]) => {
        // Filtrar atividades do grupo com 0.0h neste dia
        const atividadesComHoras = groupData.atividades.filter(atividade => {
          const horasAlocadas = Number(atividade.horas_por_dia?.[dayKey]) || 0;
          const horasExecutadas = Number(atividade.horas_executadas_por_dia?.[dayKey]) || 0;
          const tempoExecutado = Number(atividade.tempo_executado) || 0;

          if (atividade.isLegacyExecution) return tempoExecutado >= 0.05;
          if (atividade.isQuickActivity || atividade.is_quick_activity) {
            return horasExecutadas >= 0.05 || horasAlocadas >= 0.05 || atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso' || atividade.status === 'em_andamento';
          }
          return horasAlocadas >= 0.05 || horasExecutadas >= 0.05 || atividade._isExtended || atividade._isPushed;
        });

        // Não renderizar grupos vazios
        if (atividadesComHoras.length === 0) return null;

        // Atualizar groupData com atividades filtradas
        const groupDataFiltrado = { ...groupData, atividades: atividadesComHoras };

        // **CORRIGIDO**: Remover restrição de "Atividades Gerais", apenas bloquear "Atividades Rápidas" (Legado) e concluídas
        const canDragGroup = canReprogram &&
          groupDataFiltrado.empreendimento?.nome !== 'Atividades Rápidas' &&
          !groupDataFiltrado.atividades.some(a => a.status === 'concluido' || a.status === 'concluido_com_atraso' || a.isLegacyExecution);

        // Se pode arrastar o grupo, envolve em Draggable
        if (canDragGroup) {
          return (
            <Draggable
              key={`group-${groupKey}-${dayKey}`}
              draggableId={`group-${groupKey}-${dayKey}`}
              index={0}
              isDragDisabled={!canDragGroup}
            >
              {(provided, snapshot) => (
                <DailyActivityGroup
                  empreendimento={groupDataFiltrado.empreendimento}
                  executor={groupDataFiltrado.executor}
                  atividades={groupDataFiltrado.atividades}
                  isExpanded={expandedGroups.has(groupKey)}
                  onToggle={() => toggleGroup(groupKey)}
                  disciplinas={disciplinas}
                  dayKey={dayKey}
                  onActivityDelete={onActivityDelete}
                  onShowPrevisao={onShowPrevisao}
                  executorMap={executorMap}
                  allPlanejamentos={allPlanejamentos}
                  isReprogramando={isReprogramando}
                  canReprogram={canReprogram}
                  selectedActivities={selectedActivities}
                  onToggleSelect={onToggleSelect}
                  hasSelections={hasSelections}
                  groupKey={groupKey}
                  provided={provided}
                  isDragging={snapshot.isDragging}
                />
              )}
            </Draggable>
          );
        } else {
          return (
            <DailyActivityGroup
              key={`group-${groupKey}-${dayKey}-static`}
              empreendimento={groupDataFiltrado.empreendimento}
              executor={groupDataFiltrado.executor}
              atividades={groupDataFiltrado.atividades}
              isExpanded={expandedGroups.has(groupKey)}
              onToggle={() => toggleGroup(groupKey)}
              disciplinas={disciplinas}
              dayKey={dayKey}
              onActivityDelete={onActivityDelete}
              onShowPrevisao={onShowPrevisao}
              executorMap={executorMap}
              allPlanejamentos={allPlanejamentos}
              isReprogramando={isReprogramando}
              canReprogram={canReprogram}
              selectedActivities={selectedActivities}
              onToggleSelect={onToggleSelect}
              hasSelections={hasSelections}
              groupKey={groupKey}
            />
          );
        }
      })}
    </div>
  );
};

// --- Sub-componente para Container de Atividades (reutilizável) ---
const DayCell = ({ day, dayActivities, date, isToday, disciplinas, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType }) => {
  const dayKey = format(day, 'yyyy-MM-dd');

  // **NOVO**: Verificar se pode arrastar o dia inteiro
  const hasMovableActivities = dayActivities.some(a =>
    !a.isLegacyExecution && // Exclude old quick activities (exec-)
    a.status !== 'concluido' && a.status !== 'concluido_com_atraso'
  );

  const canDragDay = canReprogram && hasMovableActivities && dayActivities.length > 0;

  return (
    <Droppable droppableId={dayKey}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`h-40 p-2 border border-gray-100 flex flex-col group ${ // ADDED group class here
            isSameMonth(day, date) ? 'bg-white' : 'bg-gray-50'
            } ${isToday ? 'border-2 border-blue-500 bg-blue-50' : ''}
            ${snapshot.isDraggingOver ? 'bg-purple-100' : ''}
          `}
        >
          {/* **NOVO**: Header do dia com drag handle */}
          <div className="flex items-center justify-between mb-2 relative"> {/* Added relative for absolute positioning inside */}
            {/* **NOVO**: Drag handle do dia inteiro */}
            {canDragDay && (
              <Draggable
                draggableId={`day-${dayKey}`}
                index={0}
                isDragDisabled={!canDragDay}
              >
                {(dayProvided, daySnapshot) => (
                  <div
                    ref={dayProvided.innerRef}
                    {...dayProvided.draggableProps}
                    className={`absolute top-0 left-0 right-0 z-20 ${daySnapshot.isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                  >
                    <div
                      {...dayProvided.dragHandleProps}
                      className={`flex items-center justify-center gap-2 p-1 rounded-b cursor-move ${daySnapshot.isDragging
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-indigo-500 text-white hover:bg-indigo-600'
                        }`}
                      title="🖐️ Arrastar todas as atividades deste dia"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="9" cy="6" r="1.5" />
                        <circle cx="15" cy="6" r="1.5" />
                        <circle cx="9" cy="12" r="1.5" />
                        <circle cx="15" cy="12" r="1.5" />
                        <circle cx="9" cy="18" r="1.5" />
                        <circle cx="15" cy="18" r="1.5" />
                      </svg>
                      <span className="text-xs font-bold">
                        {dayActivities.length} ativ.
                      </span>
                    </div>

                    {/* Badge quando arrastando */}
                    {daySnapshot.isDragging && (
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 bg-indigo-600 text-white px-3 py-2 rounded-lg shadow-xl whitespace-nowrap z-30">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm font-bold">
                            Movendo {dayActivities.length} atividade{dayActivities.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs opacity-90 mt-1">
                          De {format(day, 'd MMM', { locale: ptBR })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Draggable>
            )}

            <span className={`font-semibold text-center flex-1 ${isSameMonth(day, date) ? 'text-gray-800' : 'text-gray-400'
              } ${isToday ? 'text-blue-700' : ''}`}>
              {format(day, 'd')}
            </span>
          </div>

          <div className="flex-grow overflow-y-auto pr-1">
            <ActivityContainer
              activities={dayActivities}
              disciplinas={disciplinas}
              dayKey={dayKey}
              onActivityDelete={onActivityDelete}
              onShowPrevisao={onShowPrevisao}
              executorMap={executorMap}
              allPlanejamentos={allPlanejamentos}
              isReprogramando={isReprogramando}
              canReprogram={canReprogram}
              selectedActivities={selectedActivities}
              onToggleSelect={onToggleSelect}
              hasSelections={hasSelections}
              viewType={viewType}
            />
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
};

// --- Sub-componente para a Visualização Mensal ---
const MonthView = ({ date, activitiesByDay, disciplinas, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType }) => {
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(date), { locale: ptBR });
    const end = endOfWeek(endOfMonth(date), { locale: ptBR });
    return eachDayOfInterval({ start, end });
  }, [date]);

  const weekHeaders = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="grid grid-cols-7 border-t border-gray-100">
      {weekHeaders.map(day => (
        <div key={day} className="text-center font-medium text-sm text-gray-500 py-3 border-b border-gray-100 bg-gray-50">{day}</div>
      ))}
      {monthDays.map(day => {
        const dayKey = format(day, 'yyyy-MM-dd');
        const dayActivities = activitiesByDay[dayKey] || [];
        const isToday = isSameDay(day, new Date());

        return (
          <DayCell
            key={dayKey}
            day={day}
            dayActivities={dayActivities}
            date={date}
            isToday={isToday}
            disciplinas={disciplinas}
            onActivityDelete={onActivityDelete}
            onShowPrevisao={onShowPrevisao}
            executorMap={executorMap}
            allPlanejamentos={allPlanejamentos}
            isReprogramando={isReprogramando}
            canReprogram={canReprogram}
            selectedActivities={selectedActivities}
            onToggleSelect={onToggleSelect}
            hasSelections={hasSelections}
            viewType={viewType}
          />
        );
      })}
    </div>
  );
};


// --- Sub-componente para a Visualização Semanal ---
const WeekView = ({ date, activitiesByDay, disciplinas, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType, modoOrdenacao, onClearDayOrder, onToggleModoOrdenacao }) => {
  // NOVO: Estado para controlar o dia expandido
  const [expandedDay, setExpandedDay] = useState(null);

  const weekDays = useMemo(() => {
    const start = startOfWeek(date, { locale: ptBR });
    const end = endOfWeek(date, { locale: ptBR });
    return eachDayOfInterval({ start, end });
  }, [date]);

  // NOVO: Função para alternar a expansão
  const toggleExpand = (dayKey) => {
    setExpandedDay(prev => (prev === dayKey ? null : dayKey));
  };

  return (
    <div className="flex border-t border-l border-gray-100 min-h-[60vh] bg-white">
      {weekDays.map(day => {
        const dayKey = format(day, 'yyyy-MM-dd');
        const dayActivities = activitiesByDay[dayKey] || [];
        const isToday = isSameDay(day, new Date());
        const isExpanded = expandedDay === dayKey;

        return (
          <Droppable droppableId={dayKey} key={dayKey}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`
                  flex flex-col border-r border-gray-100 transition-all duration-300 ease-in-out
                  ${isExpanded ? 'flex-[2] min-w-[350px] bg-white shadow-2xl z-10' : 'flex-1 w-[14.28%] max-w-[200px]'}
                  ${isToday && !isExpanded ? 'bg-blue-50' : ''}
                  ${snapshot.isDraggingOver ? 'bg-purple-100' : 'bg-white'}
                `}
              >
                {/* Header do Dia Clicável */}
                <div
                  className={`flex flex-col p-2 cursor-pointer hover:bg-gray-100 border-b border-gray-100 sticky top-0 z-10
                    ${isToday ? 'bg-blue-50' : 'bg-gray-50/50'}
                  `}
                  onClick={() => toggleExpand(dayKey)}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700 capitalize">{format(day, 'EEE, d', { locale: ptBR })}</h3>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onToggleModoOrdenacao && onToggleModoOrdenacao()}
                        className={`p-0.5 rounded transition-colors ${modoOrdenacao ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
                        title={modoOrdenacao ? "Sair da ordenação" : "Organizar ordem de execução"}
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <ChevronsUpDown className="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                  {dayActivities.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600 font-medium">
                      <span className="inline-block px-2 py-0.5 bg-white rounded border border-gray-200">
                        {(() => {
                          let total = 0;
                          dayActivities.forEach(ativ => {
                            const horasAlocadas = Number(ativ.horas_por_dia?.[dayKey]) || 0;
                            const horasExecutadas = Number(ativ.horas_executadas_por_dia?.[dayKey]) || 0;
                            const tempoExecutado = Number(ativ.tempo_executado) || 0;

                            let horasDia = 0;

                            if (ativ.isLegacyExecution) {
                              horasDia = tempoExecutado;
                            }
                            else if (ativ.isQuickActivity || ativ.is_quick_activity) {
                              horasDia = horasExecutadas > 0 ? horasExecutadas : horasAlocadas;
                            }
                            else {
                              // Prioridade 1: Se tem horas executadas neste dia
                              if (horasExecutadas > 0) {
                                horasDia = horasExecutadas;
                              }
                              // Prioridade 2: Se concluída mas horas_executadas_por_dia vazio, distribuir tempo_executado
                              else if (ativ.status === 'concluido' && tempoExecutado > 0 && Object.keys(ativ.horas_executadas_por_dia || {}).length === 0) {
                                const diasPlanejados = Object.keys(ativ.horas_por_dia || {});
                                if (diasPlanejados.length > 0 && diasPlanejados.includes(dayKey)) {
                                  horasDia = tempoExecutado / diasPlanejados.length;
                                } else {
                                  horasDia = 0; // Não contar se não está planejada para este dia
                                }
                              }
                              // Prioridade 3: Usar horas planejadas
                              else {
                                horasDia = horasAlocadas;
                              }
                            }

                            total += horasDia;
                          });
                          return `${formatHours(total)}h`;
                        })()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Container das Atividades */}
                <div className={`flex-grow overflow-y-auto p-2`}>
                  <ActivityContainer
                    activities={dayActivities}
                    disciplinas={disciplinas}
                    dayKey={dayKey}
                    onActivityDelete={onActivityDelete}
                    onShowPrevisao={onShowPrevisao}
                    executorMap={executorMap}
                    allPlanejamentos={allPlanejamentos}
                    isReprogramando={isReprogramando}
                    canReprogram={canReprogram}
                    selectedActivities={selectedActivities}
                    onToggleSelect={onToggleSelect}
                    hasSelections={hasSelections}
                    viewType={viewType}
                    modoOrdenacao={modoOrdenacao}
                    onClearDayOrder={onClearDayOrder}
                  />
                  {provided.placeholder}
                </div>
              </div>
            )}
          </Droppable>
        );
      })}
    </div>
  );
};


// --- Sub-componente para a Visualização Diária ---
const DayView = ({ date, activitiesByDay, disciplinas, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType, modoOrdenacao, onClearDayOrder, onToggleModoOrdenacao }) => {
  const dayKey = format(date, 'yyyy-MM-dd');
  const activities = activitiesByDay[dayKey] || [];

  return (
    <Droppable droppableId={dayKey}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`border-t border-gray-100 p-6 ${snapshot.isDraggingOver ? 'bg-purple-100' : ''}`}
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <h2 className="text-2xl font-bold capitalize">{format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</h2>
            <button
              onClick={() => onToggleModoOrdenacao && onToggleModoOrdenacao()}
              className={`p-1 rounded transition-colors ${modoOrdenacao ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
              title={modoOrdenacao ? "Sair da ordenação" : "Organizar ordem de execução"}
            >
              <ListOrdered className="w-5 h-5" />
            </button>
          </div>
          <div className="max-w-4xl mx-auto">
            {activities.length > 0 ? (
              <ActivityContainer
                activities={activities}
                containerClass="space-y-4"
                disciplinas={disciplinas}
                dayKey={dayKey}
                onActivityDelete={onActivityDelete}
                onShowPrevisao={onShowPrevisao}
                executorMap={executorMap}
                allPlanejamentos={allPlanejamentos}
                isReprogramando={isReprogramando}
                canReprogram={canReprogram}
                selectedActivities={selectedActivities}
                onToggleSelect={onToggleSelect}
                hasSelections={hasSelections}
                viewType={viewType}
                modoOrdenacao={modoOrdenacao}
                onClearDayOrder={onClearDayOrder}
              />
            ) : (
              <div className="text-center py-12 text-gray-500">
                <CalendarDays className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                Nenhuma atividade planejada para este dia.
              </div>
            )}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
};


// --- Componente Principal ---
export default function CalendarioPlanejamento({ usuarios, disciplinas, onRefresh, isDashboardRefreshing }) {
  const { user, userProfile, isColaborador, isGestao, hasPermission, triggerUpdate, perfilAtual, updateKey, completionKey, allUsers } = useContext(ActivityTimerContext);

  const [currentDate, setCurrentDate] = useState(() => startOfWeek(new Date(), { locale: ptBR }));
  const [viewMode, setViewMode] = useState('week');

  // **MODIFICADO**: Verificar se é apoio
  const isApoio = perfilAtual === 'apoio';

  // **MODIFICADO**: Verificar lista de usuários permitidos
  const usuariosPermitidos = userProfile?.usuarios_permitidos_visualizar || [];
  const podeVisualizarOutros = Array.isArray(usuariosPermitidos) && usuariosPermitidos.length > 0;


  // **MODIFICADO**: Se for gestão OU apoio (sem permissão especial), já inicia com o próprio email selecionado
  const [filters, setFilters] = useState({
    user: '', // Será definido no useEffect se for gestão ou apoio sem permissão
    discipline: 'all'
  });

  // Estados locais para dados do calendário e loading
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [enrichedData, setEnrichedData] = useState([]);

  const [showPrevisaoModal, setShowPrevisaoModal] = useState(false);
  const [planejamentosParaPrevisao, setPlanejamentosParaPrevisao] = useState([]);
  const [isReprogramando, setIsReprogramando] = useState(null);
  const [viewType, setViewType] = useState('analitico'); // 'sintetico' ou 'analitico'

  const hasSelectedUser = !!filters.user;
  const isViewingAllUsers = filters.user === 'all';

  // Auto-selecionar o próprio usuário no primeiro acesso
  useEffect(() => {
    if (user?.email && !filters.user) {
      setFilters(prev => ({ ...prev, user: user.email }));
    }
  }, [user?.email, filters.user]);

  // Preferir allUsers do contexto (carrega no startup) em vez da prop usuarios (carrega com delays)
  const effectiveUsuarios = (allUsers && allUsers.length > 0) ? allUsers : (usuarios || []);

  const executorMap = useMemo(() => {
    return effectiveUsuarios.reduce((acc, u) => {
      if (u.email) acc[u.email] = u;
      return acc;
    }, {});
  }, [effectiveUsuarios]);

  const [selectedActivities, setSelectedActivities] = useState(new Set());
  const [modoOrdenacao, setModoOrdenacao] = useState(false);
  const [activityOrder, setActivityOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('calendar-activity-order') || '{}'); }
    catch { return {}; }
  });

  const clearDayOrder = useCallback((dayKey) => {
    setActivityOrder(prev => {
      const updated = { ...prev };
      delete updated[dayKey];
      localStorage.setItem('calendar-activity-order', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const toggleModoOrdenacao = useCallback(() => {
    setModoOrdenacao(prev => {
      if (!prev && viewType !== 'analitico') setViewType('analitico');
      return !prev;
    });
  }, [viewType]);

  // Carrega e enriquece dados do calendário em uma única passagem com requisições paralelas
  const loadCalendarData = useCallback(async (userFilter) => {
    if (!userFilter) {
      setEnrichedData([]);
      return;
    }

    setIsCalendarLoading(true);
    try {
      const execFilter = userFilter !== 'all' ? { usuario: userFilter } : {};

      const fetchPlanos = async (Entity, tag) => {
        if (userFilter === 'all') return retryWithBackoff(() => Entity.list(), 3, 1500, tag);
        const [byPrincipal, allList] = await Promise.all([
          retryWithBackoff(() => Entity.filter({ executor_principal: userFilter }), 3, 1500, tag+'p').catch(() => []),
          retryWithBackoff(() => Entity.list(), 3, 1500, tag+'l').catch(() => []),
        ]);
        const m = new Map((byPrincipal||[]).map(p=>[p.id,p]));
        (allList||[]).filter(p=>Array.isArray(p.executores)&&p.executores.includes(userFilter)).forEach(p=>{if(!m.has(p.id))m.set(p.id,p);});
        return Array.from(m.values());
      };
      const [planosAtividade, planosDocumento, execs] = await Promise.all([
        fetchPlanos(PlanejamentoAtividade,'ca'),
        fetchPlanos(PlanejamentoDocumento,'cd'),
        retryWithBackoff(()=>Execucao.filter(execFilter),3,1500,'cal.exec'),
      ]);
      const planosAtividadeComTipo = (planosAtividade || []).map(p => ({ ...p, tipo_planejamento: 'atividade' }));
      const planosDocumentoComTipo = (planosDocumento || []).map(p => ({ ...p, tipo_planejamento: 'documento' }));
      const todosPlanejamentos = [...planosAtividadeComTipo, ...planosDocumentoComTipo];
      const empreendimentoIds = [...new Set(todosPlanejamentos.map(p => p.empreendimento_id).filter(Boolean))];
      const atividadeIds = [...new Set(todosPlanejamentos.map(p => p.atividade_id).filter(Boolean))];
      const documentoIdsArray = [...new Set(todosPlanejamentos.map(p => p.documento_id).filter(Boolean).map(String))];
      const [empreendimentosData, atividadesData, documentosData] = await Promise.all([
        empreendimentoIds.length > 0 ? retryWithBackoff(() => Empreendimento.filter({ id: { $in: empreendimentoIds } }), 3, 1000, 'enr.emp') : Promise.resolve([]),
        atividadeIds.length > 0 ? retryWithBackoff(() => Atividade.filter({ id: { $in: atividadeIds } }), 3, 1000, 'enr.ativ') : Promise.resolve([]),
        documentoIdsArray.length > 0 ? Promise.all(documentoIdsArray.map(docId => retryWithBackoff(() => Documento.get(docId), 3, 1000, `enr.doc`).catch(() => null))).then(results => results.filter(Boolean)) : Promise.resolve([]),
      ]);

      const empreendimentosMap = new Map((empreendimentosData || []).map(item => [String(item.id), item]));
      const atividadesMap = new Map((atividadesData || []).map(item => [String(item.id), item]));
      const documentosMap = new Map((documentosData || []).map(item => [String(item.id), item]));

      const horasExecutadasPorPlanejamento = {};
      (execs || []).forEach(exec => {
        if (!exec.planejamento_id || !exec.inicio) return;
        const diaExec = format(parseLocalDate(exec.inicio), 'yyyy-MM-dd');
        const tempoExec = Number(exec.tempo_total) || 0;
        if (!horasExecutadasPorPlanejamento[exec.planejamento_id]) horasExecutadasPorPlanejamento[exec.planejamento_id] = {};
        horasExecutadasPorPlanejamento[exec.planejamento_id][diaExec] = (horasExecutadasPorPlanejamento[exec.planejamento_id][diaExec] || 0) + tempoExec;
      });
      const atividadesVirtuais = (execs || []).filter(exec => !exec.planejamento_id).map(exec => {
        const diaExec = exec.inicio ? format(parseLocalDate(exec.inicio), 'yyyy-MM-dd') : null;
        return { id: `exec-${exec.id}`, isLegacyExecution: true, isQuickActivity: true, tipo_planejamento: 'atividade', descritivo: exec.descritivo || 'Execução Rápida', tempo_executado: Number(exec.tempo_total) || 0, executor_principal: exec.usuario, status: 'concluido', horas_executadas_por_dia: diaExec ? { [diaExec]: Number(exec.tempo_total) || 0 } : {}, empreendimento: null, atividade: null, documento: null, os: exec.os || null, observacao: exec.observacao || null };
      });
      const finalData = [
        ...todosPlanejamentos.map(plano => {
          const horasExec = horasExecutadasPorPlanejamento[plano.id] || {};
          const doc = documentosMap.get(String(plano.documento_id)) || null;
          let documentoEnriquecido = null;
          if (doc) {
            documentoEnriquecido = { ...doc };
            const numero = String(doc.numero || '').trim();
            const arquivo = String(doc.arquivo || doc.titulo || '').trim();
            const parts = []; if (numero) parts.push(numero); if (arquivo) parts.push(arquivo);
            documentoEnriquecido.numero_completo = parts.length ? parts.join(' - ') : (doc.titulo || doc.arquivo || null);
          }
          const storedHoras = (typeof plano.horas_executadas_por_dia === 'object' && plano.horas_executadas_por_dia) ? plano.horas_executadas_por_dia : {};
          const mergedHorasExec = Object.assign({}, storedHoras, horasExec);
          return { ...plano, empreendimento: empreendimentosMap.get(String(plano.empreendimento_id)) || null, atividade: atividadesMap.get(String(plano.atividade_id)) || null, documento: documentoEnriquecido, horas_executadas_por_dia: mergedHorasExec };
        }),
        ...atividadesVirtuais
      ];

      setEnrichedData(finalData);

    } catch (error) {
      // Log removido para otimização de desempenho
      setEnrichedData([]);
      alert("Erro ao carregar as atividades do calendário. Tente atualizar a página.");
    } finally {
      setIsCalendarLoading(false);
    }
  }, []);

  // Disparar carregamento imediato quando o filtro de usuário mudar
  useEffect(() => {
    if (filters.user) {
      loadCalendarData(filters.user);
    } else {
      setEnrichedData([]);
      setIsCalendarLoading(false);
    }
  }, [filters.user]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevUpdateKeyRef = useRef(updateKey);
  useEffect(() => {
    if (updateKey === prevUpdateKeyRef.current) return;
    prevUpdateKeyRef.current = updateKey;
    if (!filters.user) return;
    const timer = setTimeout(() => {
      loadCalendarData(filters.user);
    }, 3000);
    return () => clearTimeout(timer);
  }, [updateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevCompletionKeyRef = useRef(completionKey);
  useEffect(() => {
    if (completionKey === prevCompletionKeyRef.current) return;
    prevCompletionKeyRef.current = completionKey;
    if (!filters.user) return;
    loadCalendarData(filters.user);
  }, [completionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleActivityDelete = useCallback((update = null) => {
    if (update?.id) {
      setEnrichedData(prev => prev.map(item =>
        item.id === update.id ? { ...item, ...update } : item
      ));
    }
    if (hasSelectedUser) {
      loadCalendarData(filters.user);
    }
  }, [hasSelectedUser, filters.user, loadCalendarData]);

  // **NOVO**: Função para alternar seleção de atividade
  const toggleActivitySelection = useCallback((activityId) => {
    const normalizedActivityId = normalizeActivityId(activityId);
    setSelectedActivities(prev => {
      const newSet = new Set(prev);
      if (newSet.has(normalizedActivityId)) {
        newSet.delete(normalizedActivityId);
      } else {
        newSet.add(normalizedActivityId);
      }
      return newSet;
    });
  }, []);

  // **NOVO**: Função para limpar seleção
  const clearSelection = useCallback(() => {
    setSelectedActivities(new Set());
  }, []);

  // **NOVO**: Função para reprogramar atividade
  const handleReprogramarAtividade = useCallback(async (atividadeId, novaDataInicio, executorEmail) => {
    const normalizedActivityId = normalizeActivityId(atividadeId);
    setIsReprogramando(normalizedActivityId);
    try {
      const atividadeParaMover = (enrichedData || []).find(p => normalizeActivityId(p.id) === normalizedActivityId);
      if (!atividadeParaMover) throw new Error("Atividade não encontrada.");
      if (atividadeParaMover.isLegacyExecution) throw new Error("Execuções antigas não podem ser reprogramadas.");
      if (atividadeParaMover.status === 'concluido' || atividadeParaMover.status === 'concluido_com_atraso') throw new Error("Atividades concluídas não podem ser reprogramadas.");
      const entidadePlanejamento = atividadeParaMover.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
      const planejamentosDoExecutor = (await retryWithBackoff(() => entidadePlanejamento.filter({ executor_principal: executorEmail }), 3, 1000, 'reprogram')).filter(p => p.status !== 'concluido' && !p.isLegacyExecution);
      const cargaDiariaExistente = {};
      planejamentosDoExecutor.forEach(p => {
        if (normalizeActivityId(p.id) !== normalizedActivityId && p.horas_por_dia) {
          Object.entries(p.horas_por_dia).forEach(([data, horas]) => { cargaDiariaExistente[data] = (cargaDiariaExistente[data] || 0) + Number(horas || 0); });
        }
      });
      const { distribuicao, dataTermino } = distribuirHorasPorDias(parseLocalDate(novaDataInicio), atividadeParaMover.tempo_planejado, 8, cargaDiariaExistente);
      if (Object.keys(distribuicao).length === 0) throw new Error("Não foi possível alocar horas para a nova data.");
      const inicioPlanejado = Object.keys(distribuicao).sort()[0];
      const terminoPlanejado = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : inicioPlanejado;
      await retryWithBackoff(() => entidadePlanejamento.update(atividadeParaMover.id, { inicio_planejado: inicioPlanejado, termino_planejado: terminoPlanejado, horas_por_dia: distribuicao }), 3, 1500, 'reprogram');
      if (hasSelectedUser) loadCalendarData(filters.user);
      if (triggerUpdate) triggerUpdate();
    } catch (error) {
      alert(`Erro ao reprogramar: ${error.message}`);
      throw error;
    } finally {
      setIsReprogramando(null);
    }
  }, [enrichedData, triggerUpdate, hasSelectedUser, filters.user, loadCalendarData]);

  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) {
      if (!modoOrdenacao) return;
      const dayKey = source.droppableId;
      const dayActivities = activitiesByDay[dayKey] || [];
      const reorderedIds = dayActivities.map(a => String(a.id));
      const [movedId] = reorderedIds.splice(source.index, 1);
      reorderedIds.splice(destination.index, 0, movedId);
      const newOrder = { ...activityOrder, [dayKey]: reorderedIds };
      localStorage.setItem('calendar-activity-order', JSON.stringify(newOrder));
      setActivityOrder(newOrder);
      reorderedIds.forEach((id, idx) => {
        const plano = dayActivities.find(a => String(a.id) === id);
        if (!plano || plano.isLegacyExecution) return;
        const entity = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
        entity.update(id, { ordem: idx }).catch(() => {});
      });
      return;
    }
    if (modoOrdenacao) return;
    if (!hasPermission('admin')) { alert("Você não tem permissão para replanejar atividades."); return; }
    const isDayDrag = draggableId.startsWith('day-');
    if (isDayDrag) {
      const sourceDayKey = draggableId.replace('day-', '');
      const dayActivities = activitiesByDay[sourceDayKey] || [];
      const movableActivities = dayActivities.filter(a => !a.isLegacyExecution && a.status !== 'concluido' && a.status !== 'concluido_com_atraso');
      if (movableActivities.length === 0) { alert("Nenhuma atividade pode ser movida."); return; }
      if (!window.confirm(`Mover ${movableActivities.length} atividade(s) de ${format(parseISO(sourceDayKey), 'd MMM', { locale: ptBR })} para ${format(parseISO(destination.droppableId), 'd MMM', { locale: ptBR })}?`)) return;
      (async () => {
        let ok = 0, err = 0;
        for (let i = 0; i < movableActivities.length; i++) {
          try { await handleReprogramarAtividade(movableActivities[i].id, destination.droppableId, movableActivities[i].executor_principal); ok++; if (i < movableActivities.length - 1) await new Promise(r => setTimeout(r, 500)); } catch { err++; }
        }
        if (ok > 0) { alert(`✅ ${ok} atividade(s) reprogramadas!${err > 0 ? `\n⚠️ ${err} falharam` : ''}`); clearSelection(); } else alert('❌ Nenhuma atividade pôde ser movida.');
      })();
      return;
    }
    const isGroupDrag = draggableId.startsWith('group-');
    if (isGroupDrag) {
      const parts = draggableId.replace('group-', '').split('-');
      const sourceDayKey = parts.pop();
      const groupKey = parts.join('-');
      const allActivitiesInSourceDay = (activitiesByDay[source.droppableId] || []);
      let groupActivities = [];
      if (groupKey.startsWith('virtual-')) groupActivities = allActivitiesInSourceDay.filter(a => a.isLegacyExecution && a.executor_principal === groupKey.replace('virtual-', ''));
      else if (groupKey.startsWith('geral-')) groupActivities = allActivitiesInSourceDay.filter(a => !a.empreendimento_id && a.executor_principal === groupKey.replace('geral-', '') && !a.isLegacyExecution);
      else { const [empId, executorEmail] = groupKey.split('|'); groupActivities = allActivitiesInSourceDay.filter(a => a.empreendimento_id === empId && a.executor_principal === executorEmail && !a.isLegacyExecution); }
      if (groupActivities.some(a => a.isLegacyExecution || a.status === 'concluido' || a.status === 'concluido_com_atraso')) { alert("Algumas atividades do grupo não podem ser reprogramadas."); return; }
      (async () => {
        let ok = 0, err = 0;
        for (const a of groupActivities) { try { await handleReprogramarAtividade(a.id, destination.droppableId, a.executor_principal); ok++; await new Promise(r => setTimeout(r, 500)); } catch { err++; } }
        if (ok > 0) { alert(`✅ ${ok} atividade(s) reprogramadas!${err > 0 ? `\n⚠️ ${err} falharam` : ''}`); clearSelection(); } else alert('❌ Erro ao mover atividades do grupo.');
      })();
      return;
    }
    const activitiesToMove = selectedActivities.has(draggableId) && selectedActivities.size > 1 ? Array.from(selectedActivities) : [draggableId];
    if (activitiesToMove.some(id => { const a = (enrichedData || []).find(p => normalizeActivityId(p.id) === normalizeActivityId(id)); return !a || a.isLegacyExecution || a.status === 'concluido' || a.status === 'concluido_com_atraso'; })) { alert("Algumas atividades não podem ser reprogramadas."); return; }
    (async () => {
      let ok = 0, err = 0;
      for (const activityId of activitiesToMove) {
        const atividadeMovida = (enrichedData || []).find(p => normalizeActivityId(p.id) === normalizeActivityId(activityId));
        if (!atividadeMovida) continue;
        try { await handleReprogramarAtividade(activityId, destination.droppableId, atividadeMovida.executor_principal); ok++; await new Promise(r => setTimeout(r, 500)); } catch { err++; }
      }
      if (ok > 0) { alert(`✅ ${ok} atividade(s) reprogramadas!${err > 0 ? `\n⚠️ ${err} falharam` : ''}`); clearSelection(); } else alert('❌ Erro ao mover atividades.');
    })();
  };


  const filteredPlanejamentos = useMemo(() => {
    if (!hasSelectedUser) return [];
    const base = enrichedData || [];
    if (filters.discipline !== 'all') {
      return base.filter(item => {
        if (item.tipo_planejamento === 'documento' && item.atividade_id === null) {
          return !!(item.documento?.subdisciplinas && item.documento.subdisciplinas.includes(filters.discipline));
        }
        return item.atividade?.disciplina === filters.discipline;
      });
    }
    return base;
  }, [enrichedData, filters.discipline, hasSelectedUser]);

  const activityStatusMap = useMemo(() => {
    const statusMap = new Map();
    const planMap = new Map(filteredPlanejamentos.map(p => [normalizeActivityId(p.id), p]));
    filteredPlanejamentos.forEach(plano => {
      const id = normalizeActivityId(plano.id);
      if (plano.isLegacyExecution) { statusMap.set(id, plano.status); return; }
      if (plano.status === 'concluido_com_atraso') { statusMap.set(id, 'concluido_com_atraso'); return; }
      if (plano.status === 'concluido') { statusMap.set(id, 'concluido'); return; }
      if (plano.status === 'atrasado' || isActivityOverdue(plano)) { statusMap.set(id, 'atrasado'); return; }
      let replanejadoTarde = false;
      try { if (plano.inicio_ajustado && plano.inicio_planejado) { const a = startOfDay(parseISO(plano.inicio_ajustado)), p = startOfDay(parseISO(plano.inicio_planejado)); if (isValid(a) && isValid(p) && isAfter(a, p)) replanejadoTarde = true; } } catch (_) {}
      const pred = plano.predecessora_id ? planMap.get(normalizeActivityId(plano.predecessora_id)) : null;
      if (replanejadoTarde || (pred && isActivityOverdue(pred))) { statusMap.set(id, 'impactado_por_atraso'); return; }
      let terminoAtrasado = false;
      try { if (plano.termino_ajustado && plano.termino_planejado) { const a = startOfDay(parseISO(plano.termino_ajustado)), p = startOfDay(parseISO(plano.termino_planejado)); if (isValid(a) && isValid(p) && isAfter(a, p)) terminoAtrasado = true; } } catch (_) {}
      if (terminoAtrasado) { statusMap.set(id, 'replanejado_atrasado'); return; }
      statusMap.set(id, plano.status || 'nao_iniciado');
    });
    return statusMap;
  }, [filteredPlanejamentos]);

  const activitiesByDay = useMemo(() => {
    if (!hasSelectedUser) return {};

    const grouped = {};
    const processedPlanIds = new Set(); // Para não duplicar com execuções
    const hojeDate = startOfDay(new Date());
    const hojeKey = format(hojeDate, 'yyyy-MM-dd');
    // Atividades "recentes" = vencidas nos últimos 30 dias
    const recentCutoff = addDays(hojeDate, -30);

    // 1. Processar todos os planejamentos (atividades planejadas, planejamentos de documento e rápidas com planejamento)
    filteredPlanejamentos.forEach(plano => {
      processedPlanIds.add(plano.id);

      // Determinar em quais dias a atividade deve aparecer
      // Para atividades rápidas: aparecer APENAS nos dias em que foi EXECUTADA (horas_executadas_por_dia)
      // Para atividades concluídas: aparecer nos dias em que foi EXECUTADA (horas_executadas_por_dia)
      // Para atividades não concluídas: aparecer nos dias PLANEJADOS (horas_por_dia)

      const diasParaExibir = new Set();
      const isQuickActivity = plano.is_quick_activity || plano.isQuickActivity;
      let _isExtendedToToday = false; // marca se esta atividade está sendo estendida para hoje

      // Para atividades rápidas (concluídas ou não), usar APENAS horas_executadas_por_dia
      // Atividades rápidas não têm planejamento de dias - aparecem onde foram executadas
      if (isQuickActivity) {
        let hasSignificantExecutionHours = false;
        if (plano.horas_executadas_por_dia && typeof plano.horas_executadas_por_dia === 'object') {
          Object.keys(plano.horas_executadas_por_dia).forEach(dayKey => {
            const horasExec = Number(plano.horas_executadas_por_dia[dayKey]) || 0;
            // Só mostrar no dia se houver horas significativas (> 0.01h = 36 segundos)
            if (horasExec > 0.01) {
              diasParaExibir.add(dayKey);
              hasSignificantExecutionHours = true;
            }
          });
          // Fallback adicional: se a atividade está concluída/em andamento mas com 0h registradas,
          // usar o dia com a entrada mais recente do horas_executadas_por_dia
          if (!hasSignificantExecutionHours && (plano.status === 'concluido' || plano.status === 'concluido_com_atraso' || plano.status === 'em_andamento')) {
            const dias = Object.keys(plano.horas_executadas_por_dia);
            if (dias.length > 0) {
              // Usar o último dia registrado
              const ultimoDia = dias.sort().pop();
              const parsedUltimo = parseLocalDate(ultimoDia);
              diasParaExibir.add((parsedUltimo && isValid(parsedUltimo)) ? format(parsedUltimo, 'yyyy-MM-dd') : ultimoDia);
              hasSignificantExecutionHours = true;
            }
          }
        }
        // Fallback: se não há horas executadas significativas, usar o dia planejado
        // Garante que atividades muito breves (início e fim imediato) ainda apareçam no calendário
        if (!hasSignificantExecutionHours && plano.inicio_planejado) {
          const parsedInicio = parseLocalDate(plano.inicio_planejado);
          const diaFallback = (parsedInicio && isValid(parsedInicio))
            ? format(parsedInicio, 'yyyy-MM-dd')
            : plano.inicio_planejado;
          diasParaExibir.add(diaFallback);
        }
        // NÃO usar horas_por_dia para atividades rápidas - esse campo pode conter dados incorretos
      } else {
        // Para atividades normais (não rápidas)
        const realStatus = activityStatusMap.get(normalizeActivityId(plano.id)) || plano.status || 'nao_iniciado';
        const foiExecutada = plano.horas_executadas_por_dia &&
          typeof plano.horas_executadas_por_dia === 'object' &&
          Object.keys(plano.horas_executadas_por_dia).length > 0;

        if (realStatus === 'concluido') {
          // Atividade concluída - SEMPRE mostrar nos dias planejados para não "sumir" do calendário
          if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
            Object.keys(plano.horas_por_dia).forEach(dayKey => {
              const horas = Number(plano.horas_por_dia[dayKey]) || 0;
              if (horas >= 0.05) {
                diasParaExibir.add(dayKey);
              }
            });
          }

          // Adicionar também os dias executados (caso tenha execuções fora do planejado)
          if (foiExecutada) {
            Object.keys(plano.horas_executadas_por_dia).forEach(dayKey => {
              const horasExec = Number(plano.horas_executadas_por_dia[dayKey]) || 0;
              if (horasExec >= 0.05) {
                diasParaExibir.add(dayKey);
              }
            });
          }

          // Fallback: se nenhum dia foi adicionado (todas as horas são 0), usar termino_real || inicio_planejado
          // Cobre atividades rápidas concluídas em < 1 segundo que ficam com 0h
          if (diasParaExibir.size === 0) {
            const dataRef = plano.termino_real || plano.inicio_planejado;
            if (dataRef) {
              const parsed = parseLocalDate(dataRef);
              if (parsed && isValid(parsed)) {
                diasParaExibir.add(format(parsed, 'yyyy-MM-dd'));
              }
            }
          }
        } else {
          // Atividade não concluída: mostrar nos dias planejados e executados
          if (foiExecutada) {
            Object.keys(plano.horas_executadas_por_dia).forEach(dayKey => {
              const horasExec = Number(plano.horas_executadas_por_dia[dayKey]) || 0;
              if (horasExec >= 0.05) {
                diasParaExibir.add(dayKey);
              }
            });
          }

          // Adicionar dias planejados
          if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
            Object.keys(plano.horas_por_dia).forEach(dayKey => {
              const horas = Number(plano.horas_por_dia[dayKey]) || 0;
              if (horas >= 0.05) {
                diasParaExibir.add(dayKey);
              }
            });
          }

          // Extensão automática: atividade atrasada recente aparece no dia atual
          if (isActivityOverdue(plano)) {
            const terminoRef = plano.termino_ajustado || plano.termino_planejado;
            if (terminoRef) {
              const terminoDate = parseLocalDate(terminoRef);
              const jaEstaHoje = !!(plano.horas_por_dia?.[hojeKey] && Number(plano.horas_por_dia[hojeKey]) >= 0.05);
              if (terminoDate && isValid(terminoDate) && terminoDate >= recentCutoff && !jaEstaHoje) {
                diasParaExibir.add(hojeKey);
                _isExtendedToToday = true;
              }
            }
          }
        }
      }

      diasParaExibir.forEach(dayKey => {
        if (!grouped[dayKey]) grouped[dayKey] = [];
        if (!grouped[dayKey].some(item => item.id === plano.id)) {
          grouped[dayKey].push({ ...plano, isQuickActivity: !!plano.is_quick_activity, isLegacyExecution: false, _isExtended: _isExtendedToToday && dayKey === hojeKey });
        }
      });
    });


    for (const dayKey in grouped) {
      grouped[dayKey].sort((a, b) => {
        if (a.isLegacyExecution && !b.isLegacyExecution) return 1;
        if (!a.isLegacyExecution && b.isLegacyExecution) return -1;
        const statusA = activityStatusMap.get(normalizeActivityId(a.id)) || a.status || 'nao_iniciado';
        const statusB = activityStatusMap.get(normalizeActivityId(b.id)) || b.status || 'nao_iniciado';
        const isConcludedA = statusA === 'concluido' || statusA === 'concluido_com_atraso';
        const isConcludedB = statusB === 'concluido' || statusB === 'concluido_com_atraso';
        if (isConcludedA && !isConcludedB) return 1;
        if (!isConcludedA && isConcludedB) return -1;
        if (statusA === 'pausado' && statusB === 'em_andamento') return 1;
        if (statusA !== 'pausado' && statusB === 'em_andamento') return -1;
        const inicioA = a.inicio_planejado ? parseISO(a.inicio_planejado) : null;
        const inicioB = b.inicio_planejado ? parseISO(b.inicio_planejado) : null;
        if (inicioA && inicioB) { if (inicioA.getTime() < inicioB.getTime()) return -1; if (inicioA.getTime() > inicioB.getTime()) return 1; }
        else if (inicioA) return -1;
        else if (inicioB) return 1;
        const nameA = a.atividade?.atividade || a.documento?.numero_completo || a.descritivo || '';
        const nameB = b.atividade?.atividade || b.documento?.numero_completo || b.descritivo || '';
        return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
      });
    }

    for (const dayKey in grouped) {
      const activities = grouped[dayKey];
      const docIndices = [];
      const docs = [];
      activities.forEach((a, i) => {
        if (a.tipo_planejamento === 'documento') {
          docIndices.push(i);
          docs.push(a);
        }
      });
      if (docs.length < 2) continue;

      const docIdMap = new Map(docs.map(d => [normalizeActivityId(d.id), d]));
      const depths = new Map();

      const getDepth = (doc, seen = new Set()) => {
        const id = normalizeActivityId(doc.id);
        if (depths.has(id)) return depths.get(id);
        if (seen.has(id)) { depths.set(id, 0); return 0; } // ciclo → profundidade 0
        seen.add(id);
        if (!doc.predecessora_id) { depths.set(id, 0); return 0; }
        const pred = docIdMap.get(normalizeActivityId(doc.predecessora_id));
        if (!pred) { depths.set(id, 0); return 0; }
        const d = 1 + getDepth(pred, seen);
        depths.set(id, d);
        return d;
      };

      docs.forEach(d => getDepth(d));

      const sorted = [...docs].sort((a, b) =>
        (depths.get(normalizeActivityId(a.id)) || 0) - (depths.get(normalizeActivityId(b.id)) || 0)
      );

      // Reinsere os documentos ordenados nas mesmas posições que ocupavam
      docIndices.forEach((pos, i) => { activities[pos] = sorted[i]; });
    }

    // Aplicar ordem customizada por dia, se existir
    for (const dayKey in grouped) {
      const customOrder = activityOrder[dayKey];
      if (customOrder && customOrder.length > 0) {
        const orderMap = new Map(customOrder.map((id, i) => [String(id), i]));
        grouped[dayKey].sort((a, b) => {
          const idxA = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 9999;
          const idxB = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 9999;
          return idxA - idxB;
        });
      }
    }

    // Push: quando uma atividade se estende para hoje E o dia está com 8h cheias,
    // arrasta a última da fila de prioridade para o próximo dia útil.
    // Se o dia tiver capacidade livre, a atividade apenas se estende sem expulsar ninguém.
    if (grouped[hojeKey] && grouped[hojeKey].some(a => a._isExtended)) {
      const cargaHojeOriginal = grouped[hojeKey].reduce((sum, a) => {
        if (a._isExtended) return sum; // não contar as próprias extensões na carga
        return sum + (Number(a.horas_por_dia?.[hojeKey]) || 0);
      }, 0);

      const diaEstaLotado = cargaHojeOriginal >= 7.95; // margem de 0.05h (~3min)

      const elegiveisPush = diaEstaLotado ? grouped[hojeKey].filter(a => {
        const st = activityStatusMap.get(normalizeActivityId(a.id)) || a.status || 'nao_iniciado';
        return (
          !a._isExtended &&
          !a.isLegacyExecution &&
          !a.isQuickActivity &&
          st !== 'concluido' &&
          st !== 'concluido_com_atraso'
        );
      }) : [];

      if (elegiveisPush.length > 0) {
        const ultimaAtividade = elegiveisPush[elegiveisPush.length - 1];

        // Remover do dia atual
        grouped[hojeKey] = grouped[hojeKey].filter(a => a.id !== ultimaAtividade.id);

        // Adicionar ao próximo dia útil
        const proximoDiaUtil = getNextWorkingDay(hojeDate);
        const proximoDiaKey = format(proximoDiaUtil, 'yyyy-MM-dd');
        if (!grouped[proximoDiaKey]) grouped[proximoDiaKey] = [];
        if (!grouped[proximoDiaKey].some(a => a.id === ultimaAtividade.id)) {
          grouped[proximoDiaKey].push({ ...ultimaAtividade, _isPushed: true });

          // Re-ordenar o próximo dia para encaixar a atividade na posição certa
          grouped[proximoDiaKey].sort((a, b) => {
            const statusA = activityStatusMap.get(normalizeActivityId(a.id)) || a.status || 'nao_iniciado';
            const statusB = activityStatusMap.get(normalizeActivityId(b.id)) || b.status || 'nao_iniciado';
            const isConcA = statusA === 'concluido' || statusA === 'concluido_com_atraso';
            const isConcB = statusB === 'concluido' || statusB === 'concluido_com_atraso';
            if (isConcA && !isConcB) return 1;
            if (!isConcA && isConcB) return -1;
            const inicioA = a.inicio_planejado ? parseISO(a.inicio_planejado) : null;
            const inicioB = b.inicio_planejado ? parseISO(b.inicio_planejado) : null;
            if (inicioA && inicioB) return inicioA.getTime() - inicioB.getTime();
            return 0;
          });
        }
      }
    }

    return grouped;
  }, [filteredPlanejamentos, hasSelectedUser, activityOrder]);

  const cargaDiariaPorUsuario = useMemo(() => {
    if (!hasSelectedUser) return {};
    const carga = {};
    filteredPlanejamentos.forEach(plano => {
      if (!plano.executor_principal) return;
      if (!carga[plano.executor_principal]) carga[plano.executor_principal] = {};
      if (plano.horas_por_dia) Object.entries(plano.horas_por_dia).forEach(([d, h]) => { carga[plano.executor_principal][d] = (carga[plano.executor_principal][d] || 0) + Number(h); });
    });
    return carga;
  }, [filteredPlanejamentos, hasSelectedUser]);

  // Funções de navegação
  const handleDateChange = (direction) => {
    const fns = direction === 'next' ? { month: addMonths, week: addWeeks, day: addDays } : { month: subMonths, week: subWeeks, day: subDays };
    setCurrentDate(c => fns[viewMode](c, 1));
  };

  // Formatar o título do cabeçalho
  const horasDoDia = useMemo(() => {
    const dayKey = format(currentDate, 'yyyy-MM-dd');
    const dayActivities = activitiesByDay[dayKey] || [];

    let soma = 0;
    dayActivities.forEach((atividade) => {
      const horasAlocadasDia = Number(atividade.horas_por_dia?.[dayKey]) || 0;
      const horasExecutadasNoDia = Number(atividade.horas_executadas_por_dia?.[dayKey]) || 0;
      const tempoExecutado = Number(atividade.tempo_executado) || 0;

      let horasDia = 0;

      if (atividade.isLegacyExecution) {
        horasDia = tempoExecutado;
      }
      else if (atividade.isQuickActivity || atividade.is_quick_activity) {
        horasDia = horasExecutadasNoDia > 0 ? horasExecutadasNoDia : horasAlocadasDia;
      }
      else {
        // Prioridade 1: Se tem horas executadas neste dia
        if (horasExecutadasNoDia > 0) {
          horasDia = horasExecutadasNoDia;
        }
        // Prioridade 2: Se concluída mas horas_executadas_por_dia vazio, distribuir tempo_executado
        else if ((atividade.status === 'concluido' || atividade.status === 'concluido_com_atraso') && tempoExecutado > 0 && Object.keys(atividade.horas_executadas_por_dia || {}).length === 0) {
          const diasPlanejados = Object.keys(atividade.horas_por_dia || {});
          if (diasPlanejados.length > 0 && diasPlanejados.includes(dayKey)) {
            horasDia = tempoExecutado / diasPlanejados.length;
          } else {
            horasDia = 0; // Não contar se não está planejada para este dia
          }
        }
        // Prioridade 3: Usar horas planejadas
        else {
          horasDia = horasAlocadasDia;
        }
      }

      soma += horasDia;
    });

    return soma;
  }, [currentDate, activitiesByDay, viewMode]);

  const headerTitle = useMemo(() => {
    switch (viewMode) {
      case 'month': return format(currentDate, 'MMMM yyyy', { locale: ptBR });
      case 'week':
        const start = startOfWeek(currentDate, { locale: ptBR });
        const end = endOfWeek(currentDate, { locale: ptBR });
        return `${format(start, 'd MMM')} - ${format(end, 'd MMM, yyyy', { locale: ptBR })}`;
      case 'day': return format(currentDate, "d 'de' MMMM, yyyy", { locale: ptBR });
      default: return '';
    }
  }, [currentDate, viewMode]);

  const handleClearFilters = () => {
    // **MODIFICADO**: Gestão, Colaboradores e APOIO (sem permissão especial) não podem limpar o filtro de usuário
    const usuariosPermitidos = userProfile?.usuarios_permitidos_visualizar || [];
    const temPermissao = Array.isArray(usuariosPermitidos) && usuariosPermitidos.length > 0;

    if ((isGestao || isColaborador || isApoio) && !temPermissao) {
      const tipoUsuario = isGestao ? 'gestão' : isColaborador ? 'colaborador' : 'apoio';
      setFilters(prev => ({ ...prev, discipline: 'all' })); // Só limpa disciplina
      clearSelection();
      return;
    }

    setFilters({
      user: '', // Limpa seleção de usuário
      discipline: 'all'
    });
    clearSelection();
  };

  const handleShowPrevisao = (planos) => {
    setPlanejamentosParaPrevisao(planos);
    setShowPrevisaoModal(true);
  };

  const selectedUserName = isViewingAllUsers
    ? 'Todos os Usuários'
    : executorMap[filters.user]?.nome || filters.user;

  const totalLoading = isDashboardRefreshing || isCalendarLoading;
  const canReprogram = hasPermission('admin');
  const renderContent = () => {
    if (!hasSelectedUser) {
      return (
        <div className="p-12 text-center min-h-[400px] flex flex-col justify-center items-center">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">Selecione um Usuário</h3>
          <p className="text-gray-500 mb-6">
            Para começar, selecione um usuário no filtro acima para carregar o calendário.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
            <p className="text-blue-700 text-sm">
              💡 <strong>Dica:</strong> Para ver as atividades de todos, selecione "Todos os Usuários".
            </p>
          </div>
        </div>
      );
    }

    if (totalLoading) {
      return (
        <div className="flex justify-center items-center h-[400px]">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="ml-3 text-lg text-gray-600">Carregando atividades do calendário...</p>
        </div>
      );
    }

    const hasSelections = selectedActivities.size > 0;

    // **MODIFICADO**: Passa 'enrichedData' (que são todos) para as views em vez de 'planejamentos'
    if (viewMode === 'month') return <MonthView date={currentDate} activitiesByDay={activitiesByDay} disciplinas={disciplinas} onActivityDelete={handleActivityDelete} onShowPrevisao={handleShowPrevisao} executorMap={executorMap} allPlanejamentos={enrichedData} isReprogramando={isReprogramando} canReprogram={canReprogram} selectedActivities={selectedActivities} onToggleSelect={toggleActivitySelection} hasSelections={hasSelections} viewType={viewType} />;
    if (viewMode === 'week') return <WeekView date={currentDate} activitiesByDay={activitiesByDay} disciplinas={disciplinas} onActivityDelete={handleActivityDelete} onShowPrevisao={handleShowPrevisao} executorMap={executorMap} allPlanejamentos={enrichedData} isReprogramando={isReprogramando} canReprogram={canReprogram} selectedActivities={selectedActivities} onToggleSelect={toggleActivitySelection} hasSelections={hasSelections} viewType={viewType} modoOrdenacao={modoOrdenacao} onClearDayOrder={clearDayOrder} onToggleModoOrdenacao={toggleModoOrdenacao} />;
    if (viewMode === 'day') return <DayView date={currentDate} activitiesByDay={activitiesByDay} disciplinas={disciplinas} onActivityDelete={handleActivityDelete} onShowPrevisao={handleShowPrevisao} executorMap={executorMap} allPlanejamentos={enrichedData} isReprogramando={isReprogramando} canReprogram={canReprogram} selectedActivities={selectedActivities} onToggleSelect={toggleActivitySelection} hasSelections={hasSelections} viewType={viewType} modoOrdenacao={modoOrdenacao} onClearDayOrder={clearDayOrder} onToggleModoOrdenacao={toggleModoOrdenacao} />;
    return null;
  };

  // **MODIFICADO**: Refresh agora recarrega os dados do calendário se um usuário estiver selecionado
  const refreshAll = () => {
    if (onRefresh) {
      onRefresh();
    }
    if (hasSelectedUser) {
      loadCalendarData(filters.user);
    }
  };

  return (
    <>
      <Card className="bg-white shadow-lg border-0 h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl font-bold text-gray-900 capitalize">
              <Calendar className="w-6 h-6 text-blue-600" />
              {hasSelectedUser ? (
                <div className="flex items-center gap-3">
                  <span>{`Calendário - ${selectedUserName} (${filteredPlanejamentos.length})`}</span>
                  {viewMode === 'day' && (
                    <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
                      {formatHours(horasDoDia)}h planejadas
                    </span>
                  )}
                </div>
              ) : (
                'Calendário de Planejamento'
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Contador de selecionadas e botão de limpar */}
              {selectedActivities.size > 0 ? (
                <div className="flex items-center gap-2 mr-4 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <span className="text-sm font-medium text-indigo-700">
                    ✅ {selectedActivities.size} selecionada{selectedActivities.size > 1 ? 's' : ''} — arraste para replanejar
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    className="h-6 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100"
                  >
                    Limpar
                  </Button>
                </div>
              ) : hasSelectedUser && canReprogram && null}
              {hasSelectedUser && (
                <>
                  <Button variant="outline" onClick={refreshAll} disabled={totalLoading}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${totalLoading ? 'animate-spin' : ''}`} />
                    {totalLoading ? "Atualizando..." : "Atualizar"}
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Hoje</Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDateChange('prev')}><ChevronLeft className="w-5 h-5" /></Button>
                  <h3 className="text-xl font-semibold w-64 text-center capitalize">{headerTitle}</h3>
                  <Button variant="ghost" size="icon" onClick={() => handleDateChange('next')}><ChevronRight className="w-5 h-5" /></Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CalendarFilters
          users={effectiveUsuarios}
          disciplines={disciplinas}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filters={filters}
          podeVerOutros={podeVisualizarOutros}
          currentUserEmail={user?.email}
          usuariosPermitidos={usuariosPermitidos}
          viewType={viewType}
          onFilterChange={(key, value) => {
            // Tratar mudança de viewType separadamente
            if (key === 'viewType') {
              setViewType(value);
              return;
            }
            // **MODIFICADO**: Gestão, Colaboradores e APOIO (sem permissão especial) não podem mudar de usuário
            const usuariosPermitidosLocal = userProfile?.usuarios_permitidos_visualizar || [];
            const temPermissao = Array.isArray(usuariosPermitidosLocal) && usuariosPermitidosLocal.length > 0;


            if ((isGestao || isColaborador || isApoio) && !temPermissao && key === 'user') {
              const tipoUsuario = isGestao ? 'gestão' : isColaborador ? 'colaborador' : 'apoio';
              return;
            }
            setFilters(prev => ({ ...prev, [key]: value }));
          }}
          onClearFilters={handleClearFilters}
          hasSelectedUser={hasSelectedUser}
          isColaborador={isColaborador}
          isViewingAllUsers={isViewingAllUsers}
          isGestao={isGestao}
          isApoio={isApoio}
        />
        <DragDropContext onDragEnd={onDragEnd}>
          <CardContent className="p-0 flex-1">
            {renderContent()}
          </CardContent>
        </DragDropContext>
      </Card>

      {hasSelectedUser && (
        <PrevisaoEntregaModal
          isOpen={showPrevisaoModal}
          onClose={() => setShowPrevisaoModal(false)}
          planejamentos={planejamentosParaPrevisao.length > 0 ? planejamentosParaPrevisao : filteredPlanejamentos}
          execucoes={[]} // execucoes are not relevant for future delivery forecast
          cargaDiaria={planejamentosParaPrevisao.length > 0 && planejamentosParaPrevisao[0].executor_principal ? cargaDiariaPorUsuario[planejamentosParaPrevisao[0].executor_principal] || {} : {}}
        />
      )}
    </>
  );
}