import React, { useState, useMemo, useContext } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Trash2, RefreshCw, Play, ListMusic, PlusCircle, Loader2, Edit2, X, Check } from "lucide-react";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import FinalizarAtividadeButton from './FinalizarAtividadeButton';
import { formatHoras } from '../utils/formatHours';
import { Execucao, PlanejamentoAtividade, PlanejamentoDocumento } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';
import { distribuirHorasPorDias, isActivityOverdue } from '../utils/DateCalculator';
import { format } from 'date-fns';

// Import calculateActivityStatus from parent
const calculateActivityStatus = (plano, allPlanejamentos = []) => {
  if (plano.isLegacyExecution) {
    return plano.status;
  }

  if (plano.status === 'concluido') {
    return 'concluido';
  }

  // Import isActivityOverdue logic here or pass as prop
  // For simplicity, using basic check
  const isOverdue = false; // Placeholder - you'd need to import the actual function

  if (plano.status === 'atrasado' || isOverdue) {
    return 'atrasado';
  }

  return plano.status || 'nao_iniciado';
};

export default function ActivityItemCalendar({ 
  plano, 
  dayKey, 
  onDelete, 
  executorMap, 
  allPlanejamentos, 
  provided, 
  isDragging, 
  isReprogramando, 
  isSelected, 
  onToggleSelect, 
  hasSelections 
}) {
  const { activeExecution, startExecution, user, playlist, addToPlaylist, removeFromPlaylist } = useContext(ActivityTimerContext);
  const [isStarting, setIsStarting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTimeAdjustModal, setShowTimeAdjustModal] = useState(false);
  const [adjustedTime, setAdjustedTime] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});

  const realStatus = useMemo(() => {
    if (plano.status === 'concluido_com_atraso') return 'concluido_com_atraso';
    if (plano.status === 'concluido') return 'concluido';

    const tempoExec = Number(plano.tempo_executado) || 0;
    const tempoPlanj = Number(plano.tempo_planejado) || 0;
    if (tempoPlanj > 0 && tempoExec >= tempoPlanj) return 'concluido';

    const overdue = isActivityOverdue(plano);
    if (overdue) {
      const foiIniciada = plano.inicio_real != null ||
        plano.status === 'em_andamento' ||
        plano.status === 'pausado' ||
        tempoExec > 0;
      return foiIniciada ? 'atrasado_em_andamento' : 'atrasado_nao_iniciado';
    }

    return plano.status || 'nao_iniciado';
  }, [plano.status, plano.tempo_executado, plano.tempo_planejado, plano.inicio_real, plano.termino_planejado, plano.termino_ajustado]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'em_andamento': return '#3b82f6';
      case 'pausado': return '#f59e0b';
      case 'concluido': return '#10b981';
      case 'concluido_com_atraso': return '#ef4444';
      case 'atrasado':
      case 'replanejado_atrasado':
      case 'atrasado_nao_iniciado': return '#ef4444';
      case 'atrasado_em_andamento': return '#f59e0b';
      case 'impactado_por_atraso': return '#8b5cf6';
      case 'nao_iniciado':
      default: return '#6b7280';
    }
  };

  const displayName = useMemo(() => {
    if (plano.tipo_planejamento === 'documento') {
      const numeroFolha = plano.documento?.numero || 'Número';
      const nomeArquivo = plano.documento?.arquivo || 'Documento';
      const etapa = plano.etapa || 'Sem Etapa';
      return `${numeroFolha} - ${nomeArquivo} - ${etapa}`;
    }
    return plano.atividade?.atividade || plano.descritivo || plano.titulo || 'Atividade não identificada';
  }, [plano]);
  
  const subdisciplina = plano.atividade?.subdisciplina;
  const tempoExecutado = plano.tempo_executado || 0;
  const tempoPlanejado = plano.tempo_planejado || 0;
  const planoExecutor = plano.executor_principal ? executorMap[plano.executor_principal] : null;
  
  // Horas específicas deste dia
  const horasAlocadasDia = Number(plano.horas_por_dia?.[dayKey]) || 0;
  let horasExecutadasDia = Number(plano.horas_executadas_por_dia?.[dayKey]) || 0;

  // Se não tem horas executadas registradas por dia, mas tem:
  // - Status concluído OU tempo executado > 0
  // - E horas alocadas neste dia
  // Então considerar as horas alocadas como executadas
  if (horasExecutadasDia === 0 && horasAlocadasDia > 0) {
    if (plano.status === 'concluido' || Number(plano.tempo_executado) > 0) {
      horasExecutadasDia = horasAlocadasDia;
    }
  }
  
  // Verificar se a atividade continua em dias futuros
  const contemDiasFuturos = useMemo(() => {
    if (!plano.horas_por_dia || typeof plano.horas_por_dia !== 'object') return false;
    const dias = Object.keys(plano.horas_por_dia).sort();
    const indiceDiaAtual = dias.indexOf(dayKey);
    return indiceDiaAtual >= 0 && indiceDiaAtual < dias.length - 1;
  }, [plano.horas_por_dia, dayKey]);
  
  const isNaPlaylist = playlist.includes(plano.id);

  const getDocumentoDisplay = () => {
    if (!plano.documento_id || plano.tipo_planejamento === 'documento') return null;
    if (!plano.documento) return 'Carregando...';
    
    const campos = [
      plano.documento.numero_completo,
      plano.documento.arquivo,
      plano.documento.numero,
    ].filter(Boolean);
    
    return campos.length > 0 ? campos[0] : 'Sem documento';
  };

  const documentoDisplay = getDocumentoDisplay();

  const handleDeleteActivity = async () => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir "${displayName}"?`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      if (plano.isLegacyExecution) {
        const execId = plano.id.split('-')[1];
        await retryWithBackoff(() => Execucao.delete(execId), 3, 1000, 'deleteExecution');
      } else if (plano.tipo_planejamento === 'documento') {
        await retryWithBackoff(() => PlanejamentoDocumento.delete(plano.id), 3, 1000, 'deleteDocumentPlanning');
      } else {
        await retryWithBackoff(() => PlanejamentoAtividade.delete(plano.id), 3, 1000, 'deleteActivity');
      }
      
      if (onDelete) onDelete();
    } catch {
      alert("Erro ao excluir atividade.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStartActivity = async () => {
    if (activeExecution) {
      alert("Uma atividade já está em progresso.");
      return;
    }
    if (realStatus === 'concluido') {
      alert("Esta atividade já foi concluída.");
      return;
    }
    if (plano.isLegacyExecution) {
      alert("Esta é uma atividade antiga e não pode ser iniciada novamente.");
      return;
    }

    setIsStarting(true);
    try {
      const activityDescription = `${displayName}${plano.empreendimento?.nome ? ` - ${plano.empreendimento.nome}` : ''}`;
      
      await startExecution({
        planejamento_id: plano.id,
        descritivo: activityDescription,
        empreendimento_id: plano.empreendimento_id,
        tipo_planejamento: plano.tipo_planejamento 
      });
    } catch {
      alert("Não foi possível iniciar a atividade.");
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
      if (plano.isLegacyExecution) {
        alert("Não é possível ajustar o tempo para atividades rápidas antigas.");
        return;
      }

      const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;

      // Preencher as horas executadas por dia
      const horasExecutadasPorDia = { ...plano.horas_executadas_por_dia || {} };
      horasExecutadasPorDia[dayKey] = timeValue;

      const hoje = format(new Date(), 'yyyy-MM-dd');
      const terminoPlanejado = plano.termino_ajustado || plano.termino_planejado;
      const statusFinal = terminoPlanejado && hoje > terminoPlanejado ? 'concluido_com_atraso' : 'concluido';

      await retryWithBackoff(
        () => entityToUpdate.update(plano.id, {
          tempo_executado: timeValue,
          status: statusFinal,
          termino_real: hoje,
          horas_executadas_por_dia: horasExecutadasPorDia
        }),
        3, 1000, 'adjustTime'
      );

      // Verificar se foi salvo corretamente
      const atividadeAtualizada = await retryWithBackoff(
        () => entityToUpdate.get(plano.id),
        3, 1000, 'verificarAjuste'
      );

      setShowTimeAdjustModal(false);
      setAdjustedTime('');

      if (onDelete) onDelete();
    } catch {
      alert("Erro ao ajustar tempo.");
    }
  };

  const isConcluded = realStatus === 'concluido' || realStatus === 'concluido_com_atraso';
  const shouldShowStartButton = () =>
    !isConcluded &&
    !activeExecution &&
    !plano.isLegacyExecution &&
    realStatus !== 'atrasado_nao_iniciado' &&
    realStatus !== 'atrasado_em_andamento';
  
  const shouldShowDeleteButton = () => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perfilsComPermissao = ['gestao', 'lider', 'coordenador', 'direcao'];
    return user.perfil && perfilsComPermissao.includes(user.perfil);
  };

  const shouldShowAdjustButton = () => {
    return user && (user.role === 'admin' || user.perfil === 'coordenador') && !plano.isLegacyExecution && !isConcluded;
  };

  const shouldShowFinalizarButton = () => {
    return !isConcluded && !plano.isLegacyExecution && tempoExecutado > 0;
  };

  const shouldShowEditButton = () => {
    return !plano.isLegacyExecution;
  };

  const handleOpenEditModal = () => {
    setEditForm({
      descritivo: plano.descritivo || plano.titulo || '',
      tempo_planejado: plano.tempo_planejado != null ? String(plano.tempo_planejado) : '',
      inicio_planejado: plano.inicio_planejado ? plano.inicio_planejado.slice(0, 10) : '',
      termino_planejado: plano.termino_planejado ? plano.termino_planejado.slice(0, 10) : '',
      executor_principal: plano.executor_principal ? String(plano.executor_principal) : '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    try {
      const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
      const updates = {};

      if (editForm.descritivo !== undefined) {
        updates.descritivo = editForm.descritivo.trim();
        updates.titulo = editForm.descritivo.trim();
      }
      if (editForm.tempo_planejado !== '') {
        const t = parseFloat(editForm.tempo_planejado);
        if (!isNaN(t)) {
          updates.tempo_planejado = t;
          const oldHoras = plano.horas_por_dia || {};
          const dias = Object.keys(oldHoras);
          if (dias.length === 1) {
            updates.horas_por_dia = { [dias[0]]: t };
          } else if (dias.length > 1) {
            const total = dias.reduce((sum, d) => sum + (Number(oldHoras[d]) || 0), 0);
            const newHoras = {};
            dias.forEach(d => {
              newHoras[d] = total > 0
                ? parseFloat(((Number(oldHoras[d]) / total) * t).toFixed(2))
                : parseFloat((t / dias.length).toFixed(2));
            });
            updates.horas_por_dia = newHoras;
          }
        }
      }
      if (editForm.inicio_planejado) updates.inicio_planejado = editForm.inicio_planejado;
      if (editForm.termino_planejado) updates.termino_planejado = editForm.termino_planejado;
      updates.executor_principal = editForm.executor_principal || null;

      const novoInicio = editForm.inicio_planejado || plano.inicio_planejado?.slice(0, 10);
      const dataInicioMudou = editForm.inicio_planejado && editForm.inicio_planejado !== plano.inicio_planejado?.slice(0, 10);
      if (dataInicioMudou && novoInicio) {
        const tempoPlan = updates.tempo_planejado ?? Number(plano.tempo_planejado) ?? 0;
        if (tempoPlan > 0) {
          const [y, m, d] = novoInicio.split('-').map(Number);
          const dataLocal = new Date(y, m - 1, d);
          const { distribuicao } = distribuirHorasPorDias(dataLocal, tempoPlan);
          updates.horas_por_dia = distribuicao;
        }
      }

      await retryWithBackoff(
        () => entityToUpdate.update(plano.id, updates),
        3, 1000, 'editActivity'
      );

      setShowEditModal(false);
      if (onDelete) onDelete();
    } catch {
      alert("Erro ao salvar alterações.");
    }
  };

  return (
    <>
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        style={{
          ...provided.draggableProps.style,
          borderLeft: `3px solid ${getStatusColor(realStatus)}`,
          backgroundColor: isSelected ? '#e0e7ff' :
                         realStatus === 'concluido_com_atraso' ? '#fef2f2' :
                         realStatus === 'atrasado_nao_iniciado' ? '#fef2f2' :
                         realStatus === 'atrasado' ? '#fef2f2' :
                         realStatus === 'atrasado_em_andamento' ? '#fffbeb' :
                         realStatus === 'em_andamento' ? '#eff6ff' :
                         realStatus === 'concluido' ? '#f0fdf4' :
                         realStatus === 'pausado' ? '#fffbeb' : '#ffffff',
          ...(isDragging && { boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', transform: 'rotate(2deg)'})
        }}
        className={`p-2 rounded border mb-1 text-xs group hover:shadow-md transition-shadow relative overflow-hidden w-full ${
          isSelected ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'
        }`}
      >
        {isReprogramando && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded z-10">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
          </div>
        )}
        
        {(hasSelections || isSelected) && plano.status !== 'concluido' && !plano.isLegacyExecution && (
          <div className="absolute left-1 top-1 z-20">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(plano.id);
              }}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer"
            />
          </div>
        )}

        <div
          {...provided.dragHandleProps}
          className={`absolute top-0 bottom-0 w-6 flex items-center justify-center cursor-move opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-gray-100 to-transparent ${
            hasSelections || isSelected ? 'left-6' : 'left-0'
          }`}
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

        <div className="flex items-start justify-between mb-1.5 min-w-0">
          <div className={`flex-1 min-w-0 mr-2 ${hasSelections || isSelected ? 'ml-12' : 'ml-6'}`}>
            <p className="font-medium text-gray-800 break-words" title={displayName}>
              {displayName}
              {plano.isQuickActivity && (
                <Badge variant="outline" className="ml-2 px-1 py-0.5 text-xs bg-gray-100 text-gray-600">Execução Rápida</Badge>
              )}
              {plano.tipo_planejamento === 'documento' && (
                <Badge variant="outline" className="ml-2 px-1 py-0.5 text-xs bg-blue-100 text-blue-600">Planejamento Doc.</Badge>
              )}
            </p>
            {plano.empreendimento?.nome && (
              <p className="text-xs text-gray-500 mt-0.5 font-medium">
                📋 {plano.empreendimento.nome}
              </p>
            )}
          </div>
          <div className="flex items-center shrink-0 gap-2">
            {shouldShowEditButton() && (
              <Button
                onClick={handleOpenEditModal}
                size="sm"
                variant="ghost"
                className="w-5 h-5 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-100"
                title="Editar atividade"
              >
                <Edit2 className="w-3 h-3" />
              </Button>
            )}
            
            {plano.status !== 'concluido' && !plano.isLegacyExecution && plano.tipo_planejamento !== 'documento' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  isNaPlaylist ? removeFromPlaylist(plano.id) : addToPlaylist(plano.id);
                }}
                className={`w-5 h-5 p-0 flex items-center justify-center rounded-full transition-colors ${
                  isNaPlaylist ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                }`}
                title={isNaPlaylist ? "Remover da playlist" : "Adicionar à playlist"}
              >
                {isNaPlaylist ? <ListMusic className="w-3 h-3" /> : <PlusCircle className="w-3 h-3" />}
              </button>
            )}

            {shouldShowDeleteButton() && (
              <Button
                onClick={handleDeleteActivity}
                disabled={isDeleting || !!activeExecution}
                size="sm"
                variant="ghost"
                className="w-5 h-5 p-0 text-gray-400 hover:text-red-600 hover:bg-red-100"
              >
                {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </Button>
            )}
          </div>
        </div>

        {plano.tipo_planejamento === 'documento' && plano.documento?.subdisciplinas && plano.documento.subdisciplinas.length > 0 && (
          <div className="mb-1.5">
            <div className="flex flex-wrap gap-1">
              {plano.documento.subdisciplinas.map((sub, idx) => (
                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700">
                  {sub}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mb-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0 overflow-hidden">
              {subdisciplina && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-2 h-2 bg-blue-400 rounded-full shrink-0"></div>
                  <span className="text-blue-600 font-medium line-clamp-1">{subdisciplina}</span>
                </div>
              )}
              {realStatus === 'concluido' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                  <span className="text-green-600 font-medium">Concluída</span>
                </div>
              )}
              {realStatus === 'concluido_com_atraso' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-2 h-2 bg-red-500 rounded-full shrink-0"></div>
                  <span className="text-red-600 font-medium">Concluída c/ Atraso</span>
                </div>
              )}
              {realStatus === 'atrasado_nao_iniciado' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-2 h-2 bg-red-500 rounded-full shrink-0"></div>
                  <span className="text-red-600 font-medium">Não Iniciada — Atrasada</span>
                </div>
              )}
              {realStatus === 'atrasado_em_andamento' && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-2 h-2 bg-amber-500 rounded-full shrink-0"></div>
                  <span className="text-amber-600 font-medium">Em Andamento — Atrasada</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <span
                className="font-mono font-semibold text-xs text-blue-600 whitespace-nowrap"
                title={contemDiasFuturos ? "Planejado / Executado (continua nos próximos dias)" : "Planejado / Executado"}
              >
                {formatHoras(horasAlocadasDia)}/{formatHoras(horasExecutadasDia)}{contemDiasFuturos ? '…' : ''}
              </span>

              {realStatus === 'concluido' && (
                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
              )}
              {realStatus === 'concluido_com_atraso' && (
                <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">✓</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {documentoDisplay && (
          <p className="text-gray-600 font-mono mb-1.5 break-words">{documentoDisplay}</p>
        )}

        {plano.os && (
          <p className="text-blue-600 font-semibold text-xs mb-1.5">
            OS: {plano.os}
          </p>
        )}
        
        {planoExecutor && (
          <div className="flex items-center gap-1.5 text-gray-700">
            <User className="w-3 h-3" />
            <span className="truncate">{planoExecutor.nome || planoExecutor.email}</span>
          </div>
        )}

        <div className="flex gap-1 mt-2">
          {/* Cenário 3: Concluída no prazo — verde com ✓ */}
          {realStatus === 'concluido' && (
            <div className="flex-1 h-6 flex items-center justify-center gap-1 bg-green-100 rounded text-green-700 text-xs font-medium">
              <Check className="w-3 h-3" /> Concluída
            </div>
          )}

          {/* Cenário 2 após finalizar: Concluída com atraso — vermelho com ✓ */}
          {realStatus === 'concluido_com_atraso' && (
            <div className="flex-1 h-6 flex items-center justify-center gap-1 bg-red-100 rounded text-red-700 text-xs font-medium">
              <Check className="w-3 h-3" /> Concluída c/ Atraso
            </div>
          )}

          {/* Cenário 1: Atrasada e não iniciada — vermelho com X (ainda clicável para iniciar) */}
          {realStatus === 'atrasado_nao_iniciado' && !plano.isLegacyExecution && (
            <Button
              onClick={handleStartActivity}
              disabled={!!activeExecution || isStarting}
              size="sm"
              className="flex-1 h-6 text-xs bg-red-600 hover:bg-red-700"
            >
              <X className="w-3 h-3 mr-1" />
              {isStarting ? "Iniciando..." : "Iniciar"}
            </Button>
          )}

          {/* Cenário 2: Iniciada mas não finalizada e atrasada — amarelo com ▶ */}
          {realStatus === 'atrasado_em_andamento' && !plano.isLegacyExecution && (
            <Button
              onClick={handleStartActivity}
              disabled={!!activeExecution || isStarting}
              size="sm"
              className="flex-1 h-6 text-xs bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Play className="w-3 h-3 mr-1" />
              {isStarting ? "Iniciando..." : "Continuar"}
            </Button>
          )}

          {/* Botão padrão de iniciar (atividades dentro do prazo) */}
          {shouldShowStartButton() && (
            <Button
              onClick={handleStartActivity}
              disabled={!!activeExecution || isStarting}
              size="sm"
              className="flex-1 h-6 text-xs bg-green-600 hover:bg-green-700"
            >
              <Play className="w-3 h-3 mr-1" />
              {isStarting ? "Iniciando..." : "Iniciar"}
            </Button>
          )}

          {shouldShowFinalizarButton() && (
            <FinalizarAtividadeButton
              plano={plano}
              displayName={displayName}
              onSuccess={onDelete}
            />
          )}
        </div>
      </div>

      <Dialog open={showTimeAdjustModal} onOpenChange={setShowTimeAdjustModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar Tempo Executado</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2"><strong>Atividade:</strong> {displayName}</p>
              <p className="text-sm text-gray-600 mb-4">Tempo atual: {tempoExecutado.toFixed(1)}h de {tempoPlanejado.toFixed(1)}h planejadas</p>
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
              />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-blue-700 text-sm">ℹ️ A atividade será automaticamente marcada como concluída após o ajuste.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTimeAdjustModal(false)}>Cancelar</Button>
            <Button onClick={handleAdjustTime} className="bg-blue-600 hover:bg-blue-700">Ajustar e Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Atividade</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-500"><strong>Atividade:</strong> {displayName}</p>

            <div className="space-y-2">
              <Label>Descrição / Título</Label>
              <Textarea
                value={editForm.descritivo || ''}
                onChange={(e) => setEditForm(f => ({ ...f, descritivo: e.target.value }))}
                rows={3}
                placeholder="Descrição da atividade..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tempo Planejado (h)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editForm.tempo_planejado || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, tempo_planejado: e.target.value }))}
                  placeholder="Ex: 2.5"
                />
              </div>

              <div className="space-y-2">
                <Label>Executor Principal</Label>
                <Select
                  value={editForm.executor_principal || 'none'}
                  onValueChange={(v) => setEditForm(f => ({ ...f, executor_principal: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhum —</SelectItem>
                    {Object.values(executorMap).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.nome || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Início Planejado</Label>
                <Input
                  type="date"
                  value={editForm.inicio_planejado || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, inicio_planejado: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>Término Planejado</Label>
                <Input
                  type="date"
                  value={editForm.termino_planejado || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, termino_planejado: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}