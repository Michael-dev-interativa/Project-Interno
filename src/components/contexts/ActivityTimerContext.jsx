import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Execucao, User, PlanejamentoAtividade, SobraUsuario, AtividadeGenerica, Empreendimento, PlanejamentoDocumento, Usuario } from '@/entities/all';
import { useIdleDetection } from '../hooks/useIdleDetection';
import IdleWarningModal from '../layout/IdleWarningModal';
import { retryWithBackoff, retryWithExtendedBackoff } from '../utils/apiUtils';
import { distribuirHorasSimples } from '../utils/DateCalculator';
import { format, parseISO, isValid } from 'date-fns';

export const ActivityTimerContext = createContext({});

const calculateElapsedTime = (startDateString, endDate) => {
    try {
        const startDate = typeof startDateString === 'string' ? parseISO(startDateString) : startDateString;
        if (!isValid(startDate)) return 0;
        if (!isValid(endDate)) return 0;
        const diffMs = endDate.getTime() - startDate.getTime();
        if (diffMs < 0) return 0;
        const hours = diffMs / (1000 * 60 * 60);
        if (hours > 24) return 8;
        return hours;
    } catch (error) {
        return 0;
    }
};

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const PERFIS_HIERARQUIA = {
    'direcao': 6,
    'gestao': 5,
    'lider': 4,
    'coordenador': 3,
    'apoio': 2,
    'consultor': 1,
    'user': 1
};

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
        setUpdateKey(prevKey => prevKey + 1);
    }, []);

    const { perfilAtual, nivelUsuario, isAdmin, isColaborador, isGestao, isCoordenador } = useMemo(() => {
        const perfil = (userProfile && userProfile.perfil) ? userProfile.perfil : (user && user.perfil) ? user.perfil : 'user';
        const nivel = PERFIS_HIERARQUIA[perfil] || 1;
        const admin = user && user.role === 'admin';
        return {
            perfilAtual: perfil,
            nivelUsuario: nivel,
            isAdmin: admin,
            isColaborador: nivel === 1 && !admin,
            isGestao: perfil === 'gestao',
            isCoordenador: perfil === 'coordenador',
        };
    }, [user, userProfile]);

    const hasPermission = useCallback((nivelMinimo) => {
        return isAdmin || nivelUsuario >= PERFIS_HIERARQUIA[nivelMinimo];
    }, [isAdmin, nivelUsuario]);

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
            }

            return null;

        } catch (error) {
            return null;
        }
    }, []);

    const updatePlanejamento = useCallback(async (planejamentoId, tempoAdicional, finalStatus, observacao = null, diaExecucao = null) => {
        if (!planejamentoId) {
            return;
        }

        // SEMPRE usar o dia atual da execução - NUNCA redistribuir em outros dias
        const diaParaRegistrar = diaExecucao || format(new Date(), 'yyyy-MM-dd');

        try {
            let planejamento = null;
            let isDocumento = false;

            try {
                const resultAtiv = await retryWithBackoff(() => PlanejamentoAtividade.filter({ id: planejamentoId }), 2, 500, 'updatePlanejamento.findAtiv');
                if (resultAtiv && resultAtiv.length > 0) {
                    planejamento = resultAtiv[0];
                }
            } catch (e) {
                // não encontrado em PlanejamentoAtividade, tentar PlanejamentoDocumento
            }

            if (!planejamento) {
                try {
                    const resultDoc = await retryWithBackoff(() => PlanejamentoDocumento.filter({ id: planejamentoId }), 2, 500, 'updatePlanejamento.findDoc');
                    if (resultDoc && resultDoc.length > 0) {
                        planejamento = resultDoc[0];
                        isDocumento = true;
                    }
                } catch (e) {
                    // não encontrado em nenhuma entidade
                }
            }

            if (!planejamento) {
                return;
            }

            const tempoExecutadoAtual = Number(planejamento.tempo_executado || 0);
            const novoTempoExecutado = tempoExecutadoAtual + tempoAdicional;
            const isAtividadeRapida = planejamento.is_quick_activity === true;

            const updateData = {
                tempo_executado: novoTempoExecutado,
            };

            // Registrar horas APENAS no dia da execução, NUNCA redistribuir
            let horasExecRaw = planejamento.horas_executadas_por_dia;
            // Garantir que é um objeto (às vezes o servidor retorna string JSON)
            if (typeof horasExecRaw === 'string') {
                try { horasExecRaw = JSON.parse(horasExecRaw); } catch (_) { horasExecRaw = {}; }
            }
            const horasExecutadasPorDia = (horasExecRaw && typeof horasExecRaw === 'object') ? horasExecRaw : {};
            horasExecutadasPorDia[diaParaRegistrar] = (horasExecutadasPorDia[diaParaRegistrar] || 0) + tempoAdicional;
            updateData.horas_executadas_por_dia = horasExecutadasPorDia;

            if (finalStatus === 'concluido') {
                updateData.status = 'concluido';
                updateData.termino_real = format(new Date(), 'yyyy-MM-dd');
                if (!planejamento.inicio_real) {
                    updateData.inicio_real = diaParaRegistrar;
                }
                if (isAtividadeRapida) {
                    updateData.tempo_planejado = novoTempoExecutado;
                    const diaDaAtividade = planejamento.inicio_planejado || diaParaRegistrar;
                    updateData.horas_por_dia = { [diaDaAtividade]: novoTempoExecutado };
                }
            } else if (finalStatus === 'pausado') {
                updateData.status = 'pausado';
                if (isAtividadeRapida) {
                    updateData.tempo_planejado = novoTempoExecutado;
                    const diaDaAtividade = planejamento.inicio_planejado || diaParaRegistrar;
                    updateData.horas_por_dia = { [diaDaAtividade]: novoTempoExecutado };
                }
            } else {
                if (isAtividadeRapida) {
                    updateData.tempo_planejado = novoTempoExecutado;
                    const diaDaAtividade = planejamento.inicio_planejado || diaParaRegistrar;
                    updateData.horas_por_dia = { [diaDaAtividade]: novoTempoExecutado };
                    updateData.status = 'em_andamento';
                } else {
                    updateData.status = 'em_andamento';
                    if (!planejamento.inicio_real) {
                        updateData.inicio_real = diaParaRegistrar;
                    }
                }
            }

            const entityToUpdate = isDocumento ? PlanejamentoDocumento : PlanejamentoAtividade;
            const updatedPlano = await retryWithBackoff(
                () => entityToUpdate.update(planejamento.id, updateData),
                3, 1000, 'updatePlanejamento.update'
            );

            // Mantido para compatibilidade, mas sem log

            triggerUpdate();
        } catch (error) {
            console.error('[updatePlanejamento] Erro ao atualizar planejamento:', planejamentoId, error?.message || error);
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

                const sortedExecutions = [...execucoesAtivas].sort((a, b) =>
                    new Date(b.inicio) - new Date(a.inicio)
                );

                for (let i = 1; i < sortedExecutions.length; i++) {
                    const exec = sortedExecutions[i];

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
                        await updatePlanejamento(exec.planejamento_id, tempoDecorrido, 'pausado', 'Pausado automaticamente - execução duplicada detectada', diaExec);
                    }
                }

                return execucoesAtivas && execucoesAtivas.length > 0 ? sortedExecutions[0] : null;
            }

            return execucoesAtivas && execucoesAtivas.length > 0 ? execucoesAtivas[0] : null;
        } catch (error) {
            // Log removido para produção
            return null;
        }
    }, [updatePlanejamento]);

    const refreshActiveExecution = useCallback(async () => {
        if (!user?.email) return;

        try {
            const execucaoAtiva = await cleanupDuplicateExecutions(user.email);

            if (execucaoAtiva) {
                const agora = new Date();
                const horasDesdeInicio = calculateElapsedTime(execucaoAtiva.inicio, agora);

                if (horasDesdeInicio > 24) {
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
                setActiveExecution(execucaoAtiva);
            } else {
                setActiveExecution(null);
            }
        } catch (error) {
        }
    }, [user?.email, triggerUpdate, cleanupDuplicateExecutions]);

    const startExecution = useCallback(async (executionData) => {
        if (!user) {
            // Log removido para produção
            return;
        }

        if (isStarting || activeExecution) {
            return;
        }

        let planejamentoId = executionData.planejamento_id;
        // Atividades rápidas não têm planejamentoId - vão direto para Execução

        try {
            const idToStart = planejamentoId;
            setIsStarting(idToStart);

            if (planejamentoId && !executionData.empreendimento_id) {
                const plano = await getPlanejamento(planejamentoId);
                if (plano && plano.empreendimento_id) {
                    executionData.empreendimento_id = plano.empreendimento_id;
                }
            }

            // Se for atividade rápida SEM planejamentoId, criar um planejamento fantasma para aparecer no calendário
            if (!planejamentoId) {

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
                } catch (planError) {
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
                } catch (statusError) {
                }
            }

            triggerUpdate();

        } catch (error) {
            // Log removido para produção
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
            return;
        }

        const executionToPause = activeExecution;
        setActiveExecution(null);

        try {
            setIsPausing(triggeredById || executionToPause.planejamento_id);
            const agora = new Date();

            const tempoDecorridoHoras = calculateElapsedTime(executionToPause.inicio, agora);


            const execution = await retryWithExtendedBackoff(
                () => Execucao.get(executionToPause.id),
                'pauseExecution.get'
            );

            if (!execution) {
                // Log removido para produção
                throw new Error('Execução não encontrada. Pode ter sido removida.');
            }

            if (execution.status !== 'Em andamento') {
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
            }

            await retryWithExtendedBackoff(
                () => Execucao.update(execution.id, updateData),
                'pauseExecution.update'
            );

            if (execution.planejamento_id) {
                const diaExecucao = format(new Date(), 'yyyy-MM-dd');
                await updatePlanejamento(execution.planejamento_id, tempoDecorridoHoras, 'pausado', observacao, diaExecucao);
            }

            await new Promise(resolve => setTimeout(resolve, 500));

            triggerUpdate();
        } catch (error) {
            // Log removido para produção

            // Sempre restaura o activeExecution em caso de falha para manter consistência com o DB
            setActiveExecution(executionToPause);

            let userMessage = 'Não foi possível pausar a atividade completamente. ';
            if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
                userMessage += 'Problema de conexão. Verifique sua internet e tente pausar novamente.';
            } else if (error.message?.includes('timeout')) {
                userMessage += 'O servidor está demorando para responder. Tente pausar novamente em alguns instantes.';
            } else if (error.message?.includes("429")) {
                userMessage = "Muitas solicitações simultâneas. Aguarde alguns segundos e tente novamente.";
            } else if (error.message?.includes("500")) {
                userMessage = "Problema temporário com o servidor. Tente pausar novamente.";
            } else {
                userMessage += error.message || 'Tente novamente em alguns instantes.';
            }
            alert(userMessage);

            setTimeout(() => refreshActiveExecution(), 2000);
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
        } catch (error) {
            // Log removido para produção
            alert("Não foi possível remover da playlist. Tente novamente.");
        }
    }, [playlist, user]);

    const finishExecution = useCallback(async (observacao = '') => {
        if (!activeExecution) {
            return;
        }

        const executionToFinish = activeExecution;
        setActiveExecution(null);

        try {
            setIsFinishing(true);

            const agora = new Date();

            const tempoDecorridoHoras = calculateElapsedTime(executionToFinish.inicio, agora);

            const execution = await retryWithExtendedBackoff(() => Execucao.get(executionToFinish.id), 'finishExecution.get');

            if (!execution) {
                // Log removido para produção
                throw new Error('Execução não encontrada. Pode ter sido removida.');
            }

            const updateData = {
                status: 'Finalizado',
                termino: agora.toISOString(),
                tempo_total: tempoDecorridoHoras,
                pausado_automaticamente: false
            };

            if (observacao && observacao.trim()) {
                updateData.observacao = observacao.trim();
            }

            await retryWithExtendedBackoff(
                () => Execucao.update(execution.id, updateData),
                'finishExecution.update'
            );

            if (execution.planejamento_id) {
                const diaExecucao = format(new Date(), 'yyyy-MM-dd');
                await updatePlanejamento(execution.planejamento_id, tempoDecorridoHoras, 'concluido', observacao, diaExecucao);

                // Safety net: garantir que o status sempre seja 'concluido' mesmo que updatePlanejamento falhe silenciosamente
                try {
                    const entityToUpdate = execution.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
                    await retryWithBackoff(
                        () => entityToUpdate.update(execution.planejamento_id, {
                            status: 'concluido',
                            termino_real: diaExecucao,
                        }),
                        3, 1000, 'finishExecution.statusFallback'
                    );
                } catch (fallbackErr) { /* ignora, o updatePlanejamento já tentou */ }

                if (playlist.includes(execution.planejamento_id)) {
                    await removeFromPlaylist(execution.planejamento_id);
                }
            }

            triggerUpdate();

        } catch (error) {
            // Log removido para produção
            // Log removido para produção
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
            return;
        }
        const newPlaylist = [...playlist, planejamentoId];
        try {
            await retryWithBackoff(() => User.updateMyUserData({ playlist_atividades: newPlaylist }), 3, 1000, 'addToPlaylist');
            setPlaylist(newPlaylist);
        } catch (error) {
            // Log removido para produção
            alert("Não foi possível adicionar à playlist. Tente novamente.");
        }
    }, [playlist, user]);


    const startFromPlaylist = useCallback(async (plano) => {
        if (!user) {
            alert("Faça login para iniciar atividades.");
            return;
        }

        if (activeExecution && activeExecution.planejamento_id !== plano.id) {
            await pauseExecution("Pausado para iniciar outra atividade da playlist.", plano.id);
        }

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

            await retryWithBackoff(() => Execucao.delete(executionId), 3, 1000, 'deleteExecution.delete');

            if (activeExecution && activeExecution.id === executionId) {
                setActiveExecution(null);
            }

            if (execToDelete.planejamento_id) {

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

                        }
                    } catch (e) {
                        // Log removido para produção
                    }
                }, 1000);
            }

            triggerUpdate();

        } catch (error) {
            // Log removido para produção
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
                const currentUser = await retryWithBackoff(() => User.me(), 3, 2000, 'user.me');
                if (isMounted) {
                    if (currentUser && currentUser.email) {
                        setUser(currentUser);
                        setPlaylist(currentUser?.playlist_atividades || []);
                        setIsLoading(false);
                    } else {
                        setUser(null);
                        setIsLoading(false);
                    }
                }
            } catch (error) {
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
                setUserProfile(null);
                return;
            }

            try {
                const usuarios = await retryWithBackoff(() => Usuario.filter({ email: user.email }, null, 1), 3, 2000, 'loadUserProfile');

                if (isMounted && usuarios && usuarios.length > 0) {
                    setUserProfile(usuarios[0]);
                } else {
                    setUserProfile(null);
                }
            } catch (error) {
                // Log removido para produção
                if (isMounted) {
                    setUserProfile(null);
                }
            }
        };

        loadUserProfile();

        return () => {
            isMounted = false;
        };
    }, [user?.email]);

    useEffect(() => {
        let isMounted = true;
        let hasLoaded = false;

        const loadEssentialData = async () => {
            if (!user || !isMounted || hasLoaded) return;

            hasLoaded = true;

            try {

                const [genericas, empreendimentos] = await Promise.all([
                    retryWithBackoff(() => AtividadeGenerica.list(), 3, 3000, 'loadGenericasForPlaylist'),
                    retryWithBackoff(() => Empreendimento.list(), 3, 3000, 'loadEmpreendimentosForPlaylist'),
                ]);
                if (isMounted) {
                    setAtividadesGenericas(genericas || []);
                    setAllEmpreendimentos(empreendimentos || []);
                }

                try {
                    const usuarios = await retryWithBackoff(() => Usuario.list(), 3, 3000, 'loadUsersForPlaylist');
                    if (isMounted) setAllUsers(usuarios || []);
                } catch (userError) {
                    if (isMounted) setAllUsers([]);
                }

            } catch (error) {
                // Log removido para produção

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

    // Pausa automática ao fechar aba/navegador — keepalive garante que a requisição
    // seja enviada mesmo durante o unload, evitando que execuções fiquem "Em andamento"
    useEffect(() => {
        if (!activeExecution) return;

        const handleBeforeUnload = () => {
            const agora = new Date();
            const tempoDecorridoHoras = calculateElapsedTime(activeExecution.inicio, agora);

            fetch(`/api/execucoes/${activeExecution.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Paralisado',
                    termino: agora.toISOString(),
                    tempo_total: tempoDecorridoHoras,
                    pausado_automaticamente: true
                }),
                keepalive: true
            });

            if (activeExecution.planejamento_id) {
                const endpoint = activeExecution.tipo_planejamento === 'documento'
                    ? `/api/planejamento_documentos/${activeExecution.planejamento_id}`
                    : `/api/planejamentos/${activeExecution.planejamento_id}`;

                fetch(endpoint, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'pausado' }),
                    keepalive: true
                });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [activeExecution]);

    const { showWarning, timeUntilIdle, extendSession } = useIdleDetection({
        enabled: false,
        warningTime: 10 * 60 * 1000,
        idleTime: 15 * 60 * 1000,
        onIdle: async () => {
            if (activeExecution) {
                await pauseExecution("Atividade paralisada automaticamente por inatividade.");
                alert("Sua atividade foi pausada automaticamente devido à inatividade.");
            }
        },
    });

    const contextValue = useMemo(() => ({
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
        perfilAtual,
    }), [
        activeExecution, isLoading, startExecution, finishExecution, pauseExecution,
        refreshActiveExecution, user, userProfile, updateKey, triggerUpdate, deleteExecution,
        isStarting, isFinishing, isPausing, playlist, addToPlaylist, removeFromPlaylist,
        startFromPlaylist, allPlanejamentos, isLoadingPlanejamentos, atividadesGenericas,
        allEmpreendimentos, allUsers, hasPermission, isAdmin, isColaborador, isGestao,
        isCoordenador, nivelUsuario, perfilAtual,
    ]);

    return (
        <ActivityTimerContext.Provider value={contextValue}>
            {children}

            <IdleWarningModal
                isOpen={showWarning}
                timeUntilIdle={timeUntilIdle}
                onExtendSession={extendSession}
            />
        </ActivityTimerContext.Provider>
    );
};