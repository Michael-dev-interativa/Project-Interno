// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, FileText, Download, Printer, Save, Loader2, Check, FolderOpen, FilePlus, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Empreendimento, Usuario, Documento, AtaReuniao } from "@/entities/all";
import { retryWithBackoff } from "@/components/utils/apiUtils";

// Componente Textarea com auto-resize
const AutoResizeTextarea = ({ value, onChange, className, ...props }) => {
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  useEffect(() => {
    adjustHeight();
    // Ajustar novamente após um pequeno delay para garantir que o DOM foi renderizado
    const timer = setTimeout(adjustHeight, 0);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      className={className}
      style={{ minHeight: '40px' }}
      {...props}
    />
  );
};

// Componente para input de resposta com debounce
const RespostaInput = ({ value, onChange, onRemove }) => {
  const [localValue, setLocalValue] = useState(value || '');
  const timeoutRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 300);
  };

  return (
    <div className="flex gap-1 items-start print:hidden">
      <AutoResizeTextarea
        value={localValue}
        onChange={handleChange}
        className="text-sm flex-1 resize-none overflow-hidden min-h-[40px]"
        placeholder="Digite a resposta..."
      />
      <button
        onClick={onRemove}
        className="text-red-500 hover:text-red-700 p-1"
        title="Remover resposta"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};

const LOGO_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/577f93874_logo_Interativa_versao_final_sem_fundo_0002.png";

const STATUS_OPTIONS = [
  { value: 'concluido', label: 'Concluído', color: 'bg-green-600', textColor: 'text-white' },
  { value: 'pendente', label: 'Pendente', color: 'bg-amber-300', textColor: 'text-amber-900' },
  { value: 'em_andamento', label: 'Em andamento', color: 'bg-blue-500', textColor: 'text-white' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-red-400', textColor: 'text-white' },
  { value: 'na', label: 'N/A', color: 'bg-gray-400', textColor: 'text-white' },
];

const PAUTA_ITEMS = [
  'Pendências da semana anterior',
  'Posição de produção Semanal (anterior e atual)',
  'Análise quanto a possíveis atrasos e impactos',
  'Planejamento de produção para semana seguinte',
  'Cobranças de terceiros',
  'Dúvidas Gerais',
];

// Estilos de impressão
const printStyles = `
@media print {
  @page {
    size: A4 landscape;
    margin: 8mm;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    box-sizing: border-box !important;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .print\\:hidden, .no-print {
    display: none !important;
  }

  /* Esconde sidebar e elementos do layout */
  aside, nav, header, footer, [data-sidebar], [data-radix-popper-content-wrapper] {
    display: none !important;
  }

  main {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    position: static !important;
  }

  main > div {
    overflow: visible !important;
    height: auto !important;
    width: 100% !important;
  }

  /* Esconde botões flutuantes (playlist, timer, etc) */
  [class*="fixed"], button[class*="fixed"], div[class*="fixed"] {
    display: none !important;
  }

  /* Container principal */
  .p-6.bg-gray-100 {
    padding: 0 !important;
    margin: 0 !important;
    background: white !important;
    width: 100% !important;
    height: auto !important;
    min-height: auto !important;
    display: block !important;
  }

  /* Container da ATA na impressão */
  .max-w-\\[297mm\\] {
    max-width: 100% !important;
    width: 100% !important;
    height: auto !important;
    box-shadow: none !important;
    border: 1px solid black !important;
    overflow: visible !important;
  }

  /* Remove barras de rolamento */
  ::-webkit-scrollbar {
    display: none !important;
  }

  * {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }

  /* Grid de 12 colunas - manter estrutura */
  .grid-cols-12 {
    display: grid !important;
    grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
  }

  /* Colunas específicas */
  .col-span-1 { grid-column: span 1 / span 1 !important; }
  .col-span-2 { grid-column: span 2 / span 2 !important; }
  .col-span-3 { grid-column: span 3 / span 3 !important; }
  .col-span-4 { grid-column: span 4 / span 4 !important; }
  .col-span-7 { grid-column: span 7 / span 7 !important; }
  .col-span-8 { grid-column: span 8 / span 8 !important; }
  .col-span-11 { grid-column: span 11 / span 11 !important; }

  /* Bordas */
  .border-r { border-right: 1px solid #9ca3af !important; }
  .border-b { border-bottom: 1px solid #9ca3af !important; }
  .border-gray-400 { border-color: #9ca3af !important; }
  .border-gray-300 { border-color: #d1d5db !important; }

  /* Cores de fundo */
  .bg-yellow-100 { background-color: #fef9c3 !important; }
  .bg-yellow-50 { background-color: #fefce8 !important; }
  .bg-gray-50 { background-color: #f9fafb !important; }
  .bg-white { background-color: white !important; }

  /* Texto - mantém tamanhos legíveis */
  .text-center { text-align: center !important; }
  .text-sm { font-size: 7px !important; }
  .text-xs { font-size: 6px !important; }
  .font-medium { font-weight: 500 !important; }
  .font-bold { font-weight: 700 !important; }

  /* Padding */
  .p-1 { padding: 1px !important; }
  .p-2 { padding: 2px !important; }

  /* Permitir quebra de texto */
  .whitespace-pre-wrap {
    white-space: pre-wrap !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
  }

  /* Esconder inputs na impressão, mostrar só valor */
  input {
    border: none !important;
    background: transparent !important;
    padding: 0 !important;
    font-size: 7px !important;
  }

  select {
    -webkit-appearance: none !important;
    appearance: none !important;
    border: none !important;
    background: transparent !important;
  }

  /* Tabela de providências */
  table {
    width: 100% !important;
    table-layout: fixed !important;
    font-size: 6px !important;
    border-collapse: collapse !important;
  }

  td, th {
    padding: 1px 2px !important;
    word-wrap: break-word !important;
    overflow-wrap: break-word !important;
    font-size: 6px !important;
    line-height: 1.2 !important;
    vertical-align: top !important;
  }

  /* Altura máxima para células de providências */
  td textarea,
  td input,
  td select {
    font-size: 6px !important;
    line-height: 1.2 !important;
  }

  /* Células com rowspan - altura compacta e centralização vertical */
  td[rowspan] {
    height: auto !important;
    max-height: 30px !important;
    padding: 1px 2px !important;
    vertical-align: middle !important;
  }

  /* Remover espaçamentos extras na impressão */
  .space-y-1, .space-y-2, .space-y-3 {
    gap: 0 !important;
  }

  /* Esconder elementos vazios */
  tr:empty {
    display: none !important;
  }

  /* Linhas da tabela mais compactas */
  tbody tr {
    height: auto !important;
  }

  /* Cabeçalho da tabela */
  .flex.bg-yellow-100 {
    font-size: 8px !important;
  }

  .flex.bg-yellow-100 > div {
    padding: 2px !important;
  }
}
`;

export default function AtaPlanejamento() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [atasRegistradas, setAtasRegistradas] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'edit', 'new'
  const [currentAtaId, setCurrentAtaId] = useState(null);
  const autoSaveTimeoutRef = React.useRef(null);

  // Dados da ATA
  const [ataData, setAtaData] = useState({
    assunto: 'Reunião de Planejamento / Semanal',
    local: 'Home Office',
    data: format(new Date(), 'yyyy-MM-dd'),
    horario: '14h',
    participantes: [],
    folha: '1/',
    rev: '00',
    controle: 'RG-PO-27',
    emissao: '/ /',
    status: 'rascunho'
  });

  const [providencias, setProvidencias] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [novaProvidencia, setNovaProvidencia] = useState({
    projeto: '',
    linhas: [{ providencias: '', respostas: [], responsaveis: [], dataReuniao: '', dataRetorno: '', status: 'pendente' }]
  });
  const [showSelectAtaModal, setShowSelectAtaModal] = useState(false);
  const [searchAta, setSearchAta] = useState('');
  const [filtroProjetoSelecionado, setFiltroProjetoSelecionado] = useState('todos');
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [ocultarConcluidos, setOcultarConcluidos] = useState(false);
  const [projetosMinimizados, setProjetosMinimizados] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  // Auto-save com debounce
  useEffect(() => {
    if (hasUnsavedChanges && (viewMode === 'edit' || viewMode === 'new')) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(async () => {
        try {
          const ataToSave = {
            ...ataData,
            providencias: providencias.map(p => ({
              projeto: p.projeto || '',
              providencias: p.providencias || '',
              respostas: p.respostas || [],
              responsaveis: p.responsaveis || [],
              dataReuniao: p.dataReuniao || '',
              dataRetorno: p.dataRetorno || '',
              status: p.status || 'pendente'
            }))
          };

          if (currentAtaId) {
            await AtaReuniao.update(currentAtaId, ataToSave);
          } else {
            const newAta = await AtaReuniao.create(ataToSave);
            setCurrentAtaId(newAta.id);
          }
          setHasUnsavedChanges(false);
        } catch (error) {
          console.error('Erro no auto-save:', error);
        }
      }, 3000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, ataData, providencias, currentAtaId, viewMode]);

  // Aviso ao sair com mudanças não salvas
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [emps, users, docs, atas] = await Promise.all([
        retryWithBackoff(() => Empreendimento.list(), 3, 2000, 'AtaPlanejamento-Empreendimentos'),
        retryWithBackoff(() => Usuario.list(), 3, 2000, 'AtaPlanejamento-Usuarios'),
        retryWithBackoff(() => Documento.list(), 3, 2000, 'AtaPlanejamento-Documentos'),
        retryWithBackoff(() => AtaReuniao.list('-created_date'), 3, 2000, 'AtaPlanejamento-Atas'),
      ]);
      setEmpreendimentos(emps || []);
      setUsuarios(users || []);
      setDocumentos(docs || []);
      setAtasRegistradas(atas || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAta = async (silent = false) => {
    setIsSaving(true);
    try {
      const ataToSave = {
        ...ataData,
        providencias: providencias.map(p => ({
          projeto: p.projeto,
          providencias: p.providencias,
          respostas: p.respostas || [],
          responsaveis: p.responsaveis || [],
          dataReuniao: p.dataReuniao || '',
          dataRetorno: p.dataRetorno || '',
          status: p.status || 'pendente'
        }))
      };

      if (currentAtaId) {
        await AtaReuniao.update(currentAtaId, ataToSave);
      } else {
        const newAta = await AtaReuniao.create(ataToSave);
        setCurrentAtaId(newAta.id);
      }

      setHasUnsavedChanges(false);

      if (!silent) {
        await loadData();
        alert('ATA salva com sucesso!');
      }
    } catch (error) {
      console.error('Erro ao salvar ATA:', error);
      if (!silent) {
        alert('Erro ao salvar ATA. Tente novamente.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewAta = () => {
    setShowSelectAtaModal(true);
  };

  const handleCreateBlankAta = () => {
    setCurrentAtaId(null);
    setAtaData({
      assunto: 'Reunião de Planejamento / Semanal',
      local: 'Home Office',
      data: format(new Date(), 'yyyy-MM-dd'),
      horario: '14h',
      participantes: [],
      folha: '1/',
      rev: '00',
      controle: 'RG-PO-27',
      emissao: '/ /',
      status: 'rascunho'
    });
    setProvidencias([]);
    setShowSelectAtaModal(false);
    setViewMode('edit');
  };

  const handleCreateFromPrevious = (ata) => {
    setCurrentAtaId(null);
    setAtaData({
      assunto: ata.assunto || 'Reunião de Planejamento / Semanal',
      local: ata.local || 'Home Office',
      data: format(new Date(), 'yyyy-MM-dd'),
      horario: ata.horario || '14h',
      participantes: ata.participantes || [],
      folha: '1/',
      rev: '00',
      controle: ata.controle || 'RG-PO-27',
      emissao: '/ /',
      status: 'rascunho'
    });
    setProvidencias((ata.providencias || []).map((p, idx) => {
      // Migrar campo "resposta" legado para "respostas" array
      let respostas = p.respostas || [];
      if (p.resposta && !respostas.length) {
        respostas = [p.resposta];
      }

      return {
        ...p,
        id: Date.now() + idx,
        respostas,
        projeto: p.projeto || '',
        providencias: p.providencias || '',
        responsaveis: p.responsaveis || [],
        dataReuniao: p.dataReuniao || '',
        dataRetorno: p.dataRetorno || '',
        status: p.status || 'pendente'
      };
    }));
    setShowSelectAtaModal(false);
    setViewMode('edit');
  };

  const handleOpenAta = (ata) => {
    setCurrentAtaId(ata.id);
    setAtaData({
      assunto: ata.assunto || '',
      local: ata.local || '',
      data: ata.data || format(new Date(), 'yyyy-MM-dd'),
      horario: ata.horario || '',
      participantes: ata.participantes || [],
      folha: ata.folha || '1/',
      rev: ata.rev || '00',
      controle: ata.controle || 'RG-PO-27',
      emissao: ata.emissao || '/ /',
      status: ata.status || 'rascunho'
    });
    setProvidencias((ata.providencias || []).map((p, idx) => {
      // Migrar campo "resposta" legado para "respostas" array
      let respostas = p.respostas || [];
      if (p.resposta && !respostas.length) {
        respostas = [p.resposta];
      }

      return {
        ...p,
        id: Date.now() + idx,
        respostas,
        projeto: p.projeto || '',
        providencias: p.providencias || '',
        responsaveis: p.responsaveis || [],
        dataReuniao: p.dataReuniao || '',
        dataRetorno: p.dataRetorno || '',
        status: p.status || 'pendente'
      };
    }));
    setViewMode('edit');
  };

  const handleDeleteAta = async (ataId) => {
    if (!confirm('Deseja excluir esta ATA?')) return;
    try {
      await AtaReuniao.delete(ataId);
      await loadData();
    } catch (error) {
      console.error('Erro ao excluir ATA:', error);
      alert('Erro ao excluir ATA.');
    }
  };

  const handleBackToList = () => {
    if (hasUnsavedChanges) {
      if (confirm('Você tem mudanças não salvas. Deseja salvá-las antes de sair?')) {
        handleSaveAta();
      }
    }
    setViewMode('list');
    setCurrentAtaId(null);
    setHasUnsavedChanges(false);
  };

  const toggleParticipante = (email) => {
    setHasUnsavedChanges(true);
    setAtaData(prev => ({
      ...prev,
      participantes: prev.participantes.includes(email)
        ? prev.participantes.filter(p => p !== email)
        : [...prev.participantes, email]
    }));
  };

  const handleAddProvidencia = () => {
    const linhasValidas = novaProvidencia.linhas.filter(l => l.providencias.trim());
    if (linhasValidas.length === 0) return;

    const novasProvidencias = linhasValidas.map((linha, idx) => ({
      id: Date.now() + idx,
      projeto: novaProvidencia.projeto,
      providencias: linha.providencias,
      respostas: linha.respostas || [],
      responsaveis: linha.responsaveis,
      dataReuniao: linha.dataReuniao,
      dataRetorno: linha.dataRetorno,
      status: linha.status
    }));

    setHasUnsavedChanges(true);
    setProvidencias(prev => [...prev, ...novasProvidencias]);
    setNovaProvidencia({
      projeto: '',
      linhas: [{ providencias: '', respostas: [], responsaveis: [], dataReuniao: '', dataRetorno: '', status: 'pendente' }]
    });
    setShowAddModal(false);
  };

  const handleInsertProvidenciaAfter = (provId) => {
    const index = providencias.findIndex(p => p.id === provId);
    if (index === -1) return;

    const provAnterior = providencias[index];
    const novaProvidencia = {
      id: Date.now(),
      projeto: provAnterior.projeto,
      providencias: '',
      respostas: [],
      responsaveis: [],
      dataReuniao: '',
      dataRetorno: '',
      status: 'pendente'
    };

    const novasProvidencias = [
      ...providencias.slice(0, index + 1),
      novaProvidencia,
      ...providencias.slice(index + 1)
    ];

    setHasUnsavedChanges(true);
    setProvidencias(novasProvidencias);
  };

  const handleAddLinha = () => {
    setNovaProvidencia(prev => ({
      ...prev,
      linhas: [...prev.linhas, { providencias: '', respostas: [], responsaveis: [], dataReuniao: '', dataRetorno: '', status: 'pendente' }]
    }));
  };

  const handleRemoveLinha = (idx) => {
    if (novaProvidencia.linhas.length <= 1) return;
    setNovaProvidencia(prev => ({
      ...prev,
      linhas: prev.linhas.filter((_, i) => i !== idx)
    }));
  };

  const handleUpdateLinha = (idx, field, value) => {
    setNovaProvidencia(prev => ({
      ...prev,
      linhas: prev.linhas.map((linha, i) => i === idx ? { ...linha, [field]: value } : linha)
    }));
  };

  const handleUpdateProvidencia = (id, field, value) => {
    setHasUnsavedChanges(true);
    setProvidencias(prev => prev.map(p =>
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const handleDeleteProvidencia = (id) => {
    if (confirm('Deseja excluir esta providência?')) {
      setHasUnsavedChanges(true);
      setProvidencias(prev => prev.filter(p => p.id !== id));
    }
  };

  const getStatusColor = (status) => {
    const found = STATUS_OPTIONS.find(s => s.value === status);
    return found ? `${found.color} ${found.textColor}` : 'bg-gray-300 text-white';
  };

  const getStatusLabel = (status) => {
    const found = STATUS_OPTIONS.find(s => s.value === status);
    return found ? found.label : status;
  };

  const handlePrint = () => {
    window.print();
  };

  // Agrupar providências por Projeto
  const providenciasAgrupadas = useMemo(() => {
    // Aplicar filtros
    let providenciasFiltradas = [...providencias];

    // Filtro por projeto
    if (filtroProjetoSelecionado !== 'todos') {
      providenciasFiltradas = providenciasFiltradas.filter(p => p.projeto === filtroProjetoSelecionado);
    }

    // Filtro por usuário (responsável)
    if (filtroUsuario !== 'todos') {
      providenciasFiltradas = providenciasFiltradas.filter(p =>
        p.responsaveis?.includes(filtroUsuario)
      );
    }

    // Filtro por data
    if (filtroDataInicio || filtroDataFim) {
      providenciasFiltradas = providenciasFiltradas.filter(p => {
        const dataReuniao = p.dataReuniao;
        const dataRetorno = p.dataRetorno;

        // Considerar qualquer uma das datas que existir
        const datasParaFiltrar = [dataReuniao, dataRetorno].filter(Boolean);

        if (datasParaFiltrar.length === 0) return false;

        // Verificar se alguma data está no range
        return datasParaFiltrar.some(data => {
          if (filtroDataInicio && filtroDataFim) {
            return data >= filtroDataInicio && data <= filtroDataFim;
          } else if (filtroDataInicio) {
            return data >= filtroDataInicio;
          } else if (filtroDataFim) {
            return data <= filtroDataFim;
          }
          return true;
        });
      });
    }

    // Filtro para ocultar concluídos
    if (ocultarConcluidos) {
      providenciasFiltradas = providenciasFiltradas.filter(p => p.status !== 'concluido');
    }

    const grupos = {};
    providenciasFiltradas.forEach(p => {
      const key = p.projeto;
      if (!grupos[key]) {
        grupos[key] = {
          projeto: p.projeto,
          items: []
        };
      }
      grupos[key].items.push(p);
    });
    return Object.values(grupos);
  }, [providencias, filtroProjetoSelecionado, filtroUsuario, filtroDataInicio, filtroDataFim, ocultarConcluidos]);

  // Lista de projetos únicos para o filtro
  const projetosUnicos = useMemo(() => {
    const projetos = [...new Set(providencias.map(p => p.projeto))].filter(Boolean);
    return projetos.sort();
  }, [providencias]);

  // Lista de usuários únicos (responsáveis) para o filtro
  const usuariosUnicos = useMemo(() => {
    const usuarios = new Set();
    providencias.forEach(p => {
      if (p.responsaveis && Array.isArray(p.responsaveis)) {
        p.responsaveis.forEach(r => usuarios.add(r));
      }
    });
    return Array.from(usuarios).sort();
  }, [providencias]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Tela de Lista de ATAs
  if (viewMode === 'list') {
    return (
      <div className="p-6 bg-gray-100 min-h-screen">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-800">ATAs de Reunião</h1>
            <Button onClick={handleNewAta} className="bg-blue-600 hover:bg-blue-700">
              <FilePlus className="w-4 h-4 mr-2" />
              Nova ATA
            </Button>
          </div>

          {atasRegistradas.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">Nenhuma ATA registrada</h3>
              <p className="text-gray-500 mb-4">Clique em "Nova ATA" para criar sua primeira ata de reunião.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {atasRegistradas.map(ata => (
                <div key={ata.id} className="bg-white rounded-lg shadow p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-500" />
                      <div>
                        <h3 className="font-medium text-gray-800">{ata.assunto}</h3>
                        <p className="text-sm text-gray-500">
                          {ata.data ? format(new Date(ata.data), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem data'}
                          {ata.horario && ` às ${ata.horario}`}
                          {ata.local && ` - ${ata.local}`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${ata.status === 'finalizada' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {ata.status === 'finalizada' ? 'Finalizada' : 'Rascunho'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {ata.providencias?.length || 0} providência(s)
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenAta(ata)}>
                      <FolderOpen className="w-4 h-4 mr-1" />
                      Abrir
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteAta(ata.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Selecionar ATA Anterior */}
        <Dialog open={showSelectAtaModal} onOpenChange={setShowSelectAtaModal}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Nova ATA</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <Button onClick={handleCreateBlankAta} className="w-full justify-start h-auto py-4" variant="outline">
                <div className="text-left">
                  <div className="font-semibold mb-1">ATA em Branco</div>
                  <p className="text-sm text-gray-500">Começar uma nova ATA sem dados pré-preenchidos</p>
                </div>
              </Button>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">Ou buscar ATA anterior como base:</h3>
                <Input
                  placeholder="Buscar por assunto, data..."
                  value={searchAta}
                  onChange={(e) => setSearchAta(e.target.value)}
                  className="mb-3"
                />
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {atasRegistradas.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Nenhuma ATA registrada ainda.</p>
                  ) : (
                    atasRegistradas
                      .filter(ata => {
                        if (!searchAta) return true;
                        const search = searchAta.toLowerCase();
                        const dataFormatada = ata.data ? format(new Date(ata.data), 'dd/MM/yyyy', { locale: ptBR }) : '';
                        return (
                          ata.assunto?.toLowerCase().includes(search) ||
                          dataFormatada.includes(search) ||
                          ata.local?.toLowerCase().includes(search)
                        );
                      })
                      .map(ata => (
                        <Button
                          key={ata.id}
                          onClick={() => handleCreateFromPrevious(ata)}
                          className="w-full justify-start h-auto py-3"
                          variant="outline"
                        >
                          <div className="text-left w-full">
                            <div className="font-medium">{ata.assunto || 'Sem assunto'}</div>
                            <p className="text-xs text-gray-500">
                              {ata.data ? format(new Date(ata.data), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem data'}
                              {ata.local && ` - ${ata.local}`}
                              {` • ${ata.providencias?.length || 0} providência(s)`}
                            </p>
                          </div>
                        </Button>
                      ))
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <>
      <style>{printStyles}</style>
      <div className="p-6 bg-gray-100 min-h-screen print:p-0 print:bg-white print:min-h-0 flex flex-col items-center print:overflow-visible">
        {/* Barra de Ações */}
        <div className="mb-4 flex justify-between items-center no-print w-full max-w-[297mm]">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleBackToList} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-2xl font-bold text-gray-800">
              {currentAtaId ? 'Editar ATA' : 'Nova ATA'}
            </h1>
            {hasUnsavedChanges && (
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                Salvando automaticamente...
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSaveAta} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir
            </Button>
            <Button onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Providência
            </Button>
          </div>
        </div>

        {/* Documento ATA - Formato A4 Paisagem */}
        <div className="bg-white border border-gray-400 print:border-black print:text-[10px] w-full max-w-[297mm] shadow-lg">
          {/* Cabeçalho */}
          <div className="grid grid-cols-12 border-b border-gray-400">
            <div className="col-span-3 border-r border-gray-400 p-4 flex items-center justify-center">
              <img src={LOGO_URL} alt="Logo" className="h-20" />
            </div>
            <div className="col-span-9 flex items-center justify-center">
              <div className="text-center py-2 text-2xl font-bold">
                Ata de Reunião
              </div>
            </div>
          </div>

          {/* Info da Reunião */}
          <div className="border-b border-gray-400">
            <div className="grid grid-cols-12">
              <div className="col-span-8 border-r border-gray-400 p-2 text-sm flex items-center">
                <span className="font-medium whitespace-nowrap">Assunto: </span>
                <input
                  type="text"
                  value={ataData.assunto}
                  onChange={(e) => {
                    setHasUnsavedChanges(true);
                    setAtaData(prev => ({ ...prev, assunto: e.target.value }));
                  }}
                  className="border-none outline-none bg-transparent print:bg-transparent flex-1 w-full"
                />
              </div>
              <div className="col-span-4 p-2 text-sm">
                <span className="font-medium">Data: </span>
                <input
                  type="text"
                  value={format(new Date(), "EEEE", { locale: ptBR })}
                  className="border-none outline-none bg-transparent capitalize print:bg-transparent"
                  readOnly
                />
              </div>
            </div>
            <div className="grid grid-cols-12 border-t border-gray-400">
              <div className="col-span-8 border-r border-gray-400 p-2 text-sm">
                <span className="font-medium">Local: </span>
                <input
                  type="text"
                  value={ataData.local}
                  onChange={(e) => {
                    setHasUnsavedChanges(true);
                    setAtaData(prev => ({ ...prev, local: e.target.value }));
                  }}
                  className="border-none outline-none bg-transparent print:bg-transparent"
                />
              </div>
              <div className="col-span-4 p-2 text-sm">
                <span className="font-medium">Horário: </span>
                <input
                  type="text"
                  value={ataData.horario}
                  onChange={(e) => {
                    setHasUnsavedChanges(true);
                    setAtaData(prev => ({ ...prev, horario: e.target.value }));
                  }}
                  className="border-none outline-none bg-transparent print:bg-transparent"
                />
              </div>
            </div>
          </div>

          {/* Participantes e Legenda */}
          <div className="grid grid-cols-12 border-b border-gray-400">
            <div className="col-span-8 border-r border-gray-400">
              <div className="bg-yellow-100 p-1 text-center text-sm font-medium border-b border-gray-400">
                Participantes
              </div>
              <div className="p-2 text-sm">
                {/* Participantes selecionados */}
                <div className="space-y-1 print:space-y-0">
                  {ataData.participantes.map(email => {
                    const user = usuarios.find(u => u.email === email);
                    return user ? (
                      <div
                        key={user.id}
                        className="cursor-pointer hover:bg-red-50 px-2 py-0.5 rounded flex items-center gap-2 bg-green-100 font-medium no-print"
                        onClick={() => toggleParticipante(user.email)}
                        title="Clique para remover"
                      >
                        <div className="w-4 h-4 border rounded flex items-center justify-center bg-green-500 border-green-500 text-white">
                          <Check className="w-3 h-3" />
                        </div>
                        <span className="text-green-800">{user.nome || user.full_name}</span>
                      </div>
                    ) : null;
                  })}
                  {/* Lista para impressão */}
                  {ataData.participantes.map(email => {
                    const user = usuarios.find(u => u.email === email);
                    return user ? (
                      <div key={`print-${user.id}`} className="hidden print:block py-0.5">
                        {user.nome || user.full_name}
                      </div>
                    ) : null;
                  })}
                </div>
                {/* Dropdown para adicionar */}
                <div className="mt-2 no-print">
                  <Select onValueChange={(email) => toggleParticipante(email)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="+ Adicionar participante" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios
                        .filter(u => !ataData.participantes.includes(u.email))
                        .map(user => (
                          <SelectItem key={user.id} value={user.email}>
                            {user.nome || user.full_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="col-span-4">
              <div className="bg-yellow-100 p-1 text-center text-sm font-medium border-b border-gray-400">
                Legenda Status
              </div>
              <div className="p-2 space-y-1">
                {STATUS_OPTIONS.map(status => (
                  <div key={status.value} className="flex items-center gap-2 text-xs">
                    <div className={`w-20 text-center py-0.5 ${status.color} ${status.textColor} rounded`}>
                      {status.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pauta */}
          <div className="border-b border-gray-400">
            <div className="grid grid-cols-12 bg-yellow-100 border-b border-gray-400">
              <div className="col-span-1 p-1 text-center text-sm font-medium border-r border-gray-400">Item</div>
              <div className="col-span-11 p-1 text-sm font-medium">Pauta</div>
            </div>
            {PAUTA_ITEMS.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 border-b border-gray-300 last:border-b-0">
                <div className="col-span-1 p-1 text-center text-sm border-r border-gray-300">{idx + 1}</div>
                <div className="col-span-11 p-1 text-sm">{item}</div>
              </div>
            ))}
          </div>

          {/* Filtros - apenas na tela */}
          {providencias.length > 0 && (
            <div className="border-b border-gray-400 p-3 bg-gray-50 no-print space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Projeto:</label>
                  <Select
                    value={filtroProjetoSelecionado}
                    onValueChange={setFiltroProjetoSelecionado}
                  >
                    <SelectTrigger className="w-48 h-9 text-sm">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos ({providencias.length})</SelectItem>
                      {projetosUnicos.map(projeto => (
                        <SelectItem key={projeto} value={projeto}>
                          {projeto} ({providencias.filter(p => p.projeto === projeto).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Responsável:</label>
                  <Select
                    value={filtroUsuario}
                    onValueChange={setFiltroUsuario}
                  >
                    <SelectTrigger className="w-48 h-9 text-sm">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {usuariosUnicos.map(usuario => (
                        <SelectItem key={usuario} value={usuario}>
                          {usuario}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Data de:</label>
                  <Input
                    type="date"
                    value={filtroDataInicio}
                    onChange={(e) => setFiltroDataInicio(e.target.value)}
                    className="w-40 h-9 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">até:</label>
                  <Input
                    type="date"
                    value={filtroDataFim}
                    onChange={(e) => setFiltroDataFim(e.target.value)}
                    className="w-40 h-9 text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ocultar-concluidos"
                    checked={ocultarConcluidos}
                    onCheckedChange={setOcultarConcluidos}
                  />
                  <Label htmlFor="ocultar-concluidos" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Ocultar concluídos
                  </Label>
                </div>

                {(filtroProjetoSelecionado !== 'todos' || filtroUsuario !== 'todos' || filtroDataInicio || filtroDataFim || ocultarConcluidos) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFiltroProjetoSelecionado('todos');
                      setFiltroUsuario('todos');
                      setFiltroDataInicio('');
                      setFiltroDataFim('');
                      setOcultarConcluidos(false);
                    }}
                    className="h-9"
                  >
                    Limpar Filtros
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Lista de Providências em Containers Agrupadas por Projeto */}
          {providenciasAgrupadas.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              {providencias.length === 0
                ? 'Nenhuma providência cadastrada. Clique em "Adicionar Providência" para começar.'
                : 'Nenhuma providência encontrada para o projeto selecionado.'}
            </div>
          ) : (
            <div className="space-y-6 p-2">
              {providenciasAgrupadas.map((grupo, gIdx) => {
                const isMinimizado = projetosMinimizados[grupo.projeto];

                return (
                  <div key={gIdx} className="border border-gray-400 rounded-lg overflow-hidden">
                    {/* Título do Projeto */}
                    <div className="bg-yellow-100 border-b border-gray-400 p-3 flex items-center justify-between cursor-pointer no-print hover:bg-yellow-200 transition-colors"
                      onClick={() => setProjetosMinimizados(prev => ({ ...prev, [grupo.projeto]: !prev[grupo.projeto] }))}>
                      <h3 className="text-base font-bold text-gray-800">{grupo.projeto}</h3>
                      <button className="p-1 hover:bg-yellow-300 rounded">
                        {isMinimizado ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Versão para impressão - sempre mostra título */}
                    <div className="hidden print:block bg-yellow-100 border-b border-gray-400 p-3">
                      <h3 className="text-base font-bold text-gray-800">{grupo.projeto}</h3>
                    </div>

                    {/* Itens do Projeto */}
                    {!isMinimizado && (
                      <div className="space-y-2 p-2">
                        {grupo.items.map((prov, pIdx) => (
                          <div
                            key={prov.id}
                            className="flex gap-2 border border-gray-300 rounded-lg overflow-hidden bg-white"
                          >
                            {/* Container Principal - 80% */}
                            <div className="w-[80%] p-3 space-y-2">
                              {/* Linha 1: Providências */}
                              <div className="flex gap-2">
                                <label className="text-xs font-medium text-gray-600 min-w-[80px] pt-1">Providências:</label>
                                <AutoResizeTextarea
                                  value={prov.providencias}
                                  onChange={(e) => handleUpdateProvidencia(prov.id, 'providencias', e.target.value)}
                                  className="text-sm print:hidden flex-1 resize-none overflow-hidden min-h-[60px]"
                                />
                                <span className="hidden print:inline text-[6px] flex-1 whitespace-pre-wrap">{prov.providencias}</span>
                              </div>

                              {/* Linha 2: Respostas (Lista) */}
                              <div className="flex gap-2">
                                <label className="text-xs font-medium text-gray-600 min-w-[80px] pt-1">Respostas:</label>
                                <div className="flex-1 space-y-2">
                                  {(prov.respostas || []).map((resp, rIdx) => (
                                    <RespostaInput
                                      key={rIdx}
                                      value={resp}
                                      onChange={(newValue) => {
                                        setHasUnsavedChanges(true);
                                        const novasRespostas = [...(prov.respostas || [])];
                                        novasRespostas[rIdx] = newValue;
                                        handleUpdateProvidencia(prov.id, 'respostas', novasRespostas);
                                      }}
                                      onRemove={() => {
                                        setHasUnsavedChanges(true);
                                        const novasRespostas = (prov.respostas || []).filter((_, i) => i !== rIdx);
                                        handleUpdateProvidencia(prov.id, 'respostas', novasRespostas);
                                      }}
                                    />
                                  ))}
                                  <div className="hidden print:block text-[6px] whitespace-pre-wrap">
                                    {(prov.respostas || []).map((resp, rIdx) => (
                                      <div key={rIdx} className="mb-1">• {resp}</div>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => {
                                      setHasUnsavedChanges(true);
                                      const novasRespostas = [...(prov.respostas || []), ''];
                                      handleUpdateProvidencia(prov.id, 'respostas', novasRespostas);
                                    }}
                                    className="text-blue-600 hover:text-blue-800 text-xs flex items-center gap-1 print:hidden"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Adicionar Resposta
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Container Secundário - 20% */}
                            <div className="w-[20%] border-l border-gray-300 p-3 space-y-3 bg-gray-50">
                              {/* Linha 1: Responsável */}
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Responsável:</label>
                                <Select
                                  value={prov.responsaveis?.[0] || ''}
                                  onValueChange={(value) => handleUpdateProvidencia(prov.id, 'responsaveis', [value])}
                                >
                                  <SelectTrigger className="h-8 text-xs print:hidden">
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {usuarios.map(user => (
                                      <SelectItem key={user.id} value={user.nome || user.full_name}>
                                        {user.nome || user.full_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span className="hidden print:inline text-[6px]">
                                  {Array.isArray(prov.responsaveis) ? prov.responsaveis.join(', ') : ''}
                                </span>
                              </div>

                              {/* Linha 2: Data de Reunião */}
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Data Reunião:</label>
                                <Input
                                  type="date"
                                  value={prov.dataReuniao}
                                  onChange={(e) => handleUpdateProvidencia(prov.id, 'dataReuniao', e.target.value)}
                                  className="h-8 text-xs print:hidden"
                                />
                                <span className="hidden print:inline text-[6px]">
                                  {prov.dataReuniao ? format(new Date(prov.dataReuniao), 'dd/MM/yyyy') : ''}
                                </span>
                              </div>

                              {/* Linha 3: Data de Retorno */}
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Data Retorno:</label>
                                <Input
                                  type="date"
                                  value={prov.dataRetorno}
                                  onChange={(e) => handleUpdateProvidencia(prov.id, 'dataRetorno', e.target.value)}
                                  className="h-8 text-xs print:hidden"
                                />
                                <span className="hidden print:inline text-[6px]">
                                  {prov.dataRetorno ? format(new Date(prov.dataRetorno), 'dd/MM/yyyy') : ''}
                                </span>
                              </div>

                              {/* Linha 4: Status */}
                              <div>
                                <label className="text-xs font-medium text-gray-600 block mb-1">Status:</label>
                                <select
                                  value={prov.status}
                                  onChange={(e) => handleUpdateProvidencia(prov.id, 'status', e.target.value)}
                                  className={`w-full text-xs px-2 py-1 rounded ${getStatusColor(prov.status)} print:hidden`}
                                >
                                  {STATUS_OPTIONS.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                                <span className={`hidden print:inline text-[6px] px-1 py-0.5 rounded ${getStatusColor(prov.status)}`}>
                                  {getStatusLabel(prov.status)}
                                </span>
                              </div>

                              {/* Ações */}
                              <div className="flex gap-1 pt-2 border-t border-gray-300 no-print">
                                <button
                                  onClick={() => handleInsertProvidenciaAfter(prov.id)}
                                  className="flex-1 text-green-600 hover:text-green-800 hover:bg-green-50 p-1 rounded"
                                  title="Inserir providência após esta"
                                >
                                  <Plus className="w-3 h-3 mx-auto" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProvidencia(prov.id)}
                                  className="flex-1 text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3 h-3 mx-auto" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Adicionar Providência */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Providências</DialogTitle>
            </DialogHeader>

            {/* Dados do Projeto (compartilhados) */}
            <div className="pb-4 border-b">
              <div>
                <label className="text-sm font-medium">Projeto</label>
                <Select
                  value={novaProvidencia.projeto}
                  onValueChange={(value) => {
                    setNovaProvidencia(prev => ({ ...prev, projeto: value }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {empreendimentos.map(emp => (
                      <SelectItem key={emp.id} value={emp.nome}>{emp.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lista de Providências */}
            <div className="space-y-4 mt-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Providências</label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddLinha}>
                  <Plus className="w-3 h-3 mr-1" />
                  Adicionar Linha
                </Button>
              </div>

              {novaProvidencia.linhas.map((linha, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-gray-50 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Providência {idx + 1}</span>
                    {novaProvidencia.linhas.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="text-red-500 h-6 px-2" onClick={() => handleRemoveLinha(idx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>

                  <div>
                    <Textarea
                      value={linha.providencias}
                      onChange={(e) => handleUpdateLinha(idx, 'providencias', e.target.value)}
                      placeholder="Descreva a providência..."
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="text-xs text-gray-500">Responsável</label>
                      <Select
                        value={linha.responsaveis?.[0] || ''}
                        onValueChange={(value) => handleUpdateLinha(idx, 'responsaveis', [value])}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {usuarios.map(user => (
                            <SelectItem key={user.id} value={user.nome || user.full_name}>
                              {user.nome || user.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Data Reunião</label>
                      <Input
                        type="date"
                        value={linha.dataReuniao}
                        onChange={(e) => handleUpdateLinha(idx, 'dataReuniao', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Data Retorno</label>
                      <Input
                        type="date"
                        value={linha.dataRetorno}
                        onChange={(e) => handleUpdateLinha(idx, 'dataRetorno', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Status</label>
                      <Select
                        value={linha.status}
                        onValueChange={(value) => handleUpdateLinha(idx, 'status', value)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancelar</Button>
              <Button onClick={handleAddProvidencia}>Adicionar {novaProvidencia.linhas.filter(l => l.providencias.trim()).length} Providência(s)</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}