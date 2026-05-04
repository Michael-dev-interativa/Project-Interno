import React, { useState, useEffect, useCallback } from 'react';
import { Equipe, Usuario } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Users, 
  Loader2,
  UserPlus,
  X
} from "lucide-react";
import { retryWithBackoff } from '../utils/apiUtils';

export default function EquipesManager() {
  const [equipes, setEquipes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState(null);
  const [formData, setFormData] = useState({ nome: '', cor: '#3B82F6', descricao: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal para gerenciar membros
  const [showMembrosModal, setShowMembrosModal] = useState(false);
  const [selectedEquipe, setSelectedEquipe] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [equipesData, usuariosData] = await Promise.all([
        retryWithBackoff(() => Equipe.list(), 3, 1000, 'fetchEquipes'),
        retryWithBackoff(() => Usuario.list(), 3, 1000, 'fetchUsuarios')
      ]);
      setEquipes(equipesData || []);
      setUsuarios(usuariosData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nome.trim()) {
      alert('Nome da equipe é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingEquipe) {
        await retryWithBackoff(() => Equipe.update(editingEquipe.id, formData), 3, 1000, 'updateEquipe');
      } else {
        await retryWithBackoff(() => Equipe.create(formData), 3, 1000, 'createEquipe');
      }
      setShowForm(false);
      setEditingEquipe(null);
      setFormData({ nome: '', cor: '#3B82F6', descricao: '' });
      await fetchData();
    } catch (error) {
      console.error('Erro ao salvar equipe:', error);
      alert('Erro ao salvar equipe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (equipe) => {
    setEditingEquipe(equipe);
    setFormData({
      nome: equipe.nome || '',
      cor: equipe.cor || '#3B82F6',
      descricao: equipe.descricao || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (equipe) => {
    const membros = usuarios.filter(u => u.equipe_id === equipe.id);
    if (membros.length > 0) {
      alert(`Esta equipe possui ${membros.length} membro(s). Remova-os antes de excluir.`);
      return;
    }

    if (!window.confirm(`Deseja excluir a equipe "${equipe.nome}"?`)) return;

    try {
      await retryWithBackoff(() => Equipe.delete(equipe.id), 3, 1000, 'deleteEquipe');
      await fetchData();
    } catch (error) {
      console.error('Erro ao excluir equipe:', error);
      alert('Erro ao excluir equipe.');
    }
  };

  const handleOpenMembros = (equipe) => {
    setSelectedEquipe(equipe);
    setShowMembrosModal(true);
  };

  const handleAddMembro = async (usuario) => {
    try {
      await retryWithBackoff(
        () => Usuario.update(usuario.id, { equipe_id: selectedEquipe.id }), 
        3, 1000, 'addMembro'
      );
      await fetchData();
    } catch (error) {
      console.error('Erro ao adicionar membro:', error);
      alert('Erro ao adicionar membro.');
    }
  };

  const handleRemoveMembro = async (usuario) => {
    try {
      await retryWithBackoff(
        () => Usuario.update(usuario.id, { equipe_id: null }), 
        3, 1000, 'removeMembro'
      );
      await fetchData();
    } catch (error) {
      console.error('Erro ao remover membro:', error);
      alert('Erro ao remover membro.');
    }
  };

  const getMembros = (equipeId) => usuarios.filter(u => u.equipe_id === equipeId);
  const getUsuariosSemEquipe = () => usuarios.filter(u => !u.equipe_id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Equipes</h2>
          <p className="text-sm text-gray-500">Organize os usuários em equipes</p>
        </div>
        <Button onClick={() => { setShowForm(true); setEditingEquipe(null); setFormData({ nome: '', cor: '#3B82F6', descricao: '' }); }}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Equipe
        </Button>
      </div>

      {/* Lista de Equipes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipes.map(equipe => {
          const membros = getMembros(equipe.id);
          return (
            <Card key={equipe.id} className="overflow-hidden">
              <div className="h-2" style={{ backgroundColor: equipe.cor || '#3B82F6' }} />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{equipe.nome}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(equipe)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(equipe)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {equipe.descricao && (
                  <p className="text-sm text-gray-500">{equipe.descricao}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">{membros.length} membro(s)</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleOpenMembros(equipe)}>
                    <UserPlus className="w-4 h-4 mr-1" />
                    Gerenciar
                  </Button>
                </div>
                {membros.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {membros.slice(0, 5).map(m => (
                      <Badge key={m.id} variant="secondary" className="text-xs">
                        {m.nome?.split(' ')[0]}
                      </Badge>
                    ))}
                    {membros.length > 5 && (
                      <Badge variant="secondary" className="text-xs">
                        +{membros.length - 5}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {equipes.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhuma equipe cadastrada</p>
          </div>
        )}
      </div>

      {/* Modal de Formulário */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEquipe ? 'Editar Equipe' : 'Nova Equipe'}</DialogTitle>
            <DialogDescription>Preencha os campos para {editingEquipe ? 'editar a' : 'criar uma nova'} equipe.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da Equipe *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Projetos, Coordenação"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cor">Cor</Label>
              <div className="flex gap-2">
                <Input
                  id="cor"
                  type="color"
                  value={formData.cor}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                  className="w-16 h-10 p-1"
                />
                <Input
                  value={formData.cor}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                  placeholder="#3B82F6"
                  className="flex-1"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Descrição opcional"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingEquipe ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal de Membros */}
      <Dialog open={showMembrosModal} onOpenChange={setShowMembrosModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Membros da Equipe: {selectedEquipe?.nome}</DialogTitle>
            <DialogDescription>Gerencie os membros desta equipe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Membros atuais */}
            <div>
              <Label className="text-sm font-medium">Membros Atuais</Label>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {selectedEquipe && getMembros(selectedEquipe.id).map(membro => (
                  <div key={membro.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <span className="font-medium">{membro.nome}</span>
                      <span className="text-xs text-gray-500 ml-2">{membro.cargo || 'Sem cargo'}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveMembro(membro)} className="text-red-600">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {selectedEquipe && getMembros(selectedEquipe.id).length === 0 && (
                  <p className="text-sm text-gray-500 italic">Nenhum membro nesta equipe</p>
                )}
              </div>
            </div>

            {/* Adicionar membros */}
            <div>
              <Label className="text-sm font-medium">Adicionar Membros</Label>
              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                {getUsuariosSemEquipe().map(usuario => (
                  <div key={usuario.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                    <div>
                      <span className="font-medium">{usuario.nome}</span>
                      <span className="text-xs text-gray-500 ml-2">{usuario.cargo || 'Sem cargo'}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleAddMembro(usuario)} className="text-blue-600">
                      <UserPlus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {getUsuariosSemEquipe().length === 0 && (
                  <p className="text-sm text-gray-500 italic">Todos os usuários já estão em equipes</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}