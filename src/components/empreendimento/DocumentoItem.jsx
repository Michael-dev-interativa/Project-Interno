// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, Pencil, Trash2, Calendar, Loader2, X } from "lucide-react";
import { Documento } from "@/entities/all";
import { format, parseISO, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatHoras } from '../utils/formatHours';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const parsed = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    return isValid(parsed) ? format(parsed, 'dd/MM/yy') : '—';
  } catch {
    return '—';
  }
};

const ETAPA_TEMPO_MAP = {
  'Concepção': 'tempo_concepcao',
  'Planejamento': 'tempo_planejamento',
  'Estudo Preliminar': 'tempo_estudo_preliminar',
  'Ante-Projeto': 'tempo_ante_projeto',
  'Projeto Básico': 'tempo_projeto_basico',
  'Projeto Executivo': 'tempo_projeto_executivo',
  'Liberado para Obra': 'tempo_liberado_obra',
};

function DocumentoItem({
  doc,
  isExpanded,
  hasActivities,
  allAtividades,
  handleEdit,
  handleDelete,
  handleOpenDocEtapaModal,
  handlePredecessoraChange,
  handleDataInicioChange,
  etapaParaPlanejamento,
  empreendimento,
  onUpdate,
  readOnly,
  // sharedProps
  localDocumentos,
  setLocalPlanejamentos,
  handleLocalUpdate,
  setCargaDiariaCache,
  getCargaDiariaExecutor,
  handleCascadingUpdate,
  autoPlanejarAtividades,
  toggleRow,
  usuariosOrdenados,
  pavimentos,
  handleEditAtividade,
  atividadesEmpCache,
  setExecutorPreSelecionado,
  handleRemoveExecutor,
  registerLoadingSetter,
  sortedDocOptionsList,
}) {
  const [isLoading, setIsLoading] = useState(false);

  // Register this item's loading setter so the parent can target only this item
  useEffect(() => {
    if (registerLoadingSetter) registerLoadingSetter(doc.id, setIsLoading);
    return () => { if (registerLoadingSetter) registerLoadingSetter(doc.id, null); };
  }, [doc.id, registerLoadingSetter]);

  // Estado do mini-modal de data
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [pendingExecutor, setPendingExecutor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleExecutorSelected = (executorEmail) => {
    if (!etapaParaPlanejamento || etapaParaPlanejamento === 'todas') {
      if (setExecutorPreSelecionado) setExecutorPreSelecionado(executorEmail);
      handleOpenDocEtapaModal(doc);
    } else if (selectedDate) {
      // Data já foi escolhida no campo Início — planeja direto com a data manual
      const dataStr = format(selectedDate, 'yyyy-MM-dd');
      autoPlanejarAtividades(doc, etapaParaPlanejamento, executorEmail, 'manual', dataStr);
    } else {
      // Abre modal; se há predecessora, pré-preenche o calendário com o dia seguinte ao término dela
      if (doc.predecessora_id) {
        const predecessora = (localDocumentos || []).find(d => String(d.id) === String(doc.predecessora_id));
        if (predecessora?.termino_planejado) {
          try {
            const terminoPred = parseISO(predecessora.termino_planejado);
            if (isValid(terminoPred)) setSelectedDate(addDays(terminoPred, 1));
          } catch {}
        }
      }
      setPendingExecutor(executorEmail);
      setDateModalOpen(true);
    }
  };

  const handleConfirmarAgenda = () => {
    if (!pendingExecutor) return;
    setDateModalOpen(false);
    autoPlanejarAtividades(doc, etapaParaPlanejamento, pendingExecutor, 'agenda', null);
    setPendingExecutor(null);
  };

  const handleConfirmarData = () => {
    if (!pendingExecutor || !selectedDate) return;
    setDateModalOpen(false);
    const dataStr = format(selectedDate, 'yyyy-MM-dd');
    autoPlanejarAtividades(doc, etapaParaPlanejamento, pendingExecutor, 'manual', dataStr);
    setPendingExecutor(null);
  };

  // Replicar exata lógica do AnaliticoGlobalTab para garantir atividades idênticas
  // Helper: verifica se atividade está vinculada a este documento (singular OU array, com coerção de tipo)
  const vinculadaAoDoc = (pa) => {
    const temSingular = pa.documento_id != null && String(pa.documento_id) === String(doc.id);
    const temArray = Array.isArray(pa.documento_ids) && pa.documento_ids.some(id => String(id) === String(doc.id));
    return temSingular || temArray;
  };

  // Cheap check: used only for showing the expand button — pre-computed by parent.
  // (hasActivities prop replaces the useMemo that scanned allAtividades for each item)

  // Full computation: only runs when the row is expanded to avoid freezing on bulk mount.
  const { atividadesDoc, atividadesDocAll } = useMemo(() => {
  if (!isExpanded) return { atividadesDoc: [], atividadesDocAll: [] };
  // 1. Separar genéricas das específicas do projeto
  const allGenericActivitiesMap = new Map(
    (allAtividades || []).filter(a => !a.empreendimento_id).map(a => [a.id, a])
  );
  const projectActivities = (allAtividades || []).filter(a => a.empreendimento_id != null);

  // 2. Processar overrides e exclusões do projeto (id_atividade set)
  const overrideActivitiesGlobalMap = new Map();
  const overrideActivitiesByDocMap = new Map();
  const excludedActivitiesSet = new Set();
  const excludedFromDocumentMap = new Map();
  projectActivities.forEach(pa => {
    if (pa.id_atividade) {
      if (pa.tempo === -999) {
        if (pa.documento_id) {
          if (!excludedFromDocumentMap.has(pa.id_atividade)) excludedFromDocumentMap.set(pa.id_atividade, new Set());
          excludedFromDocumentMap.get(pa.id_atividade).add(String(pa.documento_id));
        } else {
          excludedActivitiesSet.add(pa.id_atividade);
        }
      } else {
        if (pa.documento_id) {
          overrideActivitiesByDocMap.set(`${pa.documento_id}|${pa.id_atividade}`, pa);
        } else {
          overrideActivitiesGlobalMap.set(pa.id_atividade, pa);
        }
      }
    }
  });

  // 3a. Atividades vinculadas via allAtividades (mesmo critério do AnaliticoGlobalTab)
  // Inclui tanto atividades novas (id_atividade=null) como instâncias de projeto (id_atividade setado)
  const atividadesVinculadasAll = projectActivities.filter(pa =>
    pa.tempo !== -999 && vinculadaAoDoc(pa)
  );

  // 3b. Atividades vinculadas via atividadesEmpCache (fonte separada e possivelmente mais atualizada)
  // Inclui tanto atividades novas (id_atividade=null) como instâncias de projeto (id_atividade setado)
  const atividadesVinculadasEmp = (atividadesEmpCache || []).filter(pa =>
    pa.tempo !== -999 && vinculadaAoDoc(pa)
  );

  // 4. Atividades do catálogo genérico que combinam disciplina E subdisciplina (igual AnaliticoGlobalTab)
  // Nota: Só inclui atividades genéricas (sem empreendimento_id), não sobrescritas por projeto
  const disciplinasDoc = doc.disciplinas?.length > 0 ? doc.disciplinas : [doc.disciplina].filter(Boolean);
  const subdisciplinasDoc = doc.subdisciplinas || [];
  const atividadesCatalogo = [];
  if (subdisciplinasDoc.length > 0 && disciplinasDoc.length > 0) {
    allGenericActivitiesMap.forEach(baseAtividade => {
      if (baseAtividade.tempo === -999) return;
      if (excludedActivitiesSet.has(baseAtividade.id)) return;
      if (excludedFromDocumentMap.has(baseAtividade.id) && excludedFromDocumentMap.get(baseAtividade.id).has(String(doc.id))) return;
      const disciplinaMatch = disciplinasDoc.includes(baseAtividade.disciplina);
      const subdisciplinaMatch = subdisciplinasDoc.includes(baseAtividade.subdisciplina);
      if (disciplinaMatch && subdisciplinaMatch) {
        atividadesCatalogo.push(baseAtividade);
      }
    });
  }

  // 5. Atividades do projeto SEM link de documento mas com disciplina/subdisciplina compatível
  // (equivalente às normalizedProjectActivities do AnaliticoGlobalTab — exibidas no painel global lá,
  //  mostradas aqui nos documentos com disciplina/subdisciplina correspondente)
  // Nota: Atividades COM id_atividade já foram capturadas em atividadesVinculadas*
  //       Aqui capturamos atividades novas do projeto (id_atividade=null) que combinam com doc
  const atividadesProjetoMatch = subdisciplinasDoc.length > 0 ? projectActivities.filter(pa => {
    if (pa.tempo === -999) return false;
    // Ignorar as que já têm link explícito com algum documento (tratadas em atividadesVinculadas)
    if (pa.documento_id != null || (Array.isArray(pa.documento_ids) && pa.documento_ids.length > 0)) return false;
    // Ignorar atividades que são overrides de base activities (têm id_atividade apontando para ID base)
    // Essas vêm de atividades_empreendimento e já foram capturadas em atividadesVinculadas
    if (pa.id_atividade) return false;
    const subdisciplinaMatch = subdisciplinasDoc.includes(pa.subdisciplina);
    if (!subdisciplinaMatch) return false;
    if (disciplinasDoc.length === 0) return true;
    return disciplinasDoc.includes(pa.disciplina);
  }) : [];

  // 6. Mesclar todas as fontes sem duplicatas
  const idsSeen = new Set();
  const _atividadesDocAll = [...atividadesVinculadasAll, ...atividadesVinculadasEmp, ...atividadesCatalogo, ...atividadesProjetoMatch].filter(a => {
    if (idsSeen.has(a.id)) return false;
    idsSeen.add(a.id);
    return true;
  });

  // 7. Filtrar por etapa selecionada (quando não é "todas")
  const etapaFiltro = etapaParaPlanejamento && etapaParaPlanejamento !== 'todas' ? etapaParaPlanejamento : null;
  const _atividadesDoc = etapaFiltro
    ? _atividadesDocAll.filter(a => a.etapa === etapaFiltro)
    : _atividadesDocAll;

  return { atividadesDoc: _atividadesDoc, atividadesDocAll: _atividadesDocAll };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, allAtividades, atividadesEmpCache, doc.id, doc.disciplinas, doc.disciplina, doc.subdisciplinas, etapaParaPlanejamento]);

  const executorAtual = doc.executor_principal;
  const executorNome = (usuariosOrdenados || []).find(u => u.email === executorAtual)?.nome
    || executorAtual
    || '—';

  const predecessoraOptions = useMemo(() =>
    (sortedDocOptionsList || [])
      .filter(d => d.id !== doc.id)
      .map(d => (
        <option key={d.id} value={String(d.id)}>
          {d.label}
        </option>
      )),
    [sortedDocOptionsList, doc.id]
  );

  const campTempo = ETAPA_TEMPO_MAP[etapaParaPlanejamento];
  const tempoExibido = campTempo
    ? (doc[campTempo] ?? null)
    : doc.tempo_total;

  const handleRecalcularHoras = async () => {
    setIsRecalculating(true);
    try {
      const etapaTotais = {};
      let total = 0;
      atividadesDocAll.forEach(a => {
        if (!a.tempo || a.tempo <= 0) return;
        total += a.tempo;
        const campo = ETAPA_TEMPO_MAP[a.etapa];
        if (campo) {
          etapaTotais[campo] = (etapaTotais[campo] || 0) + a.tempo;
        } else {
          etapaTotais['tempo_execucao_total'] = (etapaTotais['tempo_execucao_total'] || 0) + a.tempo;
        }
      });
      const updated = await Documento.update(doc.id, { tempo_total: total, ...etapaTotais });
      handleLocalUpdate(updated);
    } catch (e) {
      alert('Erro ao recalcular horas.');
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <>
      <tr className="border-b hover:bg-gray-50 transition-colors">
        <td className="w-[50px] p-3">
          {hasActivities && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleRow(doc.id)}>
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </td>

        <td className="p-3 text-sm font-medium">{doc.numero || '—'}</td>
        <td className="p-3 text-sm">{doc.arquivo || '—'}</td>
        <td className="p-3 text-sm text-gray-600">{doc.descritivo || '—'}</td>
        <td className="p-3 text-sm">
          {(doc.subdisciplinas || []).length > 0 ? doc.subdisciplinas.join(', ') : '—'}
        </td>
        <td className="p-3 text-sm">{doc.escala || '—'}</td>

        {!readOnly && (
          <>
        <td className="p-3 text-sm">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          ) : executorAtual ? (
            <div className="flex items-center gap-1">
              <span className="text-sm truncate max-w-[110px]" title={executorNome}>{executorNome}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleRemoveExecutor && handleRemoveExecutor(doc)}
                title="Remover executor"
              >
                <X className="w-3 h-3" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleOpenDocEtapaModal(doc)}
                title="Definir executor por etapa"
              >
                <Calendar className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Select onValueChange={handleExecutorSelected}>
                <SelectTrigger className="w-[150px] h-7 text-xs border-blue-400 text-blue-600 hover:bg-blue-50">
                  <SelectValue placeholder="Selecionar Executor" />
                </SelectTrigger>
                <SelectContent>
                  {(usuariosOrdenados || [])
                    .map(u => (
                      <SelectItem key={u.email} value={u.email} className="text-xs">
                        {u.nome || u.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => handleOpenDocEtapaModal(doc)}
                title="Planejar por etapa"
              >
                <Calendar className="w-3 h-3" />
              </Button>
            </div>
          )}
        </td>

            <td className="p-3 text-sm">
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-500 w-9">Início:</span>
                  {doc.inicio_planejado ? (
                    <span className="text-gray-700">{formatDate(doc.inicio_planejado)}</span>
                  ) : (
                    <input
                      type="date"
                      className="h-6 text-xs border border-gray-300 rounded px-1 text-gray-700 focus:border-blue-400 focus:outline-none"
                      value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : ''}
                      onChange={e => {
                        const val = e.target.value;
                        setSelectedDate(val ? new Date(val + 'T12:00:00') : null);
                      }}
                      title="Data de início para planejamento"
                    />
                  )}
                </div>
                <div className="text-gray-500">
                  <span className="font-medium">Fim:</span> {formatDate(doc.termino_planejado)}
                </div>
              </div>
            </td>

            <td className="p-3 text-sm">
              {tempoExibido != null ? formatHoras(tempoExibido) : '—'}
            </td>

            <td className="p-3 w-[130px]">
              <div className="flex flex-col gap-1">
                <select
                  value={doc.predecessora_id ? String(doc.predecessora_id) : ''}
                  onChange={(e) => handlePredecessoraChange(doc.id, e.target.value || null)}
                  className="h-7 w-full text-xs border border-gray-300 rounded px-1 bg-white text-gray-700 focus:border-blue-400 focus:outline-none cursor-pointer"
                >
                  <option value="">Predecessora</option>
                  {predecessoraOptions}
                </select>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                    onClick={() => handleEdit(doc)}
                    title="Editar documento"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600 hover:text-red-800 hover:bg-red-50"
                    onClick={() => handleDelete(doc.id)}
                    title="Excluir documento"
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </td>
          </>
        )}
      </tr>

      {isExpanded && atividadesDoc.map(ativ => (
        <tr key={ativ.id} className="bg-blue-50 border-b text-sm">
          <td className="p-2 pl-8" colSpan={2}></td>
          <td className="p-2 text-gray-700 font-medium" colSpan={2}>{ativ.atividade || '—'}</td>
          <td className="p-2 text-gray-500">{ativ.subdisciplina || '—'}</td>
          <td className="p-2 text-gray-500">{ativ.escala || '—'}</td>
          {!readOnly && (
            <>
              <td className="p-2 text-gray-500">{ativ.executor_principal || '—'}</td>
              <td className="p-2 text-xs text-gray-500">
                <div>Início: {formatDate(ativ.inicio_planejado)}</div>
                <div>Fim: {formatDate(ativ.termino_planejado)}</div>
              </td>
              <td className="p-2 text-gray-500">{ativ.tempo ? formatHoras(ativ.tempo) : '—'}</td>
              <td className="p-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-blue-600"
                  onClick={() => handleEditAtividade(ativ)}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              </td>
            </>
          )}
        </tr>
      ))}

      {/* Modal de seleção de data para planejamento */}
      <Dialog open={dateModalOpen} onOpenChange={(open) => { if (!open) { setDateModalOpen(false); setPendingExecutor(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calendar className="w-4 h-4 text-blue-600" />
              Quando planejar esta folha?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-gray-500">
              Escolha uma data de início específica ou use a agenda do executor para encontrar o próximo dia disponível.
            </p>
            <div className="flex justify-center">
              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                className="rounded-md border"
              />
            </div>
            {selectedDate && (
              <p className="text-xs text-center text-blue-700 font-medium">
                Início selecionado: {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="flex-1 text-xs" onClick={handleConfirmarAgenda}>
              Usar agenda do executor
            </Button>
            <Button className="flex-1 text-xs" onClick={handleConfirmarData} disabled={!selectedDate}>
              {selectedDate ? `Iniciar em ${format(selectedDate, "dd/MM", { locale: ptBR })}` : 'Selecione uma data'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default React.memo(DocumentoItem);