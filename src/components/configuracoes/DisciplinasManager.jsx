import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { Disciplina } from "@/entities/all";
import { motion, AnimatePresence } from "framer-motion";

const cores = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
  "#06B6D4", "#84CC16", "#F97316", "#EC4899", "#6366F1"
];

export default function DisciplinasManager({ disciplinas, onUpdate, isLoading }) {
  const [showForm, setShowForm] = useState(false);
  const [editingDisciplina, setEditingDisciplina] = useState(null);
  const [formData, setFormData] = useState({
    nome: "",
    cor: cores[0],
    icone: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editingDisciplina) {
      await Disciplina.update(editingDisciplina.id, formData);
    } else {
      await Disciplina.create(formData);
    }
    resetForm();
    onUpdate();
  };

  const handleEdit = (disciplina) => {
    setEditingDisciplina(disciplina);
    setFormData({
      nome: disciplina.nome,
      cor: disciplina.cor || cores[0],
      icone: disciplina.icone || ""
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (confirm("Tem certeza que deseja excluir esta disciplina?")) {
      await Disciplina.delete(id);
      onUpdate();
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingDisciplina(null);
    setFormData({ nome: "", cor: cores[0], icone: "" });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white border-0 shadow-lg">
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold">Gerenciar Disciplinas</CardTitle>
            <Button onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Nova Disciplina
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50"
              >
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="nome">Nome da Disciplina</Label>
                      <Input
                        id="nome"
                        value={formData.nome}
                        onChange={(e) => setFormData({...formData, nome: e.target.value})}
                        placeholder="Ex: Elétrica, Hidráulica..."
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Cor Identificadora</Label>
                      <div className="flex gap-2 flex-wrap">
                        {cores.map((cor) => (
                          <button
                            key={cor}
                            type="button"
                            onClick={() => setFormData({...formData, cor})}
                            className={`w-8 h-8 rounded-full border-2 ${
                              formData.cor === cor ? 'border-gray-800' : 'border-gray-300'
                            }`}
                            style={{ backgroundColor: cor }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={resetForm}>
                      <X className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                    <Button type="submit" className="bg-green-600 hover:bg-green-700">
                      <Save className="w-4 h-4 mr-2" />
                      Salvar
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-4">Carregando disciplinas...</div>
            ) : disciplinas && disciplinas.length > 0 ? (
              disciplinas.map((disciplina) => (
                <div key={disciplina.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: disciplina.cor || cores[0] }}
                    />
                    <span className="font-medium">{disciplina.nome}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(disciplina)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(disciplina.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500">Nenhuma disciplina cadastrada</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}