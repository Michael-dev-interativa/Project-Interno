import React, { useState, useEffect, useCallback, useMemo, useContext } from "react";
import { useLocation } from "react-router-dom";
import {
  Comercial,
  Documento,
  Disciplina,
  Atividade,
  PlanejamentoAtividade,
  Usuario,
  Pavimento,
  Execucao
} from "@/entities/all";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, AlertCircle, ListChecks, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { retryWithBackoff, retryWithExtendedBackoff } from "../components/utils/apiUtils";

import EmpreendimentoHeader from "../components/empreendimento/EmpreendimentoHeader";
import DocumentosTab from "../components/empreendimento/DocumentosTab";
import PavimentosTab from "../components/empreendimento/PavimentosTab";
import AtividadesProjetoTab from "../components/empreendimento/AtividadesProjetoTab";
import AnaliticoGlobalTab from "../components/empreendimento/AnaliticoGlobalTab";
import AnaliseConcepcaoPlanejamentoTab from "../components/empreendimento/AnaliseConcepcaoPlanejamentoTab";
import GestaoTab from "../components/empreendimento/GestaoTab";
import { ActivityTimerContext } from "../components/contexts/ActivityTimerContext";

export default function ComercialDetalhesPage() {
  const location = useLocation();
  const [comercial, setComercial] = useState(null);
  const [isLoadingComercial, setIsLoadingComercial] = useState(true);
  const [error, setError] = useState(null);

  const [tabData, setTabData] = useState({
    documentos: { data: [], loaded: false, loading: false },
    pavimentos: { data: [], loaded: false, loading: false },
    atividades_projeto: { data: [], loaded: false, loading: false },
    catalogo_atividades: { data: [], loaded: false, loading: false },
    documentacao: { data: [], loaded: false, loading: false },
    gestao: { data: [], loaded: false, loading: false }
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

  const comercialId = useMemo(() =>
    new URLSearchParams(location.search).get("id"), [location.search]
  );

  const { user } = useContext(ActivityTimerContext);
  const hasAccessToGestao = user && (
    user.role === 'admin' ||
    user.perfil === 'lider' ||
    user.perfil === 'direcao'
  );

  const loadComercial = useCallback(async () => {
    if (!comercialId) return;

    setIsLoadingComercial(true);
    setError(null);

    try {
      const com = await retryWithBackoff(
        () => Comercial.filter({ id: comercialId }),
        3, 1000, 'loadComercial'
      );

      if (!com || com.length === 0) {
        setError("Projeto comercial não encontrado");
        return;
      }

      setComercial(com[0]);

    } catch (err) {
      console.error("Erro ao carregar projeto comercial:", err);
      setError("Erro ao carregar projeto comercial");
    } finally {
      setIsLoadingComercial(false);
    }
  }, [comercialId]);

  const loadSharedData = useCallback(async () => {
    if (sharedData.loading || sharedData.loaded || !comercialId) return;

    setSharedData(prev => ({ ...prev, loading: true }));

    try {
      const [disciplinasData, usuariosData, atividadesData, execucoesData] = await Promise.all([
        retryWithBackoff(() => Disciplina.list(), 3, 1000, 'loadDisciplinas'),
        retryWithBackoff(() => Usuario.list(), 3, 1000, 'loadUsuarios'),
        retryWithExtendedBackoff(() => Atividade.list(), 'loadAtividadesGlobais'),
        retryWithExtendedBackoff(() => Execucao.filter({ empreendimento_id: comercialId }), 'loadExecucoes')
      ]);

      setSharedData({
        disciplinas: disciplinasData || [],
        usuarios: usuariosData || [],
        atividades: atividadesData || [],
        execucoes: execucoesData || [],
        loaded: true,
        loading: false
      });

    } catch (err) {
      console.error("Erro ao carregar dados compartilhados:", err);
      setSharedData(prev => ({ ...prev, loading: false }));
    }
  }, [comercialId, sharedData.loading, sharedData.loaded]);

  const loadTabData = useCallback(async (tabName) => {
    if (!comercialId || tabData[tabName]?.loading || tabData[tabName]?.loaded) return;

    setTabData(prev => ({
      ...prev,
      [tabName]: { ...prev[tabName], loading: true }
    }));

    try {
      let data = [];

      switch (tabName) {
        case 'documentos':
          const [documentosData, planejamentosAtividadeData, planejamentosDocumentoData] = await Promise.all([
            retryWithExtendedBackoff(() => Documento.filter({ empreendimento_id: comercialId }), 'loadDocumentos'),
            retryWithExtendedBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: comercialId }), 'loadPlanejamentosAtividade'),
            (async () => {
              try {
                const { PlanejamentoDocumento } = await import('@/entities/all');
                return await retryWithExtendedBackoff(() => PlanejamentoDocumento.filter({ empreendimento_id: comercialId }), 'loadPlanejamentosDocumento');
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
          data = await retryWithExtendedBackoff(() => Pavimento.filter({ empreendimento_id: comercialId }), 'loadPavimentos');
          break;

        case 'atividades_projeto':
          data = await retryWithExtendedBackoff(() => Atividade.filter({ empreendimento_id: comercialId }), 'loadAtividadesProjeto');
          break;

        case 'catalogo_atividades':
            data = {};
            break;

        case 'documentacao':
          const [planejamentosAtiv, planejamentosDoc] = await Promise.all([
            retryWithExtendedBackoff(() => PlanejamentoAtividade.filter({ empreendimento_id: comercialId }), `load${tabName}Atividade`),
            (async () => {
              try {
                const { PlanejamentoDocumento } = await import('@/entities/all');
                return await retryWithExtendedBackoff(() => PlanejamentoDocumento.filter({ empreendimento_id: comercialId }), `load${tabName}Documento`);
              } catch {
                return [];
              }
            })()
          ]);

          data = [...(planejamentosAtiv || []), ...(planejamentosDoc || [])];
          break;

        case 'gestao':
            data = {};
            break;
        default:
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
  }, [comercialId, tabData]);

  const handleTabChange = useCallback((newTab) => {
    setActiveTab(newTab);

    if (!sharedData.loaded && !sharedData.loading) {
      loadSharedData();
    }

    if (newTab !== 'gestao' && !tabData[newTab]?.loaded && !tabData[newTab]?.loading) {
      loadTabData(newTab);
    }

    if (newTab === 'atividades_projeto' && !tabData.documentos.loaded && !tabData.documentos.loading) {
      loadTabData('documentos');
    }

    if (newTab === 'documentos' && !tabData.pavimentos.loaded && !tabData.pavimentos.loading) {
      loadTabData('pavimentos');
    }

    if (newTab === 'documentacao') {
      if (!tabData.documentos.loaded && !tabData.documentos.loading) {
        loadTabData('documentos');
      }
      if (!tabData.pavimentos.loaded && !tabData.pavimentos.loading) {
        loadTabData('pavimentos');
      }
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
      catalogo_atividades: { data: [], loaded: false, loading: false },
      documentacao: { data: [], loaded: false, loading: false },
      gestao: { data: [], loaded: false, loading: false }
    });
    setSharedData(prev => ({ ...prev, loaded: false }));
    loadComercial();
    handleTabChange(activeTab || 'documentos');
  }, [activeTab, loadComercial, handleTabChange]);

  useEffect(() => {
    loadComercial();
  }, [loadComercial]);

  useEffect(() => {
    if (comercial) {
        handleTabChange(activeTab);
    }
  }, [comercial, activeTab, handleTabChange]);

  if (isLoadingComercial) {
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
          <Link to={createPageUrl("Comercial")}>
            <Button variant="outline" className="mr-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Comercial
            </Button>
          </Link>
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
        <Link to={createPageUrl("Comercial")}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Comercial
          </Button>
        </Link>

        <EmpreendimentoHeader empreendimento={comercial} />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className={`grid w-full ${hasAccessToGestao ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'} bg-white shadow-sm`}>
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="pavimentos">Pavimentos</TabsTrigger>
            <TabsTrigger value="atividades_projeto">Atividades do Projeto</TabsTrigger>
            <TabsTrigger value="catalogo_atividades">
              <ListChecks className="w-4 h-4 mr-2" /> Catálogo
            </TabsTrigger>
            <TabsTrigger value="documentacao">Documentação</TabsTrigger>
            {hasAccessToGestao && (
              <TabsTrigger value="gestao">Gestão</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="catalogo_atividades">
             <AnaliticoGlobalTab
                empreendimentoId={comercial?.id}
                onUpdate={forceFullReload}
              />
          </TabsContent>

          <TabsContent value="documentos">
            {tabData.documentos.loading || sharedData.loading || tabData.pavimentos.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando documentos...</p>
              </div>
            ) : tabData.documentos.loaded && sharedData.loaded && tabData.pavimentos.loaded ? (
              <DocumentosTab
                empreendimento={comercial}
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
                empreendimentoId={comercial?.id}
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
            {tabData.atividades_projeto.loading || sharedData.loading || tabData.documentos.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando atividades...</p>
              </div>
            ) : tabData.atividades_projeto.loaded && sharedData.loaded && tabData.documentos.loaded ? (
              <AtividadesProjetoTab
                empreendimentoId={comercial?.id}
                atividades={tabData.atividades_projeto.data}
                disciplinas={sharedData.disciplinas}
                documentos={tabData.documentos.data.documentos || []}
                usuarios={sharedData.usuarios}
                planejamentos={tabData.documentos.data.planejamentos || []}
                etapasEmpreendimento={comercial?.etapas || []}
                onUpdate={() => {
                  setTabData(prev => ({
                    ...prev,
                    atividades_projeto: { ...prev.atividades_projeto, loaded: false },
                    documentos: { ...prev.documentos, loaded: false }
                  }));
                  loadTabData('atividades_projeto');
                  loadTabData('documentos');
                }}
                isLoading={false}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="documentacao">
            {tabData.documentacao.loading || sharedData.loading || tabData.documentos.loading || tabData.pavimentos.loading ? (
              <div className="flex flex-col items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
                <p className="text-gray-600">Carregando documentação...</p>
              </div>
            ) : tabData.documentacao.loaded && sharedData.loaded && tabData.documentos.loaded && tabData.pavimentos.loaded ? (
              <AnaliseConcepcaoPlanejamentoTab
                empreendimentoId={comercial?.id}
                planejamentos={tabData.documentacao.data}
                atividades={sharedData.atividades || []}
                usuarios={sharedData.usuarios}
                documentos={tabData.documentos.data.documentos || []}
                pavimentos={tabData.pavimentos.data || []}
                onUpdate={() => {
                  setTabData(prev => ({
                    ...prev,
                    documentacao: { ...prev.documentacao, loaded: false }
                  }));
                  loadTabData('documentacao');
                }}
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
                  empreendimento={comercial}
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