// @ts-nocheck
import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Users, RefreshCw, Plus, Pencil, Trash2, Loader2, BarChart2, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { format, addDays, startOfWeek, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PlanejamentoAtividade, PlanejamentoDocumento, Empreendimento, Documento, Equipe, Usuario, OSManual } from "@/entities/all";
import { retryWithBackoff } from "../utils/apiUtils";
import { base44 } from "@/api/base44Client";
import ResumoAlocacaoTab from "../dashboard/ResumoAlocacaoTab";


// Retorna o identificador curto do empreendimento (número da OS)
const getOsLabel = (emp) => {
  if (!emp) return null;
  if (emp.num_proposta && /^\d+$/.test(emp.num_proposta.trim())) return emp.num_proposta.trim();
  const match = (emp.nome || '').match(/^(\d+)/);
  if (match) return match[1];
  return emp.num_proposta || (emp.nome || '').substring(0, 4).toUpperCase();
};

// Função para parsear datas locais
const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  try {
    const parsed = parseISO(dateString);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export default function AlocacaoEquipeTab({
  planejamentos: planejamentosProp,
  usuarios: usuariosProp = [],
  empreendimentos: empreendimentosProp,
  documentos: documentosProp,
  equipes: equipesProp
}) {
  const [activeView, setActiveView] = useState('calendario'); // 'calendario' | 'resumo'
  const [weekOffset, setWeekOffset] = useState(0);
  const [planejamentosLocal, setPlanejamentosLocal] = useState([]);
  const [empreendimentosLocal, setEmpreendimentosLocal] = useState([]);
  const [documentosLocal, setDocumentosLocal] = useState([]);
  const [equipesLocal, setEquipesLocal] = useState([]);
  const [usuariosLocal, setUsuariosLocal] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Ordem personalizada das equipes
  const [ordemEquipes, setOrdemEquipes] = useState(() => {
    try {
      const saved = localStorage.getItem('alocacao_ordem_equipes');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Modal de gerenciamento de equipes
  const [showEquipeModal, setShowEquipeModal] = useState(false);
  const [showEquipeForm, setShowEquipeForm] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState(null);
  const [equipeFormData, setEquipeFormData] = useState({ nome: '', cor: '#3B82F6', descricao: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [novaEquipeNome, setNovaEquipeNome] = useState('');

  // Usar dados props se disponíveis, senão usar local
  const planejamentos = planejamentosProp?.length > 0 ? planejamentosProp : planejamentosLocal;
  const empreendimentos = empreendimentosProp?.length > 0 ? empreendimentosProp : empreendimentosLocal;
  const documentos = documentosProp?.length > 0 ? documentosProp : documentosLocal;
  const equipes = equipesProp?.length > 0 ? equipesProp : equipesLocal;
  
  // Para usuários: sempre preferir dados locais (frescos do servidor com equipe_id atualizado)
  // Props servem apenas como fallback enquanto o fetch inicial não termina
  const usuariosBase = usuariosLocal.length > 0 ? usuariosLocal : (usuariosProp || []);
  const [usuariosEditados, setUsuariosEditados] = useState({});
  const [osManuais, setOsManuais] = useState({}); // { [usuario_email]: { [dataStr]: [{ label, cor, empNome, os }] } }
  const [showPreencherMassaModal, setShowPreencherMassaModal] = useState(false);
  const [preenchimentoData, setPreenchimentoData] = useState({ usuario: '', dataInicio: '', dataFim: '', os: '' });
  
  // Aplicar edições locais sobre os dados base
  const usuarios = useMemo(() => {
    return usuariosBase.map(u => {
      if (usuariosEditados[u.id] !== undefined) {
        return { ...u, equipe_id: usuariosEditados[u.id] };
      }
      return u;
    });
  }, [usuariosBase, usuariosEditados]);

  // Carregar dados se não recebeu via props
  const loadData = async () => {
    const needsPlanejamentos = !planejamentosProp?.length;
    const needsEmpreendimentos = !empreendimentosProp?.length;
    const needsDocumentos = !documentosProp?.length;
    const needsEquipes = !equipesProp?.length;
    const needsUsuarios = true; // Sempre buscar usuários frescos para ter equipe_id atualizado

    if (!needsPlanejamentos && !needsEmpreendimentos && !needsDocumentos && !needsEquipes && !needsUsuarios) {
      // Apenas carrega OS manuais, que não são passados via props
      try {
        const osManuals = await retryWithBackoff(() => OSManual.list(null, 5000), 3, 2000, 'AlocacaoEquipe-OSManual');
        const osManuaisMap = {};
        (osManuals || []).forEach(osm => {
          if (!osManuaisMap[osm.usuario_email]) osManuaisMap[osm.usuario_email] = {};
          if (!osManuaisMap[osm.usuario_email][osm.data]) osManuaisMap[osm.usuario_email][osm.data] = [];
          osManuaisMap[osm.usuario_email][osm.data].push({ label: osm.os, cor: osm.cor, empNome: osm.empreendimento_nome, os: osm.os });
        });
        setOsManuais(osManuaisMap);
      } catch (error) {
        console.error('Erro ao carregar OS manuais:', error);
      }
      return;
    }

    setIsLoading(true);
    try {
      const [plansAtiv, plansDoc, emps, docs, teams, users, osManuals] = await Promise.all([
        needsPlanejamentos ? retryWithBackoff(() => PlanejamentoAtividade.list(null, 5000), 3, 2000, 'AlocacaoEquipe-PlansAtiv') : Promise.resolve(null),
        needsPlanejamentos ? retryWithBackoff(() => PlanejamentoDocumento.list(null, 5000), 3, 2000, 'AlocacaoEquipe-PlansDoc') : Promise.resolve(null),
        needsEmpreendimentos ? retryWithBackoff(() => Empreendimento.list(null, 5000), 3, 2000, 'AlocacaoEquipe-Empreendimentos') : Promise.resolve(null),
        needsDocumentos ? retryWithBackoff(() => Documento.list(null, 5000), 3, 2000, 'AlocacaoEquipe-Documentos') : Promise.resolve(null),
        needsEquipes ? retryWithBackoff(() => Equipe.list(), 3, 2000, 'AlocacaoEquipe-Equipes') : Promise.resolve(null),
        needsUsuarios ? retryWithBackoff(() => Usuario.list(), 3, 2000, 'AlocacaoEquipe-Usuarios') : Promise.resolve(null),
        retryWithBackoff(() => OSManual.list(null, 5000), 3, 2000, 'AlocacaoEquipe-OSManual')
      ]);

      if (needsPlanejamentos) setPlanejamentosLocal([...(plansAtiv || []), ...(plansDoc || [])]);
      if (needsEmpreendimentos) setEmpreendimentosLocal(emps || []);
      if (needsDocumentos) setDocumentosLocal(docs || []);
      if (needsEquipes) setEquipesLocal(teams || []);
      if (needsUsuarios) setUsuariosLocal(users || []);
      
      // Carregar OS manuais
      const osManuaisMap = {};
      (osManuals || []).forEach(osm => {
        if (!osManuaisMap[osm.usuario_email]) osManuaisMap[osm.usuario_email] = {};
        if (!osManuaisMap[osm.usuario_email][osm.data]) osManuaisMap[osm.usuario_email][osm.data] = [];
        osManuaisMap[osm.usuario_email][osm.data].push({
          label: osm.os,
          cor: osm.cor,
          empNome: osm.empreendimento_nome,
          os: osm.os
        });
      });
      setOsManuais(osManuaisMap);
    } catch (error) {
      console.error('Erro ao carregar dados de alocação:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Funções para gerenciar equipes
  const handleSaveEquipe = async (e) => {
    e.preventDefault();
    if (!equipeFormData.nome.trim()) {
      alert('Nome da equipe é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingEquipe) {
        await retryWithBackoff(() => Equipe.update(editingEquipe.id, equipeFormData), 3, 1000, 'updateEquipe');
      } else {
        await retryWithBackoff(() => Equipe.create(equipeFormData), 3, 1000, 'createEquipe');
      }
      setShowEquipeForm(false);
      setEditingEquipe(null);
      setEquipeFormData({ nome: '', cor: '#3B82F6', descricao: '' });
      await loadData();
    } catch (error) {
      console.error('Erro ao salvar equipe:', error);
      alert('Erro ao salvar equipe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditEquipe = (equipe) => {
    setEditingEquipe(equipe);
    setEquipeFormData({
      nome: equipe.nome || '',
      cor: equipe.cor || '#3B82F6',
      descricao: equipe.descricao || ''
    });
    setShowEquipeForm(true);
  };

  const handleDeleteEquipe = async (equipe) => {
    const membros = usuarios.filter(u => u.equipe_id === equipe.id);
    if (membros.length > 0) {
      alert(`Esta equipe possui ${membros.length} membro(s). Remova-os antes de excluir.`);
      return;
    }
    if (!window.confirm(`Deseja excluir a equipe "${equipe.nome}"?`)) return;
    try {
      await retryWithBackoff(() => Equipe.delete(equipe.id), 3, 1000, 'deleteEquipe');
      await loadData();
    } catch (error) {
      console.error('Erro ao excluir equipe:', error);
      alert('Erro ao excluir equipe.');
    }
  };

  const handleChangeEquipe = async (usuario, equipeId) => {
    const newEquipeId = equipeId === 'none' ? null : equipeId;
    // Atualizar localmente primeiro para feedback imediato
    setUsuariosEditados(prev => ({ ...prev, [usuario.id]: newEquipeId }));
    
    try {
      await retryWithBackoff(() => Usuario.update(usuario.id, { equipe_id: newEquipeId }), 3, 1000, 'changeEquipe');
    } catch (error) {
      console.error('Erro ao alterar equipe:', error);
      alert('Erro ao alterar equipe. Recarregando dados...');
      setUsuariosEditados(prev => {
        const copy = { ...prev };
        delete copy[usuario.id];
        return copy;
      });
    }
  };

  const handleQuickCreateEquipe = async () => {
    if (!novaEquipeNome.trim()) return;
    try {
      await retryWithBackoff(() => Equipe.create({ nome: novaEquipeNome.trim(), cor: '#3B82F6' }), 3, 1000, 'quickCreateEquipe');
      setNovaEquipeNome('');
      await loadData();
    } catch (error) {
      console.error('Erro ao criar equipe:', error);
      alert('Erro ao criar equipe.');
    }
  };

  const getMembros = (equipeId) => usuarios.filter(u => u.equipe_id === equipeId);

  const handleAddOS = async (usuario, dia) => {
    const os = prompt('Digite o número da OS:');
    if (!os || !os.trim()) return;

    const dataStr = format(dia, 'yyyy-MM-dd');
    const email = usuario.email;

    // Verificar se já existe
    if (osManuais[email]?.[dataStr]?.find(item => item.os === os.trim())) {
      alert('Esta OS já foi adicionada para este dia.');
      return;
    }

    // Buscar empreendimento pela OS (opcional, só para pegar cor)
    const emp = empreendimentos.find(e => e.num_proposta === os.trim());
    
    let empCor = '#6B7280';
    let empNome = os.trim();
    
    if (emp) {
      empCor = coresEmpreendimentos[emp.id] || '#6B7280';
      empNome = emp.nome;
    } else {
      const cores = [
        '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
        '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
      ];
      const hash = os.trim().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      empCor = cores[hash % cores.length];
    }

    const novoItem = {
      label: os.trim(),
      cor: empCor,
      empNome: empNome,
      os: os.trim()
    };

    // Salvar no banco
    try {
      await base44.entities.OSManual.create({
        usuario_email: email,
        data: dataStr,
        os: os.trim(),
        empreendimento_nome: empNome,
        cor: empCor
      });
      
      setOsManuais(prev => {
        const novo = { ...prev };
        if (!novo[email]) novo[email] = {};
        if (!novo[email][dataStr]) novo[email][dataStr] = [];
        novo[email][dataStr] = [...novo[email][dataStr], novoItem];
        return novo;
      });
    } catch (error) {
      console.error('Erro ao salvar OS:', error);
      alert('Erro ao salvar OS.');
    }
  };

  const handleRemoveOS = async (usuario, dataStr, osLabel) => {
    const email = usuario.email;
    
    try {
      // Buscar e deletar do banco
      const osManuals = await base44.entities.OSManual.filter({ 
        usuario_email: email, 
        data: dataStr, 
        os: osLabel 
      });
      
      for (const osm of osManuals) {
        await base44.entities.OSManual.delete(osm.id);
      }
      
      setOsManuais(prev => {
        const novo = { ...prev };
        if (novo[email]?.[dataStr]) {
          novo[email][dataStr] = novo[email][dataStr].filter(item => item.os !== osLabel);
          if (novo[email][dataStr].length === 0) {
            delete novo[email][dataStr];
          }
        }
        return novo;
      });
    } catch (error) {
      console.error('Erro ao remover OS:', error);
      alert('Erro ao remover OS.');
    }
  };

  const handlePreencherMassa = async () => {
    const { usuario, dataInicio, dataFim, os } = preenchimentoData;
    
    if (!usuario || !dataInicio || !dataFim || !os.trim()) {
      alert('Preencha todos os campos.');
      return;
    }

    const inicio = parseLocalDate(dataInicio);
    const fim = parseLocalDate(dataFim);
    
    if (!inicio || !fim || inicio > fim) {
      alert('Datas inválidas.');
      return;
    }

    // Buscar empreendimento pela OS
    const emp = empreendimentos.find(e => e.num_proposta === os.trim());
    let empCor = '#6B7280';
    let empNome = os.trim();
    
    if (emp) {
      empCor = coresEmpreendimentos[emp.id] || '#6B7280';
      empNome = emp.nome;
    } else {
      const cores = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];
      const hash = os.trim().split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      empCor = cores[hash % cores.length];
    }

    // Gerar lista de datas
    const datasParaCriar = [];
    let dataAtual = new Date(inicio);
    
    while (dataAtual <= fim) {
      const diaSemana = dataAtual.getDay();
      if (diaSemana !== 0 && diaSemana !== 6) { // Pular finais de semana
        const dataStr = format(dataAtual, 'yyyy-MM-dd');
        
        // Verificar se já existe
        if (!osManuais[usuario]?.[dataStr]?.find(item => item.os === os.trim())) {
          datasParaCriar.push({
            usuario_email: usuario,
            data: dataStr,
            os: os.trim(),
            empreendimento_nome: empNome,
            cor: empCor
          });
        }
      }
      dataAtual = addDays(dataAtual, 1);
    }

    if (datasParaCriar.length === 0) {
      alert('Nenhuma data nova para adicionar (já existem ou são finais de semana).');
      return;
    }

    try {
      await base44.entities.OSManual.bulkCreate(datasParaCriar);
      await loadData();
      setShowPreencherMassaModal(false);
      setPreenchimentoData({ usuario: '', dataInicio: '', dataFim: '', os: '' });
      alert(`${datasParaCriar.length} OS adicionadas com sucesso!`);
    } catch (error) {
      console.error('Erro ao preencher em massa:', error);
      alert('Erro ao preencher em massa.');
    }
  };

  // Gerar dias da semana atual + offset (3 semanas = 21 dias)
  const diasExibidos = useMemo(() => {
    const hoje = new Date();
    const inicioSemana = startOfWeek(addDays(hoje, weekOffset * 7), { weekStartsOn: 1 }); // Segunda
    const dias = [];
    for (let i = 0; i < 21; i++) { // 3 semanas
      dias.push(addDays(inicioSemana, i));
    }
    return dias;
  }, [weekOffset]);

  // Criar mapa de empreendimentos
  const empreendimentosMap = useMemo(() => {
    const map = {};
    (empreendimentos || []).forEach(emp => {
      map[emp.id] = emp;
    });
    return map;
  }, [empreendimentos]);

  // Criar mapa de documentos
  const documentosMap = useMemo(() => {
    const map = {};
    (documentos || []).forEach(doc => {
      map[doc.id] = doc;
    });
    return map;
  }, [documentos]);

  // Criar mapa de equipes por ID
  const equipesMap = useMemo(() => {
    const map = {};
    (equipes || []).forEach(eq => {
      map[eq.id] = eq;
    });
    return map;
  }, [equipes]);

  // Agrupar usuários por equipe (usando equipe_id)
  const usuariosPorEquipeRaw = useMemo(() => {
    const grupos = {};
    
    (usuarios || []).forEach(user => {
      if (!user.nome && !user.full_name) return;
      if (user.status === 'inativo') return;
      
      let nomeEquipe = 'Sem Equipe';
      if (user.equipe_id && equipesMap[user.equipe_id]) {
        nomeEquipe = equipesMap[user.equipe_id].nome;
      }
      
      if (!grupos[nomeEquipe]) {
        grupos[nomeEquipe] = [];
      }
      grupos[nomeEquipe].push(user);
    });

    Object.keys(grupos).forEach(equipe => {
      grupos[equipe].sort((a, b) => {
        const nomeA = a.nome || a.full_name || '';
        const nomeB = b.nome || b.full_name || '';
        return nomeA.localeCompare(nomeB, 'pt-BR');
      });
    });

    return grupos;
  }, [usuarios, equipesMap]);

  // Ordem exibida das equipes (respeitando ordemEquipes salva)
  const equipeOrdenadas = useMemo(() => {
    const todasEquipes = Object.keys(usuariosPorEquipeRaw);
    const ordenadas = ordemEquipes.filter(e => todasEquipes.includes(e));
    const novas = todasEquipes.filter(e => !ordenadas.includes(e));
    return [...ordenadas, ...novas];
  }, [usuariosPorEquipeRaw, ordemEquipes]);

  const usuariosPorEquipe = usuariosPorEquipeRaw;

  const handleDragEndEquipes = (result) => {
    if (!result.destination) return;
    const newOrder = [...equipeOrdenadas];
    const [moved] = newOrder.splice(result.source.index, 1);
    newOrder.splice(result.destination.index, 0, moved);
    setOrdemEquipes(newOrder);
    localStorage.setItem('alocacao_ordem_equipes', JSON.stringify(newOrder));
  };

  // Gerar cores para empreendimentos
  const coresEmpreendimentos = useMemo(() => {
    const cores = [
      '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', 
      '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
      '#14B8A6', '#A855F7', '#0EA5E9', '#22C55E', '#E11D48'
    ];
    const map = {};
    (empreendimentos || []).forEach((emp, idx) => {
      map[emp.id] = cores[idx % cores.length];
    });
    return map;
  }, [empreendimentos]);

  // Processar planejamentos por usuário e dia
  const alocacaoPorUsuarioDia = useMemo(() => {
    const alocacao = {};

    (planejamentos || []).forEach(plan => {
      const executor = plan.executor_principal;
      if (!executor) return;

      if (!alocacao[executor]) {
        alocacao[executor] = {
          planejado: {},
          reprogramado: {},
          realizado: {}
        };
      }

      // Processar horas_por_dia para datas planejadas
      if (plan.horas_por_dia && typeof plan.horas_por_dia === 'object') {
        Object.entries(plan.horas_por_dia).forEach(([dataStr, horas]) => {
          if (Number(horas) > 0) {
            if (!alocacao[executor].planejado[dataStr]) {
              alocacao[executor].planejado[dataStr] = [];
            }
            
            // Identificar o empreendimento
            const empId = plan.empreendimento_id;
            const emp = empreendimentosMap[empId];
            const empNome = emp?.nome || 'Sem Emp.';
            const empCor = coresEmpreendimentos[empId] || '#6B7280';
            
            // Usar número da OS do empreendimento como label
            const label = getOsLabel(emp) || empNome.substring(0, 4).toUpperCase();
            const exists = alocacao[executor].planejado[dataStr].find(i => i.label === label);
            if (!exists) {
              alocacao[executor].planejado[dataStr].push({ label, cor: empCor, empNome });
            }
          }
        });
      }

      // Processar horas_executadas_por_dia para datas realizadas
      if (plan.horas_executadas_por_dia && typeof plan.horas_executadas_por_dia === 'object') {
        Object.entries(plan.horas_executadas_por_dia).forEach(([dataStr, horas]) => {
          if (Number(horas) > 0) {
            if (!alocacao[executor].realizado[dataStr]) {
              alocacao[executor].realizado[dataStr] = [];
            }
            
            const empId = plan.empreendimento_id;
            const emp = empreendimentosMap[empId];
            const empNome = emp?.nome || 'Sem Emp.';
            const empCor = coresEmpreendimentos[empId] || '#6B7280';
            
            const label = getOsLabel(emp) || empNome.substring(0, 4).toUpperCase();
            const exists = alocacao[executor].realizado[dataStr].find(i => i.label === label);
            if (!exists) {
              alocacao[executor].realizado[dataStr].push({ label, cor: empCor, empNome });
            }
          }
        });
      }

      // Verificar se foi reprogramado (inicio_ajustado diferente de inicio_planejado)
      if (plan.inicio_ajustado && plan.inicio_planejado) {
        const ajustado = parseLocalDate(plan.inicio_ajustado);
        const planejado = parseLocalDate(plan.inicio_planejado);
        
        if (ajustado && planejado && ajustado.getTime() !== planejado.getTime()) {
          // Foi reprogramado - marcar nos dias ajustados
          if (plan.horas_por_dia && typeof plan.horas_por_dia === 'object') {
            Object.entries(plan.horas_por_dia).forEach(([dataStr, horas]) => {
              if (Number(horas) > 0) {
                if (!alocacao[executor].reprogramado[dataStr]) {
                  alocacao[executor].reprogramado[dataStr] = [];
                }
                
                const emp = empreendimentosMap[plan.empreendimento_id];
                const empNome = emp?.nome || 'Sem Emp.';
                const empCor = coresEmpreendimentos[plan.empreendimento_id] || '#6B7280';
                
                const label = getOsLabel(emp) || empNome.substring(0, 4).toUpperCase();
                const exists = alocacao[executor].reprogramado[dataStr].find(i => i.label === label);
                if (!exists) {
                  alocacao[executor].reprogramado[dataStr].push({ label, cor: empCor, empNome });
                }
              }
            });
          }
        }
      }
    });

    return alocacao;
  }, [planejamentos, empreendimentosMap, documentosMap, coresEmpreendimentos]);

  // Função para obter cor de fundo baseada em reprogramação
  const getCellStyle = (items, isReprogramado) => {
    if (!items || items.size === 0) return {};
    
    if (isReprogramado) {
      return { backgroundColor: '#FFFF00', color: '#000' }; // Amarelo
    }
    return { backgroundColor: '#90EE90', color: '#000' }; // Verde claro
  };

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          Alocação por Equipe/Colaborador
        </CardTitle>
        <div className="flex items-center gap-2">
            {/* Toggle de visão */}
            <div className="flex border rounded-md overflow-hidden">
              <button
                onClick={() => setActiveView('calendario')}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                  activeView === 'calendario' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users className="w-3 h-3" />
                Calendário
              </button>
              <button
                onClick={() => setActiveView('resumo')}
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                  activeView === 'resumo' ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <BarChart2 className="w-3 h-3" />
                Resumo
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowEquipeModal(true)}>
              <Users className="w-4 h-4 mr-1" />
              Equipes
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPreencherMassaModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Preencher em Massa
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(prev => prev - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(prev => prev + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activeView === 'resumo' && (
          <ResumoAlocacaoTab
            planejamentos={planejamentos}
            empreendimentos={empreendimentos}
            documentos={documentos}
            usuarios={usuarios}
            equipes={equipes}
            osManuais={osManuais}
            weekOffset={weekOffset}
          />
        )}
        {activeView === 'calendario' && (
        <div className="overflow-auto max-h-[calc(100vh-250px)]">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-gray-800 text-white">
                <th className="border border-gray-600 p-1 text-left sticky left-0 bg-gray-800 z-30 min-w-[120px]">Nome</th>
                <th className="border border-gray-600 p-1 text-left min-w-[60px]">Item</th>
                {diasExibidos.map(dia => (
                  <th 
                    key={format(dia, 'yyyy-MM-dd')} 
                    className={`border border-gray-600 p-1 text-center min-w-[40px] ${
                      dia.getDay() === 0 || dia.getDay() === 6 ? 'bg-gray-700' : ''
                    }`}
                  >
                    <div>{format(dia, 'd/MM')}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipeOrdenadas.map((equipe) => {
                const usuariosEquipe = usuariosPorEquipe[equipe] || [];
                return (
                <React.Fragment key={equipe}>
                  {/* Linha de cabeçalho da equipe */}
                  <tr className="bg-gray-900 text-white font-bold">
                    <td colSpan={2 + diasExibidos.length} className="border border-gray-600 p-1">
                      {equipe.toUpperCase()}
                    </td>
                  </tr>
                  
                  {/* Linhas de cada usuário */}
                  {usuariosEquipe.map(usuario => {
                    const email = usuario.email;
                    const alocacaoUser = alocacaoPorUsuarioDia[email] || { planejado: {}, reprogramado: {}, realizado: {} };
                    const osManuaisUser = osManuais[email] || {};
                    
                    return (
                      <React.Fragment key={usuario.id}>
                        {/* Linha Programado */}
                        <tr className="bg-gray-100">
                          <td className="border border-gray-300 p-1 sticky left-0 bg-gray-100 z-10" rowSpan={3}>
                            <div className="font-medium">{usuario.nome || usuario.full_name}</div>
                            <div className="text-gray-500 text-xs">{usuario.cargo || ''}</div>
                          </td>
                          <td className="border border-gray-300 p-1 text-xs">Programado</td>
                          {diasExibidos.map(dia => {
                            const dataStr = format(dia, 'yyyy-MM-dd');
                            const items = alocacaoUser.planejado[dataStr] || [];
                            const hasItems = items.length > 0;
                            
                            return (
                              <td 
                                key={dataStr}
                                className={`border border-gray-300 p-0.5 text-center ${
                                  dia.getDay() === 0 || dia.getDay() === 6 ? 'bg-gray-200' : ''
                                }`}
                                style={hasItems ? { backgroundColor: '#D1FAE5' } : {}}
                                title={hasItems ? items.map(i => `${i.label} (${i.empNome})`).join(', ') : ''}
                              >
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {items.map((item, idx) => (
                                    <span 
                                      key={idx} 
                                      className="px-1 rounded text-white text-[10px] font-medium"
                                      style={{ backgroundColor: item.cor }}
                                    >
                                      {item.label}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* Linha Previsto (OS Manuais) */}
                        <tr className="bg-gray-50">
                          <td className="border border-gray-300 p-1 text-xs">Previsto</td>
                          {diasExibidos.map(dia => {
                            const dataStr = format(dia, 'yyyy-MM-dd');
                            const itemsManuais = osManuaisUser[dataStr] || [];
                            const hasItems = itemsManuais.length > 0;
                            
                            return (
                              <td 
                                key={dataStr}
                                className={`border border-gray-300 p-0.5 text-center cursor-pointer hover:bg-blue-100 ${
                                  dia.getDay() === 0 || dia.getDay() === 6 ? 'bg-gray-200' : ''
                                }`}
                                style={hasItems ? { backgroundColor: '#DBEAFE' } : {}}
                                title={hasItems ? itemsManuais.map(i => `${i.label} (${i.empNome})`).join(', ') : 'Clique para adicionar OS'}
                                onClick={() => handleAddOS(usuario, dia)}
                              >
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {itemsManuais.map((item, idx) => (
                                    <span 
                                      key={`man-${idx}`} 
                                      className="px-1 rounded text-white text-[10px] font-medium cursor-pointer hover:opacity-70"
                                      style={{ backgroundColor: item.cor }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (window.confirm(`Remover OS "${item.os}" deste dia?`)) {
                                          handleRemoveOS(usuario, dataStr, item.os);
                                        }
                                      }}
                                      title="Clique para remover"
                                    >
                                      {item.label} ×
                                    </span>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>

                        {/* Linha Realizado */}
                        <tr className="bg-white">
                          <td className="border border-gray-300 p-1 text-xs font-medium">Realizado</td>
                          {diasExibidos.map(dia => {
                            const dataStr = format(dia, 'yyyy-MM-dd');
                            const items = alocacaoUser.realizado[dataStr] || [];
                            const hasItems = items.length > 0;
                            
                            return (
                              <td 
                                key={dataStr}
                                className={`border border-gray-300 p-0.5 text-center ${
                                  dia.getDay() === 0 || dia.getDay() === 6 ? 'bg-gray-200' : ''
                                }`}
                                style={hasItems ? { backgroundColor: '#FEF3C7' } : {}}
                                title={hasItems ? items.map(i => `${i.label} (${i.empNome})`).join(', ') : ''}
                              >
                                <div className="flex flex-wrap gap-0.5 justify-center">
                                  {items.map((item, idx) => (
                                    <span 
                                      key={idx} 
                                      className="px-1 rounded text-white text-[10px] font-medium"
                                      style={{ backgroundColor: item.cor }}
                                    >
                                      {item.label}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
          )} {/* fim activeView === 'calendario' */}

          {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-600">Carregando dados de alocação...</p>
          </div>
        )}

        {!isLoading && Object.keys(usuariosPorEquipe).length === 0 && activeView === 'calendario' && (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Nenhum usuário encontrado para exibir a alocação.</p>
          </div>
        )}
      </CardContent>
    </Card>

      {/* Modal de Gerenciamento de Equipes e Usuários */}
    <Dialog open={showEquipeModal} onOpenChange={setShowEquipeModal}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Equipes e Membros</DialogTitle>
        </DialogHeader>
        
        {/* Criar nova equipe rapidamente */}
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Nova equipe..."
            value={novaEquipeNome}
            onChange={(e) => setNovaEquipeNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickCreateEquipe()}
          />
          <Button onClick={handleQuickCreateEquipe} disabled={!novaEquipeNome.trim()}>
            <Plus className="w-4 h-4 mr-1" />
            Criar
          </Button>
        </div>

        {/* Lista de equipes existentes - com drag para reordenar */}
        <DragDropContext onDragEnd={(result) => {
          if (!result.destination) return;
          const equipesList = equipes.map(e => e.nome);
          const [movedName] = equipesList.splice(result.source.index, 1);
          equipesList.splice(result.destination.index, 0, movedName);
          const semEquipePos = equipeOrdenadas.includes('Sem Equipe') ? equipesList.length : -1;
          const merged = semEquipePos >= 0 ? [...equipesList, 'Sem Equipe'] : equipesList;
          setOrdemEquipes(merged);
          localStorage.setItem('alocacao_ordem_equipes', JSON.stringify(merged));
        }}>
          <Droppable droppableId="equipes-list" direction="horizontal">
            {(provided) => (
              <div className="flex flex-wrap gap-2 mb-4" ref={provided.innerRef} {...provided.droppableProps}>
                {equipes.map((eq, idx) => (
                  <Draggable key={eq.id} draggableId={eq.id} index={idx}>
                    {(provided2) => (
                      <div
                        ref={provided2.innerRef}
                        {...provided2.draggableProps}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-gray-100"
                      >
                        <span {...provided2.dragHandleProps} className="cursor-grab text-gray-400">
                          <GripVertical className="w-3 h-3" />
                        </span>
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: eq.cor || '#3B82F6' }} />
                        <span className="text-sm">{eq.nome}</span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500" onClick={() => handleDeleteEquipe(eq)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Tabela de usuários com seletor de equipe */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-2">Usuário</th>
                <th className="text-left p-2">Cargo</th>
                <th className="text-left p-2 w-48">Equipe</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.filter(u => u.nome || u.full_name).map(usuario => (
                <tr key={usuario.id} className="border-t">
                  <td className="p-2 font-medium">{usuario.nome || usuario.full_name}</td>
                  <td className="p-2 text-gray-500">{usuario.cargo || '-'}</td>
                  <td className="p-2">
                    <Select
                      value={usuario.equipe_id || 'none'}
                      onValueChange={(value) => handleChangeEquipe(usuario, value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Sem equipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem equipe</SelectItem>
                        {equipes.map(eq => (
                          <SelectItem key={eq.id} value={eq.id}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded" style={{ backgroundColor: eq.cor || '#3B82F6' }} />
                              {eq.nome}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>

      {/* Modal de Preenchimento em Massa */}
      <Dialog open={showPreencherMassaModal} onOpenChange={setShowPreencherMassaModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preencher Previsto em Massa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Usuário</Label>
              <Select value={preenchimentoData.usuario} onValueChange={(v) => setPreenchimentoData(prev => ({ ...prev, usuario: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.filter(u => u.nome || u.full_name).map(u => (
                    <SelectItem key={u.id} value={u.email}>
                      {u.nome || u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data Início</Label>
              <Input 
                type="date" 
                value={preenchimentoData.dataInicio}
                onChange={(e) => setPreenchimentoData(prev => ({ ...prev, dataInicio: e.target.value }))}
              />
            </div>
            <div>
              <Label>Data Fim</Label>
              <Input 
                type="date" 
                value={preenchimentoData.dataFim}
                onChange={(e) => setPreenchimentoData(prev => ({ ...prev, dataFim: e.target.value }))}
              />
            </div>
            <div>
              <Label>Número da OS</Label>
              <Input 
                placeholder="Digite o número da OS"
                value={preenchimentoData.os}
                onChange={(e) => setPreenchimentoData(prev => ({ ...prev, os: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPreencherMassaModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handlePreencherMassa}>
                Preencher
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}