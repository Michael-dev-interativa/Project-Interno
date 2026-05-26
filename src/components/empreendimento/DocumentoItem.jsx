// @ts-nocheck
import React, { useMemo, useState, useContext, useEffect } from "react";
import { Atividade, PlanejamentoAtividade, PlanejamentoDocumento, Documento } from "@/entities/all";
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit, Trash2, ChevronDown, ChevronRight, CalendarDays, FileText, Loader2, Users2, Check, CheckCircle2 } from "lucide-react";
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';
import { distribuirHorasPorDias, isWorkingDay, calculateEndDate, ensureWorkingDay } from '../utils/DateCalculator';
import { format, isValid, parseISO, addDays } from 'date-fns';
import { retryWithBackoff, retryWithExtendedBackoff } from '../utils/apiUtils';

const parseDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  return new Date(`${dateString}T00:00:00`);
};

const ordenarAtividades = (atividades) => {
  return [...atividades].sort((a, b) => {
    const indexA = ETAPAS_ORDER.indexOf(a.etapa);
    const indexB = ETAPAS_ORDER.indexOf(b.etapa);
    if (indexA !== indexB) {
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    }
    return String(a.id).localeCompare(String(b.id));
  });
};

export default function DocumentoItem({
  doc,
  planejamentos,
  allAtividades,
  handleEdit,
  handleDelete,
  handleOpenDocEtapaModal,
  handlePredecessoraChange,
  handleDataInicioChange,
  etapaParaPlanejamento,
  loadingDocs,
  empreendimento,
  onUpdate,
  readOnly,
  // shared state from parent
  localDocumentos,
  localPlanejamentos,
  setLocalPlanejamentos,
  handleLocalUpdate,
  setCargaDiariaCache,
  getCargaDiariaExecutor,
  handleCascadingUpdate,
  autoPlanejarAtividades,
  expandedRows,
  toggleRow,
  usuariosOrdenados,
  pavimentos,
  handleEditAtividade,
  atividadesEmpCache = [],
  mediasDocumentos = [],
  mediasAtividades = [],
}) {
  const [isUpdatingActivity, setIsUpdatingActivity] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const isDocLoading = loadingDocs[doc.id] || false;

  // atividadesEmpCache é recebido do pai (DocumentosTab) para evitar N requisições individuais

  const [searchPredecessor, setSearchPredecessor] = useState('');
  const [selectedAtividades, setSelectedAtividades] = useState(() => []);

  // Resetar seleção ao mudar de documento
  useEffect(() => {
    setSelectedAtividades([]);
  }, [doc.id]);

  const [showExecutorDialog, setShowExecutorDialog] = useState(false);
  const [pendingExecutor, setPendingExecutor] = useState(null);

  const planejamentosDoDocumento = useMemo(() => {
    return localPlanejamentos.filter(p => p.documento_id === doc.id);
  }, [localPlanejamentos, doc.id]);

  // Mapear etapa do catálogo para etapa do empreendimento (sem remapear para a etapa selecionada)
  const mapearEtapaEmp = useMemo(() => {
    return (etapaAtividade) => etapaAtividade;
  }, []);

  const atividadesDisponiveis = useMemo(() => {
    const subdisciplinasDoc = doc.subdisciplinas || [];
    const disciplinaDoc = doc.disciplina || (Array.isArray(doc.disciplinas) && doc.disciplinas.length > 0 ? doc.disciplinas[0] : null);

    const etapaOverrides = new Map();
    const tempoOverrides = new Map();

    allAtividades.forEach(ativ => {
      if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade && ativ.tempo !== -999) {
        etapaOverrides.set(ativ.id_atividade, ativ.etapa);
        etapaOverrides.set(ativ.id, ativ.etapa);
        tempoOverrides.set(ativ.id_atividade, ativ.tempo);
        tempoOverrides.set(ativ.id, ativ.tempo);
      }
    });

    // Coletar IDs de atividades genéricas que têm override específico nesta folha
    // Excluir marcadores de conclusão (tempo === 0) pois não devem suprimir a atividade original
    const idsComOverrideEspecifico = new Set();
    allAtividades.forEach(ativ => {
      if (
        ativ.empreendimento_id === empreendimento.id &&
        ativ.documento_id === doc.id &&
        ativ.id_atividade &&
        ativ.tempo !== -999 &&
        ativ.tempo !== 0  // marcadores de conclusão não suprimem a atividade genérica
      ) {
        idsComOverrideEspecifico.add(ativ.id_atividade);
      }
    });

    let atividadesGerais = allAtividades.filter(ativ => {
      if (!ativ.empreendimento_id) {
        // Incluir atividade genérica apenas se não houver override específico para esta folha
        if (idsComOverrideEspecifico.has(ativ.id)) return false;
        return ativ.disciplina === disciplinaDoc &&
          Array.isArray(subdisciplinasDoc) && subdisciplinasDoc.includes(ativ.subdisciplina);
      }
      if (ativ.empreendimento_id === empreendimento.id && ativ.documento_id === doc.id && ativ.tempo !== -999) {
        if (ativ.tempo === 0 && String(ativ.atividade || '').includes('Concluída na folha')) return false; // marcador interno, não exibir
        if (ativ.tempo === -999) return false;
        return true;
      }
      return false;
    });

    const atividadesExcluidasGlobal = new Set();
    const atividadesExcluidasPorDoc = new Set();
    const atividadesConcluidasPorDoc = new Set();

    allAtividades.forEach(ativ => {
      if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade) {
        if (ativ.tempo === -999) {
          if (ativ.documento_id === doc.id) atividadesExcluidasPorDoc.add(ativ.id_atividade);
          else if (!ativ.documento_id) atividadesExcluidasGlobal.add(ativ.id_atividade);
        } else if (ativ.tempo === 0 && ativ.documento_id === doc.id && String(ativ.atividade || '').includes('Concluída na folha')) {
          atividadesConcluidasPorDoc.add(ativ.id_atividade);
        }
      }
    });

    atividadesGerais = atividadesGerais.filter(ativ =>
      !atividadesExcluidasGlobal.has(ativ.id) &&
      !atividadesExcluidasPorDoc.has(ativ.id)
      // Atividades concluídas (atividadesConcluidasPorDoc) devem CONTINUAR aparecendo
    );

    const pavimento = (pavimentos || []).find(p => p.id === doc.pavimento_id);
    const areaPavimento = pavimento ? Number(pavimento.area) : null;

    if (etapaParaPlanejamento !== 'todas') {
      atividadesGerais = atividadesGerais.filter(ativ => {
        const etapaBase = etapaOverrides.has(ativ.id) ? etapaOverrides.get(ativ.id) : ativ.etapa;
        return (etapaBase || '').toLowerCase() === (etapaParaPlanejamento || '').toLowerCase();
      });
    }

    return ordenarAtividades(atividadesGerais).map(atividade => {
      const nomeAtividadeSeguro = String(atividade.atividade || '');
      const etapaBase = etapaOverrides.has(atividade.id) ? etapaOverrides.get(atividade.id) : atividade.etapa;
      const etapaFinal = mapearEtapaEmp(etapaBase);
      const estaConcluida = atividadesConcluidasPorDoc.has(atividade.id);
      const tempoBaseOriginal = parseFloat(atividade.tempo) || 0;

      let tempoBase;
      if (estaConcluida) tempoBase = 0;
      else if (tempoOverrides.has(atividade.id)) tempoBase = parseFloat(tempoOverrides.get(atividade.id)) || 0;
      else tempoBase = tempoBaseOriginal;

      const planejamentoAtividade = planejamentosDoDocumento.find(p =>
        p.atividade_id === atividade.id && p.documento_id === doc.id &&
        (p.tipo_plano === 'atividade' || !p.tipo_plano)
      );
      const planejamentoDocDaEtapa = planejamentosDoDocumento.find(p => p.etapa === etapaFinal && p.tipo_plano === 'documento');

      // Verificar registro em AtividadesEmpreendimento (novo fluxo)
      const atividadeEmpRecord = atividadesEmpCache.find(ae =>
        ae.documento_id === doc.id &&
        (ae.atividade_id === atividade.id || ae.id_atividade === atividade.id_atividade || ae.id_atividade === atividade.id) &&
        ae.etapa === etapaFinal
      );

      const jaFoiPlanejada = !!planejamentoDocDaEtapa || !!planejamentoAtividade || !!atividadeEmpRecord || atividade.status_planejamento === 'planejada';

      // Status: priorizar AtividadesEmpreendimento, depois PlanejamentoAtividade, depois PlanejamentoDocumento
      const statusExecucaoMap = { 'em_andamento': 'em_andamento', 'pausada': 'pausado', 'concluida': 'concluido', 'nao_iniciada': 'nao_iniciado' };
      const statusDeExecucao = atividadeEmpRecord?.status_execucao ? statusExecucaoMap[atividadeEmpRecord.status_execucao] : null;
      const statusPlanejamento = statusDeExecucao || planejamentoAtividade?.status || (jaFoiPlanejada ? (planejamentoDocDaEtapa?.status || 'nao_iniciado') : null);

      // Se existe registro em AtividadesEmpreendimento com tempo válido, usar esse tempo (já é o tempo final correto)
      const tempoDoEmpRecord = atividadeEmpRecord && typeof atividadeEmpRecord.tempo === 'number' && atividadeEmpRecord.tempo > 0
        ? atividadeEmpRecord.tempo
        : null;

      const fatorDificuldade = doc.fator_dificuldade || 1;
      const isConfeccaoA = nomeAtividadeSeguro.trim().startsWith('Confecção de A-');
      const multiplier = isConfeccaoA ? 1 : fatorDificuldade;
      // Se estaConcluida, ainda mostra o tempo original (não zerado)
      const tempoParaCalculo = estaConcluida ? tempoBaseOriginal : tempoBase;
      // Priorizar tempo do AtividadesEmpreendimento (tempo base sem fator) se disponível
      const tempoComFator = tempoDoEmpRecord !== null
        ? tempoDoEmpRecord * multiplier
        : tempoParaCalculo * multiplier;
      const tempoBaseParaExibicao = tempoBaseOriginal;

      return {
        ...atividade,
        etapa: etapaFinal,
        tempoComFator,
        tempoBase,
        tempoBaseParaExibicao,
        area: areaPavimento,
        jaFoiPlanejada,
        estaConcluida,
        statusPlanejamento,
        planejamentoId: planejamentoAtividade?.id || planejamentoDocDaEtapa?.id,
        atividadeEmpId: atividadeEmpRecord?.id
      };
    });
  }, [allAtividades, doc, planejamentosDoDocumento, etapaParaPlanejamento, empreendimento.id, pavimentos, mapearEtapaEmp]);

  const tempoCalculadoPorEtapa = useMemo(() => {
    const atividadesFiltradas = etapaParaPlanejamento === 'todas'
      ? atividadesDisponiveis
      : atividadesDisponiveis.filter(ativ => ativ.etapa === etapaParaPlanejamento);
    return atividadesFiltradas.reduce((total, ativ) => total + (ativ.tempoComFator || 0), 0);
  }, [atividadesDisponiveis, etapaParaPlanejamento]);

  const todasAtividadesConcluidas = useMemo(() => {
    if (atividadesDisponiveis.length === 0) return false;
    return atividadesDisponiveis.every(a => a.estaConcluida || a.statusPlanejamento === 'concluido');
  }, [atividadesDisponiveis]);

  const handleToggleAtividade = (atividadeId) => {
    setSelectedAtividades(prev =>
      prev.includes(atividadeId) ? prev.filter(id => id !== atividadeId) : [...prev, atividadeId]
    );
  };

  const handleMarcarComoConcluida = async (activityObj) => {
    setIsUpdatingActivity(true);
    try {
      const existingMarkers = await retryWithBackoff(
        () => Atividade.filter({ empreendimento_id: empreendimento.id, id_atividade: activityObj.id, documento_id: doc.id, tempo: 0 }),
        3, 1000, `checkConclusionMarker-${activityObj.id}-${doc.id}`
      );
      if (existingMarkers && existingMarkers.length > 0) {
        for (const marker of existingMarkers) {
          await retryWithBackoff(() => Atividade.delete(marker.id), 3, 1000, `removeConclusionMarker-${marker.id}`);
        }
      } else {
        await retryWithBackoff(() => Atividade.create({
          etapa: activityObj.etapa, disciplina: activityObj.disciplina, subdisciplina: activityObj.subdisciplina,
          atividade: `(Concluída na folha ${doc.numero}) ${String(activityObj.atividade || '')}`,
          funcao: activityObj.funcao, empreendimento_id: empreendimento.id,
          id_atividade: activityObj.id, documento_id: doc.id, tempo: 0
        }), 3, 1000, `createConclusionMarker-${activityObj.id}-${doc.id}`);
      }
      await onUpdate();
    } catch (error) {
      alert("Erro ao atualizar o status da atividade: " + error.message);
    } finally {
      setIsUpdatingActivity(false);
    }
  };

  const handleMarcarMultiplasComoConcluidas = async () => {
    if (selectedAtividades.length === 0) { alert("Selecione pelo menos uma atividade"); return; }
    if (!window.confirm(`Tem certeza que deseja marcar ${selectedAtividades.length} atividade(s) como concluída(s)?`)) return;
    setIsUpdatingActivity(true);
    try {
      let atividadesMarcadas = 0;
      for (const atividadeId of selectedAtividades) {
        const atividade = atividadesDisponiveis.find(a => a.id === atividadeId);
        if (!atividade) continue;
        const existingMarkers = await retryWithBackoff(
          () => Atividade.filter({ empreendimento_id: empreendimento.id, id_atividade: atividade.id, documento_id: doc.id, tempo: 0 }),
          3, 1000, `checkConclusionMarker-${atividade.id}-${doc.id}`
        );
        if (existingMarkers && existingMarkers.length > 0) continue;
        await retryWithBackoff(() => Atividade.create({
          etapa: atividade.etapa, disciplina: atividade.disciplina, subdisciplina: atividade.subdisciplina,
          atividade: `(Concluída na folha ${doc.numero}) ${String(atividade.atividade || '')}`,
          funcao: atividade.funcao, empreendimento_id: empreendimento.id,
          id_atividade: atividade.id, documento_id: doc.id, tempo: 0
        }), 3, 1000, `createConclusionMarker-${atividade.id}-${doc.id}`);
        atividadesMarcadas++;
      }
      setSelectedAtividades([]);
      if (atividadesMarcadas > 0) setTimeout(() => alert(`✅ ${atividadesMarcadas} atividade(s) marcada(s) como concluída(s)!`), 200);
    } catch (error) {
      alert("Erro ao atualizar o status das atividades: " + error.message);
    } finally {
      setTimeout(() => setIsUpdatingActivity(false), 500);
    }
  };

  const handleExcluirAtividade = async (activityObj) => {
    const nomeAtividade = String(activityObj.atividade || '');
    if (!window.confirm(`Tem certeza que deseja excluir a atividade "${nomeAtividade}" SOMENTE desta folha "${doc.numero}"?`)) return;
    setIsUpdatingActivity(true);
    try {
      if (activityObj.empreendimento_id === empreendimento.id) {
        await retryWithBackoff(() => Atividade.delete(activityObj.id), 3, 1000, `deleteSpecificAtividade-${activityObj.id}`);
      } else {
        const existingMarkers = await retryWithBackoff(
          () => Atividade.filter({ empreendimento_id: empreendimento.id, id_atividade: activityObj.id, documento_id: doc.id, tempo: -999 }),
          3, 1000, `checkExclusionMarker-${activityObj.id}-${doc.id}`
        );
        if (existingMarkers && existingMarkers.length > 0) { alert(`A atividade "${nomeAtividade}" já está excluída desta folha.`); return; }
        const marcadorCriado = await retryWithBackoff(() => Atividade.create({
          etapa: activityObj.etapa, disciplina: activityObj.disciplina, subdisciplina: activityObj.subdisciplina,
          atividade: `(Excluída da folha ${doc.numero}) ${String(activityObj.atividade || '')}`,
          funcao: activityObj.funcao, empreendimento_id: empreendimento.id,
          id_atividade: activityObj.id, documento_id: doc.id, tempo: -999
        }), 3, 1000, `createExclusionMarker-${activityObj.id}-${doc.id}`);
        if (!marcadorCriado.documento_id) {
          await retryWithBackoff(() => Atividade.update(marcadorCriado.id, { documento_id: doc.id }), 3, 1000, `fixMarker-${marcadorCriado.id}`);
        }
      }
      await onUpdate();
      alert(`✅ Atividade "${nomeAtividade}" removida APENAS da folha "${doc.numero}"!`);
    } catch (error) {
      alert("Erro ao excluir atividade: " + error.message);
    } finally {
      setIsUpdatingActivity(false);
    }
  };

  const handleExecutorChange = async (field, value) => {
    setIsUpdating(true);
    try {
      let updateData = {};
      if (field === 'multiplos_executores') {
        updateData = { multiplos_executores: value, executor_principal: null, inicio_planejado: null, termino_planejado: null, tempo_total: 0 };
        const allPlansForDoc = localPlanejamentos.filter(p => p.documento_id === doc.id);
        if (allPlansForDoc.length > 0) {
          await Promise.all(allPlansForDoc.map(p =>
            p.tipo_plano === 'atividade'
              ? retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `deletePlanMulti-${p.id}`)
              : retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `deletePlanDocMulti-${p.id}`)
          ));
          setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== doc.id));
        }
        const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(doc.id, updateData), `updateDocMulti-${doc.id}`);
        handleLocalUpdate(updatedDocFromAPI);
        setCargaDiariaCache({});
        if (value === true && updatedDocFromAPI) handleOpenDocEtapaModal(updatedDocFromAPI);
      } else if (field === 'executor_principal' && value === null) {
        updateData = { executor_principal: null, inicio_planejado: null, termino_planejado: null, tempo_total: 0 };
        const allPlansForDoc = localPlanejamentos.filter(p => p.documento_id === doc.id);
        if (allPlansForDoc.length > 0) {
          await Promise.all(allPlansForDoc.map(p =>
            p.tipo_plano === 'atividade'
              ? retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `deletePlanClear-${p.id}`)
              : retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `deletePlanDocClear-${p.id}`)
          ));
          setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== doc.id));
        }
        const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(doc.id, updateData), `clearExecutor-${doc.id}`);
        handleLocalUpdate(updatedDocFromAPI);
        setCargaDiariaCache({});
      }
    } catch (error) {
      alert("Falha ao atualizar o executor.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleExecutorSelectChange = async (executorEmail) => {
    if (!executorEmail) return;
    if (etapaParaPlanejamento === 'todas') {
      alert("Por favor, selecione uma etapa específica no dropdown 'Planejar Etapa' antes de atribuir um executor.");
      return;
    }
    const successorsWithoutExecutor = localDocumentos.filter(d => d.predecessora_id === doc.id && !d.executor_principal);
    if (successorsWithoutExecutor.length > 0) {
      setPendingExecutor(executorEmail);
      setShowExecutorDialog(true);
      return;
    }
    await applyExecutor(executorEmail, [doc.id]);
  };

  const applyExecutor = async (executorEmail, documentIds) => {
    setIsUpdating(true);
    try {
      const docsToProcess = documentIds.map(id => localDocumentos.find(d => d.id === id)).filter(Boolean);
      const orderedDocs = [];
      const visited = new Set();
      const findRootDocs = () => docsToProcess.filter(d => !d.predecessora_id || !documentIds.includes(d.predecessora_id));
      const findSuccessors = (docId) => docsToProcess.filter(d => d.predecessora_id === docId && !visited.has(d.id));
      let queue = findRootDocs();
      while (queue.length > 0) {
        const currentDoc = queue.shift();
        if (visited.has(currentDoc.id)) continue;
        orderedDocs.push(currentDoc);
        visited.add(currentDoc.id);
        queue.push(...findSuccessors(currentDoc.id));
      }

      // Mapa local de documentos atualizados para evitar stale closure nas iterações
      const docStateMap = new Map(localDocumentos.map(d => [d.id, { ...d }]));

      for (const docToUpdate of orderedDocs) {
        // Pular folhas já planejadas (exceto a folha principal clicada pelo usuário)
        const docAtual = docStateMap.get(docToUpdate.id) || docToUpdate;
        if (docAtual.id !== doc.id && docAtual.executor_principal && docAtual.termino_planejado) {
          continue;
        }

        const updateData = { executor_principal: executorEmail, multiplos_executores: false };
        const docAtualizado = await retryWithBackoff(() => Documento.update(docToUpdate.id, updateData), 3, 1000, `setExecutor-${docToUpdate.id}`);
        handleLocalUpdate(docAtualizado);
        docStateMap.set(docAtualizado.id, docAtualizado);

        // Determinar data início: usar docStateMap para ter dados frescos da predecessora
        let metodoData = 'agenda';
        let dataManualInicio = null;
        if (docAtualizado.predecessora_id) {
          const pred = docStateMap.get(docAtualizado.predecessora_id);
          if (pred?.termino_planejado && isValid(parseDate(pred.termino_planejado))) {
            dataManualInicio = format(ensureWorkingDay(parseDate(pred.termino_planejado)), 'yyyy-MM-dd');
            metodoData = 'manual';
          }
        }
        if (!dataManualInicio && docAtualizado.inicio_planejado && isValid(parseDate(docAtualizado.inicio_planejado))) {
          metodoData = 'manual';
          dataManualInicio = docAtualizado.inicio_planejado;
        }

        await autoPlanejarAtividades(docAtualizado, etapaParaPlanejamento, executorEmail, metodoData, dataManualInicio);

        // Buscar estado atualizado do banco (com termino_planejado calculado) e atualizar mapa
        const [docFinalizado] = await retryWithBackoff(
          () => Documento.filter({ id: docToUpdate.id }), 3, 1000, `getDoc-${docToUpdate.id}`
        );
        if (docFinalizado) {
          handleLocalUpdate(docFinalizado);
          docStateMap.set(docFinalizado.id, docFinalizado);
        }
      }

      setCargaDiariaCache({});

      // Atualizar planejamentos em background
      setTimeout(() => {
        Promise.all([
          retryWithBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: empreendimento.id }), 3, 500, 'refreshPlansAtiv'),
          retryWithBackoff(() => PlanejamentoDocumento.filter({ empreendimento_id: empreendimento.id }), 3, 500, 'refreshPlansDoc'),
        ]).then(([plansAtividade, plansDocumento]) => {
          setLocalPlanejamentos([
            ...(plansAtividade || []).map(p => ({ ...p, tipo_plano: 'atividade' })),
            ...(plansDocumento || []).map(p => ({ ...p, tipo_plano: 'documento' }))
          ]);
        }).catch(() => {});
      }, 200);
    } catch (error) {
      alert(error.message || "Erro ao definir executor e planejar.");
    } finally {
      setIsUpdating(false);
      setShowExecutorDialog(false);
      setPendingExecutor(null);
    }
  };

  const handleApplyToRelated = async (applyToRelated) => {
    if (!pendingExecutor) return;
    const documentIds = [doc.id];
    if (applyToRelated) {
      const findSuccessorsWithoutExecutor = (docId, visited = new Set()) => {
        if (visited.has(docId)) return [];
        visited.add(docId);
        const directSuccessors = localDocumentos.filter(d => d.predecessora_id === docId && !d.executor_principal);
        const allSuccessors = [...directSuccessors];
        directSuccessors.forEach(successor => allSuccessors.push(...findSuccessorsWithoutExecutor(successor.id, visited)));
        return allSuccessors;
      };
      documentIds.push(...findSuccessorsWithoutExecutor(doc.id).map(d => d.id));
    }
    await applyExecutor(pendingExecutor, documentIds);
  };

  const documentosFiltradosParaPredecessor = useMemo(() => {
    const docs = localDocumentos.filter(d => d.id !== doc.id);
    if (!searchPredecessor) return docs.slice(0, 50);
    const search = searchPredecessor.toLowerCase();
    return docs.filter(d => d.numero?.toLowerCase().includes(search) || d.arquivo?.toLowerCase().includes(search)).slice(0, 50);
  }, [localDocumentos, doc.id, searchPredecessor]);

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


  return (
    <>
      <TableRow key={doc.id} className={todasAtividadesConcluidas ? 'bg-green-50' : ''}>
        <TableCell>
          <Button variant="ghost" size="icon" onClick={() => toggleRow(doc.id)} disabled={isDocLoading}>
            {expandedRows[doc.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {doc.numero}
            {todasAtividadesConcluidas && (
              <Badge className="bg-green-100 text-green-700 border border-green-300 text-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Concluído
              </Badge>
            )}
          </div>
        </TableCell>
        <TableCell>{doc.arquivo}</TableCell>
        <TableCell className="text-sm text-gray-600 max-w-xs">
          {doc.descritivo
            ? <span className="line-clamp-2" title={doc.descritivo}>{doc.descritivo}</span>
            : <span className="text-gray-400 italic">Sem descrição</span>}
        </TableCell>
        <TableCell>
          {doc.subdisciplinas && doc.subdisciplinas.length > 0
            ? <div className="flex flex-wrap gap-1 items-start">{doc.subdisciplinas.map((sub, idx) => <Badge key={idx} variant="secondary" className="text-xs">{sub}</Badge>)}</div>
            : <span className="text-gray-400 italic text-xs">-</span>}
        </TableCell>
        <TableCell className="text-sm text-gray-600">{doc.escala ? `1:${doc.escala}` : '-'}</TableCell>

        {!readOnly && (
          <TableCell className="w-[200px]">
            <div className="space-y-1">
              {(() => {
                const etapaSelecionada = etapaParaPlanejamento !== 'todas' ? etapaParaPlanejamento : null;

                // Quando uma etapa específica está selecionada
                if (etapaSelecionada) {
                  const planejamentoDaEtapa = planejamentosDoDocumento.find(p =>
                    (p.etapa || '').toLowerCase() === (etapaSelecionada || '').toLowerCase() && p.executor_principal
                  );
                  const executorDaEtapa = planejamentoDaEtapa?.executor_principal || doc.executor_principal || null;

                  if (planejamentoDaEtapa && executorDaEtapa) {
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between p-1 bg-green-50 border border-green-200 rounded">
                          <div className="flex items-center gap-1 min-w-0">
                            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                            <span className="text-xs font-medium text-green-800 truncate">
                              {usuariosOrdenados.find(u => u.email === executorDaEtapa)?.nome || executorDaEtapa}
                            </span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleExecutorChange('executor_principal', null)} className="text-xs text-red-600 hover:text-red-700 h-6 flex-shrink-0" disabled={isUpdating || isDocLoading}>
                            Remover
                          </Button>
                        </div>
                        <div className="text-xs text-gray-500 italic">{etapaSelecionada}</div>
                      </div>
                    );
                  }

                  return (
                    <Select onValueChange={(value) => handleExecutorSelectChange(value)} disabled={isUpdating || isDocLoading}>
                      <SelectTrigger className="w-full text-xs h-7 border-blue-500 text-blue-600 hover:bg-blue-50">
                        <Users2 className="w-3 h-3 mr-1" />
                        <SelectValue placeholder="Selecionar Executor" />
                      </SelectTrigger>
                      <SelectContent>
                        {usuariosOrdenados.map(u => <SelectItem key={u.id} value={u.email}>{u.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  );
                }

                // "Todas as etapas": mostrar todos os planejamentos existentes agrupados por etapa
                const planejamentosComExecutor = planejamentosDoDocumento.filter(p => p.executor_principal && p.etapa);

                if (planejamentosComExecutor.length > 0) {
                  return (
                    <div className="space-y-1">
                      {planejamentosComExecutor.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-1 bg-green-50 border border-green-200 rounded gap-1">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                              <span className="text-xs font-medium text-green-800 truncate">
                                {usuariosOrdenados.find(u => u.email === p.executor_principal)?.nome || p.executor_principal}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 italic pl-3">{p.etapa || 'Múltiplas etapas'}</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleExecutorChange('executor_principal', null)} className="text-xs text-red-600 hover:text-red-700 h-6 flex-shrink-0" disabled={isUpdating || isDocLoading}>
                            Remover
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                }

                if (doc.executor_principal) {
                  return (
                    <div className="flex items-center justify-between p-1 bg-green-50 border border-green-200 rounded">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs font-medium text-green-800">
                          {usuariosOrdenados.find(u => u.email === doc.executor_principal)?.nome || doc.executor_principal}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleExecutorChange('executor_principal', null)} className="text-xs text-red-600 hover:text-red-700 h-6" disabled={isUpdating || isDocLoading}>
                        Remover
                      </Button>
                    </div>
                  );
                }

                return (
                  <Select onValueChange={(value) => handleExecutorSelectChange(value)} disabled={isUpdating || isDocLoading}>
                    <SelectTrigger className="w-full text-xs h-7 border-blue-500 text-blue-600 hover:bg-blue-50">
                      <Users2 className="w-3 h-3 mr-1" />
                      <SelectValue placeholder="Selecionar Executor" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuariosOrdenados.map(u => <SelectItem key={u.id} value={u.email}>{u.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                );
              })()}
              {(isUpdating || isDocLoading) && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {isDocLoading ? "Planejando..." : "Salvando..."}
                </div>
              )}
            </div>

            <Dialog open={showExecutorDialog} onOpenChange={setShowExecutorDialog}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <div className="font-semibold text-lg">Aplicar executor a folhas relacionadas?</div>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Esta folha possui folhas sucessoras ainda sem executor. Deseja aplicar o executor <strong>{pendingExecutor}</strong> também a elas?
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => handleApplyToRelated(false)} disabled={isUpdating}>Apenas esta folha</Button>
                    <Button onClick={() => handleApplyToRelated(true)} disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700">
                      {isUpdating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aplicando...</> : 'Aplicar a todas'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TableCell>
        )}

        {!readOnly && (
          <TableCell className="text-sm text-gray-700">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 w-12">Início:</span>
                <Input
                  type="date"
                  value={doc.inicio_planejado ? doc.inicio_planejado.split('T')[0] : ''}
                  onChange={(e) => handleDataInicioChange(doc.id, e.target.value || null)}
                  disabled={isDocLoading}
                  className="h-6 text-xs px-1 w-32"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 w-12">Término:</span>
                <span className="text-xs">{doc.termino_planejado ? format(parseISO(doc.termino_planejado), 'dd/MM/yyyy') : 'N/A'}</span>
              </div>
            </div>
          </TableCell>
        )}

        {!readOnly && (
          <TableCell className="text-sm text-gray-700">
            <div className="flex flex-col">
              <span className="font-medium">{`${(tempoCalculadoPorEtapa + (Number(doc.tempo_pre) || 0)).toFixed(1)}h`}</span>
              {etapaParaPlanejamento !== 'todas' && <span className="text-xs text-gray-500">({etapaParaPlanejamento})</span>}
              {(Number(doc.tempo_pre) || 0) > 0 && (
                <span className="text-xs text-orange-500" title="Inclui tempo de PRE vinculada">+{Number(doc.tempo_pre).toFixed(1)}h PRE</span>
              )}
              {mediaDoc && (
                <span
                  className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium"
                  title={`Média histórica de ${mediaDoc.total} execução${mediaDoc.total === 1 ? '' : 'ões'}${mediaDoc.etapa ? ` na etapa ${mediaDoc.etapa}` : ''}`}
                >
                  ⌀ {mediaDoc.media}h
                </span>
              )}
            </div>
          </TableCell>
        )}

        {!readOnly && (
          <TableCell>
            <div className="space-y-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-xs h-8" disabled={isDocLoading}>
                    <span className="truncate">
                      {doc.predecessora_id
                        ? (() => { const pred = localDocumentos.find(d => d.id === doc.predecessora_id); return pred ? `${pred.numero}` : 'Não encontrado'; })()
                        : 'Predecessora'}
                    </span>
                    <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                      <Input placeholder="Buscar documento..." value={searchPredecessor} onChange={(e) => setSearchPredecessor(e.target.value)} className="pl-8" />
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    <div className="p-1">
                      <Button variant="ghost" className="w-full justify-start text-left font-normal" onClick={() => { handlePredecessoraChange(doc.id, null); setSearchPredecessor(''); }}>
                        <span className="text-gray-500">Nenhum predecessor</span>
                      </Button>
                      {documentosFiltradosParaPredecessor.map(d => (
                        <Button key={d.id} variant="ghost" className="w-full justify-start text-left font-normal" onClick={() => { handlePredecessoraChange(doc.id, d.id); setSearchPredecessor(''); }}>
                          <span className="font-medium">{d.numero}</span>
                          <span className="text-gray-500 ml-2 truncate">{d.arquivo}</span>
                        </Button>
                      ))}
                      {documentosFiltradosParaPredecessor.length === 0 && searchPredecessor && (
                        <div className="p-4 text-center text-sm text-gray-500">Nenhum documento encontrado</div>
                      )}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7 border-blue-500 text-blue-600 hover:bg-blue-50" onClick={() => handleOpenDocEtapaModal(doc)} disabled={isDocLoading} title="Planejar Documento">
                  <CalendarDays className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEdit(doc)} disabled={isDocLoading}>
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDelete(doc.id)} disabled={isDocLoading}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </TableCell>
        )}
      </TableRow>

      {expandedRows[doc.id] && (
        <TableRow>
          <TableCell colSpan={8} className="bg-gray-50">
            <div className="p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold">Atividades da Folha: {doc.numero}</h4>
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
                    <Checkbox
                      checked={atividadesDisponiveis.length > 0 && selectedAtividades.length === atividadesDisponiveis.length}
                      onCheckedChange={(checked) => {
                        if (checked) setSelectedAtividades(atividadesDisponiveis.map(a => a.id));
                        else setSelectedAtividades([]);
                      }}
                      disabled={isUpdatingActivity || atividadesDisponiveis.length === 0}
                    />
                    Selecionar todos
                  </label>
                </div>
                <div className="flex gap-2">
                  {etapaParaPlanejamento !== 'todas' && atividadesDisponiveis.filter(a => a.etapa === etapaParaPlanejamento && !a.estaConcluida).length > 0 && (
                    <Button size="sm" onClick={async () => {
                      const atividadesDaEtapa = atividadesDisponiveis.filter(a => a.etapa === etapaParaPlanejamento && !a.estaConcluida);
                      if (!window.confirm(`Concluir TODAS as ${atividadesDaEtapa.length} atividades da etapa "${etapaParaPlanejamento}"?`)) return;
                      setIsUpdatingActivity(true);
                      try {
                        for (const atividade of atividadesDaEtapa) {
                          const existing = await retryWithBackoff(() => Atividade.filter({ empreendimento_id: empreendimento.id, id_atividade: atividade.id, documento_id: doc.id, tempo: 0 }), 3, 1000);
                          if (existing && existing.length > 0) continue;
                          await retryWithBackoff(() => Atividade.create({ etapa: atividade.etapa, disciplina: atividade.disciplina, subdisciplina: atividade.subdisciplina, atividade: `(Concluída na folha ${doc.numero}) ${String(atividade.atividade || '')}`, funcao: atividade.funcao, empreendimento_id: empreendimento.id, id_atividade: atividade.id, documento_id: doc.id, tempo: 0 }), 3, 1000);
                        }
                        // Marcar planejamentos da etapa como concluídos
                        const planosDaEtapa = localPlanejamentos.filter(p => p.documento_id === doc.id && p.etapa === etapaParaPlanejamento);
                        for (const plano of planosDaEtapa) {
                          if (plano.tipo_plano === 'atividade') {
                            await retryWithBackoff(() => PlanejamentoAtividade.update(plano.id, { status: 'concluido' }), 3, 1000);
                          } else {
                            await retryWithBackoff(() => PlanejamentoDocumento.update(plano.id, { status: 'concluido' }), 3, 1000);
                          }
                        }
                        alert(`✅ Todas as ${atividadesDaEtapa.length} atividades da etapa "${etapaParaPlanejamento}" foram concluídas!`);
                        await onUpdate();
                      } catch (error) {
                        alert("Erro ao concluir atividades: " + error.message);
                      } finally {
                        setIsUpdatingActivity(false);
                      }
                    }} className="bg-purple-600 hover:bg-purple-700 text-white" disabled={isUpdatingActivity}>
                      <CheckCircle2 className="w-4 h-4 mr-2" />Concluir Etapa "{etapaParaPlanejamento}"
                    </Button>
                  )}
                  {selectedAtividades.length > 0 && (
                    <Button size="sm" onClick={handleMarcarMultiplasComoConcluidas} className="bg-green-600 hover:bg-green-700 text-white" disabled={isUpdatingActivity}>
                      <Check className="w-4 h-4 mr-2" />Concluir {selectedAtividades.length} Selecionada(s)
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleEditAtividade({ empreendimento_id: empreendimento.id, documento_id: doc.id, documento_ids: [doc.id], disciplina: doc.disciplina || (Array.isArray(doc.disciplinas) && doc.disciplinas[0]) || '', subdisciplinas: doc.subdisciplinas || [] })} className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />Nova Atividade
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {atividadesDisponiveis.length > 0 ? atividadesDisponiveis.map(atividade => (
                  <div key={atividade.id} className={`flex justify-between items-center p-3 rounded border ${
                    atividade.statusPlanejamento === 'concluido' ? 'bg-green-50 border-green-200' :
                    atividade.estaConcluida ? 'bg-gray-50 border-gray-200' :
                    atividade.statusPlanejamento === 'em_andamento' ? 'bg-blue-50 border-blue-200' :
                    atividade.statusPlanejamento === 'pausado' ? 'bg-yellow-50 border-yellow-200' :
                    atividade.statusPlanejamento === 'nao_iniciado' ? 'bg-blue-50 border-blue-200' :
                    'bg-white border-gray-200'
                  }`}>
                    <div className="flex items-center gap-3 flex-1 pr-2">
                      <Checkbox checked={selectedAtividades.includes(atividade.id)} onCheckedChange={() => handleToggleAtividade(atividade.id)} disabled={isUpdatingActivity} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${atividade.estaConcluida || atividade.statusPlanejamento === 'concluido' ? 'line-through text-gray-500' : ''}`}>
                            {String(atividade.atividade || '').replace(/^\(Concluída na folha \d+\)\s*/, '').trim() || 'Atividade'}
                          </span>
                          {atividade.statusPlanejamento === 'concluido' && <Badge className="bg-green-600 text-white text-xs">Finalizado</Badge>}
                          {atividade.estaConcluida && atividade.statusPlanejamento !== 'concluido' && <Badge className="bg-gray-100 text-gray-600 text-xs">Concluída Manualmente</Badge>}
                          {atividade.statusPlanejamento === 'em_andamento' && <Badge className="bg-blue-100 text-blue-800 text-xs">Em Andamento</Badge>}
                          {atividade.statusPlanejamento === 'pausado' && <Badge className="bg-yellow-100 text-yellow-800 text-xs">Pausada</Badge>}
                          {atividade.statusPlanejamento === 'nao_iniciado' && <Badge className="bg-blue-100 text-blue-800 text-xs">Planejado</Badge>}
                          {!atividade.statusPlanejamento && !atividade.estaConcluida && <Badge className="bg-gray-100 text-gray-600 text-xs">Não planejado</Badge>}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {atividade.etapa} • {atividade.subdisciplina || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`text-sm font-medium ${atividade.estaConcluida || atividade.statusPlanejamento === 'concluido' ? 'line-through text-gray-400' : ''}`}>
                          {`${atividade.tempoComFator.toFixed(1)}h`}
                        </div>
                        {(() => {
                          const mediaAtiv = mediasAtividades.find(m => Number(m.atividade_id) === Number(atividade.id));
                          return mediaAtiv ? (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium"
                              title={`Média histórica de ${mediaAtiv.total} execução${mediaAtiv.total === 1 ? '' : 'ões'}`}
                            >
                              ⌀ {mediaAtiv.media}h
                            </span>
                          ) : null;
                        })()}
                        {atividade.statusPlanejamento === 'concluido' && <div className="text-xs text-green-600">Finalizado no planejamento</div>}
                        {atividade.estaConcluida && atividade.statusPlanejamento !== 'concluido' && <div className="text-xs text-gray-500">Concluída manualmente</div>}
                        {atividade.statusPlanejamento === 'em_andamento' && !atividade.estaConcluida && <div className="text-xs text-blue-600">Em execução</div>}
                        {atividade.statusPlanejamento === 'pausado' && !atividade.estaConcluida && <div className="text-xs text-yellow-600">Pausada</div>}
                        {atividade.statusPlanejamento === 'nao_iniciado' && !atividade.estaConcluida && <div className="text-xs text-blue-600">Planejado</div>}
                        {!atividade.estaConcluida && !atividade.statusPlanejamento && <div className="text-xs text-gray-500">Não planejado</div>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleMarcarComoConcluida(atividade)} className={atividade.estaConcluida ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'} title={atividade.estaConcluida ? "Desmarcar como concluída" : "Marcar como concluída"} disabled={isUpdatingActivity}>
                        {isUpdatingActivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleExcluirAtividade(atividade)} className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Excluir atividade SOMENTE desta folha" disabled={isUpdatingActivity}>
                        {isUpdatingActivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )) : (
                  <div className="text-center text-gray-500 p-4">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-16 h-16 text-gray-300" />
                      <p>Nenhuma atividade encontrada para esta disciplina/subdisciplinas</p>
                      <p className="text-xs">Disciplina: {doc.disciplina || (Array.isArray(doc.disciplinas) ? doc.disciplinas[0] : '') || ''} | Subdisciplinas: {(doc.subdisciplinas || []).join(', ') || 'Nenhuma'}</p>
                    </div>
                  </div>
                )}
              </div>

              {atividadesDisponiveis.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <div className="flex justify-between items-center text-sm text-gray-600">
                    <span>Total: {atividadesDisponiveis.length} atividades | Planejadas: {atividadesDisponiveis.filter(a => a.jaFoiPlanejada).length}</span>
                    <span>Tempo total: {atividadesDisponiveis.reduce((sum, a) => sum + a.tempoComFator, 0).toFixed(1)}h</span>
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}