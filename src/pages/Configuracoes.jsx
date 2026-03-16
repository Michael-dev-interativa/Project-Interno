import React, { useState, useEffect, useCallback, useContext } from "react";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disciplina, AtividadeGenerica } from "@/entities/all";
import { ActivityTimerContext } from "@/components/contexts/ActivityTimerContext";
import { createPageUrl } from "@/utils";

import DisciplinasManager from "../components/configuracoes/DisciplinasManager";
import AtividadesManager from "../components/configuracoes/AtividadesManager";
import AtividadeFuncaoManager from "../components/configuracoes/AtividadeFuncaoManager";
import EquipesManager from "../components/configuracoes/EquipesManager";

export default function ConfiguracoesPage() {
  const { isAdmin } = useContext(ActivityTimerContext);
  const [disciplinas, setDisciplinas] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // A aba de catalogo deve carregar apenas atividades genericas (sem empreendimento_id).
      const [disciplinasData, atividadesData] = await Promise.all([
        Disciplina.list(),
        AtividadeGenerica.list(null, 5000)
      ]);
      setDisciplinas(disciplinasData || []);
      setAtividades(atividadesData || []);
    } catch (error) {
      console.error("Erro ao buscar dados de configuração:", error);
      setDisciplinas([]);
      setAtividades([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setDisciplinas([]);
      setAtividades([]);
      setIsLoading(false);
      return;
    }

    fetchData();
  }, [fetchData, isAdmin]);

  if (!isAdmin) {
    return <Navigate to={createPageUrl("Dashboard")} replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="p-6 md:p-8 space-y-8">
        <h1 className="text-3xl font-bold text-gray-900">Configurações Gerais</h1>
        <Tabs defaultValue="disciplinas" className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="disciplinas">Disciplinas</TabsTrigger>
            <TabsTrigger value="atividades">Catálogo de Atividades</TabsTrigger>
            <TabsTrigger value="atividades_funcao">Atividades por Departamento</TabsTrigger>
            <TabsTrigger value="equipes">Equipes</TabsTrigger>
          </TabsList>
          <TabsContent value="disciplinas" className="mt-6">
            <DisciplinasManager
              disciplinas={disciplinas}
              isLoading={isLoading}
              onUpdate={fetchData}
            />
          </TabsContent>
          <TabsContent value="atividades" className="mt-6">
            <AtividadesManager
              atividades={atividades}
              disciplinas={disciplinas}
              isLoading={isLoading}
              onUpdate={fetchData}
            />
          </TabsContent>
          <TabsContent value="atividades_funcao" className="mt-6">
            <AtividadeFuncaoManager />
          </TabsContent>
          <TabsContent value="equipes" className="mt-6">
            <EquipesManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}