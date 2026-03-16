import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Edit2, Save, X } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';

export default function ChecklistHeader({ checklist, onUpdate, empreendimentos }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    tipo: checklist.tipo || '',
    tecnico_responsavel: checklist.tecnico_responsavel || '',
    numero_os: checklist.numero_os || '',
    cliente: checklist.cliente || '',
    data_entrega: checklist.data_entrega || ''
  });

  const empreendimento = empreendimentos.find(e => e.id === checklist.empreendimento_id);

  const handleSave = async () => {
    try {
      await base44.entities.ChecklistPlanejamento.update(checklist.id, formData);
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar checklist:', error);
      alert('Erro ao salvar alterações');
    }
  };

  return (
    <Card className="border-2 border-blue-500">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-gray-900">
            CHECKLIST DE PLANEJAMENTO - {checklist.tipo?.toUpperCase()}
          </h2>
          {!isEditing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setFormData({
                    tipo: checklist.tipo || '',
                    tecnico_responsavel: checklist.tecnico_responsavel || '',
                    numero_os: checklist.numero_os || '',
                    cliente: checklist.cliente || '',
                    data_entrega: checklist.data_entrega || ''
                  });
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-2" />
                Salvar
              </Button>
            </div>
          )}
        </div>

        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs font-bold text-gray-700">Técnico Responsável</Label>
              {isEditing ? (
                <Input
                  value={formData.tecnico_responsavel}
                  onChange={(e) => setFormData({ ...formData, tecnico_responsavel: e.target.value })}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{checklist.tecnico_responsavel || '-'}</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700">Número da OS</Label>
              {isEditing ? (
                <Input
                  value={formData.numero_os}
                  onChange={(e) => setFormData({ ...formData, numero_os: e.target.value })}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{checklist.numero_os || '-'}</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700">Cliente</Label>
              {isEditing ? (
                <Input
                  value={formData.cliente}
                  onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                  className="mt-1"
                />
              ) : (
                <p className="mt-1 text-sm">{checklist.cliente}</p>
              )}
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-700">Data de Entrega</Label>
              {isEditing ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full mt-1 justify-start text-left">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.data_entrega && isValid(parseISO(formData.data_entrega))
                        ? format(parseISO(formData.data_entrega), 'dd/MM/yyyy')
                        : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.data_entrega && isValid(parseISO(formData.data_entrega))
                        ? parseISO(formData.data_entrega)
                        : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setFormData({ ...formData, data_entrega: format(date, 'yyyy-MM-dd') });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="mt-1 text-sm">
                  {checklist.data_entrega && isValid(parseISO(checklist.data_entrega))
                    ? format(parseISO(checklist.data_entrega), 'dd/MM/yyyy')
                    : '-'}
                </p>
              )}
            </div>
          </div>

          {empreendimento && (
            <div className="mt-4 pt-4 border-t border-gray-300">
              <Label className="text-xs font-bold text-gray-700">Empreendimento</Label>
              <p className="mt-1 text-sm">{empreendimento.nome}</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-gray-300">
            <Label className="text-xs font-bold text-gray-700 block mb-2">LEGENDA</Label>
            <div className="flex gap-6 text-sm">
              <span><strong>E</strong> - Executado</span>
              <span><strong>C</strong> - Concluído</span>
              <span><strong>NA</strong> - Não aplicável</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}