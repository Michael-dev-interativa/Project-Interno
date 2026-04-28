// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Printer, Save, FileText, Loader2, Upload, X, File, ZoomIn, CalendarPlus, FileUp, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ItemPRE, Disciplina, Usuario, PlanejamentoAtividade } from "@/entities/all";
import NovoPlanejamentoModal from "@/components/planejamento/NovoPlanejamentoModal";
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
  const [lightboxImg, setLightboxImg] = useState(null);
  const [showPlanejamentoModal, setShowPlanejamentoModal] = useState(false);
  const [itemParaPlanejar, setItemParaPlanejar] = useState(/** @type {any} */ (null));
  const [usuarios, setUsuarios] = useState(/** @type {any[]} */ ([]));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = React.useRef(/** @type {{ x: number; y: number } | null} */ (null));
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const [lastSaved, setLastSaved] = useState(/** @type {Date | null} */ (null));
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSelectedFile, setImportSelectedFile] = useState(null);
  const importFileRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [disciplinas, setDisciplinas] = useState(/** @type {any[]} */ ([]));
  const [filtroDispline, setFiltroDispline] = useState('todas');
  const [headerData, setHeaderData] = useState({
    cliente: empreendimento?.cliente || '',
    obra: empreendimento?.nome || '',
    descricao: '',
    data: format(new Date(), 'dd/MM/yyyy'),
    rev: '',
    arquivo: ''
  });
  const saveTimeoutRef = React.useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));

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

  // AutoSave com debounce — só para itens já persistidos (sem temp-)
  useEffect(() => {
    const hasPersistedItems = /** @type {any[]} */ (items).some(i => !String(i.id).startsWith('temp-'));
    if (!hasPersistedItems) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 8000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [items]);

  // Recarrega dados ao montar o componente
  useEffect(() => {
    if (empreendimento?.id) {
      loadItems(empreendimento.id);
    }
  }, []);

  // Carrega disciplinas e usuários ao montar
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [discs, users] = await Promise.all([
          retryWithBackoff(() => Disciplina.list(), 3, 2000, 'PRETab-Disciplinas'),
          retryWithBackoff(() => Usuario.list(), 3, 2000, 'PRETab-Usuarios'),
        ]);
        setDisciplinas(discs || []);
        setUsuarios(users || []);
      } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
      }
    };
    loadInitialData();
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
      setItems(sortedItems);
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
      disciplina: '',
      status: 'Em andamento',
      resposta: '',
      imagens: [],
      tempo_atendimento: null,
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
        disciplina: updatedItem.disciplina,
        status: updatedItem.status || '',
        resposta: updatedItem.resposta,
        imagens: updatedItem.imagens,
        tempo_atendimento: updatedItem.tempo_atendimento ?? null,
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

    // Captura snapshot dos itens no momento do save para não sobrescrever edições posteriores
    const itemsSnapshot = items;

    setIsSaving(true);
    try {
      const saveResults = await Promise.all(
        itemsSnapshot.map(async (item) => {
          const itemData = {
            empreendimento_id: empreendimento.id,
            item: item.item,
            data: item.data,
            de: item.de,
            descritiva: item.descritiva,
            localizacao: item.localizacao,
            assunto: item.assunto,
            comentario: item.comentario,
            disciplina: item.disciplina,
            status: item.status || '',
            resposta: item.resposta,
            imagens: item.imagens || [],
            tempo_atendimento: item.tempo_atendimento ?? null,
            planejamento_executor: item.planejamento_executor ?? null,
            planejamento_executor_nome: item.planejamento_executor_nome ?? null,
          };

          if (item.isNew || item.id.toString().startsWith('temp-')) {
            const created = await retryWithBackoff(() => ItemPRE.create(itemData), 3, 2000, 'PRE-Create');
            return { tempId: item.id, realId: created?.id ?? null };
          } else {
            await retryWithBackoff(() => ItemPRE.update(item.id, itemData), 3, 2000, `PRE-Update-${item.id}`);
            return { tempId: null, realId: null };
          }
        })
      );

      // Substitui IDs temporários pelos reais sem sobrescrever edições em andamento
      setItems(prev => prev.map(item => {
        const result = saveResults.find(r => r.tempId === item.id);
        if (result?.realId) {
          return { ...item, id: result.realId, isNew: false };
        }
        return item;
      }));

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

  const handleDownloadTemplate = () => {
    const headers = ['item', 'data', 'de', 'descritiva', 'localizacao', 'assunto', 'comentario', 'tempo_atendimento', 'status', 'resposta'];
    const exemplo = ['1', '2026-03-27', 'Cliente XYZ', 'Elétrica', 'Pavimento 1', 'Assunto do item', 'Comentário detalhado', '2', 'Em andamento', ''];
    const csvContent = [headers.join(';'), exemplo.join(';')].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_pre.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
  };

  const handleImportFile = async (file) => {
    setIsImporting(true);
    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv');

      let rows = [];

      if (isCSV) {
        const text = await file.text();
        rows = parseCSV(text);
      } else {
        // Excel: usa extração via IA
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item: { type: 'string' },
                    data: { type: 'string' },
                    de: { type: 'string' },
                    descritiva: { type: 'string' },
                    localizacao: { type: 'string' },
                    assunto: { type: 'string' },
                    comentario: { type: 'string' },
                    disciplina: { type: 'string' },
                    status: { type: 'string' },
                    resposta: { type: 'string' },
                  }
                }
              }
            }
          }
        });
        if (result.status !== 'success' || !result.output?.items?.length) {
          alert('Não foi possível extrair dados do arquivo Excel. Verifique o formato.');
          return;
        }
        rows = result.output.items;
      }

      if (!rows.length) {
        alert('Nenhum dado encontrado no arquivo. Verifique o formato.');
        return;
      }

      const novosItens = rows.map((row, idx) => ({
        id: `temp-import-${Date.now()}-${idx}`,
        empreendimento_id: empreendimento.id,
        item: row.item || String(items.length + idx + 1),
        data: row.data || format(new Date(), 'yyyy-MM-dd'),
        de: row.de || '',
        descritiva: row.descritiva || row.disciplina || '',
        localizacao: row.localizacao || '',
        assunto: row.assunto || '',
        comentario: row.comentario || '',
        tempo_atendimento: row.tempo_atendimento ? parseFloat(String(row.tempo_atendimento).replace(',', '.')) : 0,
        disciplina: row.disciplina || '',
        status: row.status || 'Em andamento',
        resposta: row.resposta || '',
        imagens: [],
        isNew: true,
      }));

      setItems(prev => [...prev, ...novosItens]);
      alert(`${novosItens.length} item(s) importado(s)! Clique em Salvar para persistir.`);
    } catch (e) {
      console.error(e);
      alert('Erro ao importar arquivo.');
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const filteredItems = useMemo(() => {
    if (filtroDispline === 'todas') return items;
    return items.filter(item => item.descritiva === filtroDispline);
  }, [items, filtroDispline]);

  return (
    <>
      <style>{printStyles}</style>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col items-center justify-center no-print"
          onClick={() => { setLightboxImg(null); setZoom(1); setPan({ x: 0, y: 0 }); }}
        >
          {/* Controles */}
          <div className="flex items-center gap-3 mb-4 z-10" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              className="bg-white text-gray-800 rounded-full w-9 h-9 flex items-center justify-center shadow-lg hover:bg-gray-100 text-lg font-bold"
              title="Diminuir zoom"
            >−</button>
            <span className="text-white text-sm font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(4, z + 0.25))}
              className="bg-white text-gray-800 rounded-full w-9 h-9 flex items-center justify-center shadow-lg hover:bg-gray-100 text-lg font-bold"
              title="Aumentar zoom"
            >+</button>
            <button
              onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="bg-white text-gray-800 rounded px-3 h-9 flex items-center justify-center shadow-lg hover:bg-gray-100 text-xs font-medium"
            >Reset</button>
            <button
              onClick={() => { setLightboxImg(null); setZoom(1); setPan({ x: 0, y: 0 }); }}
              className="bg-white text-gray-800 rounded-full w-9 h-9 flex items-center justify-center shadow-lg hover:bg-gray-100 ml-4"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Imagem com zoom e pan */}
          <div
            className="overflow-hidden max-w-[90vw] max-h-[80vh] relative"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault();
              setZoom(z => Math.min(4, Math.max(0.5, z + (e.deltaY < 0 ? 0.1 : -0.1))));
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
              dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            }}
            onMouseMove={(e) => {
              if (!isDragging || !dragStart.current) return;
              setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            <img
              src={lightboxImg}
              alt="Imagem ampliada"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s',
                userSelect: 'none',
                pointerEvents: 'none'
              }}
              className="rounded-lg shadow-2xl block max-w-[90vw] max-h-[80vh] object-contain"
              draggable={false}
            />
          </div>
          <p className="text-gray-400 text-xs mt-3">Use o scroll do mouse ou os botões para dar zoom</p>
        </div>
      )}

      {showPlanejamentoModal && itemParaPlanejar && (
        <NovoPlanejamentoModal
          isOpen={showPlanejamentoModal}
          onClose={() => { setShowPlanejamentoModal(false); setItemParaPlanejar(null); }}
          empreendimentos={empreendimento ? [empreendimento] : /** @type {any[]} */ ([])}
          usuarios={usuarios}
          atividades={[]}
          descritivo_inicial={[
            empreendimento?.num_proposta ? `OS ${empreendimento.num_proposta}` : null,
            empreendimento?.nome || null,
            `Item ${itemParaPlanejar.item}`,
            itemParaPlanejar.de || null,
            itemParaPlanejar.assunto || itemParaPlanejar.descritiva || null,
          ].filter(Boolean).join(' - ')}
          tempo_planejado_inicial={itemParaPlanejar.tempo_atendimento || null}
          onSuccess={async (result) => {
            if (result?.executor_principal && itemParaPlanejar?.id) {
              const executorEmail = result.executor_principal;
              const usuarioEncontrado = usuarios.find(u => u.email === executorEmail);
              const nomeExecutor = usuarioEncontrado?.nome || executorEmail;
              const updatedItem = { ...itemParaPlanejar, planejamento_executor: executorEmail, planejamento_executor_nome: nomeExecutor };
              // Salva no banco
              if (!itemParaPlanejar.id.toString().startsWith('temp-')) {
                await retryWithBackoff(() => ItemPRE.update(itemParaPlanejar.id, {
                  empreendimento_id: itemParaPlanejar.empreendimento_id,
                  item: itemParaPlanejar.item,
                  data: itemParaPlanejar.data,
                  de: itemParaPlanejar.de,
                  descritiva: itemParaPlanejar.descritiva,
                  localizacao: itemParaPlanejar.localizacao,
                  assunto: itemParaPlanejar.assunto,
                  comentario: itemParaPlanejar.comentario,
                  disciplina: itemParaPlanejar.disciplina,
                  status: itemParaPlanejar.status || '',
                  resposta: itemParaPlanejar.resposta,
                  imagens: itemParaPlanejar.imagens || [],
                  tempo_atendimento: itemParaPlanejar.tempo_atendimento ?? null,
                  planejamento_executor: executorEmail,
                  planejamento_executor_nome: nomeExecutor,
                }), 3, 2000, 'PRE-Update-Executor');
              }
              setItems(prev => prev.map(it => it.id === itemParaPlanejar.id ? updatedItem : it));
            }
            setShowPlanejamentoModal(false);
            setItemParaPlanejar(null);
          }}
        />
      )}

      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar PRE</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-1">
              <div className="flex items-center gap-2 font-semibold text-blue-800 mb-2">
                <FileText className="w-4 h-4" />
                Instruções
              </div>
              <p className="text-blue-700">• Envie um arquivo CSV com os itens PRE</p>
              <p className="text-blue-700">• Colunas obrigatórias: <strong>item</strong>, <strong>data</strong></p>
              <p className="text-blue-700">• Colunas opcionais: de, descritiva, localizacao, assunto, comentario, tempo_atendimento, status, resposta</p>
              <p className="text-blue-700">• Formato de data: YYYY-MM-DD (ex: 2026-03-27)</p>
              <p className="text-blue-700">• Separador: ponto e vírgula (;) ou vírgula (,)</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleDownloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Baixar Template CSV
            </Button>
            <div>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportSelectedFile(f); }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancelar</Button>
              <Button
                disabled={!importSelectedFile || isImporting}
                onClick={async () => {
                  if (!importSelectedFile) return;
                  await handleImportFile(importSelectedFile);
                  setShowImportModal(false);
                  setImportSelectedFile(null);
                }}
              >
                {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
                Importar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportSelectedFile(f); }}
            />
            <Button variant="outline" onClick={() => { setImportSelectedFile(null); setShowImportModal(true); }} disabled={isImporting}>
              {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
              Importar PRE
            </Button>
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

          <div className="border-b border-gray-400 p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            <div className="no-print flex items-center gap-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Filtrar por Disciplina:</label>
              <Select value={filtroDispline} onValueChange={setFiltroDispline}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Todas as disciplinas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as disciplinas</SelectItem>
                  {Array.from(new Set(items.map(item => item.descritiva).filter(Boolean))).sort().map(desc => (
                    <SelectItem key={desc} value={desc}>
                      {desc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filtroDispline !== 'todas' && (
                <span className="text-sm text-blue-700 font-medium">
                  ({filteredItems.length})
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4 p-4">
            {filteredItems.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">{items.length === 0 ? 'Nenhum item cadastrado. Clique em "Adicionar Item" para começar.' : 'Nenhum item encontrado para a disciplina selecionada.'}</p>
                </CardContent>
              </Card>
            ) : (
              filteredItems.map((item) => (
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
                            accept="image/*,.pdf"
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
                            Anexar Imagem ou PDF
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(item.imagens || []).map((imgUrl, idx) => (
                            <div key={idx} className="relative group flex-shrink-0">
                              {imgUrl.toLowerCase().endsWith('.pdf') ? (
                                <a
                                  href={imgUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-32 h-32 rounded border cursor-pointer hover:opacity-80 transition-all flex flex-col items-center justify-center bg-gray-50 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                >
                                  <File className="w-6 h-6 mb-1" />
                                  PDF
                                </a>
                              ) : (
                                <img
                                  src={imgUrl}
                                  alt={`Imagem ${idx + 1}`}
                                  className="w-32 h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition-all"
                                  onClick={() => setLightboxImg(imgUrl)}
                                  title="Clique para ampliar"
                                />
                              )}
                              {/* Botão ampliar - canto inferior esquerdo */}
                              {!imgUrl.toLowerCase().endsWith('.pdf') && (
                                <button
                                  type="button"
                                  onClick={() => setLightboxImg(imgUrl)}
                                  className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                                  title="Ampliar imagem"
                                >
                                  <ZoomIn className="w-3 h-3" />
                                </button>
                              )}
                              {/* Botão remover - canto superior direito */}
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(item.id, imgUrl)}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print"
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
                  <div className="w-1/5 p-4 space-y-4 flex flex-col min-h-0">
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
                          value={item.data ? item.data.toString().substring(0, 10) : ''}
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

                    {/* Tempo de Atendimento */}
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Tempo (horas)</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={item.tempo_atendimento !== null && item.tempo_atendimento !== undefined ? String(Number(item.tempo_atendimento)) : ''}
                        onChange={(e) => handleUpdateItem(item.id, 'tempo_atendimento', e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-9 text-sm print:border-none print:bg-transparent"
                        disabled={readOnly}
                        placeholder="0.0"
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
                    <div className="pt-4 no-print space-y-2">
                      {item.planejamento_executor ? (
                        <div className="space-y-1">
                          <div className="w-full flex items-center gap-1 px-3 py-2 rounded-md border border-green-200 bg-green-50 text-green-700 text-sm">
                            <CalendarPlus className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate font-medium text-xs">{item.planejamento_executor_nome || item.planejamento_executor}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
                            onClick={async () => {
                              if (!confirm('Remover executor vinculado? Isso permitirá planejar novamente.')) return;
                              const updatedItem = { ...item, planejamento_executor: null, planejamento_executor_nome: null };
                              if (!item.id.toString().startsWith('temp-')) {
                                await retryWithBackoff(() => ItemPRE.update(item.id, {
                                  empreendimento_id: item.empreendimento_id,
                                  item: item.item,
                                  data: item.data,
                                  de: item.de,
                                  descritiva: item.descritiva,
                                  localizacao: item.localizacao,
                                  assunto: item.assunto,
                                  comentario: item.comentario,
                                  disciplina: item.disciplina,
                                  status: item.status || '',
                                  resposta: item.resposta,
                                  imagens: item.imagens || [],
                                  tempo_atendimento: item.tempo_atendimento ?? null,
                                  planejamento_executor: null,
                                  planejamento_executor_nome: null,
                                }), 3, 2000, 'PRE-Remove-Executor');
                              }
                              setItems(prev => prev.map(it => it.id === item.id ? updatedItem : it));
                            }}
                          >
                            <X className="w-3 h-3 mr-1" />
                            Remover executor
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
                          onClick={() => { setItemParaPlanejar(item); setShowPlanejamentoModal(true); }}
                        >
                          <CalendarPlus className="w-4 h-4 mr-2" />
                          Planejar
                        </Button>
                      )}
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          className="w-full text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </Button>
                      )}
                    </div>
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