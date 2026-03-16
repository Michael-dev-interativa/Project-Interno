import React, { useState, useEffect, useMemo } from 'react';
import { Documento, PlanejamentoAtividade, PlanejamentoDocumento, Atividade, Execucao, Empreendimento, Usuario } from '@/entities/all';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play, Square, Filter, ClipboardList, CheckSquare, FileText, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import PlanejamentoAtividadeModal from "@/components/empreendimento/PlanejamentoAtividadeModal";

export default function AnaliseConcepcaoPlanejamento() {
    const [documentos, setDocumentos] = useState([]);
    const [planejamentos, setPlanejamentos] = useState([]);
    const [atividadesMap, setAtividadesMap] = useState({});
    const [execucoesMap, setExecucoesMap] = useState({});
    const [empreendimentos, setEmpreendimentos] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    
    // Filters
    const [filterEmpreendimento, setFilterEmpreendimento] = useState("todos");
    const [filterDisciplina, setFilterDisciplina] = useState("todas");
    const [selectedEtapas, setSelectedEtapas] = useState([]);
    
    const [isStopModalOpen, setIsStopModalOpen] = useState(false);
    const [selectedExecucao, setSelectedExecucao] = useState(null);
    const [finalStatus, setFinalStatus] = useState("Finalizado");
    
    const [selectedDocAtividades, setSelectedDocAtividades] = useState([]);
    const [planejamentoModalOpen, setPlanejamentoModalOpen] = useState(false);
    const [currentAtividade, setCurrentAtividade] = useState(null);
    const [usuarios, setUsuarios] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [docsData, planejamentosAtivData, planejamentosDocData, ativsData, execsData, currentUser, empData, usuariosData] = await Promise.all([
                Documento.list(),
                PlanejamentoAtividade.list(),
                PlanejamentoDocumento.list(),
                Atividade.list(),
                Execucao.list(),
                base44.auth.me(),
                Empreendimento.list(),
                Usuario.list()
            ]);

            // Combinar planejamentos de atividade e documento
            const planosAtivComTipo = planejamentosAtivData.map(p => ({ ...p, tipo_planejamento: 'atividade' }));
            const planosDocComTipo = planejamentosDocData.map(p => ({ ...p, tipo_planejamento: 'documento' }));
            const todosPlanejamentos = [...planosAtivComTipo, ...planosDocComTipo];

            const aMap = ativsData.reduce((acc, ativ) => { acc[ativ.id] = ativ; return acc; }, {});
            const eMap = execsData.reduce((acc, exec) => {
                if (!acc[exec.planejamento_id]) acc[exec.planejamento_id] = [];
                acc[exec.planejamento_id].push(exec);
                return acc;
            }, {});

            setAtividadesMap(aMap);
            setExecucoesMap(eMap);
            setDocumentos(docsData);
            setPlanejamentos(todosPlanejamentos);
            setEmpreendimentos(empData);
            setUser(currentUser);
            setUsuarios(usuariosData);
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
        }
        setIsLoading(false);
    };

    const handleStartExecution = async (planejamentoId) => {
        const planejamento = planejamentos.find(a => a.id === planejamentoId);
        if (!planejamento || !user) return;
        const atividade = atividadesMap[planejamento.atividade_id];
        
        const execucao = await Execucao.create({
            planejamento_id: planejamentoId,
            descritivo: planejamento.descritivo || atividade?.atividade || 'Atividade',
            empreendimento_id: planejamento.empreendimento_id,
            usuario: user.email,
            inicio: new Date().toISOString(),
            status: "Em andamento"
        });
        
        setExecucoesMap(prev => ({
            ...prev,
            [planejamentoId]: [...(prev[planejamentoId] || []), execucao]
        }));
    };

    const openStopModal = (execucao) => {
        setSelectedExecucao(execucao);
        setIsStopModalOpen(true);
    };

    const handleConfirmStop = async () => {
        if (!selectedExecucao) return;
        const inicio = new Date(selectedExecucao.inicio);
        const termino = new Date();
        const tempoTotal = (termino - inicio) / (1000 * 60 * 60);

        // Atualizar Execucao
        await Execucao.update(selectedExecucao.id, {
            status: finalStatus === "Finalizado" ? "Finalizado" : "Paralisado",
            termino: termino.toISOString(),
            tempo_total: tempoTotal
        });

        // Atualizar PlanejamentoAtividade com horas_executadas_por_dia
        const planejamento = planejamentos.find(p => p.id === selectedExecucao.planejamento_id);
        if (planejamento) {
            const diaKey = new Date(selectedExecucao.inicio).toISOString().split('T')[0]; // YYYY-MM-DD
            const horasExecutadasPorDia = planejamento.horas_executadas_por_dia || {};
            horasExecutadasPorDia[diaKey] = (horasExecutadasPorDia[diaKey] || 0) + tempoTotal;

            // Calcular tempo_executado como soma total de horas_executadas_por_dia
            const totalTempoExecutado = Object.values(horasExecutadasPorDia).reduce((sum, h) => sum + (Number(h) || 0), 0);

            // Se horas_por_dia estiver vazio, preencher com as horas_executadas_por_dia
            let horasPorDia = planejamento.horas_por_dia;
            if (!horasPorDia || Object.keys(horasPorDia).length === 0) {
              horasPorDia = horasExecutadasPorDia;
            }

            // Atualizar o tipo correto de planejamento
            const EntityToUpdate = planejamento.tipo_planejamento === 'documento' ? PlanejamentoDocumento : PlanejamentoAtividade;
            await EntityToUpdate.update(planejamento.id, {
                horas_por_dia: horasPorDia,
                horas_executadas_por_dia: horasExecutadasPorDia,
                tempo_executado: totalTempoExecutado,
                tempo_planejado: totalTempoExecutado,
                is_quick_activity: true,
                status: finalStatus === "Finalizado" ? "concluido" : "pausado"
            });

            // Se a atividade foi finalizada, verificar se todas as atividades da folha estão concluídas
            if (finalStatus === "Finalizado" && planejamento.documento_id) {
                const planejamentosDoDocumento = planejamentos.filter(p => p.documento_id === planejamento.documento_id);
                const todasConcluidas = planejamentosDoDocumento.every(p => {
                    if (p.id === planejamento.id) return true; // A atual que acabou de ser concluída
                    const outraExec = execucoesMap[p.id] || [];
                    return outraExec.some(e => e.status === "Finalizado");
                });

                // Atualizar status do documento se todas estão concluídas
                if (todasConcluidas && planejamentos.find(p => p.id === planejamento.id)?.tipo_planejamento === 'documento') {
                    const doc = documentos.find(d => d.id === planejamento.documento_id);
                    if (doc) {
                        await Documento.update(doc.id, { status: 'concluido' });
                    }
                }
            }

            // Atualizar estado local
            setPlanejamentos(prev => prev.map(p => 
                p.id === planejamento.id 
                    ? { ...p, horas_por_dia: horasPorDia, horas_executadas_por_dia: horasExecutadasPorDia, tempo_executado: totalTempoExecutado, status: finalStatus === "Finalizado" ? "concluido" : "pausado" }
                    : p
            ));
        }

        setExecucoesMap(prev => ({
            ...prev,
            [selectedExecucao.planejamento_id]: prev[selectedExecucao.planejamento_id].map(e => 
                e.id === selectedExecucao.id 
                    ? { ...e, status: finalStatus === "Finalizado" ? "Finalizado" : "Paralisado", termino: termino.toISOString(), tempo_total: tempoTotal }
                    : e
            )
        }));

        setIsStopModalOpen(false);
        setSelectedExecucao(null);
        setFinalStatus("Finalizado");
    };
    
    const getStatusBadge = (planejamento) => {
        const execucoes = execucoesMap[planejamento.id] || [];
        const execucaoAtiva = execucoes.find(e => e.status === "Em andamento" && e.usuario === user?.email);

        if (execucaoAtiva) {
            return (
                <Button size="sm" variant="destructive" onClick={() => openStopModal(execucaoAtiva)}>
                    <Square className="w-4 h-4 mr-2" /> Parar
                </Button>
            );
        }
        return (
            <Button size="sm" onClick={() => handleStartExecution(planejamento.id)}>
                <Play className="w-4 h-4 mr-2" /> Iniciar
            </Button>
        );
    };

    const filteredPlanejamentos = useMemo(() => {
        const disciplinasExcluidas = ['Planejamento', 'Gestão', 'BIM', 'Apoio', 'Coordenação'];
        
        return planejamentos.filter(plan => {
            const atividade = atividadesMap[plan.atividade_id];
            if (!atividade && !plan.descritivo) return false;
            
            // Excluir disciplinas específicas
            if (atividade?.disciplina && disciplinasExcluidas.includes(atividade.disciplina)) {
                return false;
            }
            
            const etapaPlan = plan.etapa || atividade?.etapa;
            const etapaMatch = selectedEtapas.length === 0 || selectedEtapas.includes(etapaPlan);
            const empreendimentoMatch = filterEmpreendimento === "todos" || plan.empreendimento_id === filterEmpreendimento;
            const disciplinaMatch = filterDisciplina === "todos" || atividade?.disciplina === filterDisciplina;
            
            return etapaMatch && empreendimentoMatch && disciplinaMatch;
        });
    }, [planejamentos, atividadesMap, selectedEtapas, filterEmpreendimento, filterDisciplina]);

    const planejamentosDocumentacao = useMemo(() => {
        const disciplinasDocumentacao = ['Planejamento', 'Gestão', 'BIM', 'Apoio', 'Coordenação'];
        
        return planejamentos.filter(plan => {
            const atividade = atividadesMap[plan.atividade_id];
            if (!atividade && !plan.descritivo) return false;
            
            // Excluir atividades finalizadas
            if (plan.status === 'concluido') return false;
            
            if (!atividade?.disciplina || !disciplinasDocumentacao.includes(atividade.disciplina)) {
                return false;
            }
            
            const etapaPlan = plan.etapa || atividade?.etapa;
            const etapaMatch = selectedEtapas.length === 0 || selectedEtapas.includes(etapaPlan);
            const empreendimentoMatch = filterEmpreendimento === "todos" || plan.empreendimento_id === filterEmpreendimento;
            const disciplinaMatch = filterDisciplina === "todos" || atividade?.disciplina === filterDisciplina;
            
            return etapaMatch && empreendimentoMatch && disciplinaMatch;
        });
    }, [planejamentos, atividadesMap, selectedEtapas, filterEmpreendimento, filterDisciplina]);

    const groupedByDocumento = useMemo(() => {
         const grouped = {};
         const semDocumento = [];

         filteredPlanejamentos.forEach(plan => {
             // Excluir atividades finalizadas do agrupamento
             if (plan.status === 'concluido') return;

             if (!plan.documento_id) {
                 semDocumento.push(plan);
                 return;
             }
             if (!grouped[plan.documento_id]) {
                 const doc = documentos.find(d => d.id === plan.documento_id);
                 if (doc) {
                     grouped[plan.documento_id] = { doc, planejamentos: [] };
                 }
             }
             if (grouped[plan.documento_id]) {
                 grouped[plan.documento_id].planejamentos.push(plan);
             }
         });

         const result = Object.values(grouped).sort((a,b) => {
             const disciplinaA = a.doc.disciplina || '';
             const disciplinaB = b.doc.disciplina || '';
             const numeroA = a.doc.numero || '';
             const numeroB = b.doc.numero || '';
             return disciplinaA.localeCompare(disciplinaB) || numeroA.localeCompare(numeroB);
         });

         // Adicionar atividades sem documento no início
         if (semDocumento.length > 0) {
             result.unshift({ doc: null, planejamentos: semDocumento });
         }

         return result;
     }, [filteredPlanejamentos, documentos]);
    
    const disciplinasDisponiveis = [...new Set(Object.values(atividadesMap).map(a => a.disciplina))];
    
    // Coletar todas as etapas existentes nos planejamentos
    const etapasDisponiveis = useMemo(() => {
        const etapasSet = new Set();
        planejamentos.forEach(plan => {
            const atividade = atividadesMap[plan.atividade_id];
            const etapa = plan.etapa || atividade?.etapa;
            if (etapa) etapasSet.add(etapa);
        });
        return Array.from(etapasSet).sort();
    }, [planejamentos, atividadesMap]);

    const toggleEtapa = (etapa) => {
        setSelectedEtapas(prev => 
            prev.includes(etapa) ? prev.filter(e => e !== etapa) : [...prev, etapa]
        );
    };

    const handlePlanejamentoAtividadeComplete = () => {
        loadData();
        setPlanejamentoModalOpen(false);
        setCurrentAtividade(null);
    };

    const handlePlanejarAtividade = (atividade, empreendimentoId) => {
        setCurrentAtividade({ ...atividade, empreendimentoId });
        setPlanejamentoModalOpen(true);
    };

    const toggleDocAtividadeSelection = (atividadeId) => {
        setSelectedDocAtividades(prev => 
            prev.includes(atividadeId) ? prev.filter(id => id !== atividadeId) : [...prev, atividadeId]
        );
    };

    const handlePlanejarSelecionadas = () => {
        if (selectedDocAtividades.length === 0) return;
        // Aqui você pode abrir um modal para planejamento em massa
        alert(`Planejar ${selectedDocAtividades.length} atividades selecionadas`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6 md:p-8">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <ClipboardList className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Análise de Concepção e Planejamento</h1>
                        <p className="text-gray-600">Visão consolidada das etapas iniciais de todos os projetos.</p>
                    </div>
                </div>

                <Card className="bg-white border-0 shadow-lg mb-8">
                    <CardHeader className="border-b border-gray-100">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Filter className="w-5 h-5 text-blue-600"/> Filtros
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="text-sm font-medium text-gray-700 mb-2 block">Etapas</label>
                            <div className="flex flex-wrap gap-2">
                                {etapasDisponiveis.map(etapa => (
                                    <Button key={etapa} variant={selectedEtapas.includes(etapa) ? "default" : "outline"} onClick={() => toggleEtapa(etapa)}>
                                        {selectedEtapas.includes(etapa) && <CheckSquare className="w-4 h-4 mr-2" />}
                                        {etapa}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <Select value={filterEmpreendimento} onValueChange={setFilterEmpreendimento}>
                            <SelectTrigger><SelectValue placeholder="Filtrar por Empreendimento" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todos os Empreendimentos</SelectItem>
                                {empreendimentos.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterDisciplina} onValueChange={setFilterDisciplina}>
                            <SelectTrigger><SelectValue placeholder="Filtrar por Disciplina" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="todos">Todas as Disciplinas</SelectItem>
                                {disciplinasDisponiveis.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {isLoading ? <Skeleton className="h-96 w-full" /> : (
                    <div className="space-y-6">
                        <Card className="bg-white border-0 shadow-lg">
                            <CardHeader className="border-b border-gray-100">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                    Atividades de Projeto
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                                    <Table className="min-w-max">
                                        <TableHeader className="sticky top-0 bg-white z-10">
                                            <TableRow>
                                                <TableHead>Documento</TableHead>
                                                <TableHead>Atividade</TableHead>
                                                <TableHead className="text-center">Tempo Real</TableHead>
                                                <TableHead className="text-center">Tempo Executado</TableHead>
                                                <TableHead className="text-center">Ações</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupedByDocumento.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                                                        Nenhuma atividade encontrada com os filtros selecionados.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                groupedByDocumento.map(({ doc, planejamentos: docPlanejamentos }) => (
                                                    <React.Fragment key={doc?.id || 'sem-doc'}>
                                                        <TableRow className="bg-gray-50 hover:bg-gray-100">
                                                            <TableCell colSpan={5} className="font-semibold p-3">
                                                                {doc ? (
                                                                    <div className="flex flex-col">
                                                                        <span>{doc.numero}</span>
                                                                        <span className="text-xs text-gray-500 font-normal">{empreendimentos.find(e => e.id === doc.empreendimento_id)?.nome}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex flex-col">
                                                                        <span>Atividades de Projeto</span>
                                                                        <span className="text-xs text-gray-500 font-normal">Atividades não vinculadas a uma folha específica</span>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                        {docPlanejamentos.map((planejamento, idx) => {
                                                            const atividade = atividadesMap[planejamento.atividade_id];
                                                            const execucoes = execucoesMap[planejamento.id] || [];
                                                            const tempoExecutadoTotal = execucoes
                                                                .filter(e => e.status === "Finalizado")
                                                                .reduce((sum, e) => sum + (e.tempo_total || 0), 0);
                                                            const tempoExibir = planejamento.tempo_executado || tempoExecutadoTotal;

                                                            return planejamento.status !== 'concluido' ? (
                                                                <TableRow key={planejamento.id}>
                                                                    <TableCell>{idx === 0 && doc ? `${doc.disciplina || '-'}` : ""}</TableCell>
                                                                    <TableCell>{planejamento.descritivo || atividade?.atividade || 'Atividade não encontrada'}</TableCell>
                                                                    <TableCell className="text-center">{(planejamento.tempo_planejado || 0).toFixed(1)}h</TableCell>
                                                                    <TableCell className="text-center">{tempoExibir.toFixed(1)}h</TableCell>
                                                                    <TableCell className="text-center">{getStatusBadge(planejamento)}</TableCell>
                                                                </TableRow>
                                                            ) : null;
                                                        })}
                                                    </React.Fragment>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                        {planejamentosDocumentacao.length > 0 && (
                            <Card className="bg-white border-0 shadow-lg">
                                <CardHeader className="border-b border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-purple-600" />
                                            Documentação
                                        </CardTitle>
                                        {selectedDocAtividades.length > 0 && (
                                            <Button onClick={handlePlanejarSelecionadas} size="sm">
                                                <Calendar className="w-4 h-4 mr-2" />
                                                Planejar {selectedDocAtividades.length} Selecionadas
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                                        <Table className="min-w-max">
                                            <TableHeader className="sticky top-0 bg-white z-10">
                                                <TableRow>
                                                    <TableHead className="w-12"></TableHead>
                                                    <TableHead>Empreendimento</TableHead>
                                                    <TableHead>Disciplina</TableHead>
                                                    <TableHead>Atividade</TableHead>
                                                    <TableHead className="text-center">Tempo Real</TableHead>
                                                    <TableHead className="text-center">Tempo Executado</TableHead>
                                                    <TableHead className="text-center">Planejar</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {planejamentosDocumentacao.map((planejamento) => {
                                                    const atividade = atividadesMap[planejamento.atividade_id];
                                                    const empreendimento = empreendimentos.find(e => e.id === planejamento.empreendimento_id);
                                                    const execucoes = execucoesMap[planejamento.id] || [];
                                                    const tempoExecutadoTotal = execucoes
                                                        .filter(e => e.status === "Finalizado")
                                                        .reduce((sum, e) => sum + (e.tempo_total || 0), 0);
                                                    const tempoExibir = planejamento.tempo_executado || tempoExecutadoTotal;

                                                    return (
                                                        <TableRow key={planejamento.id}>
                                                            <TableCell>
                                                                <Checkbox 
                                                                    checked={selectedDocAtividades.includes(planejamento.id)}
                                                                    onCheckedChange={() => toggleDocAtividadeSelection(planejamento.id)}
                                                                />
                                                            </TableCell>
                                                            <TableCell className="text-sm text-gray-600">{empreendimento?.nome || '-'}</TableCell>
                                                            <TableCell>
                                                                <Badge variant="secondary" className="text-xs">
                                                                    {atividade?.disciplina || '-'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>{planejamento.descritivo || atividade?.atividade || 'Atividade não encontrada'}</TableCell>
                                                            <TableCell className="text-center">{(planejamento.tempo_planejado || 0).toFixed(1)}h</TableCell>
                                                            <TableCell className="text-center">{tempoExibir.toFixed(1)}h</TableCell>
                                                            <TableCell className="text-center">
                                                                <Button 
                                                                    size="sm" 
                                                                    onClick={() => handlePlanejarAtividade(atividade, planejamento.empreendimento_id)}
                                                                    className="bg-purple-600 hover:bg-purple-700 text-white"
                                                                >
                                                                    <Calendar className="w-4 h-4 mr-1" />
                                                                    Planejar
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={isStopModalOpen} onOpenChange={setIsStopModalOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Finalizar Execução</DialogTitle></DialogHeader>
                    <p>Como deseja finalizar esta atividade?</p>
                    <Select value={finalStatus} onValueChange={setFinalStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Finalizado">Finalizado</SelectItem>
                            <SelectItem value="Paralisado">Paralisado</SelectItem>
                        </SelectContent>
                    </Select>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsStopModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleConfirmStop}>Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {planejamentoModalOpen && currentAtividade && (
                <PlanejamentoAtividadeModal
                    isOpen={planejamentoModalOpen}
                    onClose={() => setPlanejamentoModalOpen(false)}
                    atividade={currentAtividade}
                    empreendimentoId={currentAtividade.empreendimentoId}
                    documentos={documentos}
                    usuarios={usuarios}
                    onSuccess={handlePlanejamentoAtividadeComplete}
                />
            )}
        </div>
    );
}