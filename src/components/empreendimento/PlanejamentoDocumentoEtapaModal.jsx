import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, CalendarIcon, AlertCircle, CheckCircle } from "lucide-react";
import { format, addDays, parseISO, isValid } from "date-fns";
import { ptBR } from 'date-fns/locale';
import { PlanejamentoDocumento, PlanejamentoAtividade } from "@/entities/all";
import { distribuirHorasPorDias, getNextWorkingDay, isWorkingDay } from "../utils/DateCalculator";
import { retryWithExtendedBackoff } from '../utils/apiUtils';
import { Input } from '@/components/ui/input';

export default function PlanejamentoDocumentoEtapaModal({
  isOpen,
  onClose,
  documento,
  usuarios = [],
  empreendimentoId,
  allAtividades = [],
  executorPadrao = null,
  etapaParaPlanejamento = 'todas',
  onSuccess
}) {
  const [etapasSelecionadas, setEtapasSelecionadas] = useState([]);
  const [executoresPorEtapa, setExecutoresPorEtapa] = useState({});
  const [dataInicioState, setDataInicioState] = useState(null);
  const [dataManualInput, setDataManualInput] = useState('');
  const [metodoData, setMetodoData] = useState('agenda');
  const [executorParaAgenda, setExecutorParaAgenda] = useState(executorPadrao || '');
  const [isCalculatingDate, setIsCalculatingDate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [cargaDiariaPorExecutor, setCargaDiariaPorExecutor] = useState({});

  // **NOVO**: Ordenar usuários alfabeticamente
  const usuariosOrdenados = useMemo(() => {
    return [...usuarios].sort((a, b) => {
      const nomeA = a.nome || a.full_name || a.email || '';
      const nomeB = b.nome || b.full_name || b.email || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [usuarios]);

  const atividadesDisponiveisPorEtapa = useMemo(() => {
    if (!documento || !allAtividades || allAtividades.length === 0) {
      console.warn('⚠️ Sem documento ou atividades para processar');
      return {};
    }

    console.log(`\n🔄 Calculando atividadesDisponiveisPorEtapa...`);
    console.log(`📋 Documento: ${documento.numero}`);
    console.log(`📊 Total de atividades disponíveis: ${allAtividades.length}`);

    const subdisciplinasDoc = documento.subdisciplinas || [];
    const disciplinaDoc = documento.disciplina;

    console.log(`🎯 Filtros:`);
    console.log(`   - Disciplina: ${disciplinaDoc}`);
    console.log(`   - Subdisciplinas: [${subdisciplinasDoc.join(', ')}]`);
    console.log(`   - Etapa para planejamento: ${etapaParaPlanejamento}`);

    // Incluir tanto atividades gerais quanto atividades específicas vinculadas a esta folha
    let atividadesCorrespondentes = allAtividades.filter(ativ => {
       // Atividades gerais (sem empreendimento_id)
       if (!ativ.empreendimento_id) {
         const disciplinaMatch = ativ.disciplina === disciplinaDoc;
         const subdisciplinaMatch = subdisciplinasDoc.includes(ativ.subdisciplina);
         const match = disciplinaMatch && subdisciplinaMatch;
         
         if (match) {
           console.log(`   ✅ Match (genérica): ${ativ.atividade} (${ativ.etapa} - ${ativ.subdisciplina})`);
         }
         
         return match;
       }
       
       // Atividades específicas DESTA folha (com documento_id igual ao documento atual)
       if (ativ.empreendimento_id === empreendimentoId && ativ.documento_id === documento.id && ativ.tempo !== -999) {
         // Não incluir marcadores de conclusão na lista
         if (ativ.tempo === 0 && String(ativ.atividade || '').includes('Concluída na folha')) {
           console.log(`   ⏭️ Ignorando marcador de conclusão: ${ativ.atividade}`);
           return false;
         }
         console.log(`   ✅ Match (específica da folha): ${ativ.atividade} (${ativ.etapa})`);
         return true;
       }
       
       return false;
    });

    console.log(`📊 Atividades correspondentes encontradas: ${atividadesCorrespondentes.length}`);

    if (etapaParaPlanejamento !== 'todas') {
      atividadesCorrespondentes = atividadesCorrespondentes.filter(ativ =>
        ativ.etapa === etapaParaPlanejamento
      );
      console.log(`📊 Após filtro de etapa: ${atividadesCorrespondentes.length}`);
    }

    const porEtapa = {};
    atividadesCorrespondentes.forEach(ativ => {
      if (!porEtapa[ativ.etapa]) {
        porEtapa[ativ.etapa] = [];
      }
      porEtapa[ativ.etapa].push(ativ);
    });

    console.log(`📊 Etapas encontradas:`, Object.keys(porEtapa));
    Object.keys(porEtapa).forEach(etapa => {
      console.log(`   - ${etapa}: ${porEtapa[etapa].length} atividades`);
    });

    return porEtapa;
  }, [documento, allAtividades, etapaParaPlanejamento]);

  const etapasDisponiveis = useMemo(() => {
    if (!documento) return [];

    const todasEtapasComTempo = [
    { nome: 'Concepção', campo: 'tempo_concepcao', ordem: 1 },
    { nome: 'Planejamento', campo: 'tempo_planejamento', ordem: 2 },
    { nome: 'Estudo Preliminar', campo: 'tempo_estudo_preliminar', ordem: 3 },
    { nome: 'Ante-Projeto', campo: 'tempo_ante_projeto', ordem: 4 },
    { nome: 'Projeto Básico', campo: 'tempo_projeto_basico', ordem: 5 },
    { nome: 'Projeto Executivo', campo: 'tempo_executivo', ordem: 6 },
    { nome: 'Liberado para Obra', campo: 'tempo_liberado_obra', ordem: 7 }
    ];

    let etapasFiltradas = todasEtapasComTempo.filter(etapa => {
    const atividadesDaEtapa = atividadesDisponiveisPorEtapa[etapa.nome];
    return atividadesDaEtapa && atividadesDaEtapa.length > 0;
    });

    if (etapaParaPlanejamento !== 'todas') {
    etapasFiltradas = etapasFiltradas.filter(etapa => etapa.nome === etapaParaPlanejamento);
    }

    return etapasFiltradas
    .map(etapa => {
        const atividadesDaEtapa = atividadesDisponiveisPorEtapa[etapa.nome] || [];
        const tempoTotalAtividades = atividadesDaEtapa.reduce((sum, ativ) => {
          // "Confecção de A-" usa apenas horas x pav (sem fator de dificuldade)
          const isConfeccaoA = ativ.atividade && String(ativ.atividade).trim().startsWith('Confecção de A-');
          const multiplier = isConfeccaoA ? 1 : (documento.fator_dificuldade || 1);
          return sum + ((Number(ativ.tempo) || 0) * multiplier);
        }, 0);
        return {
            ...etapa,
            tempoCalculado: tempoTotalAtividades,
            atividades: atividadesDaEtapa
        };
    })
    .filter(etapa => etapa.tempoCalculado > 0)
    .sort((a, b) => a.ordem - b.ordem);
  }, [documento, etapaParaPlanejamento, atividadesDisponiveisPorEtapa]);

  useEffect(() => {
    if (isOpen) {
      setEtapasSelecionadas([]);
      setExecutoresPorEtapa({});
      setIsCalculatingDate(false);
      setCargaDiariaPorExecutor({});

      if (executorPadrao) {
        setMetodoData('agenda');
        setExecutorParaAgenda(executorPadrao);
      } else {
        setMetodoData('manual');
        setExecutorParaAgenda('');
      }
      
      if (documento?.inicio_planejado) {
        const dataDoc = parseISO(documento.inicio_planejado);
        if (isValid(dataDoc)) {
            setDataInicioState(dataDoc);
            setDataManualInput(format(dataDoc, 'yyyy-MM-dd'));
        } else {
            setDataInicioState(new Date());
            setDataManualInput(format(new Date(), 'yyyy-MM-dd'));
        }
      } else {
        setDataInicioState(new Date());
        setDataManualInput(format(new Date(), 'yyyy-MM-dd'));
      }
    }
  }, [isOpen, documento, executorPadrao]);

  useEffect(() => {
    if (metodoData === 'manual' && dataManualInput) {
        const parsedDate = parseISO(dataManualInput);
        if (isValid(parsedDate)) {
            setDataInicioState(parsedDate);
        } else {
            setDataInicioState(null);
        }
    } else if (metodoData === 'manual' && !dataManualInput) {
        setDataInicioState(null);
    }
  }, [dataManualInput, metodoData]);

  useEffect(() => {
    if (isOpen && executorPadrao) {
      const etapas = etapasDisponiveis;
      const todasEtapasNomes = etapas.map(e => e.nome);
      setEtapasSelecionadas(todasEtapasNomes);
      
      const executoresIniciais = {};
      todasEtapasNomes.forEach(etapa => {
        executoresIniciais[etapa] = executorPadrao;
      });
      setExecutoresPorEtapa(executoresIniciais);
    }
  }, [isOpen, executorPadrao, etapasDisponiveis]);

  useEffect(() => {
    const calcularDataPorAgenda = async () => {
      if (metodoData === 'agenda' && executorParaAgenda && isOpen) {
        setIsCalculatingDate(true);
        setDataInicioState(null);
        try {
          console.log(`\n🔍 ========================================`);
          console.log(`📅 CALCULANDO DATA PELA AGENDA DO EXECUTOR`);
          console.log(`👤 Executor: ${executorParaAgenda}`);
          console.log(`🏢 Empreendimento ID: ${empreendimentoId}`);
          console.log(`🔍 ========================================\n`);
          
          console.log(`🔄 Buscando TODOS os planejamentos do executor ${executorParaAgenda}...`);
          
          const [planosAtividade, planosDocumento] = await Promise.all([
            retryWithExtendedBackoff(
              () => PlanejamentoAtividade.filter({ executor_principal: executorParaAgenda }),
              'loadAllPlansAtividade'
            ),
            retryWithExtendedBackoff(
              () => PlanejamentoDocumento.filter({ executor_principal: executorParaAgenda }),
              'loadAllPlansDocumento'
            )
          ]);
          
          console.log(`📊 PlanejamentoAtividade encontrados: ${(planosAtividade || []).length}`);
          console.log(`📊 PlanejamentoDocumento encontrados: ${(planosDocumento || []).length}`);
          
          const todosPlanos = [
            ...(planosAtividade || []),
            ...(planosDocumento || [])
          ];
          
          console.log(`📊 Total de planejamentos do executor: ${todosPlanos.length}\n`);

          const hoje = new Date();
          const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
          
          const cargaDiaria = {};
          
          console.log(`🔨 Construindo mapa de carga diária...`);
          console.log(`📅 Hoje: ${format(hojeMidnight, 'dd/MM/yyyy')}`);
          console.log(`📅 Considerando apenas datas >= hoje\n`);

          todosPlanos.forEach((plano, index) => {
            if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
              const horasPorDiaKeys = Object.keys(plano.horas_por_dia);
              
              if (horasPorDiaKeys.length > 0) {
                const nomeAtividade = plano.descritivo || plano.documento?.numero || plano.atividade?.atividade || 'N/A';
                const empreendimento = plano.empreendimento?.nome || 'Sem empreendimento';
                console.log(`   Plano #${index + 1}: ${nomeAtividade} (${empreendimento})`);
              }

              Object.entries(plano.horas_por_dia).forEach(([data, horas]) => {
                try {
                  const dataObj = parseISO(data);
                  if (isValid(dataObj) && dataObj >= hojeMidnight) {
                    const diaKey = format(dataObj, 'yyyy-MM-dd');
                    const horasValidas = Number(horas) || 0;
                    
                    if (horasValidas > 0 && horasValidas <= 12) {
                      cargaDiaria[diaKey] = (cargaDiaria[diaKey] || 0) + horasValidas;
                      
                      const diaDaData = format(dataObj, 'dd/MM/yyyy');
                      console.log(`      ${diaDaData}: +${horasValidas.toFixed(1)}h → Total: ${cargaDiaria[diaKey].toFixed(1)}h`);
                    }
                  }
                } catch (erro) {
                  console.warn(`      Erro ao processar data ${data}:`, erro);
                }
              });
            }
          });

          console.log(`\n📊 Mapa de carga construído. Total de dias com carga: ${Object.keys(cargaDiaria).length}`);
          
          console.log(`\n📅 Carga dos próximos 15 dias úteis a partir de hoje:`);
          let dataAtual = new Date(hojeMidnight); 
          let diasMostrados = 0;
          
          while (diasMostrados < 15) {
            const diaKey = format(dataAtual, 'yyyy-MM-dd');
            const carga = cargaDiaria[diaKey] || 0;
            const ehDiaUtil = isWorkingDay(dataAtual);
            
            if (ehDiaUtil) {
              const disponivel = 8 - carga;
              const status = disponivel >= 0.5 ? '✅ DISPONÍVEL' : '❌ CHEIO';
              
              console.log(`   ${format(dataAtual, 'dd/MM/yyyy (EEE)', { locale: ptBR })}: ${carga.toFixed(1)}h / 8h (livre: ${disponivel.toFixed(1)}h) ${status}`);
              diasMostrados++;
            } else {
              console.log(`   ${format(dataAtual, 'dd/MM/yyyy (EEE)', { locale: ptBR })}: 🚫 FIM DE SEMANA`);
            }
            
            dataAtual = addDays(dataAtual, 1);
          }

          console.log(`\n🔍 Buscando primeiro dia útil disponível...`);
          
          let diaDisponivel = new Date(hojeMidnight);
          let tentativas = 0;
          const maxTentativas = 365;
          let foundDate = false;
          
          while (tentativas < maxTentativas) {
            const diaKey = format(diaDisponivel, 'yyyy-MM-dd');
            const cargaDoDia = cargaDiaria[diaKey] || 0;
            const ehDiaUtil = isWorkingDay(diaDisponivel);
            const temEspaco = cargaDoDia < 7.5;
            
            if (ehDiaUtil && temEspaco) {
              console.log(`\n✅ PRIMEIRO DIA DISPONÍVEL ENCONTRADO!`);
              console.log(`   Data: ${format(diaDisponivel, 'dd/MM/yyyy (EEEE)', { locale: ptBR })}`);
              console.log(`   Carga atual: ${cargaDoDia.toFixed(1)}h / 8h`);
              console.log(`   Espaço disponível: ${(8 - cargaDoDia).toFixed(1)}h`);
              
              setDataInicioState(diaDisponivel);
              setCargaDiariaPorExecutor({ [executorParaAgenda]: cargaDiaria });
              foundDate = true;
              break;
            }
            
            diaDisponivel = addDays(diaDisponivel, 1);
            tentativas++;
          }
          
          if (!foundDate) {
            console.error(`❌ Não foi possível encontrar um dia disponível em ${maxTentativas} dias!`);
            alert(`Não foi possível encontrar uma data disponível para o executor ${executorParaAgenda}. A agenda está muito sobrecarregada.`);
            setDataInicioState(null);
            setCargaDiariaPorExecutor({});
          }
          
        } catch (error) {
          console.error("❌ Erro ao calcular data pela agenda:", error);
          alert("Erro ao calcular data disponível. Tente usar o método de data manual.");
          setDataInicioState(null);
          setCargaDiariaPorExecutor({});
        } finally {
          setIsCalculatingDate(false);
        }
      }
    };

    calcularDataPorAgenda();
  }, [metodoData, executorParaAgenda, empreendimentoId, isOpen]);

  const handleEtapaToggle = (etapaNome) => {
    setEtapasSelecionadas(prev => {
      if (prev.includes(etapaNome)) {
        const newExecutores = { ...executoresPorEtapa };
        delete newExecutores[etapaNome];
        setExecutoresPorEtapa(newExecutores); 
        return prev.filter(e => e !== etapaNome);
      } else {
        const defaultExecutor = executorPadrao || (metodoData === 'agenda' ? executorParaAgenda : '');
        if (defaultExecutor) {
          setExecutoresPorEtapa(prev => ({
            ...prev,
            [etapaNome]: defaultExecutor
          }));
        }
        return [...prev, etapaNome];
      }
    });
  };

  const handleExecutorChange = (etapaNome, executorEmail) => {
    setExecutoresPorEtapa(prev => ({
      ...prev,
      [etapaNome]: executorEmail
    }));
  };

  const calcularDatasEtapas = () => {
    if (!dataInicioState || etapasSelecionadas.length === 0) return [];

    const planejamentos = [];
    const etapasOrdenadas = etapasDisponiveis.filter(e => etapasSelecionadas.includes(e.nome));
    const dailyCapacity = 8;

    if (etapasOrdenadas.length === 0) return [];

    let cargaDiariaAcumulada = { ...(cargaDiariaPorExecutor[executorParaAgenda] || {}) };

    let dataInicioProximaEtapa = dataInicioState;

    for (const [index, etapa] of etapasOrdenadas.entries()) {
      const executor = executoresPorEtapa[etapa.nome];
      if (!executor) {
        continue;
      }

      const tempoHoras = etapa.tempoCalculado;
      if (tempoHoras <= 0) {
        continue;
      }

      let currentExecutorLoadForCalculation = (executor === executorParaAgenda && metodoData === 'agenda')
                                ? cargaDiariaAcumulada
                                : {}; 

      let dataInicioAjustadaParaCapacidade = dataInicioProximaEtapa;
      let tentativasAjuste = 0;
      const maxTentativasAjuste = 90;

      while (tentativasAjuste < maxTentativasAjuste) {
        const diaKey = format(dataInicioAjustadaParaCapacidade, 'yyyy-MM-dd');
        const cargaNoDia = currentExecutorLoadForCalculation[diaKey] || 0;
        const capacidadeDisponivel = Math.max(0, dailyCapacity - cargaNoDia);

        if (isWorkingDay(dataInicioAjustadaParaCapacidade) && capacidadeDisponivel > 0.01) {
          break;
        } else {
          dataInicioAjustadaParaCapacidade = addDays(dataInicioAjustadaParaCapacidade, 1);
        }
        tentativasAjuste++;
      }
      
      if (!isWorkingDay(dataInicioAjustadaParaCapacidade)) {
        dataInicioAjustadaParaCapacidade = getNextWorkingDay(dataInicioAjustadaParaCapacidade);
      }

      const dataInicioFinalDaEtapa = dataInicioAjustadaParaCapacidade;

      const { distribuicao, dataTermino, novaCargaDiaria } = distribuirHorasPorDias(
        dataInicioFinalDaEtapa,
        tempoHoras,
        dailyCapacity,
        currentExecutorLoadForCalculation,
        false
      );

      if (executor === executorParaAgenda && metodoData === 'agenda') {
         cargaDiariaAcumulada = novaCargaDiaria;
      }
      
      planejamentos.push({
        etapa: etapa.nome,
        executor,
        tempo: tempoHoras,
        inicio: format(dataInicioFinalDaEtapa, 'yyyy-MM-dd'),
        fim: format(dataTermino, 'yyyy-MM-dd'),
        horas_por_dia: distribuicao
      });

      const ultimoDiaKey = format(dataTermino, 'yyyy-MM-dd');
      const cargaNoUltimoDia = (executor === executorParaAgenda && metodoData === 'agenda')
                                ? cargaDiariaAcumulada[ultimoDiaKey] || 0
                                : 0; 

      if (cargaNoUltimoDia >= (dailyCapacity - 0.01)) {
        dataInicioProximaEtapa = getNextWorkingDay(addDays(dataTermino, 1));
      } else {
        dataInicioProximaEtapa = getNextWorkingDay(dataTermino);
      }
    }

    return planejamentos;
  };

  const planejamentosCalculados = useMemo(() => calcularDatasEtapas(), [dataInicioState, etapasSelecionadas, executoresPorEtapa, etapasDisponiveis, cargaDiariaPorExecutor, metodoData, executorParaAgenda]);

  const handleSalvar = async () => {
    if (etapasSelecionadas.length === 0) {
      alert("Selecione pelo menos uma etapa para planejar.");
      return;
    }

    const etapasSemExecutor = etapasSelecionadas.filter(etapa => !executoresPorEtapa[etapa]);
    if (etapasSemExecutor.length > 0) {
      alert(`As seguintes etapas não têm executor atribuído:\n${etapasSemExecutor.join('\n')}`);
      return;
    }

    if (!dataInicioState) {
      alert("Selecione uma data de início.");
      return;
    }
    
    if (metodoData === 'agenda' && !executorParaAgenda) {
      alert("Selecione um executor para calcular a data pela agenda.");
      return;
    }

    setIsSaving(true);
    try {
      const planejamentosCriados = [];
      for (const plano of planejamentosCalculados) {
        
        const horasPorDia = plano.horas_por_dia || {};

        const atividadesDaEtapa = atividadesDisponiveisPorEtapa[plano.etapa] || [];
        const atividades_ids = atividadesDaEtapa.map(ativ => ativ.id);

        const planejamentoData = {
          documento_id: documento.id,
          empreendimento_id: empreendimentoId,
          descritivo: `${documento.numero} - ${documento.arquivo} - ${plano.etapa}`,
          etapa: plano.etapa,
          executor_principal: plano.executor,
          executores: [plano.executor],
          tempo_planejado: plano.tempo,
          inicio_planejado: plano.inicio,
          termino_planejado: plano.fim,
          horas_por_dia: horasPorDia,
          status: 'nao_iniciado',
          prioridade: 1,
          atividades_ids: atividades_ids
        };

        const novoPlan = await retryWithExtendedBackoff(
          () => PlanejamentoDocumento.create(planejamentoData),
          `createPlanejamentoDoc-${documento.id}-${plano.etapa}`
        );
        planejamentosCriados.push(novoPlan);
      }

      const etapaInfo = etapaParaPlanejamento !== 'todas' 
        ? ` (etapa: ${etapaParaPlanejamento})`
        : '';
      
      alert(`✅ Planejamento por documento concluído!\n\n${planejamentosCriados.length} etapa(s) planejada(s) para ${documento.numero}${etapaInfo}`);
      
      if (onSuccess) onSuccess();
      onClose();

    } catch (error) {
      console.error("❌ [PlanejamentoDocumento] Erro ao salvar planejamentos:", error);
      alert("Erro ao salvar planejamentos. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const todosPlanejamentosValidos = planejamentosCalculados.length > 0 &&
    planejamentosCalculados.every(p => p.executor && p.tempo > 0);

  if (!documento) return null;

  const renderContent = () => {
    const temAtividades = etapasDisponiveis.length > 0;

    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CalendarIcon className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-blue-900">{documento.numero}</p>
              <p className="text-sm text-blue-700">
                Disciplina: {documento.disciplina} | Subdisciplinas: {(documento.subdisciplinas || []).join(', ')}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Label className="text-base font-semibold">Método de Cálculo da Data de Início</Label>
          
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="agenda"
                checked={metodoData === 'agenda'}
                onChange={() => setMetodoData('agenda')}
                className="w-4 h-4"
              />
              <Label htmlFor="agenda" className="font-normal cursor-pointer">
                Agenda do Executor
              </Label>
            </div>
            <p className="text-sm text-gray-600 ml-6">
              <span className="font-medium">Agenda do Executor:</span> Calcula a data de início com base na última tarefa planejada do executor selecionado, para evitar sobrecarga.
            </p>

            {metodoData === 'agenda' && (
              <div className="ml-6 space-y-3">
                <div>
                  <Label htmlFor="executor">Executor para Cálculo da Agenda</Label>
                  <Select value={executorParaAgenda} onValueChange={setExecutorParaAgenda} disabled={isCalculatingDate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o executor" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuariosOrdenados.map(u => (
                        <SelectItem key={u.id} value={u.email}>
                          {u.nome || u.full_name || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isCalculatingDate && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Calculando data disponível na agenda...
                  </div>
                )}

                {!executorParaAgenda && metodoData === 'agenda' && !isCalculatingDate && (
                  <p className="text-sm text-red-500">Selecione um executor para calcular a data pela agenda.</p>
                )}

                {dataInicioState && !isCalculatingDate && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm font-medium text-blue-900">
                      Data de Início Calculada: {format(dataInicioState, 'dd/MM/yyyy')}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="manual"
                checked={metodoData === 'manual'}
                onChange={() => setMetodoData('manual')}
                className="w-4 h-4"
              />
              <Label htmlFor="manual" className="font-normal cursor-pointer">
                Data Manual
              </Label>
            </div>

            {metodoData === 'manual' && (
              <div className="ml-6 space-y-2">
                <Label htmlFor="dataManual">Data de Início</Label>
                <Input
                  id="dataManual"
                  type="date"
                  value={dataManualInput}
                  onChange={(e) => setDataManualInput(e.target.value)}
                />
                {dataInicioState && metodoData === 'manual' && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm font-medium text-blue-900">
                      Data de Início Selecionada: {format(dataInicioState, 'dd/MM/yyyy')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {executorPadrao && (
          <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-900">Executor pré-selecionado</p>
              <p className="text-xs text-green-700 mt-1">
                {usuariosOrdenados.find(u => u.email === executorPadrao)?.nome || executorPadrao} foi atribuído automaticamente. Você pode alterar se necessário.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Selecione as Etapas:</Label>
            {temAtividades && (
              <p className="text-sm text-gray-500">
                {etapasDisponiveis.length} etapa{etapasDisponiveis.length !== 1 ? 's' : ''} disponível{etapasDisponiveis.length !== 1 ? 'is' : ''}
              </p>
            )}
          </div>

          {!temAtividades ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-900">Nenhuma etapa disponível</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    {etapaParaPlanejamento !== 'todas' 
                      ? `A etapa "${etapaParaPlanejamento}" não possui atividades genéricas para este documento.`
                      : "Este documento não possui atividades genéricas para nenhuma etapa."
                    }
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {etapasDisponiveis.map(etapaObj => {
                const etapaName = etapaObj.nome;
                const atividadesDaEtapa = etapaObj.atividades || [];
                const tempoTotal = etapaObj.tempoCalculado;
                const isSelected = etapasSelecionadas.includes(etapaName);

                return (
                  <div 
                    key={etapaName}
                    className={`border rounded-lg p-4 transition-all ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`etapa-${etapaName}`}
                        checked={isSelected}
                        onCheckedChange={() => handleEtapaToggle(etapaName)}
                        disabled={isCalculatingDate}
                      />
                      <div className="flex-1">
                        <Label 
                          htmlFor={`etapa-${etapaName}`}
                          className="font-medium cursor-pointer"
                        >
                          {etapaName}
                        </Label>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                          <span>{atividadesDaEtapa.length} atividade(s)</span>
                          <span>•</span>
                          <span className="font-medium">{tempoTotal.toFixed(1)}h total</span>
                        </div>

                        {isSelected && (
                          <div className="mt-3 space-y-2">
                            <Label className="text-sm">
                              Executor desta etapa:
                            </Label>
                            <Select
                              value={executoresPorEtapa[etapaName] || ''}
                              onValueChange={(value) => handleExecutorChange(etapaName, value)}
                              disabled={isCalculatingDate}
                            >
                              <SelectTrigger id={`executor-${etapaName}`}>
                                <SelectValue placeholder="Selecione o executor" />
                              </SelectTrigger>
                              <SelectContent>
                                {usuariosOrdenados.map(u => (
                                  <SelectItem key={u.id} value={u.email}>
                                    {u.nome || u.full_name || u.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <div className="mt-3 space-y-1">
                              <p className="text-xs font-medium text-gray-500 mb-2">Atividades incluídas:</p>
                              {atividadesDaEtapa.map((ativ, idx) => {
                                const isConfeccaoA = ativ.atividade && String(ativ.atividade).trim().startsWith('Confecção de A-');
                                const horas = (Number(ativ.tempo) || 0) * (isConfeccaoA ? 1 : (documento.fator_dificuldade || 1));
                                return (
                                  <div key={idx} className="text-xs text-gray-600 flex items-center gap-2 pl-2">
                                    <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                                    <span>{ativ.atividade}</span>
                                    <span className="text-gray-400">
                                      ({horas.toFixed(1)}h)
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {etapasSelecionadas.length > 0 && (
          <div className="space-y-3">
            <Label className="text-base font-semibold">Preview do Planejamento:</Label>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Executor</TableHead>
                    <TableHead>Tempo</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planejamentosCalculados.map((plano, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{plano.etapa}</TableCell>
                      <TableCell>
                        {usuariosOrdenados.find(u => u.email === plano.executor)?.nome || plano.executor}
                      </TableCell>
                      <TableCell>{plano.tempo.toFixed(1)}h</TableCell>
                      <TableCell>{format(parseISO(plano.inicio), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{format(parseISO(plano.fim), 'dd/MM/yyyy')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Planejamento por Documento - {documento.numero}
          </DialogTitle>
        </DialogHeader>

        {renderContent()}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving || isCalculatingDate}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSalvar} 
            disabled={
              !todosPlanejamentosValidos || 
              isSaving || 
              isCalculatingDate || 
              etapasDisponiveis.length === 0 || 
              !dataInicioState || 
              (metodoData === 'agenda' && !executorParaAgenda)
            }
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Criar Planejamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}