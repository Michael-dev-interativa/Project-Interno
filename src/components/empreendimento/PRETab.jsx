import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Printer, Save, FileText, Loader2, Upload, X } from "lucide-react";
import { ItemPRE } from "@/entities/all";
import { format } from "date-fns";
import { retryWithBackoff } from "@/components/utils/apiUtils";
import { base44 } from "@/api/base44Client";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/577f93874_logo_Interativa_versao_final_sem_fundo_0002.png";

const STATUS_COLORS = {
  "Em andamento": "bg-yellow-200",
  "Pendente": "bg-red-300",
  "Concluído": "bg-green-200",
  "Cancelado": "bg-red-200"
};

const printStyles = `
@media print {
  @page {
    size: A4 landscape;
    margin: 5mm;
  }
  
  .no-print {
    display: none !important;
  }
  
  body {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
    font-size: 8pt;
  }
  
  table {
    page-break-inside: auto;
    width: 100%;
    border-collapse: collapse;
  }
  
  tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }
  
  thead {
    display: table-header-group;
  }
  
  td, th {
    font-size: 7pt !important;
    padding: 1mm !important;
    line-height: 1.2;
    vertical-align: top;
  }
  
  textarea, input {
    font-size: 7pt !important;
    padding: 0 !important;
    line-height: 1.2 !important;
  }
  
  table td:nth-child(1) { width: 4%; }
  table td:nth-child(2) { width: 7%; }
  table td:nth-child(3) { width: 8%; }
  table td:nth-child(4) { width: 12%; }
  table td:nth-child(5) { width: 8%; }
  table td:nth-child(6) { width: 16%; }
  table td:nth-child(7) { width: 13%; }
  table td:nth-child(8) { width: 8%; }
  table td:nth-child(9) { width: 12%; }
  table td:nth-child(10) { width: 6%; }
  
  td {
    word-wrap: break-word;
    word-break: break-word;
    overflow-wrap: break-word;
  }
}
`;

export default function PRETab({ empreendimento, readOnly = false }) {
  const [isSaving, setIsSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [lastSaved, setLastSaved] = useState(null);
  const [headerData, setHeaderData] = useState({
    cliente: empreendimento?.cliente || '',
    obra: empreendimento?.nome || '',
    descricao: '',
    data: format(new Date(), 'dd/MM/yyyy'),
    rev: '',
    arquivo: ''
  });
  const saveTimeoutRef = React.useRef(null);

  useEffect(() => {
    if (empreendimento) {
      setHeaderData(prev => ({
        ...prev,
        cliente: empreendimento.cliente || '',
        obra: empreendimento.nome || ''
      }));
      loadItems(empreendimento.id);
    }
  }, [empreendimento?.id]);

  // Recarrega dados ao montar o componente
  useEffect(() => {
    if (empreendimento?.id) {
      loadItems(empreendimento.id);
    }
  }, []);





  const loadItems = async (empId) => {
    try {
      const itemsList = await retryWithBackoff(
        () => ItemPRE.filter({ empreendimento_id: empId }),
        3, 2000,
        'PRE-Items'
      );
      const sortedItems = (itemsList || []).sort((a, b) => {
        const parseItem = (str) => {
          const parts = String(str).split('.');
          return parts.map(p => parseInt(p) || 0);
        };

        const partsA = parseItem(a.item);
        const partsB = parseItem(b.item);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const numA = partsA[i] || 0;
          const numB = partsB[i] || 0;
          if (numA !== numB) return numA - numB;
        }
        return 0;
      });
      // Normalize null fields to avoid passing `null` to controlled inputs
      const normalized = sortedItems.map(it => ({
        ...it,
        de: it.de == null ? '' : it.de,
        descritiva: it.descritiva == null ? '' : it.descritiva,
        assunto: it.assunto == null ? '' : it.assunto,
        comentario: it.comentario == null ? '' : it.comentario,
        resposta: it.resposta == null ? '' : it.resposta,
        localizacao: it.localizacao == null ? '' : it.localizacao,
        imagens: it.imagens == null ? [] : (Array.isArray(it.imagens) ? it.imagens : (typeof it.imagens === 'string' ? JSON.parse(it.imagens || '[]') : []))
      }));
      setItems(normalized);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      setItems([]);
    }
  };

  const handleAddItem = () => {
    const newItem = {
      id: `temp-${Date.now()}`,
      empreendimento_id: empreendimento.id,
      item: String(items.length + 1),
      data: format(new Date(), 'yyyy-MM-dd'),
      de: '',
      descritiva: '',
      localizacao: '',
      assunto: '',
      comentario: '',
      status: 'Em andamento',
      resposta: '',
      imagens: [],
      isNew: true
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (id, field, value) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleDeleteItem = async (id) => {
    if (!confirm('Deseja excluir este item?')) return;

    try {
      if (!id.toString().startsWith('temp-')) {
        await retryWithBackoff(() => ItemPRE.delete(id), 3, 2000, `PRE-Delete-${id}`);
      }
      setItems(prev => prev.filter(item => item.id !== id));
    } catch (error) {
      console.error('Erro ao excluir item:', error);
      alert('Erro ao excluir item.');
    }
  };

  const handleUploadImage = async (itemId, file) => {
    try {
      setIsSaving(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Encontra o item e atualiza com a nova imagem
      const itemToUpdate = items.find(item => item.id === itemId);
      if (!itemToUpdate) return;

      const updatedItem = {
        ...itemToUpdate,
        imagens: [...(itemToUpdate.imagens || []), file_url]
      };

      // Prepara dados para salvar
      const itemData = {
        empreendimento_id: empreendimento.id,
        item: updatedItem.item,
        data: updatedItem.data,
        de: updatedItem.de,
        descritiva: updatedItem.descritiva,
        localizacao: updatedItem.localizacao,
        assunto: updatedItem.assunto,
        comentario: updatedItem.comentario,
        status: updatedItem.status || '',
        resposta: updatedItem.resposta,
        imagens: updatedItem.imagens
      };

      // Salva no banco
      if (updatedItem.isNew || updatedItem.id.toString().startsWith('temp-')) {
        const created = await retryWithBackoff(() => ItemPRE.create(itemData), 3, 2000, 'PRE-Create');
        setItems(prev => prev.map(item => item.id === itemId ? created : item));
      } else {
        await retryWithBackoff(() => ItemPRE.update(updatedItem.id, itemData), 3, 2000, `PRE-Update-${updatedItem.id}`);
        setItems(prev => prev.map(item => item.id === itemId ? updatedItem : item));
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Erro ao fazer upload da imagem:', error);
      alert('Erro ao fazer upload da imagem.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveImage = (itemId, imageUrl) => {
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, imagens: (item.imagens || []).filter(url => url !== imageUrl) }
        : item
    ));
  };

  const handleAutoSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      // Salvar todos os itens em paralelo
      const savePromises = items.map(async (item) => {
        const itemData = {
          empreendimento_id: empreendimento.id,
          item: item.item,
          data: item.data,
          de: item.de,
          descritiva: item.descritiva,
          localizacao: item.localizacao,
          assunto: item.assunto,
          comentario: item.comentario,
          status: item.status || '',
          resposta: item.resposta,
          imagens: item.imagens || []
        };

        if (item.isNew || item.id.toString().startsWith('temp-')) {
          return retryWithBackoff(() => ItemPRE.create(itemData), 3, 2000, 'PRE-Create');
        } else {
          return retryWithBackoff(() => ItemPRE.update(item.id, itemData), 3, 2000, `PRE-Update-${item.id}`);
        }
      });

      const savedItems = await Promise.all(savePromises);

      const sortedSavedItems = savedItems.sort((a, b) => {
        const parseItem = (str) => {
          const parts = String(str).split('.');
          return parts.map(p => parseInt(p) || 0);
        };

        const partsA = parseItem(a.item);
        const partsB = parseItem(b.item);

        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const numA = partsA[i] || 0;
          const numB = partsB[i] || 0;
          if (numA !== numB) return numA - numB;
        }
        return 0;
      });
      setItems(sortedSavedItems);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Erro ao salvar:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    await handleAutoSave();
    alert('Dados salvos com sucesso!');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <style>{printStyles}</style>
      <div className="bg-gray-50 print:bg-white">
        <div className="mb-4 flex justify-between items-center no-print">
          <div className="flex items-center gap-2">
            {readOnly && <Badge variant="outline" className="text-xs">Visualização - Você pode editar Respostas e Anexos</Badge>}
            {isSaving && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Salvando...</span>
              </div>
            )}
            {!isSaving && lastSaved && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <span>✓ Salvo às {format(lastSaved, 'HH:mm:ss')}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Agora
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            {!readOnly && (
              <Button onClick={handleAddItem}>
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Item
              </Button>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-400 shadow-lg">
          <div className="border-b-2 border-gray-800 p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={LOGO_URL} alt="Interativa" className="h-16" />
            </div>
            <div className="text-center flex-1">
              <h2 className="text-xl font-bold text-gray-800">Emails, ATA e Documentos</h2>
            </div>
            <div className="text-right text-sm space-y-1">
              <div>{headerData.data}</div>
              <div className="flex items-center gap-1">
                <span>Rev:</span>
                <Input
                  value={headerData.rev}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, rev: e.target.value }))}
                  className="h-6 w-20 text-xs print:border-none print:bg-transparent"
                />
              </div>
              <div className="flex items-center gap-1">
                <span>Arquivo:</span>
                <Input
                  value={headerData.arquivo || ''}
                  onChange={(e) => setHeaderData(prev => ({ ...prev, arquivo: e.target.value }))}
                  className="h-6 w-20 text-xs print:border-none print:bg-transparent"
                />
              </div>
            </div>
          </div>

          <div className="border-b border-gray-400 p-4 grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Cliente:</label>
              <Input
                value={headerData.cliente}
                onChange={(e) => setHeaderData(prev => ({ ...prev, cliente: e.target.value }))}
                className="mt-1 print:border-none print:bg-transparent"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Descrição:</label>
              <Input
                value={headerData.descricao}
                onChange={(e) => setHeaderData(prev => ({ ...prev, descricao: e.target.value }))}
                className="mt-1 print:border-none print:bg-transparent"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Obra:</label>
              <Input
                value={headerData.obra}
                onChange={(e) => setHeaderData(prev => ({ ...prev, obra: e.target.value }))}
                className="mt-1 print:border-none print:bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-4 p-4">
            {items.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">Nenhum item cadastrado. Clique em "Adicionar Item" para começar.</p>
                </CardContent>
              </Card>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex gap-4 border border-gray-300 rounded-lg overflow-hidden bg-white">
                  {/* Container Principal (80%) */}
                  <div className="w-4/5 p-4 space-y-4 border-r border-gray-300">
                    {/* De, Descritiva e Assunto - lado a lado */}
                    <div className="grid grid-cols-3 gap-3">
                      {/* De */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">De</label>
                        <Textarea
                          value={item.de}
                          onChange={(e) => handleUpdateItem(item.id, 'de', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-none"
                          rows={3}
                          disabled={readOnly}
                          placeholder="De quem..."
                        />
                      </div>

                      {/* Disciplina */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Disciplina</label>
                        <Textarea
                          value={item.descritiva}
                          onChange={(e) => handleUpdateItem(item.id, 'descritiva', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-none"
                          rows={3}
                          disabled={readOnly}
                          placeholder="Disciplina..."
                        />
                      </div>

                      {/* Assunto */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Assunto</label>
                        <Textarea
                          value={item.assunto}
                          onChange={(e) => handleUpdateItem(item.id, 'assunto', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-none"
                          rows={3}
                          disabled={readOnly}
                          placeholder="Assunto..."
                        />
                      </div>
                    </div>

                    {/* Comentário */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Comentário</label>
                      <Textarea
                        value={item.comentario}
                        onChange={(e) => handleUpdateItem(item.id, 'comentario', e.target.value)}
                        className="w-full text-sm print:border-none print:bg-transparent resize-y"
                        rows={4}
                        disabled={readOnly}
                        placeholder="Comentários adicionais..."
                      />
                    </div>

                    {/* Resposta */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Resposta</label>
                      <Textarea
                        value={item.resposta}
                        onChange={(e) => handleUpdateItem(item.id, 'resposta', e.target.value)}
                        className="w-full text-sm print:border-none print:bg-transparent resize-y"
                        rows={3}
                        placeholder="Resposta/Resolução..."
                      />
                    </div>

                    {/* Imagens */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-2">Imagens</label>
                      <div className="space-y-2">
                        <div className="no-print">
                          <input
                            type="file"
                            id={`file-input-${item.id}`}
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadImage(item.id, file);
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => document.getElementById(`file-input-${item.id}`).click()}
                          >
                            <Upload className="w-3 h-3 mr-2" />
                            Anexar Imagem
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {(item.imagens || []).map((imgUrl, idx) => (
                            <div key={idx} className="relative group">
                              <img
                                src={imgUrl}
                                alt={`Imagem ${idx + 1}`}
                                className="w-full rounded border cursor-pointer hover:opacity-80 transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(item.id, imgUrl)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity no-print z-10"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Container Secundário (20%) */}
                  <div className="w-1/5 p-4 space-y-4 flex flex-col">
                    {/* Item */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Item</label>
                      {readOnly ? (
                        <div className="text-sm font-medium p-2 bg-gray-50 rounded">{item.item}</div>
                      ) : (
                        <Input
                          value={item.item}
                          onChange={(e) => handleUpdateItem(item.id, 'item', e.target.value)}
                          className="h-9 text-sm text-center font-medium print:border-none print:bg-transparent"
                        />
                      )}
                    </div>

                    {/* Data */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Data</label>
                      {readOnly ? (
                        <div className="text-sm p-2 bg-gray-50 rounded">{item.data ? format(new Date(item.data), 'dd/MM/yyyy') : ''}</div>
                      ) : (
                        <Input
                          type="date"
                          value={item.data}
                          onChange={(e) => handleUpdateItem(item.id, 'data', e.target.value)}
                          className="h-9 text-sm print:border-none print:bg-transparent"
                        />
                      )}
                    </div>

                    {/* Localização */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Localização</label>
                      <Textarea
                        value={item.localizacao}
                        onChange={(e) => handleUpdateItem(item.id, 'localizacao', e.target.value)}
                        className="w-full text-sm print:border-none print:bg-transparent resize-none"
                        rows={3}
                        disabled={readOnly}
                        placeholder="Localização..."
                      />
                    </div>

                    {/* Status */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
                      {readOnly ? (
                        <div className={`text-sm p-2 rounded text-center font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100'}`}>
                          {item.status || 'Sem status'}
                        </div>
                      ) : (
                        <Select
                          value={item.status}
                          onValueChange={(value) => handleUpdateItem(item.id, 'status', value)}
                        >
                          <SelectTrigger className={`h-9 text-sm print:border-none print:bg-transparent ${STATUS_COLORS[item.status] || ''}`}>
                            <SelectValue placeholder="Sem status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={null}>Sem status</SelectItem>
                            <SelectItem value="Em andamento">Em andamento</SelectItem>
                            <SelectItem value="Pendente">Pendente</SelectItem>
                            <SelectItem value="Concluído">Concluído</SelectItem>
                            <SelectItem value="Cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Ações */}
                    {!readOnly && (
                      <div className="mt-auto pt-4 no-print">
                        <Button
                          variant="ghost"
                          className="w-full text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}