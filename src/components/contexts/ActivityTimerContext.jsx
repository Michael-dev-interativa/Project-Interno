import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Execucao, User, PlanejamentoAtividade, SobraUsuario, AtividadeGenerica, Empreendimento, PlanejamentoDocumento, Usuario } from '@/entities/all';
import { useIdleDetection } from '../hooks/useIdleDetection';
import IdleWarningModal from '../layout/IdleWarningModal';
import { retryWithBackoff, retryWithExtendedBackoff } from '../utils/apiUtils';
import { distribuirHorasSimples } from '../utils/DateCalculator';
import { format, parseISO, isValid } from 'date-fns';

export const ActivityTimerContext = createContext();

const calculateElapsedTime = (startDateString, endDate) => {
    try {
        const startDate = typeof startDateString === 'string' ? parseISO(startDateString) : startDateString;

        if (!isValid(startDate)) {
            console.error('❌ [calculateElapsedTime] Data de início inválida:', startDateString);
            return 0;
        }

        if (!isValid(endDate)) {
            console.error('❌ [calculateElapsedTime] Data de término inválida:', endDate);
            return 0;
        }

        const diffMs = endDate.getTime() - startDate.getTime();

        if (diffMs < 0) {
            console.error('❌ [calculateElapsedTime] Tempo negativo detectado!', {
                inicio: startDate.toISOString(),
                fim: endDate.toISOString(),
                diferenca: diffMs
            });
            return 0;
        }

        const hours = diffMs / (1000 * 60 * 60);

        if (hours > 24) {
            console.warn('⚠️ [calculateElapsedTime] Tempo excessivo detectado (>24h), limitando a 8h:', {
                inicio: startDate.toISOString(),
                fim: endDate.toISOString(),
                horas: hours.toFixed(2)
            });
            return 8;
        }

        console.log('✅ [calculateElapsedTime] Cálculo realizado:', {
            inicio: startDate.toISOString(),
            fim: endDate.toISOString(),
            diferencaMs: diffMs,
            horas: hours.toFixed(4)
        });

        return hours;
    } catch (error) {
        console.error('❌ [calculateElapsedTime] Erro ao calcular tempo:', error);
        return 0;
    }
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export const ActivityTimerProvider = ({ children }) => {
    const [activeExecution, setActiveExecution] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [updateKey, setUpdateKey] = useState(0);
    const [isStarting, setIsStarting] = useState(null);
    const [isFinishing, setIsFinishing] = useState(false);
    const [isPausing, setIsPausing] = useState(null);

    const [playlist, setPlaylist] = useState([]);
    const [allPlanejamentos, setAllPlanejamentos] = useState([]);
    const [isLoadingPlanejamentos, setIsLoadingPlanejamentos] = useState(false);
    const [atividadesGenericas, setAtividadesGenericas] = useState([]);
    const [allEmpreendimentos, setAllEmpreendimentos] = useState([]);
    const [allUsers, setAllUsers] = useState([]);

    const triggerUpdate = useCallback(() => {
        console.log("🔄 Acionando atualização de dados (updateKey)...");
        setUpdateKey(prevKey => prevKey + 1);
    }, []);

    const perfisHierarquia = {
        'direcao': 6,
        'gestao': 5,
        'lider': 4,
        'coordenador': 3,
        'apoio': 2,
        'consultor': 1,
        'user': 1
    };

    const perfilAtual = userProfile?.perfil || user?.perfil || 'user';
    const nivelUsuario = perfisHierarquia[perfilAtual] || 1;
    const isAdmin = user?.role === 'admin';

    const hasPermission = useCallback((nivelMinimo) => {
        return isAdmin || nivelUsuario >= perfisHierarquia[nivelMinimo];
    }, [isAdmin, nivelUsuario]);

    const isColaborador = nivelUsuario === 1 && !isAdmin;
    const isGestao = perfilAtual === 'gestao';
    const isCoordenador = perfilAtual === 'coordenador';

    const getPlanejamento = useCallback(async (id) => {
        if (!id) return null;
        try {
            const results = await retryWithBackoff(
                async () => {
                    const filtered = await PlanejamentoAtividade.filter({ id: id });
                    return filtered;
                },
                3,
                1000,
                'getPlanejamento'
            );

            if (results && results.length > 0) {
                return results[0];
            }

            // Tentar buscar em PlanejamentoDocumento se não encontrar
            try {
                const resultsDoc = await retryWithBackoff(
                    async () => {
                        const filtered = await PlanejamentoDocumento.filter({ id: id });
                        return filtered;
                    },
                    2,
                    500,
                    'getPlanejamentoDoc'
                );

                if (resultsDoc && resultsDoc.length > 0) {
                    return resultsDoc[0];
                }
            } catch (e) {
                console.log('Não encontrado em PlanejamentoDocumento');
            }

            console.warn(`[getPlanejamento] Planejamento com ID ${id} não encontrado.`);
            return null;

        } catch (error) {
            console.error(`Erro ao buscar planejamento ${id}:`, error);
            return null;
        }
    }, []);

    const updatePlanejamento = useCallback(async (planejamentoId, tempoAdicional, finalStatus, observacao = null, diaExecucao = null) => {
        if (!planejamentoId) {
            console.warn('⚠️ [updatePlanejamento] planejamentoId é null/undefined, abortando');
            return;
        }

        // SEMPRE usar o dia atual da execução - NUNCA redistribuir em outros dias
        const diaParaRegistrar = diaExecucao || format(new Date(), 'yyyy-MM-dd');

        console.log(`\n🔧 [updatePlanejamento] INICIANDO ATUALIZAÇÃO`);
        console.log(`   Planejamento ID: ${planejamentoId}`);
        console.log(`   Tempo adicional: ${tempoAdicional?.toFixed(4)}h`);
        console.log(`   Status final: ${finalStatus}`);
        console.log(`   🗓️ Dia de execução (FIXO): ${diaParaRegistrar} - NÃO será redistribuído`);
        console.log(`   Observação: ${observacao || 'N/A'}`);

        try {
            let planejamento = null;
            let isDocumento = false;

            try {
                const resultAtiv = await retryWithBackoff(() => PlanejamentoAtividade.filter({ id: planejamentoId }), 2, 500, 'updatePlanejamento.findAtiv');
                if (resultAtiv && resultAtiv.length > 0) {
                    planejamento = resultAtiv[0];
                    console.log(`   ✅ Encontrado em PlanejamentoAtividade`);
                }
            } catch (e) {
                console.log("   Não encontrado em PlanejamentoAtividade, tentando PlanejamentoDocumento...");
            }

            if (!planejamento) {
                try {
                    const resultDoc = await retryWithBackoff(() => PlanejamentoDocumento.filter({ id: planejamentoId }), 2, 500, 'updatePlanejamento.findDoc');
                    if (resultDoc && resultDoc.length > 0) {
                        planejamento = resultDoc[0];
                        isDocumento = true;
                        console.log(`   ✅ Encontrado em PlanejamentoDocumento`);
                    }
                } catch (e) {
                    console.log("   Também não encontrado em PlanejamentoDocumento");
                }
            }

            if (!planejamento) {
                console.error(`❌ [updatePlanejamento] Planejamento ${planejamentoId} NÃO ENCONTRADO`);
                return;
            }

            const tempoExecutadoAtual = Number(planejamento.tempo_executado || 0);
            const novoTempoExecutado = tempoExecutadoAtual + tempoAdicional;

            const isAtividadeRapida = planejamento.is_quick_activity === true;

            console.log(`   📊 Tempo executado atual: ${tempoExecutadoAtual.toFixed(4)}h`);
            console.log(`   📊 Novo tempo executado: ${novoTempoExecutado.toFixed(4)}h`);
            console.log(`   📊 is_quick_activity: ${planejamento.is_quick_activity}`);
            console.log(`   📊 Tipo: ${isAtividadeRapida ? 'Atividade Rápida' : 'Atividade Normal'}`);

            const updateData = {
                tempo_executado: novoTempoExecutado,
            };

            if (observacao) {
                updateData.observacao = observacao;
                console.log(`   💬 Salvando observação no planejamento`);
            }

            // IMPORTANTE: Registrar horas APENAS no dia da execução, NUNCA redistribuir
            const horasExecutadasPorDia = planejamento.horas_executadas_por_dia || {};
            const horasAnteriorNoDia = horasExecutadasPorDia[diaParaRegistrar] || 0;
            const novasHorasNoDia = horasAnteriorNoDia + tempoAdicional;
            horasExecutadasPorDia[diaParaRegistrar] = novasHorasNoDia;
            updateData.horas_executadas_por_dia = horasExecutadasPorDia;
            console.log(`   📅 Horas executadas em ${diaParaRegistrar}:`);
            console.log(`      Anterior: ${horasAnteriorNoDia.toFixed(4)}h`);
            console.log(`      Adicional: ${tempoAdicional.toFixed(4)}h`);
            console.log(`      Total no dia: ${novasHorasNoDia.toFixed(4)}h`);
            console.log(`      ✅ Horas ficam FIXAS neste dia, sem redistribuição`);

            // RESPEITAR O finalStatus PASSADO EXPLICITAMENTE
            if (finalStatus === 'concluido') {
                updateData.status = 'concluido';
                updateData.termino_real = format(new Date(), 'yyyy-MM-dd');
                if (!planejamento.inicio_real) {
                    updateData.inicio_real = diaParaRegistrar;
                }
                console.log(`   🏁 Finalizando atividade explicitamente`);

                // Para atividades rápidas, atualizar tempo_planejado e horas_por_dia
                if (isAtividadeRapida) {
                    updateData.tempo_planejado = novoTempoExecutado;
                    const diaDaAtividade = planejamento.inicio_planejado || diaParaRegistrar;
                    updateData.horas_por_dia = { [diaDaAtividade]: novoTempoExecutado };
                    console.log(`   ⚡ Atividade rápida - atualizando tempo_planejado=${novoTempoExecutado.toFixed(4)}h`);
                }

            } else if (finalStatus === 'pausado') {
                updateData.status = 'pausado';
                console.log(`   ⏸️ Pausando atividade explicitamente - NUNCA marcar como concluído`);

                // Para atividades rápidas, atualizar tempo_planejado e horas_por_dia
                if (isAtividadeRapida) {
                    updateData.tempo_planejado = novoTempoExecutado;
                    const diaDaAtividade = planejamento.inicio_planejado || diaParaRegistrar;
                    updateData.horas_por_dia = { [diaDaAtividade]: novoTempoExecutado };
                    console.log(`   ⚡ Atividade rápida pausada - tempo_planejado=${novoTempoExecutado.toFixed(4)}h`);
                }

            } else {
                // Quando não há finalStatus especificado, apenas atualizar tempo mas manter status atual
                // NUNCA marcar como concluído automaticamente - só quando explicitamente finalizado
                if (isAtividadeRapida) {
                    updateData.tempo_planejado = novoTempoExecutado;
                    const diaDaAtividade = planejamento.inicio_planejado || diaParaRegistrar;
                    updateData.horas_por_dia = { [diaDaAtividade]: novoTempoExecutado };
                    updateData.status = 'em_andamento';
                    console.log(`   ⚡ Atividade rápida - atualizando tempo_planejado=${novoTempoExecutado.toFixed(4)}h e status para em_andamento`);
                } else {
                    // Para atividades normais, manter em andamento independente do tempo
                    updateData.status = 'em_andamento';
                    if (!planejamento.inicio_real) {
                        updateData.inicio_real = diaParaRegistrar;
                    }
                    console.log(`   ▶️ Marcando como em andamento (tempo executado: ${novoTempoExecutado.toFixed(2)}h / planejado: ${(Number(planejamento.tempo_planejado) || 0).toFixed(2)}h)`);
                }
            }

            console.log(`   💾 Salvando atualização no banco...`);
            console.log(`   📦 Dados a serem salvos:`, updateData);
            console.log(`   📦 Tipo de entidade: ${isDocumento ? 'PlanejamentoDocumento' : 'PlanejamentoAtividade'}`);

            const entityToUpdate = isDocumento ? PlanejamentoDocumento : PlanejamentoAtividade;

            const updatedPlano = await retryWithBackoff(
                () => entityToUpdate.update(planejamento.id, updateData),
                3, 1000, 'updatePlanejamento.update'
            );

            console.log(`✅ [updatePlanejamento] ${isDocumento ? 'PlanejamentoDocumento' : 'PlanejamentoAtividade'} ${planejamento.id} ATUALIZADO COM SUCESSO`);
            console.log(`   Resposta do servidor:`, updatedPlano);
            console.log(`   Novo tempo_executado: ${updatedPlano.tempo_executado?.toFixed(2)}h`);
            console.log(`   Status salvo: ${updatedPlano.status}`);
            console.log(`   Status esperado: ${updateData.status}`);
            if (updatedPlano.status !== updateData.status) {
                console.error(`   ❌ ERRO: Status não foi atualizado corretamente! Esperado: ${updateData.status}, Recebido: ${updatedPlano.status}`);
            }
            if (updateData.observacao) {
                console.log(`   Observação salva: "${updateData.observacao}"`);
            }
            console.log();

            triggerUpdate();
        } catch (error) {
            console.error("❌ [updatePlanejamento] ERRO AO ATUALIZAR:", error);
            console.error("   Stack:", error.stack);
        }
    }, [triggerUpdate]);

    const cleanupDuplicateExecutions = useCallback(async (userEmail) => {
        if (!userEmail) return;

        try {
            const execucoesEncontradas = await retryWithBackoff(
                () => Execucao.filter({
                    usuario: userEmail,
                    status: 'Em andamento'
                }),
                3,
                1000,
                'cleanupDuplicateExecutions'
            );

            const execucoesAtivas = (execucoesEncontradas || []).filter(exec => {
                return exec?.usuario === userEmail && exec?.status === 'Em andamento' && !exec?.termino;
            });

            if (execucoesAtivas && execucoesAtivas.length > 1) {
                console.warn(`⚠️ Detectadas ${execucoesAtivas.length} execuções ativas para ${userEmail}. Mantendo apenas a mais recente...`);

                const sortedExecutions = [...execucoesAtivas].sort((a, b) =>
                    new Date(b.inicio) - new Date(a.inicio)
                );

                for (let i = 1; i < sortedExecutions.length; i++) {
                    const exec = sortedExecutions[i];
                    console.log(`⏸️ Pausando execução duplicada: ${exec.id} (${exec.descritivo})`);

                    const agora = new Date();
                    const tempoDecorrido = calculateElapsedTime(exec.inicio, agora);

                    await retryWithBackoff(
                        () => Execucao.update(exec.id, {
                            status: 'Paralisado',
                            termino: agora.toISOString(),
                            tempo_total: tempoDecorrido,
                            observacao: 'Pausado automaticamente - execução duplicada detectada',
                            pausado_automaticamente: true
                        }),
                        3, 1000, `pauseDuplicate-${exec.id}`
                    );

                    if (exec.planejamento_id) {
                        // SEMPRE usar a data de hoje - horas executadas ficam no dia da execução
                        const diaExec = format(new Date(), 'yyyy-MM-dd');
                        console.log(`   🗓️ Pausando duplicata - ${tempoDecorrido.toFixed(2)}h ficam registradas em ${diaExec}`);
                        await updatePlanejamento(exec.planejamento_id, tempoDecorrido, 'pausado', 'Pausado automaticamente - execução duplicada detectada', diaExec);
                    }
                }

                return execucoesAtivas && execucoesAtivas.length > 0 ? sortedExecutions[0] : null;
            }

            return execucoesAtivas && execucoesAtivas.length > 0 ? execucoesAtivas[0] : null;
        } catch (error) {
            console.error('❌ Erro ao limpar execuções duplicadas:', error);
            return null;
        }
    }, [updatePlanejamento]);

    const refreshActiveExecution = useCallback(async () => {
        if (!user?.email) return;

        try {
            console.log('🔄 [refreshActiveExecution] Buscando execuções ativas...');

            const execucaoAtiva = await cleanupDuplicateExecutions(user.email);

            if (execucaoAtiva) {
                const agora = new Date();
                const horasDesdeInicio = calculateElapsedTime(execucaoAtiva.inicio, agora);

                if (horasDesdeInicio > 24) {
                    console.warn(`🧟 Atividade Zumbi Detectada: ${execucaoAtiva.id} está ativa por ${horasDesdeInicio.toFixed(1)}h. Pausando automaticamente...`);

                    await Execucao.update(execucaoAtiva.id, {
                        status: 'Paralisado',
                        termino: agora.toISOString(),
                        tempo_total: 8,
                        observacao: 'Atividade paralisada automaticamente por ter ficado ativa por mais de 24 horas (atividade órfã).',
                        pausado_automaticamente: true,
                    });

                    setActiveExecution(null);
                    triggerUpdate();
                    return;
                }

                console.log('✅ [refreshActiveExecution] Execução ativa encontrada:', execucaoAtiva.descritivo);
                setActiveExecution(execucaoAtiva);
            } else {
                console.log('ℹ️ [refreshActiveExecution] Nenhuma execução ativa encontrada');
                setActiveExecution(null);
            }
        } catch (error) {
            console.warn('⚠️ [refreshActiveExecution] Erro de rede - modo offline temporário:', error.message);
            setTimeout(() => {
                console.log('🔄 [refreshActiveExecution] Tentativa automática após erro de rede...');
                refreshActiveExecution();
            }, 30000);
        }
    }, [user?.email, triggerUpdate, cleanupDuplicateExecutions]);

    const startExecution = useCallback(async (executionData) => {
        if (!user) {
            console.error("Tentando iniciar execução sem usuário logado");
            return;
        }

        if (isStarting || activeExecution) {
            console.log('⚠️ Tentativa de iniciar nova execução com outra já em andamento ou iniciando. Cancelando operação.');
            return;
        }

        let planejamentoId = executionData.planejamento_id;
        // Atividades rápidas não têm planejamentoId - vão direto para Execução

        try {
            const idToStart = planejamentoId;
            setIsStarting(idToStart);
            console.log('▶️ Iniciando nova execução:', executionData);

            if (planejamentoId && !executionData.empreendimento_id) {
                const plano = await getPlanejamento(planejamentoId);
                if (plano && plano.empreendimento_id) {
                    executionData.empreendimento_id = plano.empreendimento_id;
                }
            }

            // Se for atividade rápida COM empreendimento, criar um planejamento fantasma para aparecer no calendário
            if (!planejamentoId && executionData.empreendimento_id) {
                console.log('⚡ Atividade rápida com empreendimento detectada - criando planejamento fantasma');

                try {
                    const hoje = format(new Date(), 'yyyy-MM-dd');
                    const planejamentoFantasma = await retryWithBackoff(
                        () => PlanejamentoAtividade.create({
                            descritivo: executionData.descritivo || executionData.base_descritivo || 'Atividade Rápida',
                            base_descritivo: executionData.base_descritivo,
                            empreendimento_id: executionData.empreendimento_id,
                            executor_principal: user.email,
                            tempo_planejado: 0,
                            inicio_planejado: hoje,
                            termino_planejado: hoje,
                            horas_por_dia: { [hoje]: 0 },
                            status: 'em_andamento',
                            is_quick_activity: true
                        }),
                        3,
                        1000,
                        'createQuickActivityPlan'
                    );

                    planejamentoId = planejamentoFantasma.id;
                    console.log(`✅ Planejamento fantasma criado: ${planejamentoId}`);
                } catch (planError) {
                    console.warn('⚠️ Não foi possível criar planejamento fantasma para atividade rápida:', planError);
                    // Continuar mesmo sem o planejamento fantasma
                }
            }

            const newExec = await retryWithBackoff(
                () => Execucao.create({
                    ...executionData,
                    planejamento_id: planejamentoId,
                    usuario: user.email,
                    inicio: new Date().toISOString(),
                    status: 'Em andamento'
                }),
                5,
                3000,
                'startExecution'
            );

            console.log('✅ Nova execução iniciada:', newExec.id);
            setActiveExecution(newExec);

            // Atualizar status do planejamento para 'em_andamento' imediatamente
            if (planejamentoId) {
                try {
                    const tipoPlanejamento = executionData.tipo_planejamento;
                    const entityToUpdate = tipoPlanejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
                    await retryWithBackoff(
                        () => entityToUpdate.update(planejamentoId, { status: 'em_andamento' }),
                        3,
                        1000,
                        'startExecution.updateStatus'
                    );
                    console.log(`✅ Status do planejamento ${planejamentoId} atualizado para em_andamento`);
                } catch (statusError) {
                    console.warn('⚠️ Erro ao atualizar status do planejamento:', statusError);
                }
            }

            triggerUpdate();

        } catch (error) {
            console.error('❌ Erro ao iniciar execução:', error);
            let userMessage = 'Não foi possível iniciar a atividade. ';
            if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
                userMessage += 'Verifique sua conexão com a internet e tente novamente.';
            } else if (error.message?.includes('timeout')) {
                userMessage += 'O servidor está demorando para responder. Tente novamente em alguns minutos.';
            } else if (error.message?.includes("429")) {
                userMessage = "Muitas solicitações simultâneas. Aguarde alguns segundos e tente novamente.";
            } else if (error.message?.includes("500")) {
                userMessage = "Problema temporário com o servidor. Tente novamente em instantes.";
            } else {
                userMessage += 'Tente novamente em alguns instantes.';
            }
            alert(userMessage);
        } finally {
            setIsStarting(null);
        }
    }, [user, triggerUpdate, activeExecution, getPlanejamento, isStarting]);

    const pauseExecution = useCallback(async (observacao = '', triggeredById = null) => {
        if (!activeExecution) {
            console.log("Nenhuma execução ativa para pausar");
            return;
        }

        const executionToPause = activeExecution;
        setActiveExecution(null);

        try {
            setIsPausing(triggeredById || executionToPause.planejamento_id);
            const agora = new Date();

            const tempoDecorridoHoras = calculateElapsedTime(executionToPause.inicio, agora);

            console.log(`⏸️ [pauseExecution] Pausando execução: ${executionToPause.id}`);
            console.log(`⏸️ [pauseExecution] Descritivo: "${executionToPause.descritivo}"`);
            console.log(`⏸️ [pauseExecution] Tempo calculado: ${tempoDecorridoHoras.toFixed(4)}h`);
            console.log(`⏸️ [pauseExecution] Planejamento ID: ${executionToPause.planejamento_id || 'N/A'}`);
            console.log(`⏸️ [pauseExecution] Observação: "${observacao}"`);

            const execution = await retryWithExtendedBackoff(
                () => Execucao.get(executionToPause.id),
                'pauseExecution.get'
            );

            if (!execution) {
                console.error('❌ [pauseExecution] Execução não encontrada no banco de dados');
                throw new Error('Execução não encontrada. Pode ter sido removida.');
            }

            if (execution.status !== 'Em andamento') {
                console.warn(`⚠️ [pauseExecution] Execução já foi pausada/finalizada. Status atual: ${execution.status}. Ignorando nova pausa.`);
                triggerUpdate();
                return;
            }

            const updateData = {
                status: 'Paralisado',
                termino: agora.toISOString(),
                tempo_total: tempoDecorridoHoras,
                pausado_automaticamente: false
            };

            if (observacao && observacao.trim()) {
                updateData.observacao = observacao.trim();
                console.log(`💬 [pauseExecution] Salvando observação: "${observacao.trim()}"`);
            }

            await retryWithExtendedBackoff(
                () => Execucao.update(execution.id, updateData),
                'pauseExecution.update'
            );

            console.log('✅ [pauseExecution] Execução pausada com sucesso no banco de dados');

            if (execution.planejamento_id) {
                console.log(`🔄 [pauseExecution] Atualizando planejamento ${execution.planejamento_id}...`);
                // SEMPRE usar o dia ATUAL da execução - horas ficam no dia que foi executado
                const diaExecucao = format(new Date(), 'yyyy-MM-dd');
                console.log(`   🗓️ Registrando ${tempoDecorridoHoras.toFixed(2)}h no dia: ${diaExecucao}`);
                console.log(`   ⚠️ As horas ficam FIXAS neste dia, mesmo que ultrapasse o planejado`);
                await updatePlanejamento(execution.planejamento_id, tempoDecorridoHoras, 'pausado', observacao, diaExecucao);
                console.log('✅ [pauseExecution] Planejamento atualizado');
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            triggerUpdate();

            console.log('✅ [pauseExecution] Processo de pausa concluído com sucesso');
        } catch (error) {
            console.error('❌ [pauseExecution] Erro ao pausar execução:', error);
            console.error('❌ [pauseExecution] Stack trace:', error.stack);

            if (!error.message?.includes('Network Error') && !error.message?.includes('Failed to fetch')) {
                setActiveExecution(executionToPause);
            }

            let userMessage = 'Não foi possível pausar a atividade completamente. ';
            if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
                userMessage += 'Problema de conexão. A pausa pode ter sido registrada parcialmente. Atualize a página para verificar.';
            } else if (error.message?.includes('timeout')) {
                userMessage += 'O servidor está demorando para responder. A pausa pode ter sido registrada parcialmente. Verifique em alguns instantes.';
            } else if (error.message?.includes("429")) {
                userMessage = "Muitas solicitações simultâneas. Aguarde alguns segundos e tente novamente.";
            } else if (error.message?.includes("500")) {
                userMessage = "Problema temporário com o servidor. A pausa pode ter sido registrada parcialmente. Tente atualizar a página.";
            } else {
                userMessage += error.message || 'Tente novamente em alguns instantes.';
            }
            alert(userMessage);

            setTimeout(() => {
                console.log('🔄 [pauseExecution] Forçando refresh após erro...');
                refreshActiveExecution();
            }, 2000);
        } finally {
            setIsPausing(null);
        }
    }, [activeExecution, updatePlanejamento, triggerUpdate, refreshActiveExecution]);

    const removeFromPlaylist = useCallback(async (planejamentoId) => {
        if (!user) {
            alert("Faça login para gerenciar sua playlist.");
            return;
        }
        const newPlaylist = playlist.filter(id => id !== planejamentoId);
        try {
            await retryWithBackoff(() => User.updateMyUserData({ playlist_atividades: newPlaylist }), 3, 1000, 'removeFromPlaylist');
            setPlaylist(newPlaylist);
            console.log(`✅ Atividade ${planejamentoId} removida da playlist.`);
        } catch (error) {
            console.error("Erro ao remover da playlist:", error);
            alert("Não foi possível remover da playlist. Tente novamente.");
        }
    }, [playlist, user]);

    const finishExecution = useCallback(async (observacao = '') => {
        if (!activeExecution) {
            console.log("Nenhuma execução ativa para finalizar");
            return;
        }

        const executionToFinish = activeExecution;
        setActiveExecution(null);

        try {
            setIsFinishing(true);

            const agora = new Date();

            const tempoDecorridoHoras = calculateElapsedTime(executionToFinish.inicio, agora);

            console.log(`\n🏁 ========================================`);
            console.log(`🏁 [finishExecution] FINALIZANDO EXECUÇÃO`);
            console.log(`   Execução ID: ${executionToFinish.id}`);
            console.log(`   Descritivo: "${executionToFinish.descritivo}"`);
            console.log(`   Início: ${executionToFinish.inicio}`);
            console.log(`   Fim: ${agora.toISOString()}`);
            console.log(`   Tempo calculado: ${tempoDecorridoHoras.toFixed(4)}h`);
            console.log(`   Planejamento ID: ${executionToFinish.planejamento_id || 'N/A'}`);
            console.log(`   Observação: "${observacao}"`);
            console.log(`🏁 ========================================\n`);

            const execution = await retryWithExtendedBackoff(() => Execucao.get(executionToFinish.id), 'finishExecution.get');

            if (!execution) {
                console.error('❌ [finishExecution] Execução não encontrada no banco de dados');
                throw new Error('Execução não encontrada. Pode ter sido removida.');
            }

            console.log(`💾 [finishExecution] Salvando execução com tempo_total: ${tempoDecorridoHoras.toFixed(4)}h`);

            const updateData = {
                status: 'Finalizado',
                termino: agora.toISOString(),
                tempo_total: tempoDecorridoHoras,
                pausado_automaticamente: false
            };

            if (observacao && observacao.trim()) {
                updateData.observacao = observacao.trim();
                console.log(`💬 [finishExecution] Salvando observação: "${observacao.trim()}"`);
            }

            await retryWithExtendedBackoff(
                () => Execucao.update(execution.id, updateData),
                'finishExecution.update'
            );

            console.log('✅ [finishExecution] Execução finalizada com sucesso no banco de dados');

            if (execution.planejamento_id) {
                console.log(`\n🔄 [finishExecution] ATUALIZANDO PLANEJAMENTO ${execution.planejamento_id}...`);
                // SEMPRE usar o dia ATUAL da execução - horas ficam no dia que foi executado
                const diaExecucao = format(new Date(), 'yyyy-MM-dd');
                console.log(`   🗓️ Finalizando com ${tempoDecorridoHoras.toFixed(2)}h no dia: ${diaExecucao}`);
                console.log(`   ⚠️ As horas ficam FIXAS neste dia, independente do tempo planejado`);
                await updatePlanejamento(execution.planejamento_id, tempoDecorridoHoras, 'concluido', observacao, diaExecucao);
                console.log('✅ [finishExecution] Planejamento atualizado\n');

                if (playlist.includes(execution.planejamento_id)) {
                    console.log(`🗑️ Removendo planejamento ${execution.planejamento_id} da playlist por ter sido concluído.`);
                    await removeFromPlaylist(execution.planejamento_id);
                }
            } else {
                console.warn(`⚠️ [finishExecution] Execução sem planejamento_id - não há planejamento para atualizar`);
            }

            triggerUpdate();

            console.log('✅ [finishExecution] Processo de finalização concluído com sucesso\n');

        } catch (error) {
            console.error('❌ [finishExecution] Erro ao finalizar execução:', error);
            console.error('❌ [finishExecution] Stack trace:', error.stack);
            setActiveExecution(executionToFinish);

            let userMessage = 'Não foi possível finalizar a atividade. ';
            if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
                userMessage += 'Verifique sua conexão e tente novamente.';
            } else if (error.message?.includes('timeout')) {
                userMessage += 'O servidor não está respondendo. Tente novamente em alguns minutos.';
            } else if (error.message?.includes("429")) {
                userMessage = "Muitas solicitações simultâneas. A atividade pode não ter sido salva. Tente novamente.";
            } else if (error.message?.includes("500")) {
                userMessage = "Problema temporário com o servidor. A atividade pode não ter sido salva corretamente.";
            } else {
                userMessage += 'Tente novamente em alguns instantes.';
            }
            alert(userMessage);
        } finally {
            setIsFinishing(false);
        }
    }, [activeExecution, updatePlanejamento, playlist, removeFromPlaylist, triggerUpdate]);

    const addToPlaylist = useCallback(async (planejamentoId) => {
        if (!user) {
            alert("Faça login para gerenciar sua playlist.");
            return;
        }
        if (playlist.includes(planejamentoId)) {
            console.log(`Atividade ${planejamentoId} já está na playlist.`);
            return;
        }
        const newPlaylist = [...playlist, planejamentoId];
        try {
            await retryWithBackoff(() => User.updateMyUserData({ playlist_atividades: newPlaylist }), 3, 1000, 'addToPlaylist');
            setPlaylist(newPlaylist);
            console.log(`✅ Atividade ${planejamentoId} adicionada à playlist.`);
        } catch (error) {
            console.error("Erro ao adicionar à playlist:", error);
            alert("Não foi possível adicionar à playlist. Tente novamente.");
        }
    }, [playlist, user]);


    const startFromPlaylist = useCallback(async (plano) => {
        if (!user) {
            alert("Faça login para iniciar atividades.");
            return;
        }
        console.log('▶️ Pedido para iniciar da playlist:', plano.descritivo);

        if (activeExecution && activeExecution.planejamento_id !== plano.id) {
            console.log('-- Atividade ativa detectada. Pausando automaticamente...');
            await pauseExecution("Pausado para iniciar outra atividade da playlist.", plano.id);
        }

        console.log(`-- Iniciando ou retomando o planejamento ID: ${plano.id}`);
        await startExecution({
            planejamento_id: plano.id,
            descritivo: plano.descritivo,
            empreendimento_id: plano.empreendimento_id || null,
            usuario_ajudado: null,
            observacao: null
        });

    }, [activeExecution, pauseExecution, startExecution, user]);

    const deleteExecution = async (executionId) => {
        if (!user || user.role !== 'admin') {
            alert("Você não tem permissão para excluir atividades.");
            console.warn("Tentativa de exclusão de atividade sem permissão de administrador.");
            return;
        }

        if (!confirm("Tem certeza que deseja excluir esta atividade? Esta ação não pode ser desfeita.")) {
            return;
        }

        try {
            const execsToDelete = await retryWithBackoff(() => Execucao.filter({ id: executionId }, null, 1), 2, 500, 'deleteExecution.find');
            const execToDelete = execsToDelete.length > 0 ? execsToDelete[0] : null;

            if (!execToDelete) {
                alert("Atividade não encontrada.");
                return;
            }

            console.log(`🗑️ Excluindo execução ${executionId}...`);
            await retryWithBackoff(() => Execucao.delete(executionId), 3, 1000, 'deleteExecution.delete');
            console.log(`✅ Execução ${executionId} excluída com sucesso.`);

            if (activeExecution && activeExecution.id === executionId) {
                setActiveExecution(null);
            }

            if (execToDelete.planejamento_id) {
                console.log(`🔄 Recalculando status do planejamento ${execToDelete.planejamento_id} após exclusão...`);

                setTimeout(async () => {
                    try {
                        const planejamento = await getPlanejamento(execToDelete.planejamento_id);
                        if (planejamento) {
                            const remainingExecutions = await retryWithBackoff(() => Execucao.filter({ planejamento_id: execToDelete.planejamento_id }), 2, 500, 'deleteExecution.checkRemaining');

                            const newTempoExecutado = remainingExecutions.reduce((sum, exec) => sum + (Number(exec.tempo_total) || 0), 0);

                            let newStatus;
                            if (remainingExecutions.length === 0) {
                                newStatus = "nao_iniciado";
                            } else {
                                const anyActive = remainingExecutions.some(exec => exec.status === "Em andamento");
                                newStatus = anyActive ? "em_andamento" : "pausado";
                            }

                            await retryWithBackoff(() => PlanejamentoAtividade.update(planejamento.id, {
                                status: newStatus,
                                tempo_executado: newTempoExecutado
                            }), 2, 500, 'deleteExecution.updatePlan');

                            console.log(`✅ Planejamento ${planejamento.id} reavaliado após exclusão de execução.`);
                        }
                    } catch (e) {
                        console.error("❌ Falha ao reavaliar status do planejamento após exclusão", e);
                    }
                }, 1000);
            }

            triggerUpdate();

        } catch (error) {
            console.error("❌ Erro ao excluir execução:", error);
            let errorMessage = "Erro ao excluir atividade.";
            if (error.message?.includes("Rate limit") || error.message?.includes("429")) {
                errorMessage = "Muitas solicitações simultâneas. Tente novamente.";
            } else if (error.message?.includes("500") || error.message?.includes("ReplicaSetNoPrimary")) {
                errorMessage = "Problema temporário com o servidor. Tente novamente em alguns instantes.";
            }
            alert(errorMessage);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const initializeTimer = async () => {
            try {
                console.log("Inicializando usuário...");
                const currentUser = await retryWithBackoff(() => User.me(), 3, 2000, 'user.me');
                if (isMounted) {
                    if (currentUser && currentUser.email) {
                        console.log("Usuário carregado:", currentUser.email);
                        setUser(currentUser);
                        setPlaylist(currentUser?.playlist_atividades || []);
                        setIsLoading(false);
                    } else {
                        console.warn('Usuário não autenticado na sessão atual.');
                        setUser(null);
                        setIsLoading(false);
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar usuário (pode estar deslogado ou problema de rede):', error);
                if (isMounted) {
                    setUser(null);
                    setIsLoading(false);
                }
            }
        };

        initializeTimer();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadUserProfile = async () => {
            if (!user?.email) {
                console.log("👤 [Contexto] Sem email de usuário, setando userProfile como null");
                setUserProfile(null);
                return;
            }

            try {
                console.log(`👤 [Contexto] Carregando perfil do usuário: ${user.email} (updateKey: ${updateKey})`);
                const usuarios = await retryWithBackoff(() => Usuario.filter({ email: user.email }, null, 1), 3, 2000, 'loadUserProfile');

                console.log(`   Resultado da busca:`, usuarios);

                if (isMounted && usuarios && usuarios.length > 0) {
                    setUserProfile(usuarios[0]);
                    console.log(`✅ Perfil carregado com sucesso:`, {
                        id: usuarios[0].id,
                        email: usuarios[0].email,
                        perfil: usuarios[0].perfil,
                        usuarios_permitidos_visualizar: usuarios[0].usuarios_permitidos_visualizar,
                        tamanho_array: usuarios[0].usuarios_permitidos_visualizar?.length || 0
                    });
                } else {
                    console.warn(`⚠️ Nenhum perfil encontrado para ${user.email} na entidade Usuario`);
                    setUserProfile(null);
                }
            } catch (error) {
                console.error('❌ Erro ao carregar perfil do usuário:', error);
                if (isMounted) {
                    setUserProfile(null);
                }
            }
        };

        loadUserProfile();

        return () => {
            isMounted = false;
        };
    }, [user?.email, updateKey]);

    useEffect(() => {
        let isMounted = true;
        let hasLoaded = false;

        const loadEssentialData = async () => {
            if (!user || !isMounted || hasLoaded) return;

            hasLoaded = true;

            try {
                console.log("📦 [Contexto] Carregando dados essenciais SEQUENCIALMENTE...");

                console.log("   1/3 Carregando atividades genéricas...");
                const genericas = await retryWithBackoff(() => AtividadeGenerica.list(), 3, 3000, 'loadGenericasForPlaylist');
                if (isMounted) setAtividadesGenericas(genericas || []);

                await delay(3000);

                console.log("   2/3 Carregando empreendimentos...");
                const empreendimentos = await retryWithBackoff(() => Empreendimento.list(), 3, 3000, 'loadEmpreendimentosForPlaylist');
                if (isMounted) setAllEmpreendimentos(empreendimentos || []);

                await delay(3000);

                console.log("   3/3 Carregando usuários...");
                try {
                    const usuarios = await retryWithBackoff(() => Usuario.list(), 3, 3000, 'loadUsersForPlaylist');
                    if (isMounted) setAllUsers(usuarios || []);
                } catch (userError) {
                    console.warn("Erro ao carregar usuários cadastrados:", userError.message);
                    if (isMounted) setAllUsers([]);
                }

                console.log("✅ [Contexto] Todos os dados essenciais carregados!");

            } catch (error) {
                console.error("❌ [Contexto] Erro ao carregar dados essenciais:", error);

                if (isMounted) {
                    setAtividadesGenericas([]);
                    setAllEmpreendimentos([]);
                    setAllUsers([]);
                }
            }
        };

        const timeout = setTimeout(() => {
            loadEssentialData();
        }, 2000);

        return () => {
            clearTimeout(timeout);
            isMounted = false;
        }
    }, [user]);

    useEffect(() => {
        if (user?.email && !isLoading) {
            const timer = setTimeout(() => {
                refreshActiveExecution();
            }, 1000);

            return () => clearTimeout(timer);
        }
    }, [user?.email, isLoading, refreshActiveExecution]);

    const { showWarning, timeUntilIdle, extendSession } = useIdleDetection({
        enabled: false,
        warningTime: 10 * 60 * 1000,
        idleTime: 15 * 60 * 1000,
        onIdle: async () => {
            console.log("Usuário inativo - pausando atividade automaticamente");
            if (activeExecution) {
                await pauseExecution("Atividade paralisada automaticamente por inatividade.");
                alert("Sua atividade foi pausada automaticamente devido à inatividade.");
            }
        },
    });

    return (
        <ActivityTimerContext.Provider value={{
            activeExecution,
            isLoading,
            startExecution,
            finishExecution,
            pauseExecution,
            refreshActiveExecution,
            user,
            userProfile,
            updateKey,
            triggerUpdate,
            deleteExecution,
            isStarting,
            isFinishing,
            isPausing,
            playlist,
            addToPlaylist,
            removeFromPlaylist,
            startFromPlaylist,
            allPlanejamentos,
            isLoadingPlanejamentos,
            atividadesGenericas,
            allEmpreendimentos,
            allUsers,
            hasPermission,
            isAdmin,
            isColaborador,
            isGestao,
            isCoordenador,
            nivelUsuario,
            perfilAtual
        }}>
            {children}

            <IdleWarningModal
                isOpen={showWarning}
                timeUntilIdle={timeUntilIdle}
                onExtendSession={extendSession}
            />
        </ActivityTimerContext.Provider>
    );
};