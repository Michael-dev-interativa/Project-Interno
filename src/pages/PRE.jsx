import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Printer, Save, FileText, Loader2, Upload, Image as ImageIcon, X, CheckCircle } from "lucide-react";
import { Empreendimento, ItemPRE } from "@/entities/all";
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
  
  /* Ajustar larguras das colunas */
  table td:nth-child(1) { width: 4%; }   /* Item */
  table td:nth-child(2) { width: 7%; }   /* Data */
  table td:nth-child(3) { width: 8%; }   /* De */
  table td:nth-child(4) { width: 12%; }  /* Descritiva */
  table td:nth-child(5) { width: 8%; }   /* Localização */
  table td:nth-child(6) { width: 18%; }  /* Assunto */
  table td:nth-child(7) { width: 20%; }  /* Comentário */
  table td:nth-child(8) { width: 8%; }   /* Status */
  table td:nth-child(9) { width: 15%; }  /* Resposta */
  
  /* Quebrar palavras longas */
  td {
    word-wrap: break-word;
    word-break: break-word;
    overflow-wrap: break-word;
  }
}
`;

export default function PRE() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [items, setItems] = useState([]);
  const [expandedImage, setExpandedImage] = useState(null);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [autoSaveInProgress, setAutoSaveInProgress] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const [headerData, setHeaderData] = useState({
    cliente: '',
    obra: '',
    descricao: '',
    data: format(new Date(), 'dd/MM/yyyy'),
    rev: '',
    arquivo: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedEmp) {
      const emp = empreendimentos.find(e => e.id === selectedEmp);
      if (emp) {
        setHeaderData(prev => ({
          ...prev,
          cliente: emp.cliente || '',
          obra: emp.nome || ''
        }));
        loadItems(selectedEmp);
      }
    } else {
      setItems([]);
    }
  }, [selectedEmp]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const emps = await retryWithBackoff(() => Empreendimento.list(), 3, 2000, 'PRE-Empreendimentos');
      setEmpreendimentos(emps || []);
    } catch (error) {
      console.error('Erro ao carregar empreendimentos:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
      setItems(sortedItems);
    } catch (error) {
      console.error('Erro ao carregar itens:', error);
      setItems([]);
    }
  };

  const handleAddItem = () => {
    const newItem = {
      id: `temp-${Date.now()}`,
      empreendimento_id: selectedEmp,
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
    // Ativar auto-save ao modificar item
    triggerAutoSave();
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
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setItems(prev => prev.map(item => 
        item.id === itemId 
          ? { ...item, imagens: [...(item.imagens || []), file_url] } 
          : item
      ));
    } catch (error) {
      console.error('Erro ao fazer upload da imagem:', error);
      alert('Erro ao fazer upload da imagem.');
    }
  };

  const handleRemoveImage = (itemId, imageUrl) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, imagens: (item.imagens || []).filter(url => url !== imageUrl) } 
        : item
    ));
  };

  // Salvamento automático com debounce
  const triggerAutoSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    
    autoSaveTimerRef.current = setTimeout(() => {
      handleAutoSave();
    }, 2000); // Aguarda 2 segundos de inatividade antes de salvar
  };

  const handleAutoSave = async () => {
    if (!selectedEmp || autoSaveInProgress) return;

    setAutoSaveInProgress(true);
    try {
      for (const item of items) {
        // Apenas salvar itens que foram modificados ou são novos
        if (item.id.toString().startsWith('temp-') || item.isNew) {
          const itemData = {
            empreendimento_id: selectedEmp,
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
            const created = await retryWithBackoff(() => ItemPRE.create(itemData), 3, 2000, 'PRE-AutoCreate');
            // Atualizar item na lista com ID real
            setItems(prev => prev.map(i => i.id === item.id ? { ...created, isNew: false } : i));
          }
        } else {
          // Para itens existentes, atualizar com os dados mais recentes
          const itemData = {
            empreendimento_id: selectedEmp,
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

          await retryWithBackoff(() => ItemPRE.update(item.id, itemData), 3, 2000, `PRE-AutoUpdate-${item.id}`);
        }
      }
      setLastSavedTime(new Date());
    } catch (error) {
      console.error('Erro no auto-save:', error);
    } finally {
      setAutoSaveInProgress(false);
    }
  };

  const handleSave = async () => {
    if (!selectedEmp) {
      alert('Selecione um empreendimento primeiro.');
      return;
    }

    setIsSaving(true);
    try {
      const savedItems = [];
      
      for (const item of items) {
        const itemData = {
          empreendimento_id: selectedEmp,
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
          const created = await retryWithBackoff(() => ItemPRE.create(itemData), 3, 2000, 'PRE-Create');
          savedItems.push(created);
        } else {
          const updated = await retryWithBackoff(() => ItemPRE.update(item.id, itemData), 3, 2000, `PRE-Update-${item.id}`);
          savedItems.push(updated);
        }
      }
      
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
      setLastSavedTime(new Date());
      alert('Dados salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <>
      <style>{printStyles}</style>
      <div className="p-6 bg-gray-50 min-h-screen print:p-0 print:bg-white">
        {/* Barra de Ações */}
        <div className="mb-4 flex justify-between items-center no-print">
          <h1 className="text-2xl font-bold text-gray-800">PRE - Emails, ATA e Documentos</h1>
          <div className="flex gap-2">
            <Select value={selectedEmp || ''} onValueChange={setSelectedEmp}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Selecione o empreendimento" />
              </SelectTrigger>
              <SelectContent>
                {empreendimentos.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleSave} disabled={isSaving || !selectedEmp}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!selectedEmp}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button onClick={handleAddItem} disabled={!selectedEmp}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Item
            </Button>
          </div>
        </div>

        {!selectedEmp ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">Selecione um Empreendimento</h3>
              <p className="text-gray-500">Escolha um empreendimento no menu acima para começar.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Indicador de Auto-Save */}
            {autoSaveInProgress && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 no-print">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-700">Salvando automaticamente...</span>
              </div>
            )}
            {lastSavedTime && !autoSaveInProgress && (
             <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 no-print">
               <CheckCircle className="w-4 h-4 text-green-600" />
               <span className="text-sm text-green-700">Salvo automaticamente em {format(lastSavedTime, 'HH:mm:ss')}</span>
             </div>
            )}
            <div className="bg-white border border-gray-400 shadow-lg">
            {/* Cabeçalho */}
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

            {/* Info do Cliente */}
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

            {/* Container de Itens */}
            <div className="space-y-4">
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
                      {/* De */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">De</label>
                        <Textarea
                          value={item.de}
                          onChange={(e) => handleUpdateItem(item.id, 'de', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-none"
                          rows={3}
                          placeholder="De quem..."
                        />
                      </div>

                      {/* Descritiva */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Descritiva</label>
                        <Textarea
                          value={item.descritiva}
                          onChange={(e) => handleUpdateItem(item.id, 'descritiva', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-y"
                          placeholder="Descrição detalhada..."
                        />
                      </div>

                      {/* Assunto */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Assunto</label>
                        <Textarea
                          value={item.assunto}
                          onChange={(e) => handleUpdateItem(item.id, 'assunto', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-y"
                          rows={3}
                          placeholder="Assunto..."
                        />
                      </div>

                      {/* Comentário */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Comentário</label>
                        <Textarea
                          value={item.comentario}
                          onChange={(e) => handleUpdateItem(item.id, 'comentario', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-y"
                          rows={4}
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
                          <label className="no-print">
                            <input
                              type="file"
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
                              onClick={(e) => e.currentTarget.previousElementSibling.click()}
                            >
                              <Upload className="w-3 h-3 mr-2" />
                              Anexar Imagem
                            </Button>
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {(item.imagens || []).map((imgUrl, idx) => (
                              <div key={idx} className="relative group">
                                <img
                                  src={imgUrl}
                                  alt={`Imagem ${idx + 1}`}
                                  className="w-full h-24 object-cover rounded border cursor-pointer hover:opacity-80 transition-all"
                                  onClick={() => setExpandedImage(imgUrl)}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleRemoveImage(item.id, imgUrl);
                                  }}
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
                        <Input
                          value={item.item}
                          onChange={(e) => handleUpdateItem(item.id, 'item', e.target.value)}
                          className="h-9 text-sm text-center font-medium print:border-none print:bg-transparent"
                        />
                      </div>

                      {/* Data */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Data</label>
                        <Input
                          type="date"
                          value={item.data}
                          onChange={(e) => handleUpdateItem(item.id, 'data', e.target.value)}
                          className="h-9 text-sm print:border-none print:bg-transparent"
                        />
                      </div>

                      {/* Localização */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Localização</label>
                        <Textarea
                          value={item.localizacao}
                          onChange={(e) => handleUpdateItem(item.id, 'localizacao', e.target.value)}
                          className="w-full text-sm print:border-none print:bg-transparent resize-none"
                          rows={3}
                          placeholder="Localização..."
                        />
                      </div>

                      {/* Status */}
                      <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
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
                      </div>

                      {/* Ações */}
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
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          </>
        )}

        {/* Modal de Imagem Expandida */}
        {expandedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4 no-print"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
              <img
                src={expandedImage}
                alt="Imagem expandida"
                className="max-w-full max-h-full object-contain"
              />
              <button
                onClick={() => setExpandedImage(null)}
                className="absolute top-4 right-4 bg-white text-gray-800 rounded-full p-2 hover:bg-gray-200 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}