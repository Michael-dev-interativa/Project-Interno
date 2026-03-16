
import { PlanejamentoAtividade } from "@/entities/all";
import { distribuirHorasPorDias } from './DateCalculator';
import { startOfDay, isBefore, parseISO } from 'date-fns';
import { retryWithBackoff, executeSequentialWithDelay } from './apiUtils';

/**
 * SIMULA o reagendamento para fornecer uma pré-visualização, sem salvar no banco.
 * @param {Array} atividadesAtrasadas - Lista de atividades atrasadas.
 * @param {Array} todosPlanejamentos - Contexto completo dos planejamentos.
 * @returns {Promise<{success: boolean, changes: Array, message: string}>}
 */
export const simularReagendamento = async (atividadesAtrasadas, todosPlanejamentos) => {
  if (!atividadesAtrasadas || atividadesAtrasadas.length === 0) {
    return { success: true, changes: [], message: "Nenhuma atividade para simular." };
  }

  console.log('[simularReagendamento] 🚀 Iniciando simulação de reagendamento...');
  
  const hoje = startOfDay(new Date());
  const overdueIds = new Set(atividadesAtrasadas.map(p => p.id));
  const mudancasPropostas = [];

  const atividadesPorExecutor = todosPlanejamentos.reduce((acc, p) => {
    const executor = p.executor_principal;
    if (executor) {
      if (!acc[executor]) acc[executor] = [];
      acc[executor].push(p);
    }
    return acc;
  }, {});

  for (const executorEmail in atividadesPorExecutor) {
    console.log(`[SIMULAÇÃO] 🧑‍💻 Processando executor: ${executorEmail}`);
    const planosDoExecutor = atividadesPorExecutor[executorEmail];
    
    // **CORREÇÃO**: Adicionar 'pausado' à lista de status fixos
    const planosFixos = planosDoExecutor.filter(p => p.status === 'concluido' || p.status === 'em_andamento' || p.status === 'pausado');
    const atividadesParaReagendar = planosDoExecutor.filter(p => 
        p.status !== 'concluido' && 
        p.status !== 'em_andamento' &&
        p.status !== 'pausado' && // Adicionado filtro explícito para 'pausado'
        (p.tempo_planejado || 0) > 0
    );

    // **NOVO**: Ordenar as atividades a serem reagendadas pela data de término planejada mais antiga.
    atividadesParaReagendar.sort((a, b) => {
        const dateA = a.termino_planejado ? parseISO(a.termino_planejado) : null;
        const dateB = b.termino_planejado ? parseISO(b.termino_planejado) : null;

        if (dateA && dateB) {
            if (dateA.getTime() < dateB.getTime()) return -1;
            if (dateA.getTime() > dateB.getTime()) return 1;
        } else if (dateA) {
            return -1; // 'a' tem data, 'b' não tem, então 'a' vem primeiro
        } else if (dateB) {
            return 1;  // 'b' tem data, 'a' não tem, então 'b' vem primeiro
        }

        // Fallback para data de início planejada se a de término não existir
        const startDateA = a.inicio_planejado ? parseISO(a.inicio_planejado) : null;
        const startDateB = b.inicio_planejado ? parseISO(b.inicio_planejado) : null;

        if (startDateA && startDateB) {
            if (startDateA.getTime() < startDateB.getTime()) return -1;
            if (startDateA.getTime() > startDateB.getTime()) return 1;
        } else if (startDateA) {
            return -1;
        } else if (startDateB) {
            return 1;
        }

        return 0; // Mantém a ordem se nenhuma data estiver disponível
    });
    
    if (atividadesParaReagendar.length === 0) continue;

    // cargaDiariaGeral agora representa a ocupação de todos os planos, fixos e reagendados
    // Ela é o estado "mutável" que distribuiHorasPorDias usará para encontrar espaço
    const cargaDiariaGeral = {};
    planosFixos.forEach(p => {
      if (p.horas_por_dia) {
        Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
          cargaDiariaGeral[data] = (cargaDiariaGeral[data] || 0) + Number(horas || 0);
        });
      }
    });

    atividadesParaReagendar.forEach(plano => {
        const tempoRestante = Math.max(0.1, (plano.tempo_planejado || 0) - (plano.tempo_executado || 0));

        // LÓGICA CORRIGIDA: A data de partida é sempre 'hoje' ou a data original do plano,
        // garantindo que atividades passadas comecem de hoje e futuras respeitem o início,
        // mas o "distribuirHorasPorDias" encontrará o primeiro slot disponível no `cargaDiariaGeral`.
        const planoDataOriginal = plano.inicio_planejado ? startOfDay(new Date(plano.inicio_planejado)) : hoje;
        const dataDePartida = isBefore(planoDataOriginal, hoje) ? hoje : planoDataOriginal;

        const { distribuicao, dataTermino } = distribuirHorasPorDias(dataDePartida, tempoRestante, 8, cargaDiariaGeral);
        
        if (Object.keys(distribuicao).length > 0) {
            const diasAlocados = Object.keys(distribuicao).sort();
            const novoInicio = diasAlocados[0];
            const novoTermino = diasAlocados[diasAlocados.length - 1]; // Novo término é o último dia alocado

            // Atualizar a carga diária para o próximo cálculo, refletindo as horas recém-alocadas
            Object.entries(distribuicao).forEach(([data, horas]) => {
                cargaDiariaGeral[data] = (cargaDiariaGeral[data] || 0) + horas;
            });

            mudancasPropostas.push({
                id: plano.id,
                descritivo: plano.descritivo || plano.atividade?.atividade,
                executor_principal: plano.executor_principal,
                inicio_planejado: plano.inicio_planejado,
                termino_planejado: plano.termino_planejado,
                novo_inicio: novoInicio,
                novo_termino: novoTermino,
                nova_distribuicao: distribuicao,
                tempo_planejado: plano.tempo_planejado,
            });

        } else {
            console.warn(`[simularReagendamento] ⚠️ Não foi possível alocar horas para ${plano.id}`);
        }
    });
  }

  console.log(`[SIMULAÇÃO] ✅ Simulação concluída. ${mudancasPropostas.length} mudanças propostas.`);
  return { success: true, changes: mudancasPropostas };
};

/**
 * APLICA as mudanças propostas pelo reagendamento no banco de dados.
 * @param {Array} mudancas - A lista de mudanças gerada pela simulação.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const aplicarReagendamento = async (mudancas) => {
  if (!mudancas || mudancas.length === 0) {
    return { success: true, message: "Nenhuma mudança para aplicar." };
  }

  console.log(`[aplicarReagendamento] 💾 Aplicando ${mudancas.length} mudanças em fila...`);

  // **CORREÇÃO**: Criar uma fila de tarefas para executar sequencialmente
  const tasks = mudancas.map(item => {
    // A função a ser executada para cada item
    return async () => {
      const updateData = {
        inicio_ajustado: item.novo_inicio,
        termino_ajustado: item.novo_termino,
        horas_por_dia: item.nova_distribuicao,
        status: 'nao_iniciado',
      };
      
      // A própria tarefa usa retryWithBackoff para resiliência individual
      await retryWithBackoff(
        () => PlanejamentoAtividade.update(item.id, updateData),
        3, 
        1000, 
        `apply-replan-${item.id}`
      );
    };
  });

  try {
    // **CORREÇÃO**: Aumentar o delay para evitar rate limit
    const results = await executeSequentialWithDelay(tasks, 400); // Aumentado de 150ms para 400ms

    const falhas = results.filter(r => r === null).length;

    if (falhas > 0) {
      const errorMsg = `${falhas} de ${mudancas.length} atividades não puderam ser salvas.`;
      console.warn(`[aplicarReagendamento] ⚠️ ${errorMsg}`);
      return { success: false, message: `${errorMsg} Verifique o console e tente novamente.` };
    }

    const successMsg = `${mudancas.length} atividades foram reagendadas com sucesso.`;
    console.log(`[aplicarReagendamento] ✅ ${successMsg}`);
    return { success: true, message: successMsg };

  } catch (error) {
    // Este bloco é para erros inesperados no próprio processo de enfileiramento
    const errorMsg = "Ocorreu um erro inesperado ao processar a fila de reagendamento.";
    console.error(`[aplicarReagendamento] ❌ ${errorMsg}`, error);
    return { success: false, message: `${errorMsg} Verifique o console.` };
  }
};
