import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pavimento } from "@/entities/all";
import { Plus, Edit, Trash2 } from "lucide-react";

export default function PavimentosTab({ empreendimentoId, onUpdate }) {
  const [pavimentos, setPavimentos] = useState([]);
  const [formData, setFormData] = useState({ nome: '', area: '', escala: '' });
  const [editingPavimento, setEditingPavimento] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchPavimentos = async () => {
    try {
      const data = await Pavimento.filter({ empreendimento_id: empreendimentoId });
      setPavimentos(data || []);
    } catch (error) {
      console.error("Erro ao buscar pavimentos:", error);
      setPavimentos([]);
    }
  };

  useEffect(() => {
    if (empreendimentoId) {
      fetchPavimentos();
    }
  }, [empreendimentoId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nome) {
      alert("Por favor, preencha o nome do pavimento.");
      return;
    }

    // Área é opcional - converter para número ou null
    const areaFinal = formData.area ? parseFloat(formData.area) : null;
    
    if (formData.area && (isNaN(areaFinal) || areaFinal <= 0)) {
      alert("Por favor, preencha uma área válida em m².");
      return;
    }

    try {
      const pavimentoData = {
        nome: formData.nome,
        area: areaFinal,
        escala: formData.escala || null, // Escala é opcional
        empreendimento_id: empreendimentoId
      };

      if (editingPavimento) {
        await Pavimento.update(editingPavimento.id, pavimentoData);
      } else {
        await Pavimento.create(pavimentoData);
      }

      setFormData({ nome: '', area: '', escala: '' });
      setEditingPavimento(null);
      setShowForm(false);
      fetchPavimentos();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Erro ao salvar pavimento:", error);
      alert("Erro ao salvar pavimento. Tente novamente.");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este pavimento?')) return;
    
    try {
      await Pavimento.delete(id);
      fetchPavimentos();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Erro ao excluir pavimento:", error);
      alert("Erro ao excluir pavimento. Tente novamente.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerenciar Pavimentos</CardTitle>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-8">
        <div>
          <h3 className="font-semibold mb-4 text-lg">
            {editingPavimento ? 'Editar Pavimento' : 'Adicionar Novo Pavimento'}
          </h3>
          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome do Pavimento</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Térreo, 1º Pavimento, Subsolo"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="area">Área (m²) (Opcional)</Label>
                <Input
                  id="area"
                  type="number"
                  step="0.01"
                  placeholder="Ex: 150.50"
                  value={formData.area}
                  onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Digite a área real do pavimento em metros quadrados
                </p>
              </div>
              <div>
                <Label htmlFor="escala">Escala (Opcional)</Label>
                <Input
                  id="escala"
                  type="text"
                  placeholder="Ex: 1:125"
                  value={formData.escala}
                  onChange={(e) => setFormData({ ...formData, escala: e.target.value })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Escala do desenho original (apenas para referência)
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="submit">
                  <Plus className="w-4 h-4 mr-2" />
                  {editingPavimento ? 'Salvar Alterações' : 'Adicionar Pavimento'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowForm(false);
                    setEditingPavimento(null);
                    setFormData({ nome: '', area: '', escala: '' });
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          )}
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Pavimento
            </Button>
          )}
        </div>
        <div>
          <h3 className="font-semibold mb-4 text-lg">Lista de Pavimentos</h3>
          <div className="space-y-2">
            {pavimentos.map(pav => {
              const area = Number(pav.area);
              const areaFormatada = area % 1 === 0 ? area.toFixed(0) : area.toFixed(2);
              const displayText = pav.escala ? `${areaFormatada} m² (Escala: ${pav.escala})` : `${areaFormatada} m²`;
              
              return (
                <div key={pav.id} className="flex justify-between items-center p-3 border rounded-md bg-white hover:bg-gray-50 transition-colors">
                  <div>
                    <p className="font-medium">{pav.nome}</p>
                    <p className="text-sm text-gray-500">{displayText}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        setEditingPavimento(pav);
                        setFormData({ 
                          nome: pav.nome, 
                          area: String(pav.area),
                          escala: pav.escala || ''
                        });
                        setShowForm(true);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(pav.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {pavimentos.length === 0 && (
              <p className="text-gray-500 text-center py-8">
                Nenhum pavimento cadastrado.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}