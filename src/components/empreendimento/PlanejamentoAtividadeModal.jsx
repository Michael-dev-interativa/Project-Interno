import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlanejamentoAtividade, PlanejamentoDocumento } from '@/entities/all';
import { Loader2, Calendar as CalendarIcon, Users, Plus, X } from 'lucide-react';
import { retryWithBackoff } from '../utils/apiUtils';
import { format, addDays, addWeeks, addMonths, parseISO, isValid } from 'date-fns';
import { pt } from 'date-fns/locale';
import { getNextWorkingDay, distribuirHorasPorDias } from '../utils/DateCalculator';

export default function PlanejamentoAtividadeModal({
  isOpen,
  onClose,
  atividade,
  usuarios,
  empreendimentoId,
  documentos,
  onSuccess
}) {
  const [formData, setFormData] = useState({
    tempo_planejado: '',
    executor_principal: '',
    multiplos_executores: false,
    metodo_data: 'agenda',
    data_inicio_manual: null,
    permite_multiplas_execucoes: false,
    quantidade_execucoes: 1,
    execucoes: [],
    recorrencia_ativada: false,
    tipo_recorrencia: 'semanal',
    datas_especificas: [],
    data_inicio_recorrencia: null,
    quantidade_ocorrencias: 4,
    documento_id: null
  });

  const [isLoading, setIsLoading] = useState(false);

  // **NOVO**: Ordenar usuários alfabeticamente
  const usuariosOrdenados = useMemo(() => {
    const usuariosValidos = usuarios && Array.isArray(usuarios) ? usuarios : [];
    return [...usuariosValidos].sort((a, b) => {
      const nomeA = a.nome || a.full_name || a.email || '';
      const nomeB = b.nome || b.full_name || b.email || '';
      return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
    });
  }, [usuarios]);

  const documentosDisponiveis = useMemo(() => {
    if (!atividade) return [];
    
    const docs = documentos && Array.isArray(documentos) ? documentos : [];
    
    console.log(`📄 [PlanejamentoAtividadeModal] Total de documentos recebidos:`, docs.length);
    console.log(`📄 [PlanejamentoAtividadeModal] Atividade:`, atividade.disciplina, '-', atividade.subdisciplina);

    // Para Documentação, sempre mostrar todos os documentos SEM executor
    if (atividade.disciplina === 'Documentação') {
      const docsSemExecutor = docs.filter(d => !d.executor_principal);
      console.log(`📄 [PlanejamentoAtividadeModal] Documentação detectada - ${docsSemExecutor.length} sem executor de ${docs.length} total`);
      return docsSemExecutor;
    }

    // Para outras disciplinas, filtrar por disciplina + subdisciplina E sem executor
    let result = docs.filter(doc => {
      // Primeiro verificar se a folha já tem executor
      if (doc.executor_principal) {
        return false;
      }

      if (!atividade.subdisciplina || atividade.subdisciplina === null || atividade.subdisciplina === '') {
        return doc.disciplina === atividade.disciplina;
      }

      const docSubdisciplinas = doc.subdisciplinas || [];
      return doc.disciplina === atividade.disciplina &&
             docSubdisciplinas.includes(atividade.subdisciplina);
    });

    // Se não encontrou documentos com filtro específico, mostrar todos sem executor
    if (result.length === 0) {
      const docsSemExecutor = docs.filter(d => !d.executor_principal);
      console.log(`📄 [PlanejamentoAtividadeModal] Nenhum documento encontrado com filtro específico - ${docsSemExecutor.length} sem executor`);
      return docsSemExecutor;
    }

    console.log(`📄 [PlanejamentoAtividadeModal] Documentos filtrados (sem executor):`, result.length);
    return result;
  }, [documentos, atividade]);

  useEffect(() => {
    if (isOpen && atividade) {
      console.log('🎯 Modal aberto com atividade:', atividade);
      setFormData({
        tempo_planejado: atividade.tempo_planejado || atividade.tempo || '',
        executor_principal: '',
        multiplos_executores: false,
        metodo_data: 'agenda',
        data_inicio_manual: null,
        permite_multiplas_execucoes: false,
        quantidade_execucoes: 1,
        execucoes: [],
        recorrencia_ativada: false,
        tipo_recorrencia: 'semanal',
        datas_especificas: [],
        data_inicio_recorrencia: null,
        quantidade_ocorrencias: 4,
        documento_id: null
      });
    }
  }, [isOpen, atividade]);

  useEffect(() => {
    if (formData.permite_multiplas_execucoes) {
      const defaultTempo = parseFloat(formData.tempo_planejado) > 0 ? parseFloat(formData.tempo_planejado) : (parseFloat(atividade?.tempo_planejado) > 0 ? parseFloat(atividade.tempo_planejado) : (parseFloat(atividade?.tempo) > 0 ? parseFloat(atividade.tempo) : 0));

      const novasExecucoes = Array.from({ length: formData.quantidade_execucoes }, (_, i) => {
        return formData.execucoes[i] || {
          documento_id: null,
          tempo_planejado: defaultTempo || ''
        };
      });

      setFormData(prev => ({ ...prev, execucoes: novasExecucoes }));
    }
  }, [formData.quantidade_execucoes, formData.permite_multiplas_execucoes, formData.tempo_planejado, atividade?.tempo_planejado, atividade?.tempo]);

  const calculateExecutorLoadAndDistribute = async (executorEmail, tempoPlanejado, fixedStartDate = null) => {
    try {
      console.log('\n🔍 ========================================');
      console.log('📅 CALCULANDO CARGA E DISTRIBUINDO HORAS');
      console.log(`   Executor: ${executorEmail}`);
      console.log(`   Tempo necessário: ${tempoPlanejado}h`);
      console.log(`   Data de início fixa: ${fixedStartDate ? format(fixedStartDate, 'dd/MM/yyyy', { locale: pt }) : 'Nenhuma (Buscar automática)'}`);
      console.log('🔍 ========================================\n');

      console.log('🔄 PASSO 1: Buscando todos os planejamentos do executor...\n');

      const [planejamentosAtividade, planejamentosDocumentoResult] = await Promise.all([
        retryWithBackoff(
          () => PlanejamentoAtividade.filter({
            executor_principal: executorEmail,
            status: { $ne: 'concluido' }
          }),
          3, 1000, 'buscarPlanejamentosAtividade'
        ),
        retryWithBackoff(
          async () => {
            try {
              return await PlanejamentoDocumento.filter({
                executor_principal: executorEmail,
                status: { $ne: 'concluido' }
              });
            } catch (err) {
              console.warn('⚠️ PlanejamentoDocumento não disponível ou erro ao buscar:', err.message);
              return [];
            }
          },
          3, 1000, 'buscarPlanejamentosDocumento'
        )
      ]);

      const todosPlanejamentos = [
        ...(planejamentosAtividade || []),
        ...(planejamentosDocumentoResult || [])
      ];

      console.log(`✅ Total de planejamentos encontrados: ${todosPlanejamentos.length}`);
      console.log(`   📋 PlanejamentoAtividade: ${planejamentosAtividade?.length || 0}`);
      console.log(`   📄 PlanejamentoDocumento: ${planejamentosDocumentoResult?.length || 0}\n`);

      if (todosPlanejamentos.length > 0) {
        console.log(`📊 Detalhes dos primeiros planejamentos:`);
        todosPlanejamentos.slice(0, 5).forEach((p, i) => {
          const horasDias = p.horas_por_dia ? Object.keys(p.horas_por_dia).length : 0;
          console.log(`   ${i + 1}. ${p.descritivo || 'Sem descrição'}`);
          console.log(`      - Tempo planejado: ${p.tempo_planejado || 0}h`);
          console.log(`      - Dias alocados: ${horasDias}`);
          console.log(`      - Status: ${p.status || 'N/A'}`);
        });
        if (todosPlanejamentos.length > 5) {
          console.log(`   ... e mais ${todosPlanejamentos.length - 5} planejamentos`);
        }
        console.log('');
      }

      console.log('🔄 PASSO 2: Construindo mapa de carga diária...\n');

      const cargaDiaria = {};
      const hoje = new Date();
      const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

      let totalDiasOcupados = 0;
      let totalHorasAlocadas = 0;

      todosPlanejamentos.forEach((plano, index) => {
        if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
          const horasKeys = Object.keys(plano.horas_por_dia);

          if (horasKeys.length > 0) {
            console.log(`   Processando plano #${index + 1}: ${plano.descritivo || plano.id}`);
          }

          Object.entries(plano.horas_por_dia).forEach(([data, horas]) => {
            try {
              const dataObj = parseISO(data);

              if (isValid(dataObj) && dataObj >= hojeMidnight) {
                const diaKey = format(dataObj, 'yyyy-MM-dd');
                const horasValidas = Number(horas) || 0;

                if (horasValidas > 0) {
                  const cargaAnterior = cargaDiaria[diaKey] || 0;
                  cargaDiaria[diaKey] = cargaAnterior + horasValidas;
                  totalHorasAlocadas += horasValidas;

                  if (cargaAnterior === 0) {
                    totalDiasOcupados++;
                  }

                  console.log(`      ${format(dataObj, 'dd/MM/yyyy', { locale: pt })}: +${horasValidas.toFixed(1)}h → Total: ${cargaDiaria[diaKey].toFixed(1)}h`);
                }
              }
            } catch (erro) {
              console.warn(`      ⚠️ Erro ao processar data ${data}:`, erro.message);
            }
          });
        }
      });

      console.log(`\n📊 Resumo da carga do executor:`);
      console.log(`   Total de dias ocupados: ${totalDiasOcupados}`);
      console.log(`   Total de horas alocadas: ${totalHorasAlocadas.toFixed(1)}h\n`);

      const diasComCargaAlta = Object.entries(cargaDiaria)
        .filter(([_, horas]) => horas >= 6)
        .sort((a, b) => a[0].localeCompare(b[0]));

      if (diasComCargaAlta.length > 0) {
        console.log(`⚠️ Dias com carga alta (≥6h):`);
        diasComCargaAlta.slice(0, 10).forEach(([data, horas]) => {
          const porcentagem = ((horas / 8) * 100).toFixed(0);
          console.log(`   ${data}: ${horas.toFixed(1)}h (${porcentagem}% da capacidade)`);
        });
        if (diasComCargaAlta.length > 10) {
          console.log(`   ... e mais ${diasComCargaAlta.length - 10} dias\n`);
        }
      }

      let distributionStartDate;
      if (fixedStartDate) {
        distributionStartDate = fixedStartDate;
        console.log(`✅ Usando data de início fixa: ${format(distributionStartDate, 'dd/MM/yyyy', { locale: pt })}\n`);
      } else {
        const hoje = new Date();
        distributionStartDate = getNextWorkingDay(hoje);
        console.log(`✅ Data de início automática: ${format(distributionStartDate, 'dd/MM/yyyy', { locale: pt })}\n`);
      }

      console.log('🔄 PASSO 5: Distribuindo horas na agenda do executor...\n');

      // Se houver data fixa, permitir alocar na data escolhida mesmo com 8h
      const forcarDataFixa = fixedStartDate !== null;

      const resultado = distribuirHorasPorDias(
        distributionStartDate,
        tempoPlanejado,
        8,
        cargaDiaria,
        forcarDataFixa
      );

      const diasDistribuidos = Object.keys(resultado.distribuicao).sort();
      const dataInicio = diasDistribuidos.length > 0 ? diasDistribuidos[0] : format(distributionStartDate, 'yyyy-MM-dd');
      const dataTermino = format(resultado.dataTermino, 'yyyy-MM-dd');

      console.log(`\n✅ ========================================`);
      console.log(`🎯 RESULTADO DO CÁLCULO`);
      console.log(`   Data de início: ${format(parseISO(dataInicio), 'dd/MM/yyyy', { locale: pt })}`);
      console.log(`   Data de término: ${format(parseISO(dataTermino), 'dd/MM/yyyy', { locale: pt })}`);
      console.log(`   Dias utilizados: ${diasDistribuidos.length}`);
      console.log(`\n   Distribuição detalhada:`);

      diasDistribuidos.forEach(dia => {
        const horasDoDia = resultado.distribuicao[dia];
        const cargaTotalDoDia = resultado.novaCargaDiaria[dia];
        const cargaAnterior = cargaDiaria[dia] || 0;
        console.log(`      ${dia}: ${horasDoDia.toFixed(1)}h alocadas | Carga anterior: ${cargaAnterior.toFixed(1)}h | Nova carga: ${cargaTotalDoDia ? cargaTotalDoDia.toFixed(1) : 'N/A'}h`);
      });

      console.log(`✅ ========================================\n`);

      return {
        dataInicio,
        dataTermino,
        horasPorDia: resultado.distribuicao
      };

    } catch (error) {
      console.error('❌ Erro no cálculo da carga/distribuição:', error);

      const proximoDiaUtil = getNextWorkingDay(new Date());
      const dataFallback = format(proximoDiaUtil, 'yyyy-MM-dd');

      console.warn('⚠️ Usando data fallback:', dataFallback);

      return {
        dataInicio: dataFallback,
        dataTermino: dataFallback,
        horasPorDia: { [dataFallback]: tempoPlanejado }
      };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('\n📝 ========================================');
    console.log('🚀 INICIANDO CRIAÇÃO DE PLANEJAMENTO');
    console.log('📝 ========================================\n');
    console.log('Dados do formulário:', formData);

    if (!formData.permite_multiplas_execucoes) {
      if (!formData.tempo_planejado || parseFloat(formData.tempo_planejado) <= 0) {
        alert('Por favor, insira um tempo válido maior que zero.');
        return;
      }
    }

    if (!formData.executor_principal) {
      alert('Por favor, selecione um executor.');
      return;
    }

    if (formData.metodo_data === 'manual' && !formData.recorrencia_ativada && !formData.data_inicio_manual) {
      alert('Por favor, selecione uma data de início.');
      return;
    }

    if (formData.permite_multiplas_execucoes) {
      if (formData.quantidade_execucoes < 1) {
        alert('A quantidade de execuções deve ser pelo menos 1.');
        return;
      }

      const todasExecucoesValidas = formData.execucoes.every(exec =>
        (exec.documento_id || true) && parseFloat(exec.tempo_planejado) > 0
      );

      if (!todasExecucoesValidas) {
        alert('Por favor, insira um tempo válido maior que zero para cada execução.');
        return;
      }
    }

    if (formData.recorrencia_ativada) {
      if (formData.tipo_recorrencia === 'datas_especificas' && formData.datas_especificas.length === 0) {
        alert('Por favor, selecione pelo menos uma data para a recorrência.');
        return;
      }

      if (formData.tipo_recorrencia !== 'datas_especificas' && !formData.data_inicio_recorrencia) {
        alert('Por favor, selecione a data de início da recorrência.');
        return;
      }
    }

    setIsLoading(true);

    try {
      console.log('📋 Filtrando folhas com essa atividade específica...');
      
      // **NOVA LÓGICA**: Filtrar folhas que têm essa atividade E não têm executor
      const baseAtividadeId = atividade.id;
      const disciplinaAtiv = atividade.disciplina;
      const subdisciplinaAtiv = atividade.subdisciplina;
      
      const folhasComAtividade = (documentos || []).filter(doc => {
        // Verificar se a folha tem executor
        if (doc.executor_principal) {
          console.log(`   ⏭️ Folha ${doc.numero}: já tem executor`);
          return false;
        }

        // Verificar se a atividade se aplica a essa folha (por disciplina/subdisciplina)
        const disciplinaMatch = doc.disciplina === disciplinaAtiv;
        const subdisciplinaMatch = !subdisciplinaAtiv || (doc.subdisciplinas || []).includes(subdisciplinaAtiv);
        
        if (!disciplinaMatch || !subdisciplinaMatch) {
          console.log(`   ⏭️ Folha ${doc.numero}: atividade não se aplica (disc/subdisc não match)`);
          return false;
        }
        
        console.log(`   ✅ Folha ${doc.numero}: tem atividade e sem executor`);
        return true;
      });

      console.log(`\n📊 Folhas com essa atividade (sem executor): ${folhasComAtividade.length}`);
      
      if (folhasComAtividade.length === 0) {
        alert('⚠️ Essa atividade não está disponível em nenhuma folha sem executor.\n\nVerifique se:\n• A atividade já foi planejada em todas as folhas\n• Ou a folha não possui essa disciplina/subdisciplina');
        setIsLoading(false);
        return;
      }
      
      const folhasDisponiveis = folhasComAtividade;

      // Confirmar com o usuário
      const confirmacao = window.confirm(
        `📋 Esta atividade será planejada em ${folhasDisponiveis.length} folha(s) sem executor:\n\n` +
        folhasDisponiveis.map(d => `• ${d.numero} - ${d.arquivo}`).slice(0, 5).join('\n') +
        (folhasDisponiveis.length > 5 ? `\n... e mais ${folhasDisponiveis.length - 5} folhas` : '') +
        `\n\nExecutor: ${usuariosOrdenados.find(u => u.email === formData.executor_principal)?.nome}\n` +
        `Tempo: ${formData.tempo_planejado}h por folha\n\nContinuar?`
      );

      if (!confirmacao) {
        setIsLoading(false);
        return;
      }

      let totalCriados = 0;
      let totalErros = 0;

      // **NOVA LÓGICA**: Criar planejamento para cada folha disponível
      for (const folha of folhasDisponiveis) {
        try {
          console.log(`\n📄 Planejando folha ${folha.numero}...`);

          const dadosPlanejamento = {
            atividade_id: atividade.id,
            empreendimento_id: empreendimentoId,
            descritivo: `${atividade.atividade} - ${folha.numero}`,
            base_descritivo: atividade.atividade,
            etapa: atividade.etapa,
            tempo_planejado: parseFloat(formData.tempo_planejado),
            executor_principal: formData.executor_principal,
            executores: [formData.executor_principal],
            status: 'nao_iniciado',
            documento_id: folha.id,
            prioridade: 1
          };

          let dadosCalculo = null;
          const fixedStartDateForDistribution = formData.data_inicio_manual;

          if (formData.metodo_data === 'agenda' && !fixedStartDateForDistribution) {
            console.log('   📅 Calculando data automaticamente (Agenda)...');
            dadosCalculo = await calculateExecutorLoadAndDistribute(
              formData.executor_principal,
              dadosPlanejamento.tempo_planejado,
              null
            );
          } else if (fixedStartDateForDistribution) {
            console.log('   📅 Calculando distribuição para data fixa...');
            dadosCalculo = await calculateExecutorLoadAndDistribute(
              formData.executor_principal,
              dadosPlanejamento.tempo_planejado,
              fixedStartDateForDistribution
            );
          } else {
            console.warn('   ⚠️ Usando modo agenda como fallback.');
            dadosCalculo = await calculateExecutorLoadAndDistribute(
              formData.executor_principal,
              dadosPlanejamento.tempo_planejado,
              null
            );
          }

          dadosPlanejamento.inicio_planejado = dadosCalculo.dataInicio;
          dadosPlanejamento.termino_planejado = dadosCalculo.dataTermino;
          dadosPlanejamento.horas_por_dia = dadosCalculo.horasPorDia;

          console.log('   💾 Criando planejamento:', {
            folha: folha.numero,
            executor: dadosPlanejamento.executor_principal,
            tempo: dadosPlanejamento.tempo_planejado,
            inicio: dadosPlanejamento.inicio_planejado,
            termino: dadosPlanejamento.termino_planejado
          });

          await retryWithBackoff(
            () => PlanejamentoAtividade.create(dadosPlanejamento),
            3, 1000, `createPlanejamentoAtividade-${folha.id}`
          );
          
          totalCriados++;
          console.log('   ✅ Criado com sucesso\n');

          // **NOVO**: Marcar a atividade como "planejada"
          try {
            const { Atividade } = await import('@/entities/all');
            await Atividade.update(atividade.id, { status_planejamento: 'planejada' });
            console.log('   ✅ Atividade marcada como planejada');
          } catch (error) {
            console.warn('   ⚠️ Erro ao marcar atividade como planejada:', error);
          }
          
        } catch (error) {
          totalErros++;
          console.error(`   ❌ Erro ao planejar folha ${folha.numero}:`, error);
        }
      }

      console.log('\n✅ ========================================');
      console.log('🎉 PROCESSO CONCLUÍDO');
      console.log(`   Sucessos: ${totalCriados}`);
      console.log(`   Erros: ${totalErros}`);
      console.log('✅ ========================================\n');

      alert(
        `✅ Planejamento concluído!\n\n` +
        `• ${totalCriados} folha(s) planejada(s) com sucesso\n` +
        (totalErros > 0 ? `• ${totalErros} erro(s) (veja o console)` : '')
      );

      if (onSuccess) onSuccess();
      onClose();

    } catch (error) {
      console.error('❌ ========================================');
      console.error('❌ ERRO AO CRIAR PLANEJAMENTO');
      console.error('❌ ========================================');
      console.error('Erro:', error);
      console.error('Stack:', error.stack);
      console.error('❌ ========================================\n');

      alert('Erro ao criar planejamento: ' + (error.message || 'Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecutorChange = (value) => {
    console.log('Executor selecionado:', value);
    setFormData(prev => ({ ...prev, executor_principal: value }));
  };

  const handleMultiplosExecutoresChange = (checked) => {
    console.log('Múltiplos executores:', checked);
    setFormData(prev => ({
      ...prev,
      multiplos_executores: checked,
      executor_principal: checked ? '' : prev.executor_principal
    }));
  };

  const handlePermiteMultiplasExecucoesChange = (checked) => {
    console.log('Permite múltiplas execuções:', checked);
    setFormData(prev => ({
      ...prev,
      permite_multiplas_execucoes: checked,
      documento_id: checked ? null : prev.documento_id,
      execucoes: checked ? Array.from({ length: prev.quantidade_execucoes || 1 }, () => ({
        documento_id: null,
        tempo_planejado: prev.tempo_planejado || ''
      })) : []
    }));
  };

  const handleRecorrenciaChange = (checked) => {
    console.log('Recorrência ativada:', checked);
    setFormData(prev => ({
      ...prev,
      recorrencia_ativada: checked,
      datas_especificas: [],
      data_inicio_recorrencia: null,
      data_inicio_manual: null
    }));
  };

  const handleTipoRecorrenciaChange = (value) => {
    console.log('Tipo de recorrência:', value);
    setFormData(prev => ({
      ...prev,
      tipo_recorrencia: value,
      datas_especificas: [],
      data_inicio_recorrencia: null
    }));
  };

  const handleAdicionarDataEspecifica = (date) => {
    if (date) {
      console.log('Adicionando data:', date);
      setFormData(prev => ({
        ...prev,
        datas_especificas: [...prev.datas_especificas, date].sort((a, b) => a.getTime() - b.getTime())
      }));
    }
  };

  const handleRemoverDataEspecifica = (index) => {
    console.log('Removendo data no índice:', index);
    setFormData(prev => ({
      ...prev,
      datas_especificas: prev.datas_especificas.filter((_, i) => i !== index)
    }));
  };

  const handleExecucaoChange = (index, field, value) => {
    console.log(`Atualizando execução ${index}, campo ${field}:`, value);
    setFormData(prev => ({
      ...prev,
      execucoes: prev.execucoes.map((exec, i) =>
        i === index ? { ...exec, [field]: value } : exec
      )
    }));
  };

  if (!atividade) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5" />
            Planejar Atividade
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <Label>Atividade</Label>
              <Input value={atividade.atividade} disabled className="bg-gray-50" />
            </div>

            {!formData.permite_multiplas_execucoes && (
              <div>
                <Label htmlFor="tempo_planejado">Tempo Planejado (horas)</Label>
                <Input
                  id="tempo_planejado"
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={formData.tempo_planejado}
                  onChange={(e) => setFormData(prev => ({ ...prev, tempo_planejado: e.target.value }))}
                  required
                />
              </div>
            )}

            <div>
              <Label htmlFor="executor_principal" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Executor (aplicará em todas as folhas sem executor)
              </Label>
              <Select
                value={formData.executor_principal}
                onValueChange={handleExecutorChange}
                required
              >
                <SelectTrigger id="executor_principal">
                  <SelectValue placeholder="Selecione o executor" />
                </SelectTrigger>
                <SelectContent>
                  {usuariosOrdenados && usuariosOrdenados.length > 0 ? (
                    usuariosOrdenados.map(u => (
                      <SelectItem key={u.id} value={u.email}>
                        {u.nome || u.email}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={null} disabled>Nenhum usuário disponível</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                💡 A atividade será planejada apenas em folhas que ainda não têm executor definido
              </p>
            </div>

            <div>
              <Label htmlFor="metodo_data">Método de Cálculo da Data</Label>
              <Select
                value={formData.metodo_data}
                onValueChange={(value) => setFormData(prev => ({ ...prev, metodo_data: value, data_inicio_manual: null }))}
              >
                <SelectTrigger id="metodo_data">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agenda">Automático - Encontrar melhor sequência</SelectItem>
                  <SelectItem value="manual">Manual - Definir data específica</SelectItem>
                </SelectContent>
              </Select>
              {formData.metodo_data === 'agenda' ? (
                <p className="text-xs text-green-600 mt-1">
                  ✓ O sistema buscará automaticamente a próxima sequência de datas disponíveis na agenda do executor, considerando suas atividades atuais.
                </p>
              ) : (
                <p className="text-xs text-blue-600 mt-1">
                  ℹ️ Você poderá escolher a data de início manualmente.
                </p>
              )}
            </div>

            {formData.metodo_data === 'manual' && !formData.recorrencia_ativada && (
              <div>
                <Label>Data de Início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" type="button" className="w-full justify-start">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {formData.data_inicio_manual
                        ? format(formData.data_inicio_manual, 'dd/MM/yyyy', { locale: pt })
                        : 'Selecione a data'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.data_inicio_manual}
                      onSelect={(date) => setFormData(prev => ({ ...prev, data_inicio_manual: date }))}
                      locale={pt}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}



            <div className="flex items-center space-x-2">
              <Checkbox
                id="permite_multiplas_execucoes"
                checked={formData.permite_multiplas_execucoes}
                onCheckedChange={handlePermiteMultiplasExecucoesChange}
              />
              <Label htmlFor="permite_multiplas_execucoes" className="cursor-pointer">
                Múltiplas execuções (no mesmo dia)
              </Label>
            </div>

            {formData.permite_multiplas_execucoes && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="space-y-2">
                  <Label>Quantidade de Execuções</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.quantidade_execucoes}
                    onChange={(e) => {
                      const valor = parseInt(e.target.value) || 1;
                      setFormData(prev => ({
                        ...prev,
                        quantidade_execucoes: Math.max(1, valor)
                      }));
                    }}
                    placeholder="Ex: 4"
                  />
                </div>

                {formData.execucoes.map((execucao, idx) => (
                  <div key={idx} className="space-y-3 p-3 bg-white rounded border">
                    <h4 className="font-medium text-sm">Execução #{idx + 1}</h4>

                    <div className="space-y-2">
                      <Label>Documento (Folha)</Label>
                      <Select
                        value={execucao.documento_id || 'none'}
                        onValueChange={(value) => {
                          handleExecucaoChange(idx, 'documento_id', value === 'none' ? null : value);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem documento vinculado" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem documento vinculado</SelectItem>
                          {(documentosDisponiveis.length > 0 || atividade.disciplina === 'Documentação') ? (
                            (documentosDisponiveis.length > 0 ? documentosDisponiveis : documentos).map(doc => (
                              <SelectItem key={doc.id} value={doc.id}>
                                {doc.numero} - {doc.arquivo}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="no-docs" disabled>
                              Nenhum documento disponível
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Tempo (horas)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={execucao.tempo_planejado}
                        onChange={(e) => {
                          handleExecucaoChange(idx, 'tempo_planejado', e.target.value);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox
                id="recorrencia"
                checked={formData.recorrencia_ativada}
                onCheckedChange={handleRecorrenciaChange}
              />
              <Label htmlFor="recorrencia" className="cursor-pointer">
                Criar em múltiplas datas (recorrência)
              </Label>
            </div>

            {formData.recorrencia_ativada && (
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
                <div>
                  <Label htmlFor="tipo_recorrencia">Tipo de Recorrência</Label>
                  <Select
                    value={formData.tipo_recorrencia}
                    onValueChange={handleTipoRecorrenciaChange}
                  >
                    <SelectTrigger id="tipo_recorrencia">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="datas_especificas">Datas Específicas</SelectItem>
                      <SelectItem value="diaria">Diária</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipo_recorrencia === 'datas_especificas' ? (
                  <div className="space-y-3">
                    <Label>Selecione as Datas</Label>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" type="button" className="w-full">
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar Data
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={null}
                          onSelect={handleAdicionarDataEspecifica}
                          locale={pt}
                        />
                      </PopoverContent>
                    </Popover>

                    {formData.datas_especificas.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold">
                          Datas Selecionadas ({formData.datas_especificas.length})
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {formData.datas_especificas.map((data, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 px-3 py-1 bg-white rounded border text-sm"
                            >
                              <CalendarIcon className="w-3 h-3" />
                              <span>{format(data, 'dd/MM/yyyy', { locale: pt })}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoverDataEspecifica(index)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label>Data de Início</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" type="button" className="w-full justify-start">
                            <CalendarIcon className="w-4 h-4 mr-2" />
                            {formData.data_inicio_recorrencia
                              ? format(formData.data_inicio_recorrencia, 'dd/MM/yyyy', { locale: pt })
                              : 'Selecione a data'
                            }
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.data_inicio_recorrencia}
                            onSelect={(date) => setFormData(prev => ({ ...prev, data_inicio_recorrencia: date }))}
                            locale={pt}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <Label htmlFor="quantidade_ocorrencias">Quantidade de Ocorrências</Label>
                      <Input
                        id="quantidade_ocorrencias"
                        type="number"
                        min="1"
                        max="52"
                        value={formData.quantidade_ocorrencias}
                        onChange={(e) => setFormData(prev => ({ ...prev, quantidade_ocorrencias: parseInt(e.target.value) || 1 }))}
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        Serão criados {formData.quantidade_ocorrencias} planejamentos{' '}
                        {formData.tipo_recorrencia === 'diaria' && 'diariamente'}
                        {formData.tipo_recorrencia === 'semanal' && 'semanalmente'}
                        {formData.tipo_recorrencia === 'mensal' && 'mensalmente'}
                      </p>
                    </div>

                    {formData.data_inicio_recorrencia && (
                      <div className="p-3 bg-white rounded border">
                        <Label className="text-xs font-semibold mb-2 block">Preview das Datas:</Label>
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: Math.min(formData.quantidade_ocorrencias, 10) }, (_, i) => {
                            let data = formData.data_inicio_recorrencia;
                            if (formData.tipo_recorrencia === 'diaria') {
                              data = addDays(data, i);
                            } else if (formData.tipo_recorrencia === 'semanal') {
                              data = addWeeks(data, i);
                            } else if (formData.tipo_recorrencia === 'mensal') {
                              data = addMonths(data, i);
                            }
                            return (
                              <div key={i} className="px-2 py-1 bg-purple-100 rounded text-xs">
                                {format(data, 'dd/MM/yyyy', { locale: pt })}
                              </div>
                            );
                          })}
                          {formData.quantidade_ocorrencias > 10 && (
                            <div className="px-2 py-1 text-xs text-gray-500">
                              ... e mais {formData.quantidade_ocorrencias - 10}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Planejar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}