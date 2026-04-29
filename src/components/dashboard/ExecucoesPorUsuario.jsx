import React, { useState, useEffect, useMemo, useCallback, useContext, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Execucao, Usuario } from "@/entities/all";
import { Users, Clock, Play, FileText, Calendar as CalendarIcon } from "lucide-react";
import { format, isToday, isSameDay } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { ptBR } from "date-fns/locale";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { retryWithBackoff } from '../utils/apiUtils';

export default function ExecucoesPorUsuario() {
    const { user, updateKey, activeExecution, allUsers } = useContext(ActivityTimerContext);
    const [execucoesPorUsuario, setExecucoesPorUsuario] = useState({});
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isLoading, setIsLoading] = useState(true);

    const hasLoadedRef = useRef(false);
    const lastLoadedDateRef = useRef(null);

    const isAdmin = user && (user.role === 'admin' || user.role === 'lider' || user.perfil === 'coordenador');

    // **MODIFICADO**: Criar mapa de usuários SEMPRE a partir do allUsers do contexto
    const usuariosMap = useMemo(() => {
        if (!allUsers || allUsers.length === 0) {
            // Fallback: criar mapa apenas com o usuário atual
            if (user) {
                return {
                    [user.email]: user.full_name || user.nome || user.email
                };
            }
            return {};
        }

        // Usar allUsers do contexto para criar o mapa
        return allUsers.reduce((acc, u) => ({
            ...acc,
            [u.email]: u.nome || u.full_name || u.email
        }), {});
    }, [allUsers, user]);

    const processarDados = useCallback((execucoesDoDia) => {
        if (!execucoesDoDia || execucoesDoDia.length === 0) {
            setExecucoesPorUsuario({});
            return;
        }

        const groupedByUser = execucoesDoDia.reduce((acc, exec) => {
            const usuarioEmail = exec.usuario || "sem-usuario";
            if (!acc[usuarioEmail]) acc[usuarioEmail] = [];
            acc[usuarioEmail].push(exec);
            return acc;
        }, {});

        const finalGrouped = {};
        for (const usuarioEmail in groupedByUser) {
            const userExecutions = groupedByUser[usuarioEmail];

            const groupedByPlan = userExecutions.reduce((acc, exec) => {
                const groupKey = exec.planejamento_id || `virtual-${exec.id}`;

                if (!acc[groupKey]) {
                    acc[groupKey] = {
                        id: groupKey,
                        nomeAtividade: exec.descritivo || "Atividade não identificada",
                        usuario_ajudado: exec.usuario_ajudado,
                        tempoTotalAgregado: 0,
                        execucoes: [],
                        status: exec.status,
                        ultimaExecucao: null,
                        observacao: exec.observacao || null,
                    };
                }

                acc[groupKey].tempoTotalAgregado += exec.tempo_total || 0;
                acc[groupKey].execucoes.push(exec);

                if (!acc[groupKey].ultimaExecucao || new Date(exec.inicio) > new Date(acc[groupKey].ultimaExecucao.inicio)) {
                    acc[groupKey].ultimaExecucao = exec;
                    acc[groupKey].status = exec.status;
                    if (exec.observacao) {
                        acc[groupKey].observacao = exec.observacao;
                    }
                }

                return acc;
            }, {});

            finalGrouped[usuarioEmail] = Object.values(groupedByPlan).sort((a, b) =>
                new Date(b.ultimaExecucao.inicio) - new Date(a.ultimaExecucao.inicio)
            );
        }

        setExecucoesPorUsuario(finalGrouped);
    }, []);

    const loadData = useCallback(async () => {
        if (!user) return;

        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const dateChanged = lastLoadedDateRef.current !== dateStr;

        if (hasLoadedRef.current && !dateChanged) {
            return;
        }

        setIsLoading(true);
        hasLoadedRef.current = true;
        lastLoadedDateRef.current = dateStr;

        try {
            const inicioDoDia = `${dateStr}T00:00:00`;
            const fimDoDia = `${dateStr}T23:59:59`;

            let filters = { inicio: { $gte: inicioDoDia, $lte: fimDoDia } };

            if (!isAdmin) {
                filters.usuario = user.email;
            }

            const execsDoDia = await retryWithBackoff(() => Execucao.filter(filters), 3, 2000, 'loadExecucoesDia');

            processarDados(execsDoDia || []);

        } catch {
            setExecucoesPorUsuario({});
        } finally {
            setIsLoading(false);
        }
    }, [user, selectedDate, isAdmin, processarDados]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            loadData();
        }, 4000);

        return () => clearTimeout(timeout);
    }, [selectedDate]);

    useEffect(() => {
        if (hasLoadedRef.current) {
            hasLoadedRef.current = false;
            loadData();
        }
    }, [updateKey, activeExecution]);

    const totaisPorUsuario = useMemo(() => {
        const totais = {};

        Object.entries(execucoesPorUsuario).forEach(([usuarioEmail, userExecutionsGroups]) => {
            const totalHoras = userExecutionsGroups.reduce((sum, group) => {
                return sum + (group.tempoTotalAgregado || 0);
            }, 0);

            totais[usuarioEmail] = totalHoras;
        });

        return totais;
    }, [execucoesPorUsuario]);

    const getStatusColor = (status) => {
        const colors = {
            "Em andamento": "bg-yellow-100 text-yellow-800",
            "Finalizado": "bg-green-100 text-green-800",
            "Paralisado": "bg-red-100 text-red-800"
        };
        return colors[status] || "bg-gray-100 text-gray-800";
    };

    const formatTempo = (tempo) => {
        if (tempo === null || typeof tempo === 'undefined') return "0.0h";
        const n = Number(tempo);
        if (!isFinite(n) || isNaN(n)) return "0.0h";
        return `${n.toFixed(1)}h`;
    };

    const formatData = (dataString) => {
        if (!dataString) return "N/A";
        try {
            return format(new Date(dataString), 'HH:mm');
        } catch {
            return "Inválida";
        }
    };

    if (isLoading) {
        return (
            <Card className="bg-white border-0 shadow-lg">
                <CardHeader className="border-b border-gray-100">
                    <Skeleton className="h-8 w-1/2" />
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-white border-0 shadow-lg">
            <CardHeader className="border-b border-gray-100">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-blue-600" />
                        <CardTitle className="text-xl font-bold text-gray-900">
                            {isToday(selectedDate) || !isAdmin ?
                                (isAdmin ? "Atividades de Hoje" : "Minhas Atividades de Hoje") :
                                `Atividades de ${format(selectedDate, 'dd/MM/yyyy', { locale: ptBR })}`
                            }
                        </CardTitle>
                    </div>
                    {isAdmin && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant={"outline"}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {selectedDate ? format(selectedDate, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="single" selected={selectedDate} onSelect={(date) => setSelectedDate(date || new Date())} initialFocus locale={ptBR} disabled={(date) => date > new Date() || date < new Date("2020-01-01")} />
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </CardHeader>
            <CardContent className="p-6">
                {!isAdmin && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-blue-700 text-sm">ℹ️ Você está visualizando apenas as suas atividades de hoje.</p>
                    </div>
                )}

                <div className="space-y-6">
                    {Object.keys(execucoesPorUsuario).length > 0 ? (
                        Object.entries(execucoesPorUsuario).map(([usuarioEmail, userExecutionsGroups]) => {
                            const nomeUsuario = usuariosMap[usuarioEmail] || usuarioEmail;
                            const totalUsuario = totaisPorUsuario[usuarioEmail] || 0;

                            return (
                                <div key={usuarioEmail} className="border rounded-lg p-4 bg-gray-50/70">
                                    {isAdmin && (
                                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                                            <h3 className="font-semibold text-gray-900 text-lg">{nomeUsuario}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600">Total do dia:</span>
                                                <Badge className="bg-blue-100 text-blue-800 font-bold text-base px-3 py-1">
                                                    {formatTempo(totalUsuario)}
                                                </Badge>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {userExecutionsGroups.map((group) => (
                                            <div key={group.id}>
                                                <div className="flex items-center justify-between p-3 bg-white rounded border text-sm shadow-sm">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-gray-900 truncate" title={group.nomeAtividade}>{group.nomeAtividade}</p>
                                                        {group.usuario_ajudado && <p className="text-purple-600 text-xs mt-1">Ajudando: {usuariosMap[group.usuario_ajudado] || group.usuario_ajudado}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-3 ml-2">
                                                        <Badge className={getStatusColor(group.status)}>{group.status}</Badge>
                                                        <div className="text-right w-20">
                                                            <div className="text-xs text-gray-500">
                                                                {group.status === 'Em andamento' ? `${formatData(group.ultimaExecucao.inicio)} - ...` : ''}
                                                            </div>
                                                            <div className="text-sm font-bold text-blue-600">{formatTempo(group.tempoTotalAgregado)}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {group.observacao && (
                                                    <div className="ml-3 mt-1 p-2 bg-amber-50 border-l-2 border-amber-400 rounded-r text-xs">
                                                        <p className="text-gray-700">
                                                            <span className="font-semibold text-amber-700">💬 Observação:</span> {group.observacao}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {!isAdmin && (
                                        <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-700">Total do dia:</span>
                                            <Badge className="bg-blue-100 text-blue-800 font-bold text-base px-3 py-1">
                                                {formatTempo(totalUsuario)}
                                            </Badge>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-8">
                            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">Nenhuma atividade registrada {isAdmin && !isToday(selectedDate) ? "neste dia" : "hoje"}</p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}