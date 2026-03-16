import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, Loader2, Search, Trash2 } from 'lucide-react';
import ChecklistHeader from '@/components/checklist/ChecklistHeader';
import ChecklistTable from '@/components/checklist/ChecklistTable';
import NovoChecklistModal from '@/components/checklist/NovoChecklistModal';
import NovaSecaoModal from '@/components/checklist/NovaSecaoModal';

export default function ChecklistPlanejamentoPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [showNovoModal, setShowNovoModal] = useState(false);
  const [showNovaSecaoModal, setShowNovaSecaoModal] = useState(false);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadEmpreendimentos = async () => {
      const emps = await base44.entities.Empreendimento.list();
      setEmpreendimentos(emps || []);
    };
    loadEmpreendimentos();
  }, []);

  const { data: checklists = [], isLoading } = useQuery({
    queryKey: ['checklists'],
    queryFn: async () => {
      const data = await base44.entities.ChecklistPlanejamento.list();
      return data || [];
    }
  });

  const { data: items = [] } = useQuery({
    queryKey: ['checklist-items', selectedChecklist?.id],
    queryFn: async () => {
      if (!selectedChecklist?.id) return [];
      const data = await base44.entities.ChecklistItem.filter({
        checklist_id: selectedChecklist.id
      });
      return data || [];
    },
    enabled: !!selectedChecklist?.id
  });

  const handleChecklistCreated = async () => {
    await queryClient.invalidateQueries(['checklists']);
    setShowNovoModal(false);
  };

  const handleItemsUpdated = async () => {
    await queryClient.invalidateQueries(['checklist-items', selectedChecklist?.id]);
  };

  const handleSecaoCreated = async () => {
    await queryClient.invalidateQueries(['checklist-items', selectedChecklist?.id]);
    setShowNovaSecaoModal(false);
  };

  const handleDeleteChecklist = async () => {
    if (!selectedChecklist) return;
    
    if (!window.confirm(`Tem certeza que deseja excluir o checklist "${selectedChecklist.tipo}" e todos os seus itens?`)) return;
    
    try {
      // Excluir todos os itens primeiro
      for (const item of items) {
        await base44.entities.ChecklistItem.delete(item.id);
      }
      // Excluir o checklist
      await base44.entities.ChecklistPlanejamento.delete(selectedChecklist.id);
      
      setSelectedChecklist(null);
      await queryClient.invalidateQueries(['checklists']);
    } catch (error) {
      console.error('Erro ao excluir checklist:', error);
      alert('Erro ao excluir checklist');
    }
  };

  const handleLimparItens = async () => {
    if (!selectedChecklist) return;
    
    if (!window.confirm(`Tem certeza que deseja excluir todos os itens deste checklist?`)) return;
    
    try {
      // Excluir todos os itens
      for (const item of items) {
        await base44.entities.ChecklistItem.delete(item.id);
      }
      
      await queryClient.invalidateQueries(['checklist-items', selectedChecklist?.id]);
    } catch (error) {
      console.error('Erro ao excluir itens:', error);
      alert('Erro ao excluir itens');
    }
  };

  const filteredChecklists = checklists.filter(c =>
    c.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.tipo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.numero_os?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const itemsPorSecao = items
    .reduce((acc, item) => {
       if (!acc[item.secao]) {
         acc[item.secao] = [];
       }
       acc[item.secao].push(item);
       return acc;
     }, {});

  Object.keys(itemsPorSecao).forEach(secao => {
    itemsPorSecao[secao].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1800px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Checklist de Planejamento</h1>
            <p className="text-gray-600 mt-1">Gerencie checklists de planejamento por projeto</p>
          </div>
          <div className="flex gap-2">
            {selectedChecklist && (
              <>
                <Button
                  onClick={handleLimparItens}
                  variant="outline"
                >
                  Limpar Itens
                </Button>
                <Button
                  onClick={handleDeleteChecklist}
                  variant="destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir Checklist
                </Button>
              </>
            )}
            <Button
              onClick={() => setShowNovoModal(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Checklist
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Lista de Checklists */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Checklists</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : filteredChecklists.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Nenhum checklist encontrado</p>
                </div>
              ) : (
                filteredChecklists.map((checklist) => (
                  <button
                    key={checklist.id}
                    onClick={() => setSelectedChecklist(checklist)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedChecklist?.id === checklist.id
                        ? 'bg-blue-50 border-blue-500'
                        : 'bg-white border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{checklist.tipo}</div>
                    <div className="text-xs text-gray-600 mt-1">{checklist.cliente}</div>
                    {checklist.numero_os && (
                      <div className="text-xs text-gray-500 mt-1">OS: {checklist.numero_os}</div>
                    )}
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Área do Checklist Selecionado */}
          <div className="lg:col-span-3">
            {selectedChecklist ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <ChecklistHeader
                      checklist={selectedChecklist}
                      onUpdate={handleItemsUpdated}
                      empreendimentos={empreendimentos}
                    />
                  </div>
                  <Button
                    onClick={() => setShowNovaSecaoModal(true)}
                    variant="outline"
                    className="ml-4"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Seção/Tabela
                  </Button>
                </div>

                {Object.keys(itemsPorSecao).length > 0 ? (
                  Object.entries(itemsPorSecao).map(([secao, secaoItems]) => (
                    <ChecklistTable
                      key={secao}
                      secao={secao}
                      items={secaoItems}
                      checklist={selectedChecklist}
                      onUpdate={handleItemsUpdated}
                    />
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-gray-600 mb-4">Nenhum item adicionado ainda</p>
                      <p className="text-sm text-gray-500">
                        Clique em "Adicionar Item" na seção desejada para começar
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="h-[600px] flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <FileText className="w-20 h-20 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Selecione um checklist</p>
                  <p className="text-sm mt-2">Escolha um checklist da lista ao lado para visualizar</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {showNovoModal && (
        <NovoChecklistModal
          isOpen={showNovoModal}
          onClose={() => setShowNovoModal(false)}
          onSuccess={handleChecklistCreated}
          empreendimentos={empreendimentos}
        />
      )}

      {showNovaSecaoModal && selectedChecklist && (
        <NovaSecaoModal
          isOpen={showNovaSecaoModal}
          onClose={() => setShowNovaSecaoModal(false)}
          onSuccess={handleSecaoCreated}
          checklistId={selectedChecklist.id}
          tipoChecklist={selectedChecklist.tipo}
        />
      )}
    </div>
  );
}