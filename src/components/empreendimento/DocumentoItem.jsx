// @ts-nocheck
import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, Pencil, Trash2, Calendar, Loader2, X, CheckSquare, Check, Plus } from "lucide-react";
import { Documento, PlanejamentoAtividade } from "@/entities/all";
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
  localPlanejamentos,
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
  mediasDocumentos = [],
  mediasAtividades = [],
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [predecessoraFocused, setPredecessoraFocused] = useState(false);
  const [selectedAtivIds, setSelectedAtivIds] = useState(new Set());
  const [isConcluding, setIsConcluding] = useState(false);
  // Set of atividade IDs currently being concluded (for spinner UX)
  const [pendingAtivIds, setPendingAtivIds] = useState(new Set());

  // Register this item's loading setter so the parent can target only this item
  useEffect(() => {
    if (registerLoadingSetter) registerLoadingSetter(doc.id, setIsLoading);
    return () => { if (registerLoadingSetter) registerLoadingSetter(doc.id, null); };
  }, [doc.id, registerLoadingSetter]);

  // Set of atividade IDs that are concluded for this document.
  // All activity types (catalog and project) are tracked via planejamentos.atividade_id.
  const concludedAtivIdSet = useMemo(() => {
    const s = new Set();
    for (const p of (localPlanejamentos || [])) {
      if (p == null) continue;
      if (String(p.documento_id) === String(doc.id) && p.status === 'concluido') {
        if (p.atividade_id != null) s.add(String(p.atividade_id));
      }
    }
    return s;
  }, [localPlanejamentos, doc.id]);

  // Set of etapas concluded via planejamento_documentos for this document.
  // When a PlanejamentoDocumento is concluded, all activities of that etapa are considered done.
  const concludedEtapasSet = useMemo(() => {
    const s = new Set();
    for (const p of (localPlanejamentos || [])) {
      if (p == null) continue;
      if (String(p.documento_id) === String(doc.id) && p.tipo_plano === 'documento' && p.status === 'concluido' && p.etapa) {
        s.add(p.etapa);
      }
    }
    return s;
  }, [localPlanejamentos, doc.id]);

  // Set of atividade IDs that are planned (have a planejamento_atividades record) for this document.
  const plannedAtivIdSet = useMemo(() => {
    const s = new Set();
    for (const p of (localPlanejamentos || [])) {
      if (p == null) continue;
      if (String(p.documento_id) === String(doc.id) && p.tipo_plano === 'atividade') {
        if (p.atividade_id != null) s.add(String(p.atividade_id));
      }
    }
    return s;
  }, [localPlanejamentos, doc.id]);

  // Set of etapas covered by planejamento_documentos for this document.
  // Only activities whose etapa is in this set are shown as "Planejada".
  const plannedEtapasSet = useMemo(() => {
    const s = new Set();
    for (const p of (localPlanejamentos || [])) {
      if (p == null) continue;
      if (String(p.documento_id) === String(doc.id) && p.tipo_plano === 'documento' && p.etapa) {
        s.add(p.etapa);
      }
    }
    return s;
  }, [localPlanejamentos, doc.id]);

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

  const handleConcluirSelecionadas = async () => {
    if (selectedAtivIds.size === 0) return;
    setIsConcluding(true);
    const hoje = new Date().toISOString().slice(0, 10);
    try {
      const ops = [];
      for (const id of selectedAtivIds) {
        const ativ = atividadesDoc.find(a => a.id === id);
        if (!ativ) continue;
        // Unified: look up plan by atividade_id + documento_id for all activity types
        const existingPlan = (localPlanejamentos || []).find(
          p => p != null && String(p.atividade_id) === String(ativ.id) && String(p.documento_id) === String(doc.id)
        );
        if (existingPlan) {
          ops.push(
            PlanejamentoAtividade.update(existingPlan.id, { status: 'concluido', termino_real: hoje })
              .then(() => setLocalPlanejamentos(prev =>
                prev.map(p => p != null && p.id === existingPlan.id ? { ...p, status: 'concluido', termino_real: hoje } : p)
              ))
          );
        } else {
          ops.push(
            PlanejamentoAtividade.create({
              empreendimento_id: empreendimento.id,
              atividade_id: ativ.id,
              documento_id: doc.id,
              etapa: ativ.etapa,
              descritivo: ativ.atividade,
              tempo_planejado: ativ.tempo || 0,
              status: 'concluido',
              termino_real: hoje,
              horas_por_dia: {},
            }).then(created => {
              if (created) setLocalPlanejamentos(prev => [...prev, created]);
            })
          );
        }
      }
      await Promise.all(ops);
      setSelectedAtivIds(new Set());
    } catch {
      alert('Erro ao concluir atividades. Tente novamente.');
    } finally {
      setIsConcluding(false);
    }
  };

  const handleToggleConcluida = async (ativ) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const atividadeIdStr = String(ativ.id);
    // Unified: look up plan by atividade_id + documento_id for all activity types
    const existingPlan = (localPlanejamentos || []).find(
      p => p != null && String(p.atividade_id) === atividadeIdStr && String(p.documento_id) === String(doc.id)
    );
    const isConcluido = existingPlan?.status === 'concluido';

    if (existingPlan) {
      const novoStatus = isConcluido ? 'em_andamento' : 'concluido';
      try {
        await PlanejamentoAtividade.update(existingPlan.id, {
          status: novoStatus,
          termino_real: novoStatus === 'concluido' ? hoje : null,
        });
        setLocalPlanejamentos(prev =>
          prev.map(p => p != null && p.id === existingPlan.id
            ? { ...p, status: novoStatus, termino_real: novoStatus === 'concluido' ? hoje : null }
            : p)
        );
      } catch {
        alert('Erro ao atualizar status da atividade.');
      }
    } else {
      // No plan yet — create one as concluded
      setPendingAtivIds(prev => new Set([...prev, atividadeIdStr]));
      try {
        const created = await PlanejamentoAtividade.create({
          empreendimento_id: empreendimento.id,
          atividade_id: ativ.id,
          documento_id: doc.id,
          etapa: ativ.etapa,
          descritivo: ativ.atividade,
          tempo_planejado: ativ.tempo || 0,
          status: 'concluido',
          termino_real: hoje,
          horas_por_dia: {},
        });
        if (created) setLocalPlanejamentos(prev => [...prev, created]);
      } catch {
        alert('Erro ao concluir atividade.');
      } finally {
        setPendingAtivIds(prev => { const n = new Set(prev); n.delete(atividadeIdStr); return n; });
      }
    }
  };

  const handleDeleteAtividadeLocal = async (ativ) => {
    if (!ativ.empreendimento_id) return;
    if (!window.confirm(`Remover a atividade "${ativ.atividade}"?`)) return;
    // Find the associated plan (if any) and delete it
    const plan = (localPlanejamentos || []).find(
      p => p != null && String(p.atividade_id) === String(ativ.id) && String(p.documento_id) === String(doc.id)
    );
    try {
      if (plan) {
        await PlanejamentoAtividade.delete(plan.id);
        setLocalPlanejamentos(prev => prev.filter(p => p != null && p.id !== plan.id));
      }
    } catch {
      alert('Erro ao remover atividade.');
    }
  };

  const toggleAtivSelection = (id) => {
    setSelectedAtivIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
      const idAtivStr = String(pa.id_atividade);
      if (pa.tempo === -999) {
        if (pa.documento_id) {
          if (!excludedFromDocumentMap.has(idAtivStr)) excludedFromDocumentMap.set(idAtivStr, new Set());
          excludedFromDocumentMap.get(idAtivStr).add(String(pa.documento_id));
        } else {
          excludedActivitiesSet.add(idAtivStr);
        }
      } else {
        if (pa.documento_id) {
          overrideActivitiesByDocMap.set(`${pa.documento_id}|${idAtivStr}`, pa);
        } else {
          overrideActivitiesGlobalMap.set(idAtivStr, pa);
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
  // IDs de atividades genéricas que já têm override específico neste documento (evitar dupla contagem)
  const idsComOverrideNesteDoc = new Set(
    [...overrideActivitiesByDocMap.values()]
      .filter(pa => String(pa.documento_id) === String(doc.id) && pa.id_atividade)
      .map(pa => String(pa.id_atividade))
  );
  const atividadesCatalogo = [];
  if (subdisciplinasDoc.length > 0 && disciplinasDoc.length > 0) {
    allGenericActivitiesMap.forEach(baseAtividade => {
      if (baseAtividade.tempo === -999) return;
      const baseIdStr = String(baseAtividade.id);
      if (excludedActivitiesSet.has(baseIdStr)) return;
      if (excludedFromDocumentMap.has(baseIdStr) && excludedFromDocumentMap.get(baseIdStr).has(String(doc.id))) return;
      // Se há um override específico desta folha para esta atividade base, não incluir o catálogo (evita dupla contagem)
      if (idsComOverrideNesteDoc.has(baseIdStr)) return;
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

  // Update docFullyCompleted when the panel is open and all activities are concluded
  // When expanded, use the accurate atividadesDoc list.
  // When collapsed, use a lightweight discipline/subdiscipline count so the badge
  // shows correctly on page load without requiring the user to expand first.
  const docFullyCompleted = useMemo(() => {
    if (concludedAtivIdSet.size === 0 && concludedEtapasSet.size === 0) return false;

    const isAtvDone = (a) => concludedAtivIdSet.has(String(a.id)) || concludedEtapasSet.has(a.etapa);

    // Accurate path: row is expanded and we have the full activity list
    if (isExpanded && atividadesDoc.length > 0) {
      return atividadesDoc.every(isAtvDone);
    }

    // Lightweight path: count expected activities without expanding
    const disciplinasDoc = doc.disciplinas?.length > 0 ? doc.disciplinas : [doc.disciplina].filter(Boolean);
    const subdisciplinasDoc = doc.subdisciplinas || [];
    const idsSeen = new Set();

    // Project activities explicitly linked to this doc
    (allAtividades || []).forEach(a => {
      if (a.empreendimento_id == null || a.tempo === -999) return;
      const linked = (a.documento_id != null && String(a.documento_id) === String(doc.id)) ||
        (Array.isArray(a.documento_ids) && a.documento_ids.some(id => String(id) === String(doc.id)));
      if (linked) idsSeen.add(String(a.id));
    });
    (atividadesEmpCache || []).forEach(a => {
      if (a.tempo === -999) return;
      const linked = (a.documento_id != null && String(a.documento_id) === String(doc.id)) ||
        (Array.isArray(a.documento_ids) && a.documento_ids.some(id => String(id) === String(doc.id)));
      if (linked) idsSeen.add(String(a.id));
    });

    // Catalog activities matching discipline + subdiscipline
    if (subdisciplinasDoc.length > 0 && disciplinasDoc.length > 0) {
      (allAtividades || []).forEach(a => {
        if (a.empreendimento_id != null || a.tempo === -999) return;
        if (idsSeen.has(String(a.id))) return;
        if (disciplinasDoc.includes(a.disciplina) && subdisciplinasDoc.includes(a.subdisciplina)) {
          idsSeen.add(String(a.id));
        }
      });
    }

    const expectedCount = idsSeen.size;
    const concludedCount = [...idsSeen].filter(id => {
      if (concludedAtivIdSet.has(id)) return true;
      // Check etapa-based conclusion: find activity and check its etapa
      const allA = [...(allAtividades || []), ...(atividadesEmpCache || [])];
      const a = allA.find(x => String(x.id) === id);
      return a ? concludedEtapasSet.has(a.etapa) : false;
    }).length;
    return expectedCount > 0 && concludedCount >= expectedCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concludedAtivIdSet, concludedEtapasSet, isExpanded, atividadesDoc, allAtividades, atividadesEmpCache,
    doc.id, doc.disciplinas, doc.disciplina, doc.subdisciplinas]);

  const executorAtual = doc.executor_principal;
  const executorNome = (usuariosOrdenados || []).find(u => u.email === executorAtual)?.nome
    || executorAtual
    || '—';

  const predecessoraOptions = useMemo(() => {
    if (predecessoraFocused) {
      return (sortedDocOptionsList || [])
        .filter(d => d.id !== doc.id)
        .map(d => <option key={d.id} value={String(d.id)}>{d.label}</option>);
    }
    // Before focus: only render the currently selected option to avoid O(N²) DOM nodes
    if (!doc.predecessora_id) return [];
    const selected = (sortedDocOptionsList || []).find(d => String(d.id) === String(doc.predecessora_id));
    return selected ? [<option key={selected.id} value={String(selected.id)}>{selected.label}</option>] : [];
  }, [predecessoraFocused, sortedDocOptionsList, doc.id, doc.predecessora_id]);

  const campTempo = ETAPA_TEMPO_MAP[etapaParaPlanejamento];
  const tempoExibido = campTempo
    ? (doc[campTempo] ?? null)
    : doc.tempo_total;
  const tempoPre = Number(doc.tempo_pre) || 0;

  const mediaDoc = useMemo(() => {
    if (!mediasDocumentos.length) return null;
    const docIdNum = Number(doc.id);
    const comEtapa = etapaParaPlanejamento
      ? mediasDocumentos.find(m => Number(m.documento_id) === docIdNum && m.etapa === etapaParaPlanejamento)
      : null;
    if (comEtapa) return comEtapa;
    const semEtapa = mediasDocumentos.filter(m => Number(m.documento_id) === docIdNum);
    if (!semEtapa.length) return null;
    const totalExec = semEtapa.reduce((s, m) => s + Number(m.total), 0);
    const mediaGeral = semEtapa.reduce((s, m) => s + Number(m.media) * Number(m.total), 0) / totalExec;
    return { media: Math.round(mediaGeral * 10) / 10, total: totalExec, etapa: null };
  }, [mediasDocumentos, doc.id, etapaParaPlanejamento]);

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
      <tr className={`border-b transition-colors ${docFullyCompleted ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'}`}>
        <td className="w-[50px] p-3">
          {hasActivities && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleRow(doc.id)}>
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </td>

        <td className="p-3 text-sm font-medium">
          <div className="flex flex-col gap-1">
            <span>{doc.numero || '—'}</span>
            {docFullyCompleted && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 border border-green-300 rounded px-1.5 py-0.5 w-fit">
                ✓ Concluída
              </span>
            )}
          </div>
        </td>
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

            <td className="p-3 text-sm whitespace-nowrap">
              {tempoExibido != null ? formatHoras(tempoExibido) : '—'}
              {tempoPre > 0 && <span className="text-purple-600 ml-1 text-xs">(+{tempoPre}h PRE)</span>}
              {mediaDoc && (
                <span
                  className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium"
                  title={`Média histórica de ${mediaDoc.total} execução${mediaDoc.total === 1 ? '' : 'ões'}${mediaDoc.etapa ? ` na etapa ${mediaDoc.etapa}` : ''}`}
                >
                  ⌀ {mediaDoc.media}h
                </span>
              )}
            </td>

            <td className="p-3 w-[130px]">
              <div className="flex flex-col gap-1">
                <select
                  value={doc.predecessora_id ? String(doc.predecessora_id) : ''}
                  onChange={(e) => handlePredecessoraChange(doc.id, e.target.value || null)}
                  onFocus={() => setPredecessoraFocused(true)}
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

      {isExpanded && (() => {
        // isConcluido: check concludedAtivIdSet which is derived from persisted localPlanejamentos
        const isAtivConcluida = (a) => concludedAtivIdSet.has(String(a.id)) || concludedEtapasSet.has(a.etapa);
        const isAtivPlanejada = (a) =>
          !concludedAtivIdSet.has(String(a.id)) && (
            plannedAtivIdSet.has(String(a.id)) ||
            plannedEtapasSet.has(a.etapa)
          );

        const selectableAtivs = atividadesDoc.filter(a => !isAtivConcluida(a));
        const allSelected = selectableAtivs.length > 0 && selectableAtivs.every(a => selectedAtivIds.has(a.id));
        const someSelected = selectedAtivIds.size > 0;
        const totalTempo = atividadesDoc.reduce((sum, a) => sum + (a.tempo || 0), 0);
        const planejadas = atividadesDoc.filter(a => isAtivPlanejada(a)).length;

        return (
          <tr>
            <td colSpan={99} className="p-0 bg-gray-50 border-b">
              <div className="mx-4 my-3 bg-white border border-gray-200 rounded-lg shadow-sm">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">
                      Atividades da Folha: <span className="text-blue-600">{doc.numero}</span>
                    </span>
                    {!readOnly && selectableAtivs.length > 0 && (
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() => {
                            if (allSelected) {
                              setSelectedAtivIds(prev => { const n = new Set(prev); selectableAtivs.forEach(a => n.delete(a.id)); return n; });
                            } else {
                              setSelectedAtivIds(prev => { const n = new Set(prev); selectableAtivs.forEach(a => n.add(a.id)); return n; });
                            }
                          }}
                          className="h-3.5 w-3.5 accent-blue-600"
                        />
                        Selecionar todos
                      </label>
                    )}
                    {!readOnly && someSelected && (
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white flex items-center gap-1"
                        onClick={handleConcluirSelecionadas}
                        disabled={isConcluding}
                      >
                        {isConcluding ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckSquare className="w-3 h-3" />}
                        Concluir selecionadas ({selectedAtivIds.size})
                      </Button>
                    )}
                  </div>
                  {!readOnly && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                      onClick={() => handleEditAtividade(null)}
                    >
                      <Plus className="w-3 h-3" /> Nova Atividade
                    </Button>
                  )}
                </div>

                {/* Activity list */}
                <div className="divide-y divide-gray-100">
                  {atividadesDoc.map(ativ => {
                    const isSelectable = !readOnly;
                    const isConcluido = isAtivConcluida(ativ);
                    const isConcluidoByExecutor = !concludedAtivIdSet.has(String(ativ.id)) && concludedEtapasSet.has(ativ.etapa);
                    const isPlanejada = !isConcluido && isAtivPlanejada(ativ);
                    const isCatalog = ativ.empreendimento_id == null;
                    const isPending = pendingAtivIds.has(String(ativ.id));
                    return (
                      <div key={ativ.id} className={`flex items-center gap-3 px-4 py-2.5 ${isConcluido ? 'bg-green-50/50' : isPlanejada ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                        {/* Checkbox */}
                        <div className="w-5 flex-shrink-0 flex justify-center">
                          {isSelectable && !isConcluido ? (
                            <input
                              type="checkbox"
                              checked={selectedAtivIds.has(ativ.id)}
                              onChange={() => toggleAtivSelection(ativ.id)}
                              className="h-4 w-4 accent-blue-600"
                            />
                          ) : <span className="w-4" />}
                        </div>

                        {/* Name + badge + subtitle */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${isConcluido ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                              {ativ.atividade || '—'}
                            </span>
                            {isConcluido && (
                              <span className="inline-flex items-center text-xs bg-gray-100 text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
                                {isConcluidoByExecutor ? 'Concluída pelo Executor' : 'Concluída Manualmente'}
                              </span>
                            )}
                            {isPlanejada && (
                              <span className="inline-flex items-center text-xs bg-blue-100 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
                                Planejada
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {[ativ.etapa, ativ.subdisciplina].filter(Boolean).join(' • ')}
                          </div>
                        </div>

                        {/* Right side */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className={`text-sm font-medium ${isConcluido ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {ativ.tempo ? formatHoras(ativ.tempo) : '—'}
                            </div>
                            {(() => {
                              const mediaAtiv = mediasAtividades.find(m => Number(m.atividade_id) === Number(ativ.id));
                              return mediaAtiv ? (
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium"
                                  title={`Média histórica de ${mediaAtiv.total} execução${mediaAtiv.total === 1 ? '' : 'ões'}`}
                                >
                                  ⌀ {mediaAtiv.media}h
                                </span>
                              ) : null;
                            })()}
                            {isConcluido && (
                              <div className="text-xs text-gray-400">{isConcluidoByExecutor ? 'Concluída pelo executor' : 'Concluída manualmente'}</div>
                            )}
                          </div>
                          {!readOnly && (
                            <div className="flex items-center gap-1">
                              {/* Toggle conclude button */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${isConcluido ? 'text-green-600 hover:text-green-800' : 'text-gray-400 hover:text-green-600'} hover:bg-green-50`}
                                title={isConcluido ? 'Desfazer conclusão' : 'Marcar como concluída'}
                                onClick={() => handleToggleConcluida(ativ)}
                                disabled={isPending}
                              >
                                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                              </Button>
                              {/* Delete only for project activities (empreendimento_id set) */}
                              {!isCatalog && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                  title="Remover atividade"
                                  onClick={() => handleDeleteAtividadeLocal(ativ)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {/* Edit for project activities */}
                              {!isCatalog && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-blue-500 hover:text-blue-700"
                                  title="Editar atividade"
                                  onClick={() => handleEditAtividade(ativ)}
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {atividadesDoc.length === 0 && (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma atividade encontrada</div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50 rounded-b-lg text-xs text-gray-500">
                  <span>Total: <strong className="text-gray-700">{atividadesDoc.length}</strong> atividades | Planejadas: <strong className="text-gray-700">{planejadas}</strong></span>
                  <span>Tempo total: <strong className="text-gray-700">{totalTempo > 0 ? formatHoras(totalTempo) : '—'}</strong></span>
                </div>
              </div>
            </td>
          </tr>
        );
      })()}

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