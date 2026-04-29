import React, { useState, useEffect, useMemo, useContext } from 'react';
import { User } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from '@/components/ui/badge';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Folder, BarChart3, Play, Timer, BookOpen, CalendarDays, Calendar } from "lucide-react";
import { ActivityTimerContext } from "../contexts/ActivityTimerContext";
import { canStartActivity } from "../utils/PredecessoraValidator";
import PlanejamentoDocumentacaoModal from "./PlanejamentoDocumentacaoModal";
import PlanejamentoAtividadeModal from "./PlanejamentoAtividadeModal";

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
};

// Subdisciplinas que devem aparecer na aba de Documentação
const SUBDISCIPLINAS_DOCUMENTACAO = [
  'Gestão',
  'Controle', 
  'Coordenação',
  'BIM',
  'Apoio',
  'Qualidade',
  'Planejamento'
];

// Atividades que devem ter tempo multiplicado pela quantidade de folhas
const ATIVIDADES_MULTIPLICAR_POR_FOLHAS = [
  'Carimbo, nota e legenda'
];

// Atividades que devem ter tempo multiplicado por pavimento e por etapa
const ATIVIDADES_MULTIPLICAR_POR_PAVIMENTO_ETAPA = [
  'Confecção de A-',
  'Confecção de E-'
];

// Etapas para multiplicação
const ETAPAS_PARA_MULTIPLICAR = [
  'Estudo Preliminar',
  'Ante-Projeto',
  'Projeto Básico',
  'Projeto Executivo',
  'Liberado para Obra'
];

export default function AnaliseConcepcaoPlanejamentoTab({
  empreendimentoId,
  planejamentos = [], 
  atividades = [],
  execucoes = [],
  usuarios = [],
  documentos = [], // Adicionar documentos para contar folhas
  pavimentos = [], // Adicionar pavimentos para multiplicação
  onUpdate
}) {
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [subdisciplinaFilter, setSubdisciplinaFilter] = useState("todas");
    const [statusFilter, setStatusFilter] = useState("todos");
    const [user, setUser] = useState(null);
    const { activeExecution, startExecution } = useContext(ActivityTimerContext);

    const [isPlanningModalOpen, setIsPlanningModalOpen] = useState(false);
    const [showPlanejamentoModal, setShowPlanejamentoModal] = useState(false);
    const [atividadeParaPlanejar, setAtividadeParaPlanejar] = useState(null);

    useEffect(() => {
        User.me().then(setUser).catch(() => setUser(null));
    }, []);

    // Mapa de atividades por ID
    const atividadesMap = useMemo(() => (atividades || []).reduce((acc, ativ) => ({ ...acc, [ativ.id]: ativ }), {}), [atividades]);
    
    // CORRIGIDO: Mapear múltiplos planejamentos por atividade (apenas não concluídos e não zerados sem documento)
    const planejamentosPorAtividadeMap = useMemo(() => {
        const map = {};
        (planejamentos || []).forEach(plan => {
            // Ensure activity exists and belongs to a documentation subdiscipline
            if (plan.atividade_id && atividadesMap[plan.atividade_id] && SUBDISCIPLINAS_DOCUMENTACAO.includes(atividadesMap[plan.atividade_id].subdisciplina)) {
                // Filtrar planejamentos com tempo 0 e sem documento (planejamentos inválidos/duplicados)
                // IMPORTANTE: NÃO filtrar planejamentos concluídos manualmente (tempo 0 com documento)
                if ((plan.tempo_planejado === 0 || !plan.tempo_planejado) && !plan.documento_id) {
                    return; // Pular planejamentos zerados sem documento
                }
                
                if (!map[plan.atividade_id]) {
                    map[plan.atividade_id] = [];
                }
                map[plan.atividade_id].push(plan);
            }
        });
        return map;
    }, [planejamentos, atividadesMap]);

    const execucoesMap = useMemo(() => (execucoes || []).reduce((acc, exec) => {
        if (!acc[exec.planejamento_id]) acc[exec.planejamento_id] = [];
        acc[exec.planejamento_id].push(exec);
        return acc;
    }, {}), [execucoes]);

    const handleOpenPlanningModal = () => {
        setIsPlanningModalOpen(true);
    };

    const handlePlanejarAtividade = (atividade) => {
        setAtividadeParaPlanejar(atividade);
        setShowPlanejamentoModal(true);
    };

    const handleIniciarAtividade = async (planejamento) => {
        if (!planejamento || !empreendimentoId || activeExecution) return;
        
        const atividade = atividadesMap[planejamento.atividade_id];
        if (!atividade) { 
            alert("Atividade não encontrada"); 
            return; 
        }

        try {
            const { PlanejamentoAtividade } = await import('@/entities/all');
            const todosPlanejamentos = await PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoId });

            const { canStart, reason } = canStartActivity(atividade, todosPlanejamentos, null);

            if (!canStart) {
                alert(`Não é possível iniciar esta atividade: ${reason}`);
                return;
            }

            await startExecution({
                planejamento_id: planejamento.id,
                descritivo: atividade.atividade,
                empreendimento_id: empreendimentoId
            });
        } catch (error) {
            console.error("Erro ao verificar predecessoras:", error);
            alert("Erro ao verificar dependências da atividade");
        }
    };

    // CORRIGIDO: Mostrar todas as atividades disponíveis de documentação (não apenas as planejadas)
    const filteredData = useMemo(() => {
        // 1. Filtrar atividades GERAIS (sem empreendimento_id) com subdisciplinas de documentação
        let atividadesDocumentacao = (atividades || []).filter(atividade => {
            const isGeneral = !atividade.empreendimento_id;
            const hasDocSubdisciplina = SUBDISCIPLINAS_DOCUMENTACAO.includes(atividade.subdisciplina);
            return isGeneral && hasDocSubdisciplina;
        });

        // 2. Aplicar filtros de busca
        if (debouncedSearchTerm) {
            atividadesDocumentacao = atividadesDocumentacao.filter(atividade =>
                (atividade.atividade || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase())
            );
        }
        
        // 3. Aplicar filtro de subdisciplina
        if (subdisciplinaFilter !== "todas") {
            atividadesDocumentacao = atividadesDocumentacao.filter(atividade =>
                atividade.subdisciplina === subdisciplinaFilter
            );
        }
        
        // CORRIGIDO: Lógica de filtro de status para múltiplos planejamentos
        if (statusFilter !== "todos") {
            atividadesDocumentacao = atividadesDocumentacao.filter(atividade => {
                const planejamentosDaAtividade = planejamentosPorAtividadeMap[atividade.id] || [];
                
                if (planejamentosDaAtividade.length === 0) {
                    return statusFilter === "nao_iniciado";
                }
                
                const tempoPlanejadoTotal = planejamentosDaAtividade.reduce((sum, p) => sum + (Number(p.tempo_planejado) || 0), 0);
                const tempoExecutadoTotal = planejamentosDaAtividade.reduce((sum, p) => sum + (Number(p.tempo_executado) || 0), 0);
                const percentual = tempoPlanejadoTotal > 0 ? (tempoExecutadoTotal / tempoPlanejadoTotal) * 100 : 0;
                
                if (statusFilter === "nao_iniciado") return percentual === 0;
                if (statusFilter === "em_andamento") return percentual > 0 && percentual < 100;
                if (statusFilter === "concluido") return percentual >= 100;
                return true;
            });
        }

        // 5. Ordenar por nome da atividade
        atividadesDocumentacao.sort((a, b) => {
            const nomeA = a.atividade || '';
            const nomeB = b.atividade || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });

        return atividadesDocumentacao;
    }, [atividades, debouncedSearchTerm, subdisciplinaFilter, statusFilter, planejamentosPorAtividadeMap]);

    // Filtrar apenas atividades de documentação para o modal
    const atividadesDocumentacao = useMemo(() => {
        return (atividades || []).filter(ativ => 
            !ativ.empreendimento_id && // Apenas atividades gerais
            SUBDISCIPLINAS_DOCUMENTACAO.includes(ativ.subdisciplina)
        );
    }, [atividades]);

    const planejamentosDocumentacao = useMemo(() => {
        return (planejamentos || []).filter(plan => {
            const atividade = atividadesMap[plan.atividade_id];
            return atividade && SUBDISCIPLINAS_DOCUMENTACAO.includes(atividade.subdisciplina);
        });
    }, [planejamentos, atividadesMap]);

    // Quantidade de folhas (documentos) do empreendimento
    const quantidadeFolhas = useMemo(() => (documentos || []).length, [documentos]);
    
    // Quantidade de pavimentos do empreendimento
    const quantidadePavimentos = useMemo(() => (pavimentos || []).length, [pavimentos]);
    
    // Quantidade de etapas
    const quantidadeEtapas = ETAPAS_PARA_MULTIPLICAR.length;

    const formatarTempo = (horas) => `${Number(horas || 0).toFixed(1)}h`;
    const calcularPercentual = (tempoExecutado, tempoReal) => Math.round(((Number(tempoExecutado) || 0) / (Number(tempoReal) || 1)) * 100);
    const getStatusColor = (p) => p === 0 ? "bg-gray-100 text-gray-800" : p < 100 ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800";
    const getStatusText = (p) => p === 0 ? "Não Iniciado" : p < 100 ? "Em Andamento" : "Concluído";
    
    // Função auxiliar para verificar se atividade deve multiplicar por pavimento/etapa
    const deveMultiplicarPorPavimentoEtapa = (nomeAtividade) => {
        return ATIVIDADES_MULTIPLICAR_POR_PAVIMENTO_ETAPA.some(prefixo => 
            (nomeAtividade || '').startsWith(prefixo)
        );
    };

    // Função para calcular tempo padrão considerando multiplicadores
    const calcularTempoPadrao = (atividade) => {
        const tempoBase = Number(atividade.tempo) || 0;
        
        // Multiplicar por folhas (documentos)
        if (ATIVIDADES_MULTIPLICAR_POR_FOLHAS.includes(atividade.atividade)) {
            return tempoBase * quantidadeFolhas;
        }
        
        // Multiplicar por pavimentos e etapas (usando prefixo)
        if (deveMultiplicarPorPavimentoEtapa(atividade.atividade)) {
            return tempoBase * quantidadePavimentos * quantidadeEtapas;
        }
        
        return tempoBase;
    };
    
    // Função para obter o texto explicativo do multiplicador
    const getMultiplicadorTexto = (atividade) => {
        if (ATIVIDADES_MULTIPLICAR_POR_FOLHAS.includes(atividade.atividade) && quantidadeFolhas > 0) {
            return `(${atividade.tempo}h × ${quantidadeFolhas} folhas)`;
        }
        if (deveMultiplicarPorPavimentoEtapa(atividade.atividade) && quantidadePavimentos > 0) {
            return `(${atividade.tempo}h × ${quantidadePavimentos} pav. × ${quantidadeEtapas} etapas)`;
        }
        return null;
    };

    return (
        <div className="space-y-6">
            <PlanejamentoDocumentacaoModal
                isOpen={isPlanningModalOpen}
                onClose={() => setIsPlanningModalOpen(false)}
                empreendimentoId={empreendimentoId}
                atividades={atividadesDocumentacao}
                planejamentos={planejamentosDocumentacao}
                usuarios={usuarios}
                onSave={onUpdate}
            />

            {showPlanejamentoModal && atividadeParaPlanejar && (
                <PlanejamentoAtividadeModal
                    isOpen={showPlanejamentoModal}
                    onClose={() => {
                        setShowPlanejamentoModal(false);
                        setAtividadeParaPlanejar(null);
                    }}
                    atividade={atividadeParaPlanejar}
                    usuarios={usuarios}
                    empreendimentoId={empreendimentoId}
                    onSuccess={() => {
                        setShowPlanejamentoModal(false);
                        setAtividadeParaPlanejar(null);
                        onUpdate();
                    }}
                />
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Filter className="w-5 h-5" /> Filtros</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="search">Buscar</Label>
                            <Input id="search" placeholder="Buscar atividade..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="subdisciplina">Subdisciplina</Label>
                            <Select value={subdisciplinaFilter} onValueChange={setSubdisciplinaFilter}>
                                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todas">Todas</SelectItem>
                                    {SUBDISCIPLINAS_DOCUMENTACAO.map(sub => (
                                        <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="todos">Todos</SelectItem>
                                    <SelectItem value="nao_iniciado">Não Iniciado</SelectItem>
                                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                                    <SelectItem value="concluido">Concluído</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5" /> Atividades de Documentação ({filteredData.length})
                    </CardTitle>
                    <Button 
                        onClick={handleOpenPlanningModal}
                        className="bg-blue-600 hover:bg-blue-700"
                    >
                        <CalendarDays className="w-4 h-4 mr-2" />
                        Planejar em Massa
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Etapa</TableHead>
                                    <TableHead>Subdisciplina</TableHead>
                                    <TableHead>Atividade</TableHead>
                                    <TableHead>Tempo Padrão</TableHead>
                                    <TableHead>Tempo Executado</TableHead>
                                    <TableHead>Progresso</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredData.length > 0 ? filteredData.map(atividade => {
                                    // CORRIGIDO: Lógica para múltiplos planejamentos
                                    const planejamentosDaAtividade = planejamentosPorAtividadeMap[atividade.id] || [];
                                    const tempoPlanejadoTotal = planejamentosDaAtividade.reduce((sum, p) => sum + (Number(p.tempo_planejado) || 0), 0);
                                    const tempoExecutadoTotal = planejamentosDaAtividade.reduce((sum, p) => sum + (Number(p.tempo_executado) || 0), 0);
                                    const percentual = tempoPlanejadoTotal > 0 ? calcularPercentual(tempoExecutadoTotal, tempoPlanejadoTotal) : 0;
                                    
                                    return (
                                        <TableRow key={atividade.id}>
                                            <TableCell><Badge variant="outline">{atividade.etapa}</Badge></TableCell>
                                            <TableCell><Badge className="bg-purple-100 text-purple-800">{atividade.subdisciplina}</Badge></TableCell>
                                            <TableCell className="max-w-xs truncate" title={atividade.atividade}>{atividade.atividade}</TableCell>
                                            <TableCell>
                                                {formatarTempo(calcularTempoPadrao(atividade))}
                                                {getMultiplicadorTexto(atividade) && (
                                                    <span className="text-xs text-gray-500 block">
                                                        {getMultiplicadorTexto(atividade)}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>{formatarTempo(tempoExecutadoTotal)}</TableCell>
                                            <TableCell>
                                                <Progress value={percentual} className="w-full" />
                                                <span className="text-xs text-gray-500">{percentual}%</span>
                                            </TableCell>
                                            <TableCell><Badge className={getStatusColor(percentual)}>{getStatusText(percentual)}</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex gap-2 justify-end">
                                                    {/* CORRIGIDO: Botão de planejar sempre visível */}
                                                    <Button 
                                                        size="sm" 
                                                        onClick={() => handlePlanejarAtividade(atividade)}
                                                        className="bg-blue-600 hover:bg-blue-700"
                                                    >
                                                        <Calendar className="w-3 h-3 mr-1" /> Planejar
                                                    </Button>
                                                    
                                                    {/* Lógica de "Iniciar" pode ser revista no futuro, se necessário */}
                                                    {planejamentosDaAtividade.length > 0 && !activeExecution && (
                                                        <Button size="sm" onClick={() => handleIniciarAtividade(planejamentosDaAtividade[0])} title="Iniciar a primeira ocorrência planejada">
                                                            <Play className="w-3 h-3 mr-1" /> Iniciar
                                                        </Button>
                                                    )}
                                                    {activeExecution && (
                                                        <Timer className="w-4 h-4 text-gray-400 self-center" />
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                }) : (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8">
                                            <Folder className="w-12 h-12 text-gray-300 mx-auto" />
                                            <p className="text-gray-500 mt-2">
                                                {debouncedSearchTerm || subdisciplinaFilter !== "todas" || statusFilter !== "todos"
                                                    ? "Nenhuma atividade encontrada com os filtros aplicados."
                                                    : "Nenhuma atividade de documentação disponível."
                                                }
                                            </p>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}