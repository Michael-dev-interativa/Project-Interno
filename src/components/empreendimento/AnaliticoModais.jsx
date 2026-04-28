import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2, Loader2 } from 'lucide-react';
import { Atividade, PlanejamentoAtividade } from '@/entities/all';
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';

export default function AnaliticoMultipleSelection({
  selectedIds,
  isDeletingMultiple,
  onDelete,
  label = "atividades selecionadas"
}) {
  if (selectedIds.size === 0) return null;

  return (
    <div className="flex items-center justify-between p-4 border-2 border-red-500 rounded-lg bg-red-50 shadow-sm">
      <div className="flex items-center gap-3">
        <Badge className="bg-red-600 text-white">
          {selectedIds.size} {label}
        </Badge>
        <span className="text-sm text-gray-700">
          Selecione a ação para as atividades selecionadas
        </span>
      </div>
      <Button
        onClick={onDelete}
        className="bg-red-600 hover:bg-red-700"
        disabled={isDeletingMultiple}
        size="sm"
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Excluir ({selectedIds.size})
      </Button>
    </div>
  );
}

export function EtapaEditModal({ isOpen, onClose, atividade, documentos, onSave }) {
  const [novaEtapa, setNovaEtapa] = useState('');
  const [escopo, setEscopo] = useState('empreendimento');
  const [selectedFolhaId, setSelectedFolhaId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && atividade) {
      setNovaEtapa(atividade.etapa || '');
      setEscopo('empreendimento');
      setSelectedFolhaId('');
    }
  }, [isOpen, atividade]);

  const handleSave = async () => {
    if (!novaEtapa) { alert('Selecione uma nova etapa.'); return; }
    if (escopo === 'folha' && !selectedFolhaId) { alert('Selecione uma folha.'); return; }
    setIsSaving(true);
    try {
      await onSave(novaEtapa, escopo, selectedFolhaId);
      onClose();
    } catch {
      // error handled in parent
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Etapa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-gray-600 mb-1">Atividade:</p>
            <p className="font-medium">{atividade?.atividade}</p>
            <p className="text-xs text-gray-500">{atividade?.disciplina} / {atividade?.subdisciplina}</p>
          </div>
          <div className="space-y-2">
            <Label>Nova Etapa</Label>
            <Select value={novaEtapa} onValueChange={setNovaEtapa}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {ETAPAS_ORDER.map(etapa => (
                  <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Escopo da alteração</Label>
            <RadioGroup value={escopo} onValueChange={setEscopo}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="empreendimento" id="escopo-emp" />
                <Label htmlFor="escopo-emp">Todo o empreendimento</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="folha" id="escopo-folha" />
                <Label htmlFor="escopo-folha">Folha específica</Label>
              </div>
            </RadioGroup>
          </div>
          {escopo === 'folha' && (
            <div className="space-y-2">
              <Label>Selecione a folha</Label>
              <Select value={selectedFolhaId} onValueChange={setSelectedFolhaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a folha" />
                </SelectTrigger>
                <SelectContent>
                  {(documentos || []).map(doc => (
                    <SelectItem key={doc.id} value={String(doc.id)}>
                      {doc.numero} - {doc.arquivo || doc.descritivo || 'Sem nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || !novaEtapa}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditarEtapaEmFolhasModal({ isOpen, onClose, atividade, documentos, empreendimentoId, onSuccess }) {
  const [folhasComAtividade, setFolhasComAtividade] = useState([]);
  const [selectedFolhaIds, setSelectedFolhaIds] = useState(new Set());
  const [novaEtapa, setNovaEtapa] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !atividade?.base_atividade_id || !empreendimentoId) return;

    setIsLoading(true);
    setSelectedFolhaIds(new Set());
    setNovaEtapa(atividade.etapa || '');

    PlanejamentoAtividade.filter({
      empreendimento_id: empreendimentoId,
      atividade_id: atividade.base_atividade_id,
    })
      .then(planos => {
        const docsComPlano = (planos || [])
          .filter(p => p.documento_id)
          .map(p => {
            const doc = (documentos || []).find(d => d.id === p.documento_id);
            return { planoId: p.id, docId: p.documento_id, etapaAtual: p.etapa, label: doc ? `${doc.numero} - ${doc.arquivo || doc.descritivo || 'Sem nome'}` : p.documento_id };
          });
        setFolhasComAtividade(docsComPlano);
      })
      .catch(() => setFolhasComAtividade([]))
      .finally(() => setIsLoading(false));
  }, [isOpen, atividade, empreendimentoId, documentos]);

  const toggleFolha = (docId) => {
    setSelectedFolhaIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!novaEtapa) { alert('Selecione uma nova etapa.'); return; }
    if (selectedFolhaIds.size === 0) { alert('Selecione pelo menos uma folha.'); return; }
    setIsSaving(true);
    try {
      const selected = folhasComAtividade.filter(f => selectedFolhaIds.has(f.docId));
      await Promise.all(selected.map(f =>
        PlanejamentoAtividade.update(f.planoId, { etapa: novaEtapa })
      ));
      alert(`Etapa atualizada para "${novaEtapa}" em ${selected.length} folha(s).`);
      onSuccess();
      onClose();
    } catch {
      alert('Erro ao atualizar etapas.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Etapa em Folhas Específicas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-gray-600 mb-1">Atividade:</p>
            <p className="font-medium">{atividade?.atividade}</p>
          </div>
          <div className="space-y-2">
            <Label>Nova Etapa</Label>
            <Select value={novaEtapa} onValueChange={setNovaEtapa}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent>
                {ETAPAS_ORDER.map(etapa => (
                  <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Folhas com planejamento</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-gray-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando folhas...</span>
              </div>
            ) : folhasComAtividade.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma folha com planejamento encontrada.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                {folhasComAtividade.map(f => (
                  <div key={f.docId} className="flex items-center gap-2">
                    <Checkbox
                      id={`folha-${f.docId}`}
                      checked={selectedFolhaIds.has(f.docId)}
                      onCheckedChange={() => toggleFolha(f.docId)}
                    />
                    <Label htmlFor={`folha-${f.docId}`} className="text-sm font-normal cursor-pointer">
                      {f.label}
                      <span className="ml-2 text-xs text-gray-400">({f.etapaAtual})</span>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving || selectedFolhaIds.size === 0 || !novaEtapa}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Salvar ({selectedFolhaIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExcluirDeFolhasModal({ isOpen, onClose, atividade, documentos, empreendimentoId, onSuccess }) {
  const [folhasComAtividade, setFolhasComAtividade] = useState([]);
  const [selectedFolhaIds, setSelectedFolhaIds] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !atividade?.base_atividade_id || !empreendimentoId) return;

    setIsLoading(true);
    setSelectedFolhaIds(new Set());

    PlanejamentoAtividade.filter({
      empreendimento_id: empreendimentoId,
      atividade_id: atividade.base_atividade_id,
    })
      .then(planos => {
        const docsComPlano = (planos || [])
          .filter(p => p.documento_id)
          .map(p => {
            const doc = (documentos || []).find(d => d.id === p.documento_id);
            return { planoId: p.id, docId: p.documento_id, label: doc ? `${doc.numero} - ${doc.arquivo || doc.descritivo || 'Sem nome'}` : p.documento_id };
          });
        setFolhasComAtividade(docsComPlano);
      })
      .catch(() => setFolhasComAtividade([]))
      .finally(() => setIsLoading(false));
  }, [isOpen, atividade, empreendimentoId, documentos]);

  const toggleFolha = (docId) => {
    setSelectedFolhaIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId); else next.add(docId);
      return next;
    });
  };

  const handleDelete = async () => {
    if (selectedFolhaIds.size === 0) { alert('Selecione pelo menos uma folha.'); return; }
    if (!window.confirm(`Excluir a atividade "${atividade?.atividade}" de ${selectedFolhaIds.size} folha(s)?`)) return;

    setIsDeleting(true);
    try {
      const selected = folhasComAtividade.filter(f => selectedFolhaIds.has(f.docId));
      for (const f of selected) {
        await PlanejamentoAtividade.delete(f.planoId);
        const atividadeOrigArr = await Atividade.filter({ id: atividade.base_atividade_id });
        if (atividadeOrigArr?.length > 0) {
          const orig = atividadeOrigArr[0];
          await Atividade.create({
            ...orig,
            id: undefined,
            empreendimento_id: empreendimentoId,
            id_atividade: atividade.base_atividade_id,
            tempo: -999,
            documento_id: f.docId,
          });
        }
      }
      alert(`Atividade removida de ${selected.length} folha(s).`);
      onSuccess();
      onClose();
    } catch {
      alert('Erro ao excluir atividade das folhas.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Excluir de Folhas Específicas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm text-gray-600 mb-1">Atividade:</p>
            <p className="font-medium">{atividade?.atividade}</p>
            <p className="text-xs text-gray-500">{atividade?.disciplina} / {atividade?.subdisciplina}</p>
          </div>
          <div className="space-y-2">
            <Label>Selecione as folhas para remover esta atividade</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-gray-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Carregando folhas...</span>
              </div>
            ) : folhasComAtividade.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma folha com planejamento encontrada.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                {folhasComAtividade.map(f => (
                  <div key={f.docId} className="flex items-center gap-2">
                    <Checkbox
                      id={`excluir-${f.docId}`}
                      checked={selectedFolhaIds.has(f.docId)}
                      onCheckedChange={() => toggleFolha(f.docId)}
                    />
                    <Label htmlFor={`excluir-${f.docId}`} className="text-sm font-normal cursor-pointer">
                      {f.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isDeleting}>Cancelar</Button>
          <Button
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700"
            disabled={isDeleting || selectedFolhaIds.size === 0}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Excluir ({selectedFolhaIds.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
