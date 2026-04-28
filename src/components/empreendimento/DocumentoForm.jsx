import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Documento } from "@/entities/all";
import { X, Loader2, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { retryWithBackoff } from '../utils/apiUtils';
import { base44 } from '@/api/base44Client';

export default function DocumentoForm({
  doc,
  empreendimentoId,
  empreendimentoNome,
  empreendimento,
  onClose,
  onSave,
  disciplinas = [],
  atividades: allAtividades = [], // Changed prop name from 'atividades' to 'allAtividades'
  pavimentos = [],
  documentos = []
}) {
  const [formData, setFormData] = useState({
    numero: "",
    arquivo: "",
    descritivo: "",
    pavimento_id: null,
    disciplina: "",
    disciplinas: [],
    subdisciplinas: [],
    escala: "",
    fator_dificuldade: 1,
    tempo_total: 0,
    tempo_estudo_preliminar: 0,
    tempo_ante_projeto: 0,
    tempo_projeto_basico: 0,
    tempo_projeto_executivo: 0,
    tempo_liberado_obra: 0,
    tempo_concepcao: 0,
    tempo_planejamento: 0
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (doc) {
      setFormData({
        numero: doc.numero || "",
        arquivo: doc.arquivo || "",
        descritivo: doc.descritivo || "",
        pavimento_id: doc.pavimento_id || null,
        disciplina: doc.disciplina || "",
        disciplinas: doc.disciplinas || (doc.disciplina ? [doc.disciplina] : []),
        subdisciplinas: doc.subdisciplinas || [],
        escala: doc.escala || "",
        fator_dificuldade: parseFloat(doc.fator_dificuldade) || 1,
        tempo_total: parseFloat(doc.tempo_total) || 0,
        tempo_estudo_preliminar: parseFloat(doc.tempo_estudo_preliminar) || 0,
        tempo_ante_projeto: parseFloat(doc.tempo_ante_projeto) || 0,
        tempo_projeto_basico: parseFloat(doc.tempo_projeto_basico) || 0,
        tempo_projeto_executivo: parseFloat(doc.tempo_projeto_executivo) || 0,
        tempo_liberado_obra: parseFloat(doc.tempo_liberado_obra) || 0,
        tempo_concepcao: parseFloat(doc.tempo_concepcao) || 0,
        tempo_planejamento: parseFloat(doc.tempo_planejamento) || 0
      });
    }
  }, [doc]);

  // Logs para debug
  useEffect(() => {
  }, [pavimentos]);

  // Mapear etapa do catálogo para etapa do empreendimento
  // Se o empreendimento tem etapas configuradas, usa a etapa única (ou a mais relevante)
  const mapearEtapaParaEmpreendimento = useMemo(() => {
    const etapasEmp = empreendimento?.etapas || [];
    const etapasUnicas = [...new Set(etapasEmp.filter(Boolean))];
    
    // Se só tem 1 etapa distinta, todas as atividades usam ela
    if (etapasUnicas.length === 1) {
      return () => etapasUnicas[0];
    }
    
    // Se a etapa da atividade está nas etapas do empreendimento, usa ela
    // Caso contrário, usa a primeira etapa disponível
    return (etapaAtividade) => {
      if (etapasUnicas.includes(etapaAtividade)) return etapaAtividade;
      if (etapasUnicas.length > 0) return etapasUnicas[0];
      return etapaAtividade; // fallback: etapa original
    };
  }, [empreendimento?.etapas]);

  // NOVO: Criar mapa de overrides de etapa
  const etapaOverridesMap = useMemo(() => {
    const map = new Map();
    allAtividades.forEach(ativ => {
      // This refers to specific activities that override generic ones for this empreendimento.
      // `ativ.id_atividade` is the ID of the generic activity being overridden.
      // Only if tempo is NOT -999 (exclusão) AND NOT 0 (conclusão), which means it's an active override.
      if (ativ.empreendimento_id === empreendimentoId && ativ.id_atividade && ativ.tempo !== -999 && ativ.tempo !== 0) {
        map.set(ativ.id_atividade, ativ.etapa);
      }
    });
    return map;
  }, [allAtividades, empreendimentoId]);

  // NOVO: Criar mapa de overrides de tempo
  const tempoOverridesMap = useMemo(() => {
    const map = new Map();
    allAtividades.forEach(ativ => {
        // Only if tempo is NOT -999 (exclusão) AND NOT 0 (conclusão), which means it's an active override.
        if (ativ.empreendimento_id === empreendimentoId && ativ.id_atividade && ativ.tempo !== -999 && ativ.tempo !== 0) {
            map.set(ativ.id_atividade, ativ.tempo);
        }
    });
    return map;
  }, [allAtividades, empreendimentoId]);

  // Cálculo dos tempos totais por etapa
  const temposCalculados = useMemo(() => {
    // MODIFICADO: Pavimento é opcional agora, não causa early exit
    if (formData.disciplinas.length === 0 || formData.subdisciplinas.length === 0) {
      return {
        total: 0,
        concepcao: 0,
        planejamento: 0,
        estudo_preliminar: 0,
        ante_projeto: 0,
        projeto_basico: 0,
        projeto_executivo: 0,
        liberado_obra: 0
      };
    }

    const pavimento = (pavimentos || []).find(p => p.id === formData.pavimento_id);
    const areaPavimento = pavimento ? Number(pavimento.area) : null;


    // **CORRIGIDO**: Separar exclusões globais de exclusões específicas de documentos
    const atividadesRelacionadas = allAtividades.filter(ativ => {
      const isGenericActivity = !ativ.empreendimento_id;

      // Only consider generic activities for initial filtering
      if (!isGenericActivity) {
        return false;
      }

      const disciplinaMatch = formData.disciplinas.includes(ativ.disciplina);
      const subdisciplinaMatch = formData.subdisciplinas.includes(ativ.subdisciplina);

      if (!disciplinaMatch || !subdisciplinaMatch) {
        return false;
      }

      // **CRÍTICO**: Verificar exclusões E conclusões com lógica correta
      // 1. Buscar TODAS as exclusões (-999) E conclusões (0) desta atividade neste empreendimento
      const exclusoes = allAtividades.filter(s_ativ =>
        s_ativ.empreendimento_id === empreendimentoId && 
        s_ativ.id_atividade === ativ.id && 
        s_ativ.tempo === -999
      );

      // 2. Buscar TODAS as conclusões (tempo 0 com texto "Concluída na folha")
      const conclusoes = allAtividades.filter(s_ativ =>
        s_ativ.empreendimento_id === empreendimentoId && 
        s_ativ.id_atividade === ativ.id && 
        s_ativ.tempo === 0 &&
        typeof s_ativ.atividade === 'string' &&
        s_ativ.atividade.includes('Concluída na folha')
      );

      if (exclusoes.length > 0) {
        
        // Verificar se existe exclusão GLOBAL (sem documento_id)
        const exclusaoGlobal = exclusoes.find(exc => !exc.documento_id);
        if (exclusaoGlobal) {
          return false; // Excluir de TODOS os documentos
        }

        // Se for EDIÇÃO de documento existente, verificar exclusão ESPECÍFICA deste documento
        if (doc?.id) {
          const exclusaoEspecifica = exclusoes.find(exc => exc.documento_id === doc.id);
          if (exclusaoEspecifica) {
            return false; // Excluir APENAS deste documento
          }
        }

        // Se não for exclusão global nem específica deste doc, incluir a atividade
        const exclusoesDeOutrosDocs = exclusoes.filter(exc => exc.documento_id && exc.documento_id !== doc?.id);
        if (exclusoesDeOutrosDocs.length > 0) {
        }
      }

      // Verificar conclusões (mesma lógica que exclusões, mas para tempo 0)
      if (conclusoes.length > 0 && doc?.id) {
        
        // Se existe conclusão específica deste documento, INCLUIR no cálculo mas com tempo 0
        const conclusaoEspecifica = conclusoes.find(conc => conc.documento_id === doc.id);
        if (conclusaoEspecifica) {
          // A atividade será incluída, mas o tempoOverridesMap já tem o tempo 0 para ela (não precisa fazer nada aqui)
        }
      }

      return true; // Include generic activity if it matches criteria and is not excluded
    });


    const fatorDificuldade = parseFloat(formData.fator_dificuldade) || 1;

    const tempos = {
      total: 0,
      concepcao: 0,
      planejamento: 0,
      estudo_preliminar: 0,
      ante_projeto: 0,
      projeto_basico: 0,
      projeto_executivo: 0,
      liberado_obra: 0
    };

    atividadesRelacionadas.forEach(ativ => {
       // PRIMEIRO: Verificar se a atividade está concluída NESTE documento específico
       if (doc?.id) {
         // Verificar conclusão (tempo 0 com texto "Concluída na folha")
         const conclusaoEspecifica = allAtividades.find(s_ativ =>
           s_ativ.empreendimento_id === empreendimentoId && 
           s_ativ.id_atividade === ativ.id && 
           s_ativ.documento_id === doc.id &&
           s_ativ.tempo === 0 &&
           typeof s_ativ.atividade === 'string' &&
           s_ativ.atividade.includes('Concluída na folha')
         );

         if (conclusaoEspecifica) {
           return; // Pular para próxima iteração - não calcular tempo
         }

         // Verificar exclusão (tempo -999 com texto "Excluída da folha")
         const exclusaoEspecifica = allAtividades.find(s_ativ =>
           s_ativ.empreendimento_id === empreendimentoId && 
           s_ativ.id_atividade === ativ.id && 
           s_ativ.documento_id === doc.id &&
           s_ativ.tempo === -999 &&
           typeof s_ativ.atividade === 'string' &&
           s_ativ.atividade.includes('Excluída da folha')
         );

         if (exclusaoEspecifica) {
           return; // Pular para próxima iteração - não calcular tempo
         }
       }

      // SEGUNDO: Pegar tempo base
      let tempoBase = parseFloat(ativ.tempo) || 0;

      // TERCEIRO: Aplicar override de tempo se existir e não for -999 (já filtrado na criação do mapa)
      if (tempoOverridesMap.has(ativ.id)) {
        tempoBase = parseFloat(tempoOverridesMap.get(ativ.id)) || 0;
      }
      
      
      // QUARTO: Calcular tempo final
      // CORRIGIDO: O tempo base JÁ É EM HORAS TOTAIS, NÃO h/m²
      // Apenas multiplicar pelo fator de dificuldade
      const tempoCalculado = tempoBase * fatorDificuldade;

      
      if (areaPavimento && areaPavimento > 0) {
      }

      // MODIFICADO: Usar etapa com override se existir
      const etapaFinal = etapaOverridesMap.has(ativ.id)
        ? etapaOverridesMap.get(ativ.id)
        : ativ.etapa;

      switch (etapaFinal) {
        case 'Concepção':
          tempos.concepcao += tempoCalculado;
          break;
        case 'Planejamento':
          tempos.planejamento += tempoCalculado;
          break;
        case 'Estudo Preliminar':
          tempos.estudo_preliminar += tempoCalculado;
          tempos.total += tempoCalculado;
          break;
        case 'Ante-Projeto':
          tempos.ante_projeto += tempoCalculado;
          tempos.total += tempoCalculado;
          break;
        case 'Projeto Básico':
          tempos.projeto_basico += tempoCalculado;
          tempos.total += tempoCalculado;
          break;
        case 'Projeto Executivo':
          tempos.projeto_executivo += tempoCalculado;
          tempos.total += tempoCalculado;
          break;
        case 'Liberado para Obra':
          tempos.liberado_obra += tempoCalculado;
          tempos.total += tempoCalculado;
          break;
        default:
          break;
      }
    });

    // Round all tempo values to 2 decimal places before returning
    Object.keys(tempos).forEach(key => {
      tempos[key] = Number(tempos[key].toFixed(2));
    });


    return tempos;
  }, [formData.disciplinas, formData.subdisciplinas, formData.fator_dificuldade, formData.pavimento_id, allAtividades, pavimentos, etapaOverridesMap, tempoOverridesMap, empreendimentoId, doc]);

  useEffect(() => {
    if (temposCalculados) {
      setFormData(prev => ({
        ...prev,
        tempo_concepcao: temposCalculados.concepcao,
        tempo_planejamento: temposCalculados.planejamento,
        tempo_estudo_preliminar: temposCalculados.estudo_preliminar,
        tempo_ante_projeto: temposCalculados.ante_projeto,
        tempo_projeto_basico: temposCalculados.projeto_basico,
        tempo_projeto_executivo: temposCalculados.projeto_executivo,
        tempo_liberado_obra: temposCalculados.liberado_obra,
        tempo_total: temposCalculados.total
      }));
    }
  }, [temposCalculados]);

  const subdisciplinasDisponiveis = useMemo(() => {
    if (formData.disciplinas.length === 0) return [];
    const actividadesDasDisciplinas = allAtividades.filter(ativ => 
      formData.disciplinas.includes(ativ.disciplina) && !ativ.empreendimento_id
    );
    const subdisciplinas = new Set();
    actividadesDasDisciplinas.forEach(ativ => {
      if (ativ.subdisciplina) subdisciplinas.add(ativ.subdisciplina);
    });
    return Array.from(subdisciplinas).sort();
  }, [formData.disciplinas, allAtividades]);

  const validate = () => {
    const newErrors = {};
    if (!formData.numero.trim()) newErrors.numero = "Número é obrigatório";
    if (!formData.arquivo.trim()) newErrors.arquivo = "Nome do arquivo é obrigatório";
    if (formData.disciplinas.length === 0) newErrors.disciplinas = "Selecione ao menos uma disciplina";
    if (formData.subdisciplinas.length === 0) newErrors.subdisciplinas = "Selecione ao menos uma subdisciplina";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {

      const docData = {
        numero: formData.numero.trim(),
        arquivo: formData.arquivo.trim(),
        descritivo: formData.descritivo.trim(),
        pavimento_id: formData.pavimento_id,
        disciplina: formData.disciplinas[0] || "",
        disciplinas: formData.disciplinas,
        subdisciplinas: formData.subdisciplinas,
        escala: formData.escala ? Number(formData.escala) : null,
        fator_dificuldade: Number(formData.fator_dificuldade),
        empreendimento_id: empreendimentoId,
        tempo_total: Number(formData.tempo_total) || 0,
        tempo_concepcao: Number(formData.tempo_concepcao) || 0,
        tempo_planejamento: Number(formData.tempo_planejamento) || 0,
        tempo_estudo_preliminar: Number(formData.tempo_estudo_preliminar) || 0,
        tempo_ante_projeto: Number(formData.tempo_ante_projeto) || 0,
        tempo_projeto_basico: Number(formData.tempo_projeto_basico) || 0,
        tempo_projeto_executivo: Number(formData.tempo_projeto_executivo) || 0,
        tempo_liberado_obra: Number(formData.tempo_liberado_obra) || 0
      };


      let savedDoc;
      const oldFatorDificuldade = doc?.fator_dificuldade;
      const newFatorDificuldade = Number(formData.fator_dificuldade);
      
      if (doc) {
        savedDoc = await retryWithBackoff(() => Documento.update(doc.id, docData), 3, 500, 'updateDocumento');
        
        // Se o fator de dificuldade mudou, atualizar planejamentos relacionados
        if (oldFatorDificuldade && oldFatorDificuldade !== newFatorDificuldade) {
          
          try {
            const { PlanejamentoAtividade } = await import('@/entities/all');
            
            // Buscar todos os planejamentos deste documento
            const planejamentosDoc = await retryWithBackoff(
              () => PlanejamentoAtividade.filter({
                empreendimento_id: empreendimentoId,
                documento_id: doc.id
              }),
              3, 500, 'getPlanejamentosParaRecalcular'
            );
            
            
            // Recalcular tempo de cada planejamento
            const multiplicador = newFatorDificuldade / oldFatorDificuldade;
            
            for (const plano of planejamentosDoc) {
              const novoTempo = plano.tempo_planejado * multiplicador;
              
              await retryWithBackoff(
                () => PlanejamentoAtividade.update(plano.id, {
                  tempo_planejado: Number(novoTempo.toFixed(2))
                }),
                3, 500, `updatePlanejamento-${plano.id}`
              );
            }
            
          } catch (error) {
            console.error('❌ Erro ao atualizar planejamentos:', error);
            // Não bloquear o salvamento do documento por erro nos planejamentos
          }
        }
      } else {
        savedDoc = await retryWithBackoff(() => Documento.create(docData), 3, 500, 'createDocumento');
        
        // Registrar atividades em AtividadesEmpreendimento quando documento é criado
        try {
          const subdisciplinasDoc = savedDoc.subdisciplinas || [];
          const disciplinaDoc = savedDoc.disciplina;
          
          const atividadesParaRegistrar = allAtividades.filter(ativ => {
            if (ativ.empreendimento_id) return false;
            
            const disciplinaMatch = ativ.disciplina === disciplinaDoc;
            const subdisciplinaMatch = subdisciplinasDoc.includes(ativ.subdisciplina);
            return disciplinaMatch && subdisciplinaMatch;
          });
          
          
          // Padrões de atividades que se repetem
          const atividadesPorFolha = [
            'Carimbo, nota e legenda',
            'Cadastro de projeto',
            'Validação do cadastro de PB de arquitetura, estrutura, fundações e terceiros',
            'Check-List - EP',
            'Check-List - AP',
            'Check-List - PB',
            'Check-List - PE',
            'Check-List - LO'
          ];
          
          for (const ativ of atividadesParaRegistrar) {
            try {
              const nomeAtividade = String(ativ.atividade || '').trim();
              
              // Verificar se a atividade deve se repetir POR FOLHA (apenas uma vez para este documento)
              const ehAtividadePorFolha = atividadesPorFolha.some(padrao => nomeAtividade.includes(padrao));
              
              const etapaMapeada = mapearEtapaParaEmpreendimento(ativ.etapa);
              if (ehAtividadePorFolha) {
                // Registrar apenas UMA VEZ para este documento
                await retryWithBackoff(
                  () => base44.entities.AtividadesEmpreendimento.create({
                    id_atividade: ativ.id_atividade || ativ.id,
                    empreendimento_id: empreendimentoId,
                    documento_id: savedDoc.id,
                    etapa: etapaMapeada,
                    disciplina: ativ.disciplina,
                    subdisciplina: ativ.subdisciplina,
                    atividade: `${ativ.atividade} (Folha ${savedDoc.numero})`,
                    predecessora: ativ.predecessora,
                    tempo: ativ.tempo,
                    funcao: ativ.funcao,
                    documento_ids: [savedDoc.id],
                    status_planejamento: 'nao_planejada'
                  }),
                  3, 500, `createAtividadeEmp-${ativ.id}-${savedDoc.id}`
                );
              } else {
                // Atividade normal - registrar uma vez
                await retryWithBackoff(
                  () => base44.entities.AtividadesEmpreendimento.create({
                    id_atividade: ativ.id_atividade || ativ.id,
                    empreendimento_id: empreendimentoId,
                    documento_id: savedDoc.id,
                    etapa: etapaMapeada,
                    disciplina: ativ.disciplina,
                    subdisciplina: ativ.subdisciplina,
                    atividade: ativ.atividade,
                    predecessora: ativ.predecessora,
                    tempo: ativ.tempo,
                    funcao: ativ.funcao,
                    documento_ids: [savedDoc.id],
                    status_planejamento: 'nao_planejada'
                  }),
                  3, 500, `createAtividadeEmp-${ativ.id}-${savedDoc.id}`
                );
              }
            } catch (error) {
            }
          }
          
        } catch (error) {
        }
      }


      onSave(savedDoc);
    } catch (error) {
      console.error('❌ [DocumentoForm] Erro ao salvar documento:', error);
      alert("Erro ao salvar documento. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubdisciplinaToggle = (subdisciplina) => {
    setFormData(prev => {
      const subdisciplinas = prev.subdisciplinas.includes(subdisciplina)
        ? prev.subdisciplinas.filter(s => s !== subdisciplina)
        : [...prev.subdisciplinas, subdisciplina];
      return { ...prev, subdisciplinas };
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{doc ? 'Editar Documento' : 'Novo Documento'}</span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Adjusted from outline, keeping responsive */}
            <div className="space-y-2">
              <Label htmlFor="numero">Número do Documento *</Label>
              <Input
                id="numero"
                value={formData.numero}
                onChange={(e) => setFormData({...formData, numero: e.target.value})}
                className={errors.numero ? 'border-red-500' : ''}
                placeholder="Ex: ARQ-01"
                required
              />
              {errors.numero && <p className="text-red-500 text-sm mt-1">{errors.numero}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="arquivo">Nome do Arquivo *</Label>
              <Input
                id="arquivo"
                value={formData.arquivo}
                onChange={(e) => setFormData({...formData, arquivo: e.target.value})}
                className={errors.arquivo ? 'border-red-500' : ''}
                placeholder="Ex: Planta Baixa Térreo"
                required
              />
              {errors.arquivo && <p className="text-red-500 text-sm mt-1">{errors.arquivo}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="descritivo">Descritivo</Label>
            <Input
              id="descritivo"
              value={formData.descritivo}
              onChange={(e) => setFormData({...formData, descritivo: e.target.value})}
              placeholder="Ex: Planta baixa do pavimento térreo com layout de móveis"
            />
            <p className="text-xs text-gray-500">Descrição detalhada do documento (opcional)</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> {/* Adjusted from outline, keeping responsive */}
            <div className="space-y-2">
              <Label htmlFor="pavimento_id">
                Pavimento (para cálculo de área)
                {formData.pavimento_id && pavimentos && pavimentos.length > 0 && (
                  <span className="text-xs text-blue-600 ml-2">
                    ({pavimentos.find(p => p.id === formData.pavimento_id)?.area || 0} m²)
                  </span>
                )}
              </Label>
              <Select
                value={formData.pavimento_id || ''}
                onValueChange={(value) => setFormData({ ...formData, pavimento_id: value || null })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o pavimento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Sem pavimento (usar horas padrão)</SelectItem>
                  {pavimentos && pavimentos.length > 0 ? (
                    pavimentos.map(pav => (
                      <SelectItem key={pav.id} value={pav.id}>
                        {pav.nome} - {Number(pav.area).toFixed(0)}m²
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="nenhum" disabled>
                      Nenhum pavimento cadastrado
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.pavimento_id
                  ? "A área do pavimento será usada para calcular o tempo das atividades (tempo/m² × área)"
                  : "Sem pavimento, será usado o tempo padrão das atividades (sem multiplicar pela área)"}
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Disciplinas * (selecione até 2)</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-gray-50">
                {disciplinas.map(d => (
                  <div key={d.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`disc-${d.id}`}
                      checked={formData.disciplinas.includes(d.nome)}
                      onCheckedChange={(checked) => {
                        if (checked && formData.disciplinas.length < 2) {
                          setFormData({...formData, disciplinas: [...formData.disciplinas, d.nome], subdisciplinas: []});
                        } else if (!checked) {
                          setFormData({...formData, disciplinas: formData.disciplinas.filter(disc => disc !== d.nome), subdisciplinas: []});
                        }
                      }}
                      disabled={!formData.disciplinas.includes(d.nome) && formData.disciplinas.length >= 2}
                    />
                    <Label htmlFor={`disc-${d.id}`} className="cursor-pointer">{d.nome}</Label>
                  </div>
                ))}
              </div>
              {errors.disciplinas && <p className="text-red-500 text-sm mt-1">{errors.disciplinas}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="escala">Escala</Label>
              <Input
                id="escala"
                type="number"
                step="0.01"
                value={formData.escala}
                onChange={(e) => setFormData({...formData, escala: e.target.value})}
                placeholder="Ex: 100 (para 1:100)"
              />
              <p className="text-xs text-gray-500">
                Escala do documento (ex: 100 para 1:100) - Campo opcional
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fator_dificuldade">Fator de Dificuldade</Label>
              <Input
                id="fator_dificuldade"
                type="number"
                step="0.1"
                value={formData.fator_dificuldade}
                onChange={(e) => setFormData({...formData, fator_dificuldade: e.target.value})}
              />
            </div>
          </div>

          {formData.disciplinas.length > 0 && subdisciplinasDisponiveis.length > 0 && (
            <div>
              <Label>Subdisciplinas * (selecione ao menos uma)</Label>
              <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-md bg-gray-50">
                {subdisciplinasDisponiveis.map(sub => (
                  <div key={sub} className="flex items-center space-x-2">
                    <Checkbox
                      id={`sub-${sub}`}
                      checked={formData.subdisciplinas.includes(sub)}
                      onCheckedChange={() => handleSubdisciplinaToggle(sub)}
                    />
                    <Label htmlFor={`sub-${sub}`} className="cursor-pointer">{sub}</Label>
                  </div>
                ))}
              </div>
              {errors.subdisciplinas && <p className="text-red-500 text-sm mt-1">{errors.subdisciplinas}</p>}
            </div>
          )}

          {formData.subdisciplinas.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900">Tempos Calculados</h4>
                  <p className="text-sm text-blue-700">
                    Os tempos são calculados automaticamente com base nas atividades disponíveis para as subdisciplinas selecionadas.
                    {formData.pavimento_id && ' A área do pavimento é multiplicada pelo tempo padrão de cada atividade.'}
                    {!formData.pavimento_id && (
                      <span className="text-red-600 font-medium"> Sem pavimento selecionado, os tempos são baseados nos valores padrão das atividades multiplicado pelo fator de dificuldade.</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Total</p>
                  <p className="font-bold text-blue-900">{temposCalculados.total.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Concepção</p>
                  <p className="font-bold">{temposCalculados.concepcao.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Planejamento</p>
                  <p className="font-bold">{temposCalculados.planejamento.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Estudo Preliminar</p>
                  <p className="font-bold">{temposCalculados.estudo_preliminar.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Ante-Projeto</p>
                  <p className="font-bold">{temposCalculados.ante_projeto.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Projeto Básico</p>
                  <p className="font-bold">{temposCalculados.projeto_basico.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Projeto Executivo</p>
                  <p className="font-bold">{temposCalculados.projeto_executivo.toFixed(1)}h</p>
                </div>
                <div className="bg-white p-2 rounded border">
                  <p className="text-xs text-gray-600">Liberado p/ Obra</p>
                  <p className="font-bold">{temposCalculados.liberado_obra.toFixed(1)}h</p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {doc ? 'Atualizar Documento' : 'Criar Documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}