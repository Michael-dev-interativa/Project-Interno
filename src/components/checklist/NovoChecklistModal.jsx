import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import {
  SECOES_PADRAO,
  ITEMS_INICIO_DE_PROJETO,
  ITEMS_BASES_E_FOLHAS,
  ITEMS_COMPATIBILIZACAO,
  criarChecklistParaDisciplina,
} from '@/lib/checklistTemplates';

const TODAS_DISCIPLINAS = [
  'Elétrica',
  'Hidráulica',
  'HVAC',
  'Incêndio',
  'Sistemas Eletrônicos',
  'Planejamento - COMPATIBILIZAÇÃO',
  'Planejamento - BASES E FOLHAS',
  'Planejamento - INÍCIO DE PROJETO',
];

export default function NovoChecklistModal({ isOpen, onClose, onSuccess, empreendimentos, defaultEmpreendimentoId }) {
  const [isSaving, setIsSaving] = useState(false);

  const empreendimentoInicial = empreendimentos?.find(e => e.id === defaultEmpreendimentoId) || empreendimentos?.[0];
  const disciplinasIniciais = empreendimentoInicial?.disciplinas_checklist?.length
    ? empreendimentoInicial.disciplinas_checklist
    : TODAS_DISCIPLINAS;
  const tipoInicial = disciplinasIniciais.includes('Elétrica') ? 'Elétrica' : disciplinasIniciais[0] || 'Elétrica';

  const [formData, setFormData] = useState({
    tipo: tipoInicial,
    empreendimento_id: defaultEmpreendimentoId || '',
    tecnico_responsavel: empreendimentoInicial?.tecnico_responsavel || '',
    numero_os: empreendimentoInicial?.num_proposta || '',
    cliente: empreendimentoInicial?.cliente || '',
    data_entrega: empreendimentoInicial?.data_entrega || '',
    periodos_inicio: empreendimentoInicial?.periodo_inicio || '',
    periodos_fim: empreendimentoInicial?.periodo_fim || '',
  });

  const empreendimentoSelecionado = empreendimentos?.find(e => e.id === formData.empreendimento_id);
  const disciplinasDisponiveis = empreendimentoSelecionado?.disciplinas_checklist?.length
    ? empreendimentoSelecionado.disciplinas_checklist
    : TODAS_DISCIPLINAS;

  const handleEmpreendimentoChange = (value) => {
    const emp = empreendimentos?.find(e => e.id === value);
    const disciplinas = emp?.disciplinas_checklist?.length ? emp.disciplinas_checklist : TODAS_DISCIPLINAS;
    const tipoAtual = formData.tipo;
    const novoTipo = disciplinas.includes(tipoAtual) ? tipoAtual : disciplinas[0] || '';
    setFormData(prev => ({
      ...prev,
      empreendimento_id: value,
      tipo: novoTipo,
      cliente: emp?.cliente || prev.cliente,
      numero_os: emp?.num_proposta || prev.numero_os,
      tecnico_responsavel: emp?.tecnico_responsavel || prev.tecnico_responsavel,
      data_entrega: emp?.data_entrega || prev.data_entrega,
      periodos_inicio: emp?.periodo_inicio || prev.periodos_inicio,
      periodos_fim: emp?.periodo_fim || prev.periodos_fim,
    }));
  };

  const generatePeriodos = (inicio, fim) => {
    if (!inicio || !fim) return [];
    
    const periodos = [];
    const [mesInicio, anoInicio] = inicio.split('/').map(Number);
    const [mesFim, anoFim] = fim.split('/').map(Number);
    
    let mesAtual = mesInicio;
    let anoAtual = anoInicio;
    
    while (anoAtual < anoFim || (anoAtual === anoFim && mesAtual <= mesFim)) {
      const mesStr = mesAtual.toString().padStart(2, '0');
      periodos.push(`${mesStr}/${anoAtual}`);
      
      mesAtual++;
      if (mesAtual > 12) {
        mesAtual = 1;
        anoAtual++;
      }
    }
    
    return periodos;
  };

  const isCompatibilizacao = formData.tipo === 'Planejamento - COMPATIBILIZAÇÃO';
  const isBasesEFolhas = formData.tipo === 'Planejamento - BASES E FOLHAS';
  const isInicioDeProjeto = formData.tipo === 'Planejamento - INÍCIO DE PROJETO';
  const isTemplatePlanejamento = isCompatibilizacao || isBasesEFolhas || isInicioDeProjeto;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const periodos = generatePeriodos(formData.periodos_inicio, formData.periodos_fim);

      if (!isTemplatePlanejamento && periodos.length === 0) {
        alert('Por favor, defina os períodos (formato MM/AAAA)');
        setIsSaving(false);
        return;
      }

      await criarChecklistParaDisciplina({
        tipo: formData.tipo,
        tipo_empreendimento: empreendimentoSelecionado?.tipo_empreendimento || null,
        empreendimento_id: formData.empreendimento_id || null,
        cliente: formData.cliente,
        tecnico_responsavel: formData.tecnico_responsavel,
        numero_os: formData.numero_os,
        data_entrega: formData.data_entrega || null,
        periodos,
      });

      onSuccess();
    } catch (error) {
      console.error('Erro ao criar checklist:', error);
      alert('Erro ao criar checklist: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo Checklist de Planejamento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Empreendimento</Label>
              <Select
                value={formData.empreendimento_id}
                onValueChange={handleEmpreendimentoChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {empreendimentos.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData(prev => ({ ...prev, tipo: value }))}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {disciplinasDisponiveis.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {empreendimentoSelecionado?.disciplinas_checklist?.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Exibindo disciplinas configuradas para este empreendimento.
                </p>
              )}
            </div>

            <div>
              <Label>Cliente *</Label>
              <Input
                value={formData.cliente}
                onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                required
              />
            </div>

            <div>
              <Label>Número da OS</Label>
              <Input
                value={formData.numero_os}
                onChange={(e) => setFormData({ ...formData, numero_os: e.target.value })}
              />
            </div>

            <div>
              <Label>Técnico Responsável</Label>
              <Input
                value={formData.tecnico_responsavel}
                onChange={(e) => setFormData({ ...formData, tecnico_responsavel: e.target.value })}
              />
            </div>

            <div>
              <Label>Data de Entrega</Label>
              <Input
                type="date"
                value={formData.data_entrega}
                onChange={(e) => setFormData({ ...formData, data_entrega: e.target.value })}
              />
            </div>

            <div>
              <Label>Período Início (MM/AAAA){isTemplatePlanejamento ? '' : ' *'}</Label>
              <Input
                placeholder="Ex: 01/2026"
                value={formData.periodos_inicio}
                onChange={(e) => setFormData({ ...formData, periodos_inicio: e.target.value })}
                required={!isTemplatePlanejamento}
              />
            </div>

            <div>
              <Label>Período Fim (MM/AAAA){isTemplatePlanejamento ? '' : ' *'}</Label>
              <Input
                placeholder="Ex: 12/2026"
                value={formData.periodos_fim}
                onChange={(e) => setFormData({ ...formData, periodos_fim: e.target.value })}
                required={!isTemplatePlanejamento}
              />
            </div>
          </div>

          {isCompatibilizacao ? (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
              <strong>39 itens serão criados automaticamente</strong> na seção COMPATIBILIZAÇÃO, conforme o template padrão. Os períodos são opcionais para este tipo.
            </div>
          ) : isBasesEFolhas ? (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
              <strong>11 itens serão criados automaticamente</strong> na seção BASES E FOLHAS, conforme o template padrão. Os períodos são opcionais para este tipo.
            </div>
          ) : isInicioDeProjeto ? (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
              <strong>8 itens serão criados automaticamente</strong> na seção INÍCIO DE PROJETO, conforme o template padrão. Os períodos são opcionais para este tipo.
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              <strong>Seções que serão criadas automaticamente:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                {SECOES_PADRAO.map((secao) => (
                  <li key={secao}>{secao}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar Checklist'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}