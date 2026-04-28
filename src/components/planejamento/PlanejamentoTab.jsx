
import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Search, Filter, Edit, Trash2, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Atividade, Documento, PlanejamentoAtividade, PlanejamentoDocumento, Execucao, SobraUsuario, Usuario } from "@/entities/all";
import { format, parseISO, isAfter, isBefore, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { retryWithBackoff, delay } from '../utils/apiUtils';
import PlanejamentoAtividadeModal from '../empreendimento/PlanejamentoAtividadeModal';

import CurvaSPlanejamento from './CurvaSPlanejamento';
import ExecutorSelector from './ExecutorSelector';
import { canStartActivity } from '../utils/PredecessoraValidator';
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';

const statusColors = {
  nao_iniciado: "bg-gray-100 text-gray-800",
  em_andamento: "bg-blue-100 text-blue-800",
  concluido: "bg-green-100 text-green-800",
  atrasado: "bg-red-100 text-red-800",
  pausado: "bg-yellow-100 text-yellow-800"
};

const statusLabels = {
  nao_iniciado: "Não Iniciado",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  atrasado: "Atrasado",
  pausado: "Pausado"
};

export default function PlanejamentoTab({ empreendimentoId }) {
  const [planejamentosRaw, setPlanejamentosRaw] = useState([]);
  const [enrichedPlanejamentos, setEnrichedPlanejamentos] = useState([]);
  const [filteredPlanejamentos, setFilteredPlanejamentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [userFilter, setUserFilter] = useState("todos");
  const [allUsers, setAllUsers] = useState([]);
  const [allSobras, setAllSobras] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const { refreshTrigger } = useContext(ActivityTimerContext);

  const [planejandoAtividade, setPlanejandoAtividade] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [planningError, setPlanningError] = useState(null);

  const enrichPlanejamentos = useCallback(async () => {
    setIsLoading(true);
    try {
      const [planejamentosAtivData, planejamentosDocData] = await Promise.all([
        retryWithBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoId })),
        retryWithBackoff(() => PlanejamentoDocumento.filter({ empreendimento_id: empreendimentoId }))
      ]);
      await delay(500);

      const allAtividades = await retryWithBackoff(() => Atividade.list());
      await delay(500);
      
      const allDocumentos = await retryWithBackoff(() => Documento.filter({ empreendimento_id: empreendimentoId }));
      await delay(500);

      const allUsuarios = await retryWithBackoff(() => Usuario.list());
      await delay(500);

      const allExecucoes = await retryWithBackoff(() => Execucao.filter({ empreendimento_id: empreendimentoId }));
      await delay(500);

      const sobrasData = await retryWithBackoff(() => SobraUsuario.filter({ empreendimento_id: empreendimentoId }));

      const planejamentosData = [
        ...(planejamentosAtivData || []).map(p => ({ ...p, tipo: 'atividade' })),
        ...(planejamentosDocData || []).map(p => ({ ...p, tipo: 'documento' }))
      ];

      setPlanejamentosRaw(planejamentosData);

      if (planejamentosData.length === 0) {
        setEnrichedPlanejamentos([]);
        setFilteredPlanejamentos([]);
        setAllUsers([]);
        setAllSobras([]);
        setIsLoading(false);
        return;
      }

      const atividadesMap = allAtividades.reduce((map, ativ) => ({ ...map, [ativ.id]: ativ }), {});
      const documentosMap = allDocumentos.reduce((map, doc) => ({ ...map, [doc.id]: doc }), {});
      const usuariosMap = allUsuarios.reduce((map, user) => ({ ...map, [user.email]: user }), {});
      
      const execucoesByPlanejamentoId = allExecucoes.reduce((map, exec) => {
        if (!map[exec.planejamento_id]) map[exec.planejamento_id] = [];
        map[exec.planejamento_id].push(exec);
        return map;
      }, {});

      const enriched = planejamentosData.map(plano => {
        const atividadeObj = plano.atividade_id ? atividadesMap[plano.atividade_id] : null;
        const documento = plano.documento_id ? documentosMap[plano.documento_id] : null;
        const executorPrincipalObj = plano.executor_principal ? usuariosMap[plano.executor_principal] : null;
        const execucoesForPlanejamento = execucoesByPlanejamentoId[plano.id] || [];
        const tempoExecutado = execucoesForPlanejamento.reduce((sum, exec) => sum + (Number(exec.tempo_total) || 0), 0);
        
        let calculatedStatus = plano.status;
        if (plano.inicio_planejado && plano.status === 'nao_iniciado') {
          const inicioPlano = parseISO(plano.inicio_planejado);
          if (isBefore(inicioPlano, new Date()) && !isToday(inicioPlano)) {
            calculatedStatus = 'atrasado';
          }
        }

        return {
          ...plano,
          atividade: atividadeObj?.atividade || plano.descritivo
            || [documento?.numero, documento?.arquivo, plano.etapa].filter(Boolean).join(' - ')
            || 'Atividade não encontrada',
          atividadeObj,
          disciplina: atividadeObj?.disciplina || plano.etapa,
          documento,
          documentoNumero: documento?.numero || 'N/A',
          documentoArquivo: documento?.arquivo || '',
          executorPrincipalObj,
          executoresObj: plano.executores?.map(email => usuariosMap[email]).filter(Boolean) || [],
          status: calculatedStatus,
          tempoExecutado: tempoExecutado,
        };
      });

      enriched.sort((a, b) => {
        const indexA = ETAPAS_ORDER.indexOf(a.etapa);
        const indexB = ETAPAS_ORDER.indexOf(b.etapa);
        
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        return indexA - indexB;
      });

      setEnrichedPlanejamentos(enriched);
      setAllUsers(allUsuarios);
      setAllSobras(sobrasData);
    } catch (error) {
      console.error("Erro ao enriquecer planejamentos:", error);
      alert("O sistema está sobrecarregado. Alguns dados podem não ter sido carregados. Tente recarregar a página em alguns instantes.");
      setPlanejamentosRaw([]);
      setEnrichedPlanejamentos([]);
      setAllUsers([]);
      setAllSobras([]);
    }
    setIsLoading(false);
  }, [empreendimentoId]);

  const applyFilters = useCallback(() => {
    let filtered = enrichedPlanejamentos;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(plano => 
        (plano.atividade || "").toLowerCase().includes(searchLower) ||
        (plano.documentoNumero || "").toLowerCase().includes(searchLower) ||
        (plano.documentoArquivo || "").toLowerCase().includes(searchLower) ||
        (plano.executorPrincipalObj?.nome || "").toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== "todos") {
      filtered = filtered.filter(plano => plano.status === statusFilter);
    }

    if (userFilter !== "todos") {
      filtered = filtered.filter(plano => plano.executor_principal === userFilter);
    }

    setFilteredPlanejamentos(filtered);
  }, [enrichedPlanejamentos, searchTerm, statusFilter, userFilter]);

  useEffect(() => {
    if (empreendimentoId) {
      enrichPlanejamentos();
    }
  }, [empreendimentoId, refreshTrigger, enrichPlanejamentos]);

  useEffect(() => {
    applyFilters();
    setSelectedIds(new Set());
  }, [applyFilters]);

  const handleDelete = async (id, tipo) => {
    if (window.confirm("Tem certeza que deseja excluir este planejamento?")) {
      try {
        if (tipo === 'documento') {
          await PlanejamentoDocumento.delete(id);
        } else {
          await PlanejamentoAtividade.delete(id);
        }
        enrichPlanejamentos();
      } catch (error) {
        console.error("Erro ao excluir planejamento:", error);
        
        if (error.message?.includes("Object not found") || 
            error.message?.includes("ObjectNotFoundError") ||
            error.response?.status === 404) {
          enrichPlanejamentos();
        } else {
          alert("Erro ao excluir planejamento. Tente novamente.");
        }
      }
    }
  };
  
  const handleSelectItem = (id) => {
    setSelectedIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        return newSet;
    });
  };

  const handleSelectAll = (isChecked) => {
    if (isChecked) {
        setSelectedIds(new Set(filteredPlanejamentos.map(p => p.id)));
    } else {
        setSelectedIds(new Set());
    }
  };

  const handleDeleteSelected = async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    if (window.confirm(`Tem certeza que deseja excluir os ${count} planejamentos selecionados?`)) {
      try {
        const idsArray = Array.from(selectedIds);
        const results = {
          deleted: 0,
          notFound: 0,
          errors: 0
        };
        
        for (const id of idsArray) {
          try {
            const plano = enrichedPlanejamentos.find(p => p.id === id);
            if (!plano) {
              results.notFound++;
              continue;
            }

            if (plano.tipo === 'documento') {
              await PlanejamentoDocumento.delete(id);
            } else {
              await PlanejamentoAtividade.delete(id);
            }
            results.deleted++;
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
          } catch (error) {
            if (error.message?.includes("Object not found") || 
                error.message?.includes("ObjectNotFoundError") ||
                error.response?.status === 404) {
              results.notFound++;
            } else if (error.response?.status === 500 && 
                      (error.message?.includes("Object not found") || error.response.data?.error?.includes("Object not found"))) {
              results.notFound++;
            } else {
              results.errors++;
              console.error('Erro ao excluir planejamento:', id, error);
            }
          }
        }
        
        setSelectedIds(new Set());
        enrichPlanejamentos();
        
        if (results.errors === 0) {
          if (results.notFound > 0) {
            alert(`${results.deleted} planejamentos foram excluídos. ${results.notFound} já haviam sido excluídos anteriormente.`);
          } else {
            alert(`${results.deleted} planejamentos foram excluídos com sucesso.`);
          }
        } else {
          alert(`Processo concluído: ${results.deleted} excluídos, ${results.notFound} já excluídos, ${results.errors} erros. Alguns planejamentos podem não ter sido excluídos.`);
        }
        
      } catch (error) {
        console.error("Erro durante exclusão em lote:", error);
        setSelectedIds(new Set());
        enrichPlanejamentos();
        alert("Ocorreu um erro durante a exclusão em lote. A lista foi atualizada para refletir o estado atual.");
      }
    }
  };

  const calcularSobrasAutomaticamente = async (plano) => {
    try {
      const tempoPlanejado = plano.tempo_planejado || 0;
      const tempoExecutado = plano.tempoExecutado || 0;
      const horasDeSobra = tempoPlanejado - tempoExecutado;
      const executorEmail = plano.executor_principal;

      if (horasDeSobra !== 0 && executorEmail) {
        const existingSobra = allSobras.find(s => s.usuario === executorEmail && s.empreendimento_id === empreendimentoId);
        
        if (existingSobra) {
          const newTotalSobra = (existingSobra.horas_sobra || 0) + horasDeSobra;
          await SobraUsuario.update(existingSobra.id, { horas_sobra: newTotalSobra });
        } else {
          await SobraUsuario.create({
            usuario: executorEmail,
            empreendimento_id: empreendimentoId,
            horas_sobra: horasDeSobra
          });
        }
      }
    } catch (error) {
      console.error("Erro ao calcular sobras automaticamente:", error);
    }
  };

  const handleUpdateStatus = async (plano, newStatus) => {
    try {
      if (newStatus === 'em_andamento') {
        const canStart = await canStartActivity(plano.id, empreendimentoId, true);
        if (!canStart) {
          alert('Não é possível iniciar esta atividade. Existem predecessoras não concluídas.');
          return;
        }
      }

      if (plano.tipo === 'documento') {
        await PlanejamentoDocumento.update(plano.id, { status: newStatus });
      } else {
        await PlanejamentoAtividade.update(plano.id, { status: newStatus });
      }

      if (newStatus === 'concluido') {
        await calcularSobrasAutomaticamente(plano);
      }

      enrichPlanejamentos();
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      
      if (error.message?.includes("Object not found") || error.message?.includes("ObjectNotFoundError")) {
        alert("Este planejamento não existe mais. A lista será atualizada.");
        enrichPlanejamentos();
      } else {
        alert("Erro ao atualizar status. Tente novamente.");
      }
    }
  };

  const handlePlanActivity = useCallback((analiticoObj) => {
    setPlanningError(null);
    setPlanejandoAtividade(analiticoObj); 
  }, []);

  const handleConfirmPlanejamento = async (formData) => {
    if (!planejandoAtividade) return;

    setIsSubmitting(true);
    setPlanningError(null);

    try {
      const {
        executores: executorEmails,
        startDate: inicio
      } = formData;

      // Simplified: Just create the planning without using DateCalculator
      const novoPlano = {
        empreendimento_id: empreendimentoId,
        atividade_id: planejandoAtividade.id,
        documento_id: planejandoAtividade.documento_id,
        etapa: planejandoAtividade.etapa,
        descritivo: planejandoAtividade.atividade,
        executor_principal: executorEmails[0],
        executores: executorEmails,
        inicio_planejado: inicio || format(new Date(), 'yyyy-MM-dd'),
        termino_planejado: inicio || format(new Date(), 'yyyy-MM-dd'), // Simplified for immediate creation
        tempo_planejado: planejandoAtividade.tempo || 0,
        status: 'nao_iniciado',
      };

      await PlanejamentoAtividade.create(novoPlano);

      enrichPlanejamentos();
      setPlanejandoAtividade(null);

    } catch (error) {
      console.error("Erro ao confirmar planejamento:", error);
      setPlanningError(error.message || "Ocorreu um erro ao planejar a atividade. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPlanejamentoCard = (plano) => {
    return (
      <div key={plano.id} className="flex items-start gap-4 border border-gray-200 rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
        <Checkbox
            checked={selectedIds.has(plano.id)}
            onCheckedChange={() => handleSelectItem(plano.id)}
            className="mt-1.5"
        />
        <div className="flex-1">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-gray-900">{plano.atividade}</h4>
                  <Badge className={`${statusColors[plano.status]} text-xs`}>
                    {statusLabels[plano.status]}
                  </Badge>
                  {plano.tipo === 'documento' && (
                    <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                      Folha
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {plano.tipo === 'documento' ? `Folha: ${plano.documentoNumero} - ${plano.documentoArquivo}` : `Atividade de Projeto`}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {plano.status === 'nao_iniciado' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus(plano, 'em_andamento')}
                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  >
                    Iniciar
                  </Button>
                )}
                
                {plano.status === 'em_andamento' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateStatus(plano, 'concluido')}
                    className="text-green-600 border-green-600 hover:bg-green-50"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Concluir
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(plano.id, plano.tipo)}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>
                  {plano.inicio_planejado ? format(parseISO(plano.inicio_planejado), 'dd/MM/yyyy', { locale: ptBR }) : 'Não definido'}
                  {plano.termino_planejado && ` - ${format(parseISO(plano.termino_planejado), 'dd/MM/yyyy', { locale: ptBR })}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-500" />
                <span>{plano.tempo_planejado}h planejadas</span>
              </div>
              <div className="flex items-center gap-1.5 font-medium text-blue-600">
                <TrendingUp className="w-4 h-4" />
                <span>{plano.tempoExecutado.toFixed(1)}h realizadas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-gray-500" />
                <span>
                  {plano.executorPrincipalObj?.nome || plano.executor_principal}
                </span>
              </div>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <CurvaSPlanejamento 
        planejamentos={planejamentosRaw}
        empreendimentoId={empreendimentoId}
      />

      <Card className="bg-white border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar atividade, documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                <SelectItem value="nao_iniciado">Não Iniciado</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="concluido">Concluido</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
                <SelectItem value="pausado">Pausado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Usuários</SelectItem>
                {allUsers.map(usuario => (
                  <SelectItem key={usuario.email} value={usuario.email}>
                    {usuario.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => {
              setSearchTerm("");
              setStatusFilter("todos");
              setUserFilter("todos");
            }}>
              Limpar Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-0 shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-600" />
              Atividades Planejadas ({filteredPlanejamentos.length})
            </CardTitle>
            {selectedIds.size > 0 && (
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Selecionados ({selectedIds.size})
                </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Carregando planejamentos...</p>
            </div>
          ) : filteredPlanejamentos.length > 0 ? (
            <>
              <div className="flex items-center p-4 border-b border-gray-100 bg-gray-50/50">
                  <Checkbox
                      id="selectAll"
                      checked={selectedIds.size === filteredPlanejamentos.length && filteredPlanejamentos.length > 0}
                      onCheckedChange={handleSelectAll}
                      disabled={filteredPlanejamentos.length === 0}
                  />
                  <label htmlFor="selectAll" className="ml-3 text-sm font-medium text-gray-700">
                      Selecionar todas as {filteredPlanejamentos.length} atividades visíveis
                  </label>
              </div>
              <div className="space-y-4 pt-4">
                {filteredPlanejamentos.map(renderPlanejamentoCard)}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum planejamento encontrado
              </h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== "todos" || userFilter !== "todos"
                  ? "Tente ajustar os filtros de busca"
                  : "Não há atividades planejadas para este empreendimento"
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {planejandoAtividade && (
        <PlanejamentoAtividadeModal
          atividade={planejandoAtividade}
          documento={planejandoAtividade.documento || null}
          usuarios={allUsers}
          planejamentos={planejamentosRaw}
          onClose={() => setPlanejandoAtividade(null)}
          onSubmit={handleConfirmPlanejamento}
          isSubmitting={isSubmitting}
          error={planningError}
        />
      )}
    </div>
  );
}
