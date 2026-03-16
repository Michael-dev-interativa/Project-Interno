import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Search, Loader2, Building2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ControleOSSpreadsheet from "../components/empreendimento/ControleOSSpreadsheet";

const getStatusColor = (status) => {
  const colors = {
    "NA": "bg-gray-200 text-gray-800",
    "Concluído": "bg-green-200 text-green-800",
    "Pendente": "bg-red-200 text-red-800",
    "Em andamento": "bg-yellow-200 text-yellow-800",
    "Hold": "bg-orange-200 text-orange-800",
    "Paralisado": "bg-orange-300 text-orange-900",
    "Técnico": "bg-blue-200 text-blue-800",
    "Ag. Liberação": "bg-cyan-200 text-cyan-800",
    "Finalizado": "bg-purple-200 text-purple-800",
    "Em aprovação": "bg-yellow-300 text-yellow-900"
  };
  return colors[status] || "bg-gray-200 text-gray-800";
};

export default function ControleOSGlobal() {
  const [controlesOS, setControlesOS] = useState([]);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activePasta, setActivePasta] = useState('todas');

  const pastas = [
    { id: 'todas', label: 'Todas' },
    { id: 'projeto', label: 'Projeto' },
    { id: 'art', label: 'ART' },
    { id: 'concessionarias', label: 'Concessionárias' },
    { id: 'monitoramento', label: 'Monitoramento' },
    { id: 'hidraulica', label: 'Hidráulica' },
    { id: 'eletrica', label: 'Elétrica' },
    { id: 'incendio', label: 'Incêndio' },
    { id: 'sistemas', label: 'Sistemas Eletrônicos' },
    { id: 'ar', label: 'Ar Condicionado' },
    { id: 'memorial', label: 'Memorial' },
    { id: 'esptec', label: 'Esp. Tec.' },
    { id: 'markup', label: 'Mark-Up' }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [controles, emps] = await Promise.all([
        base44.entities.ControleOS.list(),
        base44.entities.Empreendimento.list()
      ]);

      setControlesOS(controles || []);
      setEmpreendimentos(emps || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateControle = async (empreendimentoId, field, value) => {
    try {
      const buildUpdateData = (baseControle, targetField, targetValue) => {
        // Verificar se é um campo de planejamento
        if (targetField.startsWith('planejamento_')) {
          let disciplinaKey;
          let subField;
          const fieldWithoutPrefix = targetField.replace('planejamento_', '');

          // Verificar se começa com disciplinas compostas
          if (fieldWithoutPrefix.startsWith('ar_condicionado_')) {
            disciplinaKey = 'ar_condicionado';
            subField = fieldWithoutPrefix.replace('ar_condicionado_', '');
          } else if (fieldWithoutPrefix.startsWith('sistemas_eletronicos_')) {
            disciplinaKey = 'sistemas_eletronicos';
            subField = fieldWithoutPrefix.replace('sistemas_eletronicos_', '');
          } else {
            const parts = fieldWithoutPrefix.split('_');
            const disciplina = parts[0];
            subField = parts.slice(1).join('_');

            const disciplinaMap = {
              'hidraulica': 'hidraulica',
              'eletrica': 'eletrica',
              'incendio': 'incendio',
              'memorial': 'memorial'
            };

            disciplinaKey = disciplinaMap[disciplina] || disciplina;
          }

          return {
            planejamento: {
              ...(baseControle?.planejamento || {}),
              [disciplinaKey]: {
                ...(baseControle?.planejamento?.[disciplinaKey] || {}),
                [subField]: targetValue
              }
            }
          };
        }

        // Verificar se é um campo de monitoramento
        if (targetField.startsWith('monitoramento_')) {
          const subField = targetField.replace('monitoramento_', '');
          return {
            monitoramento: {
              ...(baseControle?.monitoramento || {}),
              [subField]: targetValue
            }
          };
        }

        // Campo simples
        return { [targetField]: targetValue };
      };

      // Encontrar o controle sempre por empreendimento_id para evitar colisão com id de controle_os
      let controle = controlesOS.find(c => String(c.empreendimento_id) === String(empreendimentoId));

      // Se não existe controle (empreendimento sem controle OS), criar um novo
      if (!controle) {
        const empreendimento = empreendimentos.find(e => String(e.id) === String(empreendimentoId));
        if (!empreendimento) return;

        const updateData = buildUpdateData({}, field, value);

        const novoControle = await base44.entities.ControleOS.create({
          empreendimento_id: empreendimentoId,
          os: empreendimento.os || '',
          ...updateData
        });

        setControlesOS(prev => [...prev, novoControle]);
        return;
      }

      const updateData = buildUpdateData(controle, field, value);

      await base44.entities.ControleOS.update(controle.id, updateData);

      // Atualizar estado local
      setControlesOS(prev =>
        prev.map(c => {
          if (String(c.empreendimento_id) === String(empreendimentoId)) {
            return { ...c, ...updateData };
          }
          return c;
        })
      );
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      alert('Erro ao salvar alteração');
    }
  };

  const empreendimentosMap = empreendimentos.reduce((acc, emp) => {
    acc[emp.id] = emp;
    return acc;
  }, {});

  const filteredControles = controlesOS.filter(controle => {
    const emp = empreendimentosMap[controle.empreendimento_id];
    const searchLower = searchTerm.toLowerCase();
    return (
      emp?.nome?.toLowerCase().includes(searchLower) ||
      emp?.cliente?.toLowerCase().includes(searchLower) ||
      controle.os?.toLowerCase().includes(searchLower)
    );
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-blue-600" />
              Controle de OS - Todos os Empreendimentos
            </CardTitle>
            <Badge variant="secondary" className="text-lg">
              {filteredControles.length} {filteredControles.length === 1 ? 'empreendimento' : 'empreendimentos'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Buscar por empreendimento, cliente ou OS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Abas/Pastas */}
          <div className="mt-6 bg-white rounded-lg border border-gray-200 p-4">
            <Tabs value={activePasta} onValueChange={setActivePasta} className="w-full">
              <TabsList className="flex flex-wrap gap-2 h-auto p-0 bg-transparent">
                {pastas.map(pasta => (
                  <TabsTrigger
                    key={pasta.id}
                    value={pasta.id}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 data-[state=active]:bg-blue-50 data-[state=active]:border-blue-500 data-[state=active]:text-blue-700 hover:bg-gray-50"
                  >
                    {pasta.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {filteredControles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">
              {searchTerm ? 'Nenhum empreendimento encontrado' : 'Nenhum controle de OS cadastrado'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="p-0">
          <ControleOSSpreadsheet
            controlesOS={filteredControles}
            empreendimentos={empreendimentos}
            searchTerm={searchTerm}
            onUpdate={handleUpdateControle}
            editable={true}
            activePasta={activePasta}
          />
        </Card>
      )}
    </div>
  );
}