import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const ITEMS_BASES_E_FOLHAS = [
  { numero_item: '1.1', descricao: 'Checar se o A- está nas cores corretas (Alvenaria na cor branca, pilares na cor azul, eixos no layer A-EIXOS e cor vermelha e demais layers na cor 8 cinza):' },
  { numero_item: '1.2', descricao: 'Checar se todos os ambientes estão com texto de arquitetura:' },
  { numero_item: '1.3', descricao: 'Checar se o T- está no layer A-TEXTOS:' },
  { numero_item: '1.4', descricao: 'Checar se os textos estão na fonte Arial e tamanho 18:' },
  { numero_item: '1.5', descricao: 'Checar se todos os pavimentos estão com E- de estrutura e se está saindo com linha traçejada:' },
  { numero_item: '1.6', descricao: 'Checar se o E- está no layer E-VIGAS, para as vigas e pilares e E-TEXTOS para os textos de tamanhos de vigas, pilares, lajes e também as indicações de corte de vigas:' },
  { numero_item: '1.7', descricao: 'Checar se o último pavimento está com o F- de fundação:' },
  { numero_item: '1.8', descricao: 'Checar se possui título na planta com fonte Arial e tamanhos de texto 70, 50 e 25:' },
  { numero_item: '1.9', descricao: 'Checar se o carimbo está preenchido corretamente:' },
  { numero_item: '1.10', descricao: 'Checar se na folha possui notas e legenda:' },
  { numero_item: '1.11', descricao: 'Checar se no padrão do cliente além de carimbo há solicitação de inclusão de planta chave, norte, arquivos de referência ou outros:' },
];

const SECOES_PADRAO = [
  'Sistemas Eletrônicos',
  'Incêndio',
  'HVAC',
  'Hidráulica',
  'Elétrica'
];

const ITEMS_COMPATIBILIZACAO = [
  { numero_item: '1.1', descricao: 'Checar se estamos passando alguma instalação em pilar' },
  { numero_item: '1.2', descricao: 'Checar se estamos passando alguma instalação em elevador' },
  { numero_item: '1.3', descricao: 'Checar se foram indicadas as furações necessárias em viga e se o tamanho do furo está adequado' },
  { numero_item: '1.4', descricao: 'Checar se temos alguma instalação passando no sentido vertical na viga' },
  { numero_item: '1.5', descricao: 'Checar se temos algum conflito com vigas de transição' },
  { numero_item: '1.6', descricao: 'Checar se temos algum conflito de pé direito ou forro' },
  { numero_item: '1.7', descricao: 'Checar se foram atendidos os raios solicitados por impermeabilização' },
  { numero_item: '1.8', descricao: 'Checar se foram atendidos os pontos de torneira solicitados por paisagismo' },
  { numero_item: '1.9', descricao: 'Checar se foram atendidos os pontos de iluminação solicitados por paisagismo' },
  { numero_item: '1.10', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de interiores' },
  { numero_item: '1.11', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de reuso' },
  { numero_item: '1.12', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de irrigação' },
  { numero_item: '1.13', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de piscina' },
  { numero_item: '1.14', descricao: 'Checar se foram atendidos todos os pontos de luminotécnico' },
  { numero_item: '1.15', descricao: 'Checar se foram atendidos os pontos solicitados no projeto de elevador, se houver' },
  { numero_item: '1.16', descricao: 'Checar se há algum outro projeto com necessidade de pontos' },
  { numero_item: '1.17', descricao: 'Checar se foram atendidos pontos para carro elétrico, se houver' },
  { numero_item: '1.18', descricao: 'Checar se todas as lajes possuem captação de água pluvial' },
  { numero_item: '1.18b', descricao: 'Checar se tem parede diafragma, e se foi feita a captação' },
  { numero_item: '1.19', descricao: 'Checar se shafts estão compatibilizados' },
  { numero_item: '1.20', descricao: 'Checar se temos conflito de altura de instalações em forro e estacionamentos' },
  { numero_item: '1.21', descricao: 'Checar se temos algum banheiro acima de área técnica elétrica' },
  { numero_item: '1.22', descricao: 'Checar se temos algum banheiro acima de viga de transição' },
  { numero_item: '1.23', descricao: 'Checar se todos os extintores e hidrantes estão locados a no máximo 5m da entrada' },
  { numero_item: '1.24', descricao: 'Checar se foi locado o registro de recalque de coluna' },
  { numero_item: '1.25', descricao: 'Para cozinhas industriais checar se foi locado o painel de registro de gás' },
  { numero_item: '1.26', descricao: 'Checar se a posição dos quadros está adequada e alinhada com cliente' },
  { numero_item: '1.27', descricao: 'Checar se shaft onde passa a prumada de gás está ventilado e se os ambientes com equipamentos de gás estão ventilados também conforme indica a comgás' },
  { numero_item: '1.28', descricao: 'Para apartamentos checar se foi locado o aquecedor e também a chaminé e se ela está compatibilizada com estrutura, se foi locado no forro e há necessidade de ventilação' },
  { numero_item: '1.29', descricao: 'Para apartamentos checar se estamos utilizando as sancas disponibilizadas por arquitetura' },
  { numero_item: '1.30', descricao: 'Checar se todos os equipamentos solicitados pelo cliente estão sendo alimentados, como máquina de lavar roupa, máquinas de lavar louça, triturador, coifa, filtro, água na geladeira entre outros' },
  { numero_item: '1.31', descricao: 'Checar se volumes dos reservatórios condizem com os da arquitetura, e se estiverem divergentes verificar se está alinhado com cliente' },
  { numero_item: '1.32', descricao: 'Checar se no gerador foram locadas as entradas e saídas de ar e também a chaminé; E verificar se foi feita a ampliação' },
  { numero_item: '1.33', descricao: 'Equipamentos central de aquecimento' },
  { numero_item: '1.34', descricao: 'Cota de saída de água pluvial para conseguir sair na sarjeta' },
  { numero_item: '1.35', descricao: 'Cota de saída de esgoto compatibilizar com concessionária' },
  { numero_item: '1.36', descricao: 'Detalhamento cotas de bombas com cortes' },
  { numero_item: '1.37', descricao: 'Verificar se teremos projeto de vedação' },
  { numero_item: '1.38', descricao: 'Não utilizar tubulações no contrapiso, a menos que seja combinado com o cliente' },
  { numero_item: '1.39', descricao: 'Em redes enterradas com cotas a mais de 2m, validar com cliente' },
];

export default function NovoChecklistModal({ isOpen, onClose, onSuccess, empreendimentos }) {
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    tipo: 'Elétrica',
    empreendimento_id: '',
    tecnico_responsavel: '',
    numero_os: '',
    cliente: '',
    data_entrega: '',
    periodos_inicio: '',
    periodos_fim: ''
  });

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
  const isTemplatePlanejamento = isCompatibilizacao || isBasesEFolhas;

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

      const checklistData = {
        tipo: formData.tipo,
        empreendimento_id: formData.empreendimento_id || null,
        tecnico_responsavel: formData.tecnico_responsavel,
        numero_os: formData.numero_os,
        cliente: formData.cliente,
        data_entrega: formData.data_entrega || null,
        periodos: periodos,
        status: 'em_andamento'
      };

      const novoChecklist = await base44.entities.ChecklistPlanejamento.create(checklistData);

      if (isCompatibilizacao) {
        for (let i = 0; i < ITEMS_COMPATIBILIZACAO.length; i++) {
          const item = ITEMS_COMPATIBILIZACAO[i];
          await base44.entities.ChecklistItem.create({
            checklist_id: novoChecklist.id,
            secao: 'COMPATIBILIZAÇÃO',
            numero_item: item.numero_item,
            descricao: item.descricao,
            ordem: i + 1,
            status_por_periodo: {}
          });
        }
      } else if (isBasesEFolhas) {
        for (let i = 0; i < ITEMS_BASES_E_FOLHAS.length; i++) {
          const item = ITEMS_BASES_E_FOLHAS[i];
          await base44.entities.ChecklistItem.create({
            checklist_id: novoChecklist.id,
            secao: 'BASES E FOLHAS',
            numero_item: item.numero_item,
            descricao: item.descricao,
            ordem: i + 1,
            status_por_periodo: {}
          });
        }
      } else {
        for (let i = 0; i < SECOES_PADRAO.length; i++) {
          await base44.entities.ChecklistItem.create({
            checklist_id: novoChecklist.id,
            secao: SECOES_PADRAO[i],
            numero_item: `${i + 1}.0`,
            descricao: 'Seção criada automaticamente - adicione itens abaixo',
            ordem: 0,
            status_por_periodo: {}
          });
        }
      }

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
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Elétrica">Elétrica</SelectItem>
                  <SelectItem value="Hidráulica">Hidráulica</SelectItem>
                  <SelectItem value="HVAC">HVAC</SelectItem>
                  <SelectItem value="Incêndio">Incêndio</SelectItem>
                  <SelectItem value="Sistemas Eletrônicos">Sistemas Eletrônicos</SelectItem>
                  <SelectItem value="Planejamento - COMPATIBILIZAÇÃO">Planejamento - COMPATIBILIZAÇÃO</SelectItem>
                  <SelectItem value="Planejamento - BASES E FOLHAS">Planejamento - BASES E FOLHAS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Empreendimento</Label>
              <Select
                value={formData.empreendimento_id}
                onValueChange={(value) => setFormData({ ...formData, empreendimento_id: value })}
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