// @ts-nocheck
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import VirtualizedTable from './VirtualizedTable';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Save, Loader2, Upload, Download, Wand2, ChevronRight, ChevronLeft, GripHorizontal } from "lucide-react";
import { DataCadastro, Documento } from "@/entities/all";
import { retryWithBackoff } from "@/components/utils/apiUtils";
import { format } from "date-fns";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// As etapas serão carregadas do empreendimento

const DEFAULT_REVISOES = ["R00", "R01", "R02"];

// Memoized date cell — prevents full grid re-render when one cell changes

// Função utilitária para garantir formato yyyy-MM-dd ou string vazia
function toISODateString(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // Tenta converter datas tipo dd/mm/aaaa ou Date
  if (typeof val === 'string' && val.includes('/')) {
    const [dia, mes, ano] = val.split('/');
    if (ano && mes && dia) {
      return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d)) {
      return d.toISOString().split('T')[0];
    }
  } catch {}
  return '';
}

const DateCell = React.memo(function DateCell({ linhaId, etapa, revisao, value, onUpdate, readOnly, onCopy }) {
  const handleChange = useCallback(
    (e) => onUpdate(linhaId, etapa, revisao, e.target.value),
    [linhaId, etapa, revisao, onUpdate]
  );
  const handleCopy = useCallback(
    () => onCopy(linhaId, etapa, revisao),
    [linhaId, etapa, revisao, onCopy]
  );
  const safeValue = toISODateString(value);
  return (
    <div
      className="border-r border-gray-100 p-0.5 flex-shrink-0 flex items-center relative group"
      style={{ width: '110px', minWidth: '110px' }}
    >
      <input
        type="date"
        value={safeValue}
        onChange={handleChange}
        className="h-8 text-xs w-full px-1 border border-gray-300 rounded cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
        style={{ color: safeValue ? 'black' : 'transparent' }}
        disabled={readOnly}
      />
      {!readOnly && safeValue && (
        <button
          onClick={handleCopy}
          className="text-purple-600 hover:text-purple-800 p-0.5 absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Preencher todas abaixo"
        >
          <Wand2 className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
});

export default function CadastroTab({ empreendimento, readOnly = false }) {
  // Etapas do empreendimento convertidas para uppercase
  const ETAPAS = useMemo(() => {
    if (!empreendimento?.etapas || empreendimento.etapas.length === 0) {
      return [
        "ESTUDO PRELIMINAR",
        "ANTE-PROJETO",
        "PROJETO BÁSICO",
        "PROJETO EXECUTIVO",
        "LIBERADO PARA OBRA"
      ];
    }
    return empreendimento.etapas.map(e => e.toUpperCase());
  }, [empreendimento?.etapas]);

  const [revisoesPorEtapa, setRevisoesPorEtapa] = useState({});
  const [etapasExcluidas, setEtapasExcluidas] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [_loadedEmpreendimentoId, setLoadedEmpreendimentoId] = useState(null);
  // autoSaveTimeoutRef removed — auto-save is disabled
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFolhas, setSelectedFolhas] = useState(new Set());
  const [showMassEditModal, setShowMassEditModal] = useState(false);
  const [massEditEtapa, setMassEditEtapa] = useState('');
  const [massEditRevisao, setMassEditRevisao] = useState('');
  const [massEditData, setMassEditData] = useState('');
  const [etapasMinimizadas, setEtapasMinimizadas] = useState({});
  const [linhasModificadas, setLinhasModificadas] = useState(new Set());
  const [etapasEfetivas, setEtapasEfetivas] = useState([]);
  const [editingRevisao, setEditingRevisao] = useState(null); // { etapa, revisao }
  const [editingRevisaoValue, setEditingRevisaoValue] = useState('');
  const [ordemEtapas, setOrdemEtapas] = useState([]); // ordem customizada de etapas
  
  const folhasScrollRef = useRef(null);
  const dataScrollRef = useRef(null);
  const linhasRef = useRef([]);
  linhasRef.current = linhas; // always current, without useEffect

  useEffect(() => {
    if (!empreendimento?.id) return;
    setIsLoading(true);
    loadData();
  }, [empreendimento?.id]);

  // Auto-save desabilitado - causava conflitos de rate limit
  // useEffect(() => {
  //   if (hasUnsavedChanges && !isLoading && !isSaving) {
  //     console.log('Auto-save agendado - mudanças detectadas');
  //     if (autoSaveTimeoutRef.current) {
  //       clearTimeout(autoSaveTimeoutRef.current);
  //     }
  //     
  //     autoSaveTimeoutRef.current = setTimeout(() => {
  //       console.log('Executando auto-save');
  //       handleSave(true); // true = silent save
  //     }, 5000); // salva após 5 segundos de inatividade
  //   }
  //   
  //   return () => {
  //     if (autoSaveTimeoutRef.current) {
  //       clearTimeout(autoSaveTimeoutRef.current);
  //     }
  //   };
  // }, [hasUnsavedChanges, linhas, isSaving]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [data, docs] = await Promise.all([
        retryWithBackoff(
          () => DataCadastro.filter({ empreendimento_id: empreendimento.id, limit: 10000 }),
          3, 2000,
          'loadDataCadastro'
        ),
        retryWithBackoff(
          () => Documento.filter({ empreendimento_id: empreendimento.id, limit: 10000 }),
          3, 2000,
          'loadDocumentos'
        )
      ]);
      
      // Ordenar por disciplina e depois por arquivo (mesma ordem do DocumentosTab)
      const sortedDocs = (docs || []).sort((a, b) => {
        // Primeiro por disciplina
        const discA = (a.disciplina || 'Sem Disciplina').toLowerCase();
        const discB = (b.disciplina || 'Sem Disciplina').toLowerCase();
        const discCompare = discA.localeCompare(discB, 'pt-BR', { sensitivity: 'base' });

        if (discCompare !== 0) return discCompare;

        // Depois por arquivo (alfabético natural)
        const arquivoA = (a.arquivo || '').trim().toLowerCase();
        const arquivoB = (b.arquivo || '').trim().toLowerCase();
        return arquivoA.localeCompare(arquivoB, 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
          ignorePunctuation: false
        });
      });
      setDocumentos(sortedDocs);
      
      // Criar um mapa de dados existentes por documento_id
      const dataMap = new Map();
      const revisoesMap = {};
      const revisoesExcluidasMap = {};
      const etapasExcluidasSet = new Set();
      
      if (data && data.length > 0) {
        data.forEach((item, itemIdx) => {
          if (item.documento_id) {
            dataMap.set(item.documento_id, item);
          }

          // Detectar revisões existentes e excluídas por etapa
          if (item.datas) {
            Object.entries(item.datas).forEach(([etapa, etapaData]) => {
              if (etapaData && typeof etapaData === 'object') {
                if (!revisoesMap[etapa]) {
                  revisoesMap[etapa] = new Set();
                }
                if (!revisoesExcluidasMap[etapa]) {
                  revisoesExcluidasMap[etapa] = new Set();
                }

                // Adicionar revisões que têm dados preenchidos
                Object.keys(etapaData).forEach(rev => {
                 if (rev !== '_excluida' && rev !== '_revisoes_excluidas' && rev !== '_revisoes_existentes') {
                   const valor = etapaData[rev];
                   revisoesMap[etapa].add(rev);
                 }
                });

                // Carregar revisões que foram criadas (mesmo sem dados)
                if ('_revisoes_existentes' in etapaData) {
                 if (Array.isArray(etapaData._revisoes_existentes)) {
                   etapaData._revisoes_existentes.forEach(rev => {
                     revisoesMap[etapa].add(rev);
                   });
                 } else {
                 }
                }

                // Detectar revisões excluídas
                if (etapaData._revisoes_excluidas && Array.isArray(etapaData._revisoes_excluidas)) {
                  etapaData._revisoes_excluidas.forEach(rev => {
                    revisoesExcluidasMap[etapa].add(rev);
                  });
                }

                // Detectar etapas excluídas
                if (etapaData._excluida) {
                  etapasExcluidasSet.add(etapa);
                }
              }
            });
          }
        });
      }
      
      // Inicializar revisões para TODAS as etapas encontradas nos dados do banco + etapas do empreendimento
      // Priorizar chaves do banco (onde os dados realmente estão), deduplicando case-insensitive
      const etapasDoBanco = Object.keys(revisoesMap);
      const etapasNormalizadas = [...etapasDoBanco];
      ETAPAS.forEach(etapaConfig => {
        const jaExiste = etapasDoBanco.some(e => e.toLowerCase() === etapaConfig.toLowerCase());
        if (!jaExiste) etapasNormalizadas.push(etapaConfig);
      });
      // Ordenar etapas na sequência correta (baseado em ETAPAS)
      const etapasUnion = etapasNormalizadas.sort((a, b) => {
        const indexA = ETAPAS.findIndex(e => e.toLowerCase() === a.toLowerCase());
        const indexB = ETAPAS.findIndex(e => e.toLowerCase() === b.toLowerCase());
        return (indexA !== -1 ? indexA : 999) - (indexB !== -1 ? indexB : 999);
      });
      const revisoesCompletas = {};
      etapasUnion.forEach(etapa => {
        // Usar APENAS as revisões mapeadas (dados + _revisoes_existentes)
        // NÃO usar DEFAULT_REVISOES como fallback, pois pode sobrescrever revisões criadas
        const revisoesEtapaSet = revisoesMap[etapa];
        
        let todasRevisoes = revisoesEtapaSet && revisoesEtapaSet.size > 0
          ? Array.from(revisoesEtapaSet).sort()
          : [...DEFAULT_REVISOES];

        const revisoesExcluidas = revisoesExcluidasMap[etapa] || new Set();
        const filtradas = todasRevisoes.filter(rev => !revisoesExcluidas.has(rev));
        revisoesCompletas[etapa] = filtradas;
      });
      
      
      // Montar linhas baseado nos registros do DataCadastro (fonte primária),
      // depois adicionar documentos que ainda não têm registro.
      const docIdSet = new Set(sortedDocs.map(d => d.id));
      
      // Mapa de índices dos documentos para reordenação
      const docIndexMap = new Map(sortedDocs.map((doc, idx) => [doc.id, idx]));

      // Linhas com DataCadastro existente
      const linhasComData = (data || [])
        .filter(item => item.documento_id);

      const documento_idsComData = new Set(linhasComData.map(l => l.documento_id));

      // Documentos sem registro DataCadastro ainda
      const docsNovos = sortedDocs
        .filter(doc => !documento_idsComData.has(doc.id))
        .map((doc, idx) => ({
          id: `temp-${doc.id}`,
          empreendimento_id: empreendimento.id,
          documento_id: doc.id,
          ordem: linhasComData.length + idx,
          datas: {},
          isNew: true
        }));

      // Ordenar todas as linhas de acordo com a ordem dos documentos
      const todasAsLinhas = [...linhasComData, ...docsNovos];
      const novasLinhas = todasAsLinhas.sort((a, b) => {
        const indexA = docIndexMap.get(a.documento_id) ?? 999999;
        const indexB = docIndexMap.get(b.documento_id) ?? 999999;
        return indexA - indexB;
      });
      
      // Setar tudo junto de uma vez
      setEtapasEfetivas(etapasUnion);
      setRevisoesPorEtapa(revisoesCompletas);
      setEtapasExcluidas(Array.from(etapasExcluidasSet));
      setLinhas(novasLinhas);
      setLoadedEmpreendimentoId(empreendimento.id);
      setLinhasModificadas(new Set());
      
      // Log final para confirmar que revisões foram setadas
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };



  const handleAddRevisao = (etapa) => {
    const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
    if (revisoesEtapa.length === 0) {
      // Se não há revisões, começar com R00
      setHasUnsavedChanges(true);
      setRevisoesPorEtapa(prev => ({
        ...prev,
        [etapa]: ['R00']
      }));
      // Marcar revisão como existente nas linhas mesmo sem dados
      setLinhas(prev => prev.map(linha => {
        const novasDatas = { ...linha.datas };
        if (!novasDatas[etapa]) {
          novasDatas[etapa] = {};
        }
        if (!novasDatas[etapa]._revisoes_existentes) {
          novasDatas[etapa]._revisoes_existentes = [];
        }
        if (!novasDatas[etapa]._revisoes_existentes.includes('R00')) {
          novasDatas[etapa]._revisoes_existentes.push('R00');
        }
        return { ...linha, datas: novasDatas };
      }));
      setLinhasModificadas(new Set(linhas.map(l => l.id)));
      return;
    }
    const ultimaRevisao = revisoesEtapa[revisoesEtapa.length - 1];
    const numero = parseInt(ultimaRevisao.substring(1)) + 1;
    const novaRevisao = `R${String(numero).padStart(2, '0')}`;

    setHasUnsavedChanges(true);
    setRevisoesPorEtapa(prev => ({
      ...prev,
      [etapa]: [...(prev[etapa] || []), novaRevisao]
    }));
    // Marcar revisão como existente nas linhas mesmo sem dados
    setLinhas(prev => prev.map(linha => {
      const novasDatas = { ...linha.datas };
      if (!novasDatas[etapa]) {
        novasDatas[etapa] = { _revisoes_existentes: [novaRevisao] };
      } else {
        if (!novasDatas[etapa]._revisoes_existentes) {
          novasDatas[etapa]._revisoes_existentes = [];
        }
        if (!novasDatas[etapa]._revisoes_existentes.includes(novaRevisao)) {
          novasDatas[etapa]._revisoes_existentes.push(novaRevisao);
        }
      }
      return { ...linha, datas: novasDatas };
    }));
    setLinhasModificadas(new Set(linhas.map(l => l.id)));
  };

  const handleRenameRevisao = (etapa, oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingRevisao(null);
      return;
    }

    setHasUnsavedChanges(true);
    setRevisoesPorEtapa(prev => ({
      ...prev,
      [etapa]: prev[etapa].map(r => r === oldName ? trimmed : r)
    }));

    // Renomear chave nos dados de cada linha
    setLinhas(prev => prev.map(linha => {
      const novasDatas = { ...linha.datas };
      if (novasDatas[etapa]) {
        const etapaData = { ...novasDatas[etapa] };
        if (etapaData[oldName] !== undefined) {
          etapaData[trimmed] = etapaData[oldName];
          delete etapaData[oldName];
        }
        // Atualizar _revisoes_existentes
        if (Array.isArray(etapaData._revisoes_existentes)) {
          etapaData._revisoes_existentes = etapaData._revisoes_existentes.map(r => r === oldName ? trimmed : r);
        }
        novasDatas[etapa] = etapaData;
      }
      return { ...linha, datas: novasDatas };
    }));
    setLinhasModificadas(new Set(linhas.map(l => l.id)));
    setEditingRevisao(null);
  };

  const handleRemoveRevisao = (etapa, revisao) => {
    if (!confirm(`Deseja excluir a revisão ${revisao} da etapa ${etapa}? Os dados desta revisão serão perdidos.`)) return;
    
    setHasUnsavedChanges(true);
    setRevisoesPorEtapa(prev => ({
      ...prev,
      [etapa]: prev[etapa].filter(r => r !== revisao)
    }));
    
    // Limpar dados e marcar revisão como excluída
    setLinhas(prev => prev.map(linha => {
      const novasDatas = { ...linha.datas };
      if (!novasDatas[etapa]) {
        novasDatas[etapa] = {};
      }
      
      // Remover dados da revisão
      if (novasDatas[etapa][revisao]) {
        delete novasDatas[etapa][revisao];
      }
      
      // Adicionar à lista de revisões excluídas
      if (!novasDatas[etapa]._revisoes_excluidas) {
        novasDatas[etapa]._revisoes_excluidas = [];
      }
      if (!novasDatas[etapa]._revisoes_excluidas.includes(revisao)) {
        novasDatas[etapa]._revisoes_excluidas.push(revisao);
      }
      
      return { ...linha, datas: novasDatas };
    }));
    setLinhasModificadas(new Set(linhas.map(l => l.id)));
  };

  const handleExcluirEtapa = (etapa) => {
    if (!confirm(`Deseja excluir a etapa ${etapa}? Você poderá restaurá-la depois se necessário.`)) return;
    
    setHasUnsavedChanges(true);
    setEtapasExcluidas(prev => [...prev, etapa]);
    
    // Marcar etapa como excluída nas linhas
    setLinhas(prev => prev.map(linha => {
      const novasDatas = { ...linha.datas };
      if (!novasDatas[etapa]) {
        novasDatas[etapa] = {};
      }
      novasDatas[etapa]._excluida = true;
      return { ...linha, datas: novasDatas };
    }));
    setLinhasModificadas(new Set(linhas.map(l => l.id)));
  };

  const handleRestaurarEtapa = (etapa) => {
    setHasUnsavedChanges(true);
    setEtapasExcluidas(prev => prev.filter(e => e !== etapa));
    
    // Remover marcador de exclusão
    setLinhas(prev => prev.map(linha => {
      const novasDatas = { ...linha.datas };
      if (novasDatas[etapa] && novasDatas[etapa]._excluida) {
        delete novasDatas[etapa]._excluida;
      }
      return { ...linha, datas: novasDatas };
    }));
    setLinhasModificadas(new Set(linhas.map(l => l.id)));
  };

  const handleUpdateData = useCallback((linhaId, etapa, revisao, valor) => {
    setLinhasModificadas(prev => new Set([...prev, linhaId]));
    setLinhas(prev => prev.map(linha => {
      if (linha.id !== linhaId) return linha;
      const novasDatas = { ...linha.datas };
      if (!novasDatas[etapa]) novasDatas[etapa] = {};
      if (!valor || valor.trim() === '') {
        delete novasDatas[etapa][revisao];
      } else {
        novasDatas[etapa][revisao] = valor;
      }
      return { ...linha, datas: novasDatas };
    }));
    setHasUnsavedChanges(true);
  }, []);

  const copiarDataParaBaixo = useCallback((linhaId, etapa, revisao) => {
    const currentLinhas = linhasRef.current;
    const linhaIndex = currentLinhas.findIndex(l => l.id === linhaId);
    if (linhaIndex === -1) return;

    const valorOriginal = currentLinhas[linhaIndex].datas?.[etapa]?.[revisao] || '';
    if (!valorOriginal || valorOriginal === '0001-01-01' || valorOriginal.includes('dd/mm/aaaa')) {
      alert('Selecione uma data primeiro');
      return;
    }

    if (!confirm(`Copiar a data ${format(new Date(valorOriginal), 'dd/MM/yyyy')} para todas as células abaixo nesta coluna?`)) return;

    setHasUnsavedChanges(true);
    const linhasAfetadas = currentLinhas.slice(linhaIndex + 1).map(l => l.id);
    setLinhasModificadas(prev => new Set([...prev, ...linhasAfetadas]));
    setLinhas(prev => prev.map((linha, idx) => {
      if (idx <= linhaIndex) return linha;
      const novasDatas = { ...linha.datas };
      if (!novasDatas[etapa]) novasDatas[etapa] = {};
      novasDatas[etapa][revisao] = valorOriginal;
      return { ...linha, datas: novasDatas };
    }));
  }, []);

  const copiarLinhaParaProxima = (linhaId) => {
    const linhaIndex = linhas.findIndex(l => l.id === linhaId);
    if (linhaIndex === -1 || linhaIndex === linhas.length - 1) return;
    
    const linhaOriginal = linhas[linhaIndex];
    if (!linhaOriginal.datas || Object.keys(linhaOriginal.datas).length === 0) {
      alert('Esta linha não possui datas para copiar');
      return;
    }
    
    if (!confirm('Copiar todas as datas desta linha para a próxima linha?')) return;
    
    setHasUnsavedChanges(true);
    const proxLinha = linhas[linhaIndex + 1];
    if (proxLinha) {
      setLinhasModificadas(prev => new Set([...prev, proxLinha.id]));
    }
    setLinhas(prev => prev.map((linha, idx) => {
      if (idx !== linhaIndex + 1) return linha;
      
      // Deep clone do objeto datas para evitar referências compartilhadas
      return { ...linha, datas: JSON.parse(JSON.stringify(linhaOriginal.datas)) };
    }));
  };

  const copiarDataParaProximaColuna = (linhaId, etapa, revisao) => {
    const linha = linhas.find(l => l.id === linhaId);
    if (!linha) return;
    
    const valorOriginal = getDataValue(linha, etapa, revisao);
    if (!valorOriginal) {
      alert('Selecione uma data primeiro');
      return;
    }
    
    const etapasVisiveis = ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e));
    const etapaIndex = etapasVisiveis.indexOf(etapa);
    const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
    const revisaoIndex = revisoesEtapa.indexOf(revisao);
    
    setHasUnsavedChanges(true);
    setLinhasModificadas(prev => new Set([...prev, linhaId]));
    setLinhas(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      
      const novasDatas = { ...l.datas };
      
      // Se há próxima revisão na mesma etapa
      if (revisaoIndex < revisoesEtapa.length - 1) {
        if (!novasDatas[etapa]) novasDatas[etapa] = {};
        novasDatas[etapa][revisoesEtapa[revisaoIndex + 1]] = valorOriginal;
      } 
      // Senão, vai para primeira revisão da próxima etapa
      else if (etapaIndex < etapasVisiveis.length - 1) {
        const proxEtapa = etapasVisiveis[etapaIndex + 1];
        const proxRevisoes = revisoesPorEtapa[proxEtapa] || DEFAULT_REVISOES;
        if (proxRevisoes.length > 0) {
          if (!novasDatas[proxEtapa]) novasDatas[proxEtapa] = {};
          novasDatas[proxEtapa][proxRevisoes[0]] = valorOriginal;
        }
      }
      
      return { ...l, datas: novasDatas };
    }));
  };

  const toggleSelectFolha = (linhaId) => {
    setSelectedFolhas(prev => {
      const newSet = new Set(prev);
      if (newSet.has(linhaId)) {
        newSet.delete(linhaId);
      } else {
        newSet.add(linhaId);
      }
      return newSet;
    });
  };

  const selectAllFolhas = () => {
    setSelectedFolhas(new Set(linhas.map(l => l.id)));
  };

  const clearSelection = () => {
    setSelectedFolhas(new Set());
  };

  const handleMassEdit = () => {
    if (selectedFolhas.size === 0) {
      alert('Selecione ao menos uma folha');
      return;
    }
    setShowMassEditModal(true);
  };

  const applyMassEdit = () => {
    if (!massEditEtapa || !massEditRevisao || !massEditData) {
      alert('Preencha etapa, revisão e data');
      return;
    }

    setHasUnsavedChanges(true);
    setLinhasModificadas(prev => new Set([...prev, ...Array.from(selectedFolhas)]));
    setLinhas(prev => prev.map(linha => {
      if (!selectedFolhas.has(linha.id)) return linha;
      
      const novasDatas = { ...linha.datas };
      if (!novasDatas[massEditEtapa]) {
        novasDatas[massEditEtapa] = {};
      }
      novasDatas[massEditEtapa][massEditRevisao] = massEditData;
      
      return { ...linha, datas: novasDatas };
    }));

    setShowMassEditModal(false);
    setMassEditEtapa('');
    setMassEditRevisao('');
    setMassEditData('');
    clearSelection();
  };

  const toggleMinimizarEtapa = (etapa) => {
    setEtapasMinimizadas(prev => ({
      ...prev,
      [etapa]: !prev[etapa]
    }));
  };

  const copiarDataParaDireita = (linhaId, etapa, revisao) => {
    const linha = linhas.find(l => l.id === linhaId);
    if (!linha) return;
    
    const valorOriginal = getDataValue(linha, etapa, revisao);
    if (!valorOriginal) {
      alert('Selecione uma data primeiro');
      return;
    }
    
    const etapasVisiveis = ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e));
    const etapaIndex = etapasVisiveis.indexOf(etapa);
    const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
    const revisaoIndex = revisoesEtapa.indexOf(revisao);
    
    if (!confirm(`Copiar a data ${format(new Date(valorOriginal), 'dd/MM/yyyy')} para todas as células à direita nesta linha?`)) return;
    
    setHasUnsavedChanges(true);
    setLinhasModificadas(prev => new Set([...prev, linhaId]));
    setLinhas(prev => prev.map(l => {
      if (l.id !== linhaId) return l;
      
      const novasDatas = { ...l.datas };
      
      // Copiar para revisões seguintes da mesma etapa
      for (let i = revisaoIndex + 1; i < revisoesEtapa.length; i++) {
        if (!novasDatas[etapa]) novasDatas[etapa] = {};
        novasDatas[etapa][revisoesEtapa[i]] = valorOriginal;
      }
      
      // Copiar para próximas etapas
      for (let i = etapaIndex + 1; i < etapasVisiveis.length; i++) {
        const proxEtapa = etapasVisiveis[i];
        const proxRevisoes = revisoesPorEtapa[proxEtapa] || DEFAULT_REVISOES;
        
        if (!novasDatas[proxEtapa]) novasDatas[proxEtapa] = {};
        proxRevisoes.forEach(rev => {
          novasDatas[proxEtapa][rev] = valorOriginal;
        });
      }
      
      return { ...l, datas: novasDatas };
    }));
  };



  const handleSave = async (silent = false) => {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      
      // SALVAR APENAS linhas modificadas OU todas se não há rastreamento
      const linhasParaSalvar = linhas.filter(linha => {
        if (!linha.documento_id) {
          return false;
        }
        
        // Se há rastreamento de modificações, salvar apenas modificadas
        if (linhasModificadas.size > 0 && !linhasModificadas.has(linha.id)) {
          return false;
        }
        
        // Se tem datas (mesmo vazias), pode ter metadados
        if (linha.datas && Object.keys(linha.datas).length > 0) {
          return true;
        }
        
        // Se não tem datas nenhuma, não salva
        return false;
      });
      

      // Processar em lotes sequenciais para evitar rate limit
       let successCount = 0;
       let errorCount = 0;
       const updatedLinhas = new Map();
       const BATCH_SIZE = 5; // Máximo de requisições paralelas por lote
       const DELAY_ENTRE_LOTES = 800; // Delay entre lotes em ms

       // Dividir em lotes
       for (let batchIdx = 0; batchIdx < linhasParaSalvar.length; batchIdx += BATCH_SIZE) {
         const batch = linhasParaSalvar.slice(batchIdx, batchIdx + BATCH_SIZE);

         const batchPromises = batch.map((linha, _idxNoBatch) => 
           (async () => {
             try {

               // Preservar metadados
               const datasComMetadados = {};
               if (linha.datas) {
                 Object.entries(linha.datas).forEach(([etapa, etapaData]) => {
                   if (etapaData && typeof etapaData === 'object') {
                     datasComMetadados[etapa] = {
                       ...etapaData
                     };
                   }
                 });
               }

               const linhaData = {
                 empreendimento_id: empreendimento.id,
                 ordem: linha.ordem ?? linhasParaSalvar.indexOf(linha),
                 documento_id: linha.documento_id,
                 datas: datasComMetadados
               };

               // GARANTIR que revisões criadas são salvas mesmo que vazias
               const etapasVisiveis = ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e));
               etapasVisiveis.forEach(etapa => {
                 const revisoesEtapa = revisoesPorEtapa[etapa];
                 if (revisoesEtapa && revisoesEtapa.length > 0) {
                   if (!datasComMetadados[etapa]) {
                     datasComMetadados[etapa] = {};
                   }
                   // FORÇAR que _revisoes_existentes tem as revisões reais
                   datasComMetadados[etapa]._revisoes_existentes = revisoesEtapa;
                 }
               });

               const linhaDataFinal = {
                 ...linhaData,
                 datas: datasComMetadados
               };


               let result;
               let attempts = 0;
               const maxAttempts = 3;

               while (attempts < maxAttempts) {
                 try {
                   const isNew = linha.isNew || linha.id.toString().startsWith('temp-');

                   if (isNew) {
                     result = await DataCadastro.create(linhaDataFinal);
                   } else {
                     result = await DataCadastro.update(linha.id, linhaDataFinal);
                   }
                   break;
                 } catch (err) {
                   attempts++;
                   console.error(`  ❌ Tentativa ${attempts} falhou:`, err.message);

                   if (attempts >= maxAttempts) {
                     throw err;
                   }

                   const waitTime = 3000 * attempts;
                   await new Promise(resolve => setTimeout(resolve, waitTime));
                 }
               }

               successCount++;
               updatedLinhas.set(linha.id, result);
             } catch (error) {
               errorCount++;
               console.error(`❌ ERRO na linha ${linha.id}:`, error);
             }
           })()
         );

         // Executar lote em paralelo
         await Promise.all(batchPromises);

         // Delay entre lotes (exceto no último)
         if (batchIdx + BATCH_SIZE < linhasParaSalvar.length) {
           await new Promise(resolve => setTimeout(resolve, DELAY_ENTRE_LOTES));
         }
       }

      // Atualizar estado local com os IDs salvos
      setLinhas(prev => prev.map(linha => {
        const savedData = updatedLinhas.get(linha.id);
        if (savedData) {
          return { ...linha, id: savedData.id, isNew: false };
        }
        return linha;
      }));

      setHasUnsavedChanges(false);
      setLinhasModificadas(new Set());

      if (!silent) {
        if (errorCount > 0) {
          alert(`Salvamento parcial: ${successCount} sucesso, ${errorCount} erros.`);
        } else {
          alert(`Dados salvos com sucesso! ${successCount} linhas atualizadas.`);
        }
      }
    } catch (error) {
      console.error('💥 ERRO CRÍTICO ao salvar:', error);
      if (!silent) {
        alert(`Erro ao salvar dados: ${error.message || 'Erro desconhecido'}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const getDataValue = (linha, etapa, revisao) => {
  const data = linha.datas?.[etapa]?.[revisao] || '';
  // Não exibir datas inválidas (01/01/0001 ou dd/mm/aaaa)
  if (!data || data === '0001-01-01' || (typeof data === 'string' && data.includes('dd/mm/aaaa'))) {
    return '';
  }
  return typeof data === 'string' ? data : '';
  };

  const docMap = useMemo(() => new Map(documentos.map(d => [d.id, d])), [documentos]);

  const linhasPorDisciplina = useMemo(() => {
    const grupos = {};
    linhas.forEach(linha => {
      const doc = docMap.get(linha.documento_id);
      if (!doc) return;
      const disciplina = doc.disciplina || 'Sem Disciplina';
      if (!grupos[disciplina]) grupos[disciplina] = [];
      grupos[disciplina].push(linha);
    });
    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [linhas, docMap]);

  const ETAPAS_VIEW_BASE = etapasEfetivas.length > 0 ? etapasEfetivas : ETAPAS;
  // Aplicar ordem customizada se existir
  const ETAPAS_VIEW = useMemo(() => {
    if (ordemEtapas.length === 0) return ETAPAS_VIEW_BASE;
    const sorted = [...ETAPAS_VIEW_BASE].sort((a, b) => {
      const ia = ordemEtapas.indexOf(a);
      const ib = ordemEtapas.indexOf(b);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return sorted;
  }, [ETAPAS_VIEW_BASE, ordemEtapas]);

  // Pre-computed memoized value — avoids repeated .filter() in render loops
  const etapasVisiveis = useMemo(
    () => ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e)),
    [ETAPAS_VIEW, etapasExcluidas]
  );

  const handleDragEndEtapas = (result) => {
    if (!result.destination) return;
    const etapasParaOrdenar = ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e));
    const novaOrdem = Array.from(etapasParaOrdenar);
    const [moved] = novaOrdem.splice(result.source.index, 1);
    novaOrdem.splice(result.destination.index, 0, moved);
    // Incluir etapas excluídas ao final para não perdê-las
    const excluidas = ETAPAS_VIEW.filter(e => etapasExcluidas.includes(e));
    setOrdemEtapas([...novaOrdem, ...excluidas]);
  };

  const larguraTotalEtapas = useMemo(() => {
    const etapasVisiveis = ETAPAS_VIEW_BASE.filter(e => !etapasExcluidas.includes(e));
    return etapasVisiveis.reduce((total, etapa) => {
      const isMinimizada = etapasMinimizadas[etapa];
      if (isMinimizada) {
        return total + 40;
      }
      const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
      return total + ((revisoesEtapa.length * 110) + 40);
    }, 0);
  }, [ETAPAS_VIEW, etapasExcluidas, etapasMinimizadas, revisoesPorEtapa]);

  const handleExportData = () => {
    const etapasVisiveis = ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e));

    // Cabeçalhos
    let headers = ['folha', 'descritivo', 'disciplina'];
    etapasVisiveis.forEach(etapa => {
      const revisoes = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
      revisoes.forEach(rev => {
        headers.push(`${etapa}_${rev}`);
      });
    });

    // Linhas de dados
    const rows = linhas.map(linha => {
      const doc = documentos.find(d => d.id === linha.documento_id);
      const row = [
        doc?.arquivo || doc?.numero || '',
        doc?.descritivo || '',
        doc?.disciplina || ''
      ];

      etapasVisiveis.forEach(etapa => {
        const revisoes = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
        revisoes.forEach(rev => {
          const val = getDataValue(linha, etapa, rev);
          if (val) {
            // Converter de yyyy-mm-dd para dd/mm/yyyy
            const [ano, mes, dia] = val.split('-');
            row.push(`${dia}/${mes}/${ano}`);
          } else {
            row.push('');
          }
        });
      });

      return row;
    });

    const csvContent = [
      headers.join(';'),
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cadastro_${empreendimento.nome.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const handleExportTemplate = () => {
    const etapasVisiveis = ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e));
    
    // Criar cabeçalhos dinamicamente
    let headers = ['folha'];
    etapasVisiveis.forEach(etapa => {
      const revisoes = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
      revisoes.forEach(rev => {
        headers.push(`${etapa}_${rev}`);
      });
    });
    
    const csvContent = [
      headers.join(';'),
      // Linha de exemplo
      [
        'ARQ-01',
        ...etapasVisiveis.flatMap(etapa => 
          (revisoesPorEtapa[etapa] || DEFAULT_REVISOES).map(() => '15/01/2025')
        )
      ].join(';')
    ].join('\n');
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `template_cadastro_${empreendimento.nome.replace(/\s+/g, '_')}.csv`;
    link.click();
  };

  const handleImport = async () => {
    if (!importFile) {
      alert('Selecione um arquivo para importar');
      return;
    }

    setIsImporting(true);
    try {
      const fileContent = await importFile.text();
      const lines = fileContent.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        alert('Arquivo vazio ou inválido');
        return;
      }

      // Detectar separador (ponto-e-vírgula ou vírgula)
      const separator = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(separator).map(h => h.trim());

      if (!headers.includes('folha')) {
        alert('Cabeçalho "folha" obrigatório não encontrado');
        return;
      }

      const dadosParaImportar = [];
      const erros = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(separator).map(v => v.trim());
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        const folhaNome = row.folha;
        if (!folhaNome) {
          erros.push(`Linha ${i + 1}: Nome da folha é obrigatório`);
          continue;
        }

        // Buscar documento por número ou arquivo
        const documento = documentos.find(d => 
          d.numero === folhaNome || d.arquivo === folhaNome
        );

        if (!documento) {
          erros.push(`Linha ${i + 1}: Folha "${folhaNome}" não encontrada`);
          continue;
        }

        // Processar datas por etapa e revisão
        const datas = {};
        headers.forEach(header => {
          if (header === 'folha') return;

          const data = row[header];
          if (!data) return;

          // Formato esperado: "ETAPA_REVISAO"
          const parts = header.split('_');
          if (parts.length < 2) return;

          const revisao = parts.pop();
          const etapa = parts.join('_');

          // Converter data de dd/mm/aaaa para aaaa-mm-dd
          let dataFormatada = data;
          if (data.includes('/')) {
            const [dia, mes, ano] = data.split('/');
            if (dia && mes && ano) {
              dataFormatada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            }
          }

          if (!datas[etapa]) {
            datas[etapa] = {};
          }
          datas[etapa][revisao] = dataFormatada;
        });

        dadosParaImportar.push({
          documento_id: documento.id,
          datas
        });
      }

      if (erros.length > 0) {
        alert(`Erros encontrados:\n${erros.join('\n')}\n\nContinuar com os registros válidos?`);
      }

      if (dadosParaImportar.length === 0) {
        alert('Nenhum registro válido encontrado no arquivo');
        return;
      }

      let sucessos = 0;
      let falhas = 0;

      for (const dado of dadosParaImportar) {
        try {
          // Verificar se já existe registro para este documento
          const linhaExistente = linhas.find(l => l.documento_id === dado.documento_id);

          if (linhaExistente && !linhaExistente.isNew && !linhaExistente.id.toString().startsWith('temp-')) {
            // Atualizar registro existente
            await retryWithBackoff(
              () => DataCadastro.update(linhaExistente.id, {
                datas: { ...linhaExistente.datas, ...dado.datas }
              }),
              3, 1000, `importUpdate-${linhaExistente.id}`
            );
          } else {
            // Criar novo registro
            const ordem = linhas.length;
            await retryWithBackoff(
              () => DataCadastro.create({
                empreendimento_id: empreendimento.id,
                ordem,
                documento_id: dado.documento_id,
                datas: dado.datas
              }),
              3, 1000, `importCreate-${dado.documento_id}`
            );
          }
          sucessos++;
        } catch (error) {
          console.error(`Erro ao importar ${dado.documento_id}:`, error);
          falhas++;
        }
      }

      alert(`Importação concluída!\n\nSucessos: ${sucessos}\nFalhas: ${falhas}`);

      if (sucessos > 0) {
        await loadData();
        setShowImportModal(false);
        setImportFile(null);
      }

    } catch (error) {
      console.error('Erro na importação:', error);
      alert(`Erro ao processar arquivo: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800">Datas de Cadastro</h2>
          {readOnly && <Badge variant="outline" className="text-xs">Somente Visualização</Badge>}
          {!readOnly && hasUnsavedChanges && (
            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
              Alterações não salvas
            </Badge>
          )}
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            {selectedFolhas.size > 0 && (
              <>
                <Badge variant="outline" className="px-3 py-1">
                  {selectedFolhas.size} folha{selectedFolhas.size > 1 ? 's' : ''} selecionada{selectedFolhas.size > 1 ? 's' : ''}
                </Badge>
                <Button
                  variant="outline"
                  onClick={handleMassEdit}
                  className="border-purple-500 text-purple-600 hover:bg-purple-50"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Preencher em Massa
                </Button>
                <Button
                  variant="outline"
                  onClick={clearSelection}
                  className="border-gray-400 text-gray-600 hover:bg-gray-50"
                >
                  Limpar Seleção
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={handleExportData}
              className="border-blue-500 text-blue-600 hover:bg-blue-50"
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowImportModal(true)}
              className="border-green-500 text-green-600 hover:bg-green-50"
            >
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        )}
      </div>

      {/* Botão flutuante de salvar */}
      {!readOnly && (
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
          size="icon"
        >
          {isSaving ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Save className="w-6 h-6" />
          )}
        </Button>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="flex h-[calc(100vh-300px)] overflow-hidden max-w-full">
          {/* Container de Folhas Fixo - 20% */}
          <div className="w-[20%] border-r-2 border-gray-300 flex flex-col bg-gray-50">
            {/* Cabeçalho Fixo das Folhas */}
            <div className="bg-blue-100 border-b-2 border-gray-300 px-2 sticky top-0 z-30 flex items-center" style={{ height: '72px' }}>
              <div className="flex items-center gap-2">
                {!readOnly && (
                  <input
                    type="checkbox"
                    checked={linhas.length > 0 && selectedFolhas.size === linhas.length}
                    onChange={(e) => e.target.checked ? selectAllFolhas() : clearSelection()}
                    className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="Selecionar todas"
                  />
                )}
                <span className="font-semibold text-sm">Folha</span>
              </div>
            </div>

            {/* Lista de Folhas */}
            <div 
              ref={folhasScrollRef}
              className="flex-1 overflow-y-auto"
              onScroll={(e) => {
                if (dataScrollRef.current) {
                  dataScrollRef.current.scrollTop = e.target.scrollTop;
                }
              }}
            >
              {linhas.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhum documento cadastrado neste empreendimento. Cadastre documentos na aba "Documentos" primeiro.
                </div>
              ) : (
                linhasPorDisciplina.map(([disciplina, linhasDaDisciplina]) => (
                  <div key={disciplina}>
                    {/* Cabeçalho da Disciplina */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-300 px-2 flex items-center" style={{ height: '44px' }}>
                      <div className="flex items-center gap-1.5 w-full">
                        <div className="w-1 h-5 bg-blue-600 rounded-full"></div>
                        <h3 className="font-semibold text-sm text-gray-800">{disciplina}</h3>
                        <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                          {linhasDaDisciplina.length}
                        </Badge>
                      </div>
                    </div>

                    {/* Folhas da Disciplina */}
                    {linhasDaDisciplina.map((linha) => {
                      const doc = documentos.find(d => d.id === linha.documento_id);
                      return (
                        <div
                          key={linha.id}
                          className="border-b border-gray-200 px-2 hover:bg-gray-100 transition-colors flex items-center"
                          style={{ height: '48px' }}
                        >
                          <div className="flex items-center gap-1.5 w-full">
                            {!readOnly && (
                              <input
                                type="checkbox"
                                checked={selectedFolhas.has(linha.id)}
                                onChange={() => toggleSelectFolha(linha.id)}
                                className="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs text-gray-900 truncate" title={doc?.arquivo || doc?.numero || 'Sem folha'}>
                                {doc?.arquivo || doc?.numero || 'Sem folha'}
                              </div>
                              {doc?.descritivo && (
                                <div className="text-xs text-gray-500 mt-0.5 line-clamp-1" title={doc.descritivo}>
                                  {doc.descritivo}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Container de Etapas com Scroll Horizontal - 80% */}
          <div className="w-[80%] flex flex-col overflow-hidden">
            <div 
              ref={dataScrollRef}
              className="flex-1 overflow-x-auto overflow-y-auto"
              onScroll={(e) => {
                if (folhasScrollRef.current && e.target.scrollTop !== folhasScrollRef.current.scrollTop) {
                  folhasScrollRef.current.scrollTop = e.target.scrollTop;
                }
              }}
            >
              <div style={{ width: `${larguraTotalEtapas}px` }}>
                {/* Cabeçalho Fixo das Etapas */}
                <div className="bg-blue-100 border-b-2 border-gray-300 sticky top-0 z-20" style={{ minWidth: `${larguraTotalEtapas}px`, height: '72px' }}>
                  <DragDropContext onDragEnd={handleDragEndEtapas}>
                    <Droppable droppableId="etapas-header" direction="horizontal">
                      {(provided) => (
                        <div className="flex h-full" ref={provided.innerRef} {...provided.droppableProps}>
                          {ETAPAS_VIEW.filter(etapa => !etapasExcluidas.includes(etapa)).map((etapa, idx) => {
                            const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
                            const isMinimizada = etapasMinimizadas[etapa];
                            const colWidth = isMinimizada ? 40 : (revisoesEtapa.length * 110) + 40;

                            return (
                              <Draggable key={etapa} draggableId={etapa} index={idx}>
                                {(prov, snapshot) => (
                                  <div
                                    ref={prov.innerRef}
                                    {...prov.draggableProps}
                                    className={`border-r border-gray-300 last:border-r-0 relative group flex-shrink-0 flex flex-col ${snapshot.isDragging ? 'opacity-80 shadow-lg z-50' : ''}`}
                                    style={{ width: `${colWidth}px`, minWidth: `${colWidth}px`, ...prov.draggableProps.style }}
                                  >
                                    <div className="p-1.5 text-center font-semibold flex-1 flex items-center justify-center">
                                      <div className="flex items-center justify-center gap-1">
                                        {/* Drag handle */}
                                        <span {...prov.dragHandleProps} className="cursor-grab text-gray-400 hover:text-gray-600" title="Arrastar para reordenar">
                                          <GripHorizontal className="w-3 h-3" />
                                        </span>
                                        <button
                                          onClick={() => toggleMinimizarEtapa(etapa)}
                                          className="text-gray-600 hover:text-gray-900 p-0.5"
                                          title={isMinimizada ? "Expandir" : "Minimizar"}
                                        >
                                          {isMinimizada ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
                                        </button>
                                        <span className={`${isMinimizada ? 'writing-mode-vertical-rl transform rotate-180 text-xs' : 'text-xs'}`}>
                                          {isMinimizada ? etapa.substring(0, 3).toUpperCase() : etapa}
                                        </span>
                                        {!readOnly && !isMinimizada && (
                                          <button
                                            onClick={() => handleExcluirEtapa(etapa)}
                                            className="absolute top-0.5 right-0.5 text-red-500 hover:text-red-700 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded"
                                            title="Excluir etapa"
                                          >
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Cabeçalho de Revisões */}
                                    {!isMinimizada && (
                                      <div className="flex border-t border-gray-300 bg-blue-50">
                                        {revisoesEtapa.map((revisao) => (
                                          <div
                                            key={`${etapa}-${revisao}`}
                                            className="border-r border-gray-200 p-1 text-center font-medium text-xs"
                                            style={{ width: '110px', minWidth: '110px' }}
                                          >
                                            <div className="flex items-center justify-center gap-0.5">
                                              {!readOnly && editingRevisao?.etapa === etapa && editingRevisao?.revisao === revisao ? (
                                                <input
                                                  autoFocus
                                                  value={editingRevisaoValue}
                                                  onChange={(e) => setEditingRevisaoValue(e.target.value)}
                                                  onBlur={() => handleRenameRevisao(etapa, revisao, editingRevisaoValue)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameRevisao(etapa, revisao, editingRevisaoValue);
                                                    if (e.key === 'Escape') setEditingRevisao(null);
                                                  }}
                                                  className="w-16 px-1 py-0 text-xs border border-blue-500 rounded text-center"
                                                />
                                              ) : (
                                                <span
                                                  className={!readOnly ? 'cursor-pointer hover:text-blue-600' : ''}
                                                  title={!readOnly ? 'Clique duplo para renomear' : ''}
                                                  onDoubleClick={() => {
                                                    if (readOnly) return;
                                                    setEditingRevisao({ etapa, revisao });
                                                    setEditingRevisaoValue(revisao);
                                                  }}
                                                >{revisao}</span>
                                              )}
                                              {!readOnly && !(editingRevisao?.etapa === etapa && editingRevisao?.revisao === revisao) && (
                                                <button
                                                  onClick={() => handleRemoveRevisao(etapa, revisao)}
                                                  className="text-red-500 hover:text-red-700 p-0.5"
                                                  title={`Excluir revisão ${revisao}`}
                                                >
                                                  <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                        <div className="bg-green-50 p-0.5 text-center" style={{ width: '40px', minWidth: '40px' }}>
                                          {!readOnly && (
                                            <button
                                              onClick={() => handleAddRevisao(etapa)}
                                              className="text-green-600 hover:text-green-800 p-0.5"
                                              title="Adicionar revisão"
                                            >
                                              <Plus className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>

                {/* Área de Dados */}
                <div style={{ minWidth: `${larguraTotalEtapas}px` }}>
              {linhas.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhum documento cadastrado
                </div>
              ) : (
                <>
                  {/* Cabeçalhos das disciplinas (alinham com colunas de folhas) */}
                  {linhasPorDisciplina.map(([disciplina]) => (
                    <div key={disciplina} className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-300 flex" style={{ minWidth: `${larguraTotalEtapas}px`, height: '44px' }}>
                      {ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e)).map((etapa) => {
                        const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
                        const isMinimizada = etapasMinimizadas[etapa];
                        return (
                          <div
                            key={`${disciplina}-${etapa}`}
                            className="border-r border-gray-200 flex-shrink-0"
                            style={{ 
                              width: isMinimizada ? '40px' : `${(revisoesEtapa.length * 110) + 40}px`,
                              minWidth: isMinimizada ? '40px' : `${(revisoesEtapa.length * 110) + 40}px`
                            }}
                          ></div>
                        );
                      })}
                    </div>
                  ))}
                  {/* Virtualização das linhas */}
                  <VirtualizedTable
                    height={500}
                    itemCount={linhas.length}
                    itemSize={48}
                    width={larguraTotalEtapas}
                    renderRow={(rowIdx) => {
                      const linha = linhas[rowIdx];
                      const doc = docMap.get(linha.documento_id);
                      return (
                        <div key={linha.id} className="flex border-b border-gray-200 hover:bg-gray-50" style={{ minWidth: `${larguraTotalEtapas}px`, height: '48px' }}>
                          {etapasVisiveis.map((etapa) => {
                            const revisoesEtapa = revisoesPorEtapa[etapa] || DEFAULT_REVISOES;
                            const isMinimizada = etapasMinimizadas[etapa];
                            return (
                              <div
                                key={`${linha.id}-${etapa}`}
                                className="border-r border-gray-200 last:border-r-0 flex-shrink-0"
                                style={{ width: isMinimizada ? '40px' : `${(revisoesEtapa.length * 110) + 40}px`, minWidth: isMinimizada ? '40px' : `${(revisoesEtapa.length * 110) + 40}px` }}
                              >
                                {isMinimizada ? (
                                  <div className="h-full flex items-center justify-center p-0.5 bg-gray-50"></div>
                                ) : (
                                  <div className="flex">
                                    {revisoesEtapa.map((revisao) => (
                                      <div
                                        key={`${linha.id}-${etapa}-${revisao}`}
                                        className="border-r border-gray-100 p-0.5 flex-shrink-0 flex items-center relative group"
                                        style={{ width: '110px', minWidth: '110px' }}
                                      >
                                        <input
                                          type="date"
                                          value={toISODateString(getDataValue(linha, etapa, revisao))}
                                          onChange={(e) => handleUpdateData(linha.id, etapa, revisao, e.target.value)}
                                          className="h-8 text-xs w-full px-1 border border-gray-300 rounded cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
                                          style={{ color: toISODateString(getDataValue(linha, etapa, revisao)) ? 'black' : 'transparent' }}
                                          disabled={readOnly}
                                        />
                                        {!readOnly && getDataValue(linha, etapa, revisao) && (
                                          <button
                                            onClick={() => copiarDataParaBaixo(linha.id, etapa, revisao)}
                                            className="text-purple-600 hover:text-purple-800 p-0.5 absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Preencher todas abaixo"
                                          >
                                            <Wand2 className="w-2.5 h-2.5" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                    <div className="p-0.5 flex-shrink-0" style={{ width: '40px', minWidth: '40px' }}></div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                </>
              )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {etapasExcluidas.length > 0 && (
        <div className="mt-4 bg-gray-50 border border-gray-300 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Etapas Excluídas</h3>
          <div className="flex flex-wrap gap-2">
            {etapasExcluidas.map(etapa => (
              <Button
                key={etapa}
                variant="outline"
                size="sm"
                onClick={() => handleRestaurarEtapa(etapa)}
                className="text-xs"
              >
                {etapa} - Clique para restaurar
              </Button>
            ))}
          </div>
        </div>
        )}

        {/* Modal de Importação */}
        <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Datas de Cadastro</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">📋 Instruções</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Envie um arquivo CSV com as datas de cadastro</li>
                <li>• Coluna obrigatória: <code className="bg-white px-1 rounded">folha</code> (número ou arquivo do documento)</li>
                <li>• Colunas de datas: <code className="bg-white px-1 rounded">ETAPA_REVISAO</code> (ex: ESTUDO PRELIMINAR_R00)</li>
                <li>• Formato de data: <code className="bg-white px-1 rounded">DD/MM/AAAA</code> (ex: 15/01/2025)</li>
                <li>• Baixe o template para ver a estrutura correta</li>
              </ul>
            </div>

            <Button
              variant="outline"
              onClick={handleExportTemplate}
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar Template CSV
            </Button>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="w-full"
              />
              {importFile && (
                <p className="text-sm text-green-600 mt-2">
                  ✓ Arquivo selecionado: {importFile.name}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportModal(false);
                  setImportFile(null);
                }}
                disabled={isImporting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!importFile || isImporting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
        </Dialog>

        {/* Modal de Preenchimento em Massa */}
        <Dialog open={showMassEditModal} onOpenChange={setShowMassEditModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Preencher Data em Massa</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  Preencher data para <strong>{selectedFolhas.size}</strong> folha{selectedFolhas.size > 1 ? 's' : ''} selecionada{selectedFolhas.size > 1 ? 's' : ''}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Etapa</label>
                <select
                  value={massEditEtapa}
                  onChange={(e) => setMassEditEtapa(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                >
                  <option value="">Selecione a etapa</option>
                  {ETAPAS_VIEW.filter(e => !etapasExcluidas.includes(e)).map(etapa => (
                    <option key={etapa} value={etapa}>{etapa}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Revisão</label>
                <select
                  value={massEditRevisao}
                  onChange={(e) => setMassEditRevisao(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 text-sm"
                  disabled={!massEditEtapa}
                >
                  <option value="">Selecione a revisão</option>
                  {massEditEtapa && Array.isArray(revisoesPorEtapa[massEditEtapa] || DEFAULT_REVISOES) && (revisoesPorEtapa[massEditEtapa] || DEFAULT_REVISOES).map(rev => (
                    <option key={rev} value={rev}>{rev}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Data</label>
                  <Input
                    type="date"
                    value={toISODateString(massEditData)}
                    onChange={(e) => setMassEditData(e.target.value)}
                    className="w-full"
                  />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowMassEditModal(false);
                    setMassEditEtapa('');
                    setMassEditRevisao('');
                    setMassEditData('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={applyMassEdit}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Aplicar a {selectedFolhas.size} Folha{selectedFolhas.size > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
        );
        }