
import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Building2, Search, ArrowRight, Plus, Trash2, Loader2, PackageOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Empreendimento, Documento, Usuario, Analitico, Atividade, PlanejamentoAtividade } from "@/entities/all";
import NovoPlanejamentoModal from "../components/planejamento/NovoPlanejamentoModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Adicionado
import { executeSequentialWithDelay } from '../components/utils/apiUtils';

const fetchEmpreendimentos = async () => {
  const data = await Empreendimento.list();
  // Filtrar apenas empreendimentos ativos e em planejamento
  return data.filter(emp =>
    emp.status === 'ativo' || emp.status === 'em_planejamento'
  );
};
const fetchPlanejamentoAtividades = async () => PlanejamentoAtividade.list();
const fetchUsuarios = async () => Usuario.list();
const fetchAtividades = async () => Atividade.list();

export default function SeletorPlanejamento() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false); // NOVO ESTADO
  const [userToDeleteFilter, setUserToDeleteFilter] = useState('all'); // NOVO ESTADO
  const queryClient = useQueryClient();

  // Estados para o modal de novo planejamento específico do empreendimento
  const [showNovoPlanejamentoModal, setShowNovoPlanejamentoModal] = useState(false);
  const [selectedEmpreendimentoId, setSelectedEmpreendimentoId] = useState(null);

  // Estados para o modal de novo planejamento GERAL (sem empreendimento pré-selecionado)
  const [showNovoPlanejamentoGeral, setShowNovoPlanejamentoGeral] = useState(false);

  // Dados globais necessários para os modais (usuários e atividades são carregados uma vez)
  const [usuarios, setUsuarios] = useState([]);
  const [documentos, setDocumentos] = useState([]); // Documentos e analíticos são carregados on-demand
  const [analiticos, setAnaliticos] = useState([]);
  const [atividades, setAtividades] = useState([]);

  // React Query para Empreendimentos
  const { data: empreendimentos = [], isLoading: isLoadingEmpreendimentos, error: empreendimentoError } = useQuery({
    queryKey: ['empreendimentos'],
    queryFn: fetchEmpreendimentos,
    staleTime: 1000 * 60 * 5, // 5 minutes
    onError: (error) => {
      console.error("Erro ao carregar empreendimentos:", error);
      let errorMessage = "Falha ao carregar a lista de empreendimentos.";
      if (error.message?.includes("ReplicaSetNoPrimary") || error.message?.includes("500")) {
        errorMessage = "Ocorreu um problema temporário com o banco de dados. Por favor, tente recarregar a página.";
      }
      alert(errorMessage);
    }
  });

  // React Query para Atividades de Planejamento (incluindo as sem empreendimento)
  const { data: planejamentos = [], isLoading: isLoadingPlanejamentos, error: planejamentosError } = useQuery({
    queryKey: ['planejamentos'],
    queryFn: fetchPlanejamentoAtividades,
    staleTime: 1000 * 30, // 30 seconds
  });
  
  // NOVO: React Query para Usuários
  const { data: allUsers = [], isLoading: isLoadingUsers } = useQuery({
      queryKey: ['allUsers'],
      queryFn: fetchUsuarios,
      staleTime: 1000 * 60 * 5, // 5 minutos
  });

  // Filtrar planejamentos que não possuem empreendimento_id
  const planejamentosSemEmpreendimento = useMemo(() => {
    if (!planejamentos) return [];
    return planejamentos.filter(p => !p.empreendimento_id);
  }, [planejamentos]);

  // NOVO: Obter usuários únicos com atividades avulsas
  const usuariosComAtividadesAvulsas = useMemo(() => {
    if (!planejamentosSemEmpreendimento || !allUsers.length) return [];
    const userEmails = new Set(planejamentosSemEmpreendimento.map(p => p.executor_principal).filter(Boolean));
    return allUsers.filter(u => userEmails.has(u.email));
  }, [planejamentosSemEmpreendimento, allUsers]);


  // Carregar dados globais para os modais (usuários e atividades)
  useEffect(() => {
    const loadGlobalData = async () => {
      try {
        // Keeping fetchUsuarios here for consistency with original structure,
        // though allUsers from useQuery is available for the new filter.
        const [usuariosData, atividadesData] = await Promise.all([
          fetchUsuarios(), 
          fetchAtividades()
        ]);
        setUsuarios(usuariosData || []);
        setAtividades(atividadesData || []);
      } catch (error) {
        console.error("Erro ao carregar dados globais para modal:", error);
      }
    };
    loadGlobalData();
  }, []);

  const loadDataForEmpreendimento = async (empreendimentoId) => {
    try {
      const [documentosData, analiticosData] = await Promise.all([
        Documento.filter({ empreendimento_id: empreendimentoId }),
        Analitico.filter({ empreendimento_id: empreendimentoId })
      ]);
      setDocumentos(documentosData || []);
      setAnaliticos(analiticosData || []);
    } catch (error) {
      console.error("Erro ao carregar dados do empreendimento para modal:", error);
    }
  };

  const handleNovoPlanejamento = async (empreendimento) => {
    setSelectedEmpreendimentoId(empreendimento.id);
    await loadDataForEmpreendimento(empreendimento.id);
    setShowNovoPlanejamentoModal(true);
  };

  const filteredEmpreendimentos = useMemo(() => {
    if (!empreendimentos) return [];
    return empreendimentos
      .filter(emp =>
        (emp.nome || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.cliente || "").toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => {
        const nomeA = (a.nome || '').toLowerCase();
        const nomeB = (b.nome || '').toLowerCase();
        return nomeA.localeCompare(nomeB, 'pt-BR');
      });
  }, [empreendimentos, searchTerm]);

  // FUNÇÃO ATUALIZADA: Excluir atividades com base no filtro
  const handleDeleteAllSemEmpreendimento = useCallback(async () => {
    const planosParaExcluir = userToDeleteFilter === 'all'
      ? planejamentosSemEmpreendimento
      : planejamentosSemEmpreendimento.filter(p => p.executor_principal === userToDeleteFilter);

    if (!planosParaExcluir || planosParaExcluir.length === 0) {
      alert('Nenhuma atividade encontrada para o filtro selecionado.');
      return;
    }

    const targetUser = allUsers.find(u => u.email === userToDeleteFilter);
    const confirmMessage = userToDeleteFilter === 'all'
      ? `Tem certeza que deseja excluir TODAS as ${planosParaExcluir.length} atividades sem empreendimento?`
      : `Tem certeza que deseja excluir as ${planosParaExcluir.length} atividades sem empreendimento do usuário ${targetUser?.nome || userToDeleteFilter}?`;

    if (window.confirm(confirmMessage + " Esta ação não pode ser desfeita.")) {
      setIsDeleting(true);
      try {
        // Transforma cada exclusão em uma tarefa para ser executada sequencialmente
        const deleteTasks = planosParaExcluir.map(plano => () => PlanejamentoAtividade.delete(plano.id));
        
        // Executa as tarefas com um pequeno delay para evitar rate limit
        await executeSequentialWithDelay(deleteTasks, 150);

        alert('Atividades excluídas com sucesso!');
        queryClient.invalidateQueries({ queryKey: ['planejamentos'] });
      } catch (error) {
        console.error("Erro ao excluir atividades:", error);
        alert("Ocorreu um erro ao excluir as atividades. Tente novamente.");
      } finally {
        setIsDeleting(false);
      }
    }
  }, [planejamentosSemEmpreendimento, queryClient, userToDeleteFilter, allUsers]);


  const isLoading = isLoadingEmpreendimentos || isLoadingPlanejamentos || isLoadingUsers;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Selecionar Empreendimento
                </h1>
                <p className="text-gray-600">
                  Escolha um empreendimento para acessar o planejamento de atividades
                </p>
              </div>
            </div>

            {/* Botão Novo Planejamento Geral */}
            <Button
              onClick={() => setShowNovoPlanejamentoGeral(true)}
              className="bg-purple-600 hover:bg-purple-700 shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Planejamento
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar por nome do empreendimento ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Empreendimentos Grid */}
          {isLoadingEmpreendimentos ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-white rounded-xl shadow-sm h-32"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <AnimatePresence>
                {filteredEmpreendimentos.map((empreendimento) => (
                  <motion.div
                    key={empreendimento.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    whileHover={{ y: -5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="bg-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                              <Building2 className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-lg text-gray-900 truncate">
                                {empreendimento.nome}
                              </h3>
                              <p className="text-sm text-gray-500 truncate">
                                {empreendimento.cliente}
                              </p>
                              {empreendimento.endereco && (
                                <p className="text-xs text-gray-400 truncate mt-1">
                                  {empreendimento.endereco}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Link to={createPageUrl(`Planejamento?id=${empreendimento.id}`)} className="flex-1">
                            <Button className="w-full bg-green-600 hover:bg-green-700">
                              <CalendarDays className="w-4 h-4 mr-2" />
                              Acessar Planejamento
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                          </Link>
                          <Button
                            onClick={() => handleNovoPlanejamento(empreendimento)}
                            className="bg-purple-600 hover:bg-purple-700"
                            size="default"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {planejamentosSemEmpreendimento && planejamentosSemEmpreendimento.length > 0 && !isLoadingPlanejamentos && (
            <Card className="mt-8 bg-gray-50/50">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <PackageOpen className="w-5 h-5 text-gray-600" />
                    Atividades Sem Empreendimento
                  </CardTitle>
                  <CardDescription>Atividades avulsas ou que ainda não foram associadas a um projeto.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <Select value={userToDeleteFilter} onValueChange={setUserToDeleteFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="Filtrar por usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Usuários</SelectItem>
                      {usuariosComAtividadesAvulsas.map(user => (
                        <SelectItem key={user.id} value={user.email}>{user.nome || user.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteAllSemEmpreendimento}
                    disabled={isDeleting}
                    className="w-full sm:w-auto"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    {isDeleting ? 'Excluindo...' : 'Excluir Seleção'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-gray-200">
                  {planejamentosSemEmpreendimento.map(plano => (
                    <div key={plano.id} className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-800">{plano.descritivo}</p>
                        <p className="text-sm text-gray-500">Executor: {plano.executor_principal || 'Não atribuído'}</p>
                      </div>
                      <p className="text-sm font-bold text-gray-700">{plano.tempo_planejado ? `${plano.tempo_planejado}h` : 'N/A'}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!isLoadingEmpreendimentos && filteredEmpreendimentos.length === 0 && (
            <div className="text-center py-12">
              <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <Building2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Nenhum empreendimento encontrado
              </h3>
              <p className="text-gray-500 mb-4">
                {searchTerm
                  ? "Tente ajustar os filtros de busca"
                  : "Não há empreendimentos ativos disponíveis para planejamento"
                }
              </p>
              <Link to={createPageUrl("Empreendimentos")}>
                <Button variant="outline">
                  <Building2 className="w-4 h-4 mr-2" />
                  Ver Todos os Empreendimentos
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Modal para Novo Planejamento de empreendimento específico */}
      {showNovoPlanejamentoModal && selectedEmpreendimentoId && (
        <NovoPlanejamentoModal
          isOpen={showNovoPlanejamentoModal}
          onClose={() => {
            setShowNovoPlanejamentoModal(false);
            setSelectedEmpreendimentoId(null);
            setDocumentos([]); // Limpar dados específicos do empreendimento
            setAnaliticos([]); // Limpar dados específicos do empreendimento
          }}
          empreendimentoId={selectedEmpreendimentoId}
          usuarios={usuarios}
          documentos={documentos}
          analiticos={analiticos}
          atividades={atividades}
          onSuccess={() => {
            setShowNovoPlanejamentoModal(false);
            setSelectedEmpreendimentoId(null);
            setDocumentos([]);
            setAnaliticos([]);
            // Opcional: redirecionar para a página de planejamento do empreendimento
            window.location.href = createPageUrl(`Planejamento?id=${selectedEmpreendimentoId}`);
          }}
        />
      )}

      {/* Modal para Novo Planejamento Geral */}
      {showNovoPlanejamentoGeral && (
        <NovoPlanejamentoModal
          isOpen={showNovoPlanejamentoGeral}
          onClose={() => setShowNovoPlanejamentoGeral(false)}
          empreendimentoId={null} // Sem empreendimento pré-selecionado
          empreendimentos={empreendimentos} // Passar lista de empreendimentos para seleção
          usuarios={usuarios}
          documentos={[]} // Será carregado quando empreendimento for selecionado dentro do modal
          analiticos={[]} // Será carregado quando empreendimento for selecionado dentro do modal
          atividades={atividades}
          onSuccess={() => {
            setShowNovoPlanejamentoGeral(false);
            queryClient.invalidateQueries({ queryKey: ['planejamentos'] }); // Recarregar planejamentos sem empreendimento
            // Opcional: redirecionar para o dashboard ou recarregar dados
          }}
        />
      )}
    </div>
  );
}
