// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext, startTransition } from 'react';
import { ActivityTimerContext } from '@/components/contexts/ActivityTimerContext';
import { Documento, Disciplina, Atividade, Execucao, Usuario, PlanejamentoAtividade, PlanejamentoDocumento, DataCadastro } from "@/entities/all";
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ChevronDown, ChevronRight, FileText, Loader2, Upload, Download } from "lucide-react";
import { Plus } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import DocumentoForm from "./DocumentoForm";
import AtividadeFormModal from "./AtividadeFormModal";
import DocumentoItem from "./DocumentoItem";
import PlanejamentoDocumentoEtapaModal from './PlanejamentoDocumentoEtapaModal';
import PlanejamentoDocumentoDataModal from './PlanejamentoDocumentoDataModal';
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';
import { getNextWorkingDay, distribuirHorasPorDias, isWorkingDay, calculateEndDate } from '../utils/DateCalculator';
import { format, isValid, parseISO, addDays } from 'date-fns';
import { retryWithBackoff, retryWithExtendedBackoff } from '../utils/apiUtils';

const parseDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  // Se já é ISO timestamp completo (contém 'T'), parsear diretamente e normalizar para meia-noite local
  if (typeof dateString === 'string' && dateString.includes('T')) {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    // Retornar meia-noite local para manter consistência com datas no formato YYYY-MM-DD
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return new Date(`${dateString}T00:00:00`);
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

export default function DocumentosTab({
  empreendimento,
  documentos,
  disciplinas,
  atividades: allAtividades,
  planejamentos,
  usuarios,
  pavimentos,
  onUpdate,
  isLoading,
  etapaParaPlanejamento,
  onEtapaChange,
  readOnly = false,
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingDocumento, setEditingDocumento] = useState(null);
  const [showAtividadeForm, setShowAtividadeForm] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filtroArea, setFiltroArea] = useState("todas");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [expandedRows, setExpandedRows] = useState({});
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  const [isDocEtapaModalOpen, setIsDocEtapaModal] = useState(false);
  const [documentForDocEtapaModal, setDocumentForDocEtapaModal] = useState(null);
  const [isDocDataModalOpen, setIsDocDataModalOpen] = useState(false);
  const [documentForDocDataModal, setDocumentForDocDataModal] = useState(null);

  // Loading state via per-doc callbacks — avoids re-rendering all DocumentoItems when one loads
  const loadingDocsSettersRef = useRef({});
  const setDocLoading = useCallback((docId, val) => {
    loadingDocsSettersRef.current[String(docId)]?.(val);
  }, []);
  const registerLoadingSetter = useCallback((docId, setter) => {
    if (setter) loadingDocsSettersRef.current[String(docId)] = setter;
    else delete loadingDocsSettersRef.current[String(docId)];
  }, []);
  const [localDocumentos, setLocalDocumentos] = useState(documentos);
  const localDocumentosRef = useRef(documentos);
  const autoPlanejarRef = useRef(null);
  const [atividadesEmpCache, setAtividadesEmpCache] = useState([]);
  const [localPlanejamentos, setLocalPlanejamentos] = useState(planejamentos);
  const [executorPreSelecionado, setExecutorPreSelecionado] = useState(null);
  const cargaDiariaCacheRef = useRef({});
  // Funções de compatibilidade para não alterar chamadas espalhadas
  const setCargaDiariaCache = useCallback((updater) => {
    if (typeof updater === 'function') {
      cargaDiariaCacheRef.current = updater(cargaDiariaCacheRef.current);
    } else {
      cargaDiariaCacheRef.current = updater;
    }
  }, []);
  const [disciplinasMinimizadas, setDisciplinasMinimizadas] = useState({});
  const hasAutoExpanded = useRef(false);

  // Expand sections one at a time after initial render so the page loads fast
  useEffect(() => {
    if (hasAutoExpanded.current || !documentosPorDisciplina?.length) return;
    hasAutoExpanded.current = true;
    documentosPorDisciplina.forEach(([disciplina], index) => {
      setTimeout(() => {
        startTransition(() => {
          setDisciplinasMinimizadas(prev => ({ ...prev, [disciplina]: false }));
        });
      }, 50 + index * 250);
    });
  }, [documentosPorDisciplina]);

  // Recarregar planejamentos quando triggerUpdate for chamado (ex: após execução/pause/finish)
  const reloadPlanejamentos = useCallback(async () => {
    if (!empreendimento?.id) return;
    try {
      const [plansAtiv, plansDoc] = await Promise.all([
        PlanejamentoAtividade.filter({ empreendimento_id: empreendimento.id })
          .then(res => Array.isArray(res) ? res : [])
          .catch(() => []),
        PlanejamentoDocumento.filter({ empreendimento_id: empreendimento.id })
          .then(res => Array.isArray(res) ? res : [])
          .catch(() => []),
      ]);
      setLocalPlanejamentos([
        ...(plansAtiv || []).map(p => ({ ...p, tipo_plano: 'atividade' })),
        ...(plansDoc || []).map(p => ({ ...p, tipo_plano: 'documento' }))
      ]);
    } catch (e) {
    }
  }, [empreendimento?.id]);

  const { updateKey } = useContext(ActivityTimerContext);
  const prevUpdateKeyRef = useRef(updateKey);
  useEffect(() => {
    if (updateKey !== prevUpdateKeyRef.current) {
      prevUpdateKeyRef.current = updateKey;
      reloadPlanejamentos();
    }
  }, [updateKey, reloadPlanejamentos]);

  useEffect(() => { setLocalDocumentos(documentos); }, [documentos]);
  useEffect(() => { localDocumentosRef.current = localDocumentos; }, [localDocumentos]);
  useEffect(() => { setLocalPlanejamentos(planejamentos); }, [planejamentos]);

  // Carregar AtividadesEmpreendimento UMA VEZ para o empreendimento inteiro
  useEffect(() => {
    if (!empreendimento?.id) return;
    base44.entities.AtividadesEmpreendimento.filter({ empreendimento_id: empreendimento.id })
      .then(res => setAtividadesEmpCache(res || []))
      .catch(() => {});
  }, [empreendimento?.id]);

  const handleLocalUpdate = useCallback((updatedItemOrArray) => {
    setLocalDocumentos(prevDocs => {
      const updatedDocs = Array.isArray(updatedItemOrArray) ? updatedItemOrArray : [updatedItemOrArray];
      const newDocs = prevDocs.map(doc => {
        const found = updatedDocs.find(uDoc => uDoc.id === doc.id);
        return found ? { ...doc, ...found } : doc;
      });
      const existingIds = new Set(prevDocs.map(d => d.id));
      const newDocumentsToAdd = updatedDocs.filter(uDoc => !existingIds.has(uDoc.id));
      return [...newDocs, ...newDocumentsToAdd];
    });
  }, []);

  const getCargaDiariaExecutor = useCallback(async (executorEmail, forceRefresh = false) => {
    if (!forceRefresh && cargaDiariaCacheRef.current[executorEmail]) return cargaDiariaCacheRef.current[executorEmail];

    try {
      const PA = PlanejamentoAtividade;
      const PD = PlanejamentoDocumento;

      const [planosAtividade, planosDocumento] = await Promise.all([
        PA && PA.filter ? retryWithExtendedBackoff(() => PA.filter({ executor_principal: executorEmail }), 'loadAllPlansAtividade')
          .then(res => Array.isArray(res) ? res : [])
          .catch(() => []) : Promise.resolve([]),
        PD && PD.filter ? retryWithExtendedBackoff(() => PD.filter({ executor_principal: executorEmail }), 'loadPlanejamentosDocumento')
          .then(res => Array.isArray(res) ? res : [])
          .catch(() => []) : Promise.resolve([])
      ]);

      const todosOsPlanos = [...(planosAtividade || []), ...(planosDocumento || [])];
      const hoje = new Date();
      const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const cargaDiaria = {};

      todosOsPlanos.forEach((plano) => {
        if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
          Object.entries(plano.horas_por_dia).forEach(([data, horas]) => {
            try {
              const dataObj = parseISO(data);
              if (isValid(dataObj) && dataObj >= hojeMidnight) {
                const diaKey = format(dataObj, 'yyyy-MM-dd');
                const horasValidas = Number(horas) || 0;
                if (horasValidas > 0 && horasValidas <= 12) {
                  cargaDiaria[diaKey] = (cargaDiaria[diaKey] || 0) + horasValidas;
                }
              }
            } catch (erro) { }
          });
        }
      });

      cargaDiariaCacheRef.current = { ...cargaDiariaCacheRef.current, [executorEmail]: cargaDiaria };
      return cargaDiaria;
    } catch (error) {
      console.error('Erro ao carregar carga diária:', error);
      return {};
    }
  }, []);

  const handleCascadingUpdate = useCallback(async (startDoc, etapa, executor) => {
    if (!startDoc?.id || !startDoc?.termino_planejado || !etapa || !executor) return;

    const terminoDate = parseDate(startDoc.termino_planejado);
    if (!isValid(terminoDate)) return;

    // Passar o próprio dia do término do pai como início candidato.
    // distribuirHorasPorDias verifica a carga restante nesse dia:
    //   - Se houver espaço (ex: pai usou só 4h), o filho aproveita as horas livres.
    //   - Se o dia estiver cheio (8h), avança automaticamente para o próximo dia útil.
    const novaDataInicio = format(terminoDate, 'yyyy-MM-dd');

    const allDocs = localDocumentosRef.current;
    const children = allDocs.filter(d =>
      d.predecessora_id != null && String(d.predecessora_id) === String(startDoc.id)
    );

    for (const child of children) {
      try {
        await autoPlanejarRef.current?.(child, etapa, executor, 'manual', novaDataInicio);
      } catch (err) {
        // silently skip failed cascade child
      }
    }
  }, []);

  const autoPlanejarAtividades = useCallback(async (documento, etapa, executorEmail, metodoData, dataManualInicio) => {
    if (!documento?.id || !executorEmail || !etapa) { alert("Dados insuficientes para planejar."); return; }
    if (etapa === 'todas') { alert("Selecione uma etapa específica antes de definir o executor."); return; }

    setDocLoading(documento.id, true);

    try {
      const subdisciplinasDoc = documento.subdisciplinas || [];
      const disciplinasDoc = Array.isArray(documento.disciplinas) && documento.disciplinas.length > 0
        ? documento.disciplinas
        : (documento.disciplina ? [documento.disciplina] : []);
      const fatorDificuldade = documento.fator_dificuldade || 1;

      const etapaOverrides = new Map();
      const tempoOverrides = new Map();
      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade && ativ.tempo !== -999) {
          // Indexar tanto por id_atividade (para lookup por id genérico) como pelo id original
          etapaOverrides.set(ativ.id_atividade, ativ.etapa);
          etapaOverrides.set(ativ.id, ativ.etapa);
          tempoOverrides.set(ativ.id_atividade, ativ.tempo);
          tempoOverrides.set(ativ.id, ativ.tempo);
        }
      });

      // IDs de documentos do empreendimento para lookup
      const documentoIdsDoEmp = allAtividades
        .filter(a => a.empreendimento_id === empreendimento.id && a.documento_id)
        .map(a => a.documento_id);

      // IDs de atividades genéricas que têm override específico nesta folha (evitar dupla contagem)
      const idsComOverrideEspecifico = new Set();
      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.documento_id === documento.id && ativ.id_atividade && ativ.tempo !== -999) {
          idsComOverrideEspecifico.add(ativ.id_atividade);
        }
      });

      let atividadesGerais = allAtividades.filter(ativ => {
        // Atividades genéricas (sem empreendimento) com disciplina/subdisciplina compatível
        if (!ativ.empreendimento_id) {
          if (idsComOverrideEspecifico.has(ativ.id)) return false;
          const disciplinaMatch = disciplinasDoc.length === 0 || disciplinasDoc.includes(ativ.disciplina);
          const subdisciplinaMatch = Array.isArray(subdisciplinasDoc) && subdisciplinasDoc.includes(ativ.subdisciplina);
          return disciplinaMatch && subdisciplinaMatch;
        }
        // Atividades específicas desta folha (vinculadas ao documento)
        if (ativ.empreendimento_id === empreendimento.id && ativ.documento_id === documento.id && ativ.tempo !== -999 && ativ.tempo !== 0) {
          return true;
        }
        return false;
      });

      const atividadesExcluidasGlobal = new Set();
      const atividadesExcluidasPorDoc = new Set();
      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.tempo === -999 && ativ.id_atividade) {
          if (ativ.documento_id === documento.id) atividadesExcluidasPorDoc.add(ativ.id_atividade);
          else if (!ativ.documento_id) atividadesExcluidasGlobal.add(ativ.id_atividade);
        }
      });

      atividadesGerais = atividadesGerais.filter(ativ =>
        ativ.empreendimento_id // específica da folha, não filtrar por exclusão global
          ? true
          : !atividadesExcluidasGlobal.has(ativ.id) && !atividadesExcluidasPorDoc.has(ativ.id)
      );

      // Mapear etapa do catálogo para etapa do empreendimento
      // Se a etapa original da atividade não existe nas etapas do empreendimento,
      // mapear para a etapa selecionada para planejamento (todas as atividades entram na etapa escolhida)
      // Se empreendimento não tem etapas, usar a etapa original da atividade
      const atividadesDaEtapa = atividadesGerais.filter(ativ => {
        const etapaBase = etapaOverrides.has(ativ.id) ? etapaOverrides.get(ativ.id) : ativ.etapa;
        return (etapaBase || '').toLowerCase() === (etapa || '').toLowerCase();
      });

      if (atividadesDaEtapa.length === 0) {
        alert(`Nenhuma atividade encontrada para a etapa "${etapa}" no documento "${documento.numero || documento.arquivo}". Verifique se as atividades do catálogo possuem esta etapa.`);
        return;
      }

      const tempoTotal = atividadesDaEtapa.reduce((total, ativ) => {
        const tempoBase = tempoOverrides.has(ativ.id) ? parseFloat(tempoOverrides.get(ativ.id)) || 0 : parseFloat(ativ.tempo) || 0;
        const isConfeccaoA = ativ.atividade && String(ativ.atividade).trim().startsWith('Confecção de A-');
        return total + tempoBase * (isConfeccaoA ? 1 : fatorDificuldade);
      }, 0);

      // Remover planejamentos antigos
      const planejamentosAtividadeAntigos = localPlanejamentos.filter(p => p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'atividade');
      if (planejamentosAtividadeAntigos.length > 0) {
        await Promise.all(planejamentosAtividadeAntigos.map(p => retryWithBackoff(() => PlanejamentoAtividade.delete(p.id), 3, 1000, `deleteOldAtiv-${p.id}`)));
        setLocalPlanejamentos(prev => prev.filter(p => !(p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'atividade')));
      }
      const planejamentosDocumentoAntigos = localPlanejamentos.filter(p => p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'documento');
      if (planejamentosDocumentoAntigos.length > 0) {
        await Promise.all(planejamentosDocumentoAntigos.map(p => retryWithBackoff(() => PlanejamentoDocumento.delete(p.id), 3, 1000, `deleteOldDocPlan-${p.id}`)));
        setLocalPlanejamentos(prev => prev.filter(p => !(p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'documento')));
      }

      // forceRefresh=true: busca carga atualizada da API após deletar planejamentos antigos,
      // garantindo que horas deletadas de documentos anteriores no cascade não contaminem o cache.
      const cargaDiaria = await getCargaDiariaExecutor(executorEmail, true);

      let dataInicio;
      const hoje = new Date();
      const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

      if (metodoData === 'manual' && dataManualInicio) {
        const parsedManualDate = parseDate(dataManualInicio);
        if (!parsedManualDate || !isValid(parsedManualDate)) throw new Error(`Data manual de início inválida: ${dataManualInicio}`);
        dataInicio = parsedManualDate;
      } else if (documento.predecessora_id) {
        const predecessora = localDocumentosRef.current.find(d => String(d.id) === String(documento.predecessora_id));
        if (!predecessora?.termino_planejado || !isValid(parseDate(predecessora.termino_planejado))) {
          throw new Error(`Predecessora '${predecessora?.numero}' não possui data de término planejada. Planeje a predecessora primeiro.`);
        }
        dataInicio = getNextWorkingDay(parseDate(predecessora.termino_planejado));
      } else {
        let diaDisponivel = new Date(hojeMidnight);
        let tentativas = 0;
        while (tentativas < 365) {
          if (isWorkingDay(diaDisponivel)) {
            const cargaDoDia = cargaDiaria[format(diaDisponivel, 'yyyy-MM-dd')] || 0;
            if (8 - cargaDoDia >= 0.5) { dataInicio = diaDisponivel; break; }
          }
          diaDisponivel = addDays(diaDisponivel, 1);
          tentativas++;
        }
        if (tentativas >= 365) throw new Error(`Não foi possível encontrar uma data disponível na agenda.`);
      }

      const { distribuicao, dataTermino, novaCargaDiaria } = distribuirHorasPorDias(dataInicio, tempoTotal, 8, cargaDiaria, metodoData === 'manual');

      if (!distribuicao || Object.keys(distribuicao).length === 0) throw new Error(`Não foi possível distribuir as horas na agenda.`);
      if (!dataTermino || !isValid(dataTermino)) throw new Error(`Data de término inválida após distribuição das horas.`);

      const diasUtilizados = Object.keys(distribuicao).sort();
      const inicioPlanejado = diasUtilizados[0];
      const terminoPlanejado = format(dataTermino, 'yyyy-MM-dd');

      // Buscar predecessora_id do planejamento da predecessora (para ordenação correta no calendário)
      let predecessoraPlanejamentoId = null;
      if (documento.predecessora_id) {
        const planoPredecessora = localPlanejamentos.find(p =>
          String(p.documento_id) === String(documento.predecessora_id) &&
          (p.etapa || '').toLowerCase() === (etapa || '').toLowerCase() &&
          p.tipo_plano === 'documento'
        );
        if (planoPredecessora) predecessoraPlanejamentoId = planoPredecessora.id;
      }

      const novoPlano = await retryWithBackoff(() => PlanejamentoDocumento.create({
        empreendimento_id: empreendimento.id,
        documento_id: documento.id,
        descritivo: [documento.numero, documento.arquivo, etapa].filter(Boolean).join(' - ') || etapa,
        etapa, executor_principal: executorEmail, executores: [executorEmail],
        tempo_planejado: tempoTotal, inicio_planejado: inicioPlanejado,
        termino_planejado: terminoPlanejado, horas_por_dia: distribuicao,
        status: 'nao_iniciado', prioridade: 1, tipo_plano: 'documento',
        ...(predecessoraPlanejamentoId ? { predecessora_id: predecessoraPlanejamentoId } : {})
      }), 3, 1000, 'createPlanDocumento');

      const docAtualizado = await retryWithBackoff(() => Documento.update(documento.id, {
        executor_principal: executorEmail, inicio_planejado: inicioPlanejado,
        termino_planejado: terminoPlanejado, tempo_total: tempoTotal, multiplos_executores: false
      }), 3, 1000, `updateDoc-${documento.id}`);

      handleLocalUpdate(docAtualizado);
      setLocalPlanejamentos(prev => prev.filter(p => !(p.documento_id === documento.id && p.etapa === etapa)).concat({ ...novoPlano, tipo_plano: 'documento' }));
      // Atualizar cache local com nova carga (cascade reutiliza sem nova chamada API)
      cargaDiariaCacheRef.current = { ...cargaDiariaCacheRef.current, [executorEmail]: novaCargaDiaria };
      await handleCascadingUpdate(docAtualizado, etapa, executorEmail);

    } catch (error) {
      console.error("❌ Erro no planejamento automático:", error);
      alert(`Erro no planejamento: ${error.message || error}`);
      throw error;
    } finally {
      setDocLoading(documento.id, false);
    }
  }, [allAtividades, empreendimento, handleLocalUpdate, localPlanejamentos, setLocalPlanejamentos, getCargaDiariaExecutor, handleCascadingUpdate, setDocLoading]);

  // Mantém o ref sempre atualizado para o cascade usar sem criar dependência circular
  autoPlanejarRef.current = autoPlanejarAtividades;

  const handleSuccess = async () => { onUpdate(); setShowForm(false); setEditingDocumento(null); setCargaDiariaCache({}); };

  const handleExportData = () => {
    const rows = localDocumentos.map(doc => {
      const pavimento = (pavimentos || []).find(p => p.id === doc.pavimento_id);
      return [
        doc.numero || '',
        doc.arquivo || '',
        doc.descritivo || '',
        pavimento?.nome || '',
        (doc.disciplinas || (doc.disciplina ? [doc.disciplina] : [])).join(', '),
        (doc.subdisciplinas || []).join(', '),
        doc.escala || '',
        doc.fator_dificuldade || ''
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';');
    });

    const header = ['numero', 'arquivo', 'descritivo', 'pavimento_nome', 'disciplinas', 'subdisciplinas', 'escala', 'fator_dificuldade'].join(';');
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `documentos_${empreendimento.nome.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const handleExportTemplate = () => {
    const etapasDisponiveis = ["ESTUDO PRELIMINAR", "ANTE-PROJETO", "PROJETO BÁSICO", "PROJETO EXECUTIVO", "LIBERADO PARA OBRA"];
    const revisoesDefault = ["R00", "R01", "R02"];
    let headers = ['numero', 'arquivo', 'descritivo', 'pavimento_nome', 'disciplinas', 'subdisciplinas', 'escala', 'fator_dificuldade'];
    etapasDisponiveis.forEach(etapa => revisoesDefault.forEach(rev => headers.push(`${etapa}_${rev}`)));
    const csvContent = [
      headers.join(';'),
      ['ARQ-01', 'Planta Baixa Terreo', 'Planta baixa do pavimento terreo', 'Terreo', 'Arquitetura', 'Planta,Compat', '125', '1',
        ...etapasDisponiveis.flatMap(() => revisoesDefault.map(() => '15/01/2025'))].join(';')
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `template_documentos_${empreendimento.nome.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const handleImport = async () => {
    if (!importFile) { alert('Selecione um arquivo para importar'); return; }
    setIsImporting(true);
    try {
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const buffer = e.target.result;
          const bytes = new Uint8Array(buffer);
          // Detecta BOM UTF-8 (EF BB BF)
          const hasUtf8Bom = bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
          // Se não tem BOM UTF-8, assume ISO-8859-1 (padrão Excel Brasil)
          const encoding = hasUtf8Bom ? 'UTF-8' : 'ISO-8859-1';
          resolve(new TextDecoder(encoding).decode(buffer));
        };
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo. Tente selecionar o arquivo novamente.'));
        reader.readAsArrayBuffer(importFile);
      });
      const lines = fileContent.split('\n').filter(line => line.trim());
      if (lines.length < 2) { alert('Arquivo vazio ou inválido'); return; }

      const separator = lines[0].includes(';') ? ';' : ',';
      // Remove BOM, quotes, and extra whitespace from headers
      const headers = lines[0].split(separator).map(h => h.trim().replace(/^\uFEFF/, '').replace(/^["']|["']$/g, '').trim().toLowerCase());
      const missingHeaders = ['numero', 'arquivo'].filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) { alert(`Cabeçalhos obrigatórios faltando: ${missingHeaders.join(', ')}`); return; }

      const documentosParaImportar = [];
      const erros = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(separator).map(v => v.trim().replace(/^["']|["']$/g, ''));
        const row = {};
        headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
        if (!row.numero || !row.arquivo) { erros.push(`Linha ${i + 1}: Número e Arquivo são obrigatórios`); continue; }

        const pavimento = row.pavimento_nome ? (pavimentos || []).find(p => p.nome?.toLowerCase() === row.pavimento_nome.toLowerCase()) : null;
        const disciplinasArray = row.disciplinas ? row.disciplinas.split(/[,;]/).map(s => s.trim()).filter(s => s) : [];
        const subdisciplinasArray = row.subdisciplinas ? row.subdisciplinas.split(/[,;]/).map(s => s.trim()).filter(s => s) : [];
        const disciplinasValidas = disciplinasArray.filter(d => disciplinas.some(disc => disc.nome === d));

        const datas = {};
        headers.forEach(header => {
          if (['numero', 'arquivo', 'descritivo', 'pavimento_nome', 'disciplinas', 'subdisciplinas', 'escala', 'fator_dificuldade'].includes(header)) return;
          const data = row[header];
          if (!data) return;
          const parts = header.split('_');
          if (parts.length < 2) return;
          const revisao = parts.pop();
          const etapa = parts.join('_');
          let dataFormatada = data;
          if (data.includes('/')) {
            const [dia, mes, ano] = data.split('/');
            if (dia && mes && ano) dataFormatada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
          }
          if (!datas[etapa]) datas[etapa] = {};
          datas[etapa][revisao] = dataFormatada;
        });

        documentosParaImportar.push({
          numero: row.numero, arquivo: row.arquivo, descritivo: row.descritivo || '',
          disciplina: disciplinasValidas[0] || disciplinas[0]?.nome || '',
          disciplinas: disciplinasValidas.slice(0, 2), subdisciplinas: subdisciplinasArray,
          escala: row.escala ? parseFloat(row.escala) : null,
          fator_dificuldade: row.fator_dificuldade ? parseFloat(row.fator_dificuldade) : 1,
          pavimento_id: pavimento?.id || null, empreendimento_id: empreendimento.id,
          tempo_total: 0, tempo_concepcao: 0, tempo_planejamento: 0,
          tempo_estudo_preliminar: 0, tempo_ante_projeto: 0, tempo_projeto_basico: 0,
          tempo_projeto_executivo: 0, tempo_liberado_obra: 0,
          datas: Object.keys(datas).length > 0 ? datas : null
        });
      }

      if (erros.length > 0) alert(`Erros encontrados:\n${erros.join('\n')}`);
      if (documentosParaImportar.length === 0) { alert('Nenhum documento válido encontrado'); return; }

      let sucessos = 0, falhas = 0;
      const documentosCriados = [];
      for (const doc of documentosParaImportar) {
        try {
          const docCriado = await retryWithBackoff(() => Documento.create(doc), 3, 1000, `importDoc-${doc.numero}`);
          documentosCriados.push({ original: doc, criado: docCriado });
          sucessos++;
        } catch (error) { falhas++; }
      }

      let sucessosCadastro = 0, falhasCadastro = 0;
      for (const { original, criado } of documentosCriados) {
        if (original.datas && Object.keys(original.datas).length > 0) {
          try {
            await retryWithBackoff(() => DataCadastro.create({
              empreendimento_id: empreendimento.id,
              ordem: documentosCriados.indexOf(documentosCriados.find(d => d.criado.id === criado.id)),
              documento_id: criado.id, datas: original.datas
            }), 3, 1000, `importCadastro-${criado.id}`);
            sucessosCadastro++;
          } catch (error) { falhasCadastro++; }
        }
      }

      let mensagem = `Importação concluída!\n\nDocumentos: ${sucessos} sucessos, ${falhas} falhas`;
      if (sucessosCadastro > 0 || falhasCadastro > 0) mensagem += `\nDatas de Cadastro: ${sucessosCadastro} sucessos, ${falhasCadastro} falhas`;
      alert(mensagem);
      if (sucessos > 0) { await onUpdate(); setShowImportModal(false); setImportFile(null); }
    } catch (error) {
      alert(`Erro ao processar arquivo: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleEdit = useCallback((doc) => { setEditingDocumento(doc); setShowForm(true); }, []);
  const handleEditAtividade = useCallback((atividade = null) => { setEditingAtividade(atividade); setShowAtividadeForm(true); }, []);
  const handleAtividadeSuccess = async () => {
    const expandedState = { ...expandedRows };
    setShowAtividadeForm(false);
    setEditingAtividade(null);
    await onUpdate();
    setTimeout(() => setExpandedRows(expandedState), 100);
  };

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este documento?")) return;
    try {
      try {
        const atividadesEmp = await retryWithBackoff(() => base44.entities.AtividadesEmpreendimento.filter({ documento_id: id }), 3, 500);
        for (const atividadeEmp of atividadesEmp) {
          await retryWithBackoff(() => base44.entities.AtividadesEmpreendimento.delete(atividadeEmp.id), 3, 500);
        }
      } catch (error) { }
      await retryWithExtendedBackoff(() => Documento.delete(id), `deleteDocument-${id}`);
      setLocalDocumentos(prevDocs => prevDocs.filter(d => d.id !== id));
      setCargaDiariaCache({});
      onUpdate();
    } catch (error) {
      alert("Ocorreu um erro ao excluir o documento.");
    }
  }, [setCargaDiariaCache, onUpdate]);

  const handleOpenDocEtapaModal = useCallback((doc) => {
    setDocumentForDocEtapaModal(doc);
    setExecutorPreSelecionado(null);
    setIsDocEtapaModal(true);
  }, []);

  const handleCloseDocEtapaModal = useCallback(() => {
    setIsDocEtapaModal(false);
    setDocumentForDocEtapaModal(null);
    setExecutorPreSelecionado(null);
  }, []);

  const handleSaveDocEtapaPlanning = useCallback((result) => {
    setCargaDiariaCache({});

    // Se o modal retornou o documento atualizado, sincronizar localmente e acionar cascade
    if (result?.docAtualizado) {
      handleLocalUpdate(result.docAtualizado);
      const planos = result.planejamentos || [];
      if (planos.length > 0) {
        const firstPlan = planos[0];
        handleCascadingUpdate(result.docAtualizado, firstPlan.etapa, firstPlan.executor_principal);
      }
    }

    setTimeout(() => {
      Promise.all([
        retryWithBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: empreendimento.id }), 3, 500).catch(() => []),
        retryWithBackoff(() => PlanejamentoDocumento.filter({ empreendimento_id: empreendimento.id }), 3, 500).catch(() => []),
      ]).then(([plansAtividade, plansDocumento]) => {
        setLocalPlanejamentos([
          ...(Array.isArray(plansAtividade) ? plansAtividade : []).map(p => ({ ...p, tipo_plano: 'atividade' })),
          ...(Array.isArray(plansDocumento) ? plansDocumento : []).map(p => ({ ...p, tipo_plano: 'documento' }))
        ]);
      }).catch(() => {});
    }, 200);
    handleCloseDocEtapaModal();
    setExecutorPreSelecionado(null);
  }, [empreendimento.id, handleCloseDocEtapaModal, handleLocalUpdate, handleCascadingUpdate]);

  const toggleRow = useCallback((id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handlePredecessoraChange = useCallback(async (documentoId, predecessoraId) => {
    const documento = localDocumentosRef.current.find(d => d.id === documentoId);
    if (!documento) return;

    // Optimistic update — atualiza UI imediatamente sem esperar API
    const optimisticDoc = {
      ...documento,
      predecessora_id: predecessoraId || null,
      inicio_planejado: null,
      termino_planejado: null,
      tempo_total: 0,
      ...(!predecessoraId && !documento.multiplos_executores ? { executor_principal: null } : {}),
    };
    handleLocalUpdate(optimisticDoc);

    setDocLoading(documentoId, true);
    try {
      const planejamentosExistentes = localPlanejamentos.filter(p => p.documento_id === documentoId);
      if (planejamentosExistentes.length > 0) {
        await Promise.all(planejamentosExistentes.map(p =>
          p.tipo_plano === 'atividade'
            ? retryWithBackoff(() => PlanejamentoAtividade.delete(p.id), 3, 1000, `deleteOldPlanOnPredChange-${p.id}`)
            : retryWithBackoff(() => PlanejamentoDocumento.delete(p.id), 3, 1000, `deleteOldPlanDocOnPredChange-${p.id}`)
        ));
        setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== documentoId));
      }

      const updateData = {
        predecessora_id: predecessoraId || null,
        inicio_planejado: null,
        termino_planejado: null,
        tempo_total: 0,
        ...(!predecessoraId && !documento.multiplos_executores ? { executor_principal: null } : {}),
      };
      const updatedDocFromAPI = await retryWithBackoff(() => Documento.update(documentoId, updateData), 3, 1000, `setPredecessor-${documentoId}`);
      handleLocalUpdate(updatedDocFromAPI);
      setCargaDiariaCache({});

      if (predecessoraId) alert(`✅ Predecessora definida! Os planejamentos antigos foram removidos.\n\nDefina o executor novamente para replanejar.`);
    } catch (error) {
      // Reverter update otimista em caso de erro
      handleLocalUpdate(documento);
      alert('Ocorreu um erro ao definir a predecessora.');
    } finally {
      setDocLoading(documentoId, false);
    }
  }, [handleLocalUpdate, setCargaDiariaCache, localPlanejamentos, setDocLoading]);

  const handleDataInicioChange = useCallback(async (documentoId, novaDataStr) => {
    setDocLoading(documentoId, true);
    try {
      const documento = localDocumentosRef.current.find(d => d.id === documentoId);
      if (!documento) return;

      // Permitir limpar a data
      if (!novaDataStr) {
        const updatedDocFromAPI = await retryWithExtendedBackoff(
          () => Documento.update(documentoId, { inicio_planejado: null, termino_planejado: null }),
          `clearStartDate-${documentoId}`
        );
        handleLocalUpdate(updatedDocFromAPI);
        setCargaDiariaCache({});
        return;
      }

      const novaDataInicio = parseDate(novaDataStr);
      if (!isValid(novaDataInicio)) { alert("Data de início inválida."); return; }

      const updateData = { inicio_planejado: novaDataStr };
      if (documento.tempo_total && documento.tempo_total > 0) {
        const novaDataTermino = calculateEndDate(novaDataInicio, documento.tempo_total, 8);
        if (isValid(novaDataTermino)) updateData.termino_planejado = format(novaDataTermino, 'yyyy-MM-dd');
      }

      const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(documentoId, updateData), `setStartDate-${documentoId}`);
      handleLocalUpdate(updatedDocFromAPI);
      setCargaDiariaCache({});

      if (updatedDocFromAPI.executor_principal && !updatedDocFromAPI.multiplos_executores) {
        const planejamentosDoDoc = localPlanejamentos.filter(p => p.documento_id === documentoId);
        const etapasComPlanejamento = [...new Set(planejamentosDoDoc.map(p => p.etapa))];
        for (const etapa of etapasComPlanejamento) {
          await autoPlanejarAtividades(updatedDocFromAPI, etapa, updatedDocFromAPI.executor_principal, 'manual', novaDataStr);
        }
      }
    } catch (error) {
      alert('Erro ao atualizar data de início.');
    } finally {
      setDocLoading(documentoId, false);
    }
  }, [handleLocalUpdate, setCargaDiariaCache, localPlanejamentos, autoPlanejarAtividades, setDocLoading]);

  const handleRemoveExecutor = useCallback(async (doc) => {
    if (!doc?.id) return;
    setDocLoading(doc.id, true);
    try {
      const planejamentosDoDoc = localPlanejamentos.filter(p => p.documento_id === doc.id);
      if (planejamentosDoDoc.length > 0) {
        await Promise.all(planejamentosDoDoc.map(p =>
          p.tipo_plano === 'atividade'
            ? retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `removeExec-deleteAtiv-${p.id}`)
            : retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `removeExec-deleteDoc-${p.id}`)
        ));
        setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== doc.id));
      }
      const updatedDoc = await retryWithExtendedBackoff(
        () => Documento.update(doc.id, { executor_principal: null, inicio_planejado: null, termino_planejado: null }),
        `removeExec-${doc.id}`
      );
      handleLocalUpdate(updatedDoc);
      setCargaDiariaCache({});
    } catch (error) {
      alert('Erro ao remover executor.');
    } finally {
      setDocLoading(doc.id, false);
    }
  }, [localPlanejamentos, handleLocalUpdate, setCargaDiariaCache, setDocLoading]);

  const filteredDocumentos = useMemo(() => {
    let filtered = localDocumentos.filter(doc =>
      (doc.numero?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
      (doc.arquivo?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
      (doc.descritivo?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
    );
    if (filtroArea !== "todas") filtered = filtered.filter(doc => doc.pavimento_id === filtroArea);
    return filtered.sort((a, b) => (a.arquivo || '').trim().toLowerCase().localeCompare((b.arquivo || '').trim().toLowerCase(), 'pt-BR', { numeric: true, sensitivity: 'base' }));
  }, [localDocumentos, debouncedSearchTerm, filtroArea]);

  const documentosPorDisciplina = useMemo(() => {
    const grupos = {};
    filteredDocumentos.forEach(doc => {
      const disciplinasArr = Array.isArray(doc.disciplinas) ? doc.disciplinas : [];
      const disciplina = disciplinasArr.length > 0 ? disciplinasArr[0] : (doc.disciplina || 'Sem Disciplina');
      if (!grupos[disciplina]) grupos[disciplina] = [];
      grupos[disciplina].push(doc);
    });
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredDocumentos]);

  const etapasDisponiveis = ['Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra'];

  const usuariosOrdenados = useMemo(() => {
    const usuariosList = Array.isArray(usuarios) ? usuarios : [];
    return [...usuariosList].sort((a, b) => {
      const nomeA = a.nome || a.full_name || a.email || '';
      const nomeB = b.nome || b.full_name || b.email || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [usuarios]);

  const sharedProps = useMemo(() => ({
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
    atividadesEmpCache,
    handleRemoveExecutor,
    setExecutorPreSelecionado,
    registerLoadingSetter,
  }), [localDocumentos, localPlanejamentos, setLocalPlanejamentos, handleLocalUpdate, setCargaDiariaCache, getCargaDiariaExecutor, handleCascadingUpdate, autoPlanejarAtividades, expandedRows, toggleRow, usuariosOrdenados, pavimentos, handleEditAtividade, atividadesEmpCache, handleRemoveExecutor, setExecutorPreSelecionado, registerLoadingSetter]);

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0 bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-lg">Documentos ({filteredDocumentos.length})</span>
            {readOnly && <Badge variant="outline" className="ml-2 text-xs">Somente Visualização</Badge>}
          </div>
          {!readOnly && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExportData} className="border-blue-500 text-blue-600 hover:bg-blue-50">
                <Download className="w-4 h-4 mr-2" />Exportar
              </Button>
              <Button variant="outline" onClick={() => setShowImportModal(true)} className="border-green-500 text-green-600 hover:bg-green-50">
                <Upload className="w-4 h-4 mr-2" />Importar
              </Button>
              <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />Novo Documento
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6">
          {etapaParaPlanejamento !== "todas" && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-800">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium">Modo: Planejamento "{etapaParaPlanejamento}"</span>
              </div>
            </div>
          )}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input placeholder="Buscar documentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="font-semibold text-lg">Documentos Cadastrados ({filteredDocumentos.length})</span>
            <div className="flex items-center gap-2">
              <Label htmlFor="etapa-planejamento" className="text-sm font-medium whitespace-nowrap">Planejar Etapa:</Label>
              <Select value={etapaParaPlanejamento} onValueChange={onEtapaChange}>
                <SelectTrigger id="etapa-planejamento" className="w-[180px]">
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as etapas</SelectItem>
                  {etapasDisponiveis.map(etapa => <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-area" className="text-sm font-medium whitespace-nowrap">Filtrar por Área:</Label>
              <Select value={filtroArea} onValueChange={setFiltroArea}>
                <SelectTrigger id="filtro-area" className="w-[180px]">
                  <SelectValue placeholder="Todas as áreas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as áreas</SelectItem>
                  {(pavimentos || []).map(pav => <SelectItem key={pav.id} value={pav.id}>{pav.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-500">Carregando documentos...</span>
            </div>
          ) : filteredDocumentos.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">Nenhum documento encontrado</p>
              <p className="text-gray-400 text-sm">{debouncedSearchTerm ? "Tente ajustar sua busca" : "Adicione documentos ao projeto para começar"}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {documentosPorDisciplina.map(([disciplina, docs]) => {
                const isMinimizado = disciplinasMinimizadas[disciplina] !== false;
                return (
                  <div key={disciplina} className="border rounded-lg overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b flex items-center justify-between cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
                      onClick={() => setDisciplinasMinimizadas(prev => {
                        const current = prev[disciplina] !== false;
                        return { ...prev, [disciplina]: !current };
                      })}>
                      <h3 className="font-semibold text-lg text-gray-800 flex items-center gap-2">
                        <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                        {disciplina}
                        <Badge variant="secondary" className="ml-2">{docs.length} {docs.length === 1 ? 'documento' : 'documentos'}</Badge>
                      </h3>
                      <button className="p-1 hover:bg-blue-200 rounded transition-colors">
                        {isMinimizado ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                    {!isMinimizado && (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="w-[50px] p-3"></th>
                              <th className="p-3 text-left text-sm font-medium">Número</th>
                              <th className="p-3 text-left text-sm font-medium">Arquivo</th>
                              <th className="p-3 text-left text-sm font-medium">Descritivo</th>
                              <th className="p-3 text-left text-sm font-medium">Subdisciplina</th>
                              <th className="p-3 text-left text-sm font-medium">Escala</th>
                              {!readOnly && <th className="p-3 text-left text-sm font-medium">Executor</th>}
                              {!readOnly && <th className="p-3 text-left text-sm font-medium">Datas</th>}
                              {!readOnly && <th className="p-3 text-left text-sm font-medium">Tempo</th>}
                              {!readOnly && <th className="p-3 text-left text-sm font-medium w-[130px]">Ações</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {docs.map(doc => (
                              <DocumentoItem
                                key={doc.id}
                                doc={doc}
                                planejamentos={localPlanejamentos}
                                allAtividades={allAtividades}
                                handleEdit={handleEdit}
                                handleDelete={handleDelete}
                                handleOpenDocEtapaModal={handleOpenDocEtapaModal}
                                handlePredecessoraChange={handlePredecessoraChange}
                                handleDataInicioChange={handleDataInicioChange}
                                etapaParaPlanejamento={etapaParaPlanejamento}
                                empreendimento={empreendimento}
                                onUpdate={onUpdate}
                                readOnly={readOnly}
                                {...sharedProps}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AnimatePresence>
        {showForm && (
          <DocumentoForm
            doc={editingDocumento}
            empreendimentoId={empreendimento.id}
            empreendimentoNome={empreendimento.nome}
            empreendimento={empreendimento}
            onClose={() => { setShowForm(false); setEditingDocumento(null); }}
            onSave={handleSuccess}
            disciplinas={disciplinas}
            atividades={allAtividades}
            pavimentos={pavimentos}
            documentos={localDocumentos}
          />
        )}
      </AnimatePresence>

      {isDocEtapaModalOpen && documentForDocEtapaModal && (
        <PlanejamentoDocumentoEtapaModal
          documento={{ ...documentForDocEtapaModal, empreendimento_etapas: empreendimento?.etapas || [] }}
          usuarios={usuariosOrdenados}
          empreendimentoId={empreendimento.id}
          allAtividades={allAtividades}
          executorPadrao={executorPreSelecionado}
          etapaParaPlanejamento={etapaParaPlanejamento}
          isOpen={isDocEtapaModalOpen}
          onClose={handleCloseDocEtapaModal}
          onSuccess={handleSaveDocEtapaPlanning}
        />
      )}

      {isDocDataModalOpen && documentForDocDataModal && (
        <PlanejamentoDocumentoDataModal
          documento={documentForDocDataModal}
          documentos={localDocumentos}
          planejamentosDoc={localPlanejamentos}
          isOpen={isDocDataModalOpen}
          onClose={() => { setIsDocDataModalOpen(false); setDocumentForDocDataModal(null); }}
          onSuccess={() => { onUpdate(); setIsDocDataModalOpen(false); setDocumentForDocDataModal(null); }}
        />
      )}

      {showAtividadeForm && (
        <AtividadeFormModal
          isOpen={showAtividadeForm}
          onClose={() => { setShowAtividadeForm(false); setEditingAtividade(null); }}
          empreendimentoId={empreendimento.id}
          disciplinas={disciplinas}
          atividade={editingAtividade}
          onSuccess={handleAtividadeSuccess}
        />
      )}

      {showImportModal && (
        <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Importar Documentos</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">📋 Instruções</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Envie um arquivo CSV com os documentos</li>
                  <li>• Colunas obrigatórias: <code className="bg-white px-1 rounded">numero</code>, <code className="bg-white px-1 rounded">arquivo</code></li>
                  <li>• Colunas opcionais: descritivo, pavimento_nome, disciplinas, subdisciplinas, escala, fator_dificuldade</li>
                  <li>• Múltiplas disciplinas/subdisciplinas separadas por vírgula</li>
                  <li>• Colunas de datas no formato ETAPA_REVISAO (ex: ESTUDO PRELIMINAR_R00)</li>
                  <li>• Formato de data: DD/MM/AAAA</li>
                </ul>
              </div>
              <Button variant="outline" onClick={handleExportTemplate} className="w-full">
                <Download className="w-4 h-4 mr-2" />Baixar Template CSV
              </Button>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <input type="file" accept=".csv" onChange={(e) => setImportFile(e.target.files?.[0] || null)} className="w-full" />
                {importFile && <p className="text-sm text-green-600 mt-2">✓ Arquivo selecionado: {importFile.name}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowImportModal(false); setImportFile(null); }} disabled={isImporting}>Cancelar</Button>
                <Button onClick={handleImport} disabled={!importFile || isImporting} className="bg-green-600 hover:bg-green-700">
                  {isImporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : <><Upload className="w-4 h-4 mr-2" />Importar</>}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}