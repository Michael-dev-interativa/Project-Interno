import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Documento, Disciplina, Atividade, Execucao, Usuario, PlanejamentoAtividade, PlanejamentoDocumento, DataCadastro } from "@/entities/all";
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, ChevronDown, ChevronRight, BarChart, CalendarDays, FileText, Loader2, Users2, CalendarIcon, Check, Upload, Download, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import DocumentoForm from "./DocumentoForm";
import AtividadeFormModal from "./AtividadeFormModal";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import PlanejamentoDocumentoEtapaModal from './PlanejamentoDocumentoEtapaModal';
import PlanejamentoDocumentoDataModal from './PlanejamentoDocumentoDataModal';
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';
import { getNextWorkingDay, distribuirHorasPorDias, isWorkingDay, calculateEndDate, ensureWorkingDay } from '../utils/DateCalculator';
import { format, isValid, parseISO, addDays, subDays } from 'date-fns';
import { retryWithBackoff, retryWithExtendedBackoff, delay } from '../utils/apiUtils';

const parseDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  const date = new Date(`${dateString}T00:00:00`);
  return date;
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
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

const parseTempoNumber = (value) => {
  const tempo = Number.parseFloat(value);
  return Number.isFinite(tempo) ? tempo : null;
};

const hasStatusMarker = (ativ, marker) => {
  const atividade = String(ativ?.atividade || '').toLowerCase();
  const titulo = String(ativ?.titulo || '').toLowerCase();
  const m = String(marker || '').toLowerCase();
  return atividade.includes(m) || titulo.includes(m);
};

const isValidGenericTemplateActivity = (ativ) => {
  if (ativ?.empreendimento_id) return false;
  const tempo = parseTempoNumber(ativ?.tempo);
  if (tempo === null || tempo <= 0) return false;
  if (hasStatusMarker(ativ, 'excluida da folha')) return false;
  if (hasStatusMarker(ativ, 'concluida na folha')) return false;
  return true;
};

const toPairKey = (disciplina, subdisciplina) => `${disciplina || ''}|||${subdisciplina || ''}`;

const buildImportedPairs = (atividades) => {
  return new Set(
    (atividades || [])
      .filter((a) => isValidGenericTemplateActivity(a) && a.id_atividade)
      .map((a) => toPairKey(a.disciplina, a.subdisciplina))
  );
};

const normalizeComparable = (value) => {
  if (value == null) return '';
  let text = String(value).trim();
  if (!text) return '';

  text = text
    .replace(/^\[\s*/, '')
    .replace(/\s*\]$/, '')
    .replace(/""/g, '"')
    .trim();

  while (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    text = text.slice(1, -1).trim();
  }

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

const toPairKeyNormalized = (disciplina, subdisciplina) => `${normalizeComparable(disciplina)}|||${normalizeComparable(subdisciplina)}`;

const parseDecimalFlexible = (value) => {
  if (value == null || value === '') return null;
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/^\uFEFF/, '').replace(/\u00a0/g, ' ').replace(/\s+/g, '');
  text = text.replace(/[^0-9,\.\-+eE]/g, '');
  if (!text) return null;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma) {
    text = text.replace(',', '.');
  }

  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const normalizeImportedCell = (value) => {
  if (value == null) return '';
  return String(value)
    .replace(/^\uFEFF/, '')
    .replace(/\u00A0/g, ' ')
    .trim();
};

const scoreDecodedImportText = (text) => {
  if (!text) return Number.MAX_SAFE_INTEGER;

  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  const mojibakeCount = (text.match(/Ã.|Â.|â€|â€œ|â€|â€“|â€”|â€¢|ðŸ/g) || []).length;
  const controlCharCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;

  return (replacementCount * 1000) + (mojibakeCount * 100) + (controlCharCount * 10);
};

const decodeImportFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const encodings = ['utf-8', 'windows-1252', 'iso-8859-1'];
  const candidates = [];

  encodings.forEach((encoding, index) => {
    try {
      const decoder = new TextDecoder(encoding, { fatal: false });
      const decoded = decoder.decode(bytes);
      candidates.push({
        encoding,
        decoded,
        score: scoreDecodedImportText(decoded),
        priority: index,
      });
    } catch (error) {
      console.warn(`Falha ao decodificar arquivo com ${encoding}:`, error);
    }
  });

  if (!candidates.length) {
    throw new Error('Não foi possível ler o arquivo de importação.');
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.priority - b.priority;
  });

  return candidates[0].decoded.replace(/^\uFEFF/, '');
};

const splitCsvLine = (line, separator) => {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === separator && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out;
};

const DISCIPLINA_ALIASES = new Map([
  ['eletrica', 'elétrica'],
  ['incendio', 'incêndio'],
  ['hidraulica', 'hidráulica'],
]);

const normalizeDisciplinaToken = (value) => {
  const norm = normalizeComparable(value);
  if (!norm) return '';
  return DISCIPLINA_ALIASES.get(norm) || norm;
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

  const [expandedSequencing, setExpandedSequencing] = useState({});

  const [loadingDocs, setLoadingDocs] = useState({});

  const [localDocumentos, setLocalDocumentos] = useState(documentos);
  const [localPlanejamentos, setLocalPlanejamentos] = useState(planejamentos);

  const [executorPreSelecionado, setExecutorPreSelecionado] = useState(null);

  const [cargaDiariaCache, setCargaDiariaCache] = useState({});
  const [disciplinasMinimizadas, setDisciplinasMinimizadas] = useState({});

  const getDocumentoDisciplinas = useCallback((doc) => {
    if (Array.isArray(doc?.disciplinas) && doc.disciplinas.length > 0) {
      return doc.disciplinas.filter(Boolean);
    }
    if (doc?.disciplina_id && Array.isArray(disciplinas)) {
      const disciplinaObj = disciplinas.find(d => String(d.id) === String(doc.disciplina_id));
      if (disciplinaObj?.nome) {
        return [disciplinaObj.nome];
      }
    }
    if (doc?.disciplina) {
      return [doc.disciplina];
    }
    return [];
  }, [disciplinas]);

  const getDocumentoDisciplinaPrincipal = useCallback((doc) => {
    const disciplinasDoc = getDocumentoDisciplinas(doc);
    return disciplinasDoc[0] || 'Sem Disciplina';
  }, [getDocumentoDisciplinas]);

  // Fast index for collapsed rows: base time by disciplina/subdisciplina (+ etapa).
  const genericTempoIndex = useMemo(() => {
    const importedPairs = buildImportedPairs(allAtividades);
    const byPair = new Map();
    const byPairEtapa = new Map();

    (allAtividades || []).forEach((ativ) => {
      if (!isValidGenericTemplateActivity(ativ)) return;

      if (!ativ.id_atividade && importedPairs.has(toPairKey(ativ.disciplina, ativ.subdisciplina))) {
        return;
      }

      const pairKey = toPairKeyNormalized(ativ.disciplina, ativ.subdisciplina);
      const etapaKey = normalizeComparable(ativ.etapa);
      const tempoBase = parseFloat(ativ.tempo) || 0;
      if (tempoBase <= 0) return;

      byPair.set(pairKey, (byPair.get(pairKey) || 0) + tempoBase);
      const pairEtapaKey = `${pairKey}|||${etapaKey}`;
      byPairEtapa.set(pairEtapaKey, (byPairEtapa.get(pairEtapaKey) || 0) + tempoBase);
    });

    return { byPair, byPairEtapa };
  }, [allAtividades]);

  useEffect(() => {
    setLocalDocumentos(documentos);
  }, [documentos]);

  useEffect(() => {
    setLocalPlanejamentos(planejamentos);
  }, [planejamentos]);

  // Debug: log readOnly to trace why 'Novo Documento' não aparece
  useEffect(() => {
    try {
      console.log('📌 [DocumentosTab] readOnly prop:', readOnly);
    } catch (e) {
      console.warn('Erro ao logar readOnly em DocumentosTab:', e);
    }
  }, [readOnly]);

  // Dev override: quando existir localStorage.dev_user, permitir edição localmente
  const devOverride = typeof window !== 'undefined' && !!window.localStorage.getItem('dev_user');
  const effectiveReadOnly = devOverride ? false : readOnly;

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
    if (!forceRefresh && cargaDiariaCache[executorEmail]) {
      console.log(`✅ Usando cache de carga para ${executorEmail}`);
      return cargaDiariaCache[executorEmail];
    }

    console.log(`🔄 Buscando carga do executor ${executorEmail}...`);

    const [planosAtividade, planosDocumento] = await Promise.all([
      retryWithExtendedBackoff(
        () => PlanejamentoAtividade.filter({ executor_principal: executorEmail }),
        'loadAllPlansAtividade'
      ),
      retryWithExtendedBackoff(
        () => PlanejamentoDocumento.filter({ executor_principal: executorEmail }),
        'loadAllPlansDocumento'
      )
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
          } catch (erro) {
            console.warn(`Erro ao processar data ${data}:`, erro);
          }
        });
      }
    });

    setCargaDiariaCache(prev => ({ ...prev, [executorEmail]: cargaDiaria }));
    return cargaDiaria;
  }, [cargaDiariaCache]);


  const handleCascadingUpdate = useCallback(async (startDoc) => {
    let docsToUpdateQueue = [{ ...startDoc }];
    const updatedDocsMap = new Map();
    updatedDocsMap.set(startDoc.id, { ...startDoc });

    const currentDocStateMap = new Map(localDocumentos.map(d => [d.id, { ...d }]));
    currentDocStateMap.set(startDoc.id, { ...startDoc });

    let totalDocsUpdatedInCascade = 0;

    try {
      while (docsToUpdateQueue.length > 0) {
        const currentDoc = docsToUpdateQueue.shift();

        const children = localDocumentos.filter(d => d.predecessora_id === currentDoc.id);

        for (const child of children) {
          setLoadingDocs(prev => ({ ...prev, [child.id]: true }));

          const currentPredecessorState = updatedDocsMap.get(child.predecessora_id) || currentDocStateMap.get(child.predecessora_id);

          if (currentPredecessorState && currentPredecessorState.termino_planejado && isValid(parseDate(currentPredecessorState.termino_planejado))) {
            const dataTerminoPredecessor = parseDate(currentPredecessorState.termino_planejado);

            let novaDataInicio = ensureWorkingDay(dataTerminoPredecessor);

            const subdisciplinasChild = child.subdisciplinas || [];
            const disciplinaChild = child.disciplina;
            const fatorDificuldadeChild = child.fator_dificuldade || 1;
            const subdisciplinasChildSet = new Set((subdisciplinasChild || []).map(normalizeComparable).filter(Boolean));
            const disciplinaChildKey = normalizeComparable(disciplinaChild);

            const pavimentoChild = (pavimentos || []).find(p => p.id === child.pavimento_id);
            const areaPavimentoChild = pavimentoChild ? Number(pavimentoChild.area) : null;

            const etapaOverridesChild = new Map();
            const tempoOverridesChild = new Map();
            const importedPairsChild = buildImportedPairs(allAtividades);

            allAtividades.forEach(ativ => {
              if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade && ativ.tempo !== -999) {
                etapaOverridesChild.set(ativ.id_atividade, ativ.etapa);
                tempoOverridesChild.set(ativ.id_atividade, ativ.tempo);
              }
            });

            let atividadesGeraisChild = allAtividades.filter(ativ => {
              if (!isValidGenericTemplateActivity(ativ)) {
                return false;
              }
              const disciplinaMatch = normalizeComparable(ativ.disciplina) === disciplinaChildKey;
              const subdisciplinaMatch = subdisciplinasChildSet.has(normalizeComparable(ativ.subdisciplina));
              if (!disciplinaMatch || !subdisciplinaMatch) {
                return false;
              }
              if (!ativ.id_atividade && importedPairsChild.has(toPairKey(ativ.disciplina, ativ.subdisciplina))) {
                return false;
              }
              return true;
            });

            const atividadesExcluidasGlobalChild = new Set();
            const atividadesExcluidasPorDocChild = new Set();

            allAtividades.forEach(ativ => {
              if (ativ.empreendimento_id === empreendimento.id && ativ.tempo === -999 && ativ.id_atividade) {
                if (ativ.documento_id === child.id) {
                  atividadesExcluidasPorDocChild.add(ativ.id_atividade);
                } else if (!ativ.documento_id) {
                  atividadesExcluidasGlobalChild.add(ativ.id_atividade);
                }
              }
            });

            atividadesGeraisChild = atividadesGeraisChild.filter(ativ =>
              !atividadesExcluidasGlobalChild.has(ativ.id) &&
              !atividadesExcluidasPorDocChild.has(ativ.id)
            );

            const atividadesParaCalculoChild = atividadesGeraisChild.filter(ativ => {
              const etapaFinal = etapaOverridesChild.has(ativ.id) ? etapaOverridesChild.get(ativ.id) : ativ.etapa;
              if (etapaParaPlanejamento !== "todas") {
                return etapaFinal === etapaParaPlanejamento;
              }
              return true;
            });

            const tempoTotalChild = atividadesParaCalculoChild.reduce((total, ativ) => {
              const tempoBase = tempoOverridesChild.has(ativ.id)
                ? parseFloat(tempoOverridesChild.get(ativ.id)) || 0
                : parseFloat(ativ.tempo) || 0;
              // "Confecção de A-" usa apenas horas x pav (sem fator de dificuldade)
              const isConfeccaoA = ativ.atividade && String(ativ.atividade).trim().startsWith('Confecção de A-');
              const multiplier = isConfeccaoA ? 1 : fatorDificuldadeChild;
              const tempoCalculado = tempoBase * multiplier;
              return total + tempoCalculado;
            }, 0);

            let novaDataTermino = null;
            if (tempoTotalChild > 0 && isValid(novaDataInicio)) {
              novaDataTermino = calculateEndDate(novaDataInicio, tempoTotalChild, 8);
            }

            const newInicioStr = isValid(novaDataInicio) ? format(novaDataInicio, 'yyyy-MM-dd') : null;
            const newTerminoStr = isValid(novaDataTermino) ? format(novaDataTermino, 'yyyy-MM-dd') : null;

            if (newInicioStr !== child.inicio_planejado || newTerminoStr !== child.termino_planejado || tempoTotalChild !== child.tempo_total) {
              const childUpdated = {
                ...child,
                inicio_planejado: newInicioStr,
                termino_planejado: newTerminoStr,
                tempo_total: tempoTotalChild
              };
              console.log(`[Cascata] Atualizando ${child.numero}: Início ${newInicioStr}, Término ${newTerminoStr}, Tempo ${tempoTotalChild.toFixed(1)}h`);

              const dbUpdatedChild = await retryWithExtendedBackoff(() => Documento.update(child.id, {
                inicio_planejado: childUpdated.inicio_planejado,
                termino_planejado: childUpdated.termino_planejado,
                tempo_total: childUpdated.tempo_total
              }), `cascadeUpdate-${child.id}`);

              handleLocalUpdate(dbUpdatedChild);

              updatedDocsMap.set(dbUpdatedChild.id, dbUpdatedChild);
              currentDocStateMap.set(dbUpdatedChild.id, dbUpdatedChild);
              docsToUpdateQueue.push(dbUpdatedChild);
              totalDocsUpdatedInCascade++;
            } else {
              console.log(`[Cascata] Datas de ${child.numero} não mudaram.`);
            }
          }
          setLoadingDocs(prev => ({ ...prev, [child.id]: false }));
        }
      }
      if (totalDocsUpdatedInCascade > 0) {
        console.log(`✅ Cascata concluída. ${totalDocsUpdatedInCascade} documentos atualizados.`);
        setCargaDiariaCache({});
        // onUpdate() não é necessário - documentos já atualizados via handleLocalUpdate
      }
    } catch (error) {
      console.error("Erro durante cascata:", error);
      alert("Erro ao atualizar documentos em cascata.");
    } finally {
      setLoadingDocs({});
    }
  }, [handleLocalUpdate, allAtividades, localDocumentos, etapaParaPlanejamento, pavimentos, empreendimento.id, setCargaDiariaCache, onUpdate]);


  const autoPlanejarAtividades = useCallback(async (documento, etapa, executorEmail, metodoData, dataManualInicio) => {
    if (!documento?.id || !executorEmail || !etapa) {
      console.warn("🚫 Auto-planejamento ignorado: dados insuficientes.");
      alert("Dados insuficientes para planejar. Verifique documento, executor e etapa.");
      return;
    }

    if (etapa === 'todas') {
      alert("Por favor, selecione uma etapa específica no dropdown 'Planejar Etapa' antes de definir o executor.");
      return;
    }

    setLoadingDocs(prev => ({ ...prev, [documento.id]: true }));

    try {
      console.log(`\n🚀 ========================================`);
      console.log(`📋 PLANEJAMENTO DE DOCUMENTO (EXECUTOR ÚNICO)`);
      console.log(`   Documento: ${documento.numero}`);
      console.log(`   Etapa: ${etapa}`);
      console.log(`   Executor: ${executorEmail}`);
      console.log(`   Método de Data: ${metodoData}`);
      if (dataManualInicio) {
        console.log(`   Data Manual: ${dataManualInicio}`);
      }
      console.log(`🚀 ========================================\n`);

      const subdisciplinasDoc = documento.subdisciplinas || [];
      const disciplinasDoc = getDocumentoDisciplinas(documento);
      const disciplinasDocSet = new Set((disciplinasDoc || []).map(normalizeComparable).filter(Boolean));
      const subdisciplinasDocSet = new Set((subdisciplinasDoc || []).map(normalizeComparable).filter(Boolean));
      const fatorDificuldade = documento.fator_dificuldade || 1;

      const pavimento = (pavimentos || []).find(p => p.id === documento.pavimento_id);
      const areaPavimento = pavimento ? Number(pavimento.area) : null;

      const etapaOverrides = new Map();
      const tempoOverrides = new Map();
      const importedPairs = buildImportedPairs(allAtividades);

      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade && ativ.tempo !== -999) {
          etapaOverrides.set(ativ.id_atividade, ativ.etapa);
          tempoOverrides.set(ativ.id_atividade, ativ.tempo);
        }
      });

      // Construir lista de candidatos incluindo atividades do catálogo geral
      // e atividades específicas desta folha (atividades_empreendimento).
      const specificSourceIds = new Set(
        allAtividades
          .filter(ativ => ativ.empreendimento_id === empreendimento.id && ativ.documento_id === documento.id && ativ.tempo !== -999)
          .map(ativ => String(ativ.id_atividade || ''))
          .filter(Boolean)
      );

      let atividadesGerais = allAtividades.filter(ativ => {
        // Incluir atividades específicas vinculadas a este documento (tempo != -999)
        if (ativ.empreendimento_id === empreendimento.id && ativ.documento_id === documento.id && ativ.tempo !== -999) {
          return true;
        }

        // Incluir apenas atividades válidas do catálogo geral (não vinculadas a algum empreendimento)
        if (!isValidGenericTemplateActivity(ativ)) {
          return false;
        }

        const disciplinaMatch = disciplinasDocSet.has(normalizeComparable(ativ.disciplina));
        const subdisciplinaMatch = subdisciplinasDocSet.has(normalizeComparable(ativ.subdisciplina));
        if (!disciplinaMatch || !subdisciplinaMatch) {
          return false;
        }

        const sourceId = String(ativ.id_atividade || ativ.id || '');
        if (sourceId && specificSourceIds.has(sourceId)) {
          return false;
        }

        if (!ativ.id_atividade && importedPairs.has(toPairKey(ativ.disciplina, ativ.subdisciplina))) {
          return false;
        }
        return true;
      });

      const atividadesExcluidasGlobal = new Set();
      const atividadesExcluidasPorDoc = new Set();

      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.tempo === -999 && ativ.id_atividade) {
          if (ativ.documento_id === documento.id) {
            atividadesExcluidasPorDoc.add(ativ.id_atividade);
          } else if (!ativ.documento_id) {
            atividadesExcluidasGlobal.add(ativ.id_atividade);
          }
        }
      });

      atividadesGerais = atividadesGerais.filter(ativ =>
        !atividadesExcluidasGlobal.has(ativ.id) &&
        !atividadesExcluidasPorDoc.has(ativ.id)
      );

      console.log('📋 Debug filtros: disciplinasDoc=', disciplinasDoc, 'subdisciplinasDoc=', subdisciplinasDoc);
      console.log(`📊 Atividades gerais candidatas: ${atividadesGerais.length}`);
      atividadesGerais.forEach(ativ => {
        const etapaFinal = etapaOverrides.has(ativ.id) ? etapaOverrides.get(ativ.id) : ativ.etapa;
        console.log(`   - id:${ativ.id} titulo:"${ativ.atividade || ativ.titulo || ''}" etapa:"${ativ.etapa}" etapaFinal:"${etapaFinal}" tempo:${ativ.tempo}`);
      });

      const atividadesDaEtapa = atividadesGerais.filter(ativ => {
        const etapaFinal = etapaOverrides.has(ativ.id) ? etapaOverrides.get(ativ.id) : ativ.etapa;
        return etapaFinal === etapa;
      });

      console.log(`📊 Atividades encontradas para etapa "${etapa}": ${atividadesDaEtapa.length}`);

      if (atividadesDaEtapa.length === 0) {
        alert(`Nenhuma atividade encontrada para a etapa "${etapa}".`);
        return;
      }

      const tempoTotal = atividadesDaEtapa.reduce((total, ativ) => {
        const tempoBase = tempoOverrides.has(ativ.id)
          ? parseFloat(tempoOverrides.get(ativ.id)) || 0
          : parseFloat(ativ.tempo) || 0;
        // "Confecção de A-" usa apenas horas x pav (sem fator de dificuldade)
        const isConfeccaoA = ativ.atividade && String(ativ.atividade).trim().startsWith('Confecção de A-');
        const multiplier = isConfeccaoA ? 1 : fatorDificuldade;
        const tempoCalculado = tempoBase * multiplier;
        return total + tempoCalculado;
      }, 0);

      console.log(`⏱️ Tempo total calculado: ${tempoTotal.toFixed(1)}h (com fator ${fatorDificuldade} e área ${areaPavimento ? areaPavimento + 'm²' : 'N/A'})`);

      const planejamentosAtividadeAntigos = localPlanejamentos.filter(p =>
        p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'atividade'
      );

      if (planejamentosAtividadeAntigos.length > 0) {
        console.log(`🧹 Removendo ${planejamentosAtividadeAntigos.length} planejamentos de atividade antigos da etapa "${etapa}"...`);
        await Promise.all(planejamentosAtividadeAntigos.map(p =>
          retryWithBackoff(() => PlanejamentoAtividade.delete(p.id), 3, 1000, `deleteOldAtiv-${p.id}`)
        ));
        setLocalPlanejamentos(prev => prev.filter(p =>
          !(p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'atividade')
        ));
      }

      const planejamentosDocumentoAntigos = localPlanejamentos.filter(p =>
        p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'documento'
      );

      if (planejamentosDocumentoAntigos.length > 0) {
        console.log(`🧹 Removendo ${planejamentosDocumentoAntigos.length} planejamentos de documento antigos da etapa "${etapa}"...`);
        await Promise.all(planejamentosDocumentoAntigos.map(p =>
          retryWithBackoff(() => PlanejamentoDocumento.delete(p.id), 3, 1000, `deleteOldDocPlan-${p.id}`)
        ));
        setLocalPlanejamentos(prev => prev.filter(p =>
          !(p.documento_id === documento.id && p.etapa === etapa && p.tipo_plano === 'documento')
        ));
      }

      console.log(`\n🔄 Buscando agenda completa do executor...`);
      const cargaDiaria = await getCargaDiariaExecutor(executorEmail, true);

      let dataInicio;
      const hoje = new Date();
      const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

      const findPrimeiroDiaUtilDisponivel = () => {
        console.log(`\n🔍 Procurando primeiro dia útil disponível...`);
        let diaDisponivel = new Date(hojeMidnight);
        let tentativas = 0;
        const maxTentativas = 365;

        while (tentativas < maxTentativas) {
          if (isWorkingDay(diaDisponivel)) {
            const diaKey = format(diaDisponivel, 'yyyy-MM-dd');
            const cargaDoDia = cargaDiaria[diaKey] || 0;
            const disponivel = 8 - cargaDoDia;

            if (disponivel >= 0.5) {
              console.log(`   ✅ Primeiro dia disponível: ${format(diaDisponivel, 'dd/MM/yyyy')} (${disponivel.toFixed(1)}h livres)`);
              return diaDisponivel;
            }
          }

          diaDisponivel = addDays(diaDisponivel, 1);
          tentativas++;
        }

        throw new Error(`Não foi possível encontrar uma data disponível na agenda do executor.`);
      };

      if (metodoData === 'manual' && dataManualInicio) {
        const parsedManualDate = parseISO(dataManualInicio);
        if (!isValid(parsedManualDate)) {
          throw new Error(`Data manual de início inválida: ${dataManualInicio}`);
        }

        dataInicio = parsedManualDate;
        console.log(`\n📅 Usando data manual: ${format(dataInicio, 'dd/MM/yyyy')}`);

      } else if (documento.predecessora_id) {
        const predecessora = localDocumentos.find(d => d.id === documento.predecessora_id);
        const predecessorTerminoFromDoc = predecessora?.termino_planejado;

        const predecessorPlans = localPlanejamentos
          .filter((p) => p.documento_id === documento.predecessora_id && p.termino_planejado)
          .map((p) => parseDate(p.termino_planejado))
          .filter((d) => isValid(d))
          .sort((a, b) => b - a);

        const predecessorTerminoFromPlan = predecessorPlans.length ? predecessorPlans[0] : null;
        const predecessorTerminoDate = predecessorTerminoFromDoc && isValid(parseDate(predecessorTerminoFromDoc))
          ? parseDate(predecessorTerminoFromDoc)
          : predecessorTerminoFromPlan;

        if (!predecessora) {
          throw new Error(`Predecessora '${documento.predecessora_id}' não foi encontrada.`);
        }

        if (!predecessorTerminoDate) {
          console.warn(`⚠️ Predecessora '${predecessora.numero || documento.predecessora_id}' sem término planejado. Usando primeiro dia útil disponível.`);
          dataInicio = findPrimeiroDiaUtilDisponivel();
          console.log(`📅 Planejamento iniciado sem referência de predecessora para ${documento.numero}.`);
        } else {
          const dataTerminoPredecessor = predecessorTerminoDate;
          dataInicio = ensureWorkingDay(dataTerminoPredecessor);

          console.log(`\n📅 Predecessora termina em: ${format(dataTerminoPredecessor, 'dd/MM/yyyy')}`);
          console.log(`📅 Começando busca a partir de: ${format(dataInicio, 'dd/MM/yyyy')}`);
          console.log(`✅ distribuirHorasPorDias vai verificar espaços disponíveis a partir deste dia`);
        }

      } else {
        dataInicio = findPrimeiroDiaUtilDisponivel();
      }

      console.log(`\n🔄 Distribuindo ${tempoTotal.toFixed(1)}h a partir de ${format(dataInicio, 'dd/MM/yyyy')}...`);

      const { distribuicao, dataTermino, novaCargaDiaria } = distribuirHorasPorDias(
        dataInicio,
        tempoTotal,
        8,
        cargaDiaria,
        metodoData === 'manual'
      );

      if (!distribuicao || Object.keys(distribuicao).length === 0) {
        throw new Error(`Não foi possível distribuir as horas na agenda.`);
      }

      if (metodoData !== 'manual') {
        let ultrapassou = false;
        Object.entries(distribuicao).forEach(([data, horas]) => {
          const cargaTotal = novaCargaDiaria[data] || 0;
          if (cargaTotal > 8.01) {
            console.error(`❌ DIA ${data} ULTRAPASSOU 8H: ${cargaTotal.toFixed(2)}h`);
            ultrapassou = true;
          }
        });

        if (ultrapassou) {
          throw new Error(`A distribuição resultou em um dia com mais de 8h.`);
        }
      }

      const diasUtilizados = Object.keys(distribuicao).sort();
      const inicioPlanejado = diasUtilizados[0];
      const terminoPlanejado = format(dataTermino, 'yyyy-MM-dd');

      console.log(`\n📊 Distribuição realizada:`);
      console.log(`   Período: ${inicioPlanejado} a ${terminoPlanejado}`);
      console.log(`   Dias utilizados: ${diasUtilizados.length}`);

      diasUtilizados.forEach(dia => {
        const horasDoDia = distribuicao[dia];
        const cargaTotalDoDia = novaCargaDiaria[dia];
        console.log(`      ${dia}: ${horasDoDia.toFixed(1)}h (carga total: ${cargaTotalDoDia.toFixed(1)}h)`);
      });

      const dadosPlanoDocumento = {
        empreendimento_id: empreendimento.id,
        documento_id: documento.id,
        descritivo: `${documento.numero} - ${etapa}`,
        etapa: etapa,
        executor_principal: executorEmail,
        executores: [executorEmail],
        tempo_planejado: tempoTotal,
        inicio_planejado: inicioPlanejado,
        termino_planejado: terminoPlanejado,
        horas_por_dia: distribuicao,
        status: 'nao_iniciado',
        prioridade: 1,
        tipo_plano: 'documento'
      };

      console.log(`\n💾 Criando PlanejamentoDocumento...`);
      const novoPlano = await retryWithBackoff(
        () => PlanejamentoDocumento.create(dadosPlanoDocumento),
        3, 1000, 'createPlanDocumento'
      );

      console.log(`✅ PlanejamentoDocumento criado: ID ${novoPlano.id}`);

      const docAtualizado = await retryWithBackoff(
        () => Documento.update(documento.id, {
          executor_principal: executorEmail,
          inicio_planejado: inicioPlanejado,
          termino_planejado: terminoPlanejado,
          tempo_total: tempoTotal,
          multiplos_executores: false
        }),
        3, 1000, `updateDoc-${documento.id}`
      );

      handleLocalUpdate(docAtualizado);
      setLocalPlanejamentos(prev => prev.filter(p => !(p.documento_id === documento.id && p.etapa === etapa)).concat(novoPlano));
      setCargaDiariaCache({});

      await handleCascadingUpdate(docAtualizado);

      console.log(`\n✅ PLANEJAMENTO CONCLUÍDO!`);
      console.log(`   Tempo total: ${tempoTotal.toFixed(1)}h`);
      console.log(`   Período: ${format(parseISO(inicioPlanejado), 'dd/MM/yyyy')} a ${format(parseISO(terminoPlanejado), 'dd/MM/yyyy')}`);

    } catch (error) {
      console.error("❌ Erro no planejamento automático:", error);
      let userMessage = `Erro no planejamento: ${error.message || error}`;
      if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
        userMessage = 'Problema de conexão. Verifique sua internet.';
      } else if (error.message?.includes('Rate limit')) {
        userMessage = 'Sistema ocupado. Aguarde alguns momentos.';
      }

      alert(userMessage);
      throw error;
    } finally {
      setLoadingDocs(prev => ({ ...prev, [documento.id]: false }));
    }
  }, [allAtividades, empreendimento, handleLocalUpdate, localPlanejamentos, setLocalPlanejamentos, pavimentos, getCargaDiariaExecutor, handleCascadingUpdate, localDocumentos, getDocumentoDisciplinas]);

  const handleSuccess = async (savedDoc) => {
    try {
      // atualizar localmente imediatamente para refletir o novo documento na UI
      if (savedDoc) {
        handleLocalUpdate(savedDoc);
      }
    } catch (e) {
      console.warn('Erro ao atualizar documentos localmente após salvar:', e);
    }
    // notificar pai para refetch quando necessário
    try { onUpdate(); } catch (e) { /* ignore */ }
    setShowForm(false);
    setEditingDocumento(null);
    setCargaDiariaCache({});
  };

  const handleExportTemplate = () => {
    // Buscar etapas e revisões do CadastroTab
    const etapasDisponiveis = [
      "ESTUDO PRELIMINAR",
      "ANTE-PROJETO",
      "PROJETO BÁSICO",
      "PROJETO EXECUTIVO",
      "LIBERADO PARA OBRA"
    ];
    const revisoesDefault = ["R00", "R01", "R02"];

    // Construir cabeçalhos: campos do documento + colunas de datas
    let headers = ['numero', 'arquivo', 'descritivo', 'pavimento_nome', 'disciplinas', 'subdisciplinas', 'escala', 'fator_dificuldade'];

    etapasDisponiveis.forEach(etapa => {
      revisoesDefault.forEach(rev => {
        headers.push(`${etapa}_${rev}`);
      });
    });

    const csvContent = [
      headers.join(';'),
      // Linha de exemplo com dados de documento e datas
      [
        'ARQ-01',
        'Planta Baixa Terreo',
        'Planta baixa do pavimento terreo com layout de moveis',
        'Terreo',
        'Arquitetura',
        'Planta,Compat',
        '125',
        '1',
        ...etapasDisponiveis.flatMap(() => revisoesDefault.map(() => '15/01/2025'))
      ].join(';')
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `template_documentos_cadastro_${empreendimento.nome.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const handleImport = async () => {
    if (!importFile) {
      alert('Selecione um arquivo para importar');
      return;
    }

    setIsImporting(true);
    try {
      const fileContent = await decodeImportFile(importFile);
      const lines = fileContent.split(/\r?\n/).filter(line => line.trim());

      if (lines.length < 2) {
        alert('Arquivo vazio ou inválido');
        return;
      }

      // Detectar separador (ponto-e-vírgula ou vírgula)
      const separator = lines[0].includes(';') ? ';' : ',';
      const headers = splitCsvLine(lines[0], separator).map((h) => normalizeImportedCell(h));
      const requiredHeaders = ['numero', 'arquivo'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));

      if (missingHeaders.length > 0) {
        alert(`Cabeçalhos obrigatórios faltando: ${missingHeaders.join(', ')}`);
        return;
      }

      const documentosParaImportar = [];
      const erros = [];

      const disciplinasIndex = new Map(
        (disciplinas || [])
          .filter((d) => d?.nome)
          .map((d) => [normalizeDisciplinaToken(d.nome), d])
      );

      for (let i = 1; i < lines.length; i++) {
        const values = splitCsvLine(lines[i], separator).map((v) => normalizeImportedCell(v));
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = normalizeImportedCell(values[idx] || '');
        });

        if (!row.numero || !row.arquivo) {
          erros.push(`Linha ${i + 1}: Número e Arquivo são obrigatórios`);
          continue;
        }

        // Buscar pavimento por nome
        const pavimento = row.pavimento_nome
          ? (pavimentos || []).find(p => p.nome?.toLowerCase() === row.pavimento_nome.toLowerCase())
          : null;

        // Processar disciplinas (separadas por vírgula ou ponto-e-vírgula)
        const disciplinasArray = row.disciplinas
          ? row.disciplinas.split(/[,;]/).map(s => normalizeImportedCell(s).replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '')).filter(s => s)
          : [];

        // Processar subdisciplinas (separadas por vírgula ou ponto-e-vírgula)
        const subdisciplinasArray = row.subdisciplinas
          ? row.subdisciplinas.split(/[,;]/).map(s => normalizeImportedCell(s)).filter(s => s)
          : [];

        // Validar se disciplinas existem no sistema
        const disciplinasValidas = disciplinasArray
          .map((d) => {
            const found = disciplinasIndex.get(normalizeDisciplinaToken(d));
            return found?.nome || null;
          })
          .filter(Boolean);

        if (disciplinasValidas.length === 0 && disciplinasArray.length > 0) {
          erros.push(`Linha ${i + 1}: Nenhuma disciplina válida encontrada em "${disciplinasArray.join(', ')}"`);
        }

        // Processar datas de cadastro (formato ETAPA_REVISAO)
        const datas = {};
        headers.forEach(header => {
          if (['numero', 'arquivo', 'descritivo', 'pavimento_nome', 'disciplinas', 'subdisciplinas', 'escala', 'fator_dificuldade'].includes(header)) {
            return;
          }

          const data = row[header];
          if (!data) return;

          // Formato esperado: "ETAPA_REVISAO"
          const parts = header.split('_');
          if (parts.length < 2) return;

          const revisao = parts.pop();
          const etapa = parts.join('_');

          // Converter data de dd/mm/aaaa para aaaa-mm-dd
          let dataFormatada = data;
          if (data.includes('/')) {
            const [dia, mes, ano] = data.split('/');
            if (dia && mes && ano) {
              dataFormatada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            }
          }

          if (!datas[etapa]) {
            datas[etapa] = {};
          }
          datas[etapa][revisao] = dataFormatada;
        });

        documentosParaImportar.push({
          numero: row.numero,
          arquivo: row.arquivo,
          descritivo: row.descritivo || '',
          disciplina: disciplinasValidas[0] || disciplinas[0]?.nome || '',
          disciplinas: disciplinasValidas.slice(0, 2),
          subdisciplinas: subdisciplinasArray,
          escala: row.escala ? parseDecimalFlexible(row.escala) : null,
          fator_dificuldade: row.fator_dificuldade ? (parseDecimalFlexible(row.fator_dificuldade) || 1) : 1,
          pavimento_id: pavimento?.id || null,
          empreendimento_id: empreendimento.id,
          tempo_total: 0,
          tempo_concepcao: 0,
          tempo_planejamento: 0,
          tempo_estudo_preliminar: 0,
          tempo_ante_projeto: 0,
          tempo_projeto_basico: 0,
          tempo_projeto_executivo: 0,
          tempo_liberado_obra: 0,
          datas: Object.keys(datas).length > 0 ? datas : null
        });
      }

      if (erros.length > 0) {
        alert(`Erros encontrados:\n${erros.join('\n')}\n\nContinuar com os documentos válidos?`);
      }

      if (documentosParaImportar.length === 0) {
        alert('Nenhum documento válido encontrado no arquivo');
        return;
      }

      let sucessos = 0;
      let falhas = 0;
      const documentosCriados = [];

      // Primeiro, importar documentos
      for (const doc of documentosParaImportar) {
        try {
          const docCriado = await retryWithBackoff(() => Documento.create(doc), 3, 1000, `importDoc-${doc.numero}`);
          documentosCriados.push({ original: doc, criado: docCriado });
          sucessos++;
        } catch (error) {
          console.error(`Erro ao importar ${doc.numero}:`, error);
          falhas++;
        }
      }

      // Agora, importar datas de cadastro se houver
      let sucessosCadastro = 0;
      let falhasCadastro = 0;

      for (const { original, criado } of documentosCriados) {
        if (original.datas && Object.keys(original.datas).length > 0) {
          try {
            await retryWithBackoff(() => DataCadastro.create({
              empreendimento_id: empreendimento.id,
              ordem: documentosCriados.indexOf(documentosCriados.find(d => d.criado.id === criado.id)),
              documento_id: criado.id,
              datas: original.datas
            }), 3, 1000, `importCadastro-${criado.id}`);
            sucessosCadastro++;
          } catch (error) {
            console.error(`Erro ao importar datas de ${original.numero}:`, error);
            falhasCadastro++;
          }
        }
      }

      let mensagem = `Importação concluída!\n\nDocumentos: ${sucessos} sucessos, ${falhas} falhas`;
      if (sucessosCadastro > 0 || falhasCadastro > 0) {
        mensagem += `\nDatas de Cadastro: ${sucessosCadastro} sucessos, ${falhasCadastro} falhas`;
      }

      alert(mensagem);

      if (sucessos > 0) {
        await onUpdate();
        setShowImportModal(false);
        setImportFile(null);
      }

    } catch (error) {
      console.error('Erro na importação:', error);
      alert(`Erro ao processar arquivo: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleEdit = (doc) => {
    setEditingDocumento(doc);
    setShowForm(true);
  };

  const handleEditAtividade = (atividade = null) => {
    setEditingAtividade(atividade);
    setShowAtividadeForm(true);
  };

  const handleAtividadeSuccess = async () => {
    // Salvar estado de expansão antes de atualizar
    const expandedState = { ...expandedRows };

    setShowAtividadeForm(false);
    setEditingAtividade(null);

    // Recarregar dados
    await onUpdate();

    // Restaurar estado de expansão após atualização
    setTimeout(() => {
      setExpandedRows(expandedState);
    }, 100);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir este documento?")) {
      try {
        // Remover registros de AtividadesEmpreendimento antes de excluir o documento
        try {
          const atividadesEmp = await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.filter({
              documento_id: id
            }),
            3, 500, `getAtividadesEmpParaExcluir-${id}`
          );

          console.log(`🗑️ Removendo ${atividadesEmp.length} registro(s) de AtividadesEmpreendimento...`);

          for (const atividadeEmp of atividadesEmp) {
            await retryWithBackoff(
              () => base44.entities.AtividadesEmpreendimento.delete(atividadeEmp.id),
              3, 500, `deleteAtividadeEmp-${atividadeEmp.id}`
            );
          }

          console.log(`✅ Registros removidos de AtividadesEmpreendimento`);
        } catch (error) {
          console.warn(`⚠️ Erro ao remover registros de AtividadesEmpreendimento:`, error);
        }

        await retryWithExtendedBackoff(() => Documento.delete(id), `deleteDocument-${id}`);
        setLocalDocumentos(prevDocs => prevDocs.filter(d => d.id !== id));
        setCargaDiariaCache({});
        onUpdate();
      } catch (error) {
        console.error("Erro ao excluir documento:", error);
        let errorMessage = "Ocorreu um erro ao excluir o documento.";
        if (error.message?.includes("ReplicaSetNoPrimary") || error.message?.includes("500")) {
          errorMessage = "Problema temporário com o servidor. Tente novamente.";
        } else if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
          errorMessage = 'Problema de conexão. Verifique sua internet.';
        } else if (error.message?.includes('Rate limit')) {
          errorMessage = 'Sistema ocupado. Aguarde alguns momentos.';
        }
        alert(errorMessage);
      }
    }
  };

  const handleOpenDocEtapaModal = useCallback((doc) => {
    console.log('📋 Abrindo planejamento por documento/etapa para:', doc.numero);
    setDocumentForDocEtapaModal(doc);
    setExecutorPreSelecionado(null);
    setIsDocEtapaModal(true);
  }, []);

  const handleCloseDocEtapaModal = useCallback(() => {
    setIsDocEtapaModal(false);
    setDocumentForDocEtapaModal(null);
    setExecutorPreSelecionado(null);
  }, []);

  const handleSaveDocEtapaPlanning = useCallback(() => {
    setCargaDiariaCache({});
    // Atualizar dados silenciosamente em background
    setTimeout(() => {
      retryWithBackoff(
        () => PlanejamentoAtividade.filter({ empreendimento_id: empreendimento.id }),
        3, 500, 'refreshPlanejamentosAtividadeSilent'
      ).then(plansAtividade => {
        retryWithBackoff(
          () => PlanejamentoDocumento.filter({ empreendimento_id: empreendimento.id }),
          3, 500, 'refreshPlanejamentosDocumentoSilent'
        ).then(plansDocumento => {
          const allPlans = [
            ...(plansAtividade || []).map(p => ({ ...p, tipo_plano: 'atividade' })),
            ...(plansDocumento || []).map(p => ({ ...p, tipo_plano: 'documento' }))
          ];
          setLocalPlanejamentos(allPlans);
        });
      }).catch(err => {
        console.warn("Erro ao atualizar planejamentos em background:", err);
      });
    }, 200);
    handleCloseDocEtapaModal();
    setExecutorPreSelecionado(null);
  }, [empreendimento.id, handleCloseDocEtapaModal]);

  const toggleRow = useCallback((id) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleSequencing = (id) => {
    setExpandedSequencing(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePredecessoraChange = useCallback(async (documentoId, predecessoraId) => {
    setLoadingDocs(prev => ({ ...prev, [documentoId]: true }));
    try {
      const documento = localDocumentos.find(d => d.id === documentoId);
      if (!documento) {
        console.warn(`[handlePredecessoraChange] Documento com ID ${documentoId} não encontrado.`);
        return;
      }

      // Se o documento já possui planejamento e a predecessora está sendo alterada, 
      // remover os planejamentos antigos para forçar replaneamento com as novas datas
      const planejamentosExistentes = localPlanejamentos.filter(p => p.documento_id === documentoId);
      if (planejamentosExistentes.length > 0) {
        console.log(`🧹 Removendo ${planejamentosExistentes.length} planejamentos antigos devido à mudança de predecessora...`);

        await Promise.all(planejamentosExistentes.map(p => {
          if (p.tipo_plano === 'atividade') {
            return retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `deleteOldPlanOnPredChange-${p.id}`);
          } else if (p.tipo_plano === 'documento') {
            return retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `deleteOldPlanDocOnPredChange-${p.id}`);
          }
          return Promise.resolve();
        }));

        setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== documentoId));
      }

      let updateData = {
        predecessora_id: predecessoraId,
        inicio_planejado: null,
        termino_planejado: null,
        tempo_total: 0
      };

      if (!predecessoraId) {
        if (!documento.multiplos_executores) {
          updateData.executor_principal = null;
        }
      }

      console.log(`🔧 [handlePredecessoraChange] Atualizando documento ${documentoId} com:`, updateData);

      const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(documentoId, updateData), `setPredecessor-${documentoId}`);

      handleLocalUpdate(updatedDocFromAPI);
      setCargaDiariaCache({});

      if (predecessoraId) {
        console.log(`✅ Predecessor definido para ${documento.numero}. Planejamentos antigos removidos. Datas serão calculadas ao atribuir executor.`);
        alert(`✅ Predecessora alterada! Os planejamentos antigos foram removidos.\n\nDefina o executor novamente para replanejar com as novas datas.`);
      } else {
        console.log(`✅ Predecessor removido de ${documento.numero}. Datas limpas.`);
      }

    } catch (error) {
      console.error('Erro ao definir predecessora:', error);

      let userMessage = 'Ocorreu um erro ao definir a predecessora.';
      if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
        userMessage = 'Problema de conexão. Verifique sua internet.';
      } else if (error.message?.includes('Rate limit')) {
        userMessage = 'Sistema ocupado. Aguarde alguns momentos.';
      }

      alert(userMessage);
    } finally {
      setLoadingDocs(prev => ({ ...prev, [documentoId]: false }));
    }
  }, [localDocumentos, localPlanejamentos, handleLocalUpdate, setCargaDiariaCache]);

  const handleDataInicioChange = useCallback(async (documentoId, novaDataStr) => {
    setLoadingDocs(prev => ({ ...prev, [documentoId]: true }));

    try {
      const documento = localDocumentos.find(d => d.id === documentoId);
      if (!documento) {
        console.warn(`[handleDataInicioChange] Documento com ID ${documentoId} não encontrado.`);
        return;
      }

      const novaDataInicio = parseDate(novaDataStr);
      if (!isValid(novaDataInicio)) {
        console.warn(`[handleDataInicioChange] Data de início inválida: ${novaDataStr}`);
        alert("Data de início inválida.");
        return;
      }

      let novaDataTermino = null;

      // Se o documento tem tempo total planejado, recalcular a data de término
      if (documento.tempo_total && documento.tempo_total > 0) {
        novaDataTermino = calculateEndDate(novaDataInicio, documento.tempo_total, 8);
      }

      const updateData = {
        inicio_planejado: novaDataStr
      };

      // Adicionar termino_planejado se foi calculado
      if (isValid(novaDataTermino)) {
        updateData.termino_planejado = format(novaDataTermino, 'yyyy-MM-dd');
      }

      console.log(`🔧 [handleDataInicioChange] Atualizando documento ${documentoId} com:`, updateData);

      const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(documentoId, updateData), `setStartDate-${documentoId}`);

      handleLocalUpdate(updatedDocFromAPI);
      setCargaDiariaCache({});

      console.log(`✅ Data de início para ${documento.numero} salva. Iniciando cascata automática...`);

      // Executar cascata automática para atualizar sucessoras
      await handleCascadingUpdate(updatedDocFromAPI);

      // Se o documento tem um executor principal, replanejar as atividades com a nova data
      if (updatedDocFromAPI.executor_principal && !updatedDocFromAPI.multiplos_executores) {
        console.log(`\n🔄 Replanejando atividades com a nova data de início...`);

        // Tentar replanejar para cada etapa que tem planejamento existente (ambos os tipos)
        const planejamentosDoDoc = localPlanejamentos.filter(p => p.documento_id === documentoId);
        const etapasComPlanejamento = [...new Set(planejamentosDoDoc.map(p => p.etapa))];

        console.log(`📊 Etapas com planejamento encontradas: ${etapasComPlanejamento.join(', ') || 'nenhuma'}`);

        if (etapasComPlanejamento.length > 0) {
          try {
            for (const etapa of etapasComPlanejamento) {
              console.log(`⏳ Replanejando etapa: ${etapa}...`);
              await autoPlanejarAtividades(
                updatedDocFromAPI,
                etapa,
                updatedDocFromAPI.executor_principal,
                'manual',
                novaDataStr
              );
            }
            console.log(`✅ Replanejamento concluído com sucesso!`);
          } catch (replanError) {
            console.error(`⚠️ Erro durante replanejamento:`, replanError);
          }
        } else {
          console.log(`ℹ️ Nenhuma etapa com planejamento encontrada para replanejamento automático`);
        }
      } else {
        console.log(`ℹ️ Replanejamento automático não aplicável (executor: ${updatedDocFromAPI.executor_principal}, multiplos: ${updatedDocFromAPI.multiplos_executores})`);
      }

    } catch (error) {
      console.error('Erro ao atualizar data de início:', error);

      let userMessage = 'Erro ao atualizar data de início.';
      if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
        userMessage = 'Problema de conexão. Verifique sua internet.';
      } else if (error.message?.includes('Rate limit')) {
        userMessage = 'Sistema ocupado. Aguarde alguns momentos.';
      }

      alert(userMessage);
    } finally {
      setLoadingDocs(prev => ({ ...prev, [documentoId]: false }));
    }
  }, [localDocumentos, handleLocalUpdate, setCargaDiariaCache, handleCascadingUpdate]);

  const filteredDocumentos = useMemo(() => {
    let filtered = localDocumentos.filter(doc =>
      (doc.numero?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
      (doc.arquivo?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) ||
      (doc.descritivo?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
    );

    // Aplicar filtro de área/pavimento
    if (filtroArea !== "todas") {
      filtered = filtered.filter(doc => doc.pavimento_id === filtroArea);
    }

    return filtered.sort((a, b) => {
      const arquivoA = (a.arquivo || '').trim().toLowerCase();
      const arquivoB = (b.arquivo || '').trim().toLowerCase();

      return arquivoA.localeCompare(arquivoB, 'pt-BR', {
        numeric: true,
        sensitivity: 'base',
        ignorePunctuation: false
      });
    });
  }, [localDocumentos, debouncedSearchTerm, filtroArea]);

  const documentosPorDisciplina = useMemo(() => {
    const grupos = {};

    filteredDocumentos.forEach(doc => {
      const disciplina = (getDocumentoDisciplinas(doc).join(' / ') || 'Sem Disciplina');
      if (!grupos[disciplina]) {
        grupos[disciplina] = [];
      }
      grupos[disciplina].push(doc);
    });

    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredDocumentos, getDocumentoDisciplinas]);

  const etapasDisponiveis = useMemo(() => {
    // Sempre retornar todas as etapas padrão
    return ['Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra'];
  }, []);

  const usuariosOrdenados = useMemo(() => {
    return [...usuarios].sort((a, b) => {
      const nomeA = a.nome || a.full_name || a.email || '';
      const nomeB = b.nome || b.full_name || b.email || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [usuarios]);

  const DocumentoItem = ({ doc, planejamentos, allAtividades, handleEdit, handleDelete, handleOpenDocEtapaModal, handlePredecessoraChange, handleDataInicioChange, etapaParaPlanejamento, loadingDocs, empreendimento, onUpdate, readOnly, isExpanded, genericTempoIndex }) => {
    const [isUpdatingActivity, setIsUpdatingActivity] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const isDocLoading = loadingDocs[doc.id] || false;

    const [atividadesEmpForDoc, setAtividadesEmpForDoc] = useState([]);

    const [searchPredecessor, setSearchPredecessor] = useState('');
    const [selectedAtividades, setSelectedAtividades] = useState([]);

    const [showExecutorDialog, setShowExecutorDialog] = useState(false);
    const [pendingExecutor, setPendingExecutor] = useState(null);

    const planejamentosDoDocumento = useMemo(() => {
      return planejamentos.filter(p => p.documento_id === doc.id);
    }, [planejamentos, doc.id]);

    // Load per-document markers only when expanded to avoid N API calls for large lists.
    useEffect(() => {
      if (!isExpanded) {
        setAtividadesEmpForDoc([]);
        return;
      }

      let mounted = true;
      const load = async () => {
        try {
          const rows = await retryWithExtendedBackoff(() => base44.entities.AtividadesEmpreendimento.filter({ empreendimento_id: empreendimento.id, documento_id: doc.id }), `loadAtividadesEmp-${doc.id}`);
          if (mounted) setAtividadesEmpForDoc(rows || []);
        } catch (err) {
          console.warn('Erro ao carregar atividades_empreendimento para doc', doc.id, err);
        }
      };
      load();
      return () => { mounted = false; };
    }, [doc.id, empreendimento.id, isUpdatingActivity, isUpdating, isExpanded]);

    const atividadesDisponiveis = useMemo(() => {
      const subdisciplinasDoc = doc.subdisciplinas || [];
      const disciplinasDoc = getDocumentoDisciplinas(doc);
      const disciplinasDocSet = new Set((disciplinasDoc || []).map(normalizeComparable).filter(Boolean));
      const subdisciplinasDocSet = new Set((subdisciplinasDoc || []).map(normalizeComparable).filter(Boolean));

      const etapaOverrides = new Map();
      const tempoOverrides = new Map();
      const importedPairs = buildImportedPairs(allAtividades);

      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade && ativ.tempo !== -999) {
          etapaOverrides.set(ativ.id_atividade, ativ.etapa);
          tempoOverrides.set(ativ.id_atividade, ativ.tempo);
        }
      });

      // Incluir tanto atividades gerais quanto atividades específicas vinculadas a esta folha
      const specificSourceIds = new Set(
        allAtividades
          .filter(ativ => ativ.empreendimento_id === empreendimento.id && ativ.documento_id === doc.id && ativ.tempo !== -999)
          .map(ativ => String(ativ.id_atividade || ''))
          .filter(Boolean)
      );

      let atividadesGerais = allAtividades.filter(ativ => {
        // Atividades gerais (sem empreendimento_id)
        if (!ativ.empreendimento_id) {
          if (!isValidGenericTemplateActivity(ativ)) {
            return false;
          }
          const disciplinaMatch = disciplinasDocSet.has(normalizeComparable(ativ.disciplina));
          const subdisciplinaMatch = subdisciplinasDocSet.has(normalizeComparable(ativ.subdisciplina));
          if (!disciplinaMatch || !subdisciplinaMatch) {
            return false;
          }

          const sourceId = String(ativ.id_atividade || ativ.id || '');
          if (sourceId && specificSourceIds.has(sourceId)) {
            return false;
          }

          if (!ativ.id_atividade && importedPairs.has(toPairKey(ativ.disciplina, ativ.subdisciplina))) {
            return false;
          }
          return true;
        }

        // Atividades específicas DESTA folha (com documento_id igual ao documento atual)
        // IMPORTANTE: Excluir marcadores de conclusão (tempo: 0 com texto "Concluída na folha")
        if (ativ.empreendimento_id === empreendimento.id && ativ.documento_id === doc.id && ativ.tempo !== -999) {
          // Não incluir marcadores de conclusão na lista
          if (ativ.tempo === 0 && String(ativ.atividade || '').includes('Concluída na folha')) {
            return false;
          }
          return true;
        }

        return false;
      });

      console.log(`\n🔍 [Doc ${doc.numero}] Filtrando exclusões:`);
      console.log(`   ID do documento: ${doc.id}`);
      console.log(`   Atividades gerais encontradas: ${atividadesGerais.length}`);

      const atividadesExcluidasGlobal = new Set();
      const atividadesExcluidasPorDoc = new Set();
      const atividadesConcluidasPorDoc = new Set();

      allAtividades.forEach(ativ => {
        if (ativ.empreendimento_id === empreendimento.id && ativ.id_atividade) {
          if (ativ.tempo === -999) {
            // Exclusões
            if (ativ.documento_id === doc.id) {
              console.log(`   ❌ Exclusão da folha ${doc.numero}: atividade ${ativ.id_atividade}`);
              atividadesExcluidasPorDoc.add(ativ.id_atividade);
            } else if (!ativ.documento_id) {
              console.log(`   ❌ Exclusão global: atividade ${ativ.id_atividade}`);
              atividadesExcluidasGlobal.add(ativ.id_atividade);
            }
          } else if (ativ.tempo === 0 && ativ.documento_id === doc.id && String(ativ.atividade || '').includes('Concluída na folha')) {
            // Conclusões (identificadas por tempo 0 e texto "Concluída na folha")
            console.log(`   ✅ Concluída na folha ${doc.numero}: atividade ${ativ.id_atividade}`);
            atividadesConcluidasPorDoc.add(ativ.id_atividade);
          }
        }
      });

      // Also include conclusion markers from atividades_empreendimento table
      (atividadesEmpForDoc || []).forEach(ae => {
        try {
          if (ae && ae.tempo === 0 && String(ae.atividade || '').includes('Concluída na folha')) {
            atividadesConcluidasPorDoc.add(ae.id_atividade);
            console.log(`   ✅ (emp) Concluída na folha ${doc.numero}: atividade ${ae.id_atividade}`);
          }
        } catch (e) {
          // ignore
        }
      });

      console.log(`   Excluídas globalmente: ${atividadesExcluidasGlobal.size}`);
      console.log(`   Excluídas desta folha: ${atividadesExcluidasPorDoc.size}`);
      console.log(`   Concluídas nesta folha: ${atividadesConcluidasPorDoc.size}`);

      atividadesGerais = atividadesGerais.filter(ativ => {
        const globalExcluded = atividadesExcluidasGlobal.has(ativ.id);
        const docExcluded = atividadesExcluidasPorDoc.has(ativ.id);
        // Não filtrar atividades concluídas - elas devem aparecer
        return !globalExcluded && !docExcluded;
      });

      console.log(`   ✅ Atividades disponíveis após filtros: ${atividadesGerais.length}\n`);

      const isDocumentPlannedAsSingleEntity = !doc.multiplos_executores && planejamentosDoDocumento.some(p => p.etapa === etapaParaPlanejamento && p.tipo_plano === 'documento');

      const pavimento = (pavimentos || []).find(p => p.id === doc.pavimento_id);
      const areaPavimento = pavimento ? Number(pavimento.area) : null;

      // Filtrar por etapa se uma etapa específica foi selecionada
      if (etapaParaPlanejamento !== 'todas') {
        atividadesGerais = atividadesGerais.filter(ativ => {
          const etapaFinal = etapaOverrides.has(ativ.id)
            ? etapaOverrides.get(ativ.id)
            : ativ.etapa;
          return etapaFinal === etapaParaPlanejamento;
        });
        console.log(`   🎯 Filtrado por etapa "${etapaParaPlanejamento}": ${atividadesGerais.length} atividades\n`);
      }

      return ordenarAtividades(atividadesGerais).filter(atividade => {
        const planejamentoDaAtividade = planejamentosDoDocumento.find(p =>
          p.atividade_id === atividade.id &&
          p.tipo_plano === 'atividade'
        );

        // Filtrar apenas planejamentos com tempo 0 (inválidos/duplicados)
        if (planejamentoDaAtividade && (planejamentoDaAtividade.tempo_planejado === 0 || !planejamentoDaAtividade.tempo_planejado)) {
          return false;
        }

        // Não filtrar atividades concluídas - elas devem aparecer
        return true;
      }).map(atividade => {
        // Garantir que atividade.atividade é sempre string
        const nomeAtividadeSeguro = String(atividade.atividade || '');
        const etapaFinal = etapaOverrides.has(atividade.id)
          ? etapaOverrides.get(atividade.id)
          : atividade.etapa;

        const estaConcluida = atividadesConcluidasPorDoc.has(atividade.id);

        // Para atividades concluídas, tempo base é sempre ZERO para cálculo
        const tempoBaseOriginal = parseFloat(atividade.tempo) || 0;

        let tempoBase;
        if (estaConcluida) {
          tempoBase = 0; // Atividades concluídas não somam no tempo total
        } else if (tempoOverrides.has(atividade.id)) {
          tempoBase = parseFloat(tempoOverrides.get(atividade.id)) || 0;
        } else {
          tempoBase = tempoBaseOriginal;
        }

        // Buscar planejamento de atividade específico desta atividade neste documento/etapa
        const planejamentoAtividade = planejamentosDoDocumento.find(p =>
          p.atividade_id === atividade.id &&
          p.etapa === etapaFinal &&
          p.tipo_plano === 'atividade' &&
          p.tempo_planejado > 0 // Ignorar planejamentos com tempo 0
        );

        // Verificar se está no planejamento de documento (grupo)
        const planejamentoDocDaEtapa = planejamentosDoDocumento.find(p =>
          p.etapa === etapaFinal &&
          p.tipo_plano === 'documento'
        );
        // Se existe um planejamento de documento para a etapa, todas as atividades dessa etapa foram planejadas
        const jaFoiPlanejada = !!planejamentoDocDaEtapa || !!planejamentoAtividade;

        // Status do planejamento
        const statusPlanejamento = planejamentoAtividade?.status ||
          (jaFoiPlanejada ? planejamentoDocDaEtapa?.status : null);

        const fatorDificuldade = doc.fator_dificuldade || 1;

        // "Confecção de A-" usa apenas horas x pav (sem fator de dificuldade)
        const isConfeccaoA = nomeAtividadeSeguro.trim().startsWith('Confecção de A-');
        const multiplier = isConfeccaoA ? 1 : fatorDificuldade;

        // CORRIGIDO: tempo base já é total, não h/m²
        const tempoComFator = tempoBase * multiplier;

        // Para exibição: mostrar tempo original mesmo se concluída
        const tempoBaseParaExibicao = estaConcluida ? tempoBaseOriginal : tempoBase;

        return {
          ...atividade,
          etapa: etapaFinal,
          tempoComFator,
          tempoBase: tempoBase, // Tempo usado para cálculo (0 se concluída)
          tempoBaseParaExibicao: tempoBaseParaExibicao, // Tempo original para mostrar riscado
          area: areaPavimento,
          jaFoiPlanejada: jaFoiPlanejada,
          estaConcluida: estaConcluida,
          statusPlanejamento: statusPlanejamento,
          planejamentoId: planejamentoAtividade?.id || planejamentoDocDaEtapa?.id
        };
      });
    }, [allAtividades, doc.disciplinas, doc.disciplina, doc.fator_dificuldade, doc.pavimento_id, planejamentosDoDocumento, doc.subdisciplinas, doc.multiplos_executores, etapaParaPlanejamento, empreendimento.id, pavimentos, doc.id, doc.numero, getDocumentoDisciplinas, atividadesEmpForDoc]);

    const tempoCalculadoPorEtapa = useMemo(() => {
      const atividadesFiltradas = etapaParaPlanejamento === 'todas'
        ? atividadesDisponiveis
        : atividadesDisponiveis.filter(ativ => ativ.etapa === etapaParaPlanejamento);

      const calculado = atividadesFiltradas.reduce((total, ativ) => {
        return total + (ativ.tempoComFator || 0);
      }, 0);

      if (calculado > 0) return calculado;

      // Fallback para documentos sem atividades mapeadas no contexto atual.
      return Number(doc.tempo_total) || 0;
    }, [doc.tempo_total, atividadesDisponiveis, etapaParaPlanejamento]);

    const handleToggleAtividade = (atividadeId) => {
      setSelectedAtividades(prev =>
        prev.includes(atividadeId)
          ? prev.filter(id => id !== atividadeId)
          : [...prev, atividadeId]
      );
    };

    const handleMarcarMultiplasComoConcluidas = async () => {
      if (selectedAtividades.length === 0) {
        alert("Selecione pelo menos uma atividade");
        return;
      }

      if (!window.confirm(`Tem certeza que deseja marcar ${selectedAtividades.length} atividade(s) como concluída(s)?`)) {
        return;
      }

      setIsUpdatingActivity(true);
      try {
        let atividadesMarcadas = 0;

        for (const atividadeId of selectedAtividades) {
          const atividade = atividadesDisponiveis.find(a => a.id === atividadeId);
          if (!atividade) continue;

          // Verificar se já existe marcador de conclusão
          const existingMarkers = await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.filter({
              empreendimento_id: empreendimento.id,
              id_atividade: atividade.id,
              documento_id: doc.id,
              tempo: 0
            }),
            3, 1000, `checkConclusionMarker-${atividade.id}-${doc.id}`
          );

          if (existingMarkers && existingMarkers.length > 0) {
            // Já marcada, pular
            continue;
          }

          // Criar marcador de conclusão
          const novoMarcador = {
            etapa: atividade.etapa,
            disciplina: atividade.disciplina,
            subdisciplina: atividade.subdisciplina,
            atividade: `(Concluída na folha ${doc.numero}) ${String(atividade.atividade || '')}`,
            funcao: atividade.funcao,
            empreendimento_id: empreendimento.id,
            id_atividade: atividade.id,
            documento_id: doc.id,
            tempo: 0
          };

          await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.create(novoMarcador),
            3, 1000, `createConclusionMarker-${atividade.id}-${doc.id}`
          );

          atividadesMarcadas++;
        }

        setSelectedAtividades([]);

        // Forçar re-render do componente sem perder estado
        setIsUpdatingActivity(false);
        setIsUpdatingActivity(true);

        // Dados já atualizados localmente - não precisa recarregar

        if (atividadesMarcadas > 0) {
          setTimeout(() => {
            alert(`✅ ${atividadesMarcadas} atividade(s) marcada(s) como concluída(s)!`);
          }, 200);
        }
      } catch (error) {
        console.error("❌ Erro ao marcar atividades como concluídas:", error);
        alert("Erro ao atualizar o status das atividades: " + error.message);
      } finally {
        setTimeout(() => {
          setIsUpdatingActivity(false);
        }, 500);
      }
    };

    const handleMarcarComoConcluida = async (activityObj) => {
      console.log(`\n✅ ========================================`);
      console.log(`✅ MARCAR COMO CONCLUÍDA`);
      console.log(`✅ ========================================`);
      console.log(`   Atividade: "${activityObj.atividade}"`);
      console.log(`   Folha: ${doc.numero}`);
      console.log(`✅ ========================================\n`);

      setIsUpdatingActivity(true);
      try {
        // Verificar se já existe marcador de conclusão
        const existingMarkers = await retryWithBackoff(
          () => base44.entities.AtividadesEmpreendimento.filter({
            empreendimento_id: empreendimento.id,
            id_atividade: activityObj.id,
            documento_id: doc.id,
            tempo: 0 // Marcador de conclusão
          }),
          3, 1000, `checkConclusionMarker-${activityObj.id}-${doc.id}`
        );

        if (existingMarkers && existingMarkers.length > 0) {
          // Já está marcada como concluída, então vamos desmarcar
          console.log(`   Desmarcando como concluída (removendo ${existingMarkers.length} marcador(es))...`);

          // Remover TODOS os marcadores de conclusão (caso haja duplicatas)
          for (const marker of existingMarkers) {
            await retryWithBackoff(
              () => base44.entities.AtividadesEmpreendimento.delete(marker.id),
              3, 1000, `removeConclusionMarker-${marker.id}`
            );
          }
          // If there is a planejamento associated, attempt to reset its status
          try {
            if (activityObj.planejamentoId) {
              const planoLocal = planejamentosDoDocumento.find(p => p.id === activityObj.planejamentoId);
              const primaryIsDocumento = !!(planoLocal && planoLocal.tipo_plano === 'documento');
              const primary = primaryIsDocumento ? PlanejamentoDocumento : PlanejamentoAtividade;
              const fallback = primaryIsDocumento ? PlanejamentoAtividade : PlanejamentoDocumento;

              console.log(`   Atualizando planejamento ${activityObj.planejamentoId} -> status: nao_iniciado (primary: ${primaryIsDocumento ? 'PlanejamentoDocumento' : 'PlanejamentoAtividade'})`);

              try {
                await retryWithBackoff(() => primary.update(activityObj.planejamentoId, { status: 'nao_iniciado' }), 3, 1000, `unmarkConclusionUpdatePlan-${activityObj.planejamentoId}`);
                console.log(`   ✅ Planejamento ${activityObj.planejamentoId} marcado como 'nao_iniciado' (primary)`);
              } catch (innerErr) {
                console.warn(`   Primary update falhou: ${innerErr}. Tentando fallback...`);
                try {
                  await retryWithBackoff(() => fallback.update(activityObj.planejamentoId, { status: 'nao_iniciado' }), 3, 1000, `unmarkConclusionUpdatePlanFallback-${activityObj.planejamentoId}`);
                  console.log(`   ✅ Planejamento ${activityObj.planejamentoId} marcado como 'nao_iniciado' (fallback)`);
                } catch (innerErr2) {
                  console.warn('   Fallback também falhou ao atualizar o planejamento:', innerErr2);
                  throw innerErr2;
                }
              }
            }
          } catch (e) {
            console.warn('⚠️ Não foi possível atualizar o status do planejamento ao desmarcar conclusão:', e);
          }
        } else {
          // Criar marcador de conclusão (usando tempo 0 em vez de -888)
          const novoMarcador = {
            etapa: activityObj.etapa,
            disciplina: activityObj.disciplina,
            subdisciplina: activityObj.subdisciplina,
            atividade: `(Concluída na folha ${doc.numero}) ${String(activityObj.atividade || '')}`,
            funcao: activityObj.funcao,
            empreendimento_id: empreendimento.id,
            id_atividade: activityObj.id,
            documento_id: doc.id,
            tempo: 0 // Atividade concluída tem tempo zero
          };

          console.log(`   Criando marcador de conclusão...`);
          await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.create(novoMarcador),
            3, 1000, `createConclusionMarker-${activityObj.id}-${doc.id}`
          );
          // If there is a planejamento associated, mark it as concluded
          try {
            if (activityObj.planejamentoId) {
              const planoLocal = planejamentosDoDocumento.find(p => p.id === activityObj.planejamentoId);
              const primaryIsDocumento = !!(planoLocal && planoLocal.tipo_plano === 'documento');
              const primary = primaryIsDocumento ? PlanejamentoDocumento : PlanejamentoAtividade;
              const fallback = primaryIsDocumento ? PlanejamentoAtividade : PlanejamentoDocumento;

              console.log(`   Atualizando planejamento ${activityObj.planejamentoId} -> status: concluido (primary: ${primaryIsDocumento ? 'PlanejamentoDocumento' : 'PlanejamentoAtividade'})`);

              try {
                await retryWithBackoff(() => primary.update(activityObj.planejamentoId, { status: 'concluido' }), 3, 1000, `markConclusionUpdatePlan-${activityObj.planejamentoId}`);
                console.log(`   ✅ Planejamento ${activityObj.planejamentoId} atualizado para 'concluido' (primary)`);
              } catch (innerErr) {
                console.warn(`   Primary update falhou: ${innerErr}. Tentando fallback...`);
                try {
                  await retryWithBackoff(() => fallback.update(activityObj.planejamentoId, { status: 'concluido' }), 3, 1000, `markConclusionUpdatePlanFallback-${activityObj.planejamentoId}`);
                  console.log(`   ✅ Planejamento ${activityObj.planejamentoId} atualizado para 'concluido' (fallback)`);
                } catch (innerErr2) {
                  console.warn('   Fallback também falhou ao atualizar o planejamento:', innerErr2);
                  throw innerErr2;
                }
              }
            }
          } catch (e) {
            console.warn('⚠️ Não foi possível atualizar o status do planejamento ao marcar conclusão:', e);
          }
        }

        // Forçar re-render do componente sem chamar onUpdate
        setIsUpdatingActivity(false);
        setIsUpdatingActivity(true);

        // Dados já atualizados localmente - não precisa recarregar
      } catch (error) {
        console.error("❌ Erro ao marcar atividade como concluída:", error);
        alert("Erro ao atualizar o status da atividade: " + error.message);
      } finally {
        setTimeout(() => {
          setIsUpdatingActivity(false);
        }, 500);
      }
    };

    const handleExcluirAtividade = async (activityObj) => {
      // **LOG IMEDIATO**: Verificar se a função está sendo chamada
      console.log(`\n🎯 ========================================`);
      console.log(`🎯 BOTÃO DE EXCLUIR CLICADO!`);
      console.log(`🎯 ========================================`);
      console.log(`   Atividade objeto:`, activityObj);
      console.log(`   Documento atual:`, { id: doc.id, numero: doc.numero });
      console.log(`🎯 ========================================\n`);

      const nomeAtividade = String(activityObj.atividade || '');
      const confirmMessage = `Tem certeza que deseja excluir a atividade "${nomeAtividade}" SOMENTE desta folha "${doc.numero}"?\n\nEsta atividade continuará disponível em outras folhas do projeto.`;

      if (!window.confirm(confirmMessage)) {
        console.log(`❌ Usuário cancelou a exclusão`);
        return;
      }

      console.log(`✅ Usuário confirmou - prosseguindo com exclusão...\n`);

      setIsUpdatingActivity(true);
      try {
        console.log(`🗑️ ========================================`);
        console.log(`📋 INICIANDO PROCESSO DE EXCLUSÃO`);
        console.log(`🗑️ ========================================`);
        console.log(`   Atividade: "${nomeAtividade}"`);
        console.log(`   ID da Atividade: ${activityObj.id}`);
        console.log(`   empreendimento_id da atividade: ${activityObj.empreendimento_id}`);
        console.log(`   Folha: ${doc.numero}`);
        console.log(`   ID da Folha: ${doc.id}`);
        console.log(`   Empreendimento: ${empreendimento.nome}`);
        console.log(`   ID do Empreendimento: ${empreendimento.id}`);
        console.log(`🗑️ ========================================\n`);

        if (!activityObj) {
          console.error(`❌ Atividade inválida.`);
          alert("Erro: Atividade inválida para exclusão.");
          return;
        }
        // Se o objeto possui `documento_id` então é uma atividade vinculada a uma folha
        if (activityObj.documento_id) {
          console.log(`\n📌 ========================================`);
          console.log(`📌 ATIVIDADE VINCULADA A UMA FOLHA (documento_id detectado)`);
          console.log(`📌 ========================================`);
          console.log(`   Ação: Deletar diretamente em AtividadesEmpreendimento`);
          console.log(`📌 ========================================\n`);

          await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.delete(activityObj.id),
            3, 1000, `deleteAtividadeEmp-${activityObj.id}`
          );

          console.log(`✅ Atividade (AtividadesEmpreendimento) excluída com sucesso.`);

        } else if (activityObj.empreendimento_id === empreendimento.id) {
          console.log(`\n📌 ========================================`);
          console.log(`📌 ATIVIDADE ESPECÍFICA DO PROJETO (sem documento_id)`);
          console.log(`📌 ========================================`);
          console.log(`   Ação: Deletar a atividade diretamente na tabela global`);
          console.log(`📌 ========================================\n`);

          await retryWithBackoff(
            () => Atividade.delete(activityObj.id),
            3, 1000, `deleteSpecificAtividade-${activityObj.id}`
          );

          console.log(`✅ Atividade global excluída com sucesso.`);

        } else {
          // **VERIFICAÇÃO 2**: É atividade genérica - criar marcador
          console.log(`\n📌 ========================================`);
          console.log(`📌 ATIVIDADE GENÉRICA (CATÁLOGO GLOBAL)`);
          console.log(`📌 ========================================`);
          console.log(`   Esta atividade NÃO pertence ao empreendimento`);
          console.log(`   Ação: Criar marcador de exclusão ESPECÍFICO`);
          console.log(`   Marcador será vinculado ao documento: ${doc.id}`);
          console.log(`📌 ========================================\n`);

          console.log(`🔍 PASSO 1: Verificando se já existe marcador...\n`);
          console.log(`   Buscando com filtro:`);
          console.log(`   {`);
          console.log(`     empreendimento_id: "${empreendimento.id}",`);
          console.log(`     id_atividade: "${activityObj.id}",`);
          console.log(`     documento_id: "${doc.id}",`);
          console.log(`     tempo: -999`);
          console.log(`   }`);

          const existingMarkers = await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.filter({
              empreendimento_id: empreendimento.id,
              id_atividade: activityObj.id,
              documento_id: doc.id,
              tempo: -999
            }),
            3, 1000, `checkExclusionMarker-${activityObj.id}-${doc.id}`
          );

          console.log(`\n   📊 Resultado da busca: ${existingMarkers?.length || 0} marcadores encontrados`);

          if (existingMarkers && existingMarkers.length > 0) {
            console.log(`   📋 Marcador(es) encontrado(s):`);
            existingMarkers.forEach((marker, idx) => {
              console.log(`\n   Marcador ${idx + 1}:`);
              console.log(`      ID: ${marker.id}`);
              console.log(`      empreendimento_id: "${marker.empreendimento_id}"`);
              console.log(`      id_atividade: "${marker.id_atividade}"`);
              console.log(`      documento_id: "${marker.documento_id}"`);
              console.log(`      tempo: ${marker.tempo}`);
            });
          }

          if (existingMarkers && existingMarkers.length > 0) {
            console.log(`\n⚠️ Marcador já existe - ABORTANDO operação`);
            alert(`A atividade "${nomeAtividade}" já está excluída desta folha.`);
            setIsUpdatingActivity(false);
            return;
          }

          console.log(`\n✅ Nenhum marcador existente - prosseguindo com criação...\n`);

          // **CRÍTICO**: Criar marcador com documento_id obrigatório
          const novoMarcador = {
            etapa: activityObj.etapa,
            disciplina: activityObj.disciplina,
            subdisciplina: activityObj.subdisciplina,
            atividade: `(Excluída da folha ${doc.numero}) ${String(activityObj.atividade || '')}`,
            funcao: activityObj.funcao,
            empreendimento_id: empreendimento.id,
            id_atividade: activityObj.id,
            documento_id: doc.id,
            tempo: -999
          };

          console.log(`💾 PASSO 2: Criando marcador de exclusão...\n`);
          console.log(`   📝 Dados que serão enviados para Atividade.create():`);
          console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          Object.entries(novoMarcador).forEach(([key, value]) => {
            const emoji = key === 'documento_id' ? '⭐' : '  ';
            console.log(`   ${emoji} ${key}: "${value}"`);
          });
          console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

          const marcadorCriado = await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.create(novoMarcador),
            3, 1000, `createExclusionMarker-${activityObj.id}-${doc.id}`
          );

          console.log(`\n✅ ========================================`);
          console.log(`✅ RESPOSTA DO SERVIDOR`);
          console.log(`✅ ========================================`);
          console.log(`   ID gerado: ${marcadorCriado.id}`);
          console.log(`   📝 Dados retornados pelo servidor:`);
          console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          Object.entries(marcadorCriado).forEach(([key, value]) => {
            const emoji = key === 'documento_id' ? '⭐' : '  ';
            const status = key === 'documento_id' && !value ? '❌ NULO!' : '';
            console.log(`   ${emoji} ${key}: "${value}" ${status}`);
          });
          console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

          // **VALIDAÇÃO CRÍTICA**: Verificar se documento_id foi salvo
          if (!marcadorCriado.documento_id) {
            console.error(`\n❌ ========================================`);
            console.error(`❌ ERRO CRÍTICO DETECTADO!`);
            console.error(`❌ ========================================`);
            console.error(`   O campo documento_id NÃO foi salvo!`);
            console.error(`   Isso fará com que a exclusão seja GLOBAL`);
            console.error(`   em vez de específica desta folha.`);
            console.error(`❌ ========================================\n`);

            alert(`⚠️ ERRO CRÍTICO:\n\nO sistema não conseguiu salvar o vínculo com a folha específica!\n\nIsso significa que a atividade seria excluída de TODAS as folhas.\n\n🔧 Tentando corrigir automaticamente...`);

            // **CORREÇÃO AUTOMÁTICA**: Atualizar o marcador com documento_id
            console.log(`🔧 Aplicando correção: atualizando marcador ${marcadorCriado.id}...`);
            const marcadorCorrigido = await retryWithBackoff(
              () => base44.entities.AtividadesEmpreendimento.update(marcadorCriado.id, { documento_id: doc.id }),
              3, 1000, `fixMarker-${marcadorCriado.id}`
            );

            console.log(`✅ Marcador corrigido:`, {
              id: marcadorCorrigido.id,
              documento_id: marcadorCorrigido.documento_id,
              empreendimento_id: marcadorCorrigido.empreendimento_id
            });

            if (!marcadorCorrigido.documento_id) {
              console.error(`❌ FALHA NA CORREÇÃO! documento_id ainda está nulo.`);
              alert(`❌ Não foi possível corrigir o erro.\n\nPor favor, recarregue a página e tente novamente.`);
              return;
            }

            alert(`✅ Erro corrigido automaticamente!\n\nA atividade foi excluída SOMENTE da folha "${doc.numero}".`);
          }

          console.log(`✅ Marcador válido criado com sucesso!\n`);

          // Registrar exclusão em AtividadesEmpreendimento
          try {
            const atividadesEmp = await retryWithBackoff(
              () => base44.entities.AtividadesEmpreendimento.filter({
                empreendimento_id: empreendimento.id,
                id_atividade: activityObj.id,
                documento_id: doc.id
              }),
              3, 500, `getAtividadesEmpExcluir-${activityObj.id}`
            );

            const agora = new Date().toISOString();
            for (const atividadeEmp of atividadesEmp) {
              await retryWithBackoff(
                () => base44.entities.AtividadesEmpreendimento.update(atividadeEmp.id, {
                  status_planejamento: 'nao_planejada',
                  data_exclusao: agora,
                  motivo_exclusao: `Excluída da folha ${doc.numero}`
                }),
                3, 500, `updateAtividadeEmpExclusao-${atividadeEmp.id}`
              );
            }
            console.log(`   📋 ${atividadesEmp.length} registro(s) marcado(s) como excluído(s) em AtividadesEmpreendimento`);
          } catch (error) {
            console.warn(`   ⚠️ Erro ao atualizar AtividadesEmpreendimento:`, error);
          }
        }

        console.log(`🔄 PASSO 3: Recarregando dados da página...\n`);
        await onUpdate();

        // DIAGNÓSTICO: buscar estados atuais diretamente das APIs para verificar
        // onde o registro excluído ainda pode estar sendo retornado.
        try {
          const globalNow = await Atividade.filter({ empreendimento_id: empreendimento.id });
          const empNow = await base44.entities.AtividadesEmpreendimento.filter({ empreendimento_id: empreendimento.id, documento_id: doc.id });
          console.log(`\n🔎 DIAGNÓSTICO PÓS-DELETE:`);
          console.log(`   Atividades globais (count):`, globalNow.length);
          console.log(`   AtividadesEmpreendimento para este doc (count):`, empNow.length);
          const existsInGlobal = (globalNow || []).some(a => String(a.id) === String(activityObj.id));
          const existsInEmp = (empNow || []).some(a => String(a.id) === String(activityObj.id));
          console.log(`   Presença do ID excluído (${activityObj.id}):`, { existsInGlobal, existsInEmp });
        } catch (diagErr) {
          console.warn('⚠️ Erro durante diagnóstico pós-delete:', diagErr);
        }

        console.log(`\n🎉 ========================================`);
        console.log(`🎉 PROCESSO CONCLUÍDO COM SUCESSO!`);
        console.log(`🎉 ========================================\n`);

        alert(`✅ Atividade "${nomeAtividade}" removida APENAS da folha "${doc.numero}"!\n\nEla continuará disponível nas outras folhas.`);

      } catch (error) {
        console.error("\n💥 ========================================");
        console.error("💥 ERRO DURANTE O PROCESSO");
        console.error("💥 ========================================");
        console.error("Erro:", error);
        console.error("Stack:", error.stack);
        console.error("💥 ========================================\n");

        alert("Erro ao excluir atividade: " + error.message);
      } finally {
        console.log(`\n🏁 Finalizando processo (isUpdatingActivity = false)\n`);
        setIsUpdatingActivity(false);
      }
    };

    const handleExecutorChange = async (field, value) => {
      setIsUpdating(true);
      try {
        let updateData = {};

        if (field === 'multiplos_executores' && value === true) {
          updateData = {
            multiplos_executores: true,
            executor_principal: null,
            inicio_planejado: null,
            termino_planejado: null,
            tempo_total: 0
          };

          const allPlansForDoc = localPlanejamentos.filter(p => p.documento_id === doc.id);
          if (allPlansForDoc.length > 0) {
            await Promise.all(allPlansForDoc.map(p => {
              if (p.tipo_plano === 'atividade') {
                return retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `deleteOldPlanForMultiAtiv-${p.id}`);
              } else if (p.tipo_plano === 'documento') {
                return retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `deleteOldPlanForMultiDoc-${p.id}`);
              }
              return Promise.resolve();
            }));
            setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== doc.id));
          }

          const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(doc.id, updateData), `updateDocMulti-${doc.id}`);
          handleLocalUpdate(updatedDocFromAPI);
          setCargaDiariaCache({});

          if (updatedDocFromAPI) {
            handleOpenDocEtapaModal(updatedDocFromAPI);
          }

        } else if (field === 'multiplos_executores' && value === false) {
          updateData = {
            multiplos_executores: false,
            executor_principal: null,
            inicio_planejado: null,
            termino_planejado: null,
            tempo_total: 0
          };

          const allPlansForDoc = localPlanejamentos.filter(p => p.documento_id === doc.id);
          if (allPlansForDoc.length > 0) {
            await Promise.all(allPlansForDoc.map(p => {
              if (p.tipo_plano === 'atividade') {
                return retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `deleteOldPlanForSingleAtiv-${p.id}`);
              } else if (p.tipo_plano === 'documento') {
                return retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `deleteOldPlanForSingleDoc-${p.id}`);
              }
              return Promise.resolve();
            }));
            setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== doc.id));
          }

          const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(doc.id, updateData), `updateDocSingle-${doc.id}`);
          handleLocalUpdate(updatedDocFromAPI);
          setCargaDiariaCache({});

        } else if (field === 'executor_principal' && value === null) {
          updateData = { executor_principal: null, inicio_planejado: null, termino_planejado: null, tempo_total: 0 };

          const allPlansForDoc = localPlanejamentos.filter(p => p.documento_id === doc.id);
          if (allPlansForDoc.length > 0) {
            await Promise.all(allPlansForDoc.map(p => {
              if (p.tipo_plano === 'atividade') {
                return retryWithExtendedBackoff(() => PlanejamentoAtividade.delete(p.id), `deleteOldPlanClearExecutorAtiv-${p.id}`);
              } else if (p.tipo_plano === 'documento') {
                return retryWithExtendedBackoff(() => PlanejamentoDocumento.delete(p.id), `deleteOldPlanClearExecutorDoc-${p.id}`);
              }
              return Promise.resolve();
            }));
            setLocalPlanejamentos(prev => prev.filter(p => p.documento_id !== doc.id));
          }

          const updatedDocFromAPI = await retryWithExtendedBackoff(() => Documento.update(doc.id, updateData), `clearExecutor-${doc.id}`);
          handleLocalUpdate(updatedDocFromAPI);
          setCargaDiariaCache({});
        }

      } catch (error) {
        console.error("Erro ao atualizar o documento:", error);
        let errorMessage = "Falha ao atualizar o executor.";
        if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
          errorMessage = 'Problema de conexão. Verifique sua internet.';
        } else if (error.message?.includes('Rate limit')) {
          errorMessage = 'Sistema ocupado. Aguarde alguns momentos.';
        }
        alert(errorMessage);
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

      // Verificar se existem predecessoras ou sucessoras
      const predecessoras = localDocumentos.filter(d => d.predecessora_id === doc.id);
      const sucessoras = localDocumentos.filter(d => d.id === doc.predecessora_id);

      if (predecessoras.length > 0 || sucessoras.length > 0) {
        // Mostrar diálogo para perguntar se quer aplicar às outras folhas
        setPendingExecutor(executorEmail);
        setShowExecutorDialog(true);
        return;
      }

      // Se não há predecessoras/sucessoras, aplicar diretamente
      await applyExecutor(executorEmail, [doc.id]);
    };

    const applyExecutor = async (executorEmail, documentIds) => {
      console.log(`📋 [DocumentosTab] Aplicando executor ${executorEmail} a ${documentIds.length} documento(s)`);
      console.log(`🎯 Etapa selecionada para planejamento: ${etapaParaPlanejamento}`);

      setIsUpdating(true);

      try {
        // Ordenar documentos pela sequência de predecessoras
        const docsToProcess = documentIds.map(id => localDocumentos.find(d => d.id === id)).filter(Boolean);
        const orderedDocs = [];
        const visited = new Set();

        // Função para encontrar documentos sem predecessora ou com predecessora fora do grupo
        const findRootDocs = () => {
          return docsToProcess.filter(d =>
            !d.predecessora_id || !documentIds.includes(d.predecessora_id)
          );
        };

        // Função para encontrar sucessores de um documento
        const findSuccessors = (docId) => {
          return docsToProcess.filter(d => d.predecessora_id === docId && !visited.has(d.id));
        };

        // Começar pelos documentos raiz (sem predecessora no grupo)
        let queue = findRootDocs();

        while (queue.length > 0) {
          const currentDoc = queue.shift();
          if (visited.has(currentDoc.id)) continue;

          orderedDocs.push(currentDoc);
          visited.add(currentDoc.id);

          // Adicionar sucessores à fila
          const successors = findSuccessors(currentDoc.id);
          queue.push(...successors);
        }

        console.log(`📊 Ordem de planejamento: ${orderedDocs.map(d => d.numero).join(' → ')}`);

        // Processar documentos em sequência
        let ultimaDataTermino = null;

        for (const docToUpdate of orderedDocs) {
          console.log(`💾 Atualizando executor_principal no documento ${docToUpdate.numero}...`);

          let updateData = {
            executor_principal: executorEmail,
            multiplos_executores: false
          };

          // Se há uma data de término anterior E este documento é sucessor, usar essa data como início
          if (ultimaDataTermino && docToUpdate.predecessora_id && documentIds.includes(docToUpdate.predecessora_id)) {
            updateData.inicio_planejado = ultimaDataTermino;
            console.log(`📅 Definindo início automático para ${docToUpdate.numero}: ${ultimaDataTermino}`);
          }

          const docAtualizado = await retryWithBackoff(
            () => Documento.update(docToUpdate.id, updateData),
            3, 1000, `setExecutor-${docToUpdate.id}`
          );

          handleLocalUpdate(docAtualizado);
          console.log(`✅ Documento ${docToUpdate.numero} atualizado com executor: ${executorEmail}`);

          const temDataManual = docAtualizado.inicio_planejado &&
            isValid(parseDate(docAtualizado.inicio_planejado));

          const metodoData = temDataManual ? 'manual' : 'agenda';
          const dataManualInicio = temDataManual ? docAtualizado.inicio_planejado : null;

          if (temDataManual) {
            console.log(`📅 Documento possui data de início: ${format(parseDate(docAtualizado.inicio_planejado), 'dd/MM/yyyy')}`);
          } else {
            console.log(`🔍 Buscando disponibilidade na agenda do executor...`);
          }

          console.log(`\n🚀 Iniciando planejamento automático para ${docToUpdate.numero}...`);

          await autoPlanejarAtividades(
            docAtualizado,
            etapaParaPlanejamento,
            executorEmail,
            metodoData,
            dataManualInicio
          );

          // Buscar o documento atualizado para pegar a data de término
          const [docFinalizado] = await retryWithBackoff(
            () => Documento.filter({ id: docToUpdate.id }),
            3, 1000, `getDoc-${docToUpdate.id}`
          );

          if (docFinalizado.termino_planejado) {
            ultimaDataTermino = docFinalizado.termino_planejado;
            console.log(`✅ Data de término de ${docToUpdate.numero}: ${ultimaDataTermino}`);
          }
        }

        setCargaDiariaCache({});

        console.log(`✅ Planejamento em sequência concluído para todos os documentos!`);

        // Atualizar planejamentos em background silenciosamente
        setTimeout(() => {
          retryWithBackoff(
            () => PlanejamentoAtividade.filter({ empreendimento_id: empreendimento.id }),
            3, 500, 'refreshPlansAtividadeSilent'
          ).then(plansAtividade => {
            retryWithBackoff(
              () => PlanejamentoDocumento.filter({ empreendimento_id: empreendimento.id }),
              3, 500, 'refreshPlansDocumentoSilent'
            ).then(plansDocumento => {
              const allPlans = [
                ...(plansAtividade || []).map(p => ({ ...p, tipo_plano: 'atividade' })),
                ...(plansDocumento || []).map(p => ({ ...p, tipo_plano: 'documento' }))
              ];
              setLocalPlanejamentos(allPlans);
            });
          }).catch(err => {
            console.warn("Erro ao atualizar planejamentos em background:", err);
          });
        }, 200);

      } catch (error) {
        console.error("❌ Erro ao definir executor e planejar:", error);

        let errorMessage = "Erro ao definir executor e planejar.";
        if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
          errorMessage = 'Problema de conexão. Verifique sua internet.';
        } else if (error.message?.includes('Rate limit')) {
          errorMessage = 'Sistema ocupado. Aguarde alguns momentos.';
        } else if (error.message) {
          errorMessage = error.message;
        }

        alert(errorMessage);
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
        // Buscar toda a cadeia de predecessoras (folhas que dependem desta)
        const findAllSuccessorsRecursive = (docId, visited = new Set()) => {
          if (visited.has(docId)) return [];
          visited.add(docId);

          const directSuccessors = localDocumentos.filter(d => d.predecessora_id === docId);
          const allSuccessors = [...directSuccessors];

          directSuccessors.forEach(successor => {
            const nestedSuccessors = findAllSuccessorsRecursive(successor.id, visited);
            allSuccessors.push(...nestedSuccessors);
          });

          return allSuccessors;
        };

        // Buscar toda a cadeia de sucessoras (folhas das quais esta depende)
        const findAllPredecessorsRecursive = (docId, visited = new Set()) => {
          if (visited.has(docId)) return [];
          visited.add(docId);

          const currentDoc = localDocumentos.find(d => d.id === docId);
          if (!currentDoc || !currentDoc.predecessora_id) return [];

          const predecessor = localDocumentos.find(d => d.id === currentDoc.predecessora_id);
          if (!predecessor) return [];

          const allPredecessors = [predecessor];
          const nestedPredecessors = findAllPredecessorsRecursive(predecessor.id, visited);
          allPredecessors.push(...nestedPredecessors);

          return allPredecessors;
        };

        // Adicionar toda a cadeia de sucessores
        const allSuccessors = findAllSuccessorsRecursive(doc.id);
        documentIds.push(...allSuccessors.map(d => d.id));

        // Adicionar toda a cadeia de predecessores
        const allPredecessors = findAllPredecessorsRecursive(doc.id);
        documentIds.push(...allPredecessors.map(d => d.id));
      }

      await applyExecutor(pendingExecutor, documentIds);
    };

    const documentosFiltradosParaPredecessor = useMemo(() => {
      const docs = localDocumentos.filter(d => d.id !== doc.id);

      if (!searchPredecessor) {
        return docs.slice(0, 50);
      }

      const search = searchPredecessor.toLowerCase();
      return docs.filter(d =>
        d.numero?.toLowerCase().includes(search) ||
        d.arquivo?.toLowerCase().includes(search)
      ).slice(0, 50);
    }, [localDocumentos, doc.id, searchPredecessor]);

    return (
      <>
        <TableRow key={doc.id}>
          <TableCell>
            <Button variant="ghost" size="icon" onClick={() => toggleRow(doc.id)} disabled={isDocLoading}>
              {expandedRows[doc.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </TableCell>
          <TableCell className="font-medium">{doc.numero}</TableCell>
          <TableCell>{doc.arquivo}</TableCell>
          <TableCell className="text-sm text-gray-600 max-w-xs">
            {doc.descritivo ? (
              <span className="line-clamp-2" title={doc.descritivo}>{doc.descritivo}</span>
            ) : (
              <span className="text-gray-400 italic">Sem descrição</span>
            )}
          </TableCell>
          <TableCell>
            {doc.subdisciplinas && doc.subdisciplinas.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {doc.subdisciplinas.map((sub, idx) => (
                  <Badge key={idx} variant="secondary" className="text-xs">
                    {sub}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-gray-400 italic text-xs">-</span>
            )}
          </TableCell>
          <TableCell className="text-sm text-gray-600">
            {doc.escala ? `1:${doc.escala}` : '-'}
          </TableCell>
          {!effectiveReadOnly && (
            <TableCell className="w-[180px]">
              <div className="space-y-1">
                {doc.executor_principal ? (
                  <div className="flex items-center justify-between p-1 bg-green-50 border border-green-200 rounded">
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs font-medium text-green-800">
                        {usuariosOrdenados.find(u => u.email === doc.executor_principal)?.nome || doc.executor_principal}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExecutorChange('executor_principal', null)}
                      className="text-xs text-red-600 hover:text-red-700 h-6"
                      disabled={isUpdating || isDocLoading}
                    >
                      Remover
                    </Button>
                  </div>
                ) : (
                  <Select
                    onValueChange={(value) => handleExecutorSelectChange(value)}
                    disabled={isUpdating || isDocLoading}
                  >
                    <SelectTrigger className="w-full text-xs h-7 border-blue-500 text-blue-600 hover:bg-blue-50">
                      <Users2 className="w-3 h-3 mr-1" />
                      <SelectValue placeholder="Selecionar Executor" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuariosOrdenados.map(u => (
                        <SelectItem key={u.id} value={u.email}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(isUpdating || isDocLoading) && (
                  <div className="flex items-center gap-1 text-xs text-blue-600">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {isDocLoading ? "Planejando..." : "Salvando..."}
                  </div>
                )}
              </div>

              {/* Diálogo de aplicação a folhas relacionadas */}
              <Dialog open={showExecutorDialog} onOpenChange={setShowExecutorDialog}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Aplicar executor a folhas relacionadas?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Esta folha possui folhas predecessoras ou sucessoras. Deseja aplicar o executor <strong>{pendingExecutor}</strong> também a elas?
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleApplyToRelated(false)}
                        disabled={isUpdating}
                      >
                        Apenas esta folha
                      </Button>
                      <Button
                        onClick={() => handleApplyToRelated(true)}
                        disabled={isUpdating}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isUpdating ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Aplicando...
                          </>
                        ) : (
                          'Aplicar a todas'
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </TableCell>
          )}
          {!effectiveReadOnly && (
            <TableCell className="text-sm text-gray-700">
              <div className="flex flex-col">
                <span>Início: {doc.inicio_planejado ? format(parseISO(doc.inicio_planejado), 'dd/MM/yyyy') : 'N/A'}</span>
                <span>Término: {doc.termino_planejado ? format(parseISO(doc.termino_planejado), 'dd/MM/yyyy') : 'N/A'}</span>
              </div>
            </TableCell>
          )}
          {!effectiveReadOnly && (
            <TableCell className="text-sm text-gray-700">
              <div className="flex flex-col">
                <span className="font-medium">{`${tempoCalculadoPorEtapa.toFixed(1)}h`}</span>
                {etapaParaPlanejamento !== 'todas' && (
                  <span className="text-xs text-gray-500">({etapaParaPlanejamento})</span>
                )}
              </div>
            </TableCell>
          )}
          {!effectiveReadOnly && (
            <TableCell>
              <div className="space-y-2">
                {!effectiveReadOnly && (
                  <>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between text-xs h-8"
                          disabled={isDocLoading}
                        >
                          <span className="truncate">
                            {doc.predecessora_id
                              ? (() => {
                                const pred = localDocumentos.find(d => d.id === doc.predecessora_id);
                                return pred ? `${pred.numero}` : 'Não encontrado';
                              })()
                              : 'Predecessora'}
                          </span>
                          <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <div className="p-2 border-b">
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                            <Input
                              placeholder="Buscar documento..."
                              value={searchPredecessor}
                              onChange={(e) => setSearchPredecessor(e.target.value)}
                              className="pl-8"
                            />
                          </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                          <div className="p-1">
                            <Button
                              variant="ghost"
                              className="w-full justify-start text-left font-normal"
                              onClick={() => {
                                handlePredecessoraChange(doc.id, null);
                                setSearchPredecessor('');
                              }}
                            >
                              <span className="text-gray-500">Nenhum predecessor</span>
                            </Button>
                            {documentosFiltradosParaPredecessor.map(d => (
                              <Button
                                key={d.id}
                                variant="ghost"
                                className="w-full justify-start text-left font-normal"
                                onClick={() => {
                                  handlePredecessoraChange(doc.id, d.id);
                                  setSearchPredecessor('');
                                }}
                              >
                                <span className="font-medium">{d.numero}</span>
                                <span className="text-gray-500 ml-2 truncate">{d.arquivo}</span>
                              </Button>
                            ))}
                            {documentosFiltradosParaPredecessor.length === 0 && searchPredecessor && (
                              <div className="p-4 text-center text-sm text-gray-500">
                                Nenhum documento encontrado
                              </div>
                            )}
                            {!searchPredecessor && localDocumentos.length > 51 && (
                              <div className="p-2 text-xs text-center text-gray-500 bg-blue-50">
                                Mostrando 50 de {localDocumentos.length - 1} documentos. Use a busca para encontrar outros.
                              </div>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 border-blue-500 text-blue-600 hover:bg-blue-50"
                        onClick={() => handleOpenDocEtapaModal(doc)}
                        disabled={isDocLoading}
                        title="Planejar Documento"
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                      </Button>

                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEdit(doc)} disabled={isDocLoading}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDelete(doc.id)} disabled={isDocLoading}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </TableCell>
          )}
        </TableRow>

        {expandedRows[doc.id] && (
          <TableRow>
            <TableCell colSpan={8} className="bg-gray-50">
              <div className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold">Atividades da Folha: {doc.numero}</h4>
                  <div className="flex gap-2">
                    {etapaParaPlanejamento !== 'todas' && atividadesDisponiveis.filter(a => a.etapa === etapaParaPlanejamento && !a.estaConcluida).length > 0 && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          const atividadesDaEtapa = atividadesDisponiveis.filter(a => a.etapa === etapaParaPlanejamento && !a.estaConcluida);
                          if (!window.confirm(`Tem certeza que deseja concluir TODAS as ${atividadesDaEtapa.length} atividades da etapa "${etapaParaPlanejamento}" nesta folha?`)) {
                            return;
                          }
                          setIsUpdatingActivity(true);
                          try {
                            for (const atividade of atividadesDaEtapa) {
                              const existingMarkers = await retryWithBackoff(
                                () => base44.entities.AtividadesEmpreendimento.filter({
                                  empreendimento_id: empreendimento.id,
                                  id_atividade: atividade.id,
                                  documento_id: doc.id,
                                  tempo: 0
                                }),
                                3, 1000, `checkConclusionMarker-${atividade.id}-${doc.id}`
                              );

                              if (existingMarkers && existingMarkers.length > 0) continue;

                              await retryWithBackoff(
                                () => base44.entities.AtividadesEmpreendimento.create({
                                  etapa: atividade.etapa,
                                  disciplina: atividade.disciplina,
                                  subdisciplina: activity.subdisciplina || atividade.subdisciplina,
                                  atividade: `(Concluída na folha ${doc.numero}) ${String(atividade.atividade || '')}`,
                                  funcao: atividade.funcao,
                                  empreendimento_id: empreendimento.id,
                                  id_atividade: atividade.id,
                                  documento_id: doc.id,
                                  documento_ids: [doc.id],
                                  tempo: 0,
                                  status_planejamento: 'nao_planejada'
                                }),
                                3, 1000, `createConclusionMarker-${atividade.id}-${doc.id}`
                              );
                            }
                            alert(`✅ Todas as ${atividadesDaEtapa.length} atividades da etapa "${etapaParaPlanejamento}" foram concluídas!`);
                            await onUpdate();
                          } catch (error) {
                            console.error("Erro ao concluir etapa:", error);
                            alert("Erro ao concluir atividades: " + error.message);
                          } finally {
                            setIsUpdatingActivity(false);
                          }
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        disabled={isUpdatingActivity}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Concluir Etapa "{etapaParaPlanejamento}"
                      </Button>
                    )}
                    {selectedAtividades.length > 0 && (
                      <Button
                        size="sm"
                        onClick={handleMarcarMultiplasComoConcluidas}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={isUpdatingActivity}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Concluir {selectedAtividades.length} Selecionada(s)
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        // Abrir modal para criar nova atividade vinculada a esta folha
                        const novaAtividade = {
                          empreendimento_id: empreendimento.id,
                          documento_id: doc.id,
                          documento_ids: [doc.id],
                          disciplina: getDocumentoDisciplinaPrincipal(doc),
                          subdisciplinas: doc.subdisciplinas || []
                        };
                        handleEditAtividade(novaAtividade);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Atividade
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {atividadesDisponiveis.length > 0 ? atividadesDisponiveis.map(atividade => {
                    const subdisciplina = atividade.subdisciplina || 'N/A';

                    return (
                      <div
                        key={atividade.id}
                        className={`flex justify-between items-center p-3 rounded border ${atividade.estaConcluida
                          ? 'bg-blue-50 border-blue-200'
                          : atividade.jaFoiPlanejada
                            ? 'bg-green-50 border-green-200'
                            : 'bg-white border-gray-200'
                          }`}
                      >
                        <div className="flex items-center gap-3 flex-1 pr-2">
                          <Checkbox
                            checked={selectedAtividades.includes(atividade.id)}
                            onCheckedChange={() => handleToggleAtividade(atividade.id)}
                            disabled={isUpdatingActivity}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${atividade.estaConcluida || atividade.statusPlanejamento === 'concluido' ? 'line-through text-gray-500' : ''}`}>
                                {String(atividade.atividade || '').replace(/^\(Concluída na folha \d+\)\s*/, '').trim() || 'Atividade'}
                              </span>
                              {atividade.statusPlanejamento === 'concluido' && (
                                <Badge className="bg-green-600 text-white text-xs">
                                  Finalizado
                                </Badge>
                              )}
                              {atividade.estaConcluida && atividade.statusPlanejamento !== 'concluido' && (
                                <Badge className="bg-blue-100 text-blue-800 text-xs">
                                  Concluída Manualmente
                                </Badge>
                              )}
                              {atividade.statusPlanejamento === 'em_andamento' && (
                                <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                                  Em Andamento
                                </Badge>
                              )}
                              {atividade.statusPlanejamento === 'nao_iniciado' && (
                                <Badge className="bg-blue-100 text-blue-800 text-xs">
                                  Planejado
                                </Badge>
                              )}
                              {!atividade.statusPlanejamento && !atividade.estaConcluida && (
                                <Badge className="bg-gray-100 text-gray-600 text-xs">
                                  Disponível para planejamento
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {atividade.etapa} • {subdisciplina}
                              {atividade.area && (
                                <span className={`ml-2 ${atividade.estaConcluida ? 'line-through text-gray-400' : 'text-blue-600'}`}>
                                  • {atividade.tempoBaseParaExibicao.toFixed(2)}h/m² × {atividade.area}m²
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className={`text-sm font-medium ${atividade.estaConcluida || atividade.statusPlanejamento === 'concluido' ? 'line-through text-gray-400' : ''}`}>
                              {atividade.estaConcluida || atividade.statusPlanejamento === 'concluido'
                                ? `${((atividade.area || 1) * atividade.tempoBaseParaExibicao * (doc.fator_dificuldade || 1)).toFixed(1)}h`
                                : `${atividade.tempoComFator.toFixed(1)}h`
                              }
                            </div>
                            {atividade.statusPlanejamento === 'concluido' && (
                              <div className="text-xs text-green-600">
                                Finalizado no planejamento
                              </div>
                            )}
                            {atividade.estaConcluida && atividade.statusPlanejamento !== 'concluido' && (
                              <div className="text-xs text-gray-500">
                                Tempo zerado (concluída manualmente)
                              </div>
                            )}
                            {atividade.statusPlanejamento && atividade.statusPlanejamento !== 'concluido' && !atividade.estaConcluida && (
                              <div className="text-xs text-blue-600">
                                {atividade.statusPlanejamento === 'em_andamento' ? 'Em execução' : 'Planejado'}
                              </div>
                            )}
                            {!atividade.estaConcluida && !atividade.statusPlanejamento && (
                              <div className="text-xs text-gray-500">
                                Disponível para planejamento
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleMarcarComoConcluida(atividade)}
                            className={`${atividade.estaConcluida
                              ? 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                              : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                              }`}
                            title={atividade.estaConcluida ? "Desmarcar como concluída" : "Marcar como concluída"}
                            disabled={isUpdatingActivity}
                          >
                            {isUpdatingActivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleExcluirAtividade(atividade)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Excluir atividade SOMENTE desta folha"
                            disabled={isUpdatingActivity}
                          >
                            {isUpdatingActivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center text-gray-500 p-4">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="w-16 h-16 text-gray-300" />
                        <p>Nenhuma atividade encontrada para esta disciplina/subdisciplinas</p>
                        <p className="text-xs">
                          Disciplina: {getDocumentoDisciplinas(doc).join(' / ') || 'Sem Disciplina'} | Subdisciplinas: {(doc.subdisciplinas || []).join(', ') || 'Nenhuma'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {atividadesDisponiveis.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center text-sm text-gray-600">
                      <span>
                        Total: {atividadesDisponiveis.length} atividades |
                        Planejadas: {atividadesDisponiveis.filter(a => a.jaFoiPlanejada).length}
                      </span>
                      <span>
                        Tempo total: {atividadesDisponiveis.reduce((sum, a) => sum + a.tempoComFator, 0).toFixed(1)}h
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </TableCell>
          </TableRow>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0 bg-white">
        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Documentos ({filteredDocumentos.length})
            {effectiveReadOnly && <Badge variant="outline" className="ml-2 text-xs">Somente Visualização</Badge>}
          </CardTitle>
          {!effectiveReadOnly && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowImportModal(true)}
                className="border-green-500 text-green-600 hover:bg-green-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </Button>
              <Button
                onClick={() => setShowForm(true)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Documento
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6">
          {etapaParaPlanejamento !== "todas" && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-800">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium">
                  Modo: Planejamento "{etapaParaPlanejamento}"
                </span>
              </div>
            </div>
          )}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar documentos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={Object.keys(loadingDocs).some(id => loadingDocs[id])}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4 flex-1">
              <CardTitle>Documentos Cadastrados ({filteredDocumentos.length})</CardTitle>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="etapa-planejamento" className="text-sm font-medium whitespace-nowrap">
                    Planejar Etapa:
                  </Label>
                  <Select
                    value={etapaParaPlanejamento}
                    onValueChange={onEtapaChange}
                  >
                    <SelectTrigger id="etapa-planejamento" className="w-[180px]">
                      <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as etapas</SelectItem>
                      {[...new Set(etapasDisponiveis)].map(etapa => (
                        <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="filtro-area" className="text-sm font-medium whitespace-nowrap">
                    Filtrar por Área:
                  </Label>
                  <Select
                    value={filtroArea}
                    onValueChange={setFiltroArea}
                  >
                    <SelectTrigger id="filtro-area" className="w-[180px]">
                      <SelectValue placeholder="Todas as áreas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as áreas</SelectItem>
                      {(pavimentos || []).map(pav => (
                        <SelectItem key={pav.id} value={pav.id}>{pav.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
              <p className="text-gray-400 text-sm">
                {debouncedSearchTerm ? "Tente ajustar sua busca" : "Adicione documentos ao projeto para começar"}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {documentosPorDisciplina.map(([disciplina, docs]) => {
                const isMinimizado = disciplinasMinimizadas[disciplina];
                return (
                  <div key={disciplina} className="border rounded-lg overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b flex items-center justify-between cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
                      onClick={() => setDisciplinasMinimizadas(prev => ({ ...prev, [disciplina]: !prev[disciplina] }))}
                    >
                      <h3 className="font-semibold text-lg text-gray-800 flex items-center gap-2">
                        <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                        {disciplina}
                        <Badge variant="secondary" className="ml-2">
                          {docs.length} {docs.length === 1 ? 'documento' : 'documentos'}
                        </Badge>
                      </h3>
                      <button className="p-1 hover:bg-blue-200 rounded transition-colors">
                        {isMinimizado ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                    {!isMinimizado && (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px]"></TableHead>
                              <TableHead>Número</TableHead>
                              <TableHead>Arquivo</TableHead>
                              <TableHead>Descritivo</TableHead>
                              <TableHead>Subdisciplina</TableHead>
                              <TableHead>Escala</TableHead>
                              {!effectiveReadOnly && <TableHead>Executor</TableHead>}
                              {!effectiveReadOnly && <TableHead>Datas</TableHead>}
                              {!effectiveReadOnly && <TableHead>Tempo</TableHead>}
                              {!effectiveReadOnly && <TableHead className="w-[100px]">Ações</TableHead>}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
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
                                loadingDocs={loadingDocs}
                                empreendimento={empreendimento}
                                onUpdate={onUpdate}
                                readOnly={effectiveReadOnly}
                                isExpanded={!!expandedRows[doc.id]}
                                genericTempoIndex={genericTempoIndex}
                              />
                            ))}
                          </TableBody>
                        </Table>
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
            onClose={() => {
              setShowForm(false);
              setEditingDocumento(null);
            }}
            onSave={handleSuccess}
            disciplinas={disciplinas}
            atividades={allAtividades}
            pavimentos={pavimentos}
            documentos={localDocumentos}
            readOnly={effectiveReadOnly}
          />
        )}
      </AnimatePresence>

      {isDocEtapaModalOpen && documentForDocEtapaModal && (
        <PlanejamentoDocumentoEtapaModal
          documento={documentForDocEtapaModal}
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
          onClose={() => {
            setIsDocDataModalOpen(false);
            setDocumentForDocDataModal(null);
          }}
          onSuccess={() => {
            onUpdate();
            setIsDocDataModalOpen(false);
            setDocumentForDocDataModal(null);
          }}
        />
      )}

      {showAtividadeForm && (
        <AtividadeFormModal
          isOpen={showAtividadeForm}
          onClose={() => {
            setShowAtividadeForm(false);
            setEditingAtividade(null);
          }}
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
                  <li>• Colunas opcionais: <code className="bg-white px-1 rounded">descritivo</code>, <code className="bg-white px-1 rounded">pavimento_nome</code>, <code className="bg-white px-1 rounded">disciplinas</code>, <code className="bg-white px-1 rounded">subdisciplinas</code>, <code className="bg-white px-1 rounded">escala</code>, <code className="bg-white px-1 rounded">fator_dificuldade</code></li>
                  <li>• Múltiplas disciplinas/subdisciplinas devem ser separadas por <code className="bg-white px-1 rounded">,</code> ou <code className="bg-white px-1 rounded">;</code> (ex: Arquitetura,Hidráulica)</li>
                  <li>• Máximo de 2 disciplinas por documento</li>
                  <li>• Colunas de datas no formato <code className="bg-white px-1 rounded">ETAPA_REVISAO</code> (ex: ESTUDO PRELIMINAR_R00)</li>
                  <li>• Formato de data: <code className="bg-white px-1 rounded">DD/MM/AAAA</code> (ex: 15/01/2025)</li>
                  <li>• O pavimento_nome deve corresponder ao nome exato de um pavimento já cadastrado</li>
                  <li>• Baixe o template para ver exemplos completos</li>
                </ul>
              </div>

              <Button
                variant="outline"
                onClick={handleExportTemplate}
                className="w-full"
              >
                <Download className="w-4 h-4 mr-2" />
                Baixar Template CSV
              </Button>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full"
                />
                {importFile && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ Arquivo selecionado: {importFile.name}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                  }}
                  disabled={isImporting}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!importFile || isImporting}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Importar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
