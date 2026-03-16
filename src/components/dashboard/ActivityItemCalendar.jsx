import React, { useState, useMemo, useContext } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { User, Trash2, RefreshCw, Play, ListMusic, PlusCircle, Loader2, Edit2 } from "lucide-react";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import FinalizarAtividadeButton from './FinalizarAtividadeButton';
import { Execucao, PlanejamentoAtividade, PlanejamentoDocumento } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';
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
  const [editedDescritivo, setEditedDescritivo] = useState('');

  const realStatus = useMemo(() => {
    // Verificar primeiro se está explicitamente marcada como concluída
    if (plano.status === 'concluido') {
      return 'concluido';
    }
    
    // Se tempo executado >= tempo planejado, considerar concluída
    const tempoExec = Number(plano.tempo_executado) || 0;
    const tempoPlanj = Number(plano.tempo_planejado) || 0;
    if (tempoPlanj > 0 && tempoExec >= tempoPlanj) {
      return 'concluido';
    }
    
    return plano.status || 'nao_iniciado';
  }, [plano.status, plano.tempo_executado, plano.tempo_planejado]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'em_andamento': return '#3b82f6';
      case 'pausado': return '#f59e0b';
      case 'concluido': return '#10b981';
      case 'atrasado':
      case 'replanejado_atrasado': return '#ef4444';
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
    return plano.atividade?.atividade || plano.descritivo || 'Atividade não identificada';
  }, [plano]);
  
  const subdisciplina = plano.atividade?.subdisciplina;
  const tempoExecutado = plano.tempo_executado || 0;
  const tempoPlanejado = plano.tempo_planejado || 0;
  const planoExecutor = plano.executor_principal ? executorMap[plano.executor_principal] : null;
  
  // Horas específicas deste dia
  const horasAlocadasDia = Number(plano.horas_por_dia?.[dayKey]) || 0;
  const horasExecutadasDia = Number(plano.horas_executadas_por_dia?.[dayKey]) || 0;
  
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
    } catch (error) {
      console.error("Erro ao excluir:", error);
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
    } catch (error) {
      console.error("Erro ao iniciar:", error);
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

      await retryWithBackoff(
        () => entityToUpdate.update(plano.id, {
          tempo_executado: timeValue,
          tempo_planejado: timeValue,
          status: 'concluido',
          termino_real: format(new Date(), 'yyyy-MM-dd')
        }),
        3, 1000, 'adjustTime'
      );
      
      setShowTimeAdjustModal(false);
      setAdjustedTime('');
      
      if (onDelete) onDelete();
    } catch (error) {
      console.error("Erro ao ajustar:", error);
      alert("Erro ao ajustar tempo.");
    }
  };

  const shouldShowStartButton = () => realStatus !== 'concluido' && !activeExecution && !plano.isLegacyExecution;
  
  const shouldShowDeleteButton = () => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perfilsComPermissao = ['gestao', 'lider', 'coordenador', 'direcao'];
    return user.perfil && perfilsComPermissao.includes(user.perfil);
  };

  const shouldShowAdjustButton = () => {
    return user && (user.role === 'admin' || user.perfil === 'coordenador') && !plano.isLegacyExecution && plano.status !== 'concluido';
  };

  const shouldShowFinalizarButton = () => {
    return realStatus !== 'concluido' && !plano.isLegacyExecution && tempoExecutado > 0;
  };

  const shouldShowEditButton = () => {
    return realStatus === 'concluido' && (plano.isQuickActivity || plano.is_quick_activity);
  };

  const handleEditDescritivo = () => {
    setEditedDescritivo(plano.descritivo || '');
    setShowEditModal(true);
  };

  const handleSaveDescritivo = async () => {
    if (!editedDescritivo.trim()) {
      alert("Por favor, insira uma descrição.");
      return;
    }

    try {
      const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;

      await retryWithBackoff(
        () => entityToUpdate.update(plano.id, {
          descritivo: editedDescritivo.trim()
        }),
        3, 1000, 'editDescritivo'
      );
      
      setShowEditModal(false);
      if (onDelete) onDelete();
    } catch (error) {
      console.error("Erro ao editar:", error);
      alert("Erro ao editar descrição.");
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
                         realStatus === 'atrasado' ? '#fef2f2' :
                         realStatus === 'em_andamento' ? '#eff6ff' :
                         realStatus === 'concluido' ? '#f0fdf4' :
                         realStatus === 'pausado' ? '#fffbeb' : '#ffffff',
          ...(isDragging && { boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', transform: 'rotate(2deg)'})
        }}
        className={`p-2 rounded border mb-1 text-xs group hover:shadow-md transition-shadow relative ${
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

        <div className="flex items-start justify-between mb-1.5">
          <div className={`flex-1 mr-2 ${hasSelections || isSelected ? 'ml-12' : 'ml-6'}`}>
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
                onClick={handleEditDescritivo}
                size="sm"
                variant="ghost"
                className="w-5 h-5 p-0 text-gray-400 hover:text-blue-600 hover:bg-blue-100"
                title="Editar descrição"
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

        <div className="flex items-center justify-between flex-wrap gap-x-3 gap-y-1 mb-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            {subdisciplina && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-blue-600 font-medium">{subdisciplina}</span>
              </div>
            )}
            {realStatus === 'concluido' && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600 font-medium">Concluída</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="font-mono text-blue-600 flex flex-col items-end">
              <span className="font-semibold text-sm" title={contemDiasFuturos ? "Planejado / Executado (continua nos próximos dias)" : "Planejado / Executado"}>
                {horasAlocadasDia.toFixed(1)}/{horasExecutadasDia.toFixed(1)}h{contemDiasFuturos ? ' ...' : ''}
              </span>
            </div>
            
            {realStatus === 'concluido' && (
              <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
            )}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Descrição da Atividade</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="editDescritivo">Descrição da Atividade</Label>
              <Textarea
                id="editDescritivo"
                value={editedDescritivo}
                onChange={(e) => setEditedDescritivo(e.target.value)}
                rows={4}
                placeholder="Digite a descrição da atividade..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveDescritivo} className="bg-blue-600 hover:bg-blue-700">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}