import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Search } from "lucide-react";
import RelatorioFiltros from '../components/relatorios/RelatorioFiltros';
import RelatorioResumo from '../components/relatorios/RelatorioResumo';
import RelatorioAtividades from '../components/relatorios/RelatorioAtividades';
import RelatorioCargaHoraria from '../components/relatorios/RelatorioCargaHoraria';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { retryWithBackoff, delay } from '../components/utils/apiUtils';
import { parseISO, isAfter, isBefore, startOfDay, endOfDay, isValid, differenceInBusinessDays } from 'date-fns';
import { isActivityOverdue as isOverdue } from '../components/utils/DateCalculator';
import { exportToExcel } from '../components/utils/excelUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Helper function to fetch all records of an entity
const fetchAllRecords = async (entity, entityName) => {
    try {
        await delay(500);
        return await retryWithBackoff(() => entity.list(null, 5000), 3, 1000, `relatorios.fetchAllRecords.${entityName}`);
    } catch (error) {
        console.error(`Erro ao carregar ${entityName}:`, error);
        return [];
    }
};

export default function Relatorios() {
    const [data, setData] = useState({
        planejamentos: [],
        empreendimentos: [],
        usuarios: [],
        execucoes: [],
    });
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false); // NOVO
    const [activeTab, setActiveTab] = useState('atividades');
    const [filters, setFilters] = useState({
        dataInicio: null,
        dataFim: null,
        usuario: 'all',
        empreendimento: 'all',
        status: 'all',
    });

    // NOVO: Carregar apenas dados iniciais (empreendimentos e usuários)
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [empreendimentos, usuarios] = await Promise.all([
                    fetchAllRecords(base44.entities.Empreendimento, 'Empreendimentos'),
                    fetchAllRecords(base44.entities.User, 'Usuarios'),
                ]);
                
                setData(prev => ({
                    ...prev,
                    empreendimentos: empreendimentos || [],
                    usuarios: usuarios || [],
                }));
            } catch (error) {
                console.error("Erro ao carregar dados iniciais:", error);
            }
        };
        
        loadInitialData();
    }, []);

    // MODIFICADO: Função para carregar dados pesados apenas quando solicitado
    const loadData = useCallback(async () => {
        setIsLoading(true);
        setHasSearched(true);
        
        try {
            
            // MODIFICADO: Buscar planejamentos e execuções baseado no filtro de usuário
            let planejamentosAtividadeQuery, planejamentosDocumentoQuery, execucoesQuery;
            
            if (filters.usuario === 'all') {
                // Buscar TODOS os planejamentos e execuções
                planejamentosAtividadeQuery = base44.entities.PlanejamentoAtividade.list();
                planejamentosDocumentoQuery = base44.entities.PlanejamentoDocumento.list();
                execucoesQuery = base44.entities.Execucao.list();
            } else {
                // Buscar apenas do usuário específico
                planejamentosAtividadeQuery = base44.entities.PlanejamentoAtividade.filter({ 
                    executor_principal: filters.usuario 
                });
                planejamentosDocumentoQuery = base44.entities.PlanejamentoDocumento.filter({ 
                    executor_principal: filters.usuario 
                });
                execucoesQuery = base44.entities.Execucao.filter({ 
                    usuario: filters.usuario 
                });
            }
            
            const [planejamentosAtividade, planejamentosDocumento, atividades, documentos, execucoes] = await Promise.all([
                retryWithBackoff(() => planejamentosAtividadeQuery, 3, 1000, 'loadPlanejamentosAtividadeUsuario'),
                retryWithBackoff(() => planejamentosDocumentoQuery, 3, 1000, 'loadPlanejamentosDocumentoUsuario'),
                fetchAllRecords(base44.entities.Atividade, 'Atividades'),
                fetchAllRecords(base44.entities.Documento, 'Documentos'),
                retryWithBackoff(() => execucoesQuery, 3, 1000, 'loadExecucoesUsuario'),
            ]);

            // **NOVO**: Combinar planejamentos de atividade e documento
            const planejamentos = [
                ...(planejamentosAtividade || []).map(p => ({ ...p, tipo_plano: 'atividade' })),
                ...(planejamentosDocumento || []).map(p => ({ ...p, tipo_plano: 'documento' }))
            ];


            const atividadesMap = atividades.reduce((acc, a) => ({ ...acc, [a.id]: a }), {});
            const documentosMap = documentos.reduce((acc, d) => ({ ...acc, [d.id]: d }), {});
            const empreendimentosMap = data.empreendimentos.reduce((acc, e) => ({ ...acc, [e.id]: e }), {});
            const usuariosMap = data.usuarios.reduce((acc, u) => ({ ...acc, [u.email]: u }), {});

            const execucoesPorPlanejamento = execucoes.reduce((acc, exec) => {
                if (exec.planejamento_id) {
                    if (!acc[exec.planejamento_id]) {
                        acc[exec.planejamento_id] = [];
                    }
                    acc[exec.planejamento_id].push(exec);
                }
                return acc;
            }, {});

            const planejamentosEnriquecidos = planejamentos.map(p => {
                const execucoesDoPlano = execucoesPorPlanejamento[p.id] || [];
                const execucoesFinalizadas = execucoesDoPlano.filter(e => e.status === 'Finalizado');

                let terminoReal = null;
                let inicioReal = null;
                let observacaoConsolidada = p.observacao || '';

                if (execucoesDoPlano.length > 0) {
                    inicioReal = execucoesDoPlano.reduce((earliest, current) => {
                        const earliestDate = earliest.inicio ? parseISO(earliest.inicio) : new Date(8640000000000000);
                        const currentDate = current.inicio ? parseISO(current.inicio) : earliestDate;
                        return currentDate < earliestDate ? current : earliest;
                    }, { inicio: null }).inicio;

                    if (!inicioReal && execucoesDoPlano.length > 0) {
                        inicioReal = execucoesDoPlano[0].inicio;
                    }
                    
                    // Consolidar observações das execuções
                    const observacoesExecs = execucoesDoPlano
                        .filter(e => e.observacao)
                        .map(e => e.observacao)
                        .join('; ');
                    
                    if (observacoesExecs && observacaoConsolidada) {
                        observacaoConsolidada = `${observacaoConsolidada}; ${observacoesExecs}`;
                    } else if (observacoesExecs) {
                        observacaoConsolidada = observacoesExecs;
                    }
                }

                if (p.status === 'concluido' && execucoesFinalizadas.length > 0) {
                    terminoReal = execucoesFinalizadas.reduce((latest, current) => {
                        const latestDate = latest.termino ? parseISO(latest.termino) : new Date(0);
                        const currentDate = current.termino ? parseISO(current.termino) : latestDate;
                        return currentDate > latestDate ? current : latest;
                    }, { termino: null }).termino;
                }

                return {
                    ...p,
                    atividade: p.atividade_id ? atividadesMap[p.atividade_id] : null,
                    documento: p.documento_id ? documentosMap[p.documento_id] : null,
                    empreendimento: p.empreendimento_id ? empreendimentosMap[p.empreendimento_id] : null,
                    executor: p.executor_principal ? usuariosMap[p.executor_principal] : null,
                    termino_real: terminoReal,
                    inicio_real: inicioReal,
                    observacao: observacaoConsolidada,
                };
            });

            const atividadesRapidasTratadas = execucoes
                .filter(exec => !exec.planejamento_id)
                .map(exec => {
                    let statusNormalizado = 'nao_iniciado';
                    if (exec.status === 'Finalizado') statusNormalizado = 'concluido';
                    else if (exec.status === 'Em andamento') statusNormalizado = 'em_andamento';
                    else if (exec.status === 'Paralisado') statusNormalizado = 'pausado';

                    return {
                        id: exec.id,
                        isQuickActivity: true,
                        descritivo: exec.descritivo,
                        executor: usuariosMap[exec.usuario],
                        executor_principal: exec.usuario,
                        empreendimento: empreendimentosMap[exec.empreendimento_id],
                        empreendimento_id: exec.empreendimento_id,
                        documento: { numero: 'Atividade Rápida' },
                        status: statusNormalizado,
                        inicio_planejado: exec.inicio,
                        termino_planejado: exec.inicio,
                        inicio_real: exec.inicio,
                        termino_real: exec.status === 'Finalizado' ? exec.termino : null,
                        tempo_executado: exec.tempo_total || 0,
                        observacao: exec.observacao || '',
                    };
                });
            
            const combinedData = [...planejamentosEnriquecidos, ...atividadesRapidasTratadas];

            setData(prev => ({ 
                ...prev, 
                planejamentos: combinedData,
                execucoes: execucoes || []
            }));
            
            
        } catch (error) {
            console.error("Erro ao carregar dados do relatório:", error);
            alert("Erro ao carregar dados. Tente novamente.");
        } finally {
            setIsLoading(false);
        }
    }, [filters.usuario, data.empreendimentos, data.usuarios]);

    const planejamentosFiltrados = useMemo(() => {
        if (!data.planejamentos) return [];
        let filtered = data.planejamentos;

        if (filters.dataInicio) {
            const inicio = startOfDay(filters.dataInicio);
            filtered = filtered.filter(p => {
                if (!p.inicio_planejado) return false;
                const dataAtividade = startOfDay(parseISO(p.inicio_planejado));
                return dataAtividade >= inicio;
            });
        }
        if (filters.dataFim) {
            const fim = endOfDay(filters.dataFim);
            filtered = filtered.filter(p => {
                if (!p.inicio_planejado) return false;
                const dataAtividade = parseISO(p.inicio_planejado);
                return dataAtividade <= fim;
            });
        }

        if (filters.empreendimento && filters.empreendimento !== 'all') {
            filtered = filtered.filter(p => p.empreendimento_id === filters.empreendimento);
        }

        if (filters.status && filters.status !== 'all') {
            filtered = filtered.filter(p => {
                if (p.isQuickActivity) {
                    if (filters.status === 'atrasado') {
                        return false;
                    }
                    const targetStatus = filters.status === 'finalizado' ? 'concluido' : filters.status;
                    return p.status === targetStatus;
                }

                const isAtrasado = isOverdue(p);
                const currentStatus = isAtrasado ? 'atrasado' : (p.status || 'nao_iniciado');
                return currentStatus === filters.status;
            });
        }
        return filtered;
    }, [data.planejamentos, filters]);

    const execucoesFiltradas = useMemo(() => {
        if (!data.execucoes) return [];
        let filtered = data.execucoes;

        if (filters.dataInicio) {
            const inicio = startOfDay(filters.dataInicio);
            filtered = filtered.filter(e => {
                if (!e.inicio) return false;
                const dataExecucao = startOfDay(parseISO(e.inicio));
                return dataExecucao >= inicio;
            });
        }
        if (filters.dataFim) {
            const fim = endOfDay(filters.dataFim);
            filtered = filtered.filter(e => {
                if (!e.inicio) return false;
                const dataExecucao = parseISO(e.inicio);
                return dataExecucao <= fim;
            });
        }
        if (filters.empreendimento && filters.empreendimento !== 'all') {
            filtered = filtered.filter(e => e.empreendimento_id === filters.empreendimento);
        }
        
        return filtered;
    }, [data.execucoes, filters]);

    const handleExport = () => {
        if (activeTab === 'atividades' && planejamentosFiltrados.length === 0) {
            alert("Não há dados de atividades para exportar com os filtros atuais.");
            return;
        }
        if (activeTab === 'carga_horaria' && execucoesFiltradas.length === 0) {
            alert("Não há dados de carga horária para exportar com os filtros atuais.");
            return;
        }

        if (activeTab === 'atividades') {
            const dataToExport = [];
            
            planejamentosFiltrados.forEach(p => {
                const execsDoPlano = execucoesFiltradas.filter(e => e.planejamento_id === p.id);
                const isActuallyOverdue = !p.isQuickActivity && isOverdue(p);
                const currentStatus = (p.status !== 'concluido' && isActuallyOverdue) ? 'Atrasado' : (p.status || 'nao_iniciado');
                
                if (execsDoPlano.length > 0) {
                    // Para cada execução, adiciona uma linha
                    execsDoPlano.forEach((exec, index) => {
                        dataToExport.push({
                            "Usuário": p.executor?.full_name || p.executor?.nome || p.executor_principal || 'N/A',
                            "Empreendimento": p.empreendimento?.nome || 'N/A',
                            "Documento/Atividades": `${p.descritivo || p.atividade?.atividade || 'N/A'}${p.documento?.numero ? ` (Folha: ${p.documento.numero})` : ''}`,
                            "Horário Início": exec.inicio ? new Date(exec.inicio).toLocaleString('pt-BR') : 'N/A',
                            "Horário Fim": exec.termino ? new Date(exec.termino).toLocaleString('pt-BR') : 'Em andamento',
                            "Ação": exec.status === 'Finalizado' ? 'Finalizado' : 
                                   exec.status === 'Em andamento' ? 'Em Progresso' : 
                                   exec.status === 'Paralisado' ? 'Pausado' : exec.status,
                            "Tempo Gasto (h)": exec.tempo_total ? exec.tempo_total.toFixed(1) : '0.0',
                            "Status Atual": index === 0 ? currentStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '',
                            "Tempo Total (h)": index === 0 ? (p.tempo_executado ? p.tempo_executado.toFixed(1) : '0.0') : '',
                            "Observação": exec.observacao || p.observacao || '',
                        });
                    });
                } else {
                    // Sem execuções, adiciona apenas o planejamento
                    dataToExport.push({
                        "Usuário": p.executor?.full_name || p.executor?.nome || p.executor_principal || 'N/A',
                        "Empreendimento": p.empreendimento?.nome || 'N/A',
                        "Documento/Atividades": `${p.descritivo || p.atividade?.atividade || 'N/A'}${p.documento?.numero ? ` (Folha: ${p.documento.numero})` : ''}`,
                        "Horário Início": p.inicio_real ? new Date(p.inicio_real).toLocaleDateString('pt-BR') : 'N/A',
                        "Horário Fim": p.termino_real ? new Date(p.termino_real).toLocaleDateString('pt-BR') : 'N/A',
                        "Ação": '-',
                        "Tempo Gasto (h)": '-',
                        "Status Atual": currentStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        "Tempo Total (h)": p.tempo_executado ? p.tempo_executado.toFixed(1) : '0.0',
                        "Observação": p.observacao || '',
                    });
                }
            });

            exportToExcel(dataToExport, "Relatorio_de_Atividades_Detalhado");
        } else if (activeTab === 'carga_horaria') {
            const dataToExport = execucoesFiltradas.map(exec => {
                const usuario = data.usuarios.find(u => u.email === exec.usuario);
                const empreendimento = data.empreendimentos.find(e => e.id === exec.empreendimento_id);
                const planejamento = data.planejamentos.find(p => p.id === exec.planejamento_id);

                return {
                    "Usuário": usuario?.full_name || usuario?.nome || exec.usuario || 'N/A',
                    "Empreendimento": empreendimento?.nome || 'N/A',
                    "Atividade": exec.descritivo || planejamento?.descritivo || 'N/A',
                    "Data Início": exec.inicio ? new Date(exec.inicio).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A',
                    "Data Término": exec.termino ? new Date(exec.termino).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A',
                    "Tempo Total (h)": exec.tempo_total ? exec.tempo_total.toFixed(1) : '0.0',
                    "Status": exec.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                };
            });
            exportToExcel(dataToExport, "Relatorio_de_Carga_Horaria");
        }
    };

    // MODIFICADO: Tela inicial antes de buscar - agora aceita 'all' como seleção válida
    if (!hasSearched) {
        return (
            <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
                <Card className="shadow-lg max-w-4xl mx-auto">
                    <CardHeader>
                        <CardTitle className="text-2xl font-bold">Relatório de Atividades</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
                                <Search className="w-12 h-12 text-blue-600 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                    Selecione um ou mais usuários
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    Para carregar o relatório, selecione um usuário específico ou todos os usuários.
                                </p>
                            </div>

                            <RelatorioFiltros
                                filters={filters}
                                onFilterChange={setFilters}
                                empreendimentos={data.empreendimentos}
                                usuarios={data.usuarios}
                            />

                            <div className="flex justify-center">
                                <Button 
                                    onClick={loadData}
                                    disabled={!filters.usuario || isLoading}
                                    size="lg"
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                            Carregando...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-4 h-4 mr-2" />
                                            Buscar Atividades
                                        </>
                                    )}
                                </Button>
                            </div>
                            
                            {filters.usuario === 'all' && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                                    <p className="text-amber-800 text-sm">
                                        ⚠️ Buscar por todos os usuários pode demorar mais tempo dependendo da quantidade de dados.
                                    </p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6 md:p-8 bg-gray-50 min-h-screen">
                <Card className="shadow-lg">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <Skeleton className="h-8 w-1/3" />
                            <Skeleton className="h-10 w-40" />
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-2xl font-bold">Relatório de Atividades</CardTitle>
                        <div className="flex gap-2">
                            <Button 
                                onClick={loadData}
                                disabled={!filters.usuario || isLoading}
                                variant="outline"
                            >
                                <Search className="w-4 h-4 mr-2" />
                                Buscar Novamente
                            </Button>
                            <Button 
                                onClick={handleExport} 
                                disabled={activeTab === 'atividades' ? planejamentosFiltrados.length === 0 : execucoesFiltradas.length === 0}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Exportar para Excel
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <RelatorioFiltros
                        filters={filters}
                        onFilterChange={setFilters}
                        empreendimentos={data.empreendimentos}
                        usuarios={data.usuarios}
                    />
                    
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full mt-6">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="atividades">Relatório de Atividades</TabsTrigger>
                            <TabsTrigger value="carga_horaria">Relatório de Carga Horária</TabsTrigger>
                        </TabsList>
                        <TabsContent value="atividades" className="mt-4">
                            <RelatorioResumo planejamentos={planejamentosFiltrados} execucoes={execucoesFiltradas} />
                            <div className="mt-6">
                                <RelatorioAtividades 
                                    planejamentos={planejamentosFiltrados} 
                                    execucoes={execucoesFiltradas}
                                />
                            </div>
                        </TabsContent>
                        <TabsContent value="carga_horaria" className="mt-4">
                             <RelatorioCargaHoraria 
                                execucoes={execucoesFiltradas}
                                usuarios={data.usuarios}
                             />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}