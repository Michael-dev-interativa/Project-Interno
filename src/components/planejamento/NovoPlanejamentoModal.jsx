import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { PlanejamentoAtividade, AtividadeFuncao, PlanejamentoDocumento, Documento } from "@/entities/all";
import { Calendar as CalendarIcon, Plus, Users, Clock, FileText, Building2, Activity, Repeat, Search, Filter, BrainCircuit, Loader2, AlertCircle, File } from "lucide-react";
import { format, addDays, addWeeks, addMonths, startOfDay, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { distribuirHorasPorDias, getNextWorkingDay, isWorkingDay, ensureWorkingDay, normalizeUnavailableDates } from '../utils/DateCalculator';
import { agruparAtividadesPorEtapa } from '../utils/AtividadeOrdering';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { retryWithBackoff } from '../utils/apiUtils';

export default function NovoPlanejamentoModal({
  isOpen,
  onClose,
  empreendimentos = [],
  usuarios,
  atividades = [],
  descritivo_inicial = "",
  tempo_planejado_inicial = null,
  onSuccess
}) {
  const [planningMode, setPlanningMode] = useState('individual');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Estados para Planejamento Individual ---
  const [formData, setFormData] = useState({
    empreendimento_id: "",
    descritivo: "",
    executores: [],
    executor_principal: "",
    tempo_planejado: "",
    inicio_planejado: "",
    horario_inicio: "",
    horario_termino: "",
    status: "nao_iniciado",
    prioridade: 1
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [recorrencia, setRecorrencia] = useState({ tipo: 'semanal', repeticoes: 4 });
  const [activityFilters, setActivityFilters] = useState({ search: "", disciplina: "all" });
  // Uncontrolled ref for search — debounced via useEffect to update activityFilters without re-rendering on every keystroke
  const searchRef = useRef(null);
  const searchDebounceRef = useRef(null);
  // Uncontrolled ref for descritivo — avoids re-render on every keystroke
  const descritivoRef = useRef(null);
  // Tracks only empty/non-empty transition for submit button disabled check (not full string)
  const [hasDescritivo, setHasDescritivo] = useState(false);
  // Uncontrolled ref for tempo_planejado — avoids re-render on every keystroke
  const tempoPlanejadoRef = useRef(null);
  const [hasTempo, setHasTempo] = useState(false);
  // Track which planning mode tabs have been mounted (lazy mounting)
  const [mountedModes, setMountedModes] = useState(new Set(['individual']));

  // --- Estados para Planejamento por Função ---
  const [funcaoSelecionada, setFuncaoSelecionada] = useState('');
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [periodo, setPeriodo] = useState({ from: startOfDay(new Date()), to: addMonths(new Date(), 1) });
  const [atividadesFuncao, setAtividadesFuncao] = useState([]);
  const [isLoadingFuncaoData, setIsLoadingFuncaoData] = useState(false);
  const [generationStatus, setGenerationStatus] = useState({ message: '', error: false });

  // --- Estados para Planejamento por Documento ---
  const [documentoEmpreendimentoId, setDocumentoEmpreendimentoId] = useState('');
  const [documentoSelecionado, setDocumentoSelecionado] = useState('');
  const [documentos, setDocumentos] = useState([]);
  const [isLoadingDocumentos, setIsLoadingDocumentos] = useState(false);
  const [etapaDocumento, setEtapaDocumento] = useState(''); // NOVO: Etapa selecionada
  const [documentoFormData, setDocumentoFormData] = useState({
    executores: [],
    executor_principal: "",
    tempo_planejado: "",
    horario_inicio: "",
    horario_termino: "",
  });
  const [selectedDocumentoDate, setSelectedDocumentoDate] = useState(null);

  // --- Lógica Comum e de Efeitos ---

  // Debounced handler for search ref — called from onChange, no state needed
  const handleSearchChange = useCallback((value) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setActivityFilters(prev => ({ ...prev, search: value }));
    }, 300);
  }, []);

  // **NOVO**: Ordenar empreendimentos alfabeticamente por nome
  const empreendimentosOrdenados = useMemo(() => {
    if (!empreendimentos) return [];
    return [...empreendimentos].sort((a, b) => {
      const nomeA = a.nome || '';
      const nomeB = b.nome || '';
      return nomeA.localeCompare(nomeB);
    });
  }, [empreendimentos]);

  // **NOVO**: Ordenar usuários alfabeticamente por nome
  const usuariosOrdenados = useMemo(() => {
    if (!usuarios) return [];
    return [...usuarios].sort((a, b) => {
      const nomeA = a.nome || a.email || '';
      const nomeB = b.nome || b.email || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [usuarios]);

  const disciplinasUnicas = useMemo(() => {
    const disciplinas = new Set();
    atividades.forEach(ativ => {
      if (ativ.disciplina) disciplinas.add(ativ.disciplina);
    });
    return Array.from(disciplinas).sort();
  }, [atividades]);

  const atividadesFiltradas = useMemo(() => {
    let filtered = [...atividades];
    if (activityFilters.search) {
      const searchTerm = activityFilters.search.toLowerCase();
      filtered = filtered.filter(ativ => {
        const atividadeStr = String(ativ.atividade || '').toLowerCase();
        const disciplinaStr = String(ativ.disciplina || '').toLowerCase();
        const subdisciplinaStr = String(ativ.subdisciplina || '').toLowerCase();
        return atividadeStr.includes(searchTerm) ||
               disciplinaStr.includes(searchTerm) ||
               subdisciplinaStr.includes(searchTerm);
      });
    }
    if (activityFilters.disciplina !== "all") {
      filtered = filtered.filter(ativ => ativ.disciplina === activityFilters.disciplina);
    }
    return filtered;
  }, [atividades, activityFilters]);

  const groupedAtividades = useMemo(() => {
    if (!atividadesFiltradas) return {};
    return agruparAtividadesPorEtapa(atividadesFiltradas);
  }, [atividadesFiltradas]);

  const cargosUnicos = useMemo(() => {
    const cargos = new Set(usuariosOrdenados.map(u => u.cargo).filter(Boolean));
    return Array.from(cargos).sort();
  }, [usuariosOrdenados]);

  const executorUnavailableDatesMap = useMemo(() => {
    return (usuarios || []).reduce((map, user) => {
      if (!user || !user.email) return map;
      const dates = user.datas_indisponiveis || user.unavailable_dates || user.feriados || user.ferias || [];
      map[user.email] = normalizeUnavailableDates(dates);
      return map;
    }, {});
  }, [usuarios]);

  const getExecutorUnavailableDates = (email) => executorUnavailableDatesMap[email] || new Set();

  const funcoesComModelo = useMemo(() => {
    if (!atividadesFuncao) return [];
    const funcoes = new Set(atividadesFuncao.map(af => af.funcao).filter(Boolean));
    return Array.from(funcoes).sort();
  }, [atividadesFuncao]);

  const resetIndividualForm = () => {
    setFormData({
      empreendimento_id: "", descritivo: "", executores: [], executor_principal: "",
      tempo_planejado: "", inicio_planejado: "", horario_inicio: "", horario_termino: "",
      status: "nao_iniciado", prioridade: 1
    });
    if (descritivoRef.current) descritivoRef.current.value = "";
    setHasDescritivo(false);
    if (tempoPlanejadoRef.current) tempoPlanejadoRef.current.value = "";
    setHasTempo(false);
    setSelectedDate(null);
    setSelectedActivityId("");
    setIsRecorrente(false);
    setRecorrencia({ tipo: 'semanal', repeticoes: 4 });
    setActivityFilters({ search: "", disciplina: "all" });
    if (searchRef.current) searchRef.current.value = "";
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  };

  const resetFuncaoForm = () => {
    setFuncaoSelecionada('');
    setUsuarioSelecionado('');
    setPeriodo({ from: startOfDay(new Date()), to: addMonths(new Date(), 1) });
    setGenerationStatus({ message: '', error: false });
  };

  const resetDocumentoForm = () => {
    setDocumentoEmpreendimentoId('');
    setDocumentoSelecionado('');
    setDocumentos([]);
    setEtapaDocumento(''); // Reset etapa
    setDocumentoFormData({
      executores: [],
      executor_principal: "",
      tempo_planejado: "",
      horario_inicio: "",
      horario_termino: "",
    });
    setSelectedDocumentoDate(null);
  };

  useEffect(() => {
    if (!isOpen) {
      resetIndividualForm();
      resetFuncaoForm();
      resetDocumentoForm();
      setPlanningMode('individual');
      setMountedModes(new Set(['individual']));
    } else if (descritivo_inicial || tempo_planejado_inicial) {
      const desc = descritivo_inicial || "";
      setFormData(prev => ({
        ...prev,
        descritivo: desc || prev.descritivo,
        tempo_planejado: tempo_planejado_inicial != null ? String(Number(tempo_planejado_inicial)) : prev.tempo_planejado,
      }));
      if (desc && descritivoRef.current) {
        descritivoRef.current.value = desc;
        setHasDescritivo(true);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchFuncaoData = async () => {
      if (isOpen && planningMode === 'funcao') { // Fetches every time tab is opened to get latest models
        setIsLoadingFuncaoData(true);
        try {
          const data = await retryWithBackoff(() => AtividadeFuncao.list(), 3, 1000, 'fetchAtividadesFuncao');
          setAtividadesFuncao(data || []);
        } catch (error) {
          console.error("Erro ao buscar atividades por função:", error);
        } finally {
          setIsLoadingFuncaoData(false);
        }
      }
    };
    fetchFuncaoData();
  }, [planningMode, isOpen]);

  // **CORRIGIDO**: Carregar documentos SEMPRE que empreendimento muda, sem cache
  useEffect(() => {
    const loadDocumentos = async () => {
      if (documentoEmpreendimentoId && planningMode === 'documento') {
        setIsLoadingDocumentos(true);
        setDocumentos([]); // **NOVO**: Limpar lista antes de carregar
        setDocumentoSelecionado(''); // **NOVO**: Limpar seleção
        setEtapaDocumento(''); // **NOVO**: Limpar etapa
        
        try {
          
          // **CORRIGIDO**: Forçar busca fresca do banco sem cache
          const docs = await retryWithBackoff(
            () => Documento.filter({ empreendimento_id: documentoEmpreendimentoId }),
            3, 1000, 'loadDocumentos'
          );
          
          
          if (docs && docs.length > 0) {
            // **NOVO**: Log dos primeiros documentos para verificar dados
          }
          
          setDocumentos(docs || []);
        } catch (error) {
          console.error("❌ [Planejamento Documento] Erro ao carregar documentos:", error);
          setDocumentos([]);
        } finally {
          setIsLoadingDocumentos(false);
        }
      } else {
        setDocumentos([]);
        setDocumentoSelecionado('');
        setEtapaDocumento('');
      }
    };
    loadDocumentos();
  }, [documentoEmpreendimentoId, planningMode]);

  // **MODIFICADO**: Resetar etapa quando documento muda
  useEffect(() => {
    if (documentoSelecionado && planningMode === 'documento') {
      setEtapaDocumento(''); // Reset etapa ao trocar documento
      setDocumentoFormData(prev => ({
        ...prev,
        tempo_planejado: "" // Limpa o tempo até selecionar etapa
      }));
    }
  }, [documentoSelecionado, planningMode]);

  // **CORRIGIDO**: Recalcular etapas sempre que documentos ou documento selecionado mudar
  const etapasDisponiveis = useMemo(() => {
    if (!documentoSelecionado || !documentos || documentos.length === 0) {
      return [];
    }
    
    const documento = documentos.find(d => d.id === documentoSelecionado);
    if (!documento) {
      return [];
    }

    // NOVO: Log completo do documento para debug

    // Mapeamento de etapas com seus respectivos campos e ordem
    const etapasComTempos = [
      { nome: 'Concepção', campo: 'tempo_concepcao', ordem: 1 },
      { nome: 'Planejamento', campo: 'tempo_planejamento', ordem: 2 },
      { nome: 'Estudo Preliminar', campo: 'tempo_estudo_preliminar', ordem: 3 },
      { nome: 'Ante-Projeto', campo: 'tempo_ante_projeto', ordem: 4 },
      { nome: 'Projeto Básico', campo: 'tempo_projeto_basico', ordem: 5 },
      { nome: 'Projeto Executivo', campo: 'tempo_projeto_executivo', ordem: 6 },
      { nome: 'Liberado para Obra', campo: 'tempo_liberado_obra', ordem: 7 }
    ];

    // Filtrar apenas etapas que têm tempo > 0
    const etapasComAtividades = etapasComTempos
      .map(etapa => {
        const valorBruto = documento[etapa.campo];
        const tempo = Number(valorBruto) || 0;
        
        // NOVO: Log detalhado de cada etapa
        
        return { ...etapa, tempo, valorBruto };
      })
      .filter(etapa => etapa.tempo > 0)
      .sort((a, b) => a.ordem - b.ordem);


    return etapasComAtividades;
  }, [documentoSelecionado, documentos]); // **CORRIGIDO**: Dependências atualizadas

  // **CORRIGIDO**: Preencher automaticamente o tempo baseado na etapa selecionada
  // Agora só executa quando os documentos estiverem carregados
  useEffect(() => {
    // **CORREÇÃO CRÍTICA**: Adicionar verificação para isLoadingDocumentos
    if (isLoadingDocumentos) {
      return; // Não executar enquanto está carregando
    }

    if (!documentoSelecionado || !etapaDocumento || planningMode !== 'documento') {
      return; // Não executar se não houver documento ou etapa selecionados
    }

    // **CORREÇÃO**: Verificar se a lista de documentos não está vazia
    if (!documentos || documentos.length === 0) {
      return;
    }

    const documento = documentos.find(d => d.id === documentoSelecionado);

    if (!documento) {
      console.error(`❌ [Planejamento Documento] Documento com ID ${documentoSelecionado} não encontrado na lista de ${documentos.length} documentos`);
      return;
    }


    let tempoEtapa = null; // Initialize with null to distinguish from 0 or empty string

    // Mapear etapa selecionada para o campo correto no documento
    const etapaParaCampo = {
      'Estudo Preliminar': 'tempo_estudo_preliminar',
      'Ante-Projeto': 'tempo_ante_projeto',
      'Projeto Básico': 'tempo_projeto_basico',
      'Projeto Executivo': 'tempo_projeto_executivo',
      'Liberado para Obra': 'tempo_liberado_obra',
      'Concepção': 'tempo_concepcao',
      'Planejamento': 'tempo_planejamento'
    };

    const campoTempo = etapaParaCampo[etapaDocumento];

    if (campoTempo) {
      // **CORREÇÃO**: Verificar se o campo existe e tem um valor numérico válido (incluindo zero)
      const valorCampo = documento[campoTempo];

      if (typeof valorCampo === 'number' && !isNaN(valorCampo)) {
        tempoEtapa = valorCampo;
      } else if (valorCampo !== undefined && valorCampo !== null) {
        // Tenta converter para número se não for undefined ou null
        const tentativaConversao = Number(valorCampo);
        if (!isNaN(tentativaConversao)) {
          tempoEtapa = tentativaConversao;
        } else {
        }
      } else {
      }
    } else {
      console.error(`❌ [Planejamento Documento] Etapa '${etapaDocumento}' não tem mapeamento de campo configurado.`);
    }

    if (typeof tempoEtapa === 'number' && !isNaN(tempoEtapa)) { // This correctly handles 0 as a valid time
      setDocumentoFormData(prev => ({
        ...prev,
        tempo_planejado: tempoEtapa.toString()
      }));
    } else {
      setDocumentoFormData(prev => ({
        ...prev,
        tempo_planejado: ""
      }));
    }
  }, [etapaDocumento, documentoSelecionado, documentos, planningMode, isLoadingDocumentos]); // **CORREÇÃO**: Adicionada dependência isLoadingDocumentos

  // --- Lógicas de Submissão ---

  const handleActivityChange = (activityId) => {
    setSelectedActivityId(activityId);
    if (activityId) {
      const activity = atividades.find(a => a.id === activityId);
      if (activity) {
        const descritivo = String(activity.atividade || '');
        setFormData(prev => ({
          ...prev,
          descritivo: descritivo || prev.descritivo,
          tempo_planejado: activity.tempo?.toString() || prev.tempo_planejado,
        }));
        if (descritivo && descritivoRef.current) {
          descritivoRef.current.value = descritivo;
          setHasDescritivo(true);
        }
        if (activity.tempo != null && tempoPlanejadoRef.current) {
          tempoPlanejadoRef.current.value = activity.tempo.toString();
          setHasTempo(true);
        }
      }
    } else {
      setFormData(prev => ({ ...prev, descritivo: "", tempo_planejado: "" }));
      if (descritivoRef.current) descritivoRef.current.value = "";
      setHasDescritivo(false);
      if (tempoPlanejadoRef.current) tempoPlanejadoRef.current.value = "";
      setHasTempo(false);
    }
  };

  const handleExecutorChange = (email, isChecked) => {
    if (isChecked) {
      setFormData(prev => ({
        ...prev,
        executores: [...prev.executores, email],
        executor_principal: prev.executor_principal || email
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        executores: prev.executores.filter(e => e !== email),
        executor_principal: prev.executor_principal === email ? (prev.executores.find(e => e !== email) || "") : prev.executor_principal
      }));
    }
  };

  const handleDocumentoExecutorChange = (email, isChecked) => {
    if (isChecked) {
      setDocumentoFormData(prev => ({
        ...prev,
        executores: [...prev.executores, email],
        executor_principal: prev.executor_principal || email
      }));
    } else {
      setDocumentoFormData(prev => ({
        ...prev,
        executores: prev.executores.filter(e => e !== email),
        executor_principal: prev.executor_principal === email ? (prev.executores.find(e => e !== email) || "") : prev.executor_principal
      }));
    }
  };

  const planAndCreateForExecutor = async (executor, isPrincipal, cargaDiariaExistente, dataPartida, descritivo, tempoTotal, unavailableDates) => {
    const diaDePartidaReal = new Date(dataPartida);
    const { distribuicao, dataTermino, cargaAtualizada } = distribuirHorasPorDias(diaDePartidaReal, tempoTotal, 8, cargaDiariaExistente, false, unavailableDates);

    if (Object.keys(distribuicao).length === 0) {
      return { termino: dataPartida, carga: cargaDiariaExistente };
    }

    const inicioPlanejado = Object.keys(distribuicao).sort()[0];
    const terminoPlanejadoStr = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : Object.keys(distribuicao).sort().reverse()[0];

    const dadosPlanejamento = {
      empreendimento_id: formData.empreendimento_id || null,
      descritivo: `${descritivo}${!isPrincipal && formData.executores.length > 1 ? ` (Executor)`: ''}`,
      executores: [executor], executor_principal: executor, tempo_planejado: tempoTotal,
      inicio_planejado: inicioPlanejado, termino_planejado: terminoPlanejadoStr,
      horario_inicio: formData.horario_inicio || null,
      horario_termino: formData.horario_termino || null,
      prioridade: Number(formData.prioridade), horas_por_dia: distribuicao, status: "nao_iniciado"
    };

    await PlanejamentoAtividade.create(dadosPlanejamento);
    return { termino: dataTermino, carga: cargaAtualizada };
  };

  const handleIndividualSubmit = async () => {
    const descritivo = descritivoRef.current?.value || formData.descritivo;
    const tempoPlanejadoVal = tempoPlanejadoRef.current?.value || formData.tempo_planejado;
    if (!descritivo || !formData.executor_principal || !tempoPlanejadoVal || Number(tempoPlanejadoVal) <= 0) {
        alert("Por favor, preencha a descrição, executor principal e tempo planejado.");
        return;
    }

    setIsSubmitting(true);
    try {
      const tempoTotal = Number(tempoPlanejadoVal);
      const allSelectedExecutors = formData.executores;
      const planejamentosExistentes = await PlanejamentoAtividade.filter({ executor_principal: { '$in': allSelectedExecutors } });

      const cargaPorExecutor = {};
      allSelectedExecutors.forEach(email => { cargaPorExecutor[email] = {}; });

      planejamentosExistentes.forEach(p => {
        const executorEmail = p.executor_principal;
        if (executorEmail && cargaPorExecutor[executorEmail] && p.horas_por_dia) {
          Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
            cargaPorExecutor[executorEmail][data] = (cargaPorExecutor[executorEmail][data] || 0) + Number(horas || 0);
          });
        }
      });

      let proximaDataDePartida = selectedDate ? startOfDay(selectedDate) : getNextWorkingDay(new Date(), getExecutorUnavailableDates(formData.executor_principal));
      const repeticoes = isRecorrente ? Math.max(1, parseInt(recorrencia.repeticoes, 10) || 1) : 1;
      let createdCount = 0;

      for (let i = 0; i < repeticoes; i++) {
        const descritivoDaOcorrencia = isRecorrente ? `${descritivo} (${i + 1}/${repeticoes})` : descritivo;
        let ultimoTerminoParaEstaOcorrencia = null;
        
        // Guardar a data de início desta ocorrência para calcular a próxima
        const inicioDestaOcorrencia = new Date(proximaDataDePartida);

        const createPlanLoop = async (executorList) => {
          for (const executor of executorList) {
            const cargaDoExecutor = cargaPorExecutor[executor] || {};
            const unavailableDates = getExecutorUnavailableDates(executor);
            const { termino, carga } = await planAndCreateForExecutor(
              executor, executor === formData.executor_principal, cargaDoExecutor,
              proximaDataDePartida, descritivoDaOcorrencia, tempoTotal, unavailableDates
            );
            cargaPorExecutor[executor] = carga;
            if (!ultimoTerminoParaEstaOcorrencia || (termino && termino > ultimoTerminoParaEstaOcorrencia)) {
              ultimoTerminoParaEstaOcorrencia = termino;
            }
            createdCount++;
          }
        };

        if (formData.executores.length > 1) {
          await createPlanLoop(formData.executores);
        } else {
          await createPlanLoop([formData.executor_principal]);
        }

        // **CORRIGIDO**: Lógica de cálculo da próxima data de partida
        if (isRecorrente && i < repeticoes - 1) {
            if (recorrencia.tipo === 'mesmo_dia') {
                // Mantém a mesma data para todas as repetições
            } else if (recorrencia.tipo === 'diaria') {
                // **CORREÇÃO CRÍTICA**: Para diária, avançar 1 dia e garantir que é dia útil
                // Usando ensureWorkingDay em vez de getNextWorkingDay para não pular dias
                proximaDataDePartida = ensureWorkingDay(addDays(inicioDestaOcorrencia, 1));
            } else if (ultimoTerminoParaEstaOcorrencia) {
                // Para outros tipos (semanal, quinzenal, mensal), avançar a partir do início
                let proximoPontoDePartida;
                switch (recorrencia.tipo) {
                    case 'semanal': proximoPontoDePartida = addWeeks(inicioDestaOcorrencia, 1); break;
                    case 'quinzenal': proximoPontoDePartida = addWeeks(inicioDestaOcorrencia, 2); break;
                    case 'mensal': proximoPontoDePartida = addMonths(inicioDestaOcorrencia, 1); break;
                    default: proximoPontoDePartida = addWeeks(inicioDestaOcorrencia, 1);
                }
                proximaDataDePartida = getNextWorkingDay(proximoPontoDePartida, getExecutorUnavailableDates(formData.executor_principal));
            }
        }
      }

      alert(`${createdCount} planejamento${createdCount > 1 ? 's' : ''} criado${createdCount > 1 ? 's' : ''} com sucesso!`);
      if (onSuccess) onSuccess({ executor_principal: formData.executor_principal, executores: formData.executores });
    } catch (error) {
      console.error("Erro ao criar planejamento individual:", error);
      alert("Erro ao criar planejamento. Verifique os dados e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFunctionSubmit = async () => {
    // Lógica de Planejamento por Função
    if (!funcaoSelecionada || !usuarioSelecionado || !periodo?.from || !periodo?.to) {
      alert("Selecione um modelo de função, um usuário e um período válido.");
      return;
    }

    setIsSubmitting(true);
    setGenerationStatus({ message: 'Iniciando geração...', error: false });

    try {
      const atividadesParaFuncao = atividadesFuncao.filter(af => af.funcao === funcaoSelecionada);
      if (atividadesParaFuncao.length === 0) {
        setGenerationStatus({ message: 'Nenhuma atividade modelo encontrada para esta função.', error: true });
        return;
      }

      const usuariosParaPlanejar = usuarios.filter(u => u.email === usuarioSelecionado);

      if (usuariosParaPlanejar.length === 0) {
        setGenerationStatus({ message: 'O usuário selecionado não foi encontrado.', error: true });
        return;
      }

      setGenerationStatus({ message: `Buscando carga de trabalho para ${usuariosParaPlanejar[0].nome || usuariosParaPlanejar[0].email}...`, error: false });
      const emailsDosUsuarios = usuariosParaPlanejar.map(u => u.email);
      const planejamentosExistentes = await retryWithBackoff(() => PlanejamentoAtividade.filter({ executor_principal: { '$in': emailsDosUsuarios } }), 3, 1500);

      const cargaPorExecutor = {};
      emailsDosUsuarios.forEach(email => { cargaPorExecutor[email] = {}; });
      planejamentosExistentes.forEach(p => {
        const executorEmail = p.executor_principal;
        if (executorEmail && cargaPorExecutor[executorEmail] && p.horas_por_dia) {
          Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
            cargaPorExecutor[executorEmail][data] = (cargaPorExecutor[executorEmail][data] || 0) + Number(horas || 0);
          });
        }
      });

      let totalPlanosCriados = 0;
      let dataAtual = startOfDay(periodo.from);

      while (isBefore(dataAtual, startOfDay(periodo.to))) {
        for (const usuario of usuariosParaPlanejar) {
          const unavailableDates = getExecutorUnavailableDates(usuario.email);
          setGenerationStatus({ message: `Planejando para ${usuario.nome || usuario.email} em ${format(dataAtual, 'dd/MM/yyyy')}...`, error: false });
          let cargaDoExecutor = cargaPorExecutor[usuario.email] || {};

          for (const atividadeModelo of atividadesParaFuncao) {
            let deveCriar = false;

            const diasSemanaModelo = atividadeModelo.dias_semana || []; // Assume 0=Dom, 1=Seg...
            const diaDaSemanaAtual = dataAtual.getDay(); // 0=Dom, 1=Seg...

            switch (atividadeModelo.frequencia) {
              case 'diaria':
                deveCriar = diasSemanaModelo.includes(diaDaSemanaAtual);
                break;
              case 'semanal':
                deveCriar = diasSemanaModelo.includes(diaDaSemanaAtual);
                break;
              case 'quinzenal':
                const semanaDoMes = Math.floor((dataAtual.getDate() - 1) / 7); // 0-indexed week of month
                deveCriar = diasSemanaModelo.includes(diaDaSemanaAtual) && (semanaDoMes % 2 === 0); // Ex: 1ª, 3ª semana (indices 0, 2, 4)
                break;
              case 'mensal':
                deveCriar = dataAtual.getDate() === atividadeModelo.dia_mes;
                break;
              default:
                deveCriar = false;
            }

            if (deveCriar && isWorkingDay(dataAtual, unavailableDates)) {
              for (let i = 0; i < (atividadeModelo.repeticoes || 1); i++) {
                const { distribuicao, dataTermino, cargaAtualizada } = distribuirHorasPorDias(
                  dataAtual, atividadeModelo.tempo_estimado, 8, cargaDoExecutor, false, unavailableDates
                );

                if (Object.keys(distribuicao).length > 0) {
                  const inicio = Object.keys(distribuicao).sort()[0];
                  const fim = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : inicio;
                  await PlanejamentoAtividade.create({
                    descritivo: atividadeModelo.atividade,
                    base_descritivo: atividadeModelo.atividade,
                    executor_principal: usuario.email,
                    executores: [usuario.email],
                    tempo_planejado: atividadeModelo.tempo_estimado,
                    inicio_planejado: inicio,
                    termino_planejado: fim,
                    horas_por_dia: distribuicao,
                    status: "nao_iniciado",
                  });
                  cargaDoExecutor = cargaAtualizada;
                  totalPlanosCriados++;
                }
              }
            }
          }
          cargaPorExecutor[usuario.email] = cargaDoExecutor;
        }
        dataAtual = addDays(dataAtual, 1);
      }

      setGenerationStatus({ message: `Concluído! ${totalPlanosCriados} planejamentos foram criados com sucesso.`, error: false });
      alert(`Concluído! ${totalPlanosCriados} planejamentos foram criados com sucesso.`);
      if (onSuccess) onSuccess(true);

    } catch (error) {
      console.error("Erro na geração de planejamento por função:", error);
      setGenerationStatus({ message: `Erro: ${error.message}`, error: true });
      alert(`Erro ao gerar planejamento: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDocumentoSubmit = async () => {
    if (!documentoEmpreendimentoId || !documentoSelecionado || !etapaDocumento || !documentoFormData.executor_principal || !documentoFormData.tempo_planejado || Number(documentoFormData.tempo_planejado) <= 0) {
      alert("Por favor, preencha o empreendimento, documento, etapa, executor principal e tempo planejado.");
      return;
    }

    setIsSubmitting(true);
    try {
      const documento = documentos.find(d => d.id === documentoSelecionado);
      if (!documento) {
        alert("Documento não encontrado.");
        return;
      }

      const tempoTotal = Number(documentoFormData.tempo_planejado);
      const allSelectedExecutors = documentoFormData.executores;
      const planejamentosExistentes = await PlanejamentoDocumento.filter({ executor_principal: { '$in': allSelectedExecutors } });

      const cargaPorExecutor = {};
      allSelectedExecutors.forEach(email => { cargaPorExecutor[email] = {}; });

      planejamentosExistentes.forEach(p => {
        const executorEmail = p.executor_principal;
        if (executorEmail && cargaPorExecutor[executorEmail] && p.horas_por_dia) {
          Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
            cargaPorExecutor[executorEmail][data] = (cargaPorExecutor[executorEmail][data] || 0) + Number(horas || 0);
          });
        }
      });

      let proximaDataDePartida = selectedDocumentoDate ? startOfDay(selectedDocumentoDate) : getNextWorkingDay(new Date(), getExecutorUnavailableDates(documentoFormData.executor_principal));
      let createdCount = 0;

      for (const executor of allSelectedExecutors) {
        const cargaDoExecutor = cargaPorExecutor[executor] || {};
        const unavailableDates = getExecutorUnavailableDates(executor);
        const diaDePartidaReal = new Date(proximaDataDePartida);
        const { distribuicao, dataTermino, cargaAtualizada } = distribuirHorasPorDias(diaDePartidaReal, tempoTotal, 8, cargaDoExecutor, false, unavailableDates);

        if (Object.keys(distribuicao).length === 0) {
          continue;
        }

        const inicioPlanejado = Object.keys(distribuicao).sort()[0];
        const terminoPlanejadoStr = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : Object.keys(distribuicao).sort().reverse()[0];

        // MODIFICADO: Incluir etapa no descritivo
        const descritivoCompleto = `${documento.numero || ''} - ${documento.arquivo} - ${etapaDocumento}${allSelectedExecutors.length > 1 && executor !== documentoFormData.executor_principal ? ` (Executor)` : ''}`;

        const dadosPlanejamento = {
          documento_id: documento.id,
          descritivo: descritivoCompleto,
          empreendimento_id: documentoEmpreendimentoId,
          etapa: etapaDocumento, // MODIFICADO: Usar a etapa selecionada
          executores: [executor],
          executor_principal: executor,
          tempo_planejado: tempoTotal,
          inicio_planejado: inicioPlanejado,
          termino_planejado: terminoPlanejadoStr,
          horario_inicio: documentoFormData.horario_inicio || null,
          horario_termino: documentoFormData.horario_termino || null,
          prioridade: 1,
          horas_por_dia: distribuicao,
          status: "nao_iniciado"
        };

        await PlanejamentoDocumento.create(dadosPlanejamento);
        cargaPorExecutor[executor] = cargaAtualizada;
        createdCount++;
      }

      alert(`${createdCount} planejamento${createdCount > 1 ? 's' : ''} de documento criado${createdCount > 1 ? 's' : ''} com sucesso!`);
      if (onSuccess) onSuccess(true);
    } catch (error) {
      console.error("Erro ao criar planejamento de documento:", error);
      alert("Erro ao criar planejamento de documento. Verifique os dados e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Sync uncontrolled descritivo input to formData before submitting
    if (descritivoRef.current) {
      setFormData(prev => ({ ...prev, descritivo: descritivoRef.current.value }));
    }
    if (planningMode === 'individual') {
      handleIndividualSubmit();
    } else if (planningMode === 'funcao') {
      handleFunctionSubmit();
    } else if (planningMode === 'documento') {
      handleDocumentoSubmit();
    }
  };

  const documentoSelecionadoObj = documentos.find(d => d.id === documentoSelecionado);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-600" />
            Novo Planejamento
          </DialogTitle>
        </DialogHeader>

        <Tabs value={planningMode} onValueChange={(mode) => { setPlanningMode(mode); setMountedModes(prev => { prev.add(mode); return new Set(prev); }); }} className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="individual">
              <Users className="w-4 h-4 mr-2" />
              Individual
            </TabsTrigger>
            <TabsTrigger value="funcao">
              <BrainCircuit className="w-4 h-4 mr-2" />
              Departamento
            </TabsTrigger>
            <TabsTrigger value="documento">
              <File className="w-4 h-4 mr-2" />
              Por Documento
            </TabsTrigger>
          </TabsList>

          {/* Aba de Planejamento Individual */}
          <TabsContent value="individual">
            <div className="space-y-6 py-4">
              {/* Seletor de Atividade Pré-definida com Filtros */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><Activity className="w-4 h-4" />Atividade Pré-definida (Opcional)</Label>
                <div className="space-y-3 p-3 border rounded-lg bg-gray-50/50">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><Filter className="w-4 h-4 text-purple-600" />Filtrar Atividades</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input ref={searchRef} placeholder="Buscar atividade..." defaultValue="" onChange={(e) => handleSearchChange(e.target.value)} className="pl-10 text-sm" />
                    </div>
                    <Select value={activityFilters.disciplina} onValueChange={(value) => setActivityFilters(prev => ({ ...prev, disciplina: value }))}>
                      <SelectTrigger className="text-sm"><SelectValue placeholder="Todas as disciplinas" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as disciplinas</SelectItem>
                        <Separator className="my-1" />
                        {disciplinasUnicas.map(disc => (<SelectItem key={disc} value={disc}>{disc}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-gray-500 pt-1">{atividadesFiltradas.length} atividade{atividadesFiltradas.length !== 1 ? 's' : ''} encontrada{atividadesFiltradas.length !== 1 ? 's' : ''}</div>
                </div>
                <Select value={selectedActivityId} onValueChange={handleActivityChange}>
                  <SelectTrigger><SelectValue placeholder="Selecione para preencher automaticamente" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value={null}>Nenhuma (descrever manualmente)</SelectItem>
                    <Separator className="my-1" />
                    {Object.keys(groupedAtividades).length > 0 ? (Object.entries(groupedAtividades).map(([etapa, atividadesDoGrupo]) => (
                      <SelectGroup key={etapa}>
                        <SelectLabel>{etapa} ({atividadesDoGrupo.length})</SelectLabel>
                        {atividadesDoGrupo.map(ativ => (
                         <SelectItem key={ativ.id} value={ativ.id}>
                           <div className="flex flex-col items-start text-left">
                             <span>{String(ativ.atividade || '')}</span>
                             <span className="text-xs text-gray-500">{String(ativ.disciplina || '')} {ativ.subdisciplina ? `• ${String(ativ.subdisciplina)}` : ''}</span>
                           </div>
                         </SelectItem>
                        ))}
                      </SelectGroup>
                    ))) : (<SelectItem value="no-activities" disabled>Nenhuma atividade encontrada</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Restante do formulário individual */}
              <div className="space-y-2"><Label className="flex items-center gap-2"><FileText className="w-4 h-4" />Descrição da Atividade *</Label><Input ref={descritivoRef} defaultValue={formData.descritivo} onChange={(e) => { const filled = e.target.value.length > 0; if (filled !== hasDescritivo) setHasDescritivo(filled); }} onBlur={(e) => setFormData(prev => ({ ...prev, descritivo: e.target.value }))} placeholder="Ou descreva uma nova atividade aqui"/></div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Empreendimento (Opcional)
                </Label>
                <Select value={formData.empreendimento_id} onValueChange={(value) => setFormData(prev => ({ ...prev, empreendimento_id: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um empreendimento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nenhum</SelectItem>
                    {empreendimentosOrdenados && empreendimentosOrdenados.length > 0 ? (
                      empreendimentosOrdenados.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.nome} - {emp.cliente}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-empreendimentos" disabled>
                        Nenhum empreendimento disponível
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Executores *</Label>
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                  {usuariosOrdenados.map(usuario => (
                    <div key={usuario.id} className="flex items-center space-x-2">
                      <input type="checkbox" id={`executor-${usuario.id}`} checked={formData.executores.includes(usuario.email)} onChange={(e) => handleExecutorChange(usuario.email, e.target.checked)} className="rounded" />
                      <Label htmlFor={`executor-${usuario.id}`} className="flex-1 cursor-pointer">{usuario.nome || usuario.email}</Label>
                      {formData.executor_principal === usuario.email && (<Badge className="bg-blue-100 text-blue-800 text-xs">Principal</Badge>)}
                    </div>
                  ))}
                </div>
              </div>
              
              {formData.executores.length > 1 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Executor Principal *</Label>
                  <Select value={formData.executor_principal} onValueChange={(value) => setFormData(prev => ({ ...prev, executor_principal: value }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione o executor principal" /></SelectTrigger>
                    <SelectContent>
                      {formData.executores.map(email => { 
                        const usuario = usuariosOrdenados.find(u => u.email === email); 
                        return (<SelectItem key={email} value={email}>{usuario?.nome || email}</SelectItem>); 
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2"><Label className="flex items-center gap-2"><Clock className="w-4 h-4" />Tempo Planejado (horas) *</Label><Input ref={tempoPlanejadoRef} type="number" step="0.1" defaultValue={formData.tempo_planejado} onChange={(e) => { const filled = e.target.value.length > 0; if (filled !== hasTempo) setHasTempo(filled); }} onBlur={(e) => setFormData(prev => ({ ...prev, tempo_planejado: e.target.value }))} placeholder="Ex: 8.5"/></div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Horário Início (opcional)
                  </Label>
                  <Input
                    type="time"
                    value={formData.horario_inicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, horario_inicio: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Horário Término (opcional)
                  </Label>
                  <Input
                    type="time"
                    value={formData.horario_termino}
                    onChange={(e) => setFormData(prev => ({ ...prev, horario_termino: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2"><Label className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" />Data de Início (opcional)</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start"><CalendarIcon className="mr-2 h-4 w-4" />{selectedDate ? format(selectedDate, 'PPP', { locale: ptBR }) : 'Selecionar data'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} locale={ptBR} /></PopoverContent></Popover><p className="text-xs text-gray-500">Se não especificada, será usada a próxima data útil disponível.</p></div>
              <div className="space-y-2"><div className="flex items-center space-x-2"><input type="checkbox" id="recorrencia-toggle" checked={isRecorrente} onChange={(e) => setIsRecorrente(e.target.checked)} className="rounded" /><Label htmlFor="recorrencia-toggle" className="flex items-center gap-2 cursor-pointer"><Repeat className="w-4 h-4" />Criar Atividade Recorrente</Label></div></div>
              {isRecorrente && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="p-4 border rounded-lg bg-gray-50/50 space-y-4"><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="tipo-recorrencia">Frequência</Label><Select value={recorrencia.tipo} onValueChange={(value) => setRecorrencia(prev => ({...prev, tipo: value}))}><SelectTrigger id="tipo-recorrencia"><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent><SelectItem value="mesmo_dia">Repetir no mesmo dia</SelectItem><Separator className="my-1" /><SelectItem value="diaria">Diária</SelectItem><SelectItem value="semanal">Semanal</SelectItem><SelectItem value="quinzenal">Quinzenal</SelectItem><SelectItem value="mensal">Mensal</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label htmlFor="repeticoes-recorrencia">Repetições</Label><Input id="repeticoes-recorrencia" type="number" min="1" value={recorrencia.repeticoes} onChange={(e) => setRecorrencia(prev => ({...prev, repeticoes: parseInt(e.target.value, 10) || 1 }))} placeholder="Nº de vezes"/></div></div></motion.div>)}
            </div>
          </TabsContent>

          {/* Aba de Planejamento por Função */}
          <TabsContent value="funcao">
            {mountedModes.has('funcao') && <Card className="border-none shadow-none">
              <CardContent className="space-y-6 pt-6">
                 {isLoadingFuncaoData ? (
                   <div className="flex items-center justify-center h-40">
                     <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                     <p className="ml-3 text-gray-600">Carregando dados...</p>
                   </div>
                 ) : (
                  <>
                    <div className="space-y-2">
                        <Label htmlFor="funcao" className="flex items-center gap-2"><BrainCircuit className="w-4 h-4" />Modelo de Departamento</Label>
                        <Select value={funcaoSelecionada} onValueChange={setFuncaoSelecionada}>
                            <SelectTrigger id="funcao"><SelectValue placeholder="Selecione um modelo de atividades" /></SelectTrigger>
                            <SelectContent>
                                {funcoesComModelo.map(funcao => (
                                    <SelectItem key={funcao} value={funcao}>{funcao}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="usuario-funcao" className="flex items-center gap-2"><Users className="w-4 h-4" />Aplicar para o Usuário</Label>
                      <Select value={usuarioSelecionado} onValueChange={setUsuarioSelecionado} disabled={!funcaoSelecionada}>
                          <SelectTrigger id="usuario-funcao"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                          <SelectContent>
                              {usuariosOrdenados.map(user => (
                                  <SelectItem key={user.id} value={user.email}>{user.nome || user.email} ({user.cargo})</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" />Período de Planejamento</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={"w-full justify-start text-left font-normal"}
                                    disabled={!usuarioSelecionado}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {periodo?.from ? (
                                        periodo.to ? (
                                            <>
                                                {format(periodo.from, "LLL dd, y", { locale: ptBR })} -{" "}
                                                {format(periodo.to, "LLL dd, y", { locale: ptBR })}
                                            </>
                                        ) : (
                                            format(periodo.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Selecione um período</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={periodo?.from}
                                    selected={periodo}
                                    onSelect={setPeriodo}
                                    numberOfMonths={2}
                                    locale={ptBR}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {generationStatus.message && (
                      <div className={`p-3 rounded-lg text-sm ${generationStatus.error ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                        <p>{generationStatus.message}</p>
                      </div>
                    )}
                  </>
                 )}
              </CardContent>
            </Card>}
          </TabsContent>

          {/* Aba de Planejamento por Documento */}
          <TabsContent value="documento">
            {mountedModes.has('documento') && <Card className="border-none shadow-none">
              <CardContent className="space-y-6 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="documento-empreendimento" className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Empreendimento *
                  </Label>
                  <Select value={documentoEmpreendimentoId} onValueChange={setDocumentoEmpreendimentoId}>
                    <SelectTrigger id="documento-empreendimento">
                      <SelectValue placeholder="Selecione um empreendimento" />
                    </SelectTrigger>
                    <SelectContent>
                      {empreendimentosOrdenados && empreendimentosOrdenados.length > 0 ? (
                        empreendimentosOrdenados.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.nome} - {emp.cliente}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-empreendimentos" disabled>
                          Nenhum empreendimento disponível
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {empreendimentosOrdenados && empreendimentosOrdenados.length === 0 && (
                    <p className="text-xs text-amber-600">
                      ℹ️ Você precisa ter planejamentos atribuídos em algum empreendimento para usar esta funcionalidade.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="documento" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Documento/Folha *
                  </Label>
                  {isLoadingDocumentos ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                      <span className="ml-2 text-sm text-gray-600">Carregando documentos...</span>
                    </div>
                  ) : (
                    <Select
                      value={documentoSelecionado}
                      onValueChange={setDocumentoSelecionado}
                      disabled={!documentoEmpreendimentoId}
                    >
                      <SelectTrigger id="documento">
                        <SelectValue placeholder={documentoEmpreendimentoId ? "Selecione um documento" : "Selecione um empreendimento primeiro"} />
                      </SelectTrigger>
                      <SelectContent>
                        {documentos.length > 0 ? (
                          documentos.map(doc => (
                            <SelectItem key={doc.id} value={doc.id}>
                              <div className="flex flex-col items-start text-left">
                                <span className="font-medium">{doc.numero || 'Sem número'} - {doc.arquivo}</span>
                                <span className="text-xs text-gray-500">{doc.disciplina}</span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-docs" disabled>Nenhum documento encontrado</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {documentoSelecionadoObj && documentoSelecionadoObj.subdisciplinas && documentoSelecionadoObj.subdisciplinas.length > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-900 mb-2">Subdisciplinas do Documento:</p>
                    <div className="flex flex-wrap gap-1">
                      {documentoSelecionadoObj.subdisciplinas.map((sub, idx) => (
                        <Badge key={idx} variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                          {sub}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* **MODIFICADO**: Seletor de Etapa agora mostra apenas etapas disponíveis */}
                {documentoSelecionado && (
                  <div className="space-y-2">
                    <Label htmlFor="etapa-documento" className="flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Etapa *
                    </Label>
                    {etapasDisponiveis.length > 0 ? (
                      <>
                        <Select value={etapaDocumento} onValueChange={setEtapaDocumento}>
                          <SelectTrigger id="etapa-documento">
                            <SelectValue placeholder="Selecione a etapa a ser planejada" />
                          </SelectTrigger>
                          <SelectContent>
                            {etapasDisponiveis.map(etapa => (
                              <SelectItem key={etapa.nome} value={etapa.nome}>
                                {etapa.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                          Apenas etapas com tempo de atividade cadastrado são exibidas para este documento
                        </p>
                      </>
                    ) : (
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Nenhuma etapa disponível</p>
                            <p className="text-xs text-yellow-700 mt-1">
                              Este documento não possui tempo de atividade cadastrado para nenhuma etapa.
                              Por favor, verifique o cadastro do documento.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Executores *</Label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                    {usuariosOrdenados.map(usuario => (
                      <div key={usuario.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`doc-executor-${usuario.id}`}
                          checked={documentoFormData.executores.includes(usuario.email)}
                          onChange={(e) => handleDocumentoExecutorChange(usuario.email, e.target.checked)}
                          className="rounded"
                        />
                        <Label htmlFor={`doc-executor-${usuario.id}`} className="flex-1 cursor-pointer">
                          {usuario.nome || usuario.email}
                        </Label>
                        {documentoFormData.executor_principal === usuario.email && (
                          <Badge className="bg-blue-100 text-blue-800 text-xs">Principal</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {documentoFormData.executores.length > 1 && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Users className="w-4 h-4" />Executor Principal *</Label>
                    <Select value={documentoFormData.executor_principal} onValueChange={(value) => setDocumentoFormData(prev => ({ ...prev, executor_principal: value }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione o executor principal" /></SelectTrigger>
                      <SelectContent>
                        {documentoFormData.executores.map(email => {
                          const usuario = usuariosOrdenados.find(u => u.email === email);
                          return (<SelectItem key={email} value={email}>{usuario?.nome || email}</SelectItem>);
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Tempo Planejado (horas) *
                    {etapaDocumento && documentoFormData.tempo_planejado && (
                      <span className="text-xs text-purple-600 font-normal ml-2">
                        (tempo da etapa: {etapaDocumento})
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={documentoFormData.tempo_planejado}
                    onChange={(e) => setDocumentoFormData(prev => ({ ...prev, tempo_planejado: e.target.value }))}
                    placeholder={etapaDocumento ? "Tempo planejado para esta etapa" : "Selecione uma etapa para ver o tempo"}
                    className={etapaDocumento && documentoFormData.tempo_planejado ? "border-purple-300 bg-purple-50" : ""}
                    disabled={!etapaDocumento}
                  />
                  {!etapaDocumento && documentoSelecionado && etapasDisponiveis.length > 0 && (
                    <p className="text-xs text-amber-600 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Selecione uma etapa para ver o tempo calculado
                    </p>
                  )}
                  {etapaDocumento && (!documentoFormData.tempo_planejado || Number(documentoFormData.tempo_planejado) === 0) && (
                    <p className="text-xs text-red-600">
                      ⚠️ Nenhum tempo cadastrado para a etapa "{etapaDocumento}" neste documento. Por favor, insira manualmente.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Horário Início (opcional)
                    </Label>
                    <Input
                      type="time"
                      value={documentoFormData.horario_inicio}
                      onChange={(e) => setDocumentoFormData(prev => ({ ...prev, horario_inicio: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Horário Término (opcional)
                    </Label>
                    <Input
                      type="time"
                      value={documentoFormData.horario_termino}
                      onChange={(e) => setDocumentoFormData(prev => ({ ...prev, horario_termino: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" />Data de Início (opcional)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDocumentoDate ? format(selectedDocumentoDate, 'PPP', { locale: ptBR }) : 'Selecionar data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={selectedDocumentoDate} onSelect={setSelectedDocumentoDate} locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-gray-500">Se não especificada, será usada a próxima data útil disponível.</p>
                </div>
              </CardContent>
            </Card>}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting ||
              (planningMode === 'individual' && (!hasDescritivo || !formData.executor_principal || !hasTempo)) ||
              (planningMode === 'funcao' && (!funcaoSelecionada || !usuarioSelecionado || !periodo?.from)) ||
              (planningMode === 'documento' && (!documentoEmpreendimentoId || !documentoSelecionado || !etapaDocumento || !documentoFormData.executor_principal || !documentoFormData.tempo_planejado || Number(documentoFormData.tempo_planejado) < 0 || isNaN(Number(documentoFormData.tempo_planejado)) || etapasDisponiveis.length === 0))
            }
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
            ) : planningMode === 'individual' ? "Criar Planejamento" :
               planningMode === 'funcao' ? "Gerar Planejamento por Função" :
               "Criar Planejamento de Documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}