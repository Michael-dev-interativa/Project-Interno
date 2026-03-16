
import { useMemo, useState, useContext } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Eye, FileText, ChevronRight, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO, differenceInDays } from "date-fns";
import { isActivityOverdue as isOverdue } from '../utils/DateCalculator'; // Importa a função do novo local
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';
import { simularReagendamento, aplicarReagendamento } from '../utils/ReagendamentoInteligente';
import ReplanejamentoPreviewModal from './ReplanejamentoPreviewModal';
import { RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // NOVO

// Adicionado Helper para tratar datas de forma local
const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  
  if (typeof dateString === 'string') {
    // Trata 'YYYY-MM-DD' como data local, não UTC
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    // Para outros formatos, tenta parsear, ajustando o fuso
    try {
      const parsedDate = parseISO(dateString);
      if (!isNaN(parsedDate.getTime())) {
        return new Date(parsedDate.getTime() + parsedDate.getTimezoneOffset() * 60000);
      }
    } catch (e) {
      console.error('Erro ao parsear data:', dateString, e);
    }
  }
  return null;
};

export default function AlertaAtrasosEntrega({ planejamentos, isLoading, user, isColaboradorView, usuarios = [] }) { // Adicionado 'usuarios'
  const [isDismissed, setIsDismissed] = useState(false);
  const [expandedEmpreendimentos, setExpandedEmpreendimentos] = useState(new Set());
  const [isSimulating, setIsSimulating] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false); // Added for modal loading
  const { triggerDataRefresh } = useContext(ActivityTimerContext);
  
  // Novos estados para o modal de pré-visualização
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [proposedChanges, setProposedChanges] = useState([]);
  const [replanUser, setReplanUser] = useState('all'); // NOVO: Estado para o filtro de usuário

  const atividadesAtrasadas = useMemo(() => {
    if (!planejamentos || planejamentos.length === 0) {
      return [];
    }

    let relevantPlanejamentos = planejamentos;

    // **NOVO**: Filtrar por usuário logado se for a visão do colaborador
    if (isColaboradorView && user?.email) {
      relevantPlanejamentos = planejamentos.filter(
        plano => plano.executor_principal === user.email
      );
    }
    
    const hoje = new Date();
    return relevantPlanejamentos
      .filter(plano => isOverdue(plano, hoje))
      .map(plano => ({
        id: plano.id,
        nome: plano.descritivo || plano.atividade?.atividade || 'Atividade sem nome',
        empreendimento: plano.empreendimento?.nome || 'Sem empreendimento',
        // **CORREÇÃO**: Acessar o objeto 'executor' que foi enriquecido no Dashboard
        // Inclui fallback para executor_principal, que é o email do executor
        executor: plano.executor?.nome || plano.executor?.email || plano.executor_principal || 'Sem executor',
        executor_principal: plano.executor_principal, // Garantir que o email está aqui para o filtro
        dataTermino: plano.termino_ajustado || plano.termino_planejado,
        diasAtraso: differenceInDays(new Date(), parseLocalDate(plano.termino_ajustado || plano.termino_planejado || plano.inicio_planejado))
      }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso);
  }, [planejamentos, user, isColaboradorView]);

  const atrasosPorEmpreendimento = useMemo(() => {
    return atividadesAtrasadas.reduce((acc, atividade) => {
      const empNome = atividade.empreendimento;
      if (!acc[empNome]) {
        acc[empNome] = [];
      }
      acc[empNome].push(atividade);
      return acc;
    }, {});
  }, [atividadesAtrasadas]);

  const totalEmpreendimentosComAtraso = Object.keys(atrasosPorEmpreendimento).length;

  const toggleEmpreendimento = (empNome) => {
    const newExpanded = new Set(expandedEmpreendimentos);
    if (newExpanded.has(empNome)) {
      newExpanded.delete(empNome);
    } else {
      newExpanded.add(empNome);
    }
    setExpandedEmpreendimentos(newExpanded);
  };

  // MODIFICADO: Agora inicia a simulação com filtro opcional de usuário
  const handleReplanSimulation = async () => {
    let overdueForSimulation = atividadesAtrasadas;
    let plansForSimulation = planejamentos;

    // NOVO: Filtrar dados se um usuário específico for selecionado
    if (replanUser !== 'all') {
      overdueForSimulation = atividadesAtrasadas.filter(a => a.executor_principal === replanUser);
      plansForSimulation = planejamentos.filter(p => p.executor_principal === replanUser);
    }
    
    if (overdueForSimulation.length === 0) {
      alert("Não há atividades atrasadas para a seleção atual.");
      return;
    }

    setIsSimulating(true);
    try {
      const result = await simularReagendamento(overdueForSimulation, plansForSimulation);
      if (result.success && result.changes.length > 0) {
        setProposedChanges(result.changes);
        setShowPreviewModal(true);
      } else {
        alert("Simulação concluída, mas nenhuma mudança foi proposta. As atividades podem já estar otimizadas ou não haver impacto de datas.");
      }
    } catch (error) {
      console.error("Erro ao simular reagendamento:", error);
      alert("Ocorreu um erro inesperado durante a simulação. Verifique o console.");
    } finally {
      setIsSimulating(false);
    }
  };

  // NOVO: Função para confirmar e aplicar as mudanças
  const handleConfirmReplan = async () => {
    setIsFinishing(true);
    try {
      const result = await aplicarReagendamento(proposedChanges);
      if (result.success) {
        alert(result.message);
        setShowPreviewModal(false);
        triggerDataRefresh();
        setIsDismissed(true); // Dismiss the alert after successful replan
      } else {
        alert(`Falha ao aplicar o reagendamento: ${result.message}`);
      }
    } catch (error) {
      console.error("Erro ao aplicar reagendamento:", error);
      alert("Ocorreu um erro inesperado ao salvar as mudanças.");
    } finally {
      setIsFinishing(false);
    }
  };

  if (isLoading || atividadesAtrasadas.length === 0 || isDismissed) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -20, height: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <Card className="bg-gradient-to-r from-red-50 to-orange-50 border-l-4 border-l-red-500 shadow-lg">
            <CardContent className="p-4 relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 w-6 h-6 text-red-500 hover:text-red-700 hover:bg-red-100"
                onClick={() => setIsDismissed(true)}
              >
                <span className="text-lg leading-none">×</span>
              </Button>
              
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-100 rounded-full mt-1">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-red-800">
                      Atividades em Atraso Detectadas
                    </h3>
                    <Badge className="bg-red-600 text-white">
                      {atividadesAtrasadas.length} atividade{atividadesAtrasadas.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  
                  <p className="text-red-700 mb-3">
                    <strong>Isso pode impactar na entrega do planejado.</strong> 
                    {totalEmpreendimentosComAtraso > 0 && ` ${totalEmpreendimentosComAtraso} empreendimento${totalEmpreendimentosComAtraso > 1 ? 's' : ''} afetado${totalEmpreendimentosComAtraso > 1 ? 's' : ''}.`}
                  </p>

                  <div className="space-y-2">
                    {Object.entries(atrasosPorEmpreendimento).map(([empNome, atividades]) => (
                      <div key={empNome} className="bg-white/80 rounded-lg border shadow-sm">
                        <div 
                          className="p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                          onClick={() => toggleEmpreendimento(empNome)}
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-gray-500" />
                            <div>
                              <p className="font-medium text-gray-900">{empNome}</p>
                              <p className="text-xs text-gray-500">{atividades.length} atividade{atividades.length > 1 ? 's' : ''} atrasada{atividades.length > 1 ? 's' : ''}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">{atividades.length}</Badge>
                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedEmpreendimentos.has(empNome) ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                        <AnimatePresence>
                          {expandedEmpreendimentos.has(empNome) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="border-t p-2 space-y-2"
                            >
                               {atividades.map(atividade => (
                                <div key={atividade.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                  <div>
                                    <p className="font-medium text-gray-900 text-sm">{atividade.nome}</p>
                                    <p className="text-xs text-gray-600">
                                      {atividade.executor}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <Badge variant="destructive" className="text-xs">
                                      <Clock className="w-3 h-3 mr-1" />
                                      {atividade.diasAtraso}d atrasado
                                    </Badge>
                                    {atividade.dataTermino && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        Previsto: {format(parseLocalDate(atividade.dataTermino), 'dd/MM/yyyy')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ml-auto pl-4 space-y-3 flex flex-col items-end">
                  <Link to={createPageUrl("SeletorPlanejamento")}>
                    <Button size="sm" className="bg-red-600 hover:bg-red-700 w-full">
                      <Eye className="w-4 h-4 mr-2" />
                      Ver Detalhes
                    </Button>
                  </Link>
                  {/* MODIFICADO: Condição ajustada para apenas admin */}
                  {user && user.role === 'admin' && (
                    <div className="w-full space-y-2 p-3 bg-white/60 border rounded-lg shadow-sm">
                      {/* Seletor de usuário para replanejamento */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          Replanejar para:
                        </label>
                        <Select value={replanUser} onValueChange={setReplanUser}>
                          <SelectTrigger className="w-full h-8 text-xs">
                            <SelectValue placeholder="Selecione um usuário" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os Usuários</SelectItem>
                            {usuarios.map(u => (
                              <SelectItem key={u.id} value={u.email}>{u.nome || u.email}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="bg-white border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700 w-full"
                        onClick={handleReplanSimulation}
                        disabled={isSimulating}
                      >
                        {isSimulating ? (
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        {isSimulating ? 'Simulando...' : 'Replanejar Atrasadas'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <ReplanejamentoPreviewModal
          isOpen={showPreviewModal}
          onClose={() => setShowPreviewModal(false)}
          proposedChanges={proposedChanges}
          onConfirm={handleConfirmReplan}
          isLoading={isFinishing} 
      />
    </>
  );
}
