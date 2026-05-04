// @ts-nocheck
import React, { useState, useMemo, useEffect, useContext, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, Clock, User, Filter, Trash2, CalendarDays, Play, RefreshCw, LineChart, Users, Loader2, Edit2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, parseISO, addWeeks, subWeeks, addDays, subDays, startOfDay, endOfDay,
  isValid, isAfter
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from 'framer-motion';
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import PrevisaoEntregaModal from './PrevisaoEntregaModal';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { PlanejamentoAtividade, Atividade, Documento, Empreendimento, Execucao, PlanejamentoDocumento } from '@/entities/all';
import { ChevronsUpDown } from 'lucide-react';
import { isActivityOverdue as isOverdueShared, distribuirHorasPorDias } from '../utils/DateCalculator';
import { retryWithBackoff } from '../utils/apiUtils';
// Removed: import { useUserProfile } from '../hooks/useUserProfile'; // This hook is no longer used here

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

  // **PRIORIDADE 1**: Se está marcada explicitamente como concluída no banco
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


// --- Sub-componente de Itens de Atividade Individual ---
const ActivityItem = ({ plano, dayKey, onDelete, onUpdate, executorMap, allPlanejamentos, provided, isDragging, isReprogramando, isSelected, onToggleSelect, hasSelections }) => {
  const { activeExecution, startExecution, user, playlist, addToPlaylist, removeFromPlaylist, triggerUpdate, hasPermission } = useContext(ActivityTimerContext);

  const [isStarting, setIsStarting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTimeAdjustModal, setShowTimeAdjustModal] = useState(false);
  const [adjustedTime, setAdjustedTime] = useState('');
  const [showObservacoes, setShowObservacoes] = useState(false);
  const [showEditDescricaoModal, setShowEditDescricaoModal] = useState(false);
  const [editDescricao, setEditDescricao] = useState('');
  const [isEditLoading, setIsEditLoading] = useState(false);

  const realStatus = calculateActivityStatus(plano, allPlanejamentos);

  const getStatusColor = (status) => {
    switch (status) {
      case 'em_andamento': return '#3b82f6'; // Azul
      case 'pausado': return '#f59e0b'; // Amarelo
      case 'concluido': return '#10b981'; // Verde
      case 'atrasado':
      case 'replanejado_atrasado': return '#ef4444'; // Vermelho para atraso e replanejado com atraso
      case 'impactado_por_atraso': return '#8b5cf6'; // Roxo (violet-500)
      case 'nao_iniciado':
      default: return '#6b7280'; // Cinza
    }
  };

  // **MODIFICADO**: Melhorar exibição do nome para documentos
  const displayName = useMemo(() => {
    if (plano.tipo_planejamento === 'documento') {
      const etapa = plano.etapa || 'Sem Etapa';
      const numero = plano.documento?.numero;
      const arquivo = plano.documento?.arquivo;
      // Se documento enriquecido tem número ou arquivo, montar nome completo
      if (numero || arquivo) {
        return [numero, arquivo, etapa].filter(Boolean).join(' - ');
      }
      // Fallback: descritivo salvo ("001 - arquivo - etapa")
      // Usar apenas se não for simplesmente a etapa repetida
      const desc = plano.descritivo?.trim();
      if (desc && desc !== etapa) {
        return desc;
      }
      return etapa;
    }
    return plano.atividade?.atividade || plano.descritivo || 'Atividade não identificada';
  }, [plano]);

  const subdisciplina = plano.atividade?.subdisciplina;
  const tempoExecutado = Number(plano.tempo_executado) || 0;
  const tempoPlanejado = Number(plano.tempo_planejado) || 0;
  const planoExecutor = plano.executor_principal ? executorMap[plano.executor_principal] : null;

  // **CORRIGIDO**: Determinar horasDoDia baseado no tipo de atividade
  let horasDoDia = 0;
  const horasAlocadasDia = Number(plano.horas_por_dia?.[dayKey]) || 0;
  const horasExecutadasNoDia = Number(plano.horas_executadas_por_dia?.[dayKey]) || 0;

  // Se for atividade legada (execução antiga), usar tempo_executado
  if (plano.isLegacyExecution) {
    horasDoDia = tempoExecutado;
  }
  // Para atividades rápidas
  else if (plano.isQuickActivity || plano.is_quick_activity) {
    horasDoDia = horasExecutadasNoDia > 0 ? horasExecutadasNoDia : tempoExecutado;
  }
  // Para atividades normais
  else {
    // Prioridade 1: Se tem horas executadas neste dia
    if (horasExecutadasNoDia > 0) {
      horasDoDia = horasExecutadasNoDia;
    }
    // Prioridade 2: Se concluída mas horas_executadas_por_dia vazio, distribuir tempo_executado
    else if (plano.status === 'concluido' && tempoExecutado > 0 && Object.keys(plano.horas_executadas_por_dia || {}).length === 0) {
      // Distribuir tempo_executado entre os dias planejados
      const diasPlanejados = Object.keys(plano.horas_por_dia || {});
      if (diasPlanejados.length > 0 && diasPlanejados.includes(dayKey)) {
        horasDoDia = tempoExecutado / diasPlanejados.length;
      } else {
        horasDoDia = tempoExecutado; // Fallback: se não tem dias planejados, mostrar tudo neste dia
      }
    }
    // Prioridade 3: Usar horas planejadas
    else {
      horasDoDia = horasAlocadasDia;
    }
  }

  const isNaPlaylist = playlist.includes(plano.id);

  const getDocumentoDisplay = () => {
    // Se não há ID de documento, não há o que mostrar.
    if (!plano.documento_id) {
      return null;
    }
    // Se o ID existe, mas o objeto não foi carregado (enriquecimento falhou ou está em progresso)
    if (!plano.documento) {
      return 'Carregando...'; // Mensagem mais curta
    }

    // Tenta diferentes campos para encontrar um com conteúdo
    const campos = [
      plano.documento.numero_completo,
      plano.documento.arquivo,
      plano.documento.numero,
    ].filter(Boolean); // Remove valores vazios/null/undefined

    return campos.length > 0 ? campos[0] : 'Sem documento';
  };

  const documentoDisplay = getDocumentoDisplay();

  const handleDeleteActivity = async () => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir "${displayName}"? Esta ação é irreversível.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      if (plano.isLegacyExecution) { // Legacy virtual activities (Execucao)
        const execId = plano.id.split('-')[1]; // Extract original execution ID from virtual ID
        await retryWithBackoff(() => Execucao.delete(execId), 3, 1000, 'deleteExecution');
      } else if (plano.tipo_planejamento === 'documento') { // PlanejamentoDocumento
        await retryWithBackoff(() => PlanejamentoDocumento.delete(plano.id), 3, 1000, 'deleteDocumentPlanning');
      } else { // PlanejamentoAtividade
        await retryWithBackoff(() => PlanejamentoAtividade.delete(plano.id), 3, 1000, 'deleteActivity');
      }

      // Changed from onDelete to triggerUpdate for a more granular refresh
      if (onDelete) { // Chamada ao onDelete do componente pai para recarregar os dados do calendário
        onDelete();
      }
    } catch (error) {
      // Log removido para otimização de desempenho

      const is404 = error.message?.includes("404") || (error.response && error.response.status === 404);

      if (is404) {
        // Changed from onDelete to triggerUpdate
        if (onDelete) { // Chamada ao onDelete do componente pai para recarregar os dados do calendário
          onDelete();
        }
      } else {
        let errorMessage = "Erro ao excluir atividade do banco de dados. Tente novamente.";

        // Mensagens de erro mais específicas
        if (error.message?.includes("403") || (error.response && error.response.status === 403)) {
          errorMessage = "Você não tem permissão para excluir esta atividade.";
        } else if (error.message?.includes("500") || error.response?.status >= 500) {
          errorMessage = "Erro no servidor ao tentar excluir. Tente novamente mais tarde.";
        } else if (error.message?.includes("Network Error") || error.message?.includes("Failed to fetch")) {
          errorMessage = "Erro de conexão. Verifique sua internet e tente novamente.";
        } else if (error.response && error.response.data && error.response.data.message) {
          errorMessage = `Erro: ${error.response.data.message}`;
        }

        alert(errorMessage);
        // Log removido para otimização de desempenho
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartActivity = async () => {
    if (activeExecution) {
      alert("Uma atividade já está em progresso. Pare a atividade atual antes de iniciar uma nova.");
      return;
    }
    if (realStatus === 'concluido') {
      alert("Esta atividade já foi concluída e não pode ser iniciada novamente.");
      return;
    }
    // Prevent starting old legacy executions
    if (plano.isLegacyExecution) {
      alert("Esta é uma atividade executada sem planejamento (antiga) e não pode ser iniciada novamente.");
      return;
    }

    // Permitir iniciar atividades sem analítico
    const hasIdentifier = plano.analitico_id || plano.descritivo || plano.atividade?.atividade || (plano.tipo_planejamento === 'documento' && plano.documento?.numero_completo);
    if (!hasIdentifier) {
      alert("Erro: A atividade não pôde ser iniciada por falta de identificador.");
      return;
    }

    setIsStarting(true);
    try {
      const activityDescription = `${displayName}${plano.empreendimento?.nome ? ` - ${plano.empreendimento.nome}` : ''}`;

      await startExecution({
        planejamento_id: plano.id,
        descritivo: activityDescription,
        empreendimento_id: plano.empreendimento_id,
        // Passar o tipo de planejamento para o contexto, se necessário para rastreamento.
        // O ActivityTimerContext pode precisar ser ajustado para usar isso.
        tipo_planejamento: plano.tipo_planejamento
      });
    } catch (error) {
      // Log removido para otimização de desempenho
      alert("Não foi possível iniciar a atividade. Verifique o console para mais detalhes.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleAdjustTime = async () => {
    const timeValue = parseFloat(adjustedTime);
    if (isNaN(timeValue) || timeValue < 0) {
      alert("Por favor, insira um tempo válido.");
      return;
    }

    try {
      // If it's a legacy virtual activity (from Execucao), we can't update it.
      if (plano.isLegacyExecution) {
        alert("Não é possível ajustar o tempo para atividades rápidas antigas (não planejadas).");
        return;
      }

      // Determine the correct entity to update
      const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;

      // Buscar dias alocados existentes para distribuir o tempo atualizado
      const diasPlanejados = Object.keys(plano.horas_por_dia || {});
      const novasHorasPorDia = {};

      if (diasPlanejados.length > 0) {
        // Distribuir o novo tempo igualmente pelos dias já planejados
        const horasPorDia = timeValue / diasPlanejados.length;
        diasPlanejados.forEach(dia => {
          novasHorasPorDia[dia] = horasPorDia;
        });
      } else {
        // Se não há dias planejados, usar o dia atual
        const hoje = format(new Date(), 'yyyy-MM-dd');
        novasHorasPorDia[hoje] = timeValue;
      }

      await retryWithBackoff(
        () => entityToUpdate.update(plano.id, {
          tempo_executado: timeValue,
          horas_executadas_por_dia: novasHorasPorDia,
          status: 'concluido',
          termino_real: format(new Date(), 'yyyy-MM-dd')
        }),
        3, 1000, 'adjustTime'
      );

      setShowTimeAdjustModal(false);
      setAdjustedTime('');

      // Usa o trigger do contexto para garantir que tudo seja recarregado
      if (onDelete) { // Chamada ao onDelete do componente pai para recarregar os dados do calendário
        onDelete();
      }
    } catch (error) {
      // Log removido para otimização de desempenho
      alert("Erro ao ajustar tempo. Tente novamente.");
    }
  };

  // Condition to show start button: not concluded, no active execution, and NOT a legacy execution
  const shouldShowStartButton = () => realStatus !== 'concluido' && !activeExecution && !plano.isLegacyExecution;

  const shouldShowDeleteButton = () => {
    // Admins, Coordenador, Líder, Direção e Gestão podem excluir
    return hasPermission('admin') || hasPermission('coordenador') || hasPermission('lider') || hasPermission('direcao') || hasPermission('gestao');
  };
  // Adjust: Allow adjusting time for quick activities too,
  // but ONLY if it's a PlanejamentoAtividade (not an old 'exec-' Execucao)
  const shouldShowAdjustButton = () => {
    // Coordenador ou superior
    return hasPermission('coordenador') && !plano.isLegacyExecution && plano.status !== 'concluido';
  };

  const shouldShowEditDescricaoButton = () => {
    // Apenas Direção, Admin ou Líder - para atividades finalizadas ou não iniciadas
    return (hasPermission('admin') || hasPermission('lider') || hasPermission('direcao')) && (plano.status === 'concluido' || plano.status === 'nao_iniciado');
  };

  const handleOpenEditDescricao = () => {
    setEditDescricao(plano.descritivo || '');
    setShowEditDescricaoModal(true);
  };

  const handleSaveDescricao = async () => {
    if (!editDescricao.trim()) {
      alert('Descrição não pode estar vazia');
      return;
    }

    setIsEditLoading(true);
    try {
      // Se for execução legada, extrair o ID real e atualizar Execucao
      if (plano.isLegacyExecution) {
        const execId = plano.id.split('-')[1]; // Extrair ID original do ID virtual "exec-{id}"
        await Execucao.update(execId, {
          descritivo: editDescricao.trim()
        });
      } else {
        // Para atividades normais, usar a entidade correta
        const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
        await entityToUpdate.update(plano.id, {
          descritivo: editDescricao.trim()
        });
      }

      alert('✅ Descrição atualizada com sucesso!');
      setShowEditDescricaoModal(false);
      if (onDelete) {
        onDelete();
      }
    } catch (error) {
      // Log removido para otimização de desempenho
      alert('Erro ao atualizar descrição: ' + (error.message || 'Tente novamente.'));
    } finally {
      setIsEditLoading(false);
    }
  };

  // **NOVO**: Buscar observação do planejamento ou das execuções
  const observacao = useMemo(() => {
    // Se tem observação no planejamento, mostrar ela
    if (plano.observacao) {
      return plano.observacao;
    }

    // Se não tem e é atividade rápida com execuções, tentar buscar das execuções
    // Isso será carregado sob demanda quando expandir
    return null;
  }, [plano]);

  return (
    <>
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        style={{
          ...provided.draggableProps.style,
          backgroundColor: isSelected ? '#e0e7ff' : // Destaque azul para selecionadas
            realStatus === 'atrasado' || realStatus === 'replanejado_atrasado' ? '#fef2f2' :
              realStatus === 'impactado_por_atraso' ? '#f5f3ff' :
                realStatus === 'em_andamento' ? '#eff6ff' :
                  realStatus === 'concluido' ? '#f0fdf4' :
                    realStatus === 'pausado' ? '#fffbeb' : '#ffffff',
          ...(isDragging && { boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', transform: 'rotate(2deg)' })
        }}
        className={`p-2 rounded border mb-1 text-xs group hover:shadow-md transition-shadow duration-200 relative overflow-visible ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
          }`}
      >
        {isReprogramando && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded z-10">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
          </div>
        )}

        {/* **NOVO**: Checkbox de Seleção - Sempre visível quando há seleções */}
        {(hasSelections || isSelected) && plano.status !== 'concluido' && !plano.isLegacyExecution && (
          <div className="absolute left-1 top-1 z-20">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation(); // Prevent parent div click from being triggered
                onToggleSelect(plano.id);
              }}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              title="Selecionar para mover em grupo"
            />
          </div>
        )}

        {/* **MODIFICADO**: Drag Handle - Ajustar posição quando há checkbox */}
        <div
          {...provided.dragHandleProps}
          className={`absolute top-0 bottom-9 w-6 flex items-center justify-center cursor-move opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-gray-100 to-transparent ${hasSelections || isSelected ? 'left-6' : 'left-0'
            }`}
          title={isSelected && hasSelections ? "Arrastar atividades selecionadas" : "Arrastar para mover"}
        >
          <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>

        {/* **MODIFICADO**: Badge de quantidade quando selecionadas */}
        {isSelected && hasSelections && isDragging && (
          <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-lg z-30">
            {onUpdate?.selectedCount || ''}
          </div>
        )}

        {/* Top Row: Activity Name + Action Icons */}
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex-1 mr-2 overflow-hidden">
            {plano.empreendimento?.nome && (
              <p className="text-xs text-gray-500 mb-0.5 font-medium truncate" title={plano.empreendimento.nome}>
                📋 {plano.empreendimento.nome}
              </p>
            )}
            <p className="font-medium text-gray-800 leading-tight truncate" title={displayName}>
              {displayName}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {plano.isQuickActivity && (
                <Badge variant="outline" className="px-1 py-0.5 text-xs bg-gray-100 text-gray-600 border-gray-300">Execução Rápida</Badge>
              )}
              {plano.tipo_planejamento === 'documento' && (
                <Badge variant="outline" className="px-1 py-0.5 text-xs bg-blue-100 text-blue-600 border-blue-300">Planejamento Doc.</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center shrink-0 gap-2">
            {/* Espaço reservado - botões movidos para baixo */}
          </div>
        </div>

        {/* NOVO: Subdisciplinas Row (apenas para planejamentos de documento) */}
        {plano.tipo_planejamento === 'documento' && plano.documento?.subdisciplinas && plano.documento.subdisciplinas.length > 0 && (
          <div className="mb-1.5">
            <div className="flex flex-wrap gap-1">
              {plano.documento.subdisciplinas.map((sub, idx) => (
                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200">
                  {sub}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Meta/Info Row: Subdisciplina on left */}
        <div className="flex items-center gap-3 flex-wrap mb-1.5">
          {subdisciplina && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span className="text-blue-600 font-medium">{subdisciplina}</span>
            </div>
          )}
        </div>

        {/* CORRIGIDO: Documento Row agora só renderiza para atividades normais, não para planejamentos de documento */}
        {plano.tipo_planejamento !== 'documento' && documentoDisplay && (
          <p className="text-gray-600 font-mono mb-1.5 break-words" title={`Documento: ${documentoDisplay}`}>
            {documentoDisplay}
          </p>
        )}

        {/* OS Row */}
        {plano.os && (
          <p className="text-blue-600 font-semibold text-xs mb-1.5">
            OS: {plano.os}
          </p>
        )}

        {observacao && (
          <div className="mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
            <p className="text-gray-700 italic">
              <span className="font-semibold text-gray-600">💬 Obs:</span> {observacao}
            </p>
          </div>
        )}

        {/* Action Icons - Botão de status unificado + ações + horas */}
        <div className="flex gap-2 mt-2 items-center justify-between">
          <div className="flex gap-2 items-center">
            {/* Botão de status unificado (Iniciar/Pausar/Atrasado) */}
            <button
              onClick={handleStartActivity}
              disabled={!!activeExecution || isStarting || realStatus === 'concluido'}
              className={`p-1.5 rounded-md transition-colors ${activeExecution?.planejamento_id === plano.id
                ? 'bg-yellow-500 hover:bg-yellow-600 animate-pulse'
                : (realStatus === 'atrasado' || realStatus === 'replanejado_atrasado')
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed'
                }`}
              title={
                activeExecution?.planejamento_id === plano.id
                  ? "Atividade em andamento"
                  : (realStatus === 'atrasado' || realStatus === 'replanejado_atrasado')
                    ? "Atividade atrasada"
                    : isStarting ? "Iniciando..." : "Iniciar atividade"
              }
            >
              {activeExecution?.planejamento_id === plano.id ? (
                <Clock className="w-3.5 h-3.5 text-white" />
              ) : (realStatus === 'atrasado' || realStatus === 'replanejado_atrasado') ? (
                <span className="text-white text-xs font-bold">✕</span>
              ) : (
                <Play className="w-3.5 h-3.5 text-white" fill="white" />
              )}
            </button>

            <button
              onClick={handleDeleteActivity}
              disabled={isDeleting || !!activeExecution}
              className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={plano.isLegacyExecution ? "Excluir Execução Rápida Antiga" : plano.tipo_planejamento === 'documento' ? "Excluir Planejamento de Documento" : "Excluir Atividade"}
            >
              {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>

            <button
              onClick={handleOpenEditDescricao}
              className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors"
              title="Editar descrição da atividade"
            >
              <Edit2 className="w-3.5 h-3.5 text-gray-600" />
            </button>
          </div>

          {/* Time information - showing hours for this specific day */}
          <div className="flex items-center gap-2">
            {shouldShowAdjustButton() ? (
              <button
                onClick={() => {
                  setAdjustedTime(tempoExecutado.toString());
                  setShowTimeAdjustModal(true);
                }}
                className="font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                title="Clique para ajustar o tempo (Coordenador ou superior)"
              >
                <span className="font-semibold text-sm">
                  {formatHours(horasAlocadasDia)}/{formatHours(horasExecutadasNoDia)}h{(plano.horas_por_dia && Object.keys(plano.horas_por_dia).length > 1 && Object.keys(plano.horas_por_dia).sort().indexOf(dayKey) < Object.keys(plano.horas_por_dia).length - 1) ? ' ...' : ''}
                </span>
              </button>
            ) : (
              <div className="font-mono text-blue-600">
                <span className="font-semibold text-sm" title={horasAlocadasDia > 0 && Object.keys(plano.horas_por_dia || {}).length > 1 ? "Planejado / Executado (continua em outros dias)" : "Planejado / Executado"}>
                  {formatHours(horasAlocadasDia)}/{formatHours(horasExecutadasNoDia)}h{(plano.horas_por_dia && Object.keys(plano.horas_por_dia).length > 1 && Object.keys(plano.horas_por_dia).sort().indexOf(dayKey) < Object.keys(plano.horas_por_dia).length - 1) ? ' ...' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal para ajustar tempo */}
      <Dialog open={showTimeAdjustModal} onOpenChange={setShowTimeAdjustModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Tempo Executado</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2"><strong>Atividade:</strong> {displayName}</p>
              <p className="text-sm text-gray-600 mb-4">Tempo atual: {tempoExecutado.toFixed(1)}h executadas</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjustedTime">Novo Tempo Executado (horas)</Label>
              <Input
                id="adjustedTime"
                type="number"
                step="0.1"
                min="0"
                value={adjustedTime}
                onChange={(e) => setAdjustedTime(e.target.value)}
                placeholder="Ex: 2.5"
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-700 text-sm font-medium">ℹ️ A atividade será automaticamente marcada como <strong>concluída</strong> após o ajuste.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTimeAdjustModal(false)}>Cancelar</Button>
            <Button onClick={handleAdjustTime} className="bg-blue-600 hover:bg-blue-700">Ajustar e Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para editar descrição */}
      <Dialog open={showEditDescricaoModal} onOpenChange={setShowEditDescricaoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Descrição da Atividade</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2"><strong>Atividade:</strong> {displayName}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editDescricao">Descrição</Label>
              <Textarea
                id="editDescricao"
                value={editDescricao}
                onChange={(e) => setEditDescricao(e.target.value)}
                placeholder="Digite a descrição da atividade"
                className="min-h-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDescricaoModal(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveDescricao}
              disabled={isEditLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isEditLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// --- Sub-componente de Grupo de Atividades Diárias ---
const DailyActivityGroup = ({ empreendimento, executor, atividades, isExpanded, onToggle, disciplinas, dayKey, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, groupKey, provided, isDragging }) => {
  const totalHoras = useMemo(() => {
    if (!dayKey) {
      return 0;
    }

    let soma = 0;
    atividades.forEach((atividade) => {
      const horasAlocadasDia = Number(atividade.horas_por_dia?.[dayKey]) || 0;
      const horasExecutadasNoDia = Number(atividade.horas_executadas_por_dia?.[dayKey]) || 0;
      const tempoExecutado = Number(atividade.tempo_executado) || 0;

      let horasDoDia = 0;

      if (atividade.isLegacyExecution) {
        horasDoDia = tempoExecutado;
      }
      else if (atividade.isQuickActivity || atividade.is_quick_activity) {
        horasDoDia = horasExecutadasNoDia > 0 ? horasExecutadasNoDia : horasAlocadasDia;
      }
      else {
        // Prioridade 1: Se tem horas executadas neste dia
        if (horasExecutadasNoDia > 0) {
          horasDoDia = horasExecutadasNoDia;
        }
        // Prioridade 2: Se concluída mas horas_executadas_por_dia vazio, distribuir tempo_executado
        else if (atividade.status === 'concluido' && tempoExecutado > 0 && Object.keys(atividade.horas_executadas_por_dia || {}).length === 0) {
          const diasPlanejados = Object.keys(atividade.horas_por_dia || {});
          if (diasPlanejados.length > 0 && diasPlanejados.includes(dayKey)) {
            horasDoDia = tempoExecutado / diasPlanejados.length;
          } else {
            horasDoDia = tempoExecutado;
          }
        }
        // Prioridade 3: Usar horas planejadas
        else {
          horasDoDia = horasAlocadasDia;
        }
      }

      soma += horasDoDia;
    });

    return soma;
  }, [atividades, dayKey]);

  const statusCounts = atividades.reduce((acc, atividade) => {
    const realStatus = calculateActivityStatus(atividade, allPlanejamentos);
    acc[realStatus] = (acc[realStatus] || 0) + 1;
    return acc;
  }, {});

  const disciplineColors = useMemo(() => {
    const disciplineMap = (disciplinas || []).reduce((acc, d) => {
      acc[d.nome] = d.cor;
      return acc;
    }, {});

    const uniqueDisciplines = [...new Set(atividades.map(a => a.atividade?.disciplina).filter(Boolean))];

    return uniqueDisciplines.map(dName => ({
      name: dName,
      color: disciplineMap[dName] || '#A1A1AA'
    }));
  }, [atividades, disciplinas]);

  const getGroupStatus = () => {
    if (statusCounts['atrasado'] > 0 || statusCounts['replanejado_atrasado'] > 0) return 'atrasado';
    if (statusCounts['impactado_por_atraso'] > 0) return 'impactado_por_atraso';
    if (statusCounts['em_andamento'] > 0) return 'em_andamento';
    if (atividades.length > 0 && statusCounts['concluido'] === atividades.length) return 'concluido';
    if (statusCounts['pausado'] > 0) return 'pausado';
    return 'nao_iniciado';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'em_andamento': return '#3b82f6';
      case 'pausado': return '#f59e0b';
      case 'concluido': return '#10b981';
      case 'atrasado': return '#ef4444';
      case 'impactado_por_atraso': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const groupStatus = getGroupStatus();
  const statusColor = getStatusColor(groupStatus);

  const empreendimentoNome = empreendimento?.nome || empreendimento?.nome_fantasia || 'Sem Empreendimento';
  const planoExecutor = executor?.email ? executorMap[executor.email] : null;
  const executorNome = planoExecutor?.nome || planoExecutor?.email || 'Sem Executor';

  const canDragGroup = canReprogram &&
    empreendimentoNome !== 'Atividades Rápidas' &&
    !atividades.some(a => a.status === 'concluido' || a.isLegacyExecution);

  return (
    <div
      className="mb-1"
      ref={provided?.innerRef}
      {...(provided?.draggableProps || {})}
    >
      <div
        onClick={onToggle}
        style={{
          borderLeft: `6px solid ${statusColor}`,
          backgroundColor: isDragging ? '#e0e7ff' :
            groupStatus === 'atrasado' ? '#fff1f2' :
              groupStatus === 'impactado_por_atraso' ? '#f5f3ff' :
                groupStatus === 'em_andamento' ? '#eff6ff' :
                  groupStatus === 'concluido' ? '#f0fdf4' :
                    groupStatus === 'pausado' ? '#fefce8' : '#f8fafc',
          cursor: 'pointer',
          ...(isDragging && {
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            transform: 'rotate(1deg) scale(1.02)',
            transition: 'all 0.2s ease'
          })
        }}
        className={`p-2 rounded-lg hover:shadow-md transition-shadow duration-200 border ${isDragging ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
          }`}
      >
        <div className="flex items-center justify-between gap-2">
          {canDragGroup && (
            <div
              {...(provided?.dragHandleProps || {})}
              onClick={(e) => e.stopPropagation()}
              className="cursor-move p-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors flex-shrink-0 border border-gray-300"
              title="🖐️ Arrastar todo o grupo"
              style={{ minWidth: '20px', minHeight: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg className="w-3 h-3 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              {disciplineColors.map(d => (
                <div
                  key={d.name}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: d.color }}
                  title={d.name}
                ></div>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="w-5 h-5 ml-auto text-purple-500 hover:bg-purple-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowPrevisao(atividades);
                }}
                title="Ver Previsão de Entrega"
              >
                <LineChart className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="font-bold text-xs truncate text-gray-800" title={empreendimentoNome}>
              {empreendimentoNome}
            </p>
            {empreendimentoNome !== 'Atividades Rápidas' && (
              <div className="flex items-center gap-1.5 mt-1">
                <User className="w-3 h-3 flex-shrink-0" />
                <p className="text-xs font-medium truncate" title={executorNome}>{executorNome}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div
                className="px-1.5 py-0.5 rounded text-xs font-bold text-white"
                style={{ backgroundColor: statusColor }}
              >
                {totalHoras > 0 ? `${formatHours(totalHoras)}h` : '0h'}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{atividades.length} ativ.</p>
            </div>
            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </div>
        </div>

        {isDragging && (
          <div className="mt-2 flex items-center justify-center gap-2 bg-indigo-100 border-2 border-indigo-300 rounded p-2">
            <div className="bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shadow-lg">
              {atividades.length}
            </div>
            <span className="text-sm font-bold text-indigo-800">
              Movendo {atividades.length} atividade{atividades.length > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && !isDragging && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="ml-2 mt-1 space-y-1"
          >
            {atividades.map((atividade, index) => (
              <Draggable
                key={atividade.id}
                draggableId={`${atividade.id}`}
                index={index}
                isDragDisabled={!canReprogram || atividade.status === 'concluido' || atividade.isLegacyExecution || normalizeActivityId(isReprogramando) === normalizeActivityId(atividade.id)}
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
                  />
                )}
              </Draggable>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Sub-componente para Container de Atividades (reutilizável) ---
const ActivityContainer = ({ activities, containerClass = "", disciplinas, dayKey, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType }) => {
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
    // Filtrar atividades com 0.0h neste dia específico
    const activitiesComHoras = activities.filter(atividade => {
      const horasAlocadas = Number(atividade.horas_por_dia?.[dayKey]) || 0;
      const horasExecutadas = Number(atividade.horas_executadas_por_dia?.[dayKey]) || 0;
      const tempoExecutado = Number(atividade.tempo_executado) || 0;

      // Para legado, considerar o tempo executado total
      if (atividade.isLegacyExecution) return tempoExecutado >= 0.05;

      // Para atividades rápidas, verificar execução OU alocação OU se está concluída (mesmo com 0h)
      if (atividade.isQuickActivity || atividade.is_quick_activity) {
        return horasExecutadas >= 0.05 || horasAlocadas >= 0.05 || atividade.status === 'concluido' || atividade.status === 'em_andamento';
      }

      // Para atividades normais, verificar se tem horas significativas
      return horasAlocadas >= 0.05 || horasExecutadas >= 0.05;
    });

    return (
      <div className={`space-y-1 ${containerClass}`}>
        {activitiesComHoras.map((atividade, index) => (
          <Draggable
            key={atividade.id}
            draggableId={`${atividade.id}`}
            index={index}
            isDragDisabled={!canReprogram || atividade.status === 'concluido' || atividade.isLegacyExecution || normalizeActivityId(isReprogramando) === normalizeActivityId(atividade.id)}
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
        return horasExecutadas >= 0.05 || horasAlocadas >= 0.05 || atividade.status === 'concluido' || atividade.status === 'em_andamento';
      }
      return horasAlocadas >= 0.05 || horasExecutadas >= 0.05;
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
            return horasExecutadas >= 0.05 || horasAlocadas >= 0.05 || atividade.status === 'concluido' || atividade.status === 'em_andamento';
          }
          return horasAlocadas >= 0.05 || horasExecutadas >= 0.05;
        });

        // Não renderizar grupos vazios
        if (atividadesComHoras.length === 0) return null;

        // Atualizar groupData com atividades filtradas
        const groupDataFiltrado = { ...groupData, atividades: atividadesComHoras };

        // **CORRIGIDO**: Remover restrição de "Atividades Gerais", apenas bloquear "Atividades Rápidas" (Legado) e concluídas
        const canDragGroup = canReprogram &&
          groupDataFiltrado.empreendimento?.nome !== 'Atividades Rápidas' &&
          !groupDataFiltrado.atividades.some(a => a.status === 'concluido' || a.isLegacyExecution);

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
    a.status !== 'concluido'
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
const WeekView = ({ date, activitiesByDay, disciplinas, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType }) => {
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
                    <ChevronsUpDown className="w-4 h-4 text-gray-400" />
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
const DayView = ({ date, activitiesByDay, disciplinas, onActivityDelete, onShowPrevisao, executorMap, allPlanejamentos, isReprogramando, canReprogram, selectedActivities, onToggleSelect, hasSelections, viewType }) => {
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
          <h2 className="text-2xl font-bold text-center mb-6">{format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</h2>
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
  const { user, userProfile, isColaborador, isGestao, hasPermission, triggerUpdate, perfilAtual, updateKey, allUsers } = useContext(ActivityTimerContext);

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

  // **NOVO**: Estado para seleção múltipla
  const [selectedActivities, setSelectedActivities] = useState(new Set());

  // Carrega e enriquece dados do calendário em uma única passagem com requisições paralelas
  const loadCalendarData = useCallback(async (userFilter) => {
    if (!userFilter) {
      setEnrichedData([]);
      return;
    }

    setIsCalendarLoading(true);
    try {
      const execFilter = userFilter !== 'all' ? { usuario: userFilter } : {};

      // Etapa 1: todas as requisições iniciais em paralelo
      const [planosAtividade, planosDocumento, execs] = await Promise.all([
        userFilter !== 'all'
          ? retryWithBackoff(() => PlanejamentoAtividade.filter({ executor_principal: userFilter }), 3, 1500, 'calendar.loadPlansAtividade.principal')
          : retryWithBackoff(() => PlanejamentoAtividade.list(), 3, 1500, 'calendar.loadPlansAtividade'),
        userFilter !== 'all'
          ? retryWithBackoff(() => PlanejamentoDocumento.filter({ executor_principal: userFilter }), 3, 1500, 'calendar.loadPlansDocumento.principal')
          : retryWithBackoff(() => PlanejamentoDocumento.list(), 3, 1500, 'calendar.loadPlansDocumento'),
        retryWithBackoff(() => Execucao.filter(execFilter), 3, 1500, 'calendar.loadExecs'),
      ]);

      const planosAtividadeComTipo = (planosAtividade || []).map(p => ({ ...p, tipo_planejamento: 'atividade' }));
      const planosDocumentoComTipo = (planosDocumento || []).map(p => ({ ...p, tipo_planejamento: 'documento' }));
      const todosPlanejamentos = [...planosAtividadeComTipo, ...planosDocumentoComTipo];

      // Etapa 2: enriquecimento em paralelo (sem estado intermediário)
      const empreendimentoIds = [...new Set(todosPlanejamentos.map(p => p.empreendimento_id).filter(Boolean))];
      const atividadeIds = [...new Set(todosPlanejamentos.map(p => p.atividade_id).filter(Boolean))];
      const documentoIdsArray = [...new Set(todosPlanejamentos.map(p => p.documento_id).filter(Boolean).map(String))];

      // Buscar documentos individualmente por ID para garantir que nenhum planejamento fique sem nome
      const [empreendimentosData, atividadesData, documentosData] = await Promise.all([
        empreendimentoIds.length > 0 ? retryWithBackoff(() => Empreendimento.filter({ id: { $in: empreendimentoIds } }), 3, 1000, 'enrich.empreendimentos') : Promise.resolve([]),
        atividadeIds.length > 0 ? retryWithBackoff(() => Atividade.filter({ id: { $in: atividadeIds } }), 3, 1000, 'enrich.atividades') : Promise.resolve([]),
        documentoIdsArray.length > 0
          ? Promise.all(documentoIdsArray.map(docId =>
              retryWithBackoff(() => Documento.get(docId), 3, 1000, `enrich.documento.${docId}`).catch(() => null)
            )).then(results => results.filter(Boolean))
          : Promise.resolve([]),
      ]);

      const empreendimentosMap = new Map((empreendimentosData || []).map(item => [String(item.id), item]));
      const atividadesMap = new Map((atividadesData || []).map(item => [String(item.id), item]));
      const documentosMap = new Map((documentosData || []).map(item => [String(item.id), item]));

      // Agregar horas executadas por planejamento sem estado intermediário
      const horasExecutadasPorPlanejamento = {};
      (execs || []).forEach(exec => {
        if (!exec.planejamento_id || !exec.inicio) return;
        const diaExec = format(parseLocalDate(exec.inicio), 'yyyy-MM-dd');
        const tempoExec = Number(exec.tempo_total) || 0;
        if (!horasExecutadasPorPlanejamento[exec.planejamento_id]) {
          horasExecutadasPorPlanejamento[exec.planejamento_id] = {};
        }
        horasExecutadasPorPlanejamento[exec.planejamento_id][diaExec] =
          (horasExecutadasPorPlanejamento[exec.planejamento_id][diaExec] || 0) + tempoExec;
      });

      // --- NOVO: incluir execuções sem planejamento_id como "atividades rápidas" ---
      const execucoesSemPlanejamento = (execs || []).filter(exec => !exec.planejamento_id);
      const atividadesVirtuais = execucoesSemPlanejamento.map(exec => {
        const diaExec = exec.inicio ? format(parseLocalDate(exec.inicio), 'yyyy-MM-dd') : null;
        return {
          id: `exec-${exec.id}`,
          isLegacyExecution: true,
          isQuickActivity: true,
          tipo_planejamento: 'atividade',
          descritivo: exec.descritivo || 'Execução Rápida',
          tempo_executado: Number(exec.tempo_total) || 0,
          executor_principal: exec.usuario,
          status: 'concluido',
          horas_executadas_por_dia: diaExec ? { [diaExec]: Number(exec.tempo_total) || 0 } : {},
          empreendimento: null,
          atividade: null,
          documento: null,
          os: exec.os || null,
          observacao: exec.observacao || null,
        };
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
            const parts = [];
            if (numero) parts.push(numero);
            if (arquivo) parts.push(arquivo);
            documentoEnriquecido.numero_completo = parts.length ? parts.join(' - ') : (doc.titulo || doc.arquivo || null);
          }

          // Merge exec records (from execucoes table) with manually adjusted hours (stored on planejamento).
          // Exec records take precedence per day; stored field fills days not covered by any execution.
          const storedHoras = (typeof plano.horas_executadas_por_dia === 'object' && plano.horas_executadas_por_dia)
            ? plano.horas_executadas_por_dia
            : {};
          const mergedHorasExec = Object.assign({}, storedHoras, horasExec);

          return {
            ...plano,
            empreendimento: empreendimentosMap.get(String(plano.empreendimento_id)) || null,
            atividade: atividadesMap.get(String(plano.atividade_id)) || null,
            documento: documentoEnriquecido,
            horas_executadas_por_dia: mergedHorasExec,
          };
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

  // Recarregar quando updateKey mudar, mas com debounce de 3s para evitar reloads
  // causados por ações de timer (start/stop/pause) que disparam updateKey frequentemente
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

  const handleActivityDelete = useCallback(() => {
    if (hasSelectedUser) {
      loadCalendarData(filters.user);
    }
    if (triggerUpdate) {
      triggerUpdate();
    }
  }, [triggerUpdate, hasSelectedUser, filters.user, loadCalendarData]);

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
      if (!atividadeParaMover) {
        throw new Error("Atividade não encontrada para reprogramar.");
      }

      if (atividadeParaMover.isLegacyExecution) {
        throw new Error("Atividades rápidas antigas (não planejadas) não podem ser reprogramadas via arrastar e soltar.");
      }
      if (atividadeParaMover.status === 'concluido') {
        throw new Error("Atividades concluídas não podem ser reprogramadas.");
      }

      // Determinar a entidade correta baseada no tipo de planejamento
      const entidadePlanejamento = atividadeParaMover.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;

      // 2. Buscar TODOS os planejamentos do executor para calcular a carga
      // Filtra por executor principal e atividades não concluídas
      const planejamentosDoExecutor = (await retryWithBackoff(() => entidadePlanejamento.filter({ executor_principal: executorEmail }), 3, 1000, `fetchPlansForReprogram`))
        .filter(p => p.status !== 'concluido' && !p.isLegacyExecution);

      // 3. Montar o objeto de carga diária, EXCLUINDO a atividade que está sendo movida
      const cargaDiariaExistente = {};
      planejamentosDoExecutor.forEach(p => {
        if (normalizeActivityId(p.id) !== normalizedActivityId && p.horas_por_dia) {
          Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
            cargaDiariaExistente[data] = (cargaDiariaExistente[data] || 0) + Number(horas || 0);
          });
        }
      });

      // 4. Calcular a nova distribuição
      const { distribuicao, dataTermino } = distribuirHorasPorDias(
        parseLocalDate(novaDataInicio),
        atividadeParaMover.tempo_planejado,
        8, // Limite diário de 8h
        cargaDiariaExistente
      );

      if (Object.keys(distribuicao).length === 0) {
        throw new Error("Não foi possível alocar horas para a nova data. Verifique a capacidade do executor ou o tempo planejado da atividade.");
      }

      // 5. Preparar os dados para atualização
      const inicioPlanejado = Object.keys(distribuicao).sort()[0];
      const terminoPlanejado = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : inicioPlanejado;

      const dadosUpdate = {
        inicio_planejado: inicioPlanejado,
        termino_planejado: terminoPlanejado,
        horas_por_dia: distribuicao,
      };

      // 6. Atualizar a atividade no banco de dados, usando a entidade correta
      await retryWithBackoff(() => entidadePlanejamento.update(atividadeParaMover.id, dadosUpdate), 3, 1500, `updateReprogrammedPlan`);


      // 7. Disparar refresh para buscar os dados mais recentes
      if (hasSelectedUser) {
        loadCalendarData(filters.user);
      }
      if (triggerUpdate) {
        triggerUpdate();
      }

    } catch (error) {
      // Log removido para otimização de desempenho
      alert(`Erro ao reprogramar atividade: ${error.message}`);
      throw error; // Re-throw to allow catch in onDragEnd for bulk operations
    } finally {
      setIsReprogramando(null);
    }
  }, [enrichedData, triggerUpdate, hasSelectedUser, filters.user, loadCalendarData]);

  // **MODIFICADO**: onDragEnd para detectar arraste de dia inteiro
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    // **CORRIGIDO**: Usar hasPermission do context para Admin
    if (!hasPermission('admin')) {
      alert("Você não tem permissão para replanejar atividades.");
      return;
    }

    if (destination.droppableId === source.droppableId) {
      return;
    }

    // **NOVO**: Detectar se é um arraste de dia inteiro
    const isDayDrag = draggableId.startsWith('day-');

    if (isDayDrag) {
      // **NOVO**: Extrair o dia de origem
      const sourceDayKey = draggableId.replace('day-', '');
      const dayActivities = activitiesByDay[sourceDayKey] || [];


      // Filtrar apenas atividades que podem ser movidas
      const movableActivities = dayActivities.filter(a => {
        const canMove = !a.isLegacyExecution && a.status !== 'concluido';
        return canMove;
      });


      if (movableActivities.length === 0) {
        alert("Nenhuma atividade deste dia pode ser movida (todas estão concluídas ou são execuções antigas).");
        return;
      }

      // Confirmar ação
      const confirmed = window.confirm(
        `Deseja mover todas as ${movableActivities.length} atividade(s) de ${format(parseISO(sourceDayKey), 'd MMM', { locale: ptBR })} para ${format(parseISO(destination.droppableId), 'd MMM', { locale: ptBR })}?`
      );

      if (!confirmed) {
        return;
      }

      // **CORRIGIDO**: Mover atividades em SEQUÊNCIA (não paralelo) para evitar rate limit
      const moveDayActivities = async () => {
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < movableActivities.length; i++) {
          const atividade = movableActivities[i];

          try {
            await handleReprogramarAtividade(
              atividade.id,
              destination.droppableId,
              atividade.executor_principal
            );
            successCount++;

            // Pequeno delay entre atividades para evitar rate limit (500ms)
            if (i < movableActivities.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (error) {
            errorCount++;
            // Log removido para otimização de desempenho
          }
        }


        if (successCount > 0) {
          alert(`✅ ${successCount} atividade(s) do dia foram reprogramadas com sucesso!${errorCount > 0 ? `\n⚠️ ${errorCount} falharam (veja o console)` : ''}`);
          clearSelection();
        } else {
          alert(`❌ Nenhuma atividade pôde ser movida. Verifique o console para mais detalhes.`);
        }
      };

      moveDayActivities();
      return;
    }

    // **EXISTENTE**: Detectar se é um grupo sendo arrastado
    const isGroupDrag = draggableId.startsWith('group-');

    if (isGroupDrag) {
      const parts = draggableId.replace('group-', '').split('-');
      const sourceDayKey = parts.pop();
      const groupKey = parts.join('-');

      const allActivitiesInSourceDay = (activitiesByDay[source.droppableId] || []);

      let groupActivities = [];

      if (groupKey.startsWith('virtual-')) {
        const executorEmail = groupKey.replace('virtual-', '');
        groupActivities = allActivitiesInSourceDay.filter(a => a.isLegacyExecution && a.executor_principal === executorEmail);
      } else if (groupKey.startsWith('geral-')) {
        const executorEmail = groupKey.replace('geral-', '');
        groupActivities = allActivitiesInSourceDay.filter(a => !a.empreendimento_id && a.executor_principal === executorEmail && !a.isLegacyExecution);
      } else {
        const [empId, executorEmail] = groupKey.split('|');
        groupActivities = allActivitiesInSourceDay.filter(a =>
          a.empreendimento_id === empId &&
          a.executor_principal === executorEmail &&
          !a.isLegacyExecution
        );
      }


      const invalidActivities = groupActivities.filter(a =>
        a.isLegacyExecution || a.status === 'concluido'
      );

      if (invalidActivities.length > 0) {
        alert("Algumas atividades do grupo não podem ser reprogramadas (concluídas ou execuções antigas).");
        return;
      }

      const moveGroupActivities = async () => {
        let successCount = 0;
        let errorCount = 0;

        for (const atividade of groupActivities) {
          try {
            await handleReprogramarAtividade(atividade.id, destination.droppableId, atividade.executor_principal);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            errorCount++;
            // Log removido para otimização de desempenho
          }
        }

        if (successCount > 0) {
          alert(`✅ ${successCount} atividade(s) do grupo foram reprogramadas!${errorCount > 0 ? `\n⚠️ ${errorCount} falharam` : ''}`);
          clearSelection();
        } else {
          alert(`❌ Erro ao mover atividades do grupo. Verifique o console.`);
        }
      };

      moveGroupActivities();
      return;
    }

    // **EXISTENTE**: Lógica para arrastar atividades individuais ou múltiplas selecionadas
    const activitiesToMove = selectedActivities.has(draggableId) && selectedActivities.size > 1
      ? Array.from(selectedActivities)
      : [draggableId];


    const invalidActivities = activitiesToMove.filter(id => {
      const atividade = (enrichedData || []).find(p => normalizeActivityId(p.id) === normalizeActivityId(id));
      return !atividade || atividade.isLegacyExecution || atividade.status === 'concluido';
    });

    if (invalidActivities.length > 0) {
      alert("Algumas atividades selecionadas não podem ser reprogramadas (concluídas, execuções antigas, ou não são planejamentos).");
      return;
    }

    const moveActivities = async () => {
      let successCount = 0;
      let errorCount = 0;

      for (const activityId of activitiesToMove) {
        const atividadeMovida = (enrichedData || []).find(p => normalizeActivityId(p.id) === normalizeActivityId(activityId));
        if (!atividadeMovida) {
          continue;
        }

        try {
          await handleReprogramarAtividade(activityId, destination.droppableId, atividadeMovida.executor_principal);
          successCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          errorCount++;
          // Log removido para otimização de desempenho
        }
      }

      if (successCount > 0) {
        alert(`✅ ${successCount} atividade(s) foram reprogramadas!${errorCount > 0 ? `\n⚠️ ${errorCount} falharam` : ''}`);
        clearSelection();
      } else {
        alert(`❌ Erro ao mover atividades. Verifique o console.`);
      }
    };

    moveActivities();
  };


  // **MODIFICADO**: Filtros agora aplicados sobre o estado local 'planejamentos'
  const filteredPlanejamentos = useMemo(() => {
    if (!hasSelectedUser) return [];

    let basePlanejamentos = enrichedData || []; // Usa o estado local ENRIQUECIDO

    // O filtro de usuário já foi aplicado na busca, então só aplicamos o de disciplina
    if (filters.discipline !== 'all') {
      return basePlanejamentos.filter(item => {
        // Se for um planejamento de documento sem atividade associada, não o filtra por disciplina.
        // Caso contrário, filtra pela disciplina da atividade.
        if (item.tipo_planejamento === 'documento' && item.atividade_id === null) {
          // If a document planning has no associated activity, its subdisciplinas are the primary categorisation.
          // So, if discipline filter is active, we check if any of the document's subdisciplines match.
          if (item.documento?.subdisciplinas && item.documento.subdisciplinas.includes(filters.discipline)) {
            return true;
          }
          return false; // Document plans without matching subdisciplines are filtered out.
        }
        return item.atividade?.disciplina === filters.discipline;
      });
    }

    return basePlanejamentos;
  }, [enrichedData, filters.discipline, hasSelectedUser]);

  // Pré-calcula o status de cada atividade com um Map para predecessor lookup O(1)
  const activityStatusMap = useMemo(() => {
    const statusMap = new Map();
    const planMap = new Map(filteredPlanejamentos.map(p => [normalizeActivityId(p.id), p]));

    filteredPlanejamentos.forEach(plano => {
      if (plano.isLegacyExecution) {
        statusMap.set(normalizeActivityId(plano.id), plano.status);
        return;
      }
      if (plano.status === 'concluido') {
        statusMap.set(normalizeActivityId(plano.id), 'concluido');
        return;
      }
      const overdue = isActivityOverdue(plano);
      if (plano.status === 'atrasado' || overdue) {
        statusMap.set(normalizeActivityId(plano.id), 'atrasado');
        return;
      }

      let foiReplanejadaParaIniciarMaisTarde = false;
      if (plano.inicio_ajustado && plano.inicio_planejado) {
        try {
          const ajustado = startOfDay(parseISO(plano.inicio_ajustado));
          const planejado = startOfDay(parseISO(plano.inicio_planejado));
          if (isValid(ajustado) && isValid(planejado) && isAfter(ajustado, planejado)) {
            foiReplanejadaParaIniciarMaisTarde = true;
          }
        } catch (_) {}
      }

      let predecessoraAtrasada = false;
      if (plano.predecessora_id) {
        const pred = planMap.get(normalizeActivityId(plano.predecessora_id));
        if (pred && isActivityOverdue(pred)) predecessoraAtrasada = true;
      }

      if (foiReplanejadaParaIniciarMaisTarde || predecessoraAtrasada) {
        statusMap.set(normalizeActivityId(plano.id), 'impactado_por_atraso');
        return;
      }

      let wasReplannedLaterTermino = false;
      if (plano.termino_ajustado && plano.termino_planejado) {
        try {
          const ajustado = startOfDay(parseISO(plano.termino_ajustado));
          const planejado = startOfDay(parseISO(plano.termino_planejado));
          if (isValid(ajustado) && isValid(planejado) && isAfter(ajustado, planejado)) {
            wasReplannedLaterTermino = true;
          }
        } catch (_) {}
      }

      if (wasReplannedLaterTermino) {
        statusMap.set(normalizeActivityId(plano.id), 'replanejado_atrasado');
        return;
      }

      statusMap.set(normalizeActivityId(plano.id), plano.status || 'nao_iniciado');
    });

    return statusMap;
  }, [filteredPlanejamentos]);

  const activitiesByDay = useMemo(() => {
    if (!hasSelectedUser) return {};

    const grouped = {};
    const processedPlanIds = new Set(); // Para não duplicar com execuções

    // 1. Processar todos os planejamentos (atividades planejadas, planejamentos de documento e rápidas com planejamento)
    filteredPlanejamentos.forEach(plano => {
      processedPlanIds.add(plano.id);

      // Determinar em quais dias a atividade deve aparecer
      // Para atividades rápidas: aparecer APENAS nos dias em que foi EXECUTADA (horas_executadas_por_dia)
      // Para atividades concluídas: aparecer nos dias em que foi EXECUTADA (horas_executadas_por_dia)
      // Para atividades não concluídas: aparecer nos dias PLANEJADOS (horas_por_dia)

      const diasParaExibir = new Set();
      const isQuickActivity = plano.is_quick_activity || plano.isQuickActivity;

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
          if (!hasSignificantExecutionHours && (plano.status === 'concluido' || plano.status === 'em_andamento')) {
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
        }
      }

      // Adicionar a atividade nos dias determinados
      diasParaExibir.forEach(dayKey => {
        if (!grouped[dayKey]) {
          grouped[dayKey] = [];
        }

        if (!grouped[dayKey].some(item => item.id === plano.id)) {
          const planoParaExibir = {
            ...plano,
            // Detecta apenas atividades rápidas com flag explícita
            isQuickActivity: !!plano.is_quick_activity,
            isLegacyExecution: false, // Explicitly set to false for actual PlanejamentoAtividade
          };
          grouped[dayKey].push(planoParaExibir);
        }
      });
    });

    // 2. Execuções antigas sem planejamento são ignoradas para evitar entradas fantasmas.


    // Ordenar atividades dentro de cada dia
    for (const dayKey in grouped) {
      grouped[dayKey].sort((a, b) => {
        // Atividades legadas e concluídas por último
        if (a.isLegacyExecution && !b.isLegacyExecution) return 1;
        if (!a.isLegacyExecution && b.isLegacyExecution) return -1;

        const statusA = activityStatusMap.get(normalizeActivityId(a.id)) || a.status || 'nao_iniciado';
        const statusB = activityStatusMap.get(normalizeActivityId(b.id)) || b.status || 'nao_iniciado';

        if (statusA === 'concluido' && statusB !== 'concluido') return 1;
        if (statusA !== 'concluido' && statusB === 'concluido') return -1;

        if (statusA === 'pausado' && statusB === 'em_andamento') return 1;
        if (statusA !== 'pausado' && statusB === 'em_andamento') return -1;

        // Em seguida, pelo horário de início planejado (más cedo primeiro)
        const inicioA = a.inicio_planejado ? parseISO(a.inicio_planejado) : null;
        const inicioB = b.inicio_planejado ? parseISO(b.inicio_planejado) : null;
        if (inicioA && inicioB) {
          if (inicioA.getTime() < inicioB.getTime()) return -1;
          if (inicioA.getTime() > inicioB.getTime()) return 1;
        } else if (inicioA) {
          return -1; // Atividades com data de início vêm antes daquelas sem
        } else if (inicioB) {
          return 1;
        }

        // Finalmente, por nome
        const nameA = a.atividade?.atividade || a.documento?.numero_completo || a.descritivo || '';
        const nameB = b.atividade?.atividade || b.documento?.numero_completo || b.descritivo || '';
        return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
      });
    }

    return grouped;
  }, [filteredPlanejamentos, hasSelectedUser]);

  const cargaDiariaPorUsuario = useMemo(() => {
    if (!hasSelectedUser) return {};

    const carga = {};
    filteredPlanejamentos.forEach(plano => {
      const userEmail = plano.executor_principal;
      if (!userEmail) return;
      if (!carga[userEmail]) carga[userEmail] = {};

      if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
        Object.entries(plano.horas_por_dia).forEach(([data, horas]) => {
          carga[userEmail][data] = (carga[userEmail][data] || 0) + Number(horas);
        });
      }
    });

    return carga;
  }, [filteredPlanejamentos, hasSelectedUser]);

  // Funções de navegação
  const handleDateChange = (direction) => {
    const changeFn = direction === 'next'
      ? { month: addMonths, week: addWeeks, day: addDays }
      : { month: subMonths, week: subWeeks, day: subDays };

    setCurrentDate(current => changeFn[viewMode](current, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

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
        else if (atividade.status === 'concluido' && tempoExecutado > 0 && Object.keys(atividade.horas_executadas_por_dia || {}).length === 0) {
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

  // **MODIFICADO**: Usa o estado de loading do calendário
  const totalLoading = isDashboardRefreshing || isCalendarLoading;

  // **MODIFICADO**: Permissão para replanejamento agora usa o hook hasPermission
  const canReprogram = hasPermission('admin');

  // **MODIFICADO**: renderContent para passar props de seleção
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
    if (viewMode === 'week') return <WeekView date={currentDate} activitiesByDay={activitiesByDay} disciplinas={disciplinas} onActivityDelete={handleActivityDelete} onShowPrevisao={handleShowPrevisao} executorMap={executorMap} allPlanejamentos={enrichedData} isReprogramando={isReprogramando} canReprogram={canReprogram} selectedActivities={selectedActivities} onToggleSelect={toggleActivitySelection} hasSelections={hasSelections} viewType={viewType} />;
    if (viewMode === 'day') return <DayView date={currentDate} activitiesByDay={activitiesByDay} disciplinas={disciplinas} onActivityDelete={handleActivityDelete} onShowPrevisao={handleShowPrevisao} executorMap={executorMap} allPlanejamentos={enrichedData} isReprogramando={isReprogramando} canReprogram={canReprogram} selectedActivities={selectedActivities} onToggleSelect={toggleActivitySelection} hasSelections={hasSelections} viewType={viewType} />;
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
              {/* **NOVO**: Mostrar contador e botão de limpar quando há seleções */}
              {selectedActivities.size > 0 && (
                <div className="flex items-center gap-2 mr-4 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <span className="text-sm font-medium text-indigo-700">
                    {selectedActivities.size} selecionada{selectedActivities.size > 1 ? 's' : ''}
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
              )}
              {hasSelectedUser && (
                <>
                  {(!isColaborador && !isApoio) && (
                    <Button variant="outline" onClick={() => setShowPrevisaoModal(true)}>
                      <LineChart className="w-4 h-4 mr-2" />
                      Previsão de Entrega
                    </Button>
                  )}
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
