
import { useState, useEffect, useCallback, memo, useContext } from "react";
import { Empreendimento, Disciplina, Atividade, Documento, Analitico, PlanejamentoAtividade, Usuario } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ActivityTimerContext } from "@/components/contexts/ActivityTimerContext";
import ExecucoesPorUsuario from "../components/dashboard/ExecucoesPorUsuario";
import QuickActions from "../components/dashboard/QuickActions";
import AtividadeRapida from "../components/dashboard/AtividadeRapida";
import CalendarioPlanejamento from "../components/dashboard/CalendarioPlanejamento";
import { Skeleton } from "@/components/ui/skeleton";
import ReagendamentoModal from "../components/modals/ReagendamentoModal"; // Assuming this path for the new modal

const MemoizedExecucoesPorUsuario = memo(ExecucoesPorUsuario);

// Função utilitária para adicionar delay entre requisições
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Função para retry com backoff exponencial
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
        if (attempt === maxRetries) throw error;
        const delayTime = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await delay(delayTime);
      } else {
        throw error;
      }
    }
  }
};

// Função para buscar dados com rate limiting
const fetchWithRateLimit = async (entity, params = {}) => {
  return retryWithBackoff(async () => {
    await delay(Math.random() * 500 + 200); // Delay aleatório entre 200-700ms
    if (params.sort || params.limit) {
      return await entity.list(params.sort, params.limit);
    }
    return await entity.list();
  });
};

// Função para buscar todos os registros de uma entidade, lidando com paginação
const fetchAllRecords = async (entity) => {
  return retryWithBackoff(async () => {
    const BATCH_SIZE = 2000; // Reduzido de 5000 para evitar timeout
    let allRecords = [];
    let lastResponseLength = 0;
    let offset = 0;

    do {
      await delay(Math.random() * 800 + 400); // Delay maior entre batches
      const records = await entity.list(null, BATCH_SIZE, offset);
      if (records) {
        allRecords = allRecords.concat(records);
        lastResponseLength = records.length;
        offset += BATCH_SIZE;
      } else {
        lastResponseLength = 0;
      }
    } while (lastResponseLength === BATCH_SIZE);

    return allRecords;
  });
};

export default function Dashboard() {
  const [stats, setStats] = useState({ empreendimentos: 0, disciplinas: 0, atividades: 0, ativos: 0 });
  const [areStatsLoading, setAreStatsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [showReagendamentoModal, setShowReagendamentoModal] = useState(false); // Novo estado

  const { user, isLoading: isUserLoading, refreshTrigger, triggerDataRefresh } = useContext(ActivityTimerContext);

  const [planejamentos, setPlanejamentos] = useState([]);
  const [isPlanningLoading, setIsPlanningLoading] = useState(true);
  const [planningError, setPlanningError] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [disciplinas, setDisciplinas] = useState([]);

  const [planningLoadingStage, setPlanningLoadingStage] = useState('Carregando...');

  const loadPlanejamentos = useCallback(async () => {
    if (!user) {
      setIsPlanningLoading(false);
      return;
    }

    const isUserAdminOrLider = user.role === 'admin' || user.role === 'lider';

    setIsPlanningLoading(true);
    setPlanningError(null);
    setPlanningLoadingStage('Inicializando...');

    try {
      // ETAPA 1: Carregar dados essenciais primeiro
      setPlanningLoadingStage('Carregando usuários...');
      const allUsers = await fetchWithRateLimit(Usuario);
      setUsuarios(allUsers);

      await delay(1000); // Pausa entre etapas

      setPlanningLoadingStage('Carregando empreendimentos...');
      const todosEmpreendimentos = await fetchWithRateLimit(Empreendimento);

      await delay(1000);

      setPlanningLoadingStage('Carregando disciplinas...');
      const allDisciplinas = await fetchWithRateLimit(Disciplina);
      setDisciplinas(allDisciplinas);

      await delay(1000);

      setPlanningLoadingStage('Carregando planejamentos...');
      const todosPlanejamentos = await fetchWithRateLimit(PlanejamentoAtividade);


      // ETAPA 2: Carregar dados relacionados com mais delay
      setPlanningLoadingStage('Carregando atividades...');
      await delay(1500);
      const allAtividades = await fetchWithRateLimit(Atividade);

      setPlanningLoadingStage('Carregando analíticos...');
      await delay(1500);
      const allAnaliticos = await fetchWithRateLimit(Analitico);

      setPlanningLoadingStage('Carregando documentos...');
      await delay(1500);
      const allDocumentos = await fetchWithRateLimit(Documento);


      // ETAPA 3: Criar mapas otimizados
      setPlanningLoadingStage('Processando dados...');
      const usersMapByEmail = allUsers.reduce((acc, u) => ({ ...acc, [u.email]: u }), {});
      const empreendimentosMap = todosEmpreendimentos.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});
      const analiticosMap = new Map(allAnaliticos.map(a => [a.id, a]));
      const atividadesMap = new Map(allAtividades.map(a => [a.id, a]));
      const documentosMap = new Map(allDocumentos.map(d => [d.id, d]));

      // ETAPA 4: Filtrar planejamentos para o usuário atual
      let planejamentosParaProcessar;
      if (isUserAdminOrLider) {
        planejamentosParaProcessar = todosPlanejamentos;
      } else {
        planejamentosParaProcessar = todosPlanejamentos.filter(p => {
          const isExecutor = p.executores && p.executores.includes(user.email);
          const isPrincipal = p.executor_principal === user.email;
          return isExecutor || isPrincipal;
        });
      }

      setPlanningLoadingStage('Finalizando...');

      // ETAPA 5: Enriquecer planejamentos
      const planejamentosEnriquecidos = planejamentosParaProcessar.map((p) => {
        const executor = p.executor_principal ? usersMapByEmail[p.executor_principal] : null;
        const empreendimento = p.empreendimento_id ? empreendimentosMap[p.empreendimento_id] : null;
        const analitico = p.analitico_id ? analiticosMap.get(p.analitico_id) : null;
        const atividade = analitico?.atividade_id ? atividadesMap.get(analitico.atividade_id) : null;
        const documento = analitico?.documento_id ? documentosMap.get(analitico.documento_id) : null;

        return {
          ...p,
          executor,
          empreendimento,
          atividade,
          documento
        };
      });

      const comAtividade = planejamentosEnriquecidos.filter(p => p.atividade && p.atividade.atividade).length;
      const semAtividade = planejamentosEnriquecidos.filter(p => !p.atividade || !p.atividade.atividade).length;


      if (semAtividade > planejamentosEnriquecidos.length * 0.2) {
        setPlanningError("Alguns dados podem não ter carregado completamente devido ao limite de requisições.");
      }

      setPlanejamentos(planejamentosEnriquecidos);

    } catch (err) {
      if (err.message?.includes("Rate limit") || err.message?.includes("429")) {
        setPlanningError("Sistema com muitas requisições simultâneas. Aguarde 30 segundos e recarregue a página.");
      } else {
        setPlanningError("Erro ao carregar atividades. Tente recarregar em alguns instantes.");
      }
      setPlanejamentos([]);
    } finally {
      setIsPlanningLoading(false);
      setPlanningLoadingStage('');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      // Aguardar mais tempo antes de iniciar
      setTimeout(() => {
        loadPlanejamentos();
      }, 2000);
    }
  }, [user, loadPlanejamentos]);

  // Só carregar stats para admin/lider e com muito delay
  useEffect(() => {
    const loadDashboardStats = async () => {
      if (!user || user.role === 'user') {
        setAreStatsLoading(false);
        return;
      }

      setAreStatsLoading(true);
      try {
        await delay(3000); // Delay maior antes de carregar stats

        const [empData, discData, ativData] = await Promise.all([
          fetchWithRateLimit(Empreendimento),
          fetchWithRateLimit(Disciplina),
          fetchWithRateLimit(Atividade)
        ]);

        setStats({
          empreendimentos: empData.length,
          disciplinas: discData.length,
          atividades: ativData.length,
          ativos: empData.filter(e => e.status === "ativo").length,
        });
      } catch (error) {
        if (error.message?.includes("Rate limit") || error.message?.includes("429")) {
        }
      } finally {
        setAreStatsLoading(false);
      }
    };

    if (!isUserLoading) {
      setTimeout(() => {
        loadDashboardStats();
      }, 5000); // Delay ainda maior para stats
    }
  }, [user, isUserLoading]);

  const handleRecalculateAllEmpreendimentos = async () => {
    // This function's content was not provided in the original extract,
    // so it's defined as an empty async function to avoid syntax errors.
    // In a real scenario, its full logic would be here.
  };

  const calculateTemposPorEtapa = (atividades, fatorDificuldade) => {
    // This function's content was not provided in the original extract,
    // so it's defined as an empty function to avoid syntax errors.
    // In a real scenario, its full logic would be here.
  };

  const calculateTemposExecucaoPorEtapa = (analiticosDoDocumento, execucoesMap) => {
    // This function's content was not provided in the original extract,
    // so it's defined as an empty function to avoid syntax errors.
    // In a real scenario, its full logic would be here.
  };

  const handleReagendarAtividades = () => {
    setShowReagendamentoModal(true);
  };

  const handleReagendamentoConfirm = () => {
    setShowReagendamentoModal(false);
    triggerDataRefresh(); // Atualizar dados após reagendamento
  };

  // Adiciona um estado de carregamento principal
  if (isUserLoading) {
    return (
      <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-80" />
          </div>
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2 space-y-8">
            <Skeleton className="h-[200px] rounded-lg w-full" />
            <Skeleton className="h-[300px] rounded-lg w-full" />
          </div>
          <div className="space-y-8">
            <Skeleton className="h-[150px] rounded-lg w-full" />
            <Skeleton className="h-[150px] rounded-lg w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8 space-y-8">
        <div className="max-w-full mx-auto 2xl:max-w-screen-2xl">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Painel de Controle
                {planningLoadingStage && (user?.role === 'admin' || user?.role === 'lider') && (
                  <span className="ml-4 text-sm text-gray-500 font-normal">
                    ({planningLoadingStage})
                  </span>
                )}
              </h1>
              <p className="text-gray-600">
                {user?.role === 'user'
                  ? `Bem-vindo, ${user?.full_name || user?.email || 'Colaborador'}. Veja suas atividades.`
                  : "Gerencie seus empreendimentos e projetos de forma eficiente"
                }
              </p>
              {planningError && (user?.role === 'admin' || user?.role === 'lider') && (
                <p className="text-orange-600 text-sm mt-2">
                  ⚠️ {planningError}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {user && user.role === 'admin' && (
                <>
                  <Button
                    onClick={handleReagendarAtividades}
                    variant="outline"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Reagendar Atrasadas
                  </Button>
                  <Button
                    onClick={handleRecalculateAllEmpreendimentos}
                    disabled={isRecalculating}
                    variant="outline"
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
                    {isRecalculating ? "Recalculando..." : "Recalcular Todas as Horas"}
                  </Button>
                </>
              )}
              {user && (user.role === 'admin' || user.role === 'lider') && (
                <Link to={createPageUrl("Empreendimentos")}>
                  <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Empreendimento
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Layout Unificado */}
          <>
            <div className="mb-8">
              <CalendarioPlanejamento
                planejamentos={planejamentos}
                isLoading={isPlanningLoading}
                usuarios={usuarios}
                disciplinas={disciplinas}
                onRefresh={triggerDataRefresh}
                isRefreshing={isPlanningLoading}
              />
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <MemoizedExecucoesPorUsuario />
              </div>
              <div className="space-y-8">
                <AtividadeRapida />
                {user && (user.role === 'admin' || user.role === 'lider') && <QuickActions />}
              </div>
            </div>
          </>
        </div>
      </div>

      {/* Modal de Reagendamento */}
      <ReagendamentoModal
        isOpen={showReagendamentoModal}
        onClose={() => setShowReagendamentoModal(false)}
        onConfirm={handleReagendamentoConfirm}
      />
    </div>
  );
}
