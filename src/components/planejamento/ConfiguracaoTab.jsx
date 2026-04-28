
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Clock, Calendar, Users, Zap } from "lucide-react";
import { Empreendimento } from "@/entities/all"; // Importar a entidade Empreendimento

export default function ConfiguracaoTab({ empreendimentoId }) { // Prop simplificada
  const [empreendimento, setEmpreendimento] = useState(null);
  const [config, setConfig] = useState({
    horasPorDia: 8,
    incluirFinsDeSemana: false,
    horasSemanais: 40,
    diasTrabalho: 5,
    autoAjustarPrazos: true,
    notificarAtrasos: true,
    margeMSeguranca: 10 // percentual
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingEmpreendimento, setIsFetchingEmpreendimento] = useState(true);

  useEffect(() => {
    if (empreendimentoId) {
      setIsFetchingEmpreendimento(true);
      
      Empreendimento.list() // Usar a entidade Empreendimento para buscar
        .then(data => {
          const currentEmp = data.find(e => e.id === empreendimentoId);
          setEmpreendimento(currentEmp || null);
          // Opcional: Carregar configurações existentes para este empreendimento
          // if (currentEmp && currentEmp.configuracoes) {
          //   setConfig(prev => ({ ...prev, ...currentEmp.configuracoes }));
          // }
        })
        .catch(err => {
          console.error("Erro ao buscar empreendimento", err); // Mensagem de erro atualizada
          setEmpreendimento(null);
        })
        .finally(() => setIsFetchingEmpreendimento(false));
    } else {
      setIsFetchingEmpreendimento(false); // No empreendimentoId, nada para buscar
      setEmpreendimento(null);
    }
  }, [empreendimentoId]); // Remover fetchEmpreendimentos do array de dependências

  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Aqui você salvaria as configurações no banco de dados, associadas ao empreendimentoId
      // Por exemplo, em uma entidade ConfiguracaoPlanejamento
      
      // Simular delay de salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert("Configurações salvas com sucesso!");
      // Não é necessário onRefresh, pois a aba é autônoma
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      alert("Erro ao salvar configurações. Tente novamente.");
    }
    setIsLoading(false);
  };

  const handleConfigChange = (key, value) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  if (isFetchingEmpreendimento) {
      return (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-gray-500">Carregando configurações...</p>
        </div>
      );
  }

  // Opcional: Renderizar algo diferente se não houver empreendimentoId ou o empreendimento não for encontrado
  if (!empreendimentoId || !empreendimento) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500">Nenhum empreendimento selecionado ou encontrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configurações de Trabalho */}
      <Card className="bg-white border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Configurações de Jornada de Trabalho {empreendimento?.nome ? `para ${empreendimento.nome}` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="horasPorDia">Horas por Dia</Label>
              <Input
                id="horasPorDia"
                type="number"
                step="0.5"
                value={config.horasPorDia}
                onChange={(e) => handleConfigChange('horasPorDia', parseFloat(e.target.value))}
              />
              <p className="text-xs text-gray-500">
                Quantas horas de trabalho por dia útil
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="horasSemanais">Horas Semanais</Label>
              <Input
                id="horasSemanais"
                type="number"
                value={config.horasSemanais}
                onChange={(e) => handleConfigChange('horasSemanais', parseInt(e.target.value))}
              />
              <p className="text-xs text-gray-500">
                Total de horas trabalhadas por semana
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diasTrabalho">Dias de Trabalho por Semana</Label>
              <Input
                id="diasTrabalho"
                type="number"
                min="1"
                max="7"
                value={config.diasTrabalho}
                onChange={(e) => handleConfigChange('diasTrabalho', parseInt(e.target.value))}
              />
              <p className="text-xs text-gray-500">
                Quantos dias por semana são trabalhados
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="margem">Margem de Segurança (%)</Label>
              <Input
                id="margem"
                type="number"
                min="0"
                max="50"
                value={config.margeMSeguranca}
                onChange={(e) => handleConfigChange('margeMSeguranca', parseInt(e.target.value))}
              />
              <p className="text-xs text-gray-500">
                Percentual adicional para prazos
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Incluir Fins de Semana</h4>
                <p className="text-sm text-gray-500">
                  Permitir planejamento de atividades em sábados e domingos
                </p>
              </div>
              <Switch
                checked={config.incluirFinsDeSemana}
                onCheckedChange={(value) => handleConfigChange('incluirFinsDeSemana', value)}
              />
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Auto-ajustar Prazos</h4>
                <p className="text-sm text-gray-500">
                  Ajustar automaticamente os prazos quando houver alterações
                </p>
              </div>
              <Switch
                checked={config.autoAjustarPrazos}
                onCheckedChange={(value) => handleConfigChange('autoAjustarPrazos', value)}
              />
            </div>

            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <h4 className="font-medium text-gray-900">Notificar Atrasos</h4>
                <p className="text-sm text-gray-500">
                  Enviar notificações quando atividades estiverem atrasadas
                </p>
              </div>
              <Switch
                checked={config.notificarAtrasos}
                onCheckedChange={(value) => handleConfigChange('notificarAtrasos', value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo das Configurações */}
      <Card className="bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-blue-800">Resumo das Configurações</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span><strong>{config.horasPorDia}h</strong> por dia</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span><strong>{config.diasTrabalho}</strong> dias/semana</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span><strong>+{config.margeMSeguranca}%</strong> margem</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botão de Salvar */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {isLoading ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
