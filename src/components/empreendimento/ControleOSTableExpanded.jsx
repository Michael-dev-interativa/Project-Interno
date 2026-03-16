import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_COLORS = {
  "NA": "bg-gray-100 text-gray-800",
  "Concluído": "bg-green-100 text-green-800",
  "Pendente": "bg-red-100 text-red-800",
  "Em andamento": "bg-yellow-100 text-yellow-800",
  "Hold": "bg-orange-100 text-orange-800",
  "Paralisado": "bg-orange-200 text-orange-900",
  "Técnico": "bg-blue-100 text-blue-800",
  "Ag. Liberação": "bg-cyan-100 text-cyan-800",
  "Finalizado": "bg-purple-100 text-purple-800",
  "Em aprovação": "bg-yellow-200 text-yellow-900"
};

const StatusBadge = ({ status }) => {
  const color = STATUS_COLORS[status] || "bg-gray-100 text-gray-800";
  return <span className={`px-2 py-1 rounded text-xs font-medium ${color}`}>{status}</span>;
};

const ExpandedDetails = ({ controle }) => {
  return (
    <div className="bg-gray-50 p-6 border-t border-gray-300">
      <Tabs defaultValue="planejamento" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="planejamento" className="text-xs">Planejamento</TabsTrigger>
          <TabsTrigger value="art" className="text-xs">ART</TabsTrigger>
          <TabsTrigger value="concessionarias" className="text-xs">Concessionárias</TabsTrigger>
          <TabsTrigger value="monitoramento" className="text-xs">Monitoramento</TabsTrigger>
          <TabsTrigger value="geral" className="text-xs">Gestão Geral</TabsTrigger>
        </TabsList>

        {/* Planejamento */}
        <TabsContent value="planejamento" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {/* Hidráulica */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">Hidráulica</h4>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs text-gray-600">Concepção:</span><StatusBadge status={controle.planejamento?.hidraulica?.concepcao || 'NA'} /></div>
                <div className="flex justify-between"><span className="text-xs text-gray-600">Cálculo:</span><StatusBadge status={controle.planejamento?.hidraulica?.calculo || 'NA'} /></div>
                <div className="flex justify-between"><span className="text-xs text-gray-600">Diagrama:</span><StatusBadge status={controle.planejamento?.hidraulica?.diagrama || 'NA'} /></div>
              </div>
            </div>

            {/* Elétrica */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">Elétrica</h4>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs text-gray-600">Concepção:</span><StatusBadge status={controle.planejamento?.eletrica?.concepcao || 'NA'} /></div>
                <div className="flex justify-between"><span className="text-xs text-gray-600">Cálculo:</span><StatusBadge status={controle.planejamento?.eletrica?.calculo || 'NA'} /></div>
                <div className="flex justify-between"><span className="text-xs text-gray-600">Diagrama:</span><StatusBadge status={controle.planejamento?.eletrica?.diagrama || 'NA'} /></div>
              </div>
            </div>

            {/* Incêndio */}
            <div>
              <h4 className="font-semibold text-gray-800 mb-2">Incêndio</h4>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-xs text-gray-600">Concepção:</span><StatusBadge status={controle.planejamento?.incendio?.concepcao || 'NA'} /></div>
                <div className="flex justify-between"><span className="text-xs text-gray-600">Cálculo:</span><StatusBadge status={controle.planejamento?.incendio?.calculo || 'NA'} /></div>
                <div className="flex justify-between"><span className="text-xs text-gray-600">Diagrama:</span><StatusBadge status={controle.planejamento?.incendio?.diagrama || 'NA'} /></div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ART */}
        <TabsContent value="art" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><span className="text-xs text-gray-600 block mb-1">EE/AIS:</span><StatusBadge status={controle.art_ee_ais || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">HID/IN:</span><StatusBadge status={controle.art_hid_in || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">HVAC:</span><StatusBadge status={controle.art_hvac || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">BOMB:</span><StatusBadge status={controle.art_bomb || 'NA'} /></div>
          </div>
        </TabsContent>

        {/* Concessionárias */}
        <TabsContent value="concessionarias" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><span className="text-xs text-gray-600 block mb-1">Telefonia:</span><StatusBadge status={controle.conc_telefonia || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Gás:</span><StatusBadge status={controle.conc_gas || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Elétrica:</span><StatusBadge status={controle.conc_eletrica || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Hidráulica:</span><StatusBadge status={controle.conc_hidraulica || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Água Pluvial:</span><StatusBadge status={controle.conc_agua_pluvial || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Incêndio:</span><StatusBadge status={controle.conc_incendio || 'NA'} /></div>
          </div>
        </TabsContent>

        {/* Monitoramento */}
        <TabsContent value="monitoramento" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><span className="text-xs text-gray-600 block mb-1">Briefing:</span><StatusBadge status={controle.monitoramento?.briefing || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Cronograma:</span><StatusBadge status={controle.monitoramento?.cronograma || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">LMD:</span><StatusBadge status={controle.monitoramento?.lmd || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Entregas x Etapas:</span><StatusBadge status={controle.monitoramento?.entregas_x_etapas || 'NA'} /></div>
          </div>
        </TabsContent>

        {/* Gestão Geral */}
        <TabsContent value="geral" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><span className="text-xs text-gray-600 block mb-1">Gestão:</span><span className="text-xs font-medium">{controle.gestao || 'NA'}</span></div>
            <div><span className="text-xs text-gray-600 block mb-1">Formalização:</span><span className="text-xs font-medium">{controle.formalizacao || '-'}</span></div>
            <div><span className="text-xs text-gray-600 block mb-1">Abertura OS:</span><StatusBadge status={controle.abertura_os_servidor || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Ativ. Planejamento:</span><StatusBadge status={controle.atividades_planejamento || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Kickoff:</span><StatusBadge status={controle.kickoff_cliente || 'NA'} /></div>
            <div><span className="text-xs text-gray-600 block mb-1">Cronograma:</span><StatusBadge status={controle.cronograma || 'NA'} /></div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default function ControleOSTableExpanded({ controles = [] }) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div className="space-y-2">
      {controles.map((controle) => (
        <div key={controle.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          {/* Linha Principal */}
          <button
            onClick={() => setExpandedId(expandedId === controle.id ? null : controle.id)}
            className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
          >
            <div className={`flex-shrink-0 ${expandedId === controle.id ? 'text-blue-600' : 'text-gray-400'}`}>
              {expandedId === controle.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-gray-900 mb-1">{controle.projeto || 'N/A'}</h3>
              <p className="text-xs text-gray-500">OS: {controle.os || '-'}</p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={controle.cronograma || 'NA'} />
              <StatusBadge status={controle.markup || 'NA'} />
            </div>
          </button>

          {/* Detalhes Expandidos */}
          {expandedId === controle.id && <ExpandedDetails controle={controle} />}
        </div>
      ))}
    </div>
  );
}