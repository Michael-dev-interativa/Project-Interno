// @ts-nocheck
import React, { useState, useMemo, useContext } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Play, Trash2, RefreshCw, Edit2, Loader2, List } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { PlanejamentoAtividade, Execucao, PlanejamentoDocumento, Documento } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';
import { distribuirHorasPorDias } from '../utils/DateCalculator';
import AtividadesFolhaModal from './AtividadesFolhaModal';

const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  if (typeof dateString === 'string') {
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    try {
      const parsedDate = parseISO(dateString);
      if (!isNaN(parsedDate.getTime())) {
        return new Date(parsedDate.getTime() + parsedDate.getTimezoneOffset() * 60000);
      }
    } catch (e) {}
  }
  return null;
};

const formatHours = (h) => Number(h).toFixed(1);

const calculateActivityStatus = (plano, allPlanejamentos = []) => {
  if (plano.isLegacyExecution) return plano.status;
  if (plano.status === 'concluido_com_atraso') return 'concluido_com_atraso';
  if (plano.status === 'concluido') return 'concluido';
  return plano.status || 'nao_iniciado';
};

export default function CalendarioActivityItem({ plano, dayKey, onDelete, onUpdate, executorMap, allPlanejamentos, provided, isDragging, isReprogramando, isSelected, onToggleSelect, hasSelections, orderIndex }) {
  const { activeExecution, startExecution, user, playlist, hasPermission, isAdmin, perfilAtual, allEmpreendimentos } = useContext(ActivityTimerContext);
  const canEditDelete = isAdmin || perfilAtual === 'direcao' || perfilAtual === 'coordenador';

  const [isStarting, setIsStarting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showTimeAdjustModal, setShowTimeAdjustModal] = useState(false);
  const [adjustedTime, setAdjustedTime] = useState('');
  const [showEditDescricaoModal, setShowEditDescricaoModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [showAtividadesFolhaModal, setShowAtividadesFolhaModal] = useState(false);

  const realStatus = calculateActivityStatus(plano, allPlanejamentos);

  const displayName = useMemo(() => {
    if (plano.tipo_planejamento === 'documento') {
      const etapa = plano.etapa || 'Sem Etapa';
      const numero = plano.documento?.numero;
      const arquivo = plano.documento?.arquivo;
      if (numero || arquivo) return [numero, arquivo, etapa].filter(Boolean).join(' - ');
      const desc = plano.descritivo?.trim();
      if (desc && desc !== etapa) return desc;
      return etapa;
    }
    return plano.atividade?.atividade || plano.descritivo || 'Atividade não identificada';
  }, [plano]);

  const subdisciplina = plano.atividade?.subdisciplina;
  const tempoExecutado = Number(plano.tempo_executado) || 0;
  const horasAlocadasDia = Number(plano.horas_por_dia?.[dayKey]) || 0;
  const horasExecutadasNoDia = Number(plano.horas_executadas_por_dia?.[dayKey]) || 0;

  const getDocumentoDisplay = () => {
    if (!plano.documento_id) return null;
    if (!plano.documento) return 'Carregando...';
    const campos = [plano.documento.numero_completo, plano.documento.arquivo, plano.documento.numero].filter(Boolean);
    return campos.length > 0 ? campos[0] : 'Sem documento';
  };

  const documentoDisplay = getDocumentoDisplay();

  const handleDeleteActivity = async () => {
    const confirmed = window.confirm(`Tem certeza que deseja excluir "${displayName}"? Esta ação é irreversível.`);
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
      const is404 = error.message?.includes("404") || (error.response && error.response.status === 404);
      if (is404) { if (onDelete) onDelete(); }
      else {
        let msg = "Erro ao excluir atividade.";
        if (error.message?.includes("403")) msg = "Sem permissão para excluir.";
        alert(msg);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const isConcluded = realStatus === 'concluido' || realStatus === 'concluido_com_atraso';

  const handleStartActivity = async () => {
    if (activeExecution) { alert("Uma atividade já está em progresso."); return; }
    if (isConcluded) { alert("Esta atividade já foi concluída."); return; }
    if (plano.isLegacyExecution) { alert("Esta execução antiga não pode ser reiniciada."); return; }
    setIsStarting(true);
    try {
      const activityDescription = `${displayName}${plano.empreendimento?.nome ? ` - ${plano.empreendimento.nome}` : ''}`;
      await startExecution({ planejamento_id: plano.id, descritivo: activityDescription, empreendimento_id: plano.empreendimento_id, tipo_planejamento: plano.tipo_planejamento });
    } catch (error) {
      alert("Não foi possível iniciar a atividade.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleAdjustTime = async () => {
    const timeValue = parseFloat(adjustedTime);
    if (isNaN(timeValue) || timeValue < 0) { alert("Tempo inválido."); return; }
    try {
      if (plano.isLegacyExecution) { alert("Não é possível ajustar execuções antigas."); return; }
      const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
      const diasPlanejados = Object.keys(plano.horas_por_dia || {});
      const novasHorasPorDia = {};
      if (diasPlanejados.length > 0) {
        const hpd = timeValue / diasPlanejados.length;
        diasPlanejados.forEach(d => { novasHorasPorDia[d] = hpd; });
      } else {
        novasHorasPorDia[format(new Date(), 'yyyy-MM-dd')] = timeValue;
      }
      const hoje = format(new Date(), 'yyyy-MM-dd');
      const terminoPlanejado = plano.termino_ajustado || plano.termino_planejado;
      const statusFinal = terminoPlanejado && hoje > terminoPlanejado ? 'concluido_com_atraso' : 'concluido';
      await retryWithBackoff(() => entityToUpdate.update(plano.id, { tempo_executado: timeValue, horas_executadas_por_dia: novasHorasPorDia, status: statusFinal, termino_real: hoje }), 3, 1000, 'adjustTime');
      setShowTimeAdjustModal(false);
      setAdjustedTime('');
      if (onDelete) onDelete({ id: plano.id, status: statusFinal, tempo_executado: timeValue, horas_executadas_por_dia: novasHorasPorDia });
    } catch (error) {
      alert("Erro ao ajustar tempo.");
    }
  };

  const handleOpenEditDescricao = () => {
    setEditForm({
      descritivo: plano.descritivo || plano.titulo || '',
      tempo_planejado: plano.tempo_planejado != null ? String(plano.tempo_planejado) : '',
      inicio_planejado: plano.inicio_planejado ? plano.inicio_planejado.slice(0, 10) : '',
      termino_planejado: plano.termino_planejado ? plano.termino_planejado.slice(0, 10) : '',
      executor_principal: plano.executor_principal ? String(plano.executor_principal) : '',
      empreendimento_id: plano.empreendimento_id || '',
    });
    setShowEditDescricaoModal(true);
  };

  const handleSaveDescricao = async () => {
    setIsEditLoading(true);
    try {
      if (plano.isLegacyExecution) {
        const execId = plano.id.split('-')[1];
        await Execucao.update(execId, { descritivo: editForm.descritivo.trim() });
      } else {
        const entityToUpdate = plano.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
        const updates = {};
        if (editForm.descritivo !== undefined) { updates.descritivo = editForm.descritivo.trim(); updates.titulo = editForm.descritivo.trim(); }
        if (editForm.tempo_planejado !== '') {
          const t = parseFloat(editForm.tempo_planejado);
          if (!isNaN(t)) {
            updates.tempo_planejado = t;
            const oldHoras = plano.horas_por_dia || {};
            const dias = Object.keys(oldHoras);
            if (dias.length === 1) { updates.horas_por_dia = { [dias[0]]: t }; }
            else if (dias.length > 1) {
              const total = dias.reduce((sum, d) => sum + (Number(oldHoras[d]) || 0), 0);
              const newHoras = {};
              dias.forEach(d => { newHoras[d] = total > 0 ? parseFloat(((Number(oldHoras[d]) / total) * t).toFixed(2)) : parseFloat((t / dias.length).toFixed(2)); });
              updates.horas_por_dia = newHoras;
            }
          }
        }
        if (editForm.inicio_planejado) updates.inicio_planejado = editForm.inicio_planejado;
        if (editForm.termino_planejado) updates.termino_planejado = editForm.termino_planejado;
        updates.executor_principal = editForm.executor_principal || null;
        updates.empreendimento_id = editForm.empreendimento_id || null;
        const dataInicioMudou = editForm.inicio_planejado && editForm.inicio_planejado !== plano.inicio_planejado?.slice(0, 10);
        if (dataInicioMudou) {
          const tempoPlan = updates.tempo_planejado ?? Number(plano.tempo_planejado) ?? 0;
          if (tempoPlan > 0) {
            const [y, m, d] = editForm.inicio_planejado.split('-').map(Number);
            const dataLocal = new Date(y, m - 1, d);
            const { distribuicao } = distribuirHorasPorDias(dataLocal, tempoPlan);
            updates.horas_por_dia = distribuicao;
          }
        }
        await retryWithBackoff(() => entityToUpdate.update(plano.id, updates), 3, 1000, 'editActivity');
      }
      setShowEditDescricaoModal(false);
      if (onDelete) onDelete();
    } catch (error) {
      alert('Erro ao salvar: ' + (error.message || 'Tente novamente.'));
    } finally {
      setIsEditLoading(false);
    }
  };

  const shouldShowAdjustButton = () => canEditDelete && !plano.isLegacyExecution && plano.status !== 'concluido';
  const observacao = plano.observacao || null;

  const getStatusBg = () => {
    if (isSelected) return '#e0e7ff';
    if (realStatus === 'concluido_com_atraso' || realStatus === 'atrasado' || realStatus === 'replanejado_atrasado') return '#fef2f2';
    if (realStatus === 'impactado_por_atraso') return '#ffffff';
    if (realStatus === 'em_andamento') return '#eff6ff';
    if (realStatus === 'concluido') return '#f0fdf4';
    if (realStatus === 'pausado') return '#fffbeb';
    return '#ffffff';
  };

  return (
    <>
      <div
        ref={provided.innerRef}
        {...provided.draggableProps}
        style={{ ...provided.draggableProps.style, backgroundColor: getStatusBg(), ...(isDragging && { boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }) }}
        className={`p-2 rounded border mb-1 text-xs group hover:shadow-md transition-shadow duration-200 relative overflow-visible ${isSelected ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-gray-200'}`}
      >
        {orderIndex !== undefined && (
          <div className="absolute left-1.5 top-1.5 z-20 bg-indigo-100 text-indigo-700 text-xs font-bold rounded px-1.5 py-0.5 pointer-events-none border border-indigo-200 leading-none">
            {orderIndex + 1}
          </div>
        )}
        {isReprogramando && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded z-10">
            <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
          </div>
        )}
        {plano.status !== 'concluido' && plano.status !== 'concluido_com_atraso' && !plano.isLegacyExecution && (
          <div className={`absolute right-1 top-1 z-20 transition-opacity ${hasSelections || isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); onToggleSelect(plano.id); }} className="w-4 h-4 rounded border-gray-300 text-indigo-600 cursor-pointer" title="Selecionar para mover em grupo" />
          </div>
        )}
        <div {...provided.dragHandleProps} className="absolute top-0 bottom-9 w-6 flex items-center justify-center cursor-move opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-gray-100 to-transparent left-0" title="Arrastar para mover">
          <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" /></svg>
        </div>

        <div className="flex items-start justify-between mb-1.5">
          <div className={`flex-1 mr-2 overflow-hidden${orderIndex !== undefined ? ' pl-6' : ''}`}>
            {plano.empreendimento?.nome && (<p className="text-xs text-gray-500 mb-0.5 font-medium truncate">📋 {plano.empreendimento.nome}</p>)}
            <p className="font-medium text-gray-800 leading-tight truncate" title={displayName}>{displayName}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {plano.isQuickActivity && (<Badge variant="outline" className="px-1 py-0.5 text-xs bg-gray-100 text-gray-600 border-gray-300">Execução Rápida</Badge>)}
              {plano.tipo_planejamento === 'documento' && (<Badge variant="outline" className="px-1 py-0.5 text-xs bg-blue-100 text-blue-600 border-blue-300">Planejamento Doc.</Badge>)}
            </div>
          </div>
        </div>

        {plano.tipo_planejamento === 'documento' && plano.documento?.subdisciplinas?.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {plano.documento.subdisciplinas.map((sub, idx) => (<Badge key={idx} variant="outline" className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border-indigo-200">{sub}</Badge>))}
          </div>
        )}

        {subdisciplina && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <span className="text-blue-600 font-medium">{subdisciplina}</span>
          </div>
        )}

        {plano.tipo_planejamento !== 'documento' && documentoDisplay && (<p className="text-gray-600 font-mono mb-1.5 break-words">{documentoDisplay}</p>)}
        {plano.os && (<p className="text-blue-600 font-semibold text-xs mb-1.5">OS: {plano.os}</p>)}
        {observacao && (<div className="mt-1.5 p-2 bg-gray-50 border border-gray-200 rounded text-xs"><p className="text-gray-700 italic"><span className="font-semibold text-gray-600">💬 Obs:</span> {observacao}</p></div>)}

        <div className="flex gap-2 mt-2 items-center justify-between">
          <div className="flex gap-2 items-center">
            <button onClick={handleStartActivity} disabled={!!activeExecution || isStarting || isConcluded}
              className={`p-1.5 rounded-md transition-colors ${activeExecution?.planejamento_id === plano.id ? 'bg-yellow-500 animate-pulse' : realStatus === 'concluido' ? 'bg-green-500 cursor-not-allowed' : realStatus === 'concluido_com_atraso' ? 'bg-red-500 cursor-not-allowed' : (realStatus === 'atrasado' || realStatus === 'replanejado_atrasado') ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed'}`}>
              {activeExecution?.planejamento_id === plano.id ? <Clock className="w-3.5 h-3.5 text-white" /> : realStatus === 'concluido' ? <span className="text-white text-xs font-bold">✓</span> : realStatus === 'concluido_com_atraso' ? <span className="text-white text-xs font-bold">✓</span> : (realStatus === 'atrasado' || realStatus === 'replanejado_atrasado') ? <span className="text-white text-xs font-bold">✕</span> : <Play className="w-3.5 h-3.5 text-white" fill="white" />}
            </button>
            {canEditDelete && (
              <button onClick={handleDeleteActivity} disabled={isDeleting || !!activeExecution} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 transition-colors">
                {isDeleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              </button>
            )}
            {canEditDelete && (
              <button onClick={handleOpenEditDescricao} className="p-1.5 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors">
                <Edit2 className="w-3.5 h-3.5 text-gray-600" />
              </button>
            )}
            {plano.tipo_planejamento === 'documento' && plano.documento_id && (
              <button
                onClick={() => setShowAtividadesFolhaModal(true)}
                className="p-1.5 rounded-md border border-blue-300 bg-blue-50 hover:bg-blue-100 transition-colors"
                title="Ver atividades detalhadas desta folha"
              >
                <List className="w-3.5 h-3.5 text-blue-600" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {shouldShowAdjustButton() ? (
              <button onClick={() => { setAdjustedTime(tempoExecutado.toString()); setShowTimeAdjustModal(true); }} className="font-mono text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">
                <span className="font-semibold text-sm">{formatHours(horasAlocadasDia)}/{formatHours(horasExecutadasNoDia)}h{(plano.horas_por_dia && Object.keys(plano.horas_por_dia).length > 1 && Object.keys(plano.horas_por_dia).sort().indexOf(dayKey) < Object.keys(plano.horas_por_dia).length - 1) ? ' ...' : ''}</span>
              </button>
            ) : (
              <div className="font-mono text-blue-600">
                <span className="font-semibold text-sm">{formatHours(horasAlocadasDia)}/{formatHours(horasExecutadasNoDia)}h{(plano.horas_por_dia && Object.keys(plano.horas_por_dia).length > 1 && Object.keys(plano.horas_por_dia).sort().indexOf(dayKey) < Object.keys(plano.horas_por_dia).length - 1) ? ' ...' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showTimeAdjustModal} onOpenChange={setShowTimeAdjustModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar Tempo Executado</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-600"><strong>Atividade:</strong> {displayName}</p>
            <p className="text-sm text-gray-600">Tempo atual: {tempoExecutado.toFixed(1)}h</p>
            <div className="space-y-2">
              <Label htmlFor="adjustedTime">Novo Tempo (horas)</Label>
              <Input id="adjustedTime" type="number" step="0.1" min="0" value={adjustedTime} onChange={(e) => setAdjustedTime(e.target.value)} placeholder="Ex: 2.5" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3"><p className="text-blue-700 text-sm">A atividade será marcada como <strong>concluída</strong>.</p></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTimeAdjustModal(false)}>Cancelar</Button>
            <Button onClick={handleAdjustTime} className="bg-blue-600 hover:bg-blue-700">Ajustar e Finalizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AtividadesFolhaModal
        isOpen={showAtividadesFolhaModal}
        onClose={() => setShowAtividadesFolhaModal(false)}
        planejamentoDocumento={plano}
        executorMap={executorMap}
        allPlanejamentos={allPlanejamentos}
      />

      <Dialog open={showEditDescricaoModal} onOpenChange={setShowEditDescricaoModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Atividade</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-500"><strong>Atividade:</strong> {displayName}</p>
            <div className="space-y-2">
              <Label>Descrição / Título</Label>
              <Textarea value={editForm.descritivo || ''} onChange={(e) => setEditForm(f => ({ ...f, descritivo: e.target.value }))} rows={3} placeholder="Descrição..." />
            </div>
            <div className="space-y-2">
              <Label>Empreendimento</Label>
              <Select value={editForm.empreendimento_id || 'none'} onValueChange={(v) => setEditForm(f => ({ ...f, empreendimento_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {(allEmpreendimentos || []).sort((a,b) => (a.nome||'').localeCompare(b.nome||'')).map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.nome} - {emp.cliente}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tempo Planejado (h)</Label>
                <Input type="number" step="0.1" min="0" value={editForm.tempo_planejado || ''} onChange={(e) => setEditForm(f => ({ ...f, tempo_planejado: e.target.value }))} placeholder="Ex: 2.5" />
              </div>
              <div className="space-y-2">
                <Label>Executor Principal</Label>
                <Select value={editForm.executor_principal || 'none'} onValueChange={(v) => setEditForm(f => ({ ...f, executor_principal: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhum —</SelectItem>
                    {Object.values(executorMap || {}).map((u) => (<SelectItem key={u.id} value={String(u.id)}>{u.nome || u.email}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Início Planejado</Label>
                <Input type="date" value={editForm.inicio_planejado || ''} onChange={(e) => setEditForm(f => ({ ...f, inicio_planejado: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Término Planejado</Label>
                <Input type="date" value={editForm.termino_planejado || ''} onChange={(e) => setEditForm(f => ({ ...f, termino_planejado: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDescricaoModal(false)}>Cancelar</Button>
            <Button onClick={handleSaveDescricao} disabled={isEditLoading} className="bg-blue-600 hover:bg-blue-700">{isEditLoading ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}