import React, { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { useLocation } from "react-router-dom";
import {
  Empreendimento,
  Documento,
  Disciplina,
  Atividade,
  AtividadeGenerica,
  PlanejamentoAtividade,
  Usuario,
  Pavimento,
  Execucao
} from "@/entities/all";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, AlertCircle, ListChecks } from "lucide-react";
import { retryWithBackoff, retryWithExtendedBackoff } from "../components/utils/apiUtils";

import EmpreendimentoHeader from "../components/empreendimento/EmpreendimentoHeader";
import DocumentosTab from "../components/empreendimento/DocumentosTab";
import PavimentosTab from "../components/empreendimento/PavimentosTab";
import AtividadesProjetoTab from "../components/empreendimento/AtividadesProjetoTab";
import AnaliticoGlobalTab from "../components/empreendimento/AnaliticoGlobalTab";
import AnaliseConcepcaoPlanejamentoTab from "../components/empreendimento/AnaliseConcepcaoPlanejamentoTab";
import GestaoTab from "../components/empreendimento/GestaoTab";
import PRETab from "../components/empreendimento/PRETab";
import CadastroTab from "../components/empreendimento/CadastroTab";
import ControleOSTab from "../components/empreendimento/ControleOSTab";
import { ActivityTimerContext } from "@/components/contexts/ActivityTimerContext";

export default function EmpreendimentoPage() {
  const location = useLocation();
  const [empreendimento, setEmpreendimento] = useState(null);
  const [isLoadingEmpreendimento, setIsLoadingEmpreendimento] = useState(true);
  const [error, setError] = useState(null);

  const [tabData, setTabData] = useState({
    documentos: { data: [], loaded: false, loading: false },
    pavimentos: { data: [], loaded: false, loading: false },
    atividades_projeto: { data: [], loaded: false, loading: false },
    gestao: { data: [], loaded: false, loading: false },
    controle_os: { data: [], loaded: false, loading: false }
  });

  const [sharedData, setSharedData] = useState({
    disciplinas: [],
    usuarios: [],
    atividades: [],
    execucoes: [],
    loaded: false,
    loading: false
  });

  const [activeTab, setActiveTab] = useState('documentos');
  const [etapaParaPlanejamento, setEtapaParaPlanejamento] = useState('todas');

  const empreendimentoQueryId = useMemo(() =>
    new URLSearchParams(location.search).get("id"), [location.search]
  );

  const empreendimentoFilterId = empreendimento?.id || null;

  const { user } = useContext(ActivityTimerContext);
  const hasAccessToGestao = user && (
    user.role === 'admin' ||
    user.perfil === 'lider' ||
    user.perfil === 'direcao'
  );

  const canEdit = user && (
    user.role === 'admin' ||
    user.perfil === 'lider' ||
    user.perfil === 'coordenador' ||
    user.perfil === 'gestao' ||
    user.perfil === 'direcao'
  );

  const visibleTabsForUser = useMemo(() => {
    if (canEdit) {
      return ['documentos', 'cadastro', 'pavimentos', 'atividades_projeto', 'pre', 'controle_os', 'gestao'];
    }
    // Usuários comuns veem apenas: Documentos, Cadastro, PRE
    return ['documentos', 'cadastro', 'pre'];
  }, [canEdit]);

  const loadEmpreendimento = useCallback(async () => {
    if (!empreendimentoQueryId) return;

    setIsLoadingEmpreendimento(true);
    setError(null);

    try {
      const lookup = String(empreendimentoQueryId).trim();
      const emp = await retryWithBackoff(
        () => Empreendimento.filter({ id: lookup }),
        3, 1000, 'loadEmpreendimento'
      );

      if (!emp || emp.length === 0) {
        setError("Empreendimento não encontrado");
        return;
      }

      let selected = emp.find(e => String(e.id) === lookup);
      if (!selected) {
        selected = emp.find(e => String(e.nome || '').startsWith(`${lookup} -`));
      }

      setEmpreendimento(selected || emp[0]);

    } catch (err) {
      console.error("Erro ao carregar empreendimento:", err);
      setError("Erro ao carregar empreendimento");
    } finally {
      setIsLoadingEmpreendimento(false);
    }
  }, [empreendimentoQueryId]);

  const loadSharedData = useCallback(async () => {
    if (!empreendimentoFilterId) return;

    // Force load: avoid depending on stale `sharedData` closure values which
    // can cause an early return. Mark loading immediately.
    setSharedData(prev => ({ ...prev, loading: true }));

    try {
      const [disciplinasData, usuariosData, atividadesData, execucoesData] = await Promise.all([
        retryWithBackoff(() => Disciplina.list(), 3, 1000, 'loadDisciplinas'),
        retryWithBackoff(() => Usuario.list(), 3, 1000, 'loadUsuarios'),
        retryWithExtendedBackoff(() => AtividadeGenerica.list(null, 5000), 'loadAtividadesGlobais'),
        retryWithExtendedBackoff(() => Execucao.filter({ empreendimento_id: empreendimentoFilterId }), 'loadExecucoes')
      ]);

      // Também carregar atividades específicas do empreendimento (atividades_empreendimento)
      let atividadesEmpreendimento = [];
      let atividadesProjetoEspecificas = [];
      try {
        const { base44 } = await import('@/api/base44Client');
        atividadesEmpreendimento = await retryWithExtendedBackoff(() => base44.entities.AtividadesEmpreendimento.filter({ empreendimento_id: empreendimentoFilterId }), 'loadAtividadesEmpreendimento');
      } catch (err) {
        console.warn('Não foi possível carregar atividades por empreendimento:', err);
        atividadesEmpreendimento = [];
      }

      try {
        atividadesProjetoEspecificas = await retryWithExtendedBackoff(() => Atividade.filter({ empreendimento_id: empreendimentoFilterId }), 'loadAtividadesProjetoCatalog');
      } catch (err) {
        console.warn('Não foi possível carregar atividades do empreendimento:', err);
        atividadesProjetoEspecificas = [];
      }

      // Mesclar atividades globais (mãe) com as atividades específicas do empreendimento
      const mergedAtividades = [
        ...(atividadesData || []),
        ...(atividadesEmpreendimento || []),
        ...(atividadesProjetoEspecificas || [])
      ];

      setSharedData({
        disciplinas: disciplinasData || [],
        usuarios: usuariosData || [],
        atividades: mergedAtividades,
        execucoes: execucoesData || [],
        loaded: true,
        loading: false
      });

    } catch (err) {
      console.error("Erro ao carregar dados compartilhados:", err);
      setSharedData(prev => ({ ...prev, loading: false }));
    }
  }, [empreendimentoFilterId, sharedData.loading, sharedData.loaded]);

  const loadTabData = useCallback(async (tabName) => {
    if (!empreendimentoFilterId || tabData[tabName]?.loading || tabData[tabName]?.loaded) return;

    setTabData(prev => ({
      ...prev,
      [tabName]: { ...prev[tabName], loading: true }
    }));

    try {
      let data = [];

      switch (tabName) {
        case 'documentos':
          const [documentosData, planejamentosAtividadeData, planejamentosDocumentoData] = await Promise.all([
            retryWithExtendedBackoff(() => Documento.filter({ empreendimento_id: empreendimentoFilterId }), 'loadDocumentos'),
            retryWithExtendedBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: empreendimentoFilterId }), 'loadPlanejamentosAtividade'),
            (async () => {
              try {
                const { PlanejamentoDocumento } = await import('@/entities/all');
                return await retryWithExtendedBackoff(() => PlanejamentoDocumento.filter({ empreendimento_id: empreendimentoFilterId }), 'loadPlanejamentosDocumento');
              } catch {
                return [];
              }
            })()
          ]);

          data = {
            documentos: documentosData || [],
            planejamentos: [...(planejamentosAtividadeData || []), ...(planejamentosDocumentoData || [])].map(p => ({
              ...p,
              tipo_plano: p.documento_id && !p.atividade_id ? 'documento' : 'atividade'
            })),
          };
          break;

        case 'pavimentos':
          data = await retryWithExtendedBackoff(() => Pavimento.filter({ empreendimento_id: empreendimentoFilterId }), 'loadPavimentos');
          break;

        case 'atividades_projeto':
          data = await retryWithExtendedBackoff(() => Atividade.filter({ empreendimento_id: empreendimentoFilterId }), 'loadAtividadesProjeto');
          break;

        case 'gestao':
          data = {};
          break;

        case 'controle_os':
          data = {};
          break;

        default:
          console.warn(`Aba desconhecida: ${tabName}`);
          break;
      }

      setTabData(prev => ({
        ...prev,
        [tabName]: { data, loaded: true, loading: false }
      }));

    } catch (err) {
      console.error(`Erro ao carregar ${tabName}:`, err);

      let errorMessage = `Erro ao carregar dados. `;
      if (err.message?.includes('Network Error')) {
        errorMessage += 'Verifique sua conexão.';
      } else if (err.message?.includes('429')) {
        errorMessage += 'Aguarde 30 segundos.';
      } else {
        errorMessage += 'Tente recarregar.';
      }

      alert(errorMessage);

      setTabData(prev => ({
        ...prev,
        [tabName]: { ...prev[tabName], loading: false }
      }));
    }
  }, [empreendimentoFilterId, tabData]);

  const handleTabChange = useCallback((newTab) => {
    setActiveTab(newTab);

    if (!sharedData.loaded && !sharedData.loading) {
      loadSharedData();
    }

    if (newTab !== 'gestao' && !tabData[newTab]?.loaded && !tabData[newTab]?.loading) {
      loadTabData(newTab);
    }

    if (newTab === 'atividades_projeto') {
      if (!tabData.documentos.loaded && !tabData.documentos.loading) {
        loadTabData('documentos');
      }
      if (!tabData.pavimentos.loaded && !tabData.pavimentos.loading) {
        loadTabData('pavimentos');
      }
    }

    if (newTab === 'documentos' && !tabData.pavimentos.loaded && !tabData.pavimentos.loading) {
      loadTabData('pavimentos');
    }

    if (newTab === 'gestao') {
      if (!tabData.documentos.loaded && !tabData.documentos.loading) {
        loadTabData('documentos');
      }
      if (!tabData.pavimentos.loaded && !tabData.pavimentos.loading) {
        loadTabData('pavimentos');
      }
      if (!tabData.gestao.loaded) {
        setTabData(prev => ({
          ...prev,
          gestao: { ...prev.gestao, loaded: true }
        }));
      }
    }



  }, [sharedData.loaded, sharedData.loading, tabData, loadSharedData, loadTabData]);

  const forceFullReload = useCallback(() => {
    setTabData({
      documentos: { data: [], loaded: false, loading: false },
      pavimentos: { data: [], loaded: false, loading: false },
      atividades_projeto: { data: [], loaded: false, loading: false },
      gestao: { data: [], loaded: false, loading: false },
      controle_os: { data: [], loaded: false, loading: false }
    });
    // mark shared data stale and trigger an immediate reload to avoid
    // race conditions where state updates are not visible to subsequent checks
    setSharedData(prev => ({ ...prev, loaded: false }));
    // call loaders directly to ensure fresh data is fetched
    loadSharedData();
    loadEmpreendimento();
    handleTabChange(activeTab || 'documentos');
  }, [activeTab, loadEmpreendimento, handleTabChange]);

  useEffect(() => {
    loadEmpreendimento();
  }, [loadEmpreendimento]);

  useEffect(() => {
    if (empreendimento) {
      handleTabChange(activeTab);
    }
  }, [empreendimento, activeTab, handleTabChange]);

  if (isLoadingEmpreendimento) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="p-6 md:p-8 space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Erro ao Carregar</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
        </div>
      </div>
    );
  }

  const isGestaoLoading = sharedData.loading || tabData.documentos.loading || tabData.pavimentos.loading;
  const isGestaoLoaded = sharedData.loaded && tabData.documentos.loaded && tabData.pavimentos.loaded;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8 space-y-6">
        <EmpreendimentoHeader empreendimento={empreendimento} />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className={`grid w-full ${canEdit ? (hasAccessToGestao ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6') : 'grid-cols-3'} bg-white shadow-sm`}>
            {visibleTabsForUser.includes('documentos') && <TabsTrigger value="documentos">Documentos</TabsTrigger>}
            {visibleTabsForUser.includes('cadastro') && <TabsTrigger value="cadastro">Cadastro</TabsTrigger>}
            {visibleTabsForUser.includes('pavimentos') && <TabsTrigger value="pavimentos">Pavimentos</TabsTrigger>}
            {visibleTabsForUser.includes('atividades_projeto') && <TabsTrigger value="atividades_projeto">Atividades do Projeto</TabsTrigger>}
            {visibleTabsForUser.includes('pre') && <TabsTrigger value="pre">PRE</TabsTrigger>}
            {visibleTabsForUser.includes('controle_os') && <TabsTrigger value="controle_os">Controle OS</TabsTrigger>}
            {hasAccessToGestao && visibleTabsForUser.includes('gestao') && (
              <TabsTrigger value="gestao">Gestão</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="documentos">
            {tabData.documentos.loading || sharedData.loading || tabData.pavimentos.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando documentos...</p>
              </div>
            ) : tabData.documentos.loaded && sharedData.loaded && tabData.pavimentos.loaded ? (
              <DocumentosTab
                empreendimento={empreendimento}
                documentos={tabData.documentos.data.documentos || []}
                disciplinas={sharedData.disciplinas}
                atividades={sharedData.atividades || []}
                planejamentos={tabData.documentos.data.planejamentos || []}
                usuarios={sharedData.usuarios}
                pavimentos={tabData.pavimentos.data || []}
                onUpdate={forceFullReload}
                isLoading={false}
                etapaParaPlanejamento={etapaParaPlanejamento}
                onEtapaChange={setEtapaParaPlanejamento}
                readOnly={!canEdit}
              />
            ) : (
              <div className="flex justify-center items-center h-64">
                <Button onClick={() => handleTabChange('documentos')}>
                  Carregar Documentos
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pavimentos">
            {tabData.pavimentos.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando pavimentos...</p>
              </div>
            ) : tabData.pavimentos.loaded ? (
              <PavimentosTab
                empreendimentoId={empreendimento?.id}
                pavimentosIniciais={tabData.pavimentos.data}
                onUpdate={() => {
                  setTabData(prev => ({ ...prev, pavimentos: { ...prev.pavimentos, loaded: false } }));
                  loadTabData('pavimentos');
                }}
                isLoading={false}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="atividades_projeto">
            {tabData.atividades_projeto.loading || sharedData.loading || tabData.documentos.loading || tabData.pavimentos.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando atividades...</p>
              </div>
            ) : tabData.atividades_projeto.loaded && sharedData.loaded && tabData.documentos.loaded && tabData.pavimentos.loaded ? (
              <AnaliticoGlobalTab
                empreendimentoId={empreendimento?.id}
                onUpdate={forceFullReload}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="cadastro">
            <CadastroTab empreendimento={empreendimento} readOnly={!canEdit} />
          </TabsContent>

          <TabsContent value="pre">
            <PRETab empreendimento={empreendimento} readOnly={!canEdit} />
          </TabsContent>

          <TabsContent value="controle_os">
            {sharedData.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando...</p>
              </div>
            ) : sharedData.loaded ? (
              <ControleOSTab
                empreendimento={empreendimento}
                atividades={sharedData.atividades || []}
              />
            ) : null}
          </TabsContent>

          {hasAccessToGestao && (
            <TabsContent value="gestao">
              {isGestaoLoading ? (
                <div className="flex flex-col items-center justify-center h-96">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                  <p className="text-gray-600">Carregando gestão...</p>
                </div>
              ) : isGestaoLoaded ? (
                <GestaoTab
                  empreendimento={empreendimento}
                  documentos={tabData.documentos.data.documentos || []}
                  planejamentos={[
                    ...(tabData.documentos.data.planejamentos || [])
                  ]}
                  atividades={sharedData.atividades || []}
                  usuarios={sharedData.usuarios}
                  execucoes={sharedData.execucoes || []}
                  pavimentos={tabData.pavimentos.data || []}
                  onUpdate={forceFullReload}
                />
              ) : null}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
