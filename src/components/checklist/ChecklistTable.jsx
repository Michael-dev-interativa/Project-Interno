import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit2, Save, X, FolderX, Pencil, Check } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_OPTIONS = ['-', 'E', 'C', 'NA'];
const STATUS_COLORS = {
  'E': 'bg-yellow-100',
  'C': 'bg-green-100',
  'NA': 'bg-gray-100',
  '-': 'bg-white'
};

export default function ChecklistTable({ secao, items, checklist, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingSecao, setEditingSecao] = useState(false);
  const [novoNomeSecao, setNovoNomeSecao] = useState(secao);
  const [formData, setFormData] = useState({
    numero_item: '',
    descricao: '',
    contribuicao: '',
    tempo: '',
    observacoes: ''
  });

  const periodos = checklist.periodos || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        checklist_id: checklist.id,
        secao: secao,
        numero_item: formData.numero_item,
        descricao: formData.descricao,
        contribuicao: formData.contribuicao || '',
        tempo: formData.tempo || '',
        observacoes: formData.observacoes || '',
        ordem: editingItem ? editingItem.ordem : (items.length + 1),
        status_por_periodo: editingItem?.status_por_periodo || {}
      };

      if (editingItem) {
        await base44.entities.ChecklistItem.update(editingItem.id, data);
      } else {
        await base44.entities.ChecklistItem.create(data);
      }

      setShowForm(false);
      setEditingItem(null);
      setFormData({ numero_item: '', descricao: '', contribuicao: '', tempo: '', observacoes: '' });
      onUpdate();
    } catch (error) {
      console.error('Erro ao salvar item:', error);
      alert('Erro ao salvar item');
    }
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      numero_item: item.numero_item,
      descricao: item.descricao,
      contribuicao: item.contribuicao || '',
      tempo: item.tempo || '',
      observacoes: item.observacoes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm('Deseja realmente excluir este item?')) return;
    
    try {
      await base44.entities.ChecklistItem.delete(itemId);
      onUpdate();
    } catch (error) {
      console.error('Erro ao excluir item:', error);
      alert('Erro ao excluir item');
    }
  };

  const handleStatusChange = async (item, periodo, novoStatus) => {
    try {
      const statusAtualizado = {
        ...(item.status_por_periodo || {}),
        [periodo]: novoStatus
      };
      await base44.entities.ChecklistItem.update(item.id, {
        status_por_periodo: statusAtualizado
      });
      onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
      alert('Erro ao atualizar status');
    }
  };

  const handleDeleteSecao = async () => {
    if (!window.confirm(`Tem certeza que deseja excluir toda a seção "${secao}" com ${items.length} item(ns)?`)) return;
    
    setIsDeleting(true);
    try {
      for (const item of items) {
        await base44.entities.ChecklistItem.delete(item.id);
      }
      onUpdate();
    } catch (error) {
      console.error('Erro ao excluir seção:', error);
      alert('Erro ao excluir seção');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameSecao = async () => {
    if (!novoNomeSecao.trim()) {
      alert('O nome da seção não pode estar vazio');
      return;
    }
    
    try {
      for (const item of items) {
        await base44.entities.ChecklistItem.update(item.id, {
          secao: novoNomeSecao
        });
      }
      setEditingSecao(false);
      onUpdate();
    } catch (error) {
      console.error('Erro ao renomear seção:', error);
      alert('Erro ao renomear seção');
    }
  };

  return (
    <Card>
      <CardHeader className="bg-gray-800 text-white">
        <div className="flex justify-between items-center gap-4">
          {editingSecao ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={novoNomeSecao}
                onChange={(e) => setNovoNomeSecao(e.target.value)}
                className="bg-white text-gray-900 max-w-md"
                autoFocus
              />
              <Button size="sm" variant="secondary" onClick={handleRenameSecao}>
                <Check className="w-4 h-4 mr-1" />
                Salvar
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                setEditingSecao(false);
                setNovoNomeSecao(secao);
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold">{secao}</CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingSecao(true)}
                className="text-white hover:bg-gray-700"
              >
                <Pencil className="w-3 h-3" />
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteSecao}
              disabled={isDeleting}
            >
              <FolderX className="w-4 h-4 mr-2" />
              {isDeleting ? 'Excluindo...' : 'Excluir Seção'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setShowForm(!showForm);
                setEditingItem(null);
                setFormData({ numero_item: '', descricao: '', contribuicao: '', tempo: '', observacoes: '' });
              }}
            >
              {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {showForm ? 'Cancelar' : 'Adicionar Item'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {showForm && (
          <form onSubmit={handleSubmit} className="p-4 bg-blue-50 border-b">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium">Número</label>
                <Input
                  value={formData.numero_item}
                  onChange={(e) => setFormData({ ...formData, numero_item: e.target.value })}
                  placeholder="Ex: 1.1"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descrição"
                  required
                  className="min-h-[60px]"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Contribuição</label>
                <Input
                  value={formData.contribuicao}
                  onChange={(e) => setFormData({ ...formData, contribuicao: e.target.value })}
                  placeholder="Ex: %"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Tempo</label>
                <Input
                  value={formData.tempo}
                  onChange={(e) => setFormData({ ...formData, tempo: e.target.value })}
                  placeholder="Ex: dias"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-sm font-medium">Observações</label>
              <Input
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Observações (opcional)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingItem(null);
                setFormData({ numero_item: '', descricao: '', observacoes: '' });
              }}>
                Cancelar
              </Button>
              <Button type="submit">
                <Save className="w-4 h-4 mr-2" />
                {editingItem ? 'Atualizar' : 'Adicionar'}
              </Button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead className="w-12 border text-center">Item</TableHead>
                <TableHead className="min-w-[250px] border">Descrição</TableHead>
                <TableHead className="w-20 border text-center">Contribuição</TableHead>
                <TableHead className="w-16 border text-center">Tempo</TableHead>
                <TableHead colSpan={periodos.length} className="border text-center font-bold">STATUS</TableHead>
                <TableHead className="min-w-[150px] border">Observações</TableHead>
                <TableHead className="w-20 border">Ações</TableHead>
              </TableRow>
              <TableRow className="bg-gray-50">
                <TableHead colSpan="4" className="border"></TableHead>
                {periodos.map((periodo, idx) => (
                  <TableHead key={idx} className="w-12 border text-center text-xs font-normal">
                    {periodo}
                  </TableHead>
                ))}
                <TableHead className="border"></TableHead>
                <TableHead className="border"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={periodos.length + 4} className="text-center py-8 text-gray-500">
                    Nenhum item adicionado. Clique em "Adicionar Item" para começar.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id} className="hover:bg-gray-50">
                    <TableCell className="border font-medium text-center text-sm">
                      {item.numero_item}
                    </TableCell>
                    <TableCell className="border text-sm">
                      {item.descricao}
                    </TableCell>
                    <TableCell className="border text-center text-sm">
                      {item.contribuicao || '-'}
                    </TableCell>
                    <TableCell className="border text-center text-sm">
                      {item.tempo || '-'}
                    </TableCell>
                    {periodos.map((periodo, idx) => {
                      const status = item.status_por_periodo?.[periodo] || '-';
                      return (
                        <TableCell 
                          key={idx} 
                          className={`border ${STATUS_COLORS[status]} p-0`}
                        >
                          <Select
                            value={status}
                            onValueChange={(value) => handleStatusChange(item, periodo, value === '-' ? '' : value)}
                          >
                            <SelectTrigger className="h-7 text-xs border-0 bg-transparent rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      );
                    })}
                    <TableCell className="border text-sm text-gray-600">
                      {item.observacoes || '-'}
                    </TableCell>
                    <TableCell className="border">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleEdit(item)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}