// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Printer, Save, FileText, Loader2, X, ZoomIn, CalendarPlus, FileUp, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ItemPRE, Disciplina, Usuario, PlanejamentoAtividade, Documento } from "@/entities/all";
import { format } from "date-fns";
import { retryWithBackoff } from "@/components/utils/apiUtils";
import { base44 } from "@/api/base44Client";
import PREItemRow from "./PREItemRow";

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/577f93874_logo_Interativa_versao_final_sem_fundo_0002.png";


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

export default function PRETab({ empreendimento, readOnly = false, onAfterSave }) {
  const [isSaving, setIsSaving] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);
  const [showPlanejamentoModal, setShowPlanejamentoModal] = useState(false);
  const [itemParaPlanejar, setItemParaPlanejar] = useState(/** @type {any} */ (null));
  const [planejamentoForm, setPlanejamentoForm] = useState({ executor: '', data: '' });
  const [isSavingPlanejamento, setIsSavingPlanejamento] = useState(false);
  const [usuarios, setUsuarios] = useState(/** @type {any[]} */ ([]));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = React.useRef(/** @type {{ x: number; y: number } | null} */ (null));
  const [items, setItems] = useState(/** @type {any[]} */ ([]));
  const itemsRef = React.useRef(/** @type {any[]} */ ([]));
  const [lastSaved, setLastSaved] = useState(/** @type {Date | null} */ (null));
  const dirtyItemIds = React.useRef(/** @type {Set<string>} */ (new Set()));
  const [isImporting, setIsImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importSelectedFile, setImportSelectedFile] = useState(null);
  const importFileRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [disciplinas, setDisciplinas] = useState(/** @type {any[]} */ ([]));
  const [documentos, setDocumentos] = useState(/** @type {any[]} */ ([]));
  const [filtroDispline, setFiltroDispline] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [headerData, setHeaderData] = useState({
    cliente: empreendimento?.cliente || '',
    obra: empreendimento?.nome || '',
    descricao: '',
    data: format(new Date(), 'dd/MM/yyyy'),
    rev: '',
    arquivo: ''
  });
  const saveTimeoutRef = React.useRef(/** @type {ReturnType<typeof setTimeout> | null} */ (null));
  const isSavingRef = React.useRef(false);

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

  // AutoSave com debounce — só dispara quando há itens dirty E sem save em andamento
  useEffect(() => {
    if (dirtyItemIds.current.size === 0) return;
    if (isSavingRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleAutoSave();
    }, 30000);

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
        const [discs, users, docs] = await Promise.all([
          retryWithBackoff(() => Disciplina.list(), 3, 2000, 'PRETab-Disciplinas'),
          retryWithBackoff(() => Usuario.list(), 3, 2000, 'PRETab-Usuarios'),
          empreendimento?.id ? retryWithBackoff(() => Documento.filter({ empreendimento_id: empreendimento.id }), 3, 2000, 'PRETab-Documentos') : Promise.resolve([]),
        ]);
        setDisciplinas(discs || []);
        setUsuarios(users || []);
        setDocumentos((docs || []).sort((a, b) => (a.numero || a.arquivo || '').localeCompare(b.numero || b.arquivo || '', 'pt-BR', { numeric: true })));
      } catch {
      }
    };
    loadInitialData();
  }, []);





  // Mantém ref sincronizada com state para callbacks sem re-criação
  React.useEffect(() => { itemsRef.current = items; }, [items]);

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
    } catch {
      setItems([]);
    }
  };

  const handleConfirmarPlanejamento = async () => {
    if (!itemParaPlanejar || !planejamentoForm.executor) return;
    setIsSavingPlanejamento(true);
    try {
      const descritivo = [
        empreendimento?.num_proposta ? `OS ${empreendimento.num_proposta}` : null,
        `Item ${itemParaPlanejar.item}`,
        itemParaPlanejar.de || null,
        itemParaPlanejar.assunto || itemParaPlanejar.descritiva || null,
      ].filter(Boolean).join(' - ');

      const tempoPlanejado = Number(itemParaPlanejar.tempo_atendimento) || 0;
      const horasPorDia = planejamentoForm.data && tempoPlanejado > 0
        ? { [planejamentoForm.data]: tempoPlanejado }
        : {};

      await retryWithBackoff(() => PlanejamentoAtividade.create({
        descritivo,
        executor_principal: planejamentoForm.executor,
        executores: [planejamentoForm.executor],
        inicio_planejado: planejamentoForm.data || null,
        termino_planejado: planejamentoForm.data || null,
        tempo_planejado: tempoPlanejado,
        horas_por_dia: horasPorDia,
        empreendimento_id: empreendimento?.id || null,
        status: 'nao_iniciado',
        tipo_planejamento: 'atividade',
      }), 3, 2000, 'PRE-Criar-Planejamento');

      const usuarioEncontrado = usuarios.find(u => u.email === planejamentoForm.executor);
      const nomeExecutor = usuarioEncontrado?.nome || usuarioEncontrado?.full_name || planejamentoForm.executor;

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
          planejamento_executor: planejamentoForm.executor,
          planejamento_executor_nome: nomeExecutor,
        }), 3, 2000, 'PRE-Update-Executor');
      }

      setItems(prev => prev.map(it =>
        it.id === itemParaPlanejar.id
          ? { ...it, planejamento_executor: planejamentoForm.executor, planejamento_executor_nome: nomeExecutor }
          : it
      ));
      setShowPlanejamentoModal(false);
      setItemParaPlanejar(null);
      setPlanejamentoForm({ executor: '', data: '' });
    } catch {
      alert('Erro ao salvar planejamento. Tente novamente.');
    } finally {
      setIsSavingPlanejamento(false);
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

  const handleUpdateItem = useCallback((id, field, value) => {
    dirtyItemIds.current.add(String(id));
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  }, []);

  const handleDeleteItem = useCallback(async (id) => {
    if (!confirm('Deseja excluir este item?')) return;
    
    try {
      if (!id.toString().startsWith('temp-')) {
        await retryWithBackoff(() => ItemPRE.delete(id), 3, 2000, `PRE-Delete-${id}`);
      }
      setItems(prev => prev.filter(item => item.id !== id));
    } catch {
      alert('Erro ao excluir item.');
    }
  }, []);

  const handleUploadImage = useCallback(async (itemId, file) => {
    try {
      setIsSaving(true);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Encontra o item via ref (sem re-criar o callback a cada mudança)
      const itemToUpdate = itemsRef.current.find(item => item.id === itemId);
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
    } catch {
      alert('Erro ao fazer upload da imagem.');
    } finally {
      setIsSaving(false);
    }
  }, [empreendimento]);

  const handleRemoveImage = useCallback((itemId, imageUrl) => {
    setItems(prev => prev.map(item => 
      item.id === itemId 
        ? { ...item, imagens: (item.imagens || []).filter(url => url !== imageUrl) } 
        : item
    ));
  }, []);

  const buildItemData = (item) => ({
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
    documentos_vinculados: item.documentos_vinculados || [],
    etapa_adicional: item.etapa_adicional || null,
    planejamento_executor: item.planejamento_executor ?? null,
    planejamento_executor_nome: item.planejamento_executor_nome ?? null,
  });

  const handleAutoSave = async () => {
    if (isSavingRef.current) return;

    isSavingRef.current = true;
    setIsSaving(true);

    // Captura snapshot dos itens no momento do save (via ref para não re-criar handleAutoSave)
    const itemsSnapshot = itemsRef.current;
    const dirtySnapshot = new Set(dirtyItemIds.current);
    dirtyItemIds.current.clear();

    try {
      // Salva apenas os itens que foram modificados ou são novos
      const itemsToSave = itemsSnapshot.filter(item =>
        String(item.id).startsWith('temp-') || item.isNew || dirtySnapshot.has(String(item.id))
      );
      if (itemsToSave.length === 0) {
        return;
      }

      // Processar sequencialmente para evitar race conditions com IDs temporários
      const saveResults = [];
      for (const item of itemsToSave) {
        if (!String(item.id).startsWith('temp-') && !item.isNew) {
          // Item existente: atualiza
          await retryWithBackoff(() => ItemPRE.update(item.id, buildItemData(item)), 3, 2000, `PRE-Update-${item.id}`);
          saveResults.push({ tempId: null, realId: null });
        } else {
          // Item novo (temp): cria
          const created = await retryWithBackoff(() => ItemPRE.create(buildItemData(item)), 3, 2000, 'PRE-Create');
          saveResults.push({ tempId: item.id, realId: created?.id ?? null });
        }
      }

      // Substitui IDs temporários pelos reais
      setItems(prev => prev.map(item => {
        const result = saveResults.find(r => r.tempId === item.id);
        if (result?.realId) {
          return { ...item, id: result.realId, isNew: false };
        }
        return item;
      }));

      setLastSaved(new Date());
    } catch (err) {
      console.error('Erro no autoSave PRE:', err);
      // Recoloca os itens como dirty para tentar novamente
      dirtySnapshot.forEach(id => dirtyItemIds.current.add(id));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  // Recalcula o tempo_pre de cada documento do zero, somando todos os itens PRE vinculados
  const atualizarTempoDocumentos = async () => {
    const allItems = itemsRef.current;

    // Coleta todos os docIds referenciados pelos itens atuais
    const docIdsComVinculo = new Set();
    allItems.forEach(item => {
      (item.documentos_vinculados || []).forEach(docId => docIdsComVinculo.add(docId));
    });

    // Também inclui documentos que já têm tempo_pre > 0 (para poder zerado se foram desvinculados)
    const docIdsParaZerar = documentos.filter(d => Number(d.tempo_pre) > 0 && !docIdsComVinculo.has(d.id)).map(d => d.id);

    const todosDocIds = new Set([...docIdsComVinculo, ...docIdsParaZerar]);
    if (todosDocIds.size === 0) return;

    // Para cada documento, recalcula do zero e atualiza diretamente
    for (const docId of todosDocIds) {
      try {
        // Soma todos os itens PRE que ainda vinculam este documento (0 se foi desvinculado)
        const tempoTotal = allItems.reduce((sum, item) => {
          if ((item.documentos_vinculados || []).includes(docId)) {
            return sum + (Number(item.tempo_atendimento) || 0);
          }
          return sum;
        }, 0);

        await retryWithBackoff(
          () => Documento.update(docId, { tempo_pre: tempoTotal }),
          3, 1500, `PRE-UpdateDoc-${docId}`
        );
        setDocumentos(prev => prev.map(d => d.id === docId ? { ...d, tempo_pre: tempoTotal } : d));
      } catch {
        // Ignora erros individuais - não bloqueia o save
      }
    }
  };

  const handleSave = async () => {
    // Força save de todos os itens (inclusive os que não foram modificados via dirty)
    // Usa itemsRef para garantir dados atualizados mesmo com filtro ativo
    const currentItems = itemsRef.current;
    currentItems.forEach(item => dirtyItemIds.current.add(String(item.id)));

    // Se já está salvando, aguarda terminar antes de iniciar novo save
    if (isSavingRef.current) {
      let waited = 0;
      while (isSavingRef.current && waited < 10000) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
      }
    }

    await handleAutoSave();

    // Atualizar tempo nos documentos vinculados (recalcula do zero)
    await atualizarTempoDocumentos();

    // Notifica o pai para recarregar os documentos com os novos tempo_pre
    if (onAfterSave) onAfterSave();

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
    } catch {
      alert('Erro ao importar arquivo.');
    } finally {
      setIsImporting(false);
      if (importFileRef.current) importFileRef.current.value = '';
    }
  };

  const handlePlanejar = useCallback((item) => {
    setItemParaPlanejar(item);
    setShowPlanejamentoModal(true);
  }, []);

  const handleOpenLightbox = useCallback((imgUrl) => {
    setLightboxImg(imgUrl);
  }, []);

  const handleRemoveExecutor = useCallback(async (item) => {
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
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchDisciplina = filtroDispline === 'todas' || item.descritiva === filtroDispline;
      const matchStatus = filtroStatus === 'todos' || item.status === filtroStatus;
      return matchDisciplina && matchStatus;
    });
  }, [items, filtroDispline, filtroStatus]);

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

      <Dialog
        open={showPlanejamentoModal && !!itemParaPlanejar}
        onOpenChange={(open) => {
          if (!open) { setShowPlanejamentoModal(false); setItemParaPlanejar(null); setPlanejamentoForm({ executor: '', data: '' }); }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <CalendarPlus className="w-4 h-4 text-blue-600" />
              Planejar Item
            </DialogTitle>
          </DialogHeader>

          {itemParaPlanejar && (
            <div className="space-y-4">
              {/* Info do item */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1">
                {empreendimento?.num_proposta && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">OS {empreendimento.num_proposta}</p>
                )}
                <p className="text-sm text-gray-800 leading-snug">
                  {[
                    `Item ${itemParaPlanejar.item}`,
                    itemParaPlanejar.de || null,
                    itemParaPlanejar.assunto || itemParaPlanejar.descritiva || null,
                  ].filter(Boolean).join(' - ')}
                </p>
                {itemParaPlanejar.tempo_atendimento && (
                  <p className="text-xs text-gray-400">{itemParaPlanejar.tempo_atendimento}h estimadas</p>
                )}
              </div>

              {/* Executor */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Executor *</label>
                <Select
                  value={planejamentoForm.executor}
                  onValueChange={(v) => setPlanejamentoForm(f => ({ ...f, executor: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o executor" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Map(usuarios.map(u => [u.email, u])).values()].map(u => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.nome || u.full_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Data de início */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Data de Início</label>
                <Input
                  type="date"
                  value={planejamentoForm.data}
                  onChange={(e) => setPlanejamentoForm(f => ({ ...f, data: e.target.value }))}
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => { setShowPlanejamentoModal(false); setItemParaPlanejar(null); setPlanejamentoForm({ executor: '', data: '' }); }}
              disabled={isSavingPlanejamento}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarPlanejamento}
              disabled={!planejamentoForm.executor || isSavingPlanejamento}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSavingPlanejamento ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="no-print flex flex-wrap items-center gap-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
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
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Filtrar por Status:</label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="Em andamento">Em andamento</SelectItem>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Concluído">Concluído</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              {(filtroDispline !== 'todas' || filtroStatus !== 'todos') && (
                <span className="text-sm text-blue-700 font-medium">
                  ({filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''})
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
              filteredItems.map((item, index) => (
                <PREItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  readOnly={readOnly}
                  empreendimento={empreendimento}
                  documentos={documentos}
                  onUpdate={handleUpdateItem}
                  onDelete={handleDeleteItem}
                  onUploadImage={handleUploadImage}
                  onRemoveImage={handleRemoveImage}
                  onOpenLightbox={handleOpenLightbox}
                  onPlanejar={handlePlanejar}
                  onRemoveExecutor={handleRemoveExecutor}
                  onBlurSave={handleAutoSave}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}