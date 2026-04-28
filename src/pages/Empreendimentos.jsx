
import { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { Empreendimento, Usuario } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Plus, Building2, AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

import EmpreendimentoCard from "../components/empreendimentos/EmpreendimentoCard";
import EmpreendimentoForm from "../components/empreendimentos/EmpreendimentoForm";
import EmpreendimentoFilters from "../components/empreendimentos/EmpreendimentoFilters";
import { retryWithBackoff } from "../components/utils/apiUtils";
import { ActivityTimerContext } from '../components/contexts/ActivityTimerContext';

const normalizeEmpreendimentoStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  const allowed = new Set(['ativo', 'em_planejamento', 'concluido', 'pausado']);
  return allowed.has(normalized) ? normalized : 'ativo';
};

// Custom hook para gerenciar dados dos empreendimentos
const useEmpreendimentosData = () => {
  const [data, setData] = useState({
    empreendimentos: [],
    usuarios: [],
    isLoading: true,
    error: null,
    lastUpdate: null,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {

    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setData(prev => ({ ...prev, isLoading: true, error: null }));
    }

    try {
      // CORREÇÃO: Mudar de carregamento paralelo para sequencial para evitar rate limit
      // CORREÇÃO: Aumentar o retry e delay para evitar rate limit
      const empreendimentosData = await retryWithBackoff(
        () => Empreendimento.list('-updated_date'),
        5,  // Aumentado de 5 para 5 tentativas (já era 5)
        3000, // Aumentado delay inicial para 3s
        'Empreendimentos'
      );

      // NOVO: Aguardar um pouco antes de carregar usuários
      await new Promise(resolve => setTimeout(resolve, 1000));

      const usuariosData = await retryWithBackoff(
        () => Usuario.list(),
        3,
        2000, // Delay de 2s
        'Usuarios'
      );


      const empreendimentosNormalizados = (empreendimentosData || []).map((emp) => ({
        ...emp,
        status: normalizeEmpreendimentoStatus(emp.status)
      }));

      setData({
        empreendimentos: empreendimentosNormalizados,
        usuarios: usuariosData || [],
        isLoading: false,
        error: null,
        lastUpdate: new Date(),
      });

    } catch (error) {
      console.error('❌ Erro ao carregar dados:', error);

      let errorMessage = 'Falha ao carregar os dados.';

      // MELHORADO: Detecção de erros mais específica
      const errorMsg = error.message || '';

      if (errorMsg.includes('Network Error') || errorMsg.includes('Failed to fetch')) {
        errorMessage = 'Problema de conexão com o servidor. Verifique sua internet.';
      } else if (errorMsg.includes('timeout')) {
        errorMessage = 'O servidor está demorando para responder. Tente novamente.';
      } else if (errorMsg.includes('429') || errorMsg.includes('Rate limit') || errorMsg.includes('Too Many Requests')) {
        errorMessage = 'Muitas requisições. Aguarde 30 segundos antes de tentar novamente.';
      } else if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
        errorMessage = 'Problema temporário no servidor. Tente novamente em alguns instantes.';
      } else if (errorMsg.includes('ReplicaSetNoPrimary')) {
        errorMessage = 'Banco de dados temporariamente indisponível. Tente novamente em instantes.';
      }

      setData(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    } finally {
      if (isRefresh) {
        setIsRefreshing(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  // MODIFICADO: Carregar dados com delay inicial para evitar colisão
  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 500); // Delay de 500ms antes de iniciar

    return () => clearTimeout(timer);
  }, [loadData]);

  return { ...data, refresh, isRefreshing, loadData };
};

export default function EmpreendimentosPage() {
  const {
    empreendimentos,
    usuarios,
    isLoading,
    error,
    lastUpdate,
    refresh,
    isRefreshing,
    loadData
  } = useEmpreendimentosData();
  const { user } = useContext(ActivityTimerContext); // NOVO: Obter o usuário logado do contexto

  const [showForm, setShowForm] = useState(false);
  const [editingEmpreendimento, setEditingEmpreendimento] = useState(null);
  const [filters, setFilters] = useState({
    status: 'todos',
    search: ''
  });

  // Dados filtrados com memoização
  const dadosFiltrados = useMemo(() => {
    let filtered = [...empreendimentos];

    // Filtro por status
    if (filters.status !== 'todos') {
      filtered = filtered.filter(emp => emp.status === filters.status);
    }

    // Filtro por busca
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(emp =>
        emp.nome?.toLowerCase().includes(searchTerm) ||
        emp.cliente?.toLowerCase().includes(searchTerm) ||
        emp.endereco?.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }, [empreendimentos, filters]);

  // Handlers otimizados
  const handleCreate = useCallback(() => {
    setEditingEmpreendimento(null);
    setShowForm(true);
  }, []);

  const handleEdit = useCallback((empreendimento) => {
    setEditingEmpreendimento(empreendimento);
    setShowForm(true);
  }, []);

  // CORREÇÃO: Função handleSubmit correta
  const handleSubmit = useCallback(async (empreendimentoData) => {
    try {
      let saved = null;
      if (editingEmpreendimento) {
        saved = await retryWithBackoff(() => Empreendimento.update(editingEmpreendimento.id, empreendimentoData), 3, 3000, 'Update Empreendimento');
      } else {
        saved = await retryWithBackoff(() => Empreendimento.create(empreendimentoData), 3, 3000, 'Create Empreendimento');
      }

      if (!saved || !saved.id) {
        throw new Error('Resposta invalida ao salvar empreendimento');
      }

      setShowForm(false);
      setEditingEmpreendimento(null);
      await loadData(true); // Recarregar dados após operação bem-sucedida
    } catch (error) {
      console.error('❌ Erro ao salvar empreendimento:', error);

      let errorMessage = 'Erro ao salvar empreendimento.';
      if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
        errorMessage = 'Problema de conexão. Tente novamente.';
      } else if (error.message?.includes('Rate limit')) {
        errorMessage = 'Sistema temporariamente ocupado. Aguarde alguns momentos e tente novamente.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'A operação demorou mais que o esperado.';
      } else if (error.message?.includes('sobrecarregado')) {
        errorMessage = error.message;
      }

      alert(errorMessage);
    }
  }, [editingEmpreendimento, loadData]);

  // CORREÇÃO: Função handleSuccess renomeada para evitar conflito
  const handleFormSuccess = useCallback(async () => {
    setShowForm(false);
    setEditingEmpreendimento(null);
    await loadData(true); // Recarregar dados após operação bem-sucedida
  }, [loadData]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este empreendimento?")) {
      return;
    }

    try {
      await retryWithBackoff(() => Empreendimento.delete(id), 3, 2000, 'Delete Empreendimento');
      await loadData(true); // Recarregar após exclusão
    } catch (error) {
      console.error('❌ Erro ao excluir empreendimento:', error);

      let errorMessage = 'Erro ao excluir empreendimento.';
      if (error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
        errorMessage = 'Problema de conexão. Tente novamente.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'A operação demorou mais que o esperado.';
      } else if (error.message?.includes('sobrecarregado')) {
        errorMessage = error.message;
      }

      alert(errorMessage);
    }
  }, [loadData]);

  // Estados de loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header Skeleton */}
            <div className="flex justify-between items-center">
              <div>
                <Skeleton className="h-10 w-64 mb-2" />
                <Skeleton className="h-6 w-96" />
              </div>
              <Skeleton className="h-10 w-40" />
            </div>

            {/* Filters Skeleton */}
            <div className="flex gap-4">
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-32" />
            </div>

            {/* Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-6 w-20" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center text-sm text-gray-500 mt-8">
              Carregando empreendimentos...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estado de erro
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="p-6 md:p-8">
          <div className="max-w-4xl mx-auto">
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>Erro ao carregar dados:</strong> {error}
              </AlertDescription>
            </Alert>

            <div className="text-center mt-8">
              <Button onClick={() => loadData()} variant="outline" size="lg">
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header otimizado */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                Empreendimentos
                {dadosFiltrados.length > 0 && (
                  <span className="text-lg text-gray-500">({dadosFiltrados.length})</span>
                )}
              </h1>
              <p className="text-gray-600 mt-1">
                Gerencie seus projetos e acompanhe o progresso
                {lastUpdate && (
                  <span className="text-sm text-gray-400 block md:inline md:ml-2">
                    • Última atualização: {lastUpdate.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={refresh}
                disabled={isRefreshing}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Atualizando...' : 'Atualizar'}
              </Button>

              <Button
                onClick={handleCreate}
                className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Novo Empreendimento
              </Button>
            </div>
          </motion.div>

          {/* Filtros */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <EmpreendimentoFilters
              filters={filters}
              onFiltersChange={setFilters}
              totalCount={empreendimentos.length}
              filteredCount={dadosFiltrados.length}
            />
          </motion.div>

          {/* Lista de Empreendimentos */}
          <AnimatePresence mode="wait">
            {dadosFiltrados.length > 0 ? (
              <motion.div
                key="empreendimentos-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {dadosFiltrados.map((empreendimento, index) => (
                  <motion.div
                    key={empreendimento.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <EmpreendimentoCard
                      empreendimento={empreendimento}
                      user={user} // NOVO: Passar o usuário para o card
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-16"
              >
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  {filters.search || filters.status !== 'todos'
                    ? 'Nenhum empreendimento encontrado'
                    : 'Nenhum empreendimento cadastrado'
                  }
                </h3>
                <p className="text-gray-500 mb-6">
                  {filters.search || filters.status !== 'todos'
                    ? 'Tente ajustar os filtros de busca'
                    : 'Comece criando seu primeiro projeto'
                  }
                </p>
                {(!filters.search && filters.status === 'todos') && (
                  <Button onClick={handleCreate} size="lg" className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Criar Primeiro Empreendimento
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Form Modal */}
          <AnimatePresence>
            {showForm && (
              <EmpreendimentoForm
                empreendimento={editingEmpreendimento}
                onClose={() => {
                  setShowForm(false);
                  setEditingEmpreendimento(null);
                }}
                onSubmit={handleSubmit}
                onSuccess={handleFormSuccess}
                usuarios={usuarios}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
