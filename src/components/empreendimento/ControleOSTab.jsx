// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Loader2, ClipboardList, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const STATUS_OPTIONS = [
  { value: "NA", label: "N/A", color: "bg-gray-200 text-gray-800" },
  { value: "Concluído", label: "Concluído", color: "bg-green-200 text-green-800" },
  { value: "Pendente", label: "Pendente", color: "bg-red-200 text-red-800" },
  { value: "Em andamento", label: "Em andamento", color: "bg-yellow-200 text-yellow-800" },
  { value: "Hold", label: "Hold", color: "bg-orange-200 text-orange-800" },
  { value: "Paralisado", label: "Paralisado", color: "bg-orange-300 text-orange-900" },
  { value: "Técnico", label: "Técnico", color: "bg-blue-200 text-blue-800" },
  { value: "Ag. Liberação", label: "Ag. Liberação", color: "bg-cyan-200 text-cyan-800" },
  { value: "Finalizado", label: "Finalizado", color: "bg-purple-200 text-purple-800" },
  { value: "Em aprovação", label: "Em aprovação", color: "bg-yellow-300 text-yellow-900" }
];

const ETAPAS_OPTIONS = [
  "Pré-Executivo",
  "Projeto Executivo",
  "Liberado Obra",
  "Acompanhamento Obra",
  "Análise Projeto",
  "Emissão Executivo",
  "As Projetado"
];

const DISCIPLINAS_PLANEJAMENTO = [
  { key: 'hidraulica', label: 'Hidráulica' },
  { key: 'eletrica', label: 'Elétrica' },
  { key: 'incendio', label: 'Incêndio' },
  { key: 'sistemas_eletronicos', label: 'Sistemas Eletrônicos' },
  { key: 'ar_condicionado', label: 'Ar Condicionado' },
];

const getStatusColor = (status) => {
  return STATUS_OPTIONS.find(opt => opt.value === status)?.color || "bg-gray-200 text-gray-800";
};

const StatusSelect = ({ value, onChange, className = '' }) => (
  <Select value={value || 'NA'} onValueChange={onChange}>
    <SelectTrigger className={`${getStatusColor(value || 'NA')} ${className}`}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {STATUS_OPTIONS.map(opt => (
        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const DisciplinaSection = ({ label, data, onChange }) => (
  <div className="mb-6">
    <h4 className="text-sm font-semibold text-gray-700 mb-3">{label}</h4>
    <div className="grid grid-cols-3 gap-4">
      {[['concepcao', 'Concepção'], ['calculo', 'Cálculo'], ['diagrama', 'Diagrama']].map(([campo, labelCampo]) => (
        <div key={campo}>
          <label className="text-xs text-gray-600 mb-1 block">{labelCampo}</label>
          <StatusSelect value={data?.[campo]} onChange={(v) => onChange(campo, v)} />
        </div>
      ))}
    </div>
  </div>
);

export default function ControleOSTab({ empreendimento, atividades }) {
  const [controleOS, setControleOS] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [activeTab, setActiveTab] = useState('gestao');

  const atividadesVinculadas = useMemo(() => {
    if (!atividades || !empreendimento) return [];
    return atividades
      .filter(a => a.empreendimento_id === empreendimento.id && a.disciplina === 'Gestão')
      .map(a => ({ id: a.id, nome: a.atividade || a.subdisciplina, key: `ativ_${a.id}` }));
  }, [atividades, empreendimento]);

  useEffect(() => {
    if (!empreendimento?.id) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const [usuariosData, existing] = await Promise.all([
          base44.entities.Usuario.list(),
          base44.entities.ControleOS.filter({ empreendimento_id: empreendimento.id }),
        ]);

        if (cancelled) return;
        setUsuarios(usuariosData || []);

        if (existing && existing.length > 0) {
          setControleOS(existing[0]);
        } else {
          const created = await base44.entities.ControleOS.create({
            empreendimento_id: empreendimento.id,
            os: empreendimento.os || '',
            gestao: '',
            formalizacao: '',
            cronograma: 'NA',
            markup: 'NA',
            abertura_os_servidor: 'NA',
            atividades_planejamento: 'NA',
            kickoff_cliente: 'NA',
            art_ee_ais: 'NA',
            art_hid_in: 'NA',
            art_hvac: 'NA',
            art_bomb: 'NA',
            conc_telefonia: 'NA',
            conc_gas: 'NA',
            conc_eletrica: 'NA',
            conc_hidraulica: 'NA',
            conc_agua_pluvial: 'NA',
            conc_incendio: 'NA',
            atividades_vinculadas: {},
            planejamento: {
              hidraulica: { concepcao: 'NA', calculo: 'NA', diagrama: 'NA' },
              eletrica: { concepcao: 'NA', calculo: 'NA', diagrama: 'NA' },
              incendio: { concepcao: 'NA', calculo: 'NA', diagrama: 'NA' },
              sistemas_eletronicos: { concepcao: 'NA', calculo: 'NA', diagrama: 'NA' },
              ar_condicionado: { concepcao: 'NA', calculo: 'NA', diagrama: 'NA' },
              memorial: { esp_tec: 'NA', matlib: 'NA' },
            },
            monitoramento: { briefing: 'NA', cronograma: 'NA', lmd: 'NA', entregas_x_etapas: 'NA' },
            avanco: [],
            observacoes: '',
          });
          if (!cancelled) setControleOS(created);
        }
      } catch (error) {
        console.error('Erro ao carregar Controle OS:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [empreendimento?.id]);

  const handleFieldChange = useCallback((field, value) => {
    setControleOS(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAtividadeChange = useCallback((key, status) => {
    setControleOS(prev => ({
      ...prev,
      atividades_vinculadas: { ...(prev.atividades_vinculadas || {}), [key]: status },
    }));
  }, []);

  const handlePlanejamentoChange = useCallback((disciplina, campo, status) => {
    setControleOS(prev => ({
      ...prev,
      planejamento: {
        ...(prev.planejamento || {}),
        [disciplina]: { ...(prev.planejamento?.[disciplina] || {}), [campo]: status },
      },
    }));
  }, []);

  const handleMonitoramentoChange = useCallback((campo, value) => {
    setControleOS(prev => ({
      ...prev,
      monitoramento: { ...(prev.monitoramento || {}), [campo]: value },
    }));
  }, []);

  const handleAddAvancoItem = useCallback(() => {
    setControleOS(prev => ({
      ...prev,
      avanco: [...(prev.avanco || []), { etapa: '', status: 'NA', observacoes: '' }],
    }));
  }, []);

  const handleRemoveAvancoItem = useCallback((index) => {
    setControleOS(prev => ({
      ...prev,
      avanco: prev.avanco.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAvancoChange = useCallback((index, field, value) => {
    setControleOS(prev => ({
      ...prev,
      avanco: prev.avanco.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  }, []);

  const handleSave = async () => {
    if (!controleOS?.id) return;
    setIsSaving(true);
    try {
      const { id, ...data } = controleOS;
      await base44.entities.ControleOS.update(id, data);
      alert('Controle de OS salvo com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar Controle de OS');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!controleOS) {
    return <div className="text-center py-8 text-gray-500">Erro ao carregar dados de Controle de OS</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Controle de Ordem de Serviço
          </CardTitle>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Salvar</>
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex flex-wrap gap-1 h-auto mb-6">
              <TabsTrigger value="gestao" className="text-xs px-3">Gestão Geral</TabsTrigger>
              <TabsTrigger value="art" className="text-xs px-3">ART</TabsTrigger>
              <TabsTrigger value="concessionarias" className="text-xs px-3">Concessionárias</TabsTrigger>
              <TabsTrigger value="monitoramento" className="text-xs px-3">Monitoramento</TabsTrigger>
              <TabsTrigger value="planejamento" className="text-xs px-3">Planejamento</TabsTrigger>
              <TabsTrigger value="memorial" className="text-xs px-3">Memorial</TabsTrigger>
              {atividadesVinculadas.length > 0 && (
                <TabsTrigger value="atividades" className="text-xs px-3">Atividades</TabsTrigger>
              )}
            </TabsList>

            {/* Gestão Geral */}
            <TabsContent value="gestao" className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Gestão Geral</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Gestor</label>
                  <Select value={controleOS.gestao || ''} onValueChange={(v) => handleFieldChange('gestao', v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios.map(u => (
                        <SelectItem key={u.email} value={u.nome || u.email}>
                          {u.nome || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Formalização</label>
                  <Input
                    value={controleOS.formalizacao || ''}
                    onChange={(e) => handleFieldChange('formalizacao', e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Abertura OS</label>
                  <StatusSelect value={controleOS.abertura_os_servidor} onChange={(v) => handleFieldChange('abertura_os_servidor', v)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Ativ. Planejamento</label>
                  <StatusSelect value={controleOS.atividades_planejamento} onChange={(v) => handleFieldChange('atividades_planejamento', v)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Kick-off Cliente</label>
                  <StatusSelect value={controleOS.kickoff_cliente} onChange={(v) => handleFieldChange('kickoff_cliente', v)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Cronograma</label>
                  <StatusSelect value={controleOS.cronograma} onChange={(v) => handleFieldChange('cronograma', v)} className="h-9 text-xs" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Markup</label>
                  <StatusSelect value={controleOS.markup} onChange={(v) => handleFieldChange('markup', v)} className="h-9 text-xs" />
                </div>
              </div>
            </TabsContent>

            {/* ART */}
            <TabsContent value="art" className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">ART</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['art_ee_ais', 'ART - EE/AIS'],
                  ['art_hid_in', 'ART - HID/IN'],
                  ['art_hvac', 'ART - HVAC'],
                  ['art_bomb', 'ART - BOMB'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
                    <StatusSelect value={controleOS[field]} onChange={(v) => handleFieldChange(field, v)} />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Concessionárias */}
            <TabsContent value="concessionarias" className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Concessionárias</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  ['conc_telefonia', 'Telefonia'],
                  ['conc_gas', 'Gás'],
                  ['conc_eletrica', 'Elétrica'],
                  ['conc_hidraulica', 'Hidráulica'],
                  ['conc_agua_pluvial', 'Água Pluvial'],
                  ['conc_incendio', 'Incêndio'],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
                    <StatusSelect value={controleOS[field]} onChange={(v) => handleFieldChange(field, v)} />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Monitoramento */}
            <TabsContent value="monitoramento" className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Monitoramento</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  ['briefing', 'Briefing'],
                  ['cronograma', 'Cronograma'],
                  ['lmd', 'LMD'],
                  ['entregas_x_etapas', 'Entregas x Etapas'],
                ].map(([campo, label]) => (
                  <div key={campo}>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">{label}</label>
                    <StatusSelect
                      value={controleOS.monitoramento?.[campo]}
                      onChange={(v) => handleMonitoramentoChange(campo, v)}
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Planejamento — todas as disciplinas */}
            <TabsContent value="planejamento" className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Planejamento por Disciplina</h3>
              {DISCIPLINAS_PLANEJAMENTO.map(({ key, label }) => (
                <DisciplinaSection
                  key={key}
                  label={label}
                  data={controleOS.planejamento?.[key]}
                  onChange={(campo, v) => handlePlanejamentoChange(key, campo, v)}
                />
              ))}
            </TabsContent>

            {/* Memorial */}
            <TabsContent value="memorial" className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Memorial / Especificação / Mark-up</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Memorial</label>
                  <StatusSelect
                    value={controleOS.planejamento?.memorial?.matlib}
                    onChange={(v) => handlePlanejamentoChange('memorial', 'matlib', v)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Esp. Técnica</label>
                  <StatusSelect
                    value={controleOS.planejamento?.memorial?.esp_tec}
                    onChange={(v) => handlePlanejamentoChange('memorial', 'esp_tec', v)}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Mark-up</label>
                  <StatusSelect value={controleOS.markup} onChange={(v) => handleFieldChange('markup', v)} />
                </div>
              </div>
            </TabsContent>

            {/* Atividades Vinculadas */}
            {atividadesVinculadas.length > 0 && (
              <TabsContent value="atividades" className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 border-b pb-2">Atividades do Empreendimento</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {atividadesVinculadas.map(ativ => (
                    <div key={ativ.key}>
                      <label className="text-sm font-medium text-gray-700 mb-1 block truncate" title={ativ.nome}>
                        {ativ.nome}
                      </label>
                      <StatusSelect
                        value={controleOS.atividades_vinculadas?.[ativ.key]}
                        onChange={(v) => handleAtividadeChange(ativ.key, v)}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>

          {/* Avanço */}
          <div>
            <div className="flex items-center justify-between mb-4 border-b pb-2">
              <h3 className="text-lg font-semibold text-gray-800">Avanço</h3>
              <Button onClick={handleAddAvancoItem} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Item
              </Button>
            </div>

            {controleOS.avanco && controleOS.avanco.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-800">
                      <TableHead className="text-white font-semibold">Etapa</TableHead>
                      <TableHead className="text-white font-semibold w-[200px]">Status</TableHead>
                      <TableHead className="text-white font-semibold">Observações</TableHead>
                      <TableHead className="text-white font-semibold w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {controleOS.avanco.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select value={item.etapa || ''} onValueChange={(v) => handleAvancoChange(index, 'etapa', v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione a etapa" />
                            </SelectTrigger>
                            <SelectContent>
                              {ETAPAS_OPTIONS.map(etapa => (
                                <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <StatusSelect value={item.status} onChange={(v) => handleAvancoChange(index, 'status', v)} />
                        </TableCell>
                        <TableCell>
                          <Textarea
                            value={item.observacoes || ''}
                            onChange={(e) => handleAvancoChange(index, 'observacoes', e.target.value)}
                            placeholder="Observações"
                            className="min-h-[60px] w-full"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAvancoItem(index)}
                            className="text-red-600 hover:text-red-800 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 border border-dashed rounded-lg">
                Nenhum item de avanço adicionado. Clique em "Adicionar Item" para começar.
              </div>
            )}
          </div>

          {/* Observações */}
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-800 border-b pb-2">Observações</h3>
            <Textarea
              value={controleOS.observacoes || ''}
              onChange={(e) => handleFieldChange('observacoes', e.target.value)}
              placeholder="Adicione observações gerais sobre o controle de OS..."
              className="min-h-[100px]"
            />
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
