import React, { useState, useEffect, useCallback, memo, useContext, useRef } from "react";
import { Empreendimento, Disciplina, Atividade, Documento, Execucao, PlanejamentoAtividade, Usuario, AtividadeGenerica } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, FileText, BarChart3, Plus, MapPin, RefreshCw, Calendar, TrendingUp, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ActivityTimerContext } from "@/components/contexts/ActivityTimerContext";
import ExecucoesPorUsuario from "../components/dashboard/ExecucoesPorUsuario";
import QuickActions from "../components/dashboard/QuickActions";
import CalendarioPlanejamento from "../components/dashboard/CalendarioPlanejamento";
import AlertaAtrasosEntrega from "../components/dashboard/AlertaAtrasosEntrega";
import CurvaSPlanejamento from "../components/dashboard/CurvaSPlanejamento";
import AlocacaoEquipeTab from "../components/empreendimento/AlocacaoEquipeTab";
import { Skeleton } from "@/components/ui/skeleton";
import { retryWithBackoff, delay } from "../components/utils/apiUtils";
import { parseISO, subDays, isValid, format } from 'date-fns';
import { getNextWorkingDay, distribuirHorasPorDias } from '../components/utils/DateCalculator';
import NovoPlanejamentoModal from "../components/planejamento/NovoPlanejamentoModal";

const MemoizedExecucoesPorUsuario = memo(ExecucoesPorUsuario);

export default function Dashboard() {
  const [stats, setStats] = useState({ empreendimentos: 0, disciplinas: 0, atividades: 0, ativos: 0 });
  const [areStatsLoading, setAreStatsLoading] = useState(true);

  const {
    user,
    isLoading: isUserLoading,
    updateKey,
    atividadesGenericas,
    allEmpreendimentos,
    allUsers,
    isLoadingPlanejamentos,
    hasPermission,
    isAdmin,
    nivelUsuario,
    triggerUpdate
  } = useContext(ActivityTimerContext);

  const [disciplinas, setDisciplinas] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState(null);
  const [viewMode, setViewMode] = useState('calendar');
  const [showNovoPlanejamentoModal, setShowNovoPlanejamentoModal] = useState(false);

  const isColaboradorView = nivelUsuario === 1 && !isAdmin;
  const canCreatePlanning = hasPermission('coordenador');

  const isLoadingRef = useRef(false);
  const hasLoadedOnce = useRef(false);

  const loadDashboardData = useCallback(async () => {
    if (!user) {
      setIsDashboardLoading(false);
      return;
    }

    if (isLoadingRef.current) {
      console.log('⏸️ [Dashboard] Carregamento já em andamento, ignorando...');
      return;
    }

    isLoadingRef.current = true;
    setIsDashboardLoading(true);
    setDashboardError(null);

    try {
      console.log("🚀 [Dashboard] Carregando apenas Disciplinas (Atividades sob demanda)...");

      const allDisciplinas = await retryWithBackoff(() => Disciplina.list(), 3, 4000, 'Dashboard-Disciplina');

      setDisciplinas(allDisciplinas || []);

      if (user.role === 'admin') {
        setStats({
          empreendimentos: allEmpreendimentos?.length || 0,
          disciplinas: (allDisciplinas || []).length,
          ativos: (allEmpreendimentos || []).filter((e) => e.status === "ativo").length,
          atividades: 0
        });
      }

      setAreStatsLoading(false);
      hasLoadedOnce.current = true;
      console.log("✅ [Dashboard] Disciplinas carregadas");

    } catch (err) {
      console.error("❌ [Dashboard] ERRO ao carregar dados:", err);

      if (err.message && (err.message.includes('Rate limit') || err.message.includes('Too Many Requests') || err.message.includes('429'))) {
        setDashboardError("⚠️ Limite de requisições atingido. Por favor, aguarde 1 minuto antes de tentar novamente.");
      } else {
        setDashboardError("Erro ao carregar dados. Atualize a página em alguns segundos.");
      }
    } finally {
      setIsDashboardLoading(false);
      isLoadingRef.current = false;
    }
  }, [user, allEmpreendimentos]);

  useEffect(() => {
    if (!isLoadingPlanejamentos && allEmpreendimentos && allUsers && !hasLoadedOnce.current) {
      const timeout = setTimeout(() => {
        loadDashboardData();
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [isLoadingPlanejamentos, allEmpreendimentos, allUsers, loadDashboardData]);

  const handleManualRefresh = () => {
    hasLoadedOnce.current = false;
    loadDashboardData();
  };

  const loadAtividadesSeNecessario = useCallback(async () => {
    if (atividades.length > 0) {
      console.log('✅ Atividades já carregadas');
      return;
    }

    console.log('🔄 Carregando atividades sob demanda...');
    try {
      const allAtividades = await retryWithBackoff(() => Atividade.list(), 3, 4000, 'Dashboard-Atividade-OnDemand');
      setAtividades(allAtividades || []);
      console.log('✅ Atividades carregadas');
    } catch (error) {
      console.error('❌ Erro ao carregar atividades:', error);
      setAtividades([]);
    }
  }, [atividades.length]);

  if (isUserLoading || (isDashboardLoading && !hasLoadedOnce.current)) {
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
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[400px] rounded-lg w-full" />
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
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Painel de Controle</h1>
              <p className="text-gray-600">
                {isColaboradorView ?
                  `Bem-vindo, ${user?.full_name || user?.email || 'Colaborador'}. Veja suas atividades.` :
                  "Gerencie seus projetos de forma eficiente."
                }
              </p>
              {dashboardError &&
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm font-medium">{dashboardError}</p>
                  <Button onClick={handleManualRefresh} size="sm" className="mt-2 bg-red-600 hover:bg-red-700">
                    Tentar Novamente
                  </Button>
                </div>
              }
            </div>
            {canCreatePlanning &&
              <Button
                onClick={async () => {
                  await loadAtividadesSeNecessario();
                  setShowNovoPlanejamentoModal(true);
                }}
                className="bg-zinc-950 text-slate-50 px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 hover:bg-purple-700 shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Novo Planejamento
              </Button>
            }
          </div>

          <AlertaAtrasosEntrega
            user={user}
            isColaboradorView={isColaboradorView}
            usuarios={allUsers}
          />

          <div className="flex justify-center mb-4">
            <div className="bg-white rounded-lg p-1 shadow-sm border">
              <Button variant={isColaboradorView || viewMode === 'calendar' ? 'default' : 'ghost'} onClick={() => setViewMode('calendar')} className="px-4 py-2" disabled={isColaboradorView}>
                <Calendar className="w-4 h-4 mr-2" />Calendário
              </Button>
              <Button variant={viewMode === 'curva-s' && !isColaboradorView ? 'default' : 'ghost'} onClick={() => setViewMode('curva-s')} className="px-4 py-2" disabled={isColaboradorView}>
                <TrendingUp className="w-4 h-4 mr-2" />Curva S
              </Button>
              <Button variant={viewMode === 'alocacao' && !isColaboradorView ? 'default' : 'ghost'} onClick={() => setViewMode('alocacao')} className="px-4 py-2" disabled={isColaboradorView}>
                <UsersRound className="w-4 h-4 mr-2" />Alocação Equipe
              </Button>
            </div>
          </div>

          <div className="mb-8">
            {(isColaboradorView || viewMode === 'calendar') && (
              <CalendarioPlanejamento
                isDashboardRefreshing={isDashboardLoading}
                usuarios={allUsers}
                disciplinas={disciplinas}
                onRefresh={handleManualRefresh}
              />
            )}

            {viewMode === 'curva-s' && !isColaboradorView && (
              <CurvaSPlanejamento
                isLoading={isDashboardLoading}
                onRefresh={handleManualRefresh}
                isRefreshing={isDashboardLoading}
                usuarios={allUsers}
              />
            )}

            {viewMode === 'alocacao' && !isColaboradorView && (
              <AlocacaoEquipeTab
                usuarios={allUsers}
              />
            )}
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <MemoizedExecucoesPorUsuario />
            </div>
            <div className="space-y-8">
              <QuickActions
                atividadesGenericas={atividadesGenericas}
                usuarios={allUsers}
                empreendimentos={allEmpreendimentos}
                isLoading={isLoadingPlanejamentos}
              />
            </div>
          </div>
        </div>
      </div>

      {showNovoPlanejamentoModal && (
        <NovoPlanejamentoModal
          isOpen={showNovoPlanejamentoModal}
          onClose={() => setShowNovoPlanejamentoModal(false)}
          empreendimentos={allEmpreendimentos}
          usuarios={allUsers}
          atividades={atividades}
          onSuccess={() => {
            setShowNovoPlanejamentoModal(false);
            triggerUpdate(); // Atualiza o calendário mantendo o usuário filtrado
          }}
        />
      )}
    </div>
  );
}