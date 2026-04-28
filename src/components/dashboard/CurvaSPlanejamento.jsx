import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Calendar, Target, FileText, RefreshCw, ChevronRight, Filter } from "lucide-react";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, parseISO, differenceInDays, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { distribuirHorasSimples } from '../utils/DateCalculator';
import { PlanejamentoAtividade, PlanejamentoDocumento, Execucao, Empreendimento } from '@/entities/all'; // **MODIFICADO**: Adicionar Empreendimento
import { retryWithBackoff } from '../utils/apiUtils';

export default function CurvaSPlanejamento({ isLoading: isDashboardLoading, onRefresh: onDashboardRefresh, isRefreshing: isDashboardRefreshing, usuarios = [] }) {
  const [expandedEmpreendimentos, setExpandedEmpreendimentos] = useState(new Set());
  const [timeRange, setTimeRange] = useState('month');
  const [selectedEmpreendimento, setSelectedEmpreendimento] = useState('all');
  const [selectedUser, setSelectedUser] = useState('all');

  const [planejamentos, setPlanejamentos] = useState([]);
  const [execucoes, setExecucoes] = useState([]);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const cacheRef = useRef({ 
    data: null, 
    timestamp: 0,
    ttl: 60000 // **MODIFICADO**: Aumentar cache para 60 segundos
  });

  const loadCurvaSData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cacheRef.current.data && (now - cacheRef.current.timestamp) < cacheRef.current.ttl) {
      setPlanejamentos(cacheRef.current.data.planejamentos);
      setExecucoes(cacheRef.current.data.execucoes);
      setEmpreendimentos(cacheRef.current.data.empreendimentos);
      setDataLoaded(true);
      return;
    }

    setIsLoading(true);
    try {
        
        // **MODIFICADO**: Carregar ambos PlanejamentoAtividade, PlanejamentoDocumento e Empreendimentos
        const [planAtividadeData, planDocumentoData, execData, empData] = await Promise.all([
            retryWithBackoff(() => PlanejamentoAtividade.list(), 3, 2000, 'curvaS.loadPlansAtividade'),
            retryWithBackoff(() => PlanejamentoDocumento.list(), 3, 2000, 'curvaS.loadPlansDocumento'),
            retryWithBackoff(() => Execucao.list(), 3, 2000, 'curvaS.loadExecs'),
            retryWithBackoff(() => Empreendimento.list(), 3, 2000, 'curvaS.loadEmps'),
        ]);
        
        // Criar mapa de ID -> Nome do empreendimento
        const empMap = {};
        (empData || []).forEach(emp => {
          empMap[emp.id] = emp.nome;
        });
        
        // **MODIFICADO**: Combinar ambos os tipos de planejamento e enriquecer com empreendimento_id e nome
        const finalPlanData = [
            ...(planAtividadeData || []).map(p => ({ 
              ...p, 
              tipo_planejamento: 'atividade',
              empreendimento_id: p.empreendimento_id || p.empreendimento?.id,
              empreendimento: p.empreendimento || { nome: empMap[p.empreendimento_id] || 'Empreendimento' }
            })),
            ...(planDocumentoData || []).map(p => ({ 
              ...p, 
              tipo_planejamento: 'documento',
              empreendimento_id: p.empreendimento_id || p.empreendimento?.id,
              empreendimento: p.empreendimento || { nome: empMap[p.empreendimento_id] || 'Empreendimento' }
            }))
        ].filter(p => p.empreendimento_id);
        
        const finalExecData = execData || [];
        
        setPlanejamentos(finalPlanData);
        setExecucoes(finalExecData);
        setEmpreendimentos(empData || []);
        setDataLoaded(true);
        
        cacheRef.current = {
          data: {
            planejamentos: finalPlanData,
            execucoes: finalExecData,
            empreendimentos: empData || []
          },
          timestamp: now
        };
        
        
    } catch (error) {
        console.error("❌ Erro ao carregar dados para a Curva S:", error);
        setPlanejamentos([]);
        setExecucoes([]);
        setDataLoaded(true);
        
        // **NOVO**: Mostrar mensagem de erro amigável
        alert('Erro ao carregar dados da Curva S. Por favor, tente atualizar novamente.');
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!dataLoaded) {
      // **MODIFICADO**: Adicionar delay antes de carregar
      const timeout = setTimeout(() => {
        loadCurvaSData();
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [dataLoaded, loadCurvaSData]);

  const empreendimentosDisponiveis = useMemo(() => {
    // Usar o array empreendimentos como fonte de verdade
    const resultado = empreendimentos
      .filter(emp => emp.id && emp.nome)
      .map(emp => ({
        id: emp.id,
        nome: emp.nome
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
    
    return resultado;
  }, [empreendimentos]);

  const usuariosDisponiveis = useMemo(() => {
    return [...usuarios].sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email));
  }, [usuarios]);

  const planejamentosFiltrados = useMemo(() => {
    let filtered = planejamentos;
    if (selectedEmpreendimento !== 'all') {
      filtered = filtered.filter(plano => String(plano.empreendimento_id) === String(selectedEmpreendimento));
    }
    if (selectedUser !== 'all') {
      filtered = filtered.filter(plano => plano.executor_principal === selectedUser);
    }
    return filtered;
  }, [planejamentos, selectedEmpreendimento, selectedUser]);

  const execucoesFiltradas = useMemo(() => {
    let filtered = planejamentosFiltrados.length > 0 
      ? execucoes.filter(exec => {
          // Apenas execuções de planejamentos que passaram no filtro
          return planejamentosFiltrados.some(plan => plan.id === exec.planejamento_id);
        })
      : execucoes;
    
    if (selectedEmpreendimento !== 'all') {
      filtered = filtered.filter(exec => String(exec.empreendimento_id) === String(selectedEmpreendimento));
    }
    if (selectedUser !== 'all') {
      filtered = filtered.filter(exec => exec.usuario === selectedUser);
    }
    return filtered;
  }, [execucoes, planejamentosFiltrados, selectedEmpreendimento, selectedUser]);

  const dadosCurvaS = useMemo(() => {
    if (!planejamentosFiltrados || planejamentosFiltrados.length === 0) {
      return { dados: [], totalPlanejado: 0, totalExecutado: 0, totalReplanejado: 0, documentosAtrasadosPorEmp: {}, totalDocumentosAtrasados: 0, percentualConclusao: 0 };
    }

    const hoje = startOfDay(new Date());
    let inicioGrafico, fimGrafico;

    switch (timeRange) {
      case 'day':
        inicioGrafico = startOfDay(hoje);
        fimGrafico = endOfDay(hoje);
        break;
      case 'week':
        inicioGrafico = startOfWeek(hoje, { locale: ptBR });
        fimGrafico = endOfWeek(hoje, { locale: ptBR });
        break;
      case 'month':
      default:
        inicioGrafico = startOfMonth(hoje);
        fimGrafico = endOfMonth(hoje);
        break;
    }
    
    const diasGrafico = eachDayOfInterval({ start: inicioGrafico, end: fimGrafico });
    const inicioGraficoFormatado = format(inicioGrafico, 'yyyy-MM-dd');
    const fimGraficoFormatado = format(fimGrafico, 'yyyy-MM-dd');

    const execucoesParaCalculo = execucoesFiltradas || [];

    const execucoesPorAnalitico = execucoesParaCalculo.reduce((acc, exec) => {
      if (exec.analitico_id) {
        if (!acc[exec.analitico_id]) acc[exec.analitico_id] = [];
        acc[exec.analitico_id].push(exec);
      }
      return acc;
    }, {});

    const planejamentosComDetalhes = planejamentosFiltrados.map(plano => {
      const execucoesDaAtividade = execucoesPorAnalitico[plano.analitico_id] || [];
      const tempoExecutado = execucoesDaAtividade.reduce((sum, exec) => sum + (Number(exec.tempo_total) || 0), 0);
      const tempoRestante = Math.max(0, (plano.tempo_planejado || 0) - tempoExecutado);
      
      const dataTerminoPlanejado = plano.termino_planejado ? startOfDay(parseISO(plano.termino_planejado)) : null;
      const estaAtrasado = dataTerminoPlanejado && dataTerminoPlanejado < hoje && plano.status !== 'concluido';
      const diasAtraso = estaAtrasado ? differenceInDays(hoje, dataTerminoPlanejado) : 0;
      
      return {
        ...plano,
        tempoExecutado,
        tempoRestante,
        estaAtrasado,
        diasAtraso,
        nomeCompleto: plano.descritivo || plano.atividade?.atividade || 'Atividade sem nome',
        empreendimentoNome: plano.empreendimento?.nome || 'Sem empreendimento',
        documentoNumero: plano.documento?.numero || 'N/A'
      };
    });

    let planejadoAcumuladoAtual = 0;
    let executadoAcumuladoAtual = 0;
    let replanejadoAcumuladoAtual = 0;
    
    const planejamentosComDistribuicaoOriginal = planejamentosFiltrados.map(plano => {
        if (plano.inicio_planejado && plano.tempo_planejado > 0) {
            const { distribuicao } = distribuirHorasSimples(plano.inicio_planejado, plano.tempo_planejado);
            return { ...plano, horas_por_dia_original: distribuicao };
        }
        return { ...plano, horas_por_dia_original: {} };
    });

    const dados = diasGrafico.map(dia => {
        const diaFormatado = format(dia, 'yyyy-MM-dd');

        let planejadoDoDia = 0;
        planejamentosComDistribuicaoOriginal.forEach(plano => {
            if (plano.horas_por_dia_original && plano.horas_por_dia_original[diaFormatado]) {
                planejadoDoDia += Number(plano.horas_por_dia_original[diaFormatado]) || 0;
            }
        });

        let replanejadoDoDia = 0;
        planejamentosFiltrados.forEach(plano => {
            if (plano.horas_por_dia && plano.horas_por_dia[diaFormatado]) {
                replanejadoDoDia += Number(plano.horas_por_dia[diaFormatado]) || 0;
            }
        });

        let executadoDoDia = 0;
        execucoesParaCalculo.forEach(exec => {
            if (exec.inicio && exec.status === 'Finalizado') {
                try {
                    const dataExecucao = format(parseISO(exec.inicio), 'yyyy-MM-dd');
                    if (dataExecucao === diaFormatado) {
                        executadoDoDia += Number(exec.tempo_total) || 0;
                    }
                } catch (error) {
                }
            }
        });

        planejadoAcumuladoAtual += planejadoDoDia;
        executadoAcumuladoAtual += executadoDoDia;
        replanejadoAcumuladoAtual += replanejadoDoDia;

        return {
            data: diaFormatado,
            dataFormatada: format(dia, 'dd/MMM', { locale: ptBR }),
            planejado: Math.round(planejadoAcumuladoAtual * 10) / 10,
            executado: Math.round(executadoAcumuladoAtual * 10) / 10,
            replanejado: Math.round(replanejadoAcumuladoAtual * 10) / 10,
            isToday: format(dia, 'yyyy-MM-dd') === format(hoje, 'yyyy-MM-dd')
        };
    });

    const documentosAtrasados = planejamentosComDetalhes.filter(p => p.estaAtrasado);
    const documentosAtrasadosPorEmp = documentosAtrasados.reduce((acc, doc) => {
      const empNome = doc.empreendimentoNome;
      if (!acc[empNome]) {
        acc[empNome] = [];
      }
      acc[empNome].push(doc);
      return acc;
    }, {});
    
    for (const empName in documentosAtrasadosPorEmp) {
      documentosAtrasadosPorEmp[empName].sort((a, b) => b.diasAtraso - a.diasAtraso);
    }

    const projectTotalPlanned = planejamentosComDistribuicaoOriginal.reduce((sum, plano) => {
        if (plano.horas_por_dia_original && typeof plano.horas_por_dia_original === 'object') {
            const horasNoPeriodo = Object.entries(plano.horas_por_dia_original).reduce((total, [data, horas]) => {
                if (data >= inicioGraficoFormatado && data <= fimGraficoFormatado) {
                    return total + (Number(horas) || 0);
                }
                return total;
            }, 0);
            return sum + horasNoPeriodo;
        }
        return sum;
    }, 0);
    
    const projectTotalRescheduled = planejamentosFiltrados.reduce((sum, plano) => {
        if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
            const horasNoPeriodo = Object.entries(plano.horas_por_dia).reduce((total, [data, horas]) => {
                if (data >= inicioGraficoFormatado && data <= fimGraficoFormatado) {
                    return total + (Number(horas) || 0);
                }
                return total;
            }, 0);
            return sum + horasNoPeriodo;
        }
        return sum;
    }, 0);

    const projectTotalExecuted = execucoesParaCalculo.reduce((sum, exec) => {
        if (exec.inicio && exec.status === 'Finalizado') {
            const dataExecucao = format(parseISO(exec.inicio), 'yyyy-MM-dd');
            if (dataExecucao >= inicioGraficoFormatado && dataExecucao <= fimGraficoFormatado) {
                return sum + (Number(exec.tempo_total) || 0);
            }
        }
        return sum;
    }, 0);
    
    const percentualConclusao = projectTotalRescheduled > 0 ? Math.round((projectTotalExecuted / projectTotalRescheduled) * 100) : 0;

    return {
      dados,
      totalPlanejado: Math.round(projectTotalPlanned * 10) / 10,
      totalExecutado: Math.round(projectTotalExecuted * 10) / 10,
      totalReplanejado: Math.round(projectTotalRescheduled * 10) / 10,
      documentosAtrasadosPorEmp,
      totalDocumentosAtrasados: documentosAtrasados.length,
      percentualConclusao
    };
  }, [planejamentosFiltrados, execucoesFiltradas, timeRange]);

  const toggleEmpreendimento = (empNome) => {
    const newExpanded = new Set(expandedEmpreendimentos);
    if (newExpanded.has(empNome)) {
      newExpanded.delete(empNome);
    } else {
      newExpanded.add(empNome);
    }
    setExpandedEmpreendimentos(newExpanded);
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 shadow-lg rounded-lg border">
          <p className="font-medium">{format(parseISO(data.data), "dd 'de' MMMM", { locale: ptBR })}</p>
          <p className="text-blue-600">Planejado: {data.planejado}h</p>
          <p className="text-yellow-600">Replanejado: {data.replanejado}h</p>
          <p className="text-green-600">Executado: {data.executado}h</p>
          {data.isToday && <Badge className="mt-1 bg-orange-100 text-orange-800">Hoje</Badge>}
        </div>
      );
    }
    return null;
  };

  if (!dataLoaded && isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] w-full bg-white rounded-lg border">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados da Curva S...</p>
          <p className="text-gray-400 text-sm mt-2">Isso pode levar alguns segundos...</p>
        </div>
      </div>
    );
  }

  const totalAtrasadas = dadosCurvaS.totalDocumentosAtrasados;
  const osPlural = totalAtrasadas === 1 ? 'OS' : 'OS';
  const osPluralLowerCase = totalAtrasadas === 1 ? 'OS' : 'OS';

  return (
    <Card className="bg-white border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <CardTitle className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <TrendingUp className="w-6 h-6 text-purple-600" />
            Curva S - Progresso do Projeto
          </CardTitle>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={selectedEmpreendimento} onValueChange={setSelectedEmpreendimento}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filtrar por empreendimento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Empreendimentos</SelectItem>
                  {empreendimentosDisponiveis.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Filtrar por usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Usuários</SelectItem>
                  {usuariosDisponiveis.map(user => (
                    <SelectItem key={user.id} value={user.email}>{user.nome || user.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="bg-gray-100 p-1 rounded-lg flex items-center">
              <Button size="sm" variant={timeRange === 'day' ? 'default' : 'ghost'} onClick={() => setTimeRange('day')}>Dia</Button>
              <Button size="sm" variant={timeRange === 'week' ? 'default' : 'ghost'} onClick={() => setTimeRange('week')}>Semana</Button>
              <Button size="sm" variant={timeRange === 'month' ? 'default' : 'ghost'} onClick={() => setTimeRange('month')}>Mês</Button>
            </div>
            
            <Button variant="outline" size="sm" onClick={() => loadCurvaSData(true)} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Atualizando...' : 'Atualizar'}
            </Button>
            
            <div className="text-right">
              <p className="text-sm text-gray-500">
                {selectedEmpreendimento === 'all' && selectedUser === 'all' ? 'Progresso Geral' : 'Progresso do Filtro'}
              </p>
              <p className="text-2xl font-bold text-purple-600">
                {dadosCurvaS.percentualConclusao}%
              </p>
            </div>
            <Badge className="bg-purple-100 text-purple-800">
              {dadosCurvaS.totalExecutado.toFixed(1)}h / {dadosCurvaS.totalReplanejado.toFixed(1)}h
            </Badge>
          </div>
        </div>
        
        {(selectedEmpreendimento !== 'all' || selectedUser !== 'all') && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {selectedEmpreendimento !== 'all' && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700">
                Projeto: {empreendimentosDisponiveis.find(emp => emp.id === selectedEmpreendimento)?.nome || '...'}
                </Badge>
            )}
            {selectedUser !== 'all' && (
                <Badge variant="outline" className="bg-indigo-50 text-indigo-700">
                Usuário: {usuariosDisponiveis.find(user => user.email === selectedUser)?.nome || selectedUser || '...'}
                </Badge>
            )}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2">
            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dadosCurvaS.dados} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                  <XAxis 
                    dataKey="dataFormatada" 
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Horas Acumuladas', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {dadosCurvaS.dados.find(d => d.isToday) && (
                    <ReferenceLine 
                      x={dadosCurvaS.dados.find(d => d.isToday)?.dataFormatada} 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                    />
                  )}
                  
                  <Line type="monotone" dataKey="planejado" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} name="Planejado" />
                  <Line type="monotone" dataKey="replanejado" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" name="Replanejado" />
                  <Line type="monotone" dataKey="executado" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} name="Executado" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-blue-500 rounded"></div>
                <span className="text-sm text-gray-600">Planejado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-yellow-500 border border-dashed"></div>
                <span className="text-sm text-gray-600">Replanejado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-1 bg-green-500 rounded"></div>
                <span className="text-sm text-gray-600">Executado</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-0.5 h-3 bg-orange-500 border border-dashed"></div>
                <span className="text-sm text-gray-600">Hoje</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            {dadosCurvaS.totalDocumentosAtrasados > 0 ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 h-[500px] overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <h3 className="font-semibold text-red-800">
                    {osPlural} Atrasadas ({totalAtrasadas})
                  </h3>
                </div>
                
                <p className="text-red-700 mb-4 text-sm">
                  <strong>Estas {osPluralLowerCase} estão impactando a data de entrega:</strong>
                </p>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {Object.entries(dadosCurvaS.documentosAtrasadosPorEmp).map(([empNome, documentos]) => (
                    <div key={empNome} className="bg-white rounded-lg border shadow-sm">
                      <div 
                        className="p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                        onClick={() => toggleEmpreendimento(empNome)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                            <FileText className="w-4 h-4 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-900 truncate">{empNome}</p>
                            <p className="text-xs text-gray-500">{documentos.length} {documentos.length === 1 ? 'OS' : 'OSs'} atrasada{documentos.length > 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">
                            {documentos.length}
                          </Badge>
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${
                            expandedEmpreendimentos.has(empNome) ? 'rotate-90' : ''
                          }`} />
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedEmpreendimentos.has(empNome) && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-gray-100"
                          >
                            <div className="p-3 space-y-2">
                              {documentos.map(doc => (
                                <div key={doc.id} className="bg-gray-50 rounded p-2">
                                  <div className="flex items-start justify-between mb-1">
                                    <p className="font-medium text-xs text-gray-900 truncate flex-1">
                                      {doc.nomeCompleto}
                                    </p>
                                    <Badge variant="destructive" className="text-xs ml-2">
                                      {doc.diasAtraso}d atraso
                                    </Badge>
                                  </div>
                                  
                                  {doc.documentoNumero !== 'N/A' && (
                                    <p className="text-xs text-blue-600">
                                      OS: {doc.documentoNumero}
                                    </p>
                                  )}
                                  
                                  {doc.executor && (
                                    <p className="text-xs text-gray-500">
                                      Executor: {doc.executor.nome || doc.executor.email}
                                    </p>
                                  )}
                                  
                                  {doc.termino_planejado && (
                                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                      <Calendar className="w-3 h-3" />
                                      Previsto: {format(parseISO(doc.termino_planejado), 'dd/MM/yyyy')}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
                
                <div className="pt-3 border-t mt-3">
                  <p className="text-red-600 font-medium text-sm text-center">
                    Total: {totalAtrasadas} {osPluralLowerCase} atrasada{totalAtrasadas > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 h-[500px] flex flex-col items-center justify-center">
                <Target className="w-12 h-12 text-green-500 mb-4" />
                <p className="text-green-800 font-semibold text-center">
                  Nenhuma OS em atraso!
                </p>
                <p className="text-green-600 text-sm text-center mt-2">
                  Todas as atividades estão dentro do prazo.
                </p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}