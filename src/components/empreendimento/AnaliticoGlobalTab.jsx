// @ts-nocheck
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Atividade, Disciplina, PlanejamentoAtividade, Documento, AlteracaoEtapa, Empreendimento, Usuario, AtividadesDoProjeto, ItemPRE } from '@/entities/all';
import AnaliticoRenderContent from './AnaliticoRenderContent';
import AnaliticoFolhaRow from './AnaliticoFolhaRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { EtapaEditModal, EditarEtapaEmFolhasModal, ExcluirDeFolhasModal } from './AnaliticoModais';
import { PlusCircle, Search, Filter, MoreHorizontal, Edit, Trash2, Loader2, PackageOpen, Layers, XCircle, FileX, RefreshCw, Edit2, ChevronRight, ChevronDown, Calendar, CheckCircle2, Users2, CheckCircle } from 'lucide-react';
import PlanejamentoAtividadeModal from './PlanejamentoAtividadeModal';
import AtividadeFormModal from './AtividadeFormModal';
import { debounce } from 'lodash';
import { Badge } from '@/components/ui/badge';
import { retryWithBackoff, retryWithExtendedBackoff } from '../utils/apiUtils';
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from '@/api/base44Client';
const PlanejamentoDocumento = base44.entities.PlanejamentoDocumento;
import PDFListaDesenvolvimento from '../configuracoes/PDFListaDesenvolvimento';
import { getNextWorkingDay, distribuirHorasPorDias, isWorkingDay, calculateEndDate, ensureWorkingDay } from '../utils/DateCalculator';
import { format, isValid, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export default function AnaliticoGlobalTab({ empreendimentoId, onUpdate, activeTab }) {
  const [combinedActivities, setCombinedActivities] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', disciplina: 'all', etapa: 'all' });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAtividade, setSelectedAtividade] = useState(null);
  const [isEtapaModalOpen, setIsEtapaModalOpen] = useState(false);
  const [isExcluirDeFolhasModalOpen, setIsExcluirDeFolhasModalOpen] = useState(false);
  const [isEditarEtapaEmFolhasModalOpen, setIsEditarEtapaEmFolhasModalOpen] = useState(false);
  const [isPlanejamentoModalOpen, setIsPlanejamentoModalOpen] = useState(false);
  const [atividadeParaPlanejar, setAtividadeParaPlanejar] = useState(null);
  
  const [isDeletingActivity, setIsDeletingActivity] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);
  const [isRestoringGlobal, setIsRestoringGlobal] = useState(false);
  const [expandedAtividades, setExpandedAtividades] = useState({});
  
  // Estados para rastreamento de alterações
  const [alteracoesEtapa, setAlteracoesEtapa] = useState([]);
  const [empreendimentoNome, setEmpreendimentoNome] = useState("");
  const [isSavingExecutor, setIsSavingExecutor] = useState({});
  const [isConcluindo, setIsConcluindo] = useState({});
  const [datasInicio, setDatasInicio] = useState({});
  const [atividadesSelecionadasParaPlanejar, setAtividadesSelecionadasParaPlanejar] = useState(new Set());
  const [isConcluindoEtapa, setIsConcluindoEtapa] = useState(false);
  const [etapaParaConcluir, setEtapaParaConcluir] = useState('');
  const [isRevertendoEtapa, setIsRevertendoEtapa] = useState(false);
  const [etapaParaReverter, setEtapaParaReverter] = useState('');
  const [isMudandoEtapaGlobal, setIsMudandoEtapaGlobal] = useState(false);
  const [etapaMudancaGlobal, setEtapaMudancaGlobal] = useState('');
  const [editandoTempo, setEditandoTempo] = useState({});
  const [novosTempoPadrao, setNovosTempoPadrao] = useState({});
  const [atividadesSelecionadasParaExcluir, setAtividadesSelecionadasParaExcluir] = useState(new Set());
  const [isExcluindoMultiplasFolhas, setIsExcluindoMultiplasFolhas] = useState(false);
  const [datasInicioFolha, setDatasInicioFolha] = useState({});
  const [isSavingFolhaExecutor, setIsSavingFolhaExecutor] = useState({});

  const documentosMap = useMemo(() => {
    return new Map((documentos || []).map(doc => [doc.id, doc]));
  }, [documentos]);

  const [planejamentos, setPlanejamentos] = useState([]); const [empreendimentoObj, setEmpreendimentoObj] = useState(null);
  const [itensPRE, setItensPRE] = useState([]);

  const [allEmpreendimentos, setAllEmpreendimentos] = useState([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        projectActivities, 
        planejamentosData,
        allActivities,
        documentosData,
        disciplinasData,
        empreendimentoData,
        alteracoesData,
        usuariosData,
        todosEmpreendimentos,
        atividadesDoProjetoData,
        atividadesEmpreendimentoData,
        pavimentosData,
        itensPREData
      ] = await Promise.all([
        retryWithBackoff(() => Atividade.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchProjectActivities'),
        retryWithBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchPlanejamentos'),
        retryWithBackoff(() => Atividade.list(), 3, 500, 'fetchAllActivities'),
        retryWithBackoff(() => Documento.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchDocumentos'),
        retryWithBackoff(() => Disciplina.list(), 3, 500, 'fetchDisciplinas'),
        retryWithBackoff(() => Empreendimento.filter({ id: empreendimentoId }), 3, 500, 'fetchEmpreendimento'),
        retryWithBackoff(() => AlteracaoEtapa.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchAlteracoes'),
        retryWithBackoff(() => Usuario.list(), 3, 500, 'fetchUsuarios'),
        retryWithBackoff(() => Empreendimento.list(), 3, 500, 'fetchAllEmpreendimentos'),
        retryWithBackoff(() => AtividadesDoProjeto.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchAtividadesDoProjeto'),
        retryWithBackoff(() => base44.entities.AtividadesEmpreendimento.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchAtividadesEmpreendimento'),
        retryWithBackoff(() => base44.entities.Pavimento.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchPavimentos'),
        retryWithBackoff(() => ItemPRE.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchItensPRE')
      ]);

      setDocumentos(documentosData || []);
      setEmpreendimentoNome((empreendimentoData && empreendimentoData[0]?.nome) || ""); setEmpreendimentoObj(empreendimentoData?.[0] || null);
      setAlteracoesEtapa(alteracoesData || []);
      setUsuarios(usuariosData || []);
      setPlanejamentos(planejamentosData || []);
      setAllEmpreendimentos(todosEmpreendimentos || []);
      setItensPRE(itensPREData || []);
      
      // Usar AtividadesDoProjeto se disponível, senão usar projectActivities
       const activitiesToProcess = (atividadesDoProjetoData && atividadesDoProjetoData.length > 0) 
         ? atividadesDoProjetoData 
         : projectActivities;

       // MODIFICADO: Sempre buscar overrides de projectActivities (Atividade) independentemente da fonte
       const overrideActivitiesGlobalMap = new Map(); // Overrides sem documento_id específico
       const overrideActivitiesByDocMap = new Map(); // Overrides com documento_id específico (chave: "docId|atividadeId")
       const excludedActivitiesSet = new Set();
       const excludedFromDocumentMap = new Map();

       // Processar overrides sempre da entidade Atividade (projectActivities)
       (projectActivities || []).forEach(pa => {
           if (pa.id_atividade) {
               if (pa.tempo === -999) {
                   if (pa.documento_id) {
                     if (!excludedFromDocumentMap.has(pa.id_atividade)) {
                       excludedFromDocumentMap.set(pa.id_atividade, new Set());
                     }
                     excludedFromDocumentMap.get(pa.id_atividade).add(pa.documento_id);
                   } else {
                     excludedActivitiesSet.add(pa.id_atividade);
                   }
               } else {
                   if (pa.documento_id) {
                     const key = `${pa.documento_id}|${pa.id_atividade}`;
                     overrideActivitiesByDocMap.set(key, pa);
                   } else {
                     overrideActivitiesGlobalMap.set(pa.id_atividade, pa);
                   }
               }
           }
       });
      
      const allGenericActivitiesMap = new Map((allActivities || [])
        .filter(a => !a.empreendimento_id)
        .map(a => [a.id, a])
      );
      
      const planejamentosMap = new Map((planejamentosData || []).map(p => [`${(p.documento_id === undefined || p.documento_id === null || p.documento_id === 'null') ? 'null' : p.documento_id}-${p.atividade_id}`, p]));

      // Buscar etapas cadastradas no empreendimento
      const empreendimento = (empreendimentoData && empreendimentoData[0]) || null;
      const etapasCadastradas = empreendimento?.etapas || [];
      
      const normalizedProjectActivities = (activitiesToProcess || [])
        .filter(pa => !pa.id_atividade && pa.tempo !== -999)
        .map(ativ => ({
          ...ativ,
          uniqueId: `proj-${ativ.id}`,
          source: 'Projeto',
          status: 'N/A',
          isEditable: true,
          base_atividade_id: ativ.id,
      }));

      // Adicionar atividades de Documentação (sempre visíveis)
      const disciplinasDocumentacao = ['Planejamento', 'Gestão', 'BIM', 'Apoio', 'Coordenação'];
      const atividadesDocumentacao = [];
      
      allGenericActivitiesMap.forEach(baseAtividade => {
        if (disciplinasDocumentacao.includes(baseAtividade.disciplina)) {
          const isExcludedFromProject = excludedActivitiesSet.has(baseAtividade.id);
          if (!isExcludedFromProject) {
            const override = overrideActivitiesGlobalMap.get(baseAtividade.id);
            const etapaCorreta = override ? override.etapa : baseAtividade.etapa;
            
            // Verificar se existe planejamento geral (sem documento_id) para esta atividade
            const planKey = `null-${baseAtividade.id}`;
            const existingPlan = planejamentosMap.get(planKey);
            
            if (existingPlan) {
              // Se há planejamento geral, mostrar como "Planejada" ou "Concluída"
              atividadesDocumentacao.push({
                ...baseAtividade,
                id: existingPlan.id,
                uniqueId: `plano-${existingPlan.id}`,
                atividade: existingPlan.descritivo || baseAtividade.atividade,
                tempo: existingPlan.tempo_planejado,
                source: 'Catálogo',
                source_documento_id: null,
                status: existingPlan.status === 'concluido' ? 'Concluída' : 'Planejada',
                isEditable: false,
                etapa: existingPlan.etapa || etapaCorreta,
                executor_principal: existingPlan.executor_principal,
                base_atividade_id: baseAtividade.id,
              });
            } else {
              // Se não há planejamento, mostrar como "Disponível"
               const executorPrincipal = override ? override.executor_principal : baseAtividade.executor_principal;

               // Aplicar override de tempo se existir
               const tempoFinal = override?.tempo !== undefined && override?.tempo !== null 
                 ? override.tempo 
                 : (baseAtividade.tempo || 0);

               atividadesDocumentacao.push({
                 ...baseAtividade,
                 uniqueId: `doc-${baseAtividade.id}`,
                 id: baseAtividade.id,
                 tempo: tempoFinal,
                 source: 'Catálogo',
                 source_documento_id: null,
                 status: 'Disponível',
                 isEditable: false,
                 etapa: etapaCorreta,
                 executor_principal: executorPrincipal,
                 base_atividade_id: baseAtividade.id,
               });
            }
          }
        }
      });

      let documentActivities = [];
      (documentosData || []).forEach(doc => {
        const subdisciplinasDoc = doc.subdisciplinas || [];
        const disciplinasDoc = doc.disciplinas?.length > 0 ? doc.disciplinas : [doc.disciplina].filter(Boolean);
        const fatorDificuldade = doc.fator_dificuldade || 1;

        // Adicionar atividades específicas vinculadas a este documento (incluindo documento_ids)
        const atividadesVinculadasDoc = (projectActivities || []).filter(pa => {
          const temDocumentoIdSingular = pa.documento_id === doc.id;
          const temDocumentoIdArray = pa.documento_ids && Array.isArray(pa.documento_ids) && pa.documento_ids.includes(doc.id);
          return !pa.id_atividade && pa.tempo !== -999 && (temDocumentoIdSingular || temDocumentoIdArray);
        });
        
        atividadesVinculadasDoc.forEach(atividadeVinculada => {
          const planKey = `${doc.id}-${atividadeVinculada.id}`;
          const existingPlan = planejamentosMap.get(planKey);
          const sourceDisplay = `Folha: ${doc.numero} - ${doc.arquivo || 'Sem Nome'}`;
          
          if (existingPlan) {
            documentActivities.push({
              ...atividadeVinculada,
              id: existingPlan.id,
              uniqueId: `plano-${existingPlan.id}`,
              atividade: existingPlan.descritivo || atividadeVinculada.atividade,
              tempo: existingPlan.tempo_planejado,
              source: sourceDisplay,
              source_documento_id: doc.id,
              source_documento_numero: doc.numero,
              source_documento_arquivo: doc.arquivo,
              status: existingPlan.status === 'concluido' ? 'Concluída' : 'Planejada',
              isEditable: false,
              etapa: existingPlan.etapa || atividadeVinculada.etapa,
              executor_principal: existingPlan.executor_principal,
              base_atividade_id: atividadeVinculada.id,
            });
          } else {
            documentActivities.push({
              ...atividadeVinculada,
              uniqueId: `avail-${doc.id}-${atividadeVinculada.id}`,
              id: atividadeVinculada.id,
              tempo: atividadeVinculada.tempo || 0,
              source: sourceDisplay,
              source_documento_id: doc.id,
              source_documento_numero: doc.numero,
              source_documento_arquivo: doc.arquivo,
              status: 'Disponível',
              isEditable: false,
              etapa: atividadeVinculada.etapa,
              base_atividade_id: atividadeVinculada.id,
            });
          }
        });
        
        allGenericActivitiesMap.forEach(baseAtividade => {
          const isExcludedFromProject = excludedActivitiesSet.has(baseAtividade.id);
          const isExcludedFromThisDoc = excludedFromDocumentMap.has(baseAtividade.id) && excludedFromDocumentMap.get(baseAtividade.id).has(doc.id);
          if (isExcludedFromProject || isExcludedFromThisDoc) return;

          const disciplinaMatch = disciplinasDoc.includes(baseAtividade.disciplina);
          const subdisciplinaMatch = subdisciplinasDoc.includes(baseAtividade.subdisciplina);

          if (disciplinaMatch && subdisciplinaMatch) {
            const planKey = `${doc.id}-${baseAtividade.id}`;
            const existingPlan = planejamentosMap.get(planKey);
            const overrideKey = `${doc.id}|${baseAtividade.id}`;
            const override = overrideActivitiesByDocMap.get(overrideKey) || overrideActivitiesGlobalMap.get(baseAtividade.id);
            const etapaCorreta = override ? override.etapa : baseAtividade.etapa;
            const executorPrincipal = override ? override.executor_principal : baseAtividade.executor_principal;

            const sourceDisplay = `Folha: ${doc.numero} - ${doc.arquivo || 'Sem Nome'}`;

            if (existingPlan) {
                documentActivities.push({
                  ...baseAtividade,
                  id: existingPlan.id,
                  uniqueId: `plano-${existingPlan.id}`,
                  atividade: existingPlan.descritivo || baseAtividade.atividade,
                  tempo: existingPlan.tempo_planejado,
                  source: sourceDisplay,
                  source_documento_id: doc.id,
                  source_documento_numero: doc.numero,
                  source_documento_arquivo: doc.arquivo,
                  status: existingPlan.status === 'concluido' ? 'Concluída' : 'Planejada',
                  isEditable: false,
                  etapa: existingPlan.etapa || etapaCorreta,
                  executor_principal: existingPlan.executor_principal || executorPrincipal,
                  base_atividade_id: baseAtividade.id,
                });
              } else {
                // Aplicar override de tempo se existir
                const tempoComOverride = override?.tempo !== undefined && override?.tempo !== null
                  ? override.tempo
                  : (baseAtividade.tempo || 0);
                const tempoFinal = tempoComOverride * fatorDificuldade;

                documentActivities.push({
                    ...baseAtividade,
                    uniqueId: `avail-${doc.id}-${baseAtividade.id}`,
                    id: baseAtividade.id,
                    tempo: tempoFinal,
                    source: sourceDisplay,
                    source_documento_id: doc.id,
                    source_documento_numero: doc.numero,
                    source_documento_arquivo: doc.arquivo,
                    status: 'Disponível',
                    isEditable: false,
                    etapa: etapaCorreta,
                    executor_principal: executorPrincipal,
                    base_atividade_id: baseAtividade.id,
                  });
              }
          }
        });
      });

      setCombinedActivities([...normalizedProjectActivities, ...documentActivities, ...atividadesDocumentacao]);
      setDisciplinas(disciplinasData || []);

    } catch (error) {
      console.error("Erro ao buscar dados do catálogo:", error);
      setCombinedActivities([]);
      setDisciplinas([]);
      setDocumentos([]);
    } finally {
      setIsLoading(false);
    }
  }, [empreendimentoId]);

  useEffect(() => {
    if (empreendimentoId) {
      fetchData();
    }
  }, [fetchData, empreendimentoId]);

  const _isFirstActiveTab = useRef(true);
  useEffect(() => {
    if (_isFirstActiveTab.current) { _isFirstActiveTab.current = false; return; }
    if (activeTab !== 'atividades_projeto' || !empreendimentoId) return;
    retryWithBackoff(
      () => ItemPRE.filter({ empreendimento_id: empreendimentoId }),
      3, 500, 'refreshItensPRE'
    ).then(data => setItensPRE(data || [])).catch(() => {});
  }, [activeTab, empreendimentoId]);

  const debouncedSetSearch = useCallback(debounce((value) => {
    setFilters(prev => ({ ...prev, search: value }));
  }, 300), []);

  const atividadesAgrupadas = useMemo(() => {
    const filtered = combinedActivities.filter(ativ => {
      const searchLower = filters.search.toLowerCase();
      const searchMatch = !filters.search ||
        String(ativ.atividade || '').toLowerCase().includes(searchLower) ||
        String(ativ.disciplina || '').toLowerCase().includes(searchLower) ||
        String(ativ.subdisciplina || '').toLowerCase().includes(searchLower) ||
        String(ativ.etapa || '').toLowerCase().includes(searchLower) ||
        String(ativ.source || '').toLowerCase().includes(searchLower) ||
        String(ativ.status || '').toLowerCase().includes(searchLower);
      
      const disciplinaMatch = filters.disciplina === 'all' || ativ.disciplina === filters.disciplina;
      const etapaMatch = filters.etapa === 'all' || ativ.etapa === 'all' || ativ.etapa === filters.etapa;

      return searchMatch && disciplinaMatch && etapaMatch;
    });

    // Agrupar por atividade base
    const grupos = new Map();
    
    filtered.forEach(ativ => {
      const key = `${ativ.base_atividade_id}-${ativ.etapa}-${ativ.disciplina}-${ativ.subdisciplina}`;
      
      if (!grupos.has(key)) {
        grupos.set(key, {
          baseAtividade: ativ,
          folhas: []
        });
      }
      
      if (ativ.source_documento_id) {
        grupos.get(key).folhas.push(ativ);
      }
    });

    return Array.from(grupos.values());
  }, [combinedActivities, filters]);

  const atividadesPorDisciplina = useMemo(() => {
    const disciplinasDocumentacao = ['Planejamento', 'Gestão', 'BIM', 'Apoio', 'Coordenação'];
    const grupos = {};
    const gruposDocumentacao = {};
    
    // Inicializar todas as disciplinas de Documentação com objetos de subdisciplinas
    disciplinasDocumentacao.forEach(disc => {
      gruposDocumentacao[disc] = {};
    });
    
    atividadesAgrupadas.forEach(grupo => {
      const disciplina = grupo.baseAtividade.disciplina || 'Sem Disciplina';
      
      if (disciplinasDocumentacao.includes(disciplina)) {
        // Agrupar Documentação por subdisciplina dentro da disciplina
        const subdisciplina = grupo.baseAtividade.subdisciplina || 'Sem Subdisciplina';
        if (!gruposDocumentacao[disciplina][subdisciplina]) {
          gruposDocumentacao[disciplina][subdisciplina] = [];
        }
        gruposDocumentacao[disciplina][subdisciplina].push(grupo);
      } else {
        if (!grupos[disciplina]) {
          grupos[disciplina] = [];
        }
        grupos[disciplina].push(grupo);
      }
    });

    const result = Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
    
    // Adicionar apenas disciplinas de Documentação que têm atividades
    Object.entries(gruposDocumentacao)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([disciplina, subdisciplinas]) => {
        const temAtividades = Object.values(subdisciplinas).flat().length > 0;
        if (temAtividades) {
          result.push([disciplina, subdisciplinas]);
        }
      });
    
    return result;
  }, [atividadesAgrupadas]);
  
  const etapasUnicas = useMemo(() => {
    // Buscar etapas do empreendimento cadastrado
    const empreendimento = allEmpreendimentos?.find(e => e.id === empreendimentoId);
    if (empreendimento?.etapas && empreendimento.etapas.length > 0) {
      return empreendimento.etapas;
    }
    // Fallback: etapas únicas das atividades
    return [...new Set(combinedActivities.map(a => a.etapa).filter(Boolean))];
  }, [combinedActivities, empreendimentoId]);

  const handleOpenModal = (atividade = null) => {
    setSelectedAtividade(atividade);
    setIsModalOpen(true);
  };
  
  const handleOpenEtapaModal = (atividade) => {
    setSelectedAtividade(atividade);
    setIsEtapaModalOpen(true);
  };

  const handleOpenEditarEtapaEmFolhasModal = (atividade) => {
    setSelectedAtividade(atividade);
    setIsEditarEtapaEmFolhasModalOpen(true);
  };

  const handleSaveEtapa = async (newEtapa, escopo = 'empreendimento', selectedFolhaId = '') => {
    if (!selectedAtividade || !selectedAtividade.base_atividade_id) {
      alert("Não foi possível identificar a atividade base para atualização.");
      return;
    }
  
    try {
      // Se escopo é 'folha' e uma folha foi selecionada, fazer a alteração direto
      if (escopo === 'folha' && selectedFolhaId) {
        const allPlanejamentos = await retryWithBackoff(() => PlanejamentoAtividade.filter({ 
          empreendimento_id: empreendimentoId,
          atividade_id: selectedAtividade.base_atividade_id,
          documento_id: selectedFolhaId
        }), 3, 500, 'findPlanosForEtapaUpdateSpecificDoc');
    
        // Registrar alteração
        const user = await base44.auth.me();
        const etapaAnterior = selectedAtividade.etapa;
        const folhaObj = documentos.find(d => d.id === selectedFolhaId);
        
        await AlteracaoEtapa.create({
          atividade_id: selectedAtividade.base_atividade_id,
          id_atividade: selectedAtividade.id_atividade || "",
          nome_atividade: selectedAtividade.atividade,
          disciplina: selectedAtividade.disciplina,
          subdisciplina: selectedAtividade.subdisciplina || "",
          etapa_anterior: etapaAnterior,
          etapa_nova: newEtapa,
          empreendimento_id: empreendimentoId,
          empreendimento_nome: empreendimentoNome,
          data_alteracao: new Date().toISOString(),
          usuario_email: user.email,
          usuario_nome: user.full_name || user.nome || user.email,
          folha_numero: folhaObj?.numero || "",
          folha_arquivo: folhaObj?.arquivo || ""
        });

        if (allPlanejamentos.length > 0) {
          const updatePromises = allPlanejamentos.map(plano => 
            retryWithBackoff(() => PlanejamentoAtividade.update(plano.id, { etapa: newEtapa }), 3, 500, `updateEtapa-${plano.id}`)
          );
          await Promise.all(updatePromises);
        } else {
          // Criar override específico da folha
          const baseAtividadeArr = await retryWithBackoff(() => Atividade.filter({ id: selectedAtividade.base_atividade_id }), 3, 500, 'findBaseAtividade');
          
          if (!baseAtividadeArr || baseAtividadeArr.length === 0) {
            throw new Error("Atividade base original não encontrada.");
          }
          
          const atividadeOriginal = baseAtividadeArr[0];
          
          const existingOverride = await retryWithBackoff(() => Atividade.filter({
            empreendimento_id: empreendimentoId,
            id_atividade: selectedAtividade.base_atividade_id,
            documento_id: selectedFolhaId,
            tempo: { operator: '!=', value: -999 } 
          }), 3, 500, 'findExistingOverrideForDoc');

          const foundOverride = existingOverride.find(o => o.id_atividade === selectedAtividade.base_atividade_id);

          if (foundOverride) {
            await retryWithBackoff(() => Atividade.update(foundOverride.id, { etapa: newEtapa }), 3, 500, 'updateAtividadeOverrideDoc');
          } else {
            const overrideAtividade = {
              ...atividadeOriginal,
              id_atividade: selectedAtividade.base_atividade_id,
              etapa: newEtapa,
              empreendimento_id: empreendimentoId,
              documento_id: selectedFolhaId,
            };
            delete overrideAtividade.id;
            await retryWithBackoff(() => Atividade.create(overrideAtividade), 3, 500, 'createAtividadeOverrideDoc');
          }
        }

        alert(`A etapa de "${selectedAtividade.atividade}" foi alterada para "${newEtapa}" na folha ${folhaObj?.numero} - ${folhaObj?.arquivo}.`);
        const alteracoes = await AlteracaoEtapa.filter({ empreendimento_id: empreendimentoId });
        setAlteracoesEtapa(alteracoes || []);
        fetchData();
        setIsEtapaModalOpen(false);
        return;
      }

      const allPlanejamentos = await retryWithBackoff(() => PlanejamentoAtividade.filter({ 
        empreendimento_id: empreendimentoId,
        atividade_id: selectedAtividade.base_atividade_id
      }), 3, 500, 'findPlanosForEtapaUpdate');
  
      // Registrar alteração antes de aplicar
      const user = await base44.auth.me();
      const etapaAnterior = selectedAtividade.etapa;
      
      await AlteracaoEtapa.create({
        atividade_id: selectedAtividade.base_atividade_id,
        id_atividade: selectedAtividade.id_atividade || "",
        nome_atividade: selectedAtividade.atividade,
        disciplina: selectedAtividade.disciplina,
        subdisciplina: selectedAtividade.subdisciplina || "",
        etapa_anterior: etapaAnterior,
        etapa_nova: newEtapa,
        empreendimento_id: empreendimentoId,
        empreendimento_nome: empreendimentoNome,
        data_alteracao: new Date().toISOString(),
        usuario_email: user.email,
        usuario_nome: user.full_name || user.nome || user.email
      });
  
      if (allPlanejamentos.length === 0) {
        const baseAtividadeArr = await retryWithBackoff(() => Atividade.filter({ id: selectedAtividade.base_atividade_id }), 3, 500, 'findBaseAtividade');
        
        if (!baseAtividadeArr || baseAtividadeArr.length === 0) {
            throw new Error("Atividade base original não encontrada para criar a nova versão.");
        }
        
        const atividadeOriginal = baseAtividadeArr[0];

        const existingOverride = await retryWithBackoff(() => Atividade.filter({
            empreendimento_id: empreendimentoId,
            id_atividade: selectedAtividade.base_atividade_id,
            documento_id: null,
            tempo: { operator: '!=', value: -999 } 
        }), 3, 500, 'findExistingOverride');

        const foundOverride = existingOverride.find(o => o.id_atividade === selectedAtividade.base_atividade_id && o.empreendimento_id === empreendimentoId);

        if (foundOverride) {
            await retryWithBackoff(() => Atividade.update(foundOverride.id, { etapa: newEtapa }), 3, 500, 'updateAtividadeOverride');
            alert(`A etapa para "${selectedAtividade.atividade}" foi atualizada para "${newEtapa}" para todo este empreendimento.`);
        } else {
            const overrideAtividade = {
                ...atividadeOriginal,
                id_atividade: selectedAtividade.base_atividade_id,
                etapa: newEtapa,
                empreendimento_id: empreendimentoId,
                documento_id: null,
            };
            delete overrideAtividade.id;

            await retryWithBackoff(() => Atividade.create(overrideAtividade), 3, 500, 'createAtividadeOverride');
            alert(`A etapa para "${selectedAtividade.atividade}" foi definida como "${newEtapa}" para todo este empreendimento. Futuros planejamentos e visualizações de atividades "Disponíveis" usarão esta nova etapa.`);
        }

      } else {
        const updatePromises = allPlanejamentos.map(plano => 
          retryWithBackoff(() => PlanejamentoAtividade.update(plano.id, { etapa: newEtapa }), 3, 500, `updateEtapa-${plano.id}`)
        );
        
        await Promise.all(updatePromises);
        
        alert(`${allPlanejamentos.length} ocorrência(s) da atividade foram atualizadas para a etapa "${newEtapa}".`);
      }
      
      // Recarregar alterações
      const alteracoes = await AlteracaoEtapa.filter({ empreendimento_id: empreendimentoId });
      setAlteracoesEtapa(alteracoes || []);
  
      fetchData();
  
    } catch (error) {
      console.error("Erro ao atualizar etapa:", error);
      alert("Ocorreu um erro ao atualizar a etapa da atividade.");
      throw error;
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir esta atividade do projeto? Atividades de folhas não são afetadas.")) {
      try {
        await retryWithBackoff(() => Atividade.delete(id), 3, 500, 'deleteAtividade');
        fetchData(); 
        if(onUpdate) onUpdate();
      } catch (error) {
        console.error("Erro ao excluir atividade:", error);
        alert("Não foi possível excluir a atividade.");
      }
    }
  };

  const handleExcluirAtividade = async (atividade) => {
    const genericAtividadeIdToExclude = atividade.base_atividade_id || atividade.id;
    
    if (!window.confirm(`Tem certeza que deseja excluir a atividade "${atividade.atividade}" de TODAS as folhas deste empreendimento? Ela não aparecerá mais como "Disponível" ou "Planejada" em nenhuma folha.`)) {
      return;
    }

    setIsDeletingActivity(prev => ({ ...prev, [genericAtividadeIdToExclude]: true }));

    try {
      console.log(`🗑️ Marcando atividade genérica ${genericAtividadeIdToExclude} como excluída para empreendimento ${empreendimentoId}`);
      
      const existingMarkers = await retryWithBackoff(
        () => Atividade.filter({ 
          empreendimento_id: empreendimentoId,
          id_atividade: genericAtividadeIdToExclude,
          tempo: -999,
          documento_id: null
        }),
        3, 500, `checkExistingExclusionMarker-${genericAtividadeIdToExclude}`
      );

      if (existingMarkers && existingMarkers.length > 0) {
        alert("Esta atividade já está marcada como excluída para este empreendimento.");
        setIsDeletingActivity(prev => ({ ...prev, [genericAtividadeIdToExclude]: false }));
        return;
      }

      const atividadeOriginalArr = await retryWithBackoff(
        () => Atividade.filter({ id: genericAtividadeIdToExclude }),
        3, 500, `getOriginalGenericActivity-${genericAtividadeIdToExclude}`
      );

      if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) {
        throw new Error("Atividade genérica original não encontrada.");
      }
      const atividadeOriginal = atividadeOriginalArr[0];

      await retryWithBackoff(
        () => Atividade.create({
          ...atividadeOriginal,
          id: undefined,
          empreendimento_id: empreendimentoId,
          id_atividade: genericAtividadeIdToExclude,
          tempo: -999,
          documento_id: null,
          atividade: `(Excluída) ${atividadeOriginal.atividade}`
        }),
        3, 500, `createExclusionMarker-${genericAtividadeIdToExclude}`
      );

      console.log(`✅ Marcador de exclusão criado com sucesso para atividade genérica ${genericAtividadeIdToExclude}`);
      
      // Registrar exclusão em AtividadesEmpreendimento
      try {
        const atividadesEmp = await retryWithBackoff(
          () => base44.entities.AtividadesEmpreendimento.filter({
            empreendimento_id: empreendimentoId,
            id_atividade: atividadeOriginal.id_atividade || genericAtividadeIdToExclude
          }),
          3, 500, `getAtividadesEmpExcluir-${genericAtividadeIdToExclude}`
        );
        
        const agora = new Date().toISOString();
        for (const atividadeEmp of atividadesEmp) {
          await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.update(atividadeEmp.id, {
              status_planejamento: 'nao_planejada',
              data_exclusao: agora,
              motivo_exclusao: 'Excluída globalmente do empreendimento'
            }),
            3, 500, `updateAtividadeEmpExclusao-${atividadeEmp.id}`
          );
        }
        console.log(`   📋 ${atividadesEmp.length} registro(s) marcado(s) como excluído(s) em AtividadesEmpreendimento`);
      } catch (error) {
        console.warn(`   ⚠️ Erro ao atualizar AtividadesEmpreendimento:`, error);
      }
      
      await fetchData();
      if (onUpdate) onUpdate();
      
      alert(`Atividade "${atividade.atividade}" foi marcada como excluída de todas as folhas deste empreendimento.`);

    } catch (error) {
      console.error("Erro ao marcar atividade para exclusão:", error);
      alert("Erro ao marcar atividade para exclusão. Tente novamente: " + error.message);
    } finally {
      setIsDeletingActivity(prev => ({ ...prev, [genericAtividadeIdToExclude]: false }));
    }
  };

  const handleOpenExcluirDeFolhasModal = (atividade) => {
    setSelectedAtividade(atividade);
    setIsExcluirDeFolhasModalOpen(true);
  };

  const handlePlanejarAtividade = (atividade) => {
    setAtividadeParaPlanejar(atividade);
    setIsPlanejamentoModalOpen(true);
  };

  const handlePlanejarComplete = () => {
    setIsPlanejamentoModalOpen(false);
    setAtividadeParaPlanejar(null);
    fetchData();
    if (onUpdate) onUpdate();
  };

  const handleSelectItem = (uniqueId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(uniqueId)) {
        newSet.delete(uniqueId);
      } else {
        newSet.add(uniqueId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (isChecked) => {
    if (isChecked) {
      const projectActivityIds = atividadesAgrupadas
        .filter(grupo => grupo.baseAtividade.isEditable)
        .map(grupo => grupo.baseAtividade.uniqueId);
      setSelectedIds(new Set(projectActivityIds));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleAtividadeExpansion = (key) => {
    setExpandedAtividades(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeleteSelected = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    if (!window.confirm(`Tem certeza que deseja excluir ${count} atividade(s) selecionada(s)?`)) {
      return;
    }

    setIsDeletingMultiple(true);

    try {
      const idsArray = Array.from(selectedIds);
      const results = {
        deleted: 0,
        notFound: 0,
        errors: 0
      };

      for (const uniqueId of idsArray) {
        try {
          const grupo = atividadesAgrupadas.find(g => g.baseAtividade.uniqueId === uniqueId);
          if (!grupo || !grupo.baseAtividade.isEditable) {
            console.warn('Atividade não editável ou não encontrada:', uniqueId);
            continue;
          }

          await retryWithBackoff(() => Atividade.delete(grupo.baseAtividade.id), 3, 500, `deleteAtividade-${grupo.baseAtividade.id}`);
          results.deleted++;
          
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          if (error.message?.includes("Object not found") || 
              error.message?.includes("ObjectNotFoundError") ||
              error.response?.status === 404) {
            results.notFound++;
          } else {
            results.errors++;
            console.error('Erro ao excluir atividade:', uniqueId, error);
          }
        }
      }

      setSelectedIds(new Set());
      fetchData();
      if (onUpdate) onUpdate();

      if (results.errors === 0) {
        if (results.notFound > 0) {
          alert(`${results.deleted} atividades foram excluídas. ${results.notFound} já haviam sido excluídas anteriormente.`);
        } else {
          alert(`${results.deleted} atividades foram excluídas com sucesso.`);
        }
      } else {
        alert(`Processo concluído: ${results.deleted} excluídas, ${results.notFound} já excluídas, ${results.errors} erros.`);
      }

    } catch (error) {
      console.error("Erro durante exclusão em lote:", error);
      alert("Ocorreu um erro durante a exclusão em lote.");
    } finally {
      setIsDeletingMultiple(false);
    }
  };

  const handleRestaurarExclusoesGlobais = async () => {};

  const handleToggleFolhaConcluida = async (folha, concluir) => {
    const chave = `${folha.source_documento_id}-${folha.base_atividade_id}`;
    setIsConcluindo(prev => ({ ...prev, [chave]: true }));
    try {
      const planos = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({
          empreendimento_id: empreendimentoId,
          documento_id: folha.source_documento_id,
          atividade_id: folha.base_atividade_id
        }),
        3, 500, `findPlanosToggleFolha-${chave}`
      );
      if (concluir) {
        if (planos.length > 0) {
          await Promise.all(planos.map(p => retryWithBackoff(() => PlanejamentoAtividade.update(p.id, { status: 'concluido' }), 3, 500, `concluirFolha-${p.id}`)));
        } else {
          const baseAtiv = combinedActivities.find(a => a.id === folha.base_atividade_id);
          const descritivo = baseAtiv?.atividade || folha.source_documento_arquivo || '';
          await retryWithBackoff(() => PlanejamentoAtividade.create({
            empreendimento_id: empreendimentoId,
            documento_id: folha.source_documento_id,
            atividade_id: folha.base_atividade_id,
            etapa: folha.etapa || '',
            descritivo,
            tempo_planejado: folha.tempo || 0,
            status: 'concluido',
            termino_real: format(new Date(), 'yyyy-MM-dd'),
            horas_por_dia: {}
          }), 3, 500, `criarPlanoConcluidoFolha-${chave}`);
        }
      } else {
        await Promise.all(planos.map(p => {
          if (p.inicio_planejado && p.termino_planejado) {
            return retryWithBackoff(() => PlanejamentoAtividade.update(p.id, { status: 'nao_iniciado', termino_real: null }), 3, 500, `reverterFolha-${p.id}`);
          }
          return retryWithBackoff(() => PlanejamentoAtividade.delete(p.id), 3, 500, `deletarPlanoConcluidoFolha-${p.id}`);
        }));
      }
      await fetchData();
    } catch (error) {
      console.error('Erro ao alterar status da folha:', error);
      alert('Não foi possível alterar o status desta folha. Tente novamente.');
    } finally {
      setIsConcluindo(prev => ({ ...prev, [chave]: false }));
    }
  };

  const handleSaveFolhaExecutor = async (folha, executorEmail, dataInicioCustom = null) => {
    const folhaKey = `${folha.source_documento_id}-${folha.base_atividade_id}`;
    setIsSavingFolhaExecutor(prev => ({ ...prev, [folhaKey]: true }));
    try {
      const atividadeId = folha.base_atividade_id;
      const atividadeOriginalArr = await retryWithBackoff(
        () => Atividade.filter({ id: atividadeId }),
        3, 500, `getFolhaAtiv-${atividadeId}`
      );
      if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) throw new Error('Atividade não encontrada.');
      const atividadeOriginal = atividadeOriginalArr[0];

      // Check for existing plan
      const planejamentosExistentes = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({
          empreendimento_id: empreendimentoId,
          atividade_id: atividadeId,
          documento_id: folha.source_documento_id,
        }),
        3, 500, `checkFolhaPlan-${folhaKey}`
      );
      if (planejamentosExistentes && planejamentosExistentes.length > 0) {
        await retryWithBackoff(() => PlanejamentoAtividade.update(planejamentosExistentes[0].id, { executor_principal: executorEmail, executores: [executorEmail] }), 3, 500, `updateFolhaPlan-${folhaKey}`);
        setDatasInicioFolha(prev => ({ ...prev, [folhaKey]: null }));
        await fetchData();
        return;
      }

      // Load executor existing plans to compute daily load
      const [planosAtiv, planosDoc] = await Promise.all([
        retryWithExtendedBackoff(() => PlanejamentoAtividade.filter({ executor_principal: executorEmail }), 'loadAtivForFolha'),
        retryWithExtendedBackoff(() => PlanejamentoDocumento.filter({ executor_principal: executorEmail }), 'loadDocForFolha'),
      ]);
      const hoje = new Date();
      const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const cargaDiaria = {};
      [...(planosAtiv || []), ...(planosDoc || [])].forEach(plano => {
        if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
          Object.entries(plano.horas_por_dia).forEach(([data, horas]) => {
            try {
              const dataObj = parseISO(data);
              if (isValid(dataObj) && dataObj >= hojeMidnight) {
                const diaKey = format(dataObj, 'yyyy-MM-dd');
                const h = Number(horas) || 0;
                if (h > 0 && h <= 12) cargaDiaria[diaKey] = (cargaDiaria[diaKey] || 0) + h;
              }
            } catch {}
          });
        }
      });

      const doc = documentosMap.get(folha.source_documento_id);
      const fator = doc?.fator_dificuldade || 1;
      // folha.tempo is already the per-folha calculated time; fall back to atividade base * fator
      const tempoCalculado = Number(folha.tempo) || (Number(atividadeOriginal.tempo) * fator) || 0;
      if (tempoCalculado <= 0) {
        throw new Error('Esta atividade não possui tempo configurado. Defina o tempo padrão antes de planejar.');
      }

      let dataInicio = dataInicioCustom ? new Date(dataInicioCustom) : new Date(hojeMidnight);
      if (dataInicioCustom) {
        if (!isWorkingDay(dataInicio)) dataInicio = getNextWorkingDay(dataInicio);
      } else {
        let t = 0;
        while (t < 365) {
          if (isWorkingDay(dataInicio) && (8 - (cargaDiaria[format(dataInicio, 'yyyy-MM-dd')] || 0)) >= 0.5) break;
          dataInicio = addDays(dataInicio, 1);
          t++;
        }
        if (t >= 365) throw new Error('Sem data disponível para o executor.');
      }

      const resultado = distribuirHorasPorDias(dataInicio, tempoCalculado, 8, cargaDiaria, false);
      if (!resultado?.distribuicao || !Object.keys(resultado.distribuicao).length) throw new Error('Não foi possível distribuir as horas.');
      const { distribuicao, dataTermino } = resultado;
      const diasUtilizados = Object.keys(distribuicao).sort();
      const descritivo = [doc?.numero, doc?.arquivo, atividadeOriginal.atividade].filter(Boolean).join(' - ');

      await retryWithBackoff(() => PlanejamentoAtividade.create({
        empreendimento_id: empreendimentoId,
        atividade_id: atividadeId,
        documento_id: folha.source_documento_id,
        etapa: folha.etapa || atividadeOriginal.etapa || '',
        descritivo,
        tempo_planejado: tempoCalculado,
        executor_principal: executorEmail,
        executores: [executorEmail],
        inicio_planejado: diasUtilizados[0],
        termino_planejado: format(dataTermino, 'yyyy-MM-dd'),
        horas_por_dia: distribuicao,
        status: 'nao_iniciado',
      }), 3, 500, `createFolhaPlan-${folhaKey}`);

      setDatasInicioFolha(prev => ({ ...prev, [folhaKey]: null }));
      await fetchData();
    } catch (error) {
      console.error('Erro ao planejar folha:', error);
      alert(`Erro ao planejar folha: ${error.message}`);
    } finally {
      setIsSavingFolhaExecutor(prev => ({ ...prev, [folhaKey]: false }));
    }
  };

  const renderContent = () => (
    <AnaliticoRenderContent
      isLoading={isLoading} atividadesAgrupadas={atividadesAgrupadas} atividadesPorDisciplina={atividadesPorDisciplina}
      handleOpenModal={handleOpenModal} selectedIds={selectedIds} isDeletingMultiple={isDeletingMultiple}
      handleSelectAll={handleSelectAll} handleDeleteSelected={handleDeleteSelected}
      atividadesSelecionadasParaPlanejar={atividadesSelecionadasParaPlanejar} setAtividadesSelecionadasParaPlanejar={setAtividadesSelecionadasParaPlanejar}
      atividadesSelecionadasParaExcluir={atividadesSelecionadasParaExcluir} setAtividadesSelecionadasParaExcluir={setAtividadesSelecionadasParaExcluir}
      handleExcluirMultiplas={handleExcluirMultiplas} isExcluindoMultiplasFolhas={isExcluindoMultiplasFolhas}
      expandedAtividades={expandedAtividades} toggleAtividadeExpansion={toggleAtividadeExpansion}
      isDeletingActivity={isDeletingActivity} isConcluindo={isConcluindo} isSavingExecutor={isSavingExecutor}
      datasInicio={datasInicio} setDatasInicio={setDatasInicio} planejamentos={planejamentos} empreendimentoId={empreendimentoId}
      handleSelectItem={handleSelectItem} handleOpenEtapaModal={handleOpenEtapaModal} handleOpenEditarEtapaEmFolhasModal={handleOpenEditarEtapaEmFolhasModal}
      handleConcluirEmTodasFolhas={handleConcluirEmTodasFolhas} handleOpenExcluirDeFolhasModal={handleOpenExcluirDeFolhasModal}
      handleExcluirAtividade={handleExcluirAtividade} handleDelete={handleDelete} handleSaveExecutor={handleSaveExecutor}
      handlePlanejarMultiplas={handlePlanejarMultiplas} handleToggleFolhaConcluida={handleToggleFolhaConcluida}
      usuarios={usuarios} editandoTempo={editandoTempo}
      novosTempoPadrao={novosTempoPadrao} setNovosTempoPadrao={setNovosTempoPadrao} setEditandoTempo={setEditandoTempo}
      handleSalvarTempoPadrao={handleSalvarTempoPadrao} itensPRE={itensPRE}
      handleSaveFolhaExecutor={handleSaveFolhaExecutor}
      datasInicioFolha={datasInicioFolha} setDatasInicioFolha={setDatasInicioFolha}
      isSavingFolhaExecutor={isSavingFolhaExecutor}
      fetchData={fetchData}
    />
  );

  const handleConcluirEmTodasFolhas = async (atividade) => {
    const atividadeId = atividade.base_atividade_id || atividade.id;
    if (!window.confirm(`Tem certeza que deseja CONCLUIR a atividade "${atividade.atividade}" em TODAS as folhas?`)) return;
    setIsConcluindo(prev => ({ ...prev, [atividadeId]: true }));
    try {
      const plans = await retryWithBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoId, atividade_id: atividadeId }), 3, 500, `getConcluirPlanejamentos-${atividadeId}`);
      const hoje = format(new Date(), 'yyyy-MM-dd');
      let concluidos = 0; let jaFinalizados = 0;
      if (plans.length === 0) {
        const atividadeOriginalArr = await retryWithBackoff(() => Atividade.filter({ id: atividadeId }), 3, 500, `getOriginalActivity-${atividadeId}`);
        if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) throw new Error("Atividade original não encontrada.");
        const atividadeOriginal = atividadeOriginalArr[0];
        const documentosComAtividade = documentos.filter(doc => doc.disciplina === atividadeOriginal.disciplina && (doc.subdisciplinas || []).includes(atividadeOriginal.subdisciplina));
        for (const doc of documentosComAtividade) {
          await retryWithBackoff(() => PlanejamentoAtividade.create({ empreendimento_id: empreendimentoId, atividade_id: atividadeId, documento_id: doc.id, etapa: atividadeOriginal.etapa, descritivo: atividadeOriginal.atividade, tempo_planejado: atividadeOriginal.tempo || 0, status: 'concluido', termino_real: hoje, horas_por_dia: {} }), 3, 500, `createConcludedPlan-${doc.id}-${atividadeId}`);
          concluidos++;
        }
      } else {
        for (const plano of plans) {
          if (plano.status === 'concluido') { jaFinalizados++; continue; }
          await retryWithBackoff(() => PlanejamentoAtividade.update(plano.id, { status: 'concluido', termino_real: hoje }), 3, 500, `concluirPlan-${plano.id}`);
          concluidos++;
        }
      }
      await fetchData(); if (onUpdate) onUpdate();
      alert(`✅ Atividade "${atividade.atividade}" concluída!\n• ${concluidos} planejamento(s) concluído(s)${jaFinalizados > 0 ? `\n• ${jaFinalizados} já finalizado(s)` : ''}`);
    } catch (error) {
      alert("Erro ao concluir atividade: " + error.message);
    } finally {
      setIsConcluindo(prev => ({ ...prev, [atividadeId]: false }));
    }
  };

  const handleSaveExecutor = async (atividade, executorEmail, dataInicioCustom = null) => {
    const atividadeId = atividade.base_atividade_id || atividade.id;
    setIsSavingExecutor(prev => ({ ...prev, [atividadeId]: true }));
    
    try {
      // Buscar atividade original
      const atividadeOriginalArr = await retryWithBackoff(
        () => Atividade.filter({ id: atividadeId }),
        3, 500, `getOriginalActivity-${atividadeId}`
      );
      
      if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) {
        throw new Error("Atividade original não encontrada.");
      }
      
      const atividadeOriginal = atividadeOriginalArr[0];
      // Verificar se já existe override global para esta atividade
      const existingOverrides = await retryWithBackoff(
        () => Atividade.filter({
          empreendimento_id: empreendimentoId,
          id_atividade: atividadeId,
          documento_id: null,
          tempo: { operator: '!=', value: -999 }
        }),
        3, 500, `checkExistingExecutorOverride-${atividadeId}`
      );
      
      if (existingOverrides && existingOverrides.length > 0) {
        await retryWithBackoff(() => Atividade.update(existingOverrides[0].id, { executor_principal: executorEmail || null }), 3, 500, `updateExecutorOverride-${existingOverrides[0].id}`);
      } else if (executorEmail) {
        await retryWithBackoff(() => Atividade.create({ ...atividadeOriginal, id: undefined, empreendimento_id: empreendimentoId, id_atividade: atividadeId, documento_id: null, executor_principal: executorEmail }), 3, 500, `createExecutorOverride-${atividadeId}`);
      }
      
      // Se não há executor, remover planejamentos existentes
      if (!executorEmail) {
        // Buscar e remover planejamentos desta atividade
        const planejamentosParaRemover = await retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId
          }),
          3, 500, `getPlanejamentosParaRemover-${atividadeId}`
        );
        
        if (planejamentosParaRemover && planejamentosParaRemover.length > 0) {
          await Promise.all(
            planejamentosParaRemover.map(p => 
              retryWithBackoff(
                () => PlanejamentoAtividade.delete(p.id),
                3, 500, `deletePlan-${p.id}`
              )
            )
          );
        }
        
        // Atualizar combinedActivities de forma otimista e completa
        setCombinedActivities(prev => {
          return prev.map(ativ => {
            if (ativ.base_atividade_id === atividadeId || ativ.id === atividadeId) {
              return { 
                ...ativ, 
                executor_principal: null,
                status: 'Disponível'
              };
            }
            return ativ;
          });
        });
        
        // Atualizar planejamentos em background silenciosamente (sem onUpdate)
        setTimeout(() => {
          retryWithBackoff(
            () => PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoId }),
            3, 500, 'refreshPlanejamentosAfterRemove'
          ).then(planejamentosAtualizados => {
            setPlanejamentos(planejamentosAtualizados || []);
          }).catch(err => {
            console.warn("Erro ao atualizar planejamentos após remoção:", err);
          });
        }, 100);
        return;
      }
      
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
      
      const documentosComAtividade = documentos.filter(doc => {
        return doc.disciplina === atividadeOriginal.disciplina && (doc.subdisciplinas || []).includes(atividadeOriginal.subdisciplina);
      });
      
      // Criar planejamentos para cada documento (ou um planejamento geral se não houver documentos)
      let planejamentosCriados = 0;
      let planejamentosJaExistentes = 0;
      
      if (documentosComAtividade.length === 0) {
        // Verificar se já existe planejamento geral
        const planejamentosExistentes = await retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId,
            documento_id: null
          }),
          3, 500, `checkExistingGeneralPlan-${atividadeId}`
        );
        
        if (planejamentosExistentes && planejamentosExistentes.length > 0) {
          await retryWithBackoff(() => PlanejamentoAtividade.update(planejamentosExistentes[0].id, { executor_principal: executorEmail, executores: [executorEmail] }), 3, 500, `updateGeneralPlanExecutor-${planejamentosExistentes[0].id}`);
          planejamentosJaExistentes++;
        } else {
          const tempoCalculado = atividadeOriginal.tempo || 0;
          let dataInicio = dataInicioCustom ? new Date(dataInicioCustom) : new Date(hojeMidnight);
          
          if (dataInicioCustom) {
            if (!isWorkingDay(dataInicio)) dataInicio = getNextWorkingDay(dataInicio);
          } else {
            let t = 0;
            while (t < 365) { if (isWorkingDay(dataInicio) && (8 - (cargaDiaria[format(dataInicio,'yyyy-MM-dd')] || 0)) >= 0.5) break; dataInicio = addDays(dataInicio, 1); t++; }
            if (t >= 365) throw new Error(`Não foi possível encontrar data disponível.`);
          }
          const resultadoDistribuicao = distribuirHorasPorDias(dataInicio, tempoCalculado, 8, cargaDiaria, false);
          if (!resultadoDistribuicao?.distribuicao || !Object.keys(resultadoDistribuicao.distribuicao).length) throw new Error(`Não foi possível distribuir as horas.`);
          const { distribuicao, dataTermino } = resultadoDistribuicao;
          const diasUtilizados = Object.keys(distribuicao).sort();
          await retryWithBackoff(() => PlanejamentoAtividade.create({ empreendimento_id: empreendimentoId, atividade_id: atividadeId, documento_id: null, etapa: atividadeOriginal.etapa, descritivo: atividadeOriginal.atividade, tempo_planejado: tempoCalculado, executor_principal: executorEmail, executores: [executorEmail], inicio_planejado: diasUtilizados[0], termino_planejado: format(dataTermino, 'yyyy-MM-dd'), horas_por_dia: distribuicao, status: 'nao_iniciado' }), 3, 500, `createGeneralPlan-${atividadeId}`);
          planejamentosCriados++;
        }
      } else {
        for (const doc of documentosComAtividade) {
        const planejamentosExistentes = await retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId,
            documento_id: doc.id
          }),
          3, 500, `checkExistingPlan-${doc.id}-${atividadeId}`
        );
        
        if (planejamentosExistentes && planejamentosExistentes.length > 0) {
          await retryWithBackoff(() => PlanejamentoAtividade.update(planejamentosExistentes[0].id, { executor_principal: executorEmail, executores: [executorEmail] }), 3, 500, `updatePlanExecutor-${planejamentosExistentes[0].id}`);
          planejamentosJaExistentes++;
        } else {
          const fatorDificuldade = doc.fator_dificuldade || 1;
          const tempoCalculado = (atividadeOriginal.tempo || 0) * fatorDificuldade;
          let dataInicio = dataInicioCustom ? new Date(dataInicioCustom) : new Date(hojeMidnight);
          if (dataInicioCustom) { if (!isWorkingDay(dataInicio)) dataInicio = getNextWorkingDay(dataInicio); }
          else { let t = 0; while (t < 365) { if (isWorkingDay(dataInicio) && (8 - (cargaDiaria[format(dataInicio,'yyyy-MM-dd')] || 0)) >= 0.5) break; dataInicio = addDays(dataInicio, 1); t++; } if (t >= 365) throw new Error(`Sem data disponível.`); }
          const resultadoDistribuicao = distribuirHorasPorDias(dataInicio, tempoCalculado, 8, cargaDiaria, false);
          if (!resultadoDistribuicao?.distribuicao || !Object.keys(resultadoDistribuicao.distribuicao).length) throw new Error(`Não foi possível distribuir as horas.`);
          const { distribuicao, dataTermino, novaCargaDiaria } = resultadoDistribuicao;
          const diasUtilizados = Object.keys(distribuicao).sort();
          await retryWithBackoff(() => PlanejamentoAtividade.create({ empreendimento_id: empreendimentoId, atividade_id: atividadeId, documento_id: doc.id, etapa: atividadeOriginal.etapa, descritivo: atividadeOriginal.atividade, tempo_planejado: tempoCalculado, executor_principal: executorEmail, executores: [executorEmail], inicio_planejado: diasUtilizados[0], termino_planejado: format(dataTermino, 'yyyy-MM-dd'), horas_por_dia: distribuicao, status: 'nao_iniciado' }), 3, 500, `createPlan-${doc.id}-${atividadeId}`);
          planejamentosCriados++;
          
          Object.assign(cargaDiaria, novaCargaDiaria);
        }
      }
      }
      
      // Atualizar combinedActivities de forma otimista e completa
      setCombinedActivities(prev => {
        return prev.map(ativ => {
          if (ativ.base_atividade_id === atividadeId || ativ.id === atividadeId) {
            return { 
              ...ativ, 
              executor_principal: executorEmail,
              status: executorEmail ? 'Planejada' : 'Disponível'
            };
          }
          return ativ;
        });
      });
      
      // Atualizar planejamentos em background silenciosamente (sem onUpdate para não recarregar página)
      setTimeout(() => {
        retryWithBackoff(
          () => PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoId }),
          3, 500, 'refreshPlanejamentosOnly'
        ).then(planejamentosAtualizados => {
          setPlanejamentos(planejamentosAtualizados || []);
        }).catch(err => {
          console.warn("Erro ao atualizar planejamentos em background:", err);
        });
      }, 100);
      
    } catch (error) {
      alert("Erro ao salvar executor e criar planejamentos: " + error.message);
      setIsSavingExecutor(prev => ({ ...prev, [atividadeId]: false }));
    } finally {
      setIsSavingExecutor(prev => ({ ...prev, [atividadeId]: false }));
    }
  };

  const handlePlanejarMultiplas = async (executorEmail, dataInicioCustom = null) => {
    if (atividadesSelecionadasParaPlanejar.size === 0) { alert("Nenhuma atividade selecionada."); return; }
    const atividadesParaPlanejar = Array.from(atividadesSelecionadasParaPlanejar);
    if (!window.confirm(`Deseja planejar ${atividadesParaPlanejar.length} atividade(s) para ${usuarios.find(u => u.email === executorEmail)?.nome || executorEmail}?`)) return;
    // Marcar todas como "salvando"
    const savingState = {};
    atividadesParaPlanejar.forEach(id => {
      savingState[id] = true;
    });
    setIsSavingExecutor(prev => ({ ...prev, ...savingState }));

    try {
      let planejadosComSucesso = 0;
      let erros = 0;

      for (const atividadeId of atividadesParaPlanejar) {
        try {
          // Buscar a atividade no combinedActivities
          const atividadeEncontrada = combinedActivities.find(
            ativ => (ativ.base_atividade_id === atividadeId || ativ.id === atividadeId) && !ativ.isEditable
          );

          if (!atividadeEncontrada) {
            console.warn(`⚠️ Atividade ${atividadeId} não encontrada`);
            erros++;
            continue;
          }

          console.log(`▶️ Planejando: ${atividadeEncontrada.atividade}`);
          await handleSaveExecutor(atividadeEncontrada, executorEmail, dataInicioCustom);
          planejadosComSucesso++;
          
          // Pequeno delay entre requisições
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`❌ Erro ao planejar atividade ${atividadeId}:`, error);
          erros++;
        }
      }

      console.log(`\n✅ ========================================`);
      console.log(`✅ PLANEJAMENTO EM LOTE CONCLUÍDO`);
      console.log(`✅ ========================================`);
      console.log(`   Planejadas: ${planejadosComSucesso}`);
      console.log(`   Erros: ${erros}`);
      console.log(`✅ ========================================\n`);

      // Limpar seleção
      setAtividadesSelecionadasParaPlanejar(new Set());

      if (erros === 0) {
        alert(`✅ ${planejadosComSucesso} atividade${planejadosComSucesso > 1 ? 's planejadas' : ' planejada'} com sucesso!`);
      } else {
        alert(`⚠️ Processo concluído:\n${planejadosComSucesso} planejada(s)\n${erros} erro(s)`);
      }

    } catch (error) {
      console.error("❌ Erro no planejamento em lote:", error);
      alert("Erro ao planejar atividades: " + error.message);
    } finally {
      // Limpar estado de "salvando"
      const clearSavingState = {};
      atividadesParaPlanejar.forEach(id => {
        clearSavingState[id] = false;
      });
      setIsSavingExecutor(prev => ({ ...prev, ...clearSavingState }));
    }
  };

  const handleConcluirEtapaCompleta = async (etapa) => {
    if (!etapa) {
      alert("Selecione uma etapa para concluir.");
      return;
    }

    // Buscar TODOS os planejamentos da etapa diretamente
    let todosPlanejamentos = await retryWithBackoff(
      () => PlanejamentoAtividade.filter({
        empreendimento_id: empreendimentoId,
        etapa: etapa
      }),
      3, 500, `getTodosPlanejamentosEtapa-${etapa}`
    );

    // Se não há planejamentos, criar planejamentos concluídos para todas as atividades da etapa
    if (todosPlanejamentos.length === 0) {
      console.log(`   ℹ️ Nenhum planejamento encontrado para etapa "${etapa}". Criando planejamentos concluídos...`);
      
      // Deduplicate by base_atividade_id
      const atividadesEtapaDedup = new Map();
      combinedActivities.filter(a => a.etapa === etapa && !a.isEditable).forEach(a => { const k = a.base_atividade_id || a.id; if (!atividadesEtapaDedup.has(k)) atividadesEtapaDedup.set(k, a); });
      const atividadesEtapa = Array.from(atividadesEtapaDedup.values());
      if (atividadesEtapa.length === 0) { alert(`Nenhuma atividade encontrada para a etapa "${etapa}".`); return; }
      const hoje = format(new Date(), 'yyyy-MM-dd');
      let novosPlanejamentos = [];
      const allAtivList = await retryWithBackoff(() => Atividade.list(), 3, 500, `getAllActivitiesForEtapa`);
      const atividadesOriginaisMap = new Map((allAtivList || []).map(a => [a.id, a]));
      for (const ativ of atividadesEtapa) {
        const atividadeId = ativ.base_atividade_id || ativ.id;
        const atividadeOriginal = atividadesOriginaisMap.get(atividadeId);
        if (!atividadeOriginal) continue;
        const documentosComAtividade = documentos.filter(doc => {
          const disciplinaMatch = doc.disciplina === atividadeOriginal.disciplina;
          const subdisciplinasDoc = doc.subdisciplinas || [];
          const subdisciplinaMatch = subdisciplinasDoc.includes(atividadeOriginal.subdisciplina);
          return disciplinaMatch && subdisciplinaMatch;
        });
        
        const docsParaCriar = documentosComAtividade.length > 0 ? documentosComAtividade.map(d => d.id) : [null];
        for (const docId of docsParaCriar) {
          const np = await retryWithBackoff(() => PlanejamentoAtividade.create({ empreendimento_id: empreendimentoId, atividade_id: atividadeId, documento_id: docId, etapa, descritivo: atividadeOriginal.atividade, tempo_planejado: atividadeOriginal.tempo || 0, status: 'concluido', termino_real: hoje, horas_por_dia: {} }), 3, 500, `createEtapaPlan-${docId}-${atividadeId}`);
          novosPlanejamentos.push(np);
        }
      }
      
      todosPlanejamentos = novosPlanejamentos;
      console.log(`   ✅ ${novosPlanejamentos.length} planejamento(s) concluído(s) criado(s)`);
    }

    // Atividades sem planejamento (Disponível) também precisam ser concluídas
    const atividadesDedupMap = new Map();
    combinedActivities.filter(a => a.etapa === etapa && !a.isEditable).forEach(a => { const k = a.base_atividade_id || a.id; if (!atividadesDedupMap.has(k)) atividadesDedupMap.set(k, a); });
    const atividadesSemPlano = Array.from(atividadesDedupMap.values()).filter(a => !todosPlanejamentos.some(p => p.atividade_id === (a.base_atividade_id || a.id)));

    if (!window.confirm(`Concluir etapa "${etapa}"?\n\n${todosPlanejamentos.length} planejamento(s) + ${atividadesSemPlano.length} atividade(s) disponível(is) serão concluídos.`)) return;

    setIsConcluindoEtapa(true);
    try {
      let totalConcluidos = 0;
      let jaFinalizados = 0;
      const hoje = format(new Date(), 'yyyy-MM-dd');

      for (const plano of todosPlanejamentos) {
        if (plano.status === 'concluido') { jaFinalizados++; continue; }
        await retryWithExtendedBackoff(() => PlanejamentoAtividade.update(plano.id, { status: 'concluido', termino_real: hoje }), `concluirPlan-${plano.id}`);
        totalConcluidos++;
      }

      if (atividadesSemPlano.length > 0) {
        const allAtivExtra = await retryWithBackoff(() => Atividade.list(), 3, 500, `getAllActivitiesExtra`);
        const atividadesMapExtra = new Map((allAtivExtra || []).map(a => [a.id, a]));
        for (const ativ of atividadesSemPlano) {
          const atividadeId = ativ.base_atividade_id || ativ.id;
          const atividadeOriginal = atividadesMapExtra.get(atividadeId);
          if (!atividadeOriginal) continue;
          const docsCompativeis = documentos.filter(doc => doc.disciplina === atividadeOriginal.disciplina && (doc.subdisciplinas || []).includes(atividadeOriginal.subdisciplina));
          const docsParaCriar = docsCompativeis.length > 0 ? docsCompativeis.map(d => d.id) : [null];
          for (const docId of docsParaCriar) {
            await retryWithExtendedBackoff(() => PlanejamentoAtividade.create({ empreendimento_id: empreendimentoId, atividade_id: atividadeId, documento_id: docId, etapa, descritivo: atividadeOriginal.atividade, tempo_planejado: atividadeOriginal.tempo || 0, status: 'concluido', termino_real: hoje, horas_por_dia: {} }), `createConcluido-${docId}-${atividadeId}`); totalConcluidos++;
          }
        }
      }

      await fetchData();
      if (onUpdate) onUpdate();
      alert(`✅ Etapa "${etapa}" concluída!\n${totalConcluidos} planejamento(s) concluído(s).${jaFinalizados > 0 ? `\n${jaFinalizados} já estava(m) finalizado(s).` : ''}`);
      setEtapaParaConcluir('');
    } catch (error) {
      alert("Erro ao concluir etapa: " + error.message);
    } finally {
      setIsConcluindoEtapa(false);
    }
  };

  const handleReverterConclusaoEtapa = async (etapa) => {
    if (!etapa) {
      alert("Selecione uma etapa para reverter.");
      return;
    }

    const atividadesDaEtapa = atividadesAgrupadas.filter(grupo => 
      grupo.baseAtividade.etapa === etapa && !grupo.baseAtividade.isEditable
    );

    if (atividadesDaEtapa.length === 0) {
      alert(`Nenhuma atividade encontrada para a etapa "${etapa}".`);
      return;
    }

    if (!window.confirm(`Tem certeza que deseja REVERTER a conclusão de todas as atividades da etapa "${etapa}"?\n\nTodas as atividades concluídas voltarão ao status "não iniciado".`)) {
      return;
    }

    setIsRevertendoEtapa(true);

    try {


      let totalPlanejamentosRevertidos = 0;

      for (const grupo of atividadesDaEtapa) {
        const atividadeId = grupo.baseAtividade.base_atividade_id || grupo.baseAtividade.id;
        
        // Buscar todos os planejamentos desta atividade
        const planejamentosAtividade = await retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId
          }),
          3, 500, `getPlanejamentos-${atividadeId}`
        );

        for (const plano of planejamentosAtividade) {
          if (plano.status === 'concluido') {
            await retryWithBackoff(
              () => PlanejamentoAtividade.update(plano.id, {
                status: 'nao_iniciado',
                termino_real: null
              }),
              3, 500, `reverterPlan-${plano.id}`
            );
            totalPlanejamentosRevertidos++;
          }
        }
      }

      console.log(`✅ ========================================`);
      console.log(`✅ CONCLUSÃO DA ETAPA "${etapa}" REVERTIDA`);
      console.log(`   Planejamentos revertidos: ${totalPlanejamentosRevertidos}`);
      console.log(`✅ ========================================\n`);

      await fetchData();
      if (onUpdate) onUpdate();

      alert(`✅ Conclusão da etapa "${etapa}" revertida!\n\n${totalPlanejamentosRevertidos} planejamento(s) voltou(aram) para "não iniciado".`);
      setEtapaParaReverter('');

    } catch (error) {
      console.error("❌ Erro ao reverter conclusão da etapa:", error);
      alert("Erro ao reverter conclusão da etapa: " + error.message);
    } finally {
      setIsRevertendoEtapa(false);
    }
  };

  const limparAlteracoes = async () => {
    if (!confirm("Deseja limpar o registro de alterações deste empreendimento? Esta ação não pode ser desfeita.")) {
      return;
    }
    
    try {
      await Promise.all(alteracoesEtapa.map(alt => AlteracaoEtapa.delete(alt.id)));
      setAlteracoesEtapa([]);
      alert("✅ Registro de alterações limpo com sucesso!");
    } catch (error) {
      console.error("Erro ao limpar alterações:", error);
      alert("Erro ao limpar alterações: " + error.message);
    }
  };

  const handleSalvarTempoPadrao = async (atividade, atividadeId) => {
    const novoTempo = parseFloat(novosTempoPadrao[atividadeId]);
    
    if (isNaN(novoTempo) || novoTempo < 0) {
      alert("Por favor, insira um tempo válido.");
      return;
    }

    try {
      console.log(`\n⏱️ ========================================`);
      console.log(`⏱️ ATUALIZAR TEMPO PADRÃO`);
      console.log(`⏱️ ========================================`);
      console.log(`   Atividade ID: ${atividadeId}`);
      console.log(`   Atividade: ${atividade.atividade}`);
      console.log(`   Novo Tempo: ${novoTempo}h`);
      
      // Buscar atividade original
      const atividadeOriginalArr = await retryWithBackoff(
        () => Atividade.filter({ id: atividadeId }),
        3, 500, `getOriginalActivity-${atividadeId}`
      );
      
      if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) {
        throw new Error("Atividade original não encontrada.");
      }
      
      const atividadeOriginal = atividadeOriginalArr[0];
      
      // Verificar se já existe override global
      const existingOverrides = await retryWithBackoff(
        () => Atividade.filter({
          empreendimento_id: empreendimentoId,
          id_atividade: atividadeId,
          documento_id: null,
          tempo: { operator: '!=', value: -999 }
        }),
        3, 500, `checkExistingTempoOverride-${atividadeId}`
      );
      
      if (existingOverrides && existingOverrides.length > 0) {
        console.log(`📝 Atualizando ${existingOverrides.length} override(s) global com novo tempo`);
        await Promise.all(
          existingOverrides.map(override =>
            retryWithBackoff(
              () => Atividade.update(override.id, { tempo: novoTempo }),
              3, 500, `updateTempoOverride-${override.id}`
            )
          )
        );
      } else {
        console.log(`📝 Criando novo override com tempo customizado`);
        await retryWithBackoff(
          () => Atividade.create({
            ...atividadeOriginal,
            id: undefined,
            empreendimento_id: empreendimentoId,
            id_atividade: atividadeId,
            documento_id: null,
            tempo: novoTempo
          }),
          3, 500, `createTempoOverride-${atividadeId}`
        );
      }

      // Atualizar também overrides específicos de documento para a mesma atividade
      console.log(`📝 Buscando overrides específicos de documento...`);
      const documentOverrides = await retryWithBackoff(
        () => Atividade.filter({
          empreendimento_id: empreendimentoId,
          id_atividade: atividadeId,
          documento_id: { operator: '!=', value: null },
          tempo: { operator: '!=', value: -999 }
        }),
        3, 500, `checkDocumentOverrides-${atividadeId}`
      );

      if (documentOverrides && documentOverrides.length > 0) {
        console.log(`📝 Atualizando ${documentOverrides.length} override(s) de documento com novo tempo`);
        await Promise.all(
          documentOverrides.map(override =>
            retryWithBackoff(
              () => Atividade.update(override.id, { tempo: novoTempo }),
              3, 500, `updateDocumentTempoOverride-${override.id}`
            )
          )
        );
      }
      
      console.log(`✅ Tempo padrão atualizado com sucesso`);

      // Fechar edição
      setEditandoTempo(prev => ({ ...prev, [atividadeId]: false }));
      setNovosTempoPadrao(prev => {
        const newState = { ...prev };
        delete newState[atividadeId];
        return newState;
      });

      // Recarregar dados completamente
      await fetchData();

      alert(`✅ Tempo padrão de "${atividade.atividade}" atualizado para ${novoTempo}h neste empreendimento.`);
      
    } catch (error) {
      console.error("❌ Erro ao atualizar tempo padrão:", error);
      alert("Erro ao atualizar tempo padrão: " + error.message);
    }
  };

  const handleExcluirMultiplas = async (folhaSelecionada = null) => {
    if (atividadesSelecionadasParaExcluir.size === 0) {
      alert("Selecione pelo menos uma atividade.");
      return;
    }

    const atividadesParaExcluir = Array.from(atividadesSelecionadasParaExcluir);
    const atividadesEncontradas = combinedActivities.filter(a => 
      atividadesParaExcluir.includes(a.base_atividade_id || a.id)
    );

    if (atividadesEncontradas.length === 0) {
      alert("Nenhuma atividade encontrada.");
      return;
    }

    if (!folhaSelecionada) {
      // Excluir de TODAS as folhas do empreendimento
      const confirmacao = window.confirm(
        `Tem certeza que deseja excluir ${atividadesEncontradas.length} atividade(s) de TODAS as folhas deste empreendimento?`
      );

      if (!confirmacao) return;

      setIsExcluindoMultiplasFolhas(true);

      try {
        let deletados = 0;

        for (const ativ of atividadesEncontradas) {
          const atividadeId = ativ.base_atividade_id || ativ.id;
          if (ativ.isEditable) { await retryWithBackoff(() => Atividade.delete(atividadeId), 3, 500, `deleteEditable-${atividadeId}`); deletados++; continue; }
          const atividadeOriginalArr = await retryWithBackoff(() => Atividade.filter({ id: atividadeId }), 3, 500, `getActivityForGlobalDelete-${atividadeId}`);
          if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) continue;
          const atividadeOriginal = atividadeOriginalArr[0];
          
          const existingMarkers = await retryWithBackoff(
            () => Atividade.filter({
              empreendimento_id: empreendimentoId,
              id_atividade: atividadeId,
              tempo: -999,
              documento_id: null
            }),
            3, 500, `checkGlobalMarker-${atividadeId}`
          );

          if (!existingMarkers || existingMarkers.length === 0) {
            await retryWithBackoff(
              () => Atividade.create({
                ...atividadeOriginal,
                id: undefined,
                empreendimento_id: empreendimentoId,
                id_atividade: atividadeId,
                documento_id: null,
                tempo: -999,
                atividade: `(Excluída) ${atividadeOriginal.atividade}`
              }),
              3, 500, `createGlobalMarker-${atividadeId}`
            );
            deletados++;
          }
        }

        alert(`✅ ${deletados} atividade(s) excluída(s) de todas as folhas do empreendimento`);
        setAtividadesSelecionadasParaExcluir(new Set());
        await fetchData();
        if (onUpdate) onUpdate();
      } catch (error) {
        console.error("Erro ao excluir múltiplas atividades globalmente:", error);
        alert("Erro ao excluir atividades: " + error.message);
      } finally {
        setIsExcluindoMultiplasFolhas(false);
      }
      return;
    }

    if (folhaSelecionada) {
      // Excluir de uma folha específica
      const confirmacao = window.confirm(
        `Tem certeza que deseja excluir ${atividadesEncontradas.length} atividade(s) da folha ${folhaSelecionada}?`
      );

      if (!confirmacao) return;

      setIsExcluindoMultiplasFolhas(true);

      try {
        const folhaObj = documentos.find(d => d.id === folhaSelecionada);
        let deletados = 0;

        for (const ativ of atividadesEncontradas) {
          const atividadeId = ativ.base_atividade_id || ativ.id;
          
          const atividadeOriginalArr = await retryWithBackoff(
            () => Atividade.filter({ id: atividadeId }),
            3, 500, `getActivityForMultipleDelete-${atividadeId}`
          );

          if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) continue;

          const atividadeOriginal = atividadeOriginalArr[0];
          
          const existingMarkers = await retryWithBackoff(
            () => Atividade.filter({
              empreendimento_id: empreendimentoId,
              id_atividade: atividadeId,
              documento_id: folhaSelecionada,
              tempo: -999
            }),
            3, 500, `checkMarkerForDelete-${atividadeId}`
          );

          if (!existingMarkers || existingMarkers.length === 0) {
            await retryWithBackoff(
              () => Atividade.create({
                ...atividadeOriginal,
                id: undefined,
                empreendimento_id: empreendimentoId,
                id_atividade: atividadeId,
                documento_id: folhaSelecionada,
                tempo: -999,
                atividade: `(Excluída da folha ${folhaObj?.numero}) ${atividadeOriginal.atividade}`
              }),
              3, 500, `createMarkerMultiDelete-${atividadeId}`
            );
            deletados++;
          }
        }

        alert(`✅ ${deletados} atividade(s) excluída(s) da folha ${folhaObj?.numero}`);
        setAtividadesSelecionadasParaExcluir(new Set());
        await fetchData();
        if (onUpdate) onUpdate();
      } catch (error) {
        console.error("Erro ao excluir múltiplas atividades:", error);
        alert("Erro ao excluir atividades: " + error.message);
      } finally {
        setIsExcluindoMultiplasFolhas(false);
      }
    }
  };

  const handleMudarEtapaGlobal = async (novaEtapa) => {
    if (!novaEtapa) {
      alert("Selecione a nova etapa.");
      return;
    }

    const atividadesDaEtapaAntiga = atividadesAgrupadas.filter(grupo =>
      grupo.baseAtividade.etapa === etapaMudancaGlobal && !grupo.baseAtividade.isEditable
    );

    const totalAtividades = atividadesDaEtapaAntiga.length;
    if (totalAtividades === 0) {
      alert(`Nenhuma atividade encontrada para a etapa "${etapaMudancaGlobal}".`);
      return;
    }

    if (!window.confirm(
      `Tem certeza que deseja mover ${totalAtividades} atividade(s) de "${etapaMudancaGlobal}" para "${novaEtapa}" em TODAS as folhas deste empreendimento?\n\nEsta ação só afeta este empreendimento.`
    )) {
      return;
    }

    setIsMudandoEtapaGlobal(true);

    try {
      console.log(`\n🔀 ========================================`);
      console.log(`🔀 MOVER ETAPA GLOBAL: ${etapaMudancaGlobal} → ${novaEtapa}`);
      console.log(`🔀 ========================================`);
      console.log(`   Empreendimento: ${empreendimentoId}`);
      console.log(`   Atividades: ${totalAtividades}`);

      const user = await base44.auth.me();
      let atividadesMudadas = 0;
      let planejamentosMudados = 0;

      for (const grupo of atividadesDaEtapaAntiga) {
        const atividadeId = grupo.baseAtividade.base_atividade_id || grupo.baseAtividade.id;

        // Registrar a mudança
        await AlteracaoEtapa.create({
          atividade_id: atividadeId,
          id_atividade: grupo.baseAtividade.id_atividade || "",
          nome_atividade: grupo.baseAtividade.atividade,
          disciplina: grupo.baseAtividade.disciplina,
          subdisciplina: grupo.baseAtividade.subdisciplina || "",
          etapa_anterior: etapaMudancaGlobal,
          etapa_nova: novaEtapa,
          empreendimento_id: empreendimentoId,
          empreendimento_nome: empreendimentoNome,
          data_alteracao: new Date().toISOString(),
          usuario_email: user.email,
          usuario_nome: user.full_name || user.nome || user.email
        });

        // Buscar atividade original
        let atividadeOriginal = null;
        try {
          const atividadeOriginalArr = await retryWithBackoff(
            () => Atividade.filter({ id: atividadeId }),
            3, 500, `getActivityForOverride-${atividadeId}`
          );

          if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) {
            console.warn(`⚠️ Atividade original ${atividadeId} não encontrada, pulando...`);
            continue;
          }

          atividadeOriginal = atividadeOriginalArr[0];
        } catch (err) {
          console.error(`❌ Erro ao buscar atividade ${atividadeId}:`, err);
          continue;
        }

        // Criar/atualizar override global PRIMEIRO
        const existingOverrides = await retryWithBackoff(
          () => Atividade.filter({
            empreendimento_id: empreendimentoId,
            id_atividade: atividadeId,
            documento_id: null,
            tempo: { operator: '!=', value: -999 }
          }),
          3, 500, `checkOverrideGlobal-${atividadeId}`
        );

        if (existingOverrides && existingOverrides.length > 0) {
          console.log(`   ✏️ Atualizando override global existente para ${atividadeId}`);
          await retryWithBackoff(
            () => Atividade.update(existingOverrides[0].id, { etapa: novaEtapa }),
            3, 500, `updateOverrideGlobal-${existingOverrides[0].id}`
          );
        } else {
          console.log(`   📝 Criando novo override global para ${atividadeId}`);
          await retryWithBackoff(
            () => Atividade.create({
              ...atividadeOriginal,
              id: undefined,
              empreendimento_id: empreendimentoId,
              id_atividade: atividadeId,
              documento_id: null,
              etapa: novaEtapa
            }),
            3, 500, `createOverrideGlobal-${atividadeId}`
          );
        }

        // Atualizar planejamentos DEPOIS
        const planejamentosAtividade = await retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId
          }),
          3, 500, `getPlanejamentosGlobal-${atividadeId}`
        );

        if (planejamentosAtividade && planejamentosAtividade.length > 0) {
          const updatePromises = planejamentosAtividade.map(plano =>
            retryWithBackoff(
              () => PlanejamentoAtividade.update(plano.id, { etapa: novaEtapa }),
              3, 500, `updateEtapaGlobal-${plano.id}`
            )
          );
          await Promise.all(updatePromises);
          planejamentosMudados += planejamentosAtividade.length;
          console.log(`   ✅ ${planejamentosAtividade.length} planejamento(s) atualizado(s)`);
        } else {
          console.log(`   ℹ️ Nenhum planejamento encontrado para esta atividade`);
        }

        atividadesMudadas++;
        console.log(`   ✅ Atividade ${atividadeId} movida para "${novaEtapa}"`);
      }

      console.log(`\n🔀 ========================================`);
      console.log(`🔀 MUDANÇA CONCLUÍDA`);
      console.log(`   Atividades movidas: ${atividadesMudadas}`);
      console.log(`   Planejamentos atualizados: ${planejamentosMudados}`);
      console.log(`🔀 ========================================\n`);

      // Recarregar dados silenciosamente (sem chamar onUpdate para não recarregar a página)
      await fetchData();

      alert(
        `✅ Sucesso! ${atividadesMudadas} atividade(s) movida(s) de "${etapaMudancaGlobal}" para "${novaEtapa}".\n\n` +
        `${planejamentosMudados} planejamento(s) foi/foram atualizado(s).`
      );
      setEtapaMudancaGlobal('');

    } catch (error) {
      console.error("Erro ao mover etapa global:", error);
      alert("Erro ao mover atividades: " + error.message);
    } finally {
      setIsMudandoEtapaGlobal(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Catálogo de Atividades do Empreendimento</h2>
          <p className="text-gray-500">Visualize todas as atividades planejadas e gerencie as atividades específicas do projeto.</p>
          {alteracoesEtapa.length > 0 && (
            <p className="text-sm text-purple-600 mt-1">
              {alteracoesEtapa.length} alteração(ões) de etapa registrada(s)
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <PDFListaDesenvolvimento empreendimentoId={empreendimentoId} />
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="border-purple-500 text-purple-600 hover:bg-purple-50"
                disabled={isConcluindoEtapa}
              >
                {isConcluindoEtapa ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Concluindo...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Concluir Etapa Completa
                  </>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Selecione a Etapa</Label>
                  <Select value={etapaParaConcluir} onValueChange={setEtapaParaConcluir}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Escolha uma etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set(etapasUnicas)].map(etapa => (
                        <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => handleConcluirEtapaCompleta(etapaParaConcluir)}
                  disabled={!etapaParaConcluir || isConcluindoEtapa}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  Concluir Etapa
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="border-blue-500 text-blue-600 hover:bg-blue-50"
                disabled={isMudandoEtapaGlobal}
              >
                {isMudandoEtapaGlobal ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Movendo...
                  </>
                ) : (
                  <>
                    <Layers className="w-4 h-4 mr-2" />
                    Mover Etapa
                  </>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">De qual etapa?</Label>
                  <Select value={etapaMudancaGlobal} onValueChange={setEtapaMudancaGlobal}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Escolha a etapa atual" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set(etapasUnicas)].map(etapa => (
                        <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Para qual etapa?</Label>
                  <Select 
                    onValueChange={(newEtapa) => handleMudarEtapaGlobal(newEtapa)}
                    disabled={!etapaMudancaGlobal || isMudandoEtapaGlobal}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Escolha a nova etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...new Set(etapasUnicas)].filter(e => e !== etapaMudancaGlobal).map(etapa => (
                        <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Button onClick={() => handleOpenModal()}>
            <PlusCircle className="w-4 h-4 mr-2" />
            Nova Atividade de Projeto
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 p-4 bg-white rounded-lg border shadow-sm">
        <div className="relative flex-grow min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Buscar por descrição, origem, status..."
            className="pl-10"
            onChange={(e) => debouncedSetSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <Select value={filters.etapa} onValueChange={(value) => setFilters(prev => ({ ...prev, etapa: value }))}>
                <SelectTrigger className="w-auto md:w-48"><SelectValue placeholder="Filtrar por Etapa" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todas as Etapas</SelectItem>
                    {[...new Set(etapasUnicas)].map(etapa => <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <Select value={filters.disciplina} onValueChange={(value) => setFilters(prev => ({ ...prev, disciplina: value }))}>
                <SelectTrigger className="w-auto md:w-48"><SelectValue placeholder="Filtrar por Disciplina" /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todas as Disciplinas</SelectItem>
                    {disciplinas.map(d => <SelectItem key={d.id} value={d.nome}>{d.nome}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
      </div>
      
      {renderContent()}

      {isModalOpen && (
        <AtividadeFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          empreendimentoId={empreendimentoId}
          disciplinas={disciplinas}
          atividade={selectedAtividade}
          onSuccess={() => {
            setIsModalOpen(false);
            fetchData();
            if(onUpdate) onUpdate();
          }}
        />
      )}

      <EtapaEditModal isOpen={isEtapaModalOpen} onClose={() => setIsEtapaModalOpen(false)} atividade={selectedAtividade} documentos={documentos} onSave={handleSaveEtapa} empreendimento={empreendimentoObj} />

      <EditarEtapaEmFolhasModal isOpen={isEditarEtapaEmFolhasModalOpen} onClose={() => { setIsEditarEtapaEmFolhasModalOpen(false); setSelectedAtividade(null); }} atividade={selectedAtividade} documentos={documentos} empreendimentoId={empreendimentoId} empreendimento={empreendimentoObj} onSuccess={() => { fetchData(); if (onUpdate) onUpdate(); }} />

      <ExcluirDeFolhasModal
        isOpen={isExcluirDeFolhasModalOpen}
        onClose={() => {
          setIsExcluirDeFolhasModalOpen(false);
          setSelectedAtividade(null);
        }}
        atividade={selectedAtividade}
        documentos={documentos}
        empreendimentoId={empreendimentoId}
        onSuccess={() => {
          fetchData();
          if (onUpdate) onUpdate();
        }}
      />

      {isPlanejamentoModalOpen && atividadeParaPlanejar && (
        <PlanejamentoAtividadeModal
          isOpen={isPlanejamentoModalOpen}
          onClose={() => {
            setIsPlanejamentoModalOpen(false);
            setAtividadeParaPlanejar(null);
          }}
          atividade={atividadeParaPlanejar}
          empreendimentoId={empreendimentoId}
          documentos={documentos}
          usuarios={usuarios}
          onSuccess={handlePlanejarComplete}
        />
      )}
    </div>
  );
}