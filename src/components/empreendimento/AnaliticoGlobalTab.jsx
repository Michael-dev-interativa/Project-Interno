import { useState, useEffect, useMemo, useCallback } from 'react';
import { Atividade, Disciplina, PlanejamentoAtividade, Documento, AlteracaoEtapa, Empreendimento, Usuario, AtividadesDoProjeto } from '@/entities/all';

const PlanejamentoDocumento = base44.entities.PlanejamentoDocumento;
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
import PDFListaDesenvolvimento from '../configuracoes/PDFListaDesenvolvimento';
import { getNextWorkingDay, distribuirHorasPorDias, isWorkingDay, calculateEndDate, ensureWorkingDay } from '../utils/DateCalculator';
import { format, isValid, parseISO, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export default function AnaliticoGlobalTab({ empreendimentoId, onUpdate }) {
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

  const documentosMap = useMemo(() => {
    return new Map((documentos || []).map(doc => [doc.id, doc]));
  }, [documentos]);

  const [planejamentos, setPlanejamentos] = useState([]);

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
        pavimentosData
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
        retryWithBackoff(() => base44.entities.Pavimento.filter({ empreendimento_id: empreendimentoId }), 3, 500, 'fetchPavimentos')
      ]);

      setDocumentos(documentosData || []);
      setEmpreendimentoNome((empreendimentoData && empreendimentoData.length > 0 && empreendimentoData[0]?.nome) || "");
      setAlteracoesEtapa(alteracoesData || []);
      setUsuarios(usuariosData || []);
      setPlanejamentos(planejamentosData || []);
      setAllEmpreendimentos(todosEmpreendimentos || []);
      
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
      const empreendimento = (empreendimentoData && empreendimentoData.length > 0 && empreendimentoData[0]) || null;
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

  const handleRestaurarExclusoesGlobais = async () => {
    if (!window.confirm("Tem certeza que deseja RESTAURAR todas as atividades que foram excluídas globalmente por engano?\n\nIsso irá remover todos os marcadores de exclusão global (documento_id = null) e as atividades voltarão a aparecer em TODOS os documentos.")) {
      return;
    }

    setIsRestoringGlobal(true);

    try {
      console.log("🔄 Buscando marcadores de exclusão global...");
      
      const marcadoresGlobais = await retryWithBackoff(
        () => Atividade.filter({
          empreendimento_id: empreendimentoId,
          tempo: -999,
          documento_id: null
        }),
        3, 1000, 'buscarMarcadoresGlobais'
      );

      if (!marcadoresGlobais || marcadoresGlobais.length === 0) {
        alert("Nenhum marcador de exclusão global encontrado. Todas as atividades já estão disponíveis!");
        return;
      }

      console.log(`✅ Encontrados ${marcadoresGlobais.length} marcadores globais a serem removidos:`, marcadoresGlobais);

      let deletados = 0;
      let erros = 0;

      for (const marcador of marcadoresGlobais) {
        try {
          await retryWithBackoff(
            () => Atividade.delete(marcador.id),
            3, 500, `deleteMarcadorGlobal-${marcador.id}`
          );
          deletados++;
          console.log(`✅ Marcador ${marcador.id} deletado (atividade "${marcador.atividade}")`);
        } catch (error) {
          erros++;
          console.error(`❌ Erro ao deletar marcador ${marcador.id}:`, error);
        }
      }

      console.log(`\n✅ Processo concluído:`);
      console.log(`   Deletados: ${deletados}`);
      console.log(`   Erros: ${erros}`);

      if (erros === 0) {
        alert(`✅ Sucesso! ${deletados} atividade(s) foram restauradas e agora estão disponíveis em todos os documentos.`);
      } else {
        alert(`⚠️ Processo concluído com avisos:\n${deletados} restauradas\n${erros} erros\n\nAtualize a página para ver as mudanças.`);
      }

      fetchData();
      if (onUpdate) onUpdate();

    } catch (error) {
      console.error("❌ Erro ao restaurar exclusões globais:", error);
      alert("Erro ao restaurar atividades. Tente novamente.");
    } finally {
      setIsRestoringGlobal(false);
    }
  };


  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          <p className="ml-4 text-gray-600">Carregando catálogo de atividades...</p>
        </div>
      );
    }

    if (atividadesAgrupadas.length === 0 && !isLoading) {
      return (
        <div className="text-center py-16 px-6 bg-gray-50 rounded-lg">
          <PackageOpen className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-800">Catálogo Vazio</h3>
          <p className="text-gray-500 mt-2 mb-6">Nenhuma atividade encontrada para este empreendimento (verificando atividades do projeto e das folhas).</p>
          <Button onClick={() => handleOpenModal()}>
            <PlusCircle className="w-4 h-4 mr-2" />
            Criar Atividade de Projeto
          </Button>
        </div>
      );
    }

    const editableActivities = atividadesAgrupadas.filter(grupo => grupo.baseAtividade.isEditable);
    const nonEditableActivities = atividadesAgrupadas.filter(grupo => !grupo.baseAtividade.isEditable);
    const hasCheckboxColumn = editableActivities.length > 0;

    return (
      <div className="space-y-6">
        {editableActivities.length > 0 && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm">
            <div className="flex items-center gap-3">
              <Checkbox
                id="selectAll"
                checked={selectedIds.size === editableActivities.length && editableActivities.length > 0}
                onCheckedChange={handleSelectAll}
                disabled={editableActivities.length === 0 || isDeletingMultiple}
              />
              <label htmlFor="selectAll" className="text-sm font-medium text-gray-700 cursor-pointer">
                Selecionar todas as {editableActivities.length} atividades de projeto
              </label>
            </div>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={isDeletingMultiple}
              >
                {isDeletingMultiple ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Selecionadas ({selectedIds.size})
                  </>
                )}
              </Button>
            )}
          </div>
        )}
        
        {atividadesSelecionadasParaPlanejar.size > 0 && (
          <div className="flex items-center justify-between p-4 border-2 border-blue-500 rounded-lg bg-blue-50 shadow-sm">
            <div className="flex items-center gap-3">
              <Badge className="bg-blue-600 text-white">
                {atividadesSelecionadasParaPlanejar.size} atividade{atividadesSelecionadasParaPlanejar.size > 1 ? 's' : ''} selecionada{atividadesSelecionadasParaPlanejar.size > 1 ? 's' : ''}
              </Badge>
              <span className="text-sm text-gray-700">
                Selecione executor e data para planejar em lote
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAtividadesSelecionadasParaPlanejar(new Set())}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {atividadesSelecionadasParaExcluir.size > 0 && (
           <div className="flex items-center justify-between p-4 border-2 border-red-500 rounded-lg bg-red-50 shadow-sm">
             <div className="flex items-center gap-3">
               <Badge className="bg-red-600 text-white">
                 {atividadesSelecionadasParaExcluir.size} atividade{atividadesSelecionadasParaExcluir.size > 1 ? 's' : ''} selecionada{atividadesSelecionadasParaExcluir.size > 1 ? 's' : ''}
               </Badge>
               <span className="text-sm text-gray-700">
                 Excluir selecionadas
               </span>
             </div>
             <div className="flex gap-2">
               <Button 
                 onClick={() => handleExcluirMultiplas()}
                 className="bg-red-600 hover:bg-red-700"
                 disabled={isExcluindoMultiplasFolhas}
                 size="sm"
               >
                 <Trash2 className="w-4 h-4 mr-2" />
                 Excluir do Empreendimento
               </Button>
               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => setAtividadesSelecionadasParaExcluir(new Set())}
               >
                 Cancelar
               </Button>
             </div>
           </div>
         )}

        {atividadesPorDisciplina.map(([disciplina, grupos]) => {
          const isDocumentacao = ['Planejamento', 'Gestão', 'BIM', 'Apoio', 'Coordenação'].includes(disciplina);
          const subdisciplinasMap = isDocumentacao ? grupos : null;
          const atividadesList = isDocumentacao ? null : grupos;
          
          return (
          <div key={disciplina} className="border rounded-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b">
              <h3 className="font-semibold text-lg text-gray-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-blue-600 rounded-full"></div>
                {disciplina}
                <Badge variant="secondary" className="ml-2">
                  {isDocumentacao 
                    ? Object.values(subdisciplinasMap).flat().length 
                    : atividadesList.length
                  } {isDocumentacao 
                    ? Object.values(subdisciplinasMap).flat().length === 1 ? 'atividade' : 'atividades'
                    : atividadesList.length === 1 ? 'atividade' : 'atividades'
                  }
                </Badge>
              </h3>
            </div>
            <div className="overflow-x-auto">
              {isDocumentacao ? (
                // Mostrar subdisciplinas para disciplinas de documentação
                <div className="space-y-4 p-4">
                  {Object.entries(subdisciplinasMap)
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([subdisciplina, atividadesSubgrupo]) => (
                    <div key={subdisciplina} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 border-b">
                        <h4 className="font-medium text-sm text-gray-700">
                          {subdisciplina} ({atividadesSubgrupo.length})
                        </h4>
                      </div>
                      <Table className="text-sm">
                        <TableHeader className="bg-white">
                          <TableRow>
                            {hasCheckboxColumn && <TableHead className="w-[50px]"></TableHead>}
                            <TableHead className="w-[50px]">
                              <Checkbox
                                checked={atividadesSelecionadasParaExcluir.size > 0 && 
                                         atividadesSubgrupo.every(grupo => atividadesSelecionadasParaExcluir.has(grupo.baseAtividade.base_atividade_id || grupo.baseAtividade.id))}
                                onCheckedChange={(checked) => {
                                  const ids = atividadesSubgrupo.map(g => g.baseAtividade.base_atividade_id || g.baseAtividade.id);
                                  setAtividadesSelecionadasParaExcluir(prev => {
                                    const newSet = new Set(prev);
                                    ids.forEach(id => {
                                      if (checked) newSet.add(id);
                                      else newSet.delete(id);
                                    });
                                    return newSet;
                                  });
                                }}
                              />
                            </TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Atividade</TableHead>
                            <TableHead>Folhas</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Etapa</TableHead>
                            <TableHead>Executor</TableHead>
                            <TableHead>Datas Planejadas</TableHead>
                            <TableHead>Tempo Padrão</TableHead>
                            <TableHead>Tempo Total</TableHead>
                            <TableHead className="text-center w-[120px]">Ações</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {atividadesSubgrupo.map(grupo => {
                            const ativ = grupo.baseAtividade;
                            const key = `${ativ.base_atividade_id}-${ativ.etapa}-${ativ.disciplina}-${ativ.subdisciplina}`;
                            const isExpanded = expandedAtividades[key];
                            const genericAtividadeIdToExclude = ativ.base_atividade_id || ativ.id;
                            const isDeleting = isDeletingActivity[genericAtividadeIdToExclude];

                            return (
                              <>
                                <TableRow key={key} className="hover:bg-gray-50">
                                   {hasCheckboxColumn && (
                                     <TableCell>
                                       {ativ.isEditable && (
                                         <Checkbox
                                           checked={selectedIds.has(ativ.uniqueId)}
                                           onCheckedChange={() => handleSelectItem(ativ.uniqueId)}
                                           disabled={isDeletingMultiple}
                                         />
                                       )}
                                     </TableCell>
                                   )}
                                   <TableCell>
                                      {!ativ.isEditable && <Checkbox checked={atividadesSelecionadasParaExcluir.has(ativ.base_atividade_id || ativ.id)} onCheckedChange={(checked) => { setAtividadesSelecionadasParaExcluir(prev => { const newSet = new Set(prev); const id = ativ.base_atividade_id || ativ.id; if (checked) newSet.add(id); else newSet.delete(id); return newSet; }); }} />}
                                    </TableCell>
                                   
                                  <TableCell>
                                    {grupo.folhas.length > 0 && (
                                      <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => toggleAtividadeExpansion(key)}
                                        className="h-8 w-8"
                                      >
                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                      </Button>
                                    )}
                                  </TableCell>
                                  <TableCell className="font-medium text-sm">
                                    <div>{String(ativ.atividade || '')}</div>
                                    {ativ.subdisciplina && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{ativ.subdisciplina}</span>}
                                  </TableCell>
                                  <TableCell><Badge variant="outline">{grupo.folhas.length} {grupo.folhas.length === 1 ? 'folha' : 'folhas'}</Badge></TableCell>
                                  <TableCell>
                                    {grupo.folhas.length === 0 ? (
                                      ativ.source === 'Projeto' ? <Badge>Projeto</Badge> : ativ.status === 'Concluída' ? <Badge className="bg-blue-600 text-white flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Concluída</Badge> : ativ.status === 'Planejada' ? <Badge className="bg-green-600 text-white flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Planejada</Badge> : <Badge variant="secondary">Disponível</Badge>
                                    ) : (<div className="flex gap-1">{grupo.folhas.some(f=>f.status==='Concluída')&&<Badge className="bg-blue-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Concluída</Badge>}{grupo.folhas.some(f=>f.status==='Planejada')&&<Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Planejada</Badge>}{grupo.folhas.some(f=>f.status==='Disponível')&&<Badge variant="outline" className="text-gray-600">Disponível</Badge>}</div>)}
                                    </TableCell>
                                  <TableCell className="text-sm">
                                    <button onClick={() => handleOpenEtapaModal(ativ)} className="text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer" title="Clique para editar a etapa">{ativ.etapa}</button>
                                  </TableCell>
                                  <TableCell>
                                    <div className="w-[210px]">
                                    {ativ.executor_principal ? (
                                      <div className="flex items-center justify-between p-1 bg-green-50 border border-green-200 rounded">
                                        <div className="flex items-center gap-1">
                                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                          <span className="text-xs font-medium text-green-800">
                                            {usuarios.find(u => u.email === ativ.executor_principal)?.nome || ativ.executor_principal}
                                          </span>
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleSaveExecutor(ativ, "")}
                                          className="text-xs text-red-600 hover:text-red-700 h-6"
                                          disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                        >
                                          Remover
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex gap-1">
                                        <Checkbox
                                          checked={atividadesSelecionadasParaPlanejar.has(genericAtividadeIdToExclude)}
                                          onCheckedChange={(checked) => {
                                            setAtividadesSelecionadasParaPlanejar(prev => {
                                              const newSet = new Set(prev);
                                              if (checked) {
                                                newSet.add(genericAtividadeIdToExclude);
                                              } else {
                                                newSet.delete(genericAtividadeIdToExclude);
                                              }
                                              return newSet;
                                            });
                                          }}
                                          disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                        />
                                        <Select
                                          onValueChange={(value) => {
                                            if (atividadesSelecionadasParaPlanejar.size > 0 && atividadesSelecionadasParaPlanejar.has(genericAtividadeIdToExclude)) {
                                              handlePlanejarMultiplas(value, datasInicio[genericAtividadeIdToExclude]);
                                            } else {
                                              handleSaveExecutor(ativ, value, datasInicio[genericAtividadeIdToExclude]);
                                            }
                                          }}
                                          disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                        >
                                          <SelectTrigger className="w-full text-xs h-7 border-blue-500 text-blue-600 hover:bg-blue-50">
                                            <Users2 className="w-3 h-3 mr-1" />
                                            <SelectValue placeholder="Selecionar Executor" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {usuarios
                                              .filter(u => u.status === 'ativo')
                                              .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
                                              .map(u => (
                                                <SelectItem key={u.email} value={u.email} className="text-xs">
                                                  {u.nome || u.email}
                                                </SelectItem>
                                              ))}
                                          </SelectContent>
                                        </Select>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="icon"
                                              className={`h-7 w-7 ${datasInicio[genericAtividadeIdToExclude] ? 'border-green-500 text-green-600' : ''}`}
                                              disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                            >
                                              <Calendar className="w-3 h-3" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarComponent
                                              mode="single"
                                              selected={datasInicio[genericAtividadeIdToExclude]}
                                              onSelect={(date) => setDatasInicio(prev => ({ ...prev, [genericAtividadeIdToExclude]: date }))}
                                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                              locale={ptBR}
                                            />
                                            {datasInicio[genericAtividadeIdToExclude] && (
                                              <div className="p-2 border-t">
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => setDatasInicio(prev => ({ ...prev, [genericAtividadeIdToExclude]: null }))}
                                                  className="w-full text-xs"
                                                >
                                                  Limpar Data
                                                </Button>
                                              </div>
                                            )}
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    )}
                                    {isSavingExecutor[genericAtividadeIdToExclude] && (
                                      <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Planejando...
                                      </div>
                                    )}
                                    </div>
                                    </TableCell>
                                      <TableCell>
                                        {datasInicio[genericAtividadeIdToExclude] ? (
                                          <div className="flex items-center gap-1 text-blue-600 text-xs">
                                            <Calendar className="w-3 h-3" />
                                            <span>Início: {format(datasInicio[genericAtividadeIdToExclude], 'dd/MM/yyyy')}</span>
                                          </div>
                                        ) : grupo.folhas.some(f => f.status === 'Planejada') ? (
                                          (() => {
                                            const folhasPlanejadas = grupo.folhas.filter(f => f.status === 'Planejada');
                                            const planejamentosComDatas = folhasPlanejadas
                                              .map(f => planejamentos?.find(p => 
                                                p.documento_id === f.source_documento_id && 
                                                p.atividade_id === f.base_atividade_id
                                              ))
                                              .filter(p => p?.inicio_planejado && p?.termino_planejado);

                                            if (planejamentosComDatas.length > 0) {
                                              const datas = planejamentosComDatas.map(p => ({
                                                inicio: parseISO(p.inicio_planejado),
                                                termino: parseISO(p.termino_planejado)
                                              }));

                                              const dataInicio = datas.reduce((min, d) => d.inicio < min ? d.inicio : min, datas[0].inicio);
                                              const dataTermino = datas.reduce((max, d) => d.termino > max ? d.termino : max, datas[0].termino);

                                              return (
                                                <div className="flex items-center gap-1 text-gray-600 text-xs">
                                                  <Calendar className="w-3 h-3" />
                                                  <span>{format(dataInicio, 'dd/MM')} - {format(dataTermino, 'dd/MM')}</span>
                                                </div>
                                              );
                                            }
                                            return <span className="text-xs text-gray-400">-</span>;
                                          })()
                                        ) : (
                                          <span className="text-xs text-gray-400">-</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-sm">{ativ.tempo ? `${Number(ativ.tempo).toFixed(1)}h` : '-'}</TableCell>
                                      <TableCell className="text-sm font-semibold text-blue-600">
                                    {grupo.folhas.length > 0 
                                      ? `${grupo.folhas.reduce((sum, f) => sum + (Number(f.tempo) || 0), 0).toFixed(1)}h`
                                      : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {!ativ.isEditable && (
                                      <div className="flex items-center gap-2 justify-center">
                                        <Button 
                                          size="icon" 
                                          onClick={() => handleOpenEditarEtapaEmFolhasModal(ativ)}
                                          variant="outline"
                                          className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                          title="Editar Etapa"
                                        >
                                          <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button 
                                          size="icon" 
                                          onClick={() => handleConcluirEmTodasFolhas(ativ)}
                                          variant="outline"
                                          className="border-green-500 text-green-600 hover:bg-green-50"
                                          disabled={isConcluindo[genericAtividadeIdToExclude]}
                                          title="Concluir em Todas as Folhas"
                                        >
                                          {isConcluindo[genericAtividadeIdToExclude] ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                          ) : (
                                            <CheckCircle className="w-4 h-4" />
                                          )}
                                        </Button>
                                        <Button 
                                          size="icon" 
                                          onClick={() => handleOpenExcluirDeFolhasModal(ativ)}
                                          variant="outline"
                                          className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                          disabled={isDeleting}
                                          title="Excluir de Folhas Específicas"
                                        >
                                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileX className="w-4 h-4" />}
                                        </Button>
                                        <Button 
                                          size="icon" 
                                          onClick={() => handleExcluirAtividade(ativ)}
                                          variant="outline"
                                          className="border-red-500 text-red-600 hover:bg-red-50 shadow-sm"
                                          disabled={isDeleting}
                                          title="Excluir de Todas as Folhas do Empreendimento"
                                        >
                                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </Button>
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" disabled={isDeleting || isDeletingMultiple}>
                                          {isDeleting || isDeletingMultiple ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent>
                                        {ativ.isEditable ? (
                                          <>
                                            <DropdownMenuItem onClick={() => handleOpenModal(ativ)}>
                                              <Edit className="w-4 h-4 mr-2" /> Editar Atividade
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleDelete(ativ.id)} className="text-red-600">
                                              <Trash2 className="w-4 h-4 mr-2" /> Excluir Atividade de Projeto
                                            </DropdownMenuItem>
                                          </>
                                        ) : (
                                          <>
                                            <DropdownMenuItem onClick={() => handleOpenEtapaModal(ativ)}>
                                              <Layers className="w-4 h-4 mr-2 text-blue-600" /> Editar Etapa (Empreendimento)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                              onClick={() => handleOpenEditarEtapaEmFolhasModal(ativ)} 
                                              className="text-blue-600"
                                            >
                                              <Edit2 className="w-4 h-4 mr-2" /> Editar Etapa em Folhas Específicas
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && grupo.folhas.map(folha => (
                                  <TableRow key={folha.uniqueId} className="bg-blue-50/50">
                                    {hasCheckboxColumn && <TableCell></TableCell>}
                                    <TableCell className="pl-12">
                                      <ChevronRight className="w-3 h-3 text-gray-400 inline mr-1" />
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-600">
                                      {folha.source_documento_numero} - {folha.source_documento_arquivo}
                                    </TableCell>
                                    <TableCell></TableCell>
                                    <TableCell>
                                      {folha.status === 'Concluída' ? <Badge className="bg-blue-600 text-white font-semibold flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3"/>Concluída</Badge> : folha.status === 'Planejada' ? <Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3"/>Planejada</Badge> : <Badge variant="outline" className="text-xs text-gray-600">{folha.status}</Badge>}
                                    </TableCell>
                                    <TableCell className="text-sm text-gray-500">{folha.etapa}</TableCell>
                                    <TableCell></TableCell>
                                    <TableCell>
                                      {folha.status === 'Planejada' ? (
                                        (() => {
                                          const planejamento = planejamentos?.find(p => 
                                            p.documento_id === folha.source_documento_id && 
                                            p.atividade_id === folha.base_atividade_id
                                          );

                                          if (planejamento?.inicio_planejado && planejamento?.termino_planejado) {
                                            return (
                                              <div className="flex items-center gap-1 text-gray-600 text-xs">
                                                <Calendar className="w-3 h-3" />
                                                <span>{format(parseISO(planejamento.inicio_planejado), 'dd/MM')} - {format(parseISO(planejamento.termino_planejado), 'dd/MM')}</span>
                                              </div>
                                            );
                                          }
                                          return <span className="text-xs text-gray-400">-</span>;
                                        })()
                                      ) : (
                                        <span className="text-xs text-gray-400">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-sm">{folha.tempo ? `${Number(folha.tempo).toFixed(1)}h` : '-'}</TableCell>
                                      <TableCell className="text-sm">{folha.tempo ? `${Number(folha.tempo).toFixed(1)}h` : '-'}</TableCell>
                                      <TableCell>
                                        <Checkbox
                                          checked={atividadesSelecionadasParaExcluir.has(folha.base_atividade_id || folha.id)}
                                          onCheckedChange={(checked) => {
                                            setAtividadesSelecionadasParaExcluir(prev => {
                                              const newSet = new Set(prev);
                                              const id = folha.base_atividade_id || folha.id;
                                              if (checked) {
                                                newSet.add(id);
                                              } else {
                                                newSet.delete(id);
                                              }
                                              return newSet;
                                            });
                                          }}
                                        />
                                      </TableCell>
                                      <TableCell></TableCell>
                                    </TableRow>
                                    ))}
                                    </>
                                    );
                                    })}
                                    </TableBody>
                                    </Table>
                      </div>
                      ))}
                      </div>
                      ) : (
                      <Table>
                      <TableHeader className="bg-gray-50">
                        <TableRow>
                           {hasCheckboxColumn && <TableHead className="w-[50px]"></TableHead>}
                           <TableHead className="w-[50px]">
                             <Checkbox
                               checked={atividadesSelecionadasParaExcluir.size > 0 && 
                                        grupos.every(grupo => atividadesSelecionadasParaExcluir.has(grupo.baseAtividade.base_atividade_id || grupo.baseAtividade.id))}
                               onCheckedChange={(checked) => {
                                 const ids = grupos.map(g => g.baseAtividade.base_atividade_id || g.baseAtividade.id);
                                 setAtividadesSelecionadasParaExcluir(prev => {
                                   const newSet = new Set(prev);
                                   ids.forEach(id => {
                                     if (checked) newSet.add(id);
                                     else newSet.delete(id);
                                   });
                                   return newSet;
                                 });
                               }}
                             />
                           </TableHead>
                           <TableHead className="w-[50px]"></TableHead>
                           <TableHead>Atividade</TableHead>
                     <TableHead>Folhas</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead>Etapa</TableHead>
                     <TableHead>Executor</TableHead>
                     <TableHead>Datas Planejadas</TableHead>
                     <TableHead>Tempo Padrão</TableHead>
                     <TableHead>Tempo Total</TableHead>
                     <TableHead className="text-center w-[120px]">Ações</TableHead>
                     <TableHead className="w-[50px]"></TableHead>
                   </TableRow>
                </TableHeader>
                <TableBody>
                  {grupos.map(grupo => {
                    const ativ = grupo.baseAtividade;
                    const key = `${ativ.base_atividade_id}-${ativ.etapa}-${ativ.disciplina}-${ativ.subdisciplina}`;
                    const isExpanded = expandedAtividades[key];
                    const genericAtividadeIdToExclude = ativ.base_atividade_id || ativ.id;
                    const uniqueKey = ativ.source_documento_id ? `${genericAtividadeIdToExclude}-${ativ.source_documento_id}` : genericAtividadeIdToExclude;
                    const isDeleting = isDeletingActivity[uniqueKey] || isDeletingActivity[genericAtividadeIdToExclude];

                    return (
                      <>
                        <TableRow key={key} className="hover:bg-gray-50">
                          {hasCheckboxColumn && (<TableCell>{ativ.isEditable && (<Checkbox checked={selectedIds.has(ativ.uniqueId)} onCheckedChange={() => handleSelectItem(ativ.uniqueId)} disabled={isDeletingMultiple} />)}</TableCell>)}
                          <TableCell>{!ativ.isEditable && <Checkbox checked={atividadesSelecionadasParaExcluir.has(ativ.base_atividade_id || ativ.id)} onCheckedChange={(checked) => { setAtividadesSelecionadasParaExcluir(prev => { const ns = new Set(prev); const id = ativ.base_atividade_id || ativ.id; if (checked) ns.add(id); else ns.delete(id); return ns; }); }} />}</TableCell>
                          <TableCell>{grupo.folhas.length > 0 && (<Button variant="ghost" size="icon" onClick={() => toggleAtividadeExpansion(key)} className="h-8 w-8">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</Button>)}</TableCell>
                          <TableCell className="font-medium">
                            <div>{String(ativ.atividade || '')}</div>
                            {ativ.subdisciplina && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{ativ.subdisciplina}</span>}
                          </TableCell>
                          <TableCell><Badge variant="outline">{grupo.folhas.length} {grupo.folhas.length === 1 ? 'folha' : 'folhas'}</Badge></TableCell>
                          <TableCell>
                            {grupo.folhas.length === 0 ? (
                              ativ.source === 'Projeto' ? <Badge>Projeto</Badge> : ativ.status === 'Concluída' ? <Badge className="bg-blue-600 text-white flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Concluída</Badge> : ativ.status === 'Planejada' ? <Badge className="bg-green-600 text-white flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Planejada</Badge> : <Badge variant="secondary">Disponível</Badge>
                            ) : (<div className="flex gap-1">{grupo.folhas.some(f=>f.status==='Concluída')&&<Badge className="bg-blue-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Concluída</Badge>}{grupo.folhas.some(f=>f.status==='Planejada')&&<Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit"><CheckCircle2 className="w-4 h-4"/>Planejada</Badge>}{grupo.folhas.some(f=>f.status==='Disponível')&&<Badge variant="outline" className="text-gray-600">Disponível</Badge>}</div>)}
                            </TableCell>
                          <TableCell>
                            <button onClick={() => handleOpenEtapaModal(ativ)} className="text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer" title="Clique para editar a etapa">{ativ.etapa}</button>
                          </TableCell>
                          <TableCell>
                            <div className="w-[210px]">
                              {ativ.executor_principal ? (
                                <div className="flex items-center justify-between p-1 bg-green-50 border border-green-200 rounded">
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span className="text-xs font-medium text-green-800">
                                      {usuarios.find(u => u.email === ativ.executor_principal)?.nome || ativ.executor_principal}
                                    </span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSaveExecutor(ativ, "")}
                                    className="text-xs text-red-600 hover:text-red-700 h-6"
                                    disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                  >
                                    Remover
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <Checkbox
                                    checked={atividadesSelecionadasParaPlanejar.has(genericAtividadeIdToExclude)}
                                    onCheckedChange={(checked) => {
                                      setAtividadesSelecionadasParaPlanejar(prev => {
                                        const newSet = new Set(prev);
                                        if (checked) {
                                          newSet.add(genericAtividadeIdToExclude);
                                        } else {
                                          newSet.delete(genericAtividadeIdToExclude);
                                        }
                                        return newSet;
                                      });
                                    }}
                                    disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                  />
                                  <Select
                                    onValueChange={(value) => {
                                      if (atividadesSelecionadasParaPlanejar.size > 0 && atividadesSelecionadasParaPlanejar.has(genericAtividadeIdToExclude)) {
                                        handlePlanejarMultiplas(value, datasInicio[genericAtividadeIdToExclude]);
                                      } else {
                                        handleSaveExecutor(ativ, value, datasInicio[genericAtividadeIdToExclude]);
                                      }
                                    }}
                                    disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                  >
                                    <SelectTrigger className="w-full text-xs h-7 border-blue-500 text-blue-600 hover:bg-blue-50">
                                      <Users2 className="w-3 h-3 mr-1" />
                                      <SelectValue placeholder="Selecionar Executor" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {usuarios
                                        .filter(u => u.status === 'ativo')
                                        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
                                        .map(u => (
                                          <SelectItem key={u.email} value={u.email} className="text-xs">
                                            {u.nome || u.email}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="icon"
                                        className={`h-7 w-7 ${datasInicio[genericAtividadeIdToExclude] ? 'border-green-500 text-green-600' : ''}`}
                                        disabled={isSavingExecutor[genericAtividadeIdToExclude]}
                                      >
                                        <Calendar className="w-3 h-3" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent
                                        mode="single"
                                        selected={datasInicio[genericAtividadeIdToExclude]}
                                        onSelect={(date) => setDatasInicio(prev => ({ ...prev, [genericAtividadeIdToExclude]: date }))}
                                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                        locale={ptBR}
                                      />
                                      {datasInicio[genericAtividadeIdToExclude] && (
                                        <div className="p-2 border-t">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDatasInicio(prev => ({ ...prev, [genericAtividadeIdToExclude]: null }))}
                                            className="w-full text-xs"
                                          >
                                            Limpar Data
                                          </Button>
                                        </div>
                                      )}
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              )}
                              {isSavingExecutor[genericAtividadeIdToExclude] && (
                                <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Planejando...
                                </div>
                              )}
                            </div>
                            </TableCell>
                            <TableCell>
                              {datasInicio[genericAtividadeIdToExclude] ? (
                                <div className="flex items-center gap-1 text-blue-600 text-xs">
                                  <Calendar className="w-3 h-3" />
                                  <span>Início: {format(datasInicio[genericAtividadeIdToExclude], 'dd/MM/yyyy')}</span>
                                </div>
                              ) : grupo.folhas.some(f => f.status === 'Planejada') ? (
                                (() => {
                                  const folhasPlanejadas = grupo.folhas.filter(f => f.status === 'Planejada');
                                  const planejamentosComDatas = folhasPlanejadas
                                    .map(f => planejamentos?.find(p => 
                                      p.documento_id === f.source_documento_id && 
                                      p.atividade_id === f.base_atividade_id
                                    ))
                                    .filter(p => p?.inicio_planejado && p?.termino_planejado);

                                  if (planejamentosComDatas.length > 0) {
                                    const datas = planejamentosComDatas.map(p => ({
                                      inicio: parseISO(p.inicio_planejado),
                                      termino: parseISO(p.termino_planejado)
                                    }));

                                    const dataInicio = datas.reduce((min, d) => d.inicio < min ? d.inicio : min, datas[0].inicio);
                                    const dataTermino = datas.reduce((max, d) => d.termino > max ? d.termino : max, datas[0].termino);

                                    return (
                                      <div className="flex items-center gap-1 text-gray-600 text-xs">
                                        <Calendar className="w-3 h-3" />
                                        <span>{format(dataInicio, 'dd/MM')} - {format(dataTermino, 'dd/MM')}</span>
                                      </div>
                                    );
                                  }
                                  return <span className="text-xs text-gray-400">-</span>;
                                })()
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {editandoTempo[genericAtividadeIdToExclude] ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={novosTempoPadrao[genericAtividadeIdToExclude] ?? ativ.tempo ?? 0}
                                    onChange={(e) => setNovosTempoPadrao(prev => ({ ...prev, [genericAtividadeIdToExclude]: e.target.value }))}
                                    className="w-20 h-7 text-xs"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleSalvarTempoPadrao(ativ, genericAtividadeIdToExclude);
                                      } else if (e.key === 'Escape') {
                                        setEditandoTempo(prev => ({ ...prev, [genericAtividadeIdToExclude]: false }));
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleSalvarTempoPadrao(ativ, genericAtividadeIdToExclude)}
                                    className="h-7 w-7"
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setEditandoTempo(prev => ({ ...prev, [genericAtividadeIdToExclude]: false }))}
                                    className="h-7 w-7"
                                  >
                                    <XCircle className="w-4 h-4 text-gray-400" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditandoTempo(prev => ({ ...prev, [genericAtividadeIdToExclude]: true }));
                                    setNovosTempoPadrao(prev => ({ ...prev, [genericAtividadeIdToExclude]: ativ.tempo ?? 0 }));
                                  }}
                                  className="text-blue-600 hover:text-blue-800 hover:underline font-medium cursor-pointer"
                                  title="Clique para editar o tempo padrão"
                                >
                                  {ativ.tempo ? `${Number(ativ.tempo).toFixed(1)}h` : '-'}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="font-semibold text-blue-600">
                            {grupo.folhas.length > 0 
                              ? `${grupo.folhas.reduce((sum, f) => sum + (Number(f.tempo) || 0), 0).toFixed(1)}h`
                              : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {!ativ.isEditable && (
                              <div className="flex items-center gap-2 justify-center">
                                <Button 
                                  size="icon" 
                                  onClick={() => handleOpenEditarEtapaEmFolhasModal(ativ)}
                                  variant="outline"
                                  className="border-blue-500 text-blue-600 hover:bg-blue-50"
                                  title="Editar Etapa"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button 
                                  size="icon" 
                                  onClick={() => handleConcluirEmTodasFolhas(ativ)}
                                  variant="outline"
                                  className="border-green-500 text-green-600 hover:bg-green-50"
                                  disabled={isConcluindo[genericAtividadeIdToExclude]}
                                  title="Concluir em Todas as Folhas"
                                >
                                  {isConcluindo[genericAtividadeIdToExclude] ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button 
                                  size="icon" 
                                  onClick={() => handleOpenExcluirDeFolhasModal(ativ)}
                                  variant="outline"
                                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                  disabled={isDeleting}
                                  title="Excluir de Folhas Específicas"
                                >
                                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileX className="w-4 h-4" />}
                                </Button>
                                <Button 
                                  size="icon" 
                                  onClick={() => handleExcluirAtividade(ativ)}
                                  variant="outline"
                                  className="border-red-500 text-red-600 hover:bg-red-50 shadow-sm"
                                  disabled={isDeleting}
                                  title="Excluir de Todas as Folhas do Empreendimento"
                                >
                                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" disabled={isDeleting || isDeletingMultiple}>
                                  {isDeleting || isDeletingMultiple ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {ativ.isEditable ? (
                                  <>
                                    <DropdownMenuItem onClick={() => handleOpenModal(ativ)}>
                                      <Edit className="w-4 h-4 mr-2" /> Editar Atividade
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDelete(ativ.id)} className="text-red-600">
                                      <Trash2 className="w-4 h-4 mr-2" /> Excluir Atividade de Projeto
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <>
                                    <DropdownMenuItem onClick={() => handleOpenEtapaModal(ativ)}>
                                      <Layers className="w-4 h-4 mr-2 text-blue-600" /> Editar Etapa (Empreendimento)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem 
                                      onClick={() => handleOpenEditarEtapaEmFolhasModal(ativ)} 
                                      className="text-blue-600"
                                    >
                                      <Edit2 className="w-4 h-4 mr-2" /> Editar Etapa em Folhas Específicas
                                    </DropdownMenuItem>
                                  </>
                                  )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {isExpanded && grupo.folhas.map(folha => (
                          <TableRow key={folha.uniqueId} className="bg-blue-50/50">
                            {hasCheckboxColumn && <TableCell></TableCell>}
                            <TableCell className="pl-12">
                              <ChevronRight className="w-3 h-3 text-gray-400 inline mr-1" />
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {folha.source_documento_numero} - {folha.source_documento_arquivo}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell>
                              {folha.status === 'Concluída' ? <Badge className="bg-blue-600 text-white font-semibold flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3"/>Concluída</Badge> : folha.status === 'Planejada' ? <Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3"/>Planejada</Badge> : <Badge variant="outline" className="text-xs text-gray-600">{folha.status}</Badge>}
                            </TableCell>
                            <TableCell className="text-sm text-gray-500">{folha.etapa}</TableCell>
                            <TableCell></TableCell>
                            <TableCell>
                              {folha.status === 'Planejada' ? (
                                (() => {
                                  const planejamento = planejamentos?.find(p => 
                                    p.documento_id === folha.source_documento_id && 
                                    p.atividade_id === folha.base_atividade_id
                                  );

                                  if (planejamento?.inicio_planejado && planejamento?.termino_planejado) {
                                    return (
                                      <div className="flex items-center gap-1 text-gray-600 text-xs">
                                        <Calendar className="w-3 h-3" />
                                        <span>{format(parseISO(planejamento.inicio_planejado), 'dd/MM')} - {format(parseISO(planejamento.termino_planejado), 'dd/MM')}</span>
                                      </div>
                                    );
                                  }
                                  return <span className="text-xs text-gray-400">-</span>;
                                })()
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{folha.tempo ? `${Number(folha.tempo).toFixed(1)}h` : '-'}</TableCell>
                            <TableCell className="text-sm">{folha.tempo ? `${Number(folha.tempo).toFixed(1)}h` : '-'}</TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        ))}
                        </>
                        );
                        })}
                        </TableBody>
                        </Table>
                        )}
                        </div>
                        </div>
                        );
                        })}
      </div>
    );
  };

  const handleConcluirEmTodasFolhas = async (atividade) => {
    const atividadeId = atividade.base_atividade_id || atividade.id;
    
    if (!window.confirm(`Tem certeza que deseja CONCLUIR a atividade "${atividade.atividade}" em TODAS as folhas deste empreendimento?\n\nTodos os planejamentos relacionados serão marcados como concluídos.`)) {
      return;
    }
    
    setIsConcluindo(prev => ({ ...prev, [atividadeId]: true }));
    
    try {
      console.log(`\n✅ ========================================`);
      console.log(`✅ CONCLUINDO ATIVIDADE EM TODAS AS FOLHAS`);
      console.log(`✅ ========================================`);
      console.log(`   Atividade ID: ${atividadeId}`);
      console.log(`   Atividade: ${atividade.atividade}`);
      console.log(`   Empreendimento: ${empreendimentoId}`);
      
      // Buscar todos os planejamentos desta atividade
      const planejamentos = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({
          empreendimento_id: empreendimentoId,
          atividade_id: atividadeId
        }),
        3, 500, `getConcluirPlanejamentos-${atividadeId}`
      );
      
      console.log(`   📊 Total de planejamentos encontrados: ${planejamentos.length}`);
      
      const hoje = format(new Date(), 'yyyy-MM-dd');
      let concluidos = 0;
      let jaFinalizados = 0;
      
      // Se não há planejamentos, criar um para cada folha com status concluído
      if (planejamentos.length === 0) {
        console.log(`   ℹ️ Nenhum planejamento encontrado. Criando planejamentos concluídos para cada folha...`);
        
        const atividadeOriginalArr = await retryWithBackoff(
          () => Atividade.filter({ id: atividadeId }),
          3, 500, `getOriginalActivity-${atividadeId}`
        );
        
        if (!atividadeOriginalArr || atividadeOriginalArr.length === 0) {
          throw new Error("Atividade original não encontrada.");
        }
        
        const atividadeOriginal = atividadeOriginalArr[0];
        const documentosComAtividade = documentos.filter(doc => {
          const disciplinaMatch = doc.disciplina === atividadeOriginal.disciplina;
          const subdisciplinasDoc = doc.subdisciplinas || [];
          const subdisciplinaMatch = subdisciplinasDoc.includes(atividadeOriginal.subdisciplina);
          return disciplinaMatch && subdisciplinaMatch;
        });
        
        console.log(`   📋 Criando planejamentos para ${documentosComAtividade.length} folha(s)...`);
        
        for (const doc of documentosComAtividade) {
          await retryWithBackoff(
            () => PlanejamentoAtividade.create({
              empreendimento_id: empreendimentoId,
              atividade_id: atividadeId,
              documento_id: doc.id,
              etapa: atividadeOriginal.etapa,
              descritivo: atividadeOriginal.atividade,
              tempo_planejado: atividadeOriginal.tempo || 0,
              status: 'concluido',
              termino_real: hoje,
              horas_por_dia: {}
            }),
            3, 500, `createConcludedPlan-${doc.id}-${atividadeId}`
          );
          concluidos++;
          console.log(`   ✅ Planejamento concluído criado para folha ${doc.numero}`);
        }
      } else {
        // Atualizar planejamentos existentes
        for (const plano of planejamentos) {
          if (plano.status === 'concluido') {
            jaFinalizados++;
            console.log(`   ⏭️ Planejamento ${plano.id} já estava concluído`);
            continue;
          }
          
          await retryWithBackoff(
            () => PlanejamentoAtividade.update(plano.id, {
              status: 'concluido',
              termino_real: hoje
            }),
            3, 500, `concluirPlan-${plano.id}`
          );
          
          concluidos++;
          console.log(`   ✅ Planejamento ${plano.id} concluído`);
        }
      }
      
      console.log(`\n✅ ========================================`);
      console.log(`✅ CONCLUSÃO FINALIZADA`);
      console.log(`✅ ========================================`);
      console.log(`   Concluídos agora: ${concluidos}`);
      console.log(`   Já finalizados: ${jaFinalizados}`);
      console.log(`✅ ========================================\n`);
      
      // Registrar conclusão em AtividadesEmpreendimento
      try {
        const atividadeOriginalArr = await retryWithBackoff(
          () => Atividade.filter({ id: atividadeId }),
          3, 500, `getOriginalActivityConclusao-${atividadeId}`
        );
        
        if (atividadeOriginalArr && atividadeOriginalArr.length > 0) {
          const atividadeOriginal = atividadeOriginalArr[0];
          
          const atividadesEmp = await retryWithBackoff(
            () => base44.entities.AtividadesEmpreendimento.filter({
              empreendimento_id: empreendimentoId,
              id_atividade: atividadeOriginal.id_atividade || atividadeId
            }),
            3, 500, `getAtividadesEmpConcluir-${atividadeId}`
          );
          
          for (const atividadeEmp of atividadesEmp) {
            await retryWithBackoff(
              () => base44.entities.AtividadesEmpreendimento.update(atividadeEmp.id, {
                data_conclusao: hoje
              }),
              3, 500, `updateAtividadeEmpConclusao-${atividadeEmp.id}`
            );
          }
          console.log(`   📋 ${atividadesEmp.length} registro(s) atualizado(s) em AtividadesEmpreendimento`);
        }
      } catch (error) {
        console.warn(`   ⚠️ Erro ao atualizar AtividadesEmpreendimento:`, error);
      }
      
      await fetchData();
      if (onUpdate) onUpdate();
      
      let mensagem = `✅ Atividade "${atividade.atividade}" concluída em todas as folhas!\n`;
      if (concluidos > 0) {
        mensagem += `\n• ${concluidos} planejamento(s) concluído(s)`;
      }
      if (jaFinalizados > 0) {
        mensagem += `\n• ${jaFinalizados} já estava(m) finalizado(s)`;
      }
      alert(mensagem);
      
    } catch (error) {
      console.error("Erro ao concluir atividade em todas as folhas:", error);
      alert("Erro ao concluir atividade: " + error.message);
    } finally {
      setIsConcluindo(prev => ({ ...prev, [atividadeId]: false }));
    }
  };

  const handleSaveExecutor = async (atividade, executorEmail, dataInicioCustom = null) => {
    const atividadeId = atividade.base_atividade_id || atividade.id;
    
    console.log(`\n🎯 ========================================`);
    console.log(`🎯 SALVAR EXECUTOR`);
    console.log(`🎯 ========================================`);
    console.log(`   Atividade ID: ${atividadeId}`);
    console.log(`   Atividade: ${atividade.atividade}`);
    console.log(`   Executor Email: "${executorEmail}"`);
    console.log(`   Executor vazio?: ${!executorEmail}`);
    console.log(`   Data início custom: ${dataInicioCustom ? format(dataInicioCustom, 'dd/MM/yyyy') : 'não definida'}`);
    console.log(`🎯 ========================================\n`);
    
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
      console.log(`✅ Atividade original encontrada:`, atividadeOriginal);
      
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
        console.log(`📝 Atualizando override existente: ${existingOverrides[0].id}`);
        await retryWithBackoff(
          () => Atividade.update(existingOverrides[0].id, { executor_principal: executorEmail || null }),
          3, 500, `updateExecutorOverride-${existingOverrides[0].id}`
        );
        console.log(`✅ Override atualizado`);
      } else if (executorEmail) {
        console.log(`📝 Criando novo override com executor`);
        await retryWithBackoff(
          () => Atividade.create({
            ...atividadeOriginal,
            id: undefined,
            empreendimento_id: empreendimentoId,
            id_atividade: atividadeId,
            documento_id: null,
            executor_principal: executorEmail
          }),
          3, 500, `createExecutorOverride-${atividadeId}`
        );
        console.log(`✅ Override criado`);
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
      
      // Buscar carga diária completa do executor
      console.log(`\n🔄 Buscando agenda completa do executor ${executorEmail}...`);
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
      
      console.log(`📊 Carga diária do executor:`, cargaDiaria);
      
      // Buscar documentos que têm esta atividade
      console.log(`\n🔍 Buscando documentos compatíveis...`);
      console.log(`   Disciplina necessária: ${atividadeOriginal.disciplina}`);
      console.log(`   Subdisciplina necessária: ${atividadeOriginal.subdisciplina}`);
      console.log(`   Total de documentos no empreendimento: ${documentos.length}`);
      
      const documentosComAtividade = documentos.filter(doc => {
        const disciplinaMatch = doc.disciplina === atividadeOriginal.disciplina;
        const subdisciplinasDoc = doc.subdisciplinas || [];
        const subdisciplinaMatch = subdisciplinasDoc.includes(atividadeOriginal.subdisciplina);
        const matches = disciplinaMatch && subdisciplinaMatch;
        
        if (matches) {
          console.log(`   ✅ Documento compatível: ${doc.numero} - ${doc.arquivo}`);
        }
        
        return matches;
      });
      
      console.log(`\n📊 Total de documentos compatíveis: ${documentosComAtividade.length}`);
      
      // Criar planejamentos para cada documento (ou um planejamento geral se não houver documentos)
      let planejamentosCriados = 0;
      let planejamentosJaExistentes = 0;
      
      if (documentosComAtividade.length === 0) {
        console.warn(`⚠️ Nenhum documento compatível encontrado, criando planejamento geral vinculado ao empreendimento...`);
        
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
          // Atualizar executor do planejamento existente
          console.log(`   ✏️ Planejamento geral já existe (ID: ${planejamentosExistentes[0].id}), atualizando executor...`);
          await retryWithBackoff(
            () => PlanejamentoAtividade.update(planejamentosExistentes[0].id, {
              executor_principal: executorEmail,
              executores: [executorEmail]
            }),
            3, 500, `updateGeneralPlanExecutor-${planejamentosExistentes[0].id}`
          );
          console.log(`   ✅ Executor atualizado no planejamento geral`);
          planejamentosJaExistentes++;
        } else {
          console.log(`   📝 Criando novo planejamento geral...`);
          
          const tempoCalculado = atividadeOriginal.tempo || 0;
          console.log(`   ⏱️ Tempo: ${tempoCalculado.toFixed(1)}h`);
          
          // Buscar primeiro dia disponível na agenda do executor
          console.log(`   🔍 Procurando primeiro dia útil disponível na agenda...`);
          let dataInicio = dataInicioCustom ? new Date(dataInicioCustom) : new Date(hojeMidnight);
          
          // Se data custom foi fornecida, garantir que seja dia útil
          if (dataInicioCustom) {
            console.log(`   📅 Data de início personalizada: ${format(dataInicio, 'dd/MM/yyyy')}`);
            if (!isWorkingDay(dataInicio)) {
              dataInicio = getNextWorkingDay(dataInicio);
              console.log(`   ⚠️ Data ajustada para próximo dia útil: ${format(dataInicio, 'dd/MM/yyyy')}`);
            }
          } else {
            let tentativas = 0;
            const maxTentativas = 365;
            
            while (tentativas < maxTentativas) {
              if (isWorkingDay(dataInicio)) {
                const diaKey = format(dataInicio, 'yyyy-MM-dd');
                const cargaDoDia = cargaDiaria[diaKey] || 0;
                const disponivel = 8 - cargaDoDia;
                
                if (disponivel >= 0.5) {
                  console.log(`   ✅ Primeiro dia disponível: ${format(dataInicio, 'dd/MM/yyyy')} (${disponivel.toFixed(1)}h livres)`);
                  break;
                }
              }
              dataInicio = addDays(dataInicio, 1);
              tentativas++;
            }
            
            if (tentativas >= maxTentativas) {
              throw new Error(`Não foi possível encontrar data disponível na agenda do executor.`);
            }
          }
          
          const resultadoDistribuicao = distribuirHorasPorDias(
            dataInicio,
            tempoCalculado,
            8,
            cargaDiaria,
            false
          );
          
          if (!resultadoDistribuicao || !resultadoDistribuicao.distribuicao || Object.keys(resultadoDistribuicao.distribuicao).length === 0) {
            throw new Error(`Não foi possível distribuir as horas na agenda.`);
          }
          
          const { distribuicao, dataTermino } = resultadoDistribuicao;
          const diasUtilizados = Object.keys(distribuicao).sort();
          const inicioPlanejado = diasUtilizados[0];
          const terminoPlanejado = format(dataTermino, 'yyyy-MM-dd');
          
          const dadosPlanejamento = {
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId,
            documento_id: null,
            etapa: atividadeOriginal.etapa,
            descritivo: atividadeOriginal.atividade,
            tempo_planejado: tempoCalculado,
            executor_principal: executorEmail,
            executores: [executorEmail],
            inicio_planejado: inicioPlanejado,
            termino_planejado: terminoPlanejado,
            horas_por_dia: distribuicao,
            status: 'nao_iniciado'
          };
          
          console.log(`   💾 Salvando planejamento geral no banco...`);
          await retryWithBackoff(
            () => PlanejamentoAtividade.create(dadosPlanejamento),
            3, 500, `createGeneralPlan-${atividadeId}`
          );
          console.log(`   ✅ Planejamento geral criado`);
          planejamentosCriados++;
        }
      } else {
        // Processar documentos normalmente
        for (const doc of documentosComAtividade) {
        console.log(`\n📋 Processando documento: ${doc.numero}`);
        
        // Verificar se já existe planejamento
        const planejamentosExistentes = await retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId,
            documento_id: doc.id
          }),
          3, 500, `checkExistingPlan-${doc.id}-${atividadeId}`
        );
        
        if (planejamentosExistentes && planejamentosExistentes.length > 0) {
          // Atualizar executor do planejamento existente
          console.log(`   ✏️ Planejamento já existe (ID: ${planejamentosExistentes[0].id}), atualizando executor...`);
          await retryWithBackoff(
            () => PlanejamentoAtividade.update(planejamentosExistentes[0].id, {
              executor_principal: executorEmail,
              executores: [executorEmail]
            }),
            3, 500, `updatePlanExecutor-${planejamentosExistentes[0].id}`
          );
          console.log(`   ✅ Executor atualizado no planejamento`);
          planejamentosJaExistentes++;
        } else {
          console.log(`   📝 Criando novo planejamento...`);
          
          // Criar novo planejamento
          const fatorDificuldade = doc.fator_dificuldade || 1;
          const tempoCalculado = (atividadeOriginal.tempo || 0) * fatorDificuldade;
          
          console.log(`   ⏱️ Tempo calculado: ${tempoCalculado.toFixed(1)}h (fator: ${fatorDificuldade})`);
          
          // Buscar primeiro dia disponível na agenda do executor
          console.log(`   🔍 Procurando primeiro dia útil disponível na agenda...`);
          let dataInicio = dataInicioCustom ? new Date(dataInicioCustom) : new Date(hojeMidnight);
          
          // Se data custom foi fornecida, garantir que seja dia útil
          if (dataInicioCustom) {
            console.log(`   📅 Data de início personalizada: ${format(dataInicio, 'dd/MM/yyyy')}`);
            if (!isWorkingDay(dataInicio)) {
              dataInicio = getNextWorkingDay(dataInicio);
              console.log(`   ⚠️ Data ajustada para próximo dia útil: ${format(dataInicio, 'dd/MM/yyyy')}`);
            }
          } else {
            let tentativas = 0;
            const maxTentativas = 365;
            
            while (tentativas < maxTentativas) {
              if (isWorkingDay(dataInicio)) {
                const diaKey = format(dataInicio, 'yyyy-MM-dd');
                const cargaDoDia = cargaDiaria[diaKey] || 0;
                const disponivel = 8 - cargaDoDia;
                
                if (disponivel >= 0.5) {
                  console.log(`   ✅ Primeiro dia disponível: ${format(dataInicio, 'dd/MM/yyyy')} (${disponivel.toFixed(1)}h livres)`);
                  break;
                }
              }
              dataInicio = addDays(dataInicio, 1);
              tentativas++;
            }
            
            if (tentativas >= maxTentativas) {
              throw new Error(`Não foi possível encontrar data disponível na agenda do executor.`);
            }
          }
          
          // Distribuir horas pelos dias disponíveis
          console.log(`   🔄 Distribuindo ${tempoCalculado.toFixed(1)}h a partir de ${format(dataInicio, 'dd/MM/yyyy')}...`);
          
          const resultadoDistribuicao = distribuirHorasPorDias(
            dataInicio,
            tempoCalculado,
            8,
            cargaDiaria,
            false
          );
          
          if (!resultadoDistribuicao || !resultadoDistribuicao.distribuicao || Object.keys(resultadoDistribuicao.distribuicao).length === 0) {
            throw new Error(`Não foi possível distribuir as horas na agenda.`);
          }
          
          const { distribuicao, dataTermino, novaCargaDiaria } = resultadoDistribuicao;
          const diasUtilizados = Object.keys(distribuicao).sort();
          const inicioPlanejado = diasUtilizados[0];
          const terminoPlanejado = format(dataTermino, 'yyyy-MM-dd');
          
          console.log(`   📊 Distribuição criada:`);
          console.log(`      Início: ${inicioPlanejado}`);
          console.log(`      Término: ${terminoPlanejado}`);
          console.log(`      Dias: ${Object.keys(distribuicao).length}`);
          console.log(`      Horas por dia:`, distribuicao);
          
          const dadosPlanejamento = {
            empreendimento_id: empreendimentoId,
            atividade_id: atividadeId,
            documento_id: doc.id,
            etapa: atividadeOriginal.etapa,
            descritivo: atividadeOriginal.atividade,
            tempo_planejado: tempoCalculado,
            executor_principal: executorEmail,
            executores: [executorEmail],
            inicio_planejado: inicioPlanejado,
            termino_planejado: terminoPlanejado,
            horas_por_dia: distribuicao,
            status: 'nao_iniciado'
          };
          
          console.log(`   💾 Salvando planejamento no banco...`);
          const planejamentoCriado = await retryWithBackoff(
            () => PlanejamentoAtividade.create(dadosPlanejamento),
            3, 500, `createPlan-${doc.id}-${atividadeId}`
          );
          console.log(`   ✅ Planejamento criado com ID: ${planejamentoCriado.id}`);
          planejamentosCriados++;
          
          // Registrar em AtividadesEmpreendimento
          try {
            const atividadeEmpExistente = await retryWithBackoff(
              () => base44.entities.AtividadesEmpreendimento.filter({
                empreendimento_id: empreendimentoId,
                id_atividade: atividadeOriginal.id_atividade || atividadeId,
                documento_id: doc.id
              }),
              3, 500, `checkAtividadeEmp-${doc.id}-${atividadeId}`
            );
            
            if (!atividadeEmpExistente || atividadeEmpExistente.length === 0) {
              await retryWithBackoff(
                () => base44.entities.AtividadesEmpreendimento.create({
                  id_atividade: atividadeOriginal.id_atividade || atividadeId,
                  empreendimento_id: empreendimentoId,
                  documento_id: doc.id,
                  etapa: atividadeOriginal.etapa,
                  disciplina: atividadeOriginal.disciplina,
                  subdisciplina: atividadeOriginal.subdisciplina,
                  atividade: atividadeOriginal.atividade,
                  predecessora: atividadeOriginal.predecessora,
                  tempo: atividadeOriginal.tempo,
                  funcao: atividadeOriginal.funcao,
                  documento_ids: [doc.id],
                  status_planejamento: 'planejada'
                }),
                3, 500, `createAtividadeEmp-${doc.id}-${atividadeId}`
              );
              console.log(`   📋 Atividade registrada em AtividadesEmpreendimento`);
            }
          } catch (error) {
            console.warn(`   ⚠️ Erro ao registrar em AtividadesEmpreendimento:`, error);
          }
          
          // Atualizar carga diária para próximos planejamentos
          Object.assign(cargaDiaria, novaCargaDiaria);
        }
      }
      }
      
      console.log(`\n✅ ========================================`);
      console.log(`✅ PLANEJAMENTO CONCLUÍDO`);
      console.log(`✅ ========================================`);
      console.log(`   Criados: ${planejamentosCriados}`);
      console.log(`   Atualizados: ${planejamentosJaExistentes}`);
      console.log(`✅ ========================================\n`);
      
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
      console.error("Erro ao salvar executor e planejar:", error);
      alert("Erro ao salvar executor e criar planejamentos: " + error.message);
      setIsSavingExecutor(prev => ({ ...prev, [atividadeId]: false }));
    } finally {
      setIsSavingExecutor(prev => ({ ...prev, [atividadeId]: false }));
    }
  };

  const handlePlanejarMultiplas = async (executorEmail, dataInicioCustom = null) => {
    if (atividadesSelecionadasParaPlanejar.size === 0) {
      alert("Nenhuma atividade selecionada para planejar.");
      return;
    }

    const atividadesParaPlanejar = Array.from(atividadesSelecionadasParaPlanejar);
    const confirmacao = window.confirm(
      `Deseja planejar ${atividadesParaPlanejar.length} atividade${atividadesParaPlanejar.length > 1 ? 's' : ''} para ${usuarios.find(u => u.email === executorEmail)?.nome || executorEmail}?${dataInicioCustom ? `\n\nData de início: ${format(dataInicioCustom, 'dd/MM/yyyy')}` : ''}`
    );

    if (!confirmacao) return;

    console.log(`\n🎯 ========================================`);
    console.log(`🎯 PLANEJAR MÚLTIPLAS ATIVIDADES`);
    console.log(`🎯 ========================================`);
    console.log(`   Quantidade: ${atividadesParaPlanejar.length}`);
    console.log(`   Executor: ${executorEmail}`);
    console.log(`   Data início: ${dataInicioCustom ? format(dataInicioCustom, 'dd/MM/yyyy') : 'automática'}`);
    console.log(`🎯 ========================================\n`);

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
      console.log(`\n🔄 ========================================`);
      console.log(`🔄 REVERTER CONCLUSÃO DE ETAPA: ${etapa}`);
      console.log(`🔄 ========================================`);
      console.log(`   Total de atividades: ${atividadesDaEtapa.length}`);
      console.log(`   Empreendimento: ${empreendimentoId}`);

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

      <EtapaEditModal 
        isOpen={isEtapaModalOpen}
        onClose={() => setIsEtapaModalOpen(false)}
        atividade={selectedAtividade}
        documentos={documentos}
        onSave={handleSaveEtapa}
      />

      <EditarEtapaEmFolhasModal
        isOpen={isEditarEtapaEmFolhasModalOpen}
        onClose={() => {
          setIsEditarEtapaEmFolhasModalOpen(false);
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