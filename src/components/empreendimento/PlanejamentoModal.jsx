
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PlanejamentoAtividade, Documento } from "@/entities/all";
import { Calendar as CalendarIcon, CheckCircle, Clock, Users, Loader2, UserCheck } from "lucide-react";
import { format, isValid, parseISO, startOfDay, subDays } from "date-fns";
import { retryWithBackoff } from '../utils/apiUtils';
import { distribuirHorasPorDias, getNextWorkingDay, isWorkingDay } from '../utils/DateCalculator';
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';
import { getCorrectEtapa } from '../utils/MemorialRule';

export default function PlanejamentoModal({
  isOpen,
  onClose,
  documento,
  atividades: atividadesProps = [],
  usuarios = [],
  empreendimentoId,
  allPlanejamentos = [],
  onSave
}) {
  const [executorPrincipal, setExecutorPrincipal] = useState("");
  const [atividadesSelecionadas, setAtividadesSelecionadas] = useState(new Set());
  const [atividadesPlanejadas, setAtividadesPlanejadas] = useState([]); // Stores the calculated/simulated plan for selected activities
  const [metodoCalculo, setMetodoCalculo] = useState('agenda_executor');
  const [dataInicioManual, setDataInicioManual] = useState("");
  const [resumoPlanejamento, setResumoPlanejamento] = useState(null); // Summary of the last calculation
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [executionLog, setExecutionLog] = useState([]);

  const [selectedExecutors, setSelectedExecutors] = useState({});

  const logExecution = useCallback((message) => {
    setExecutionLog((prev) => [...prev, message]);
  }, []);

  // NOVO: Ordenar usuários alfabeticamente
  const usuariosOrdenados = useMemo(() => {
    return [...usuarios].sort((a, b) => {
      const nomeA = a.nome || a.full_name || a.email || '';
      const nomeB = b.nome || b.full_name || b.email || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [usuarios]);

  const atividadesFiltradas = useMemo(() => {
    if (!documento || !atividadesProps) return [];

    const subdisciplinasDoc = documento.subdisciplinas || [];
    const disciplinaDoc = documento.disciplina;

    logExecution(`[PlanejamentoModal] 🎯 Documento "${documento.numero}": Disciplina="${disciplinaDoc}", Subdisciplinas=[${subdisciplinasDoc.join(', ')}]`);

    const filtered = atividadesProps.filter(ativ => {
      const disciplinaMatch = ativ.disciplina === disciplinaDoc;
      const subdisciplinaMatch = subdisciplinasDoc.includes(ativ.subdisciplina);

      return disciplinaMatch && subdisciplinaMatch;
    });

    logExecution(`[PlanejamentoModal] ✅ ${filtered.length} atividades encontradas após filtro rigoroso para o documento.`);

    return filtered;
  }, [documento, atividadesProps, logExecution]);

  const existingPlannedActivityIds = useMemo(() => {
    return new Set(
      allPlanejamentos
        .filter(p => p.documento_id === documento?.id)
        .map(p => p.atividade_id)
    );
  }, [allPlanejamentos, documento?.id]);

  const availableActivities = useMemo(() => {
    if (!documento) return [];
    const fatorDificuldade = parseFloat(documento.fator_dificuldade) || 1;

    return atividadesFiltradas.map(ativ => ({
      id: ativ.id,
      atividade_id: ativ.id,
      atividade: ativ.atividade,
      etapa: getCorrectEtapa(ativ),
      tempo: ativ.tempo, // Keep base time (ativ.tempo is the original from DB)
      tempo_base: parseFloat(ativ.tempo) || 0, // Explicit base time
      tempo_real: (parseFloat(ativ.tempo) || 0) * fatorDificuldade, // Time adjusted by document factor
      subdisciplina: ativ.subdisciplina,
      jaFoiPlanejada: existingPlannedActivityIds.has(ativ.id)
    })).filter(Boolean);
  }, [atividadesFiltradas, existingPlannedActivityIds, documento]);

  const atividadesMap = useMemo(() => {
    return (availableActivities || []).reduce((acc, ativ) => {
      if (ativ && ativ.atividade_id) {
        acc[ativ.atividade_id] = ativ;
      }
      return acc;
    }, {});
  }, [availableActivities]);

  const calcularDataInicioAutomatico = useCallback(async (executorEmail) => {
    try {
      logExecution(`[CALC INICIO AUTO] 🔍 Calculando data de início automática para executor: ${executorEmail}`);

      const planosDoExecutor = await retryWithBackoff(() =>
        PlanejamentoAtividade.filter({
          executor_principal: executorEmail
        })
      );

      logExecution(`[CALC INICIO AUTO] ✅ Encontrados ${planosDoExecutor.length} planejamentos existentes`);

      const cargaDiaria = {};
      let ultimaDataPlanejada = null; // This will store a Date object
      const today = startOfDay(new Date());

      // Build daily load map and find the latest planned end date
      planosDoExecutor.forEach((p) => {
        if (p.horas_por_dia && typeof p.horas_por_dia === 'object') {
          Object.entries(p.horas_por_dia).forEach(([dataStr, horas]) => {
            const horasNum = Number(horas);
            const dataObj = parseISO(dataStr);

            // Only consider recent data for load calculation
            if (isValid(dataObj) && dataObj >= subDays(today, 30)) { // Using `today` for consistency
              const dataKey = format(dataObj, 'yyyy-MM-dd');
              cargaDiaria[dataKey] = (cargaDiaria[dataKey] || 0) + horasNum;
            }
          });
        }

        if (p.termino_planejado) {
          const dataTermino = parseISO(p.termino_planejado);
          if (isValid(dataTermino) && (!ultimaDataPlanejada || dataTermino > ultimaDataPlanejada)) {
            ultimaDataPlanejada = dataTermino;
          }
        }
      });

      let dataRetorno = today; // Default to today if no future plans
      const DAILY_CAPACITY = 8; // Assuming 8 hours full capacity

      if (ultimaDataPlanejada && isValid(ultimaDataPlanejada) && ultimaDataPlanejada >= today) {
        logExecution(`[CALC INICIO AUTO] 📅 Última data planejada encontrada: ${format(ultimaDataPlanejada, 'yyyy-MM-dd')}`);

        const ultimoDiaKey = format(ultimaDataPlanejada, 'yyyy-MM-dd');
        const cargaDoUltimoDia = cargaDiaria[ultimoDiaKey] || 0;
        const capacidadeDisponivel = Math.max(0, DAILY_CAPACITY - cargaDoUltimoDia);

        logExecution(`[CALC INICIO AUTO] 🔍 Verificando capacidade do dia ${ultimoDiaKey}:`);
        logExecution(`[CALC INICIO AUTO]   - Carga atual: ${cargaDoUltimoDia.toFixed(2)}h`);
        logExecution(`[CALC INICIO AUTO]   - Capacidade disponível: ${capacidadeDisponivel.toFixed(2)}h`);

        if (capacidadeDisponivel > 0.1) {
          // The last day still has capacity, use it
          dataRetorno = ultimaDataPlanejada;
          logExecution(`[CALC INICIO AUTO] ✅ Último dia tem capacidade disponível. Usando: ${format(dataRetorno, 'yyyy-MM-dd')}`);
        } else {
          // The last day is full, move to the next working day
          dataRetorno = getNextWorkingDay(ultimaDataPlanejada);
          logExecution(`[CALC INICIO AUTO] ⏭️ Último dia está cheio. Próximo dia útil: ${format(dataRetorno, 'yyyy-MM-dd')}`);
        }
      } else {
        logExecution(`[CALC INICIO AUTO] 📅 Nenhuma data futura encontrada. Usando hoje: ${format(dataRetorno, 'yyyy-MM-dd')}`);
        // If no future plans or last plan is in the past, start searching from today.
        // Ensure it's a working day.
        dataRetorno = getNextWorkingDay(today);
      }

      // Final check to ensure it's a working day (mostly redundant now but robust)
      if (!isWorkingDay(dataRetorno)) {
        dataRetorno = getNextWorkingDay(dataRetorno);
        logExecution(`[CALC INICIO AUTO] 🔄 Ajustando para próximo dia útil: ${format(dataRetorno, 'yyyy-MM-dd')}`);
      }

      logExecution(`[CALC INICIO AUTO] 🎯 Data de início automática calculada: ${format(dataRetorno, 'yyyy-MM-dd')}`);
      return dataRetorno;

    } catch (error) {
      logExecution(`[CALC INICIO AUTO] ❌ Erro ao calcular data automática: ${error.message}`);
      console.error('[CALC INICIO AUTO] ❌ Erro ao calcular data automática:', error);
      return getNextWorkingDay(new Date()); // Fallback
    }
  }, [logExecution]);

  const calcularDatasAtualizadas = useCallback(async () => {
    let atividadesParaSimular = [];

    if (!executorPrincipal || atividadesSelecionadas.size === 0) {
      setAtividadesPlanejadas([]);
      setResumoPlanejamento(null);
      return;
    }

    logExecution("🚀 [PLANEJAMENTO] Iniciando cálculo para: " + executorPrincipal);
    logExecution("🚀 [PLANEJAMENTO] Atividades selecionadas: " + atividadesSelecionadas.size);

    setIsCalculating(true);

    try {
      let dataInicioSimulacao;
      let origemCalculo = '';
      const today = startOfDay(new Date());

      if (metodoCalculo === 'data_manual' && dataInicioManual) {
        const proposedStartDate = parseISO(`${dataInicioManual}T00:00:00`);
        if (isValid(proposedStartDate)) {
          // If manual date is provided and valid, ensure it's a working day
          // If proposedStartDate is a weekend, getNextWorkingDay will return Monday.
          // If it's a weekday, it will return proposedStartDate itself.
          dataInicioSimulacao = getNextWorkingDay(proposedStartDate);
          origemCalculo = 'data manual definida';
          logExecution(`📅 [INÍCIO] Usando data manual (ajustada para próximo dia útil se necessário): ${format(dataInicioSimulacao, 'dd/MM/yyyy')}`);
        } else {
          logExecution("⚠️ [INÍCIO] Data manual inválida, parse falhou. Caindo para cálculo automático.");
          dataInicioSimulacao = await calcularDataInicioAutomatico(executorPrincipal);
          origemCalculo = 'da agenda do executor (fallback da data manual)';
          logExecution("📅 [INÍCIO] Usando cálculo automático (fallback da data manual): " + format(dataInicioSimulacao, 'dd/MM/yyyy'));
        }
      } else { // metodoCalculo === 'agenda_executor'
        dataInicioSimulacao = await calcularDataInicioAutomatico(executorPrincipal);
        origemCalculo = 'da agenda do executor';
        logExecution("📅 [INÍCIO] Usando cálculo automático (considerando carga total do executor): " + format(dataInicioSimulacao, 'dd/MM/yyyy'));
      }

      // Recarregar carga completa para a simulação, INDEPENDENTEMENTE de como a data de início foi calculada.
      logExecution(`[CARGA GERAL SIMULAÇÃO] 🔍 Buscando planejamentos existentes para executor: ${executorPrincipal} para simulação`);

      const planosDoExecutorParaSimulacao = await retryWithBackoff(() =>
        PlanejamentoAtividade.filter({ executor_principal: executorPrincipal })
      );

      logExecution(`[CARGA GERAL SIMULAÇÃO] ✅ Encontrados ${planosDoExecutorParaSimulacao.length} planejamentos existentes para simulação`);

      const cargaDiariaSimulacao = {}; // This will hold the existing load for simulation
      let totalHorasExistentes = 0;
      let ultimaDataPlanejadaGeral = null; // Latest planned end date from ALL existing plans

      const ninetyDaysAgo = subDays(today, 90);

      planosDoExecutorParaSimulacao.forEach((p) => {
        if (p.horas_por_dia && typeof p.horas_por_dia === 'object') {
          Object.entries(p.horas_por_dia).forEach(([dataStr, horas]) => {
            const horasNum = Number(horas);
            const dataObj = parseISO(dataStr);
            if (isValid(dataObj) && dataObj >= ninetyDaysAgo) { // Filter old data
              const dataKey = format(dataObj, 'yyyy-MM-dd');
              cargaDiariaSimulacao[dataKey] = (cargaDiariaSimulacao[dataKey] || 0) + horasNum;
              totalHorasExistentes += horasNum;
            }
          });
        }
        if (p.termino_planejado) {
          const dataTermino = parseISO(p.termino_planejado);
          if (isValid(dataTermino) && (!ultimaDataPlanejadaGeral || dataTermino > ultimaDataPlanejadaGeral)) {
            ultimaDataPlanejadaGeral = dataTermino;
          }
        }
      });

      const totalDiasComCarga = Object.keys(cargaDiariaSimulacao).length;
      logExecution(`📊 [CARGA GERAL SIMULAÇÃO] Resumo:`);
      logExecution(`📊 [CARGA GERAL SIMULAÇÃO]   - Total de planejamentos: ${planosDoExecutorParaSimulacao.length}`);
      logExecution(`📊 [CARGA GERAL SIMULAÇÃO]   - Dias com carga: ${totalDiasComCarga}`);
      logExecution(`📊 [CARGA GERAL SIMULAÇÃO]   - Total de horas existentes: ${totalHorasExistentes.toFixed(2)}h`);
      logExecution(`📊 [CARGA GERAL SIMULAÇÃO]   - Última data planejada geral: ${ultimaDataPlanejadaGeral ? format(ultimaDataPlanejadaGeral, 'yyyy-MM-dd') : 'nenhuma'}`);

      atividadesParaSimular = Array.from(atividadesSelecionadas)
        .map(id => atividadesMap[id])
        .filter(Boolean)
        .sort((a, b) => {
          const indexA = ETAPAS_ORDER.indexOf(a.etapa);
          const indexB = ETAPAS_ORDER.indexOf(b.etapa);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

      logExecution("📋 [ATIVIDADES] Atividades ordenadas por etapa para simulação:");
      atividadesParaSimular.forEach((ativ, i) => {
        logExecution(`   ${i + 1}. ${ativ.etapa} - ${ativ.atividade} (${ativ.tempo_real}h)`);
      });

      const novasAtividades = [];
      let totalHorasNovas = 0;
      let dataParaProximaAtividade = new Date(dataInicioSimulacao);
      const fatorDificuldadeDocumento = parseFloat(documento.fator_dificuldade) || 1;

      logExecution("⏰ [DISTRIBUIÇÃO] Iniciando distribuição sequencial das atividades simuladas...");
      let simulatedCargaDiaria = { ...cargaDiariaSimulacao }; // Use a copy for simulation

      let isFirstActivityInBatch = true; // Flag para a primeira atividade do lote

      for (const atividade of atividadesParaSimular) {

        const tempoBaseAtividade = parseFloat(atividade.tempo_base) || 0;
        const tempoPlanejado = tempoBaseAtividade * fatorDificuldadeDocumento;

        if (tempoPlanejado <= 0) {
          logExecution(`⚠️  [ATIVIDADE ${atividade.atividade_id}] Tempo inválido (${tempoPlanejado}h) para "${atividade.atividade}", pulando.`);
          continue;
        }

        totalHorasNovas += tempoPlanejado;

        logExecution(`\n🔄 [ATIVIDADE ${atividade.atividade_id}] Processando "${atividade.atividade}" (${tempoPlanejado.toFixed(1)}h)`);
        logExecution(`   📅 Data de partida para busca: ${format(dataParaProximaAtividade, 'dd/MM/yyyy')}`);
        logExecution(`🔄 [SIMULAÇÃO] Simulando atividade "${atividade.atividade}" com ${tempoPlanejado.toFixed(2)}h (${tempoBaseAtividade.toFixed(2)}h base × ${fatorDificuldadeDocumento})`);

        // Adicionar a flag `isStrictStartDate` para a primeira atividade do lote, se o método for manual
        const isStrictStartDate = isFirstActivityInBatch && metodoCalculo === 'data_manual';
        isFirstActivityInBatch = false; // Desativa a flag para as próximas atividades no lote

        const { distribuicao, dataTermino } = distribuirHorasPorDias(
          dataParaProximaAtividade,
          tempoPlanejado,
          8,
          simulatedCargaDiaria,
          isStrictStartDate // Passa a nova flag para respeitar data manual
        );

        const horasDistribuidas = Object.values(distribuicao).reduce((sum, h) => sum + (Number(h) || 0), 0);
        if (Math.abs(horasDistribuidas - tempoPlanejado) > 0.01) {
          logExecution(`   ❌ [ERRO] Distribuição incorreta para "${atividade.atividade}"! Esperado: ${tempoPlanejado}h, Distribuído: ${horasDistribuidas}h`);
        } else {
          logExecution(`   ✅ [RESULTADO] Distribuição gerada para "${atividade.atividade}": ` + JSON.stringify(distribuicao));
        }

        if (Object.keys(distribuicao).length === 0) {
          logExecution(`⚠️ [SIMULAÇÃO] Nenhuma distribuição gerada para "${atividade.atividade}". Pulando.`);
          continue;
        }

        const diasAtividade = Object.keys(distribuicao).sort();
        const inicioPlanejado = diasAtividade.length > 0 ? diasAtividade[0] : null;
        const terminoPlanejado = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : null;

        novasAtividades.push({
          atividade_id: atividade.atividade_id,
          atividade: atividade.atividade,
          etapa: atividade.etapa,
          tempo_planejado: tempoPlanejado,
          inicio_planejado: inicioPlanejado,
          termino_planejado: terminoPlanejado,
          horas_por_dia: distribuicao,
          status: atividade.jaFoiPlanejada ? 'Já Planejada' : 'Disponível',
          ordem: atividadesParaSimular.indexOf(atividade)
        });

        dataParaProximaAtividade = dataTermino;

        logExecution(`   ➡️  [PRÓXIMA] Próxima atividade buscará a partir de: ${format(dataParaProximaAtividade, 'dd/MM/yyyy')}`);
        logExecution(`✅ [SIMULAÇÃO] "${atividade.atividade}": ${format(parseISO(inicioPlanejado), 'dd/MM')} a ${format(dataTermino, 'dd/MM')}`);
      }

      setAtividadesPlanejadas(novasAtividades);

      logExecution("\n📊 [RESUMO FINAL] Cálculo de atividades selecionadas concluído:");
      logExecution(`   Total de horas das selecionadas: ${totalHorasNovas.toFixed(1)}h`);
      logExecution(`   Total de atividades selecionadas: ${novasAtividades.length}`);

      const primeiraAtividade = novasAtividades[0];
      const ultimaAtividade = novasAtividades[novasAtividades.length - 1];

      const simulatedTotalDailyLoadForSelected = {};
      novasAtividades.forEach(ativ => {
        if (ativ.horas_por_dia) {
          Object.entries(ativ.horas_por_dia).forEach(([data, hours]) => {
            simulatedTotalDailyLoadForSelected[data] = (simulatedTotalDailyLoadForSelected[data] || 0) + (hours || 0);
          });
        }
      });

      setResumoPlanejamento({
        executor: executorPrincipal,
        origemCalculo,
        totalHoras: totalHorasNovas,
        dataInicio: primeiraAtividade?.inicio_planejado || (dataInicioSimulacao ? format(dataInicioSimulacao, 'yyyy-MM-dd') : 'N/A'),
        dataTermino: ultimaAtividade?.termino_planejado || (dataInicioSimulacao ? format(dataInicioSimulacao, 'yyyy-MM-dd') : 'N/A'),
        cargaInicialExecutor: cargaDiariaSimulacao,
        cargaNovasAtividades: simulatedTotalDailyLoadForSelected,
        resumoCargaExistente: {
          totalHorasExistentes: totalHorasExistentes,
          totalDiasComCarga: totalDiasComCarga,
          ultimaDataPlanejada: ultimaDataPlanejadaGeral ? format(ultimaDataPlanejadaGeral, 'yyyy-MM-dd') : null
        },
        totalAtividades: novasAtividades.length,
        dataFim: ultimaAtividade?.termino_planejado || (dataInicioSimulacao ? format(dataInicioSimulacao, 'yyyy-MM-dd') : 'N/A'),
        tempoTotal: totalHorasNovas,
      });

    } catch (error) {
      logExecution(`❌ [ERRO] Falha no cálculo: ${error.message} (Atividades: ${atividadesParaSimular.length > 0 ? atividadesParaSimular[0].atividade : 'N/A'}...)`);
      console.error("❌ [ERRO] Falha no cálculo:", error, "Atividades:", atividadesParaSimular);
      alert("Erro ao calcular planejamento: " + error.message);
    } finally {
      setIsCalculating(false);
    }
  }, [executorPrincipal, atividadesSelecionadas, metodoCalculo, dataInicioManual, atividadesMap, calcularDataInicioAutomatico, logExecution, documento]);

  const handleAtribuirExecutor = async () => {
    if (!executorPrincipal) {
      alert("Selecione um executor principal");
      return;
    }
    if (atividadesSelecionadas.size === 0) {
      alert("Selecione pelo menos uma atividade");
      return;
    }
    // Ensure a calculation has been performed and result is available
    if (!resumoPlanejamento || atividadesPlanejadas.length === 0) {
      alert("Por favor, calcule as datas antes de atribuir o executor.");
      return;
    }

    try {
      setIsSaving(true);
      setExecutionLog([]);

      logExecution(`[ATRIBUIR] Salvando planejamentos com base nos resultados calculados.`);

      // Filter out activities from atividadesPlanejadas that were somehow deselected
      // This ensures we only save what's currently selected and calculated.
      const activitiesToSave = atividadesPlanejadas.filter(p => atividadesSelecionadas.has(p.atividade_id));

      if (activitiesToSave.length === 0) {
        logExecution("⚠️ Nenhuma atividade calculada para ser salva. Finalizando.");
        alert("Nenhuma atividade calculada para ser salva. Por favor, selecione atividades e calcule.");
        return;
      }

      // Identify existing plans for deletion
      const existingPlansToDelete = allPlanejamentos.filter(p =>
        p.documento_id === documento.id &&
        p.executor_principal === executorPrincipal &&
        activitiesToSave.some(a => a.atividade_id === p.atividade_id)
      );

      if (existingPlansToDelete.length > 0) {
        logExecution(`🗑️ Deletando ${existingPlansToDelete.length} planejamentos existentes para o executor e atividades selecionadas neste documento...`);
        for (const plano of existingPlansToDelete) {
          await retryWithBackoff(() => PlanejamentoAtividade.delete(plano.id));
        }
        logExecution(`✅ Planejamentos antigos deletados para as atividades selecionadas.`);
      }

      let allPlansToCreate = [];
      logExecution(`\n🔄 [PLANEJAMENTO] Iniciando criação de planejamentos a partir dos resultados simulados...`);

      for (const activityPlan of activitiesToSave) {
        // Use the already calculated values directly from activityPlan
        allPlansToCreate.push({
          documento_id: documento.id,
          atividade_id: activityPlan.atividade_id,
          empreendimento_id: empreendimentoId,
          etapa: activityPlan.etapa,
          descritivo: activityPlan.atividade, // Use 'atividade' from activityPlan as descritivo
          executores: [executorPrincipal],
          executor_principal: executorPrincipal,
          tempo_planejado: activityPlan.tempo_planejado,
          inicio_planejado: activityPlan.inicio_planejado,
          termino_planejado: activityPlan.termino_planejado,
          status: 'nao_iniciado',
          prioridade: 1,
          horas_por_dia: activityPlan.horas_por_dia,
        });
        logExecution(`   ✅ "${activityPlan.atividade}" planejado de ${format(parseISO(activityPlan.inicio_planejado), 'dd/MM')} a ${format(parseISO(activityPlan.termino_planejado), 'dd/MM')}`);
      }

      if (allPlansToCreate.length > 0) {
        logExecution(`🚀 Criando ${allPlansToCreate.length} novos planejamentos em massa...`);
        await retryWithBackoff(() => PlanejamentoAtividade.bulkCreate(allPlansToCreate));
        logExecution("✅ Novos planejamentos salvos com sucesso!");
        alert(`Planejamento aplicado com sucesso! ${allPlansToCreate.length} atividade(s) planejada(s).`);
      } else {
        logExecution("⚠️ Nenhuma nova atividade para salvar.");
        alert("Nenhuma nova atividade para salvar.");
      }

      // Update document - fetch all plans for the document AFTER saving new ones
      const allPlannedForDocument = (await retryWithBackoff(() => PlanejamentoAtividade.filter({ documento_id: documento.id })));

      const tempoTotalDocumento = allPlannedForDocument.reduce((total, p) => total + p.tempo_planejado, 0);
      const distinctExecutors = [...new Set(allPlannedForDocument.flatMap(p => p.executores || []))];

      // Determine overall document start/end dates based on all plans for this document
      let docOverallStartDate = null;
      let docOverallEndDate = null;
      allPlannedForDocument.forEach(p => {
        const pStart = p.inicio_planejado ? parseISO(p.inicio_planejado) : null;
        const pEnd = p.termino_planejado ? parseISO(p.termino_planejado) : null;

        if (isValid(pStart) && (!docOverallStartDate || pStart < docOverallStartDate)) {
          docOverallStartDate = pStart;
        }
        if (isValid(pEnd) && (!docOverallEndDate || pEnd > docOverallEndDate)) {
          docOverallEndDate = pEnd;
        }
      });

      const docUpdateData = {
        tempo_total: tempoTotalDocumento,
        multiplos_executores: distinctExecutors.length > 1,
        executor_principal: distinctExecutors.length === 1 ? distinctExecutors[0] : null,
        inicio_planejado: docOverallStartDate ? format(docOverallStartDate, 'yyyy-MM-dd') : null,
        termino_planejado: docOverallEndDate ? format(docOverallEndDate, 'yyyy-MM-dd') : null,
      };

      await retryWithBackoff(() => Documento.update(documento.id, docUpdateData));
      logExecution("✅ Documento atualizado com sucesso!");

      if (onSave && typeof onSave === 'function') {
        await onSave();
      }

      setTimeout(() => {
        onClose();
      }, 1500);

    } catch (error) {
      console.error("Erro ao atribuir executor:", error);
      logExecution(`❌ ERRO FATAL: ${error.message}`);
      alert("Ocorreu um erro ao atribuir o executor. Verifique o log de execução no console ou nas mensagens da tela.");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setExecutorPrincipal("");
      setAtividadesSelecionadas(new Set());
      setAtividadesPlanejadas([]);
      setResumoPlanejamento(null);
      setMetodoCalculo('agenda_executor');
      setDataInicioManual("");
      setIsSaving(false);
      setExecutionLog([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && availableActivities.length > 0) {
      const atividadesNaoPlanejadas = availableActivities
        .filter(ativ => !ativ.jaFoiPlanejada)
        .map(ativ => ativ.atividade_id);

      if (atividadesNaoPlanejadas.length > 0) {
        setAtividadesSelecionadas(new Set(atividadesNaoPlanejadas));
      }
    }
  }, [isOpen, availableActivities]);

  // Recalcular sempre que executorPrincipal, atividadesSelecionadas, metodoCalculo ou dataInicioManual mudar
  useEffect(() => {
    if (isOpen && executorPrincipal && atividadesSelecionadas.size > 0) {
      // Debounce para evitar cálculos excessivos
      const timeoutId = setTimeout(() => {
        calcularDatasAtualizadas();
      }, 300);

      return () => clearTimeout(timeoutId);
    } else if (isOpen) {
      // Limpar dados se não há seleção ou executor
      setAtividadesPlanejadas([]);
      setResumoPlanejamento(null);
    }
  }, [isOpen, executorPrincipal, atividadesSelecionadas, metodoCalculo, dataInicioManual, calcularDatasAtualizadas]);

  const handleAtividadeSelection = useCallback((atividadeId, checked) => {
    setAtividadesSelecionadas(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(atividadeId);
      } else {
        newSet.delete(atividadeId);
      }
      return newSet;
    });
  }, []);

  const handleLimparSelecoes = useCallback(() => {
    setAtividadesSelecionadas(new Set());
  }, []);

  const handleSelecionarTodas = useCallback(() => {
    const todasAtividadesNaoPlanejadas = availableActivities
      .filter(ativ => !ativ.jaFoiPlanejada)
      .map(ativ => ativ.atividade_id);
    setAtividadesSelecionadas(new Set(todasAtividadesNaoPlanejadas));
  }, [availableActivities]);

  const activitiesByStage = useMemo(() => {
    const grouped = {};

    availableActivities.forEach(item => {
      const stage = item.etapa;

      if (!grouped[stage]) {
        grouped[stage] = [];
      }
      grouped[stage].push(item);
    });

    const ORDEM_ETAPAS = [
      'Concepção',
      'Planejamento',
      'Estudo Preliminar',
      'Ante-Projeto',
      'Projeto Básico',
      'Projeto Executivo',
      'Liberado para Obra'
    ];

    const orderedGrouped = {};
    ORDEM_ETAPAS.forEach(stage => {
      if (grouped[stage]) {
        grouped[stage].sort((a, b) => {
          if (a.subdisciplina !== b.subdisciplina) {
            return (a.subdisciplina || '').localeCompare(b.subdisciplina || '');
          }
          return (a.atividade || '').localeCompare(b.atividade || '');
        });
        orderedGrouped[stage] = grouped[stage];
      }
    });

    Object.keys(grouped).forEach(stage => {
      if (!ORDEM_ETAPAS.includes(stage)) {
        orderedGrouped[stage] = grouped[stage];
      }
    });

    logExecution('📋 Atividades agrupadas por etapa (ordenados): ' + Object.keys(orderedGrouped).join(', '));
    return orderedGrouped;
  }, [availableActivities, logExecution]);

  const executorSelecionado = usuariosOrdenados.find(u => u.email === executorPrincipal);

  const hasAvailableActivities = useMemo(() => {
    return availableActivities.some(activity => !activity.jaFoiPlanejada);
  }, [availableActivities]);

  const totalHorasSelecionadas = useMemo(() => {
    return Array.from(atividadesSelecionadas).reduce((total, atividadeId) => {
      const activity = atividadesMap[atividadeId];
      return total + (Number(activity?.tempo_real) || 0);
    }, 0);
  }, [atividadesSelecionadas, atividadesMap]);

  const fatorDificuldadeDocumento = useMemo(() => {
    return parseFloat(documento?.fator_dificuldade) || 1;
  }, [documento?.fator_dificuldade]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Planejamento - {documento?.numero}
            {fatorDificuldadeDocumento !== 1 && (
              <Badge variant="outline" className="ml-2 bg-yellow-100 text-yellow-800 border-yellow-300">
                Fator de Dificuldade: {fatorDificuldadeDocumento}x
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {documento && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="w-5 h-5" />
                  Ações em Massa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Executor Principal</Label>
                  <Select value={executorPrincipal} onValueChange={setExecutorPrincipal}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um executor" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuariosOrdenados.map(usuario => (
                        <SelectItem key={usuario.email} value={usuario.email}>
                          {usuario.nome || usuario.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-medium text-blue-800 mb-2">Método de Cálculo da Data de Início</h3>
                  <p className="text-blue-600 text-sm mb-3">
                    {metodoCalculo === 'agenda_executor' ?
                      'Agenda do Executor (prioriza preenchimento de agenda)' :
                      'Data Específica (inicia em data escolhida pelo usuário)'
                    }
                  </p>
                  <RadioGroup
                    value={metodoCalculo}
                    onValueChange={setMetodoCalculo}
                    className="flex space-x-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="agenda_executor" id="r1" />
                      <Label htmlFor="r1">Agenda do Executor</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="data_manual" id="r2" />
                      <Label htmlFor="r2">Data Manual</Label>
                    </div>
                  </RadioGroup>
                </div>

                {metodoCalculo === 'data_manual' && (
                  <div className="space-y-2">
                    <Label>Data de Início Desejada</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dataInicioManual ? format(new Date(`${dataInicioManual}T00:00:00`), 'dd/MM/yyyy') : 'Selecionar data'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dataInicioManual ? new Date(`${dataInicioManual}T00:00:00`) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const formattedDate = format(date, 'yyyy-MM-dd');
                              setDataInicioManual(formattedDate);
                              logExecution(`📅 Data de início selecionada pelo usuário: ${formattedDate}`);
                            } else {
                              setDataInicioManual("");
                            }
                          }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-gray-500">
                      A data será ajustada para o próximo dia útil se a data escolhida for um fim de semana ou feriado.
                    </p>
                  </div>
                )}

                {executorPrincipal && metodoCalculo === 'agenda_executor' && resumoPlanejamento && (
                  <div className="text-sm text-gray-600">
                    Início encontrado pela agenda do executor: {resumoPlanejamento.dataInicio === 'N/A' ? resumoPlanejamento.dataInicio : format(parseISO(resumoPlanejamento.dataInicio), 'dd/MM/yyyy')}.
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Selecionadas: {atividadesSelecionadas.size} atividades ({totalHorasSelecionadas.toFixed(1)}h)
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleSelecionarTodas} disabled={!hasAvailableActivities}>
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Todas Não Planejadas
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleLimparSelecoes} disabled={atividadesSelecionadas.size === 0}>
                      Limpar
                    </Button>
                    {executorPrincipal && atividadesSelecionadas.size > 0 && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={calcularDatasAtualizadas}
                        disabled={isCalculating || isSaving}
                      >
                        {isCalculating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
                        Calcular Datas
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {resumoPlanejamento && (
            <Card className="bg-green-50 border-green-200">
              <CardHeader>
                <CardTitle className="text-lg text-green-800">Resumo do Planejamento Calculado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <strong>Executor para Cálculo:</strong> {executorSelecionado?.nome || executorSelecionado?.full_name || executorPrincipal}
                    <div className="text-sm text-gray-600">(Origem: {resumoPlanejamento.origemCalculo})</div>
                  </div>
                  <div>
                    <strong>Total de Horas Selecionadas:</strong> {resumoPlanejamento.totalHoras.toFixed(1)}h
                  </div>
                  <div>
                    <strong>Data de Início Estimada:</strong> {resumoPlanejamento.dataInicio === 'N/A' ? resumoPlanejamento.dataInicio : format(parseISO(resumoPlanejamento.dataInicio), 'dd/MM/yyyy')}
                  </div>
                  <div>
                    <strong>Data de Término Estimada:</strong> {resumoPlanejamento.dataTermino === 'N/A' ? resumoPlanejamento.dataTermino : format(parseISO(resumoPlanejamento.dataTermino), 'dd/MM/yyyy')}
                  </div>
                </div>
                <div className="text-sm text-green-600 mt-2">
                  As datas acima representam o período para a execução das atividades selecionadas. Detalhes diários serão alocados individualmente na aplicação.
                </div>

                {resumoPlanejamento.resumoCargaExistente && (
                  <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200 text-sm">
                    <strong>Carga Existente do Executor:</strong>
                    <p className="text-yellow-800">
                      {resumoPlanejamento.resumoCargaExistente.totalHorasExistentes.toFixed(1)}h distribuídas em {resumoPlanejamento.resumoCargaExistente.totalDiasComCarga} dias.
                      Última atividade planejada termina em: {resumoPlanejamento.resumoCargaExistente.ultimaDataPlanejada ? format(parseISO(resumoPlanejamento.resumoCargaExistente.ultimaDataPlanejada), 'dd/MM/yyyy') : 'N/A'}.
                    </p>
                  </div>
                )}

                {resumoPlanejamento.cargaNovasAtividades && Object.keys(resumoPlanejamento.cargaNovasAtividades).length > 0 && (
                  <div className="mt-3 p-2 bg-white rounded border">
                    <strong className="text-sm">Distribuição das Atividades Selecionadas por Dia:</strong>
                    <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-2">
                      {Object.entries(resumoPlanejamento.cargaNovasAtividades)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([data, horas]) =>
                          <span key={data}>{format(parseISO(data), 'dd/MM')} ({Number(horas).toFixed(1)}h)</span>
                        )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {executionLog.length > 0 && (
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader>
                <CardTitle className="text-lg text-gray-800">Log de Execução</CardTitle>
              </CardHeader>
              <CardContent className="max-h-40 overflow-y-auto text-sm text-gray-700">
                {executionLog.map((log, index) => (
                  <p key={index} className="whitespace-pre-wrap font-mono text-xs">{log}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {Object.entries(activitiesByStage).map(([etapa, atividadesEtapa]) => {
            const atividadesDisponiveis = atividadesEtapa.filter(item => !item.jaFoiPlanejada);
            const atividadesJaPlanejadas = atividadesEtapa.filter(item => item.jaFoiPlanejada);

            return (
              <Card key={etapa}>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">{etapa} ({atividadesEtapa.length} atividades)</CardTitle>
                  {atividadesDisponiveis.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const idsEtapa = atividadesDisponiveis.map(item => item.atividade_id);
                        const allSelectedInStage = idsEtapa.every(id => atividadesSelecionadas.has(id));

                        setAtividadesSelecionadas(prev => {
                          const newSet = new Set(prev);
                          if (allSelectedInStage) {
                            idsEtapa.forEach(id => newSet.delete(id));
                          } else {
                            idsEtapa.forEach(id => newSet.add(id));
                          }
                          return newSet;
                        });
                      }}
                    >
                      {atividadesDisponiveis.every(item => atividadesSelecionadas.has(item.atividade_id)) ? 'Desmarcar Todas' : 'Marcar Todas'}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {atividadesDisponiveis.map(item => (
                    <div key={item.atividade_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          checked={atividadesSelecionadas.has(item.atividade_id)}
                          onCheckedChange={(checked) => handleAtividadeSelection(item.atividade_id, checked)}
                        />
                        <div>
                          <div className="font-medium">{item.atividade}</div>
                          <div className="text-sm text-gray-500">
                            {item.subdisciplina} •
                            <span className="text-blue-600 font-medium ml-1">
                              {item.tempo_real.toFixed(1)}h
                              {fatorDificuldadeDocumento !== 1 && (
                                <span className="text-xs text-gray-500 ml-1">
                                  ({item.tempo_base.toFixed(1)}h × {fatorDificuldadeDocumento})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">Disponível</Badge>
                    </div>
                  ))}

                  {atividadesJaPlanejadas.map(item => (
                    <div key={item.atividade_id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                      <div className="flex items-center space-x-3">
                        <Checkbox checked={false} disabled />
                        <div className="opacity-60">
                          <div className="font-medium">{item.atividade}</div>
                          <div className="text-sm text-gray-500">
                            {item.subdisciplina} •
                            <span className="ml-1">
                              {item.tempo_real.toFixed(1)}h
                              {fatorDificuldadeDocumento !== 1 && (
                                <span className="text-xs text-gray-500 ml-1">
                                  ({item.tempo_base.toFixed(1)}h × {fatorDificuldadeDocumento})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary">Já Planejada</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={isCalculating || isSaving}>Fechar</Button>
          <Button
            onClick={handleAtribuirExecutor}
            disabled={!executorPrincipal || atividadesSelecionadas.size === 0 || isCalculating || isSaving || !resumoPlanejamento || atividadesPlanejadas.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Atribuindo Executor...
              </>
            ) : (
              <>
                <UserCheck className="w-4 h-4 mr-2" />
                Atribuir Executor
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
