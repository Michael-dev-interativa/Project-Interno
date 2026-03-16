import { useContext } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Settings, BarChart3, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ActivityTimerContext } from '../contexts/ActivityTimerContext';

export default function QuickActions() {
  const { hasPermission, isAdmin } = useContext(ActivityTimerContext);

  const allActions = [
    {
      title: "Novo Empreendimento",
      description: "Criar um novo projeto",
      icon: Plus,
      url: createPageUrl("Empreendimentos"),
      color: "bg-blue-500 hover:bg-blue-600",
      requiredLevel: 'apoio',
    },
    {
      title: "Configurações",
      description: "Gerenciar disciplinas e atividades",
      icon: Settings,
      url: createPageUrl("Configuracoes"),
      color: "bg-purple-500 hover:bg-purple-600",
      isVisible: isAdmin,
    },
    {
      title: "Relatórios",
      description: "Visualizar relatórios e análises",
      icon: BarChart3,
      url: createPageUrl("Relatorios"),
      color: "bg-green-500 hover:bg-green-600",
      requiredLevel: 'coordenador',
    },
    {
      title: "Gerenciar Usuários",
      description: "Adicionar ou remover usuários",
      icon: Users,
      url: createPageUrl("Usuarios"),
      color: "bg-red-500 hover:bg-red-600",
      requiredLevel: 'lider',
    }
  ];

  const actions = allActions.filter((action) => {
    if (typeof action.isVisible === 'boolean') {
      return action.isVisible;
    }

    return hasPermission(action.requiredLevel);
  });

  return (
    <Card className="bg-white border-0 shadow-lg">
      <CardHeader className="border-b border-gray-100">
        <CardTitle className="text-xl font-bold text-gray-900">
          Ações Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-3">
          {actions.length > 0 ? (
            actions.map((action, index) => (
              <Link key={index} to={action.url}>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto p-4 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                >
                  <div className={`p-2 rounded-lg ${action.color} mr-3`}>
                    <action.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-gray-900">{action.title}</div>
                    <div className="text-sm text-gray-500">{action.description}</div>
                  </div>
                </Button>
              </Link>
            ))
          ) : (
            <div className="text-center text-gray-500 text-sm py-4">
              Nenhuma ação rápida disponível para o seu perfil.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}