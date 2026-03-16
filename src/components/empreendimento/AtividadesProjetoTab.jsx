import React, { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Search, Calendar } from "lucide-react";
import { Atividade } from "@/entities/all";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
    TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AplicarAtividadeModal from "./AplicarAtividadeModal";
import PlanejamentoAtividadeModal from "./PlanejamentoAtividadeModal";
import AtividadesProjetoFilters from "./AtividadesProjetoFilters";

const initialState = {
  etapa: '',
  disciplina: '',
  subdisciplina: '',
  atividade: '',
  funcao: '',
  tempo: 0,
};

const AtividadeFormDialog = ({ open, setOpen, empreendimentoId, disciplinas, onUpdate, atividadeToEdit, documentos }) => {
  const [atividade, setAtividade] = useState(atividadeToEdit || initialState);
  const [selectedDocumentoId, setSelectedDocumentoId] = useState(null);
  
  React.useEffect(() => {
    setAtividade(atividadeToEdit || initialState);
    setSelectedDocumentoId(atividadeToEdit?.documento_id || null);
  }, [atividadeToEdit, open]);

  const handleSubmit = async () => {
    if (!empreendimentoId) {
      alert("ID do empreendimento não encontrado");
      return;
    }
    
    try {
      if (atividade.id) {
        // EDIÇÃO: Atualiza a atividade e recalcula documentos se o tempo mudou
        const tempoAntigo = atividadeToEdit?.tempo;
        const tempoNovo = Number(atividade.tempo) || 0;
        
        const payload = { 
          ...atividade, 
          tempo: tempoNovo, 
          empreendimento_id: empreendimentoId,
          documento_id: selectedDocumentoId || atividade.documento_id
        };
        await Atividade.update(atividade.id, payload);
        
        // Se o tempo mudou E a atividade é um override (tem id_atividade), recalcular documentos
        if (tempoAntigo !== tempoNovo && atividade.id_atividade) {
          console.log(`🔄 Tempo mudou de ${tempoAntigo}h para ${tempoNovo}h, recalculando documentos...`);
          
          try {
            const { Documento } = await import('@/entities/all');
            
            // Buscar todos os documentos deste empreendimento
            const docsDoEmp = documentos.filter(d => d.empreendimento_id === empreendimentoId);
            console.log(`   📊 Encontrados ${docsDoEmp.length} documentos para verificar`);
            
            // Para cada documento, verificar se usa esta atividade e recalcular
            for (const doc of docsDoEmp) {
              // Verificar se o documento tem as mesmas disciplinas e subdisciplinas da atividade
              const disciplinaMatch = doc.disciplinas?.includes(atividade.disciplina) || doc.disciplina === atividade.disciplina;
              const subdisciplinaMatch = doc.subdisciplinas?.includes(atividade.subdisciplina);
              
              if (disciplinaMatch && subdisciplinaMatch) {
                console.log(`   🔢 Recalculando documento ${doc.numero}...`);
                
                // Buscar o campo de tempo da etapa correspondente
                const etapaMap = {
                  'Concepção': 'tempo_concepcao',
                  'Planejamento': 'tempo_planejamento',
                  'Estudo Preliminar': 'tempo_estudo_preliminar',
                  'Ante-Projeto': 'tempo_ante_projeto',
                  'Projeto Básico': 'tempo_projeto_basico',
                  'Projeto Executivo': 'tempo_projeto_executivo',
                  'Liberado para Obra': 'tempo_liberado_obra'
                };
                
                const campoTempo = etapaMap[atividade.etapa];
                if (campoTempo) {
                  const fatorDificuldade = doc.fator_dificuldade || 1;
                  const diferenca = (tempoNovo - tempoAntigo) * fatorDificuldade;
                  const tempoAtual = doc[campoTempo] || 0;
                  const novoTempo = Math.max(0, tempoAtual + diferenca);
                  
                  // Atualizar também o tempo total se não for Concepção/Planejamento
                  const atualizarTotal = !['Concepção', 'Planejamento'].includes(atividade.etapa);
                  const tempoTotal = atualizarTotal ? Math.max(0, (doc.tempo_total || 0) + diferenca) : doc.tempo_total;
                  
                  await Documento.update(doc.id, {
                    [campoTempo]: Number(novoTempo.toFixed(2)),
                    ...(atualizarTotal ? { tempo_total: Number(tempoTotal.toFixed(2)) } : {})
                  });
                  
                  console.log(`      ✅ ${doc.numero}: ${campoTempo} ${tempoAtual}h → ${novoTempo.toFixed(2)}h`);
                }
              }
            }
            
            console.log(`   ✅ Documentos recalculados com sucesso`);
          } catch (error) {
            console.error('❌ Erro ao recalcular documentos:', error);
            // Não bloquear a atualização da atividade
          }
        }
        
        onUpdate();
        setOpen(false);
      } else {
        // CRIAÇÃO: Cria atividade vinculada à folha selecionada
        const payload = { 
          ...atividade, 
          tempo: Number(atividade.tempo) || 0, 
          empreendimento_id: empreendimentoId,
          documento_id: selectedDocumentoId || null
        };
        await Atividade.create(payload);
        onUpdate();
        setOpen(false);
      }
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      alert("Erro ao salvar atividade");
    }
  };

  const etapas = ['Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra', 'Concepção', 'Planejamento'];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{atividade.id ? 'Editar Atividade' : 'Nova Atividade do Projeto'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-4">
          <div className="space-y-2">
            <Label htmlFor="atividade">Atividade</Label>
            <Textarea 
              id="atividade" 
              value={atividade.atividade || ''} 
              onChange={(e) => setAtividade({ ...atividade, atividade: e.target.value })} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="etapa">Etapa</Label>
              <Select value={atividade.etapa || ''} onValueChange={(value) => setAtividade({ ...atividade, etapa: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map(etapa => (
                    <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="disciplina">Disciplina</Label>
              <Select value={atividade.disciplina || ''} onValueChange={(value) => setAtividade({ ...atividade, disciplina: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a disciplina" />
                </SelectTrigger>
                <SelectContent>
                  {(disciplinas || []).map(d => (
                    <SelectItem key={d.id} value={d.nome}>{d.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subdisciplina">Subdisciplina</Label>
            <Input 
              id="subdisciplina" 
              value={atividade.subdisciplina || ''} 
              onChange={(e) => setAtividade({ ...atividade, subdisciplina: e.target.value })} 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="folha">Folha (Opcional)</Label>
            <Select value={selectedDocumentoId || 'sem_folha'} onValueChange={(value) => setSelectedDocumentoId(value === 'sem_folha' ? null : value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a folha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem_folha">Sem folha específica</SelectItem>
                {(documentos || []).map(doc => (
                  <SelectItem key={doc.id} value={doc.id}>
                    {doc.numero} - {doc.arquivo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Se selecionada, a atividade ficará vinculada apenas a esta folha.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="funcao">Função</Label>
              <Input 
                id="funcao" 
                value={atividade.funcao || ''} 
                onChange={(e) => setAtividade({ ...atividade, funcao: e.target.value })} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tempo">Tempo (h)</Label>
              <Input 
                id="tempo" 
                type="number" 
                step="0.1"
                value={atividade.tempo || 0} 
                onChange={(e) => setAtividade({ ...atividade, tempo: e.target.value })} 
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit}>
            {atividade.id ? 'Salvar' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default function AtividadesProjetoTab({ empreendimentoId, atividades = [], disciplinas = [], onUpdate, isLoading, documentos = [], usuarios = [], planejamentos = [] }) {
  const [showForm, setShowForm] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [etapaFilter, setEtapaFilter] = useState("");
  const [disciplinaFilter, setDisciplinaFilter] = useState("");
  const [subdisciplinaFilter, setSubdisciplinaFilter] = useState("");
  const [showAplicarModal, setShowAplicarModal] = useState(false);
  const [atividadeParaAplicar, setAtividadeParaAplicar] = useState(null);
  const [showPlanejamentoModal, setShowPlanejamentoModal] = useState(false);
  const [atividadeParaPlanejar, setAtividadeParaPlanejar] = useState(null);
  const [selectedAtividades, setSelectedAtividades] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleEdit = (atividade) => {
    setEditingAtividade(atividade);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir esta atividade específica do projeto?")) {
      try {
        await Atividade.delete(id);
        onUpdate();
      } catch (error) {
        console.error("Erro ao excluir atividade:", error);
        alert("Erro ao excluir atividade");
      }
    }
  };

  const handleAplicarADocumentos = (atividade) => {
    setAtividadeParaAplicar(atividade);
    setShowAplicarModal(true);
  };

  const handlePlanejarDiretamente = async (atividade) => {
    try {
      const atividadeComPlanejamento = {
        ...atividade,
        tempo_planejado: Number(atividade.tempo) || 0 
      };

      console.log("🎯 Abrindo modal de planejamento para atividade:", atividadeComPlanejamento);
      
      setAtividadeParaPlanejar(atividadeComPlanejamento);
      setShowPlanejamentoModal(true);
    } catch (error) {
      console.error("Erro ao preparar atividade para planejamento:", error);
      alert("Erro ao preparar atividade para planejamento");
    }
  };

  const handleToggleAtividade = (atividadeId) => {
    setSelectedAtividades(prev => 
      prev.includes(atividadeId) 
        ? prev.filter(id => id !== atividadeId)
        : [...prev, atividadeId]
    );
  };

  const handleExcluirMultiplas = async () => {
    if (selectedAtividades.length === 0) {
      alert("Selecione pelo menos uma atividade");
      return;
    }

    if (!window.confirm(`Tem certeza que deseja EXCLUIR permanentemente ${selectedAtividades.length} atividade(s)?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      for (const atividadeId of selectedAtividades) {
        await Atividade.delete(atividadeId);
      }
      setSelectedAtividades([]);
      onUpdate();
      alert(`✅ ${selectedAtividades.length} atividade(s) excluída(s) com sucesso!`);
    } catch (error) {
      console.error("Erro ao excluir atividades:", error);
      alert("Erro ao excluir atividades: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // The handlePlanejamentoSubmit function has been removed from AtividadesProjetoTab
  // because PlanejamentoAtividadeModal is now responsible for its own submission logic
  // via its internal state and `onSuccess` callback.

  // Pegar IDs dos documentos que pertencem a este empreendimento
  const documentoIdsDoEmpreendimento = useMemo(() => {
    const ids = (documentos || [])
      .filter(d => d.empreendimento_id === empreendimentoId)
      .map(d => d.id);
    console.log("📄 Documentos do empreendimento:", ids.length, ids);
    return ids;
  }, [documentos, empreendimentoId]);

  // MODIFICADO: Filtrar atividades específicas do projeto ou vinculadas aos documentos do empreendimento
  const filteredAtividades = useMemo(() => {
    const disciplinasEspecificas = ['Planejamento', 'Gestão', 'BIM', 'Apoio', 'Coordenação'];
    
    const todasAtividades = (atividades || [])
      .filter(a => {
        const ehDisciplinaEspecifica = a.disciplina && disciplinasEspecificas.includes(a.disciplina);
        
        if (ehDisciplinaEspecifica) {
          // Para disciplinas específicas: incluir TODAS (genéricas, do projeto ou vinculadas a documento)
          const ehGenerica = !a.empreendimento_id && !a.documento_id;
          const ehDoEmpreendimento = a.empreendimento_id === empreendimentoId;
          const ehDoDocumento = a.documento_id && documentoIdsDoEmpreendimento.includes(a.documento_id);
          
          // Incluir também atividades de outros empreendimentos dessas disciplinas específicas
          const incluir = ehGenerica || ehDoEmpreendimento || ehDoDocumento || a.empreendimento_id;
          if (incluir) {
            console.log("✅ Atividade incluída:", a.atividade, { ehGenerica, ehDoEmpreendimento, ehDoDocumento, disciplina: a.disciplina, empreendimento: a.empreendimento_id });
          }
          return incluir;
        }
        
        // Para outras disciplinas: só incluir atividades específicas do projeto ou vinculadas a documentos
        const ehDoEmpreendimento = a.empreendimento_id === empreendimentoId;
        const ehDoDocumento = a.documento_id && documentoIdsDoEmpreendimento.includes(a.documento_id);
        const incluir = ehDoEmpreendimento || ehDoDocumento;
        if (incluir) {
          console.log("✅ Atividade incluída (outra disciplina):", a.atividade, { ehDoEmpreendimento, ehDoDocumento, disciplina: a.disciplina });
        }
        return incluir;
      })
      .filter(a => a.tempo !== -999) // Excluir marcadores de exclusão
      .filter(a => {
        // Filtro por nome
        const nomeMatch = String(a.atividade || '').toLowerCase().includes(searchTerm.toLowerCase());
        
        // Filtro por etapa
        const etapaMatch = !etapaFilter || String(a.etapa || '').toLowerCase() === etapaFilter.toLowerCase();
        
        // Filtro por disciplina
        const disciplinaMatch = !disciplinaFilter || String(a.disciplina || '').toLowerCase() === disciplinaFilter.toLowerCase();
        
        // Filtro por subdisciplina
        const subdisciplinaMatch = !subdisciplinaFilter || String(a.subdisciplina || '').toLowerCase() === subdisciplinaFilter.toLowerCase();
        
        return nomeMatch && etapaMatch && disciplinaMatch && subdisciplinaMatch;
      });
    console.log("🔍 Total de atividades filtradas:", todasAtividades.length);
    return todasAtividades;
  }, [atividades, empreendimentoId, documentoIdsDoEmpreendimento, searchTerm, etapaFilter, disciplinaFilter, subdisciplinaFilter]);

  // Agrupar atividades por disciplina
  const atividadesPorDisciplina = useMemo(() => {
    const grupos = {};
    
    filteredAtividades.forEach(atividade => {
      const disciplina = atividade.disciplina || 'Sem Disciplina';
      
      if (!grupos[disciplina]) {
        grupos[disciplina] = [];
      }
      grupos[disciplina].push(atividade);
    });

    return Object.entries(grupos).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredAtividades]);

  if (!empreendimentoId) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">Empreendimento não encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow-sm">
      <AtividadeFormDialog
        open={showForm}
        setOpen={setShowForm}
        empreendimentoId={empreendimentoId}
        disciplinas={disciplinas}
        onUpdate={onUpdate}
        atividadeToEdit={editingAtividade}
        documentos={documentos}
      />

      <AplicarAtividadeModal
        isOpen={showAplicarModal}
        onClose={() => {
          setShowAplicarModal(false);
          setAtividadeParaAplicar(null);
        }}
        atividade={atividadeParaAplicar}
        documentos={documentos}
        empreendimentoId={empreendimentoId}
        onSave={onUpdate}
      />

      {showPlanejamentoModal && atividadeParaPlanejar && (
        <PlanejamentoAtividadeModal
          isOpen={showPlanejamentoModal}
          onClose={() => {
            console.log("🔄 Fechando modal de planejamento");
            setShowPlanejamentoModal(false);
            setAtividadeParaPlanejar(null);
          }}
          atividade={atividadeParaPlanejar}
          usuarios={usuarios}
          empreendimentoId={empreendimentoId}
          documentos={documentos}
          onSuccess={() => {
            console.log("✅ Planejamento realizado com sucesso");
            setShowPlanejamentoModal(false);
            setAtividadeParaPlanejar(null);
            onUpdate();
          }}
        />
      )}

      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Atividades do Projeto</h3>
          <p className="text-sm text-gray-500">
            Gerencie as atividades deste empreendimento.
          </p>
        </div>
        <div className="flex gap-2">
           <Button onClick={() => { 
             setEditingAtividade(null); 
             setShowForm(true); 
           }}>
             <Plus className="w-4 h-4 mr-2" />
             Nova Atividade
           </Button>
         </div>
      </div>

      <AtividadesProjetoFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        etapaFilter={etapaFilter}
        onEtapaChange={setEtapaFilter}
        disciplinaFilter={disciplinaFilter}
        onDisciplinaChange={setDisciplinaFilter}
        subdisciplinaFilter={subdisciplinaFilter}
        onSubdisciplinaChange={setSubdisciplinaFilter}
        disciplinas={disciplinas}
        atividades={atividades}
        onClearFilters={() => {
          setSearchTerm("");
          setEtapaFilter("");
          setDisciplinaFilter("");
          setSubdisciplinaFilter("");
        }}
      />



      {isLoading ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-gray-500">Carregando...</p>
        </div>
      ) : filteredAtividades.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-gray-500">
            {searchTerm ? 
              "Nenhuma atividade encontrada com os filtros aplicados." :
              "Nenhuma atividade específica cadastrada para este projeto."
            }
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {atividadesPorDisciplina.map(([disciplina, atividadesDisciplina]) => {
            return (
              <div key={disciplina} className="border rounded-lg overflow-hidden">
                <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-5 bg-blue-600 rounded"></div>
                    <h3 className="font-semibold text-lg text-gray-900">
                      {disciplina}
                    </h3>
                    <span className="text-sm text-gray-600">
                      {atividadesDisciplina.length} {atividadesDisciplina.length === 1 ? 'atividade' : 'atividades'}
                    </span>
                  </div>
                </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>Atividade</TableHead>
                      <TableHead>Folhas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead>Tempo Padrão</TableHead>
                      <TableHead>Tempo Total</TableHead>
                      <TableHead className="text-right">Planejar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atividadesDisciplina.map(atividade => {
                      console.log("🔍 Atividade:", atividade.atividade, {
                        documento_ids: atividade.documento_ids,
                        documento_id: atividade.documento_id,
                        tipo_documento_ids: typeof atividade.documento_ids,
                        eh_array: Array.isArray(atividade.documento_ids)
                      });
                      const numFolhas = atividade.documento_ids?.length || (atividade.documento_id ? 1 : 0);
                      const documentosVinculados = atividade.documento_ids 
                        ? documentos.filter(d => atividade.documento_ids.includes(d.id))
                        : atividade.documento_id 
                        ? documentos.filter(d => d.id === atividade.documento_id)
                        : [];
                      console.log("📊 Resultados:", { numFolhas, documentosVinculados: documentosVinculados.length });
                      
                      return (
                        <TableRow key={atividade.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedAtividades.includes(atividade.id)}
                              onCheckedChange={() => handleToggleAtividade(atividade.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{String(atividade.atividade || '')}</TableCell>
                          <TableCell>
                            {numFolhas > 0 ? (
                              <div className="flex flex-col gap-1">
                                <Badge variant="outline" className="w-fit">
                                  {numFolhas} {numFolhas === 1 ? 'folha' : 'folhas'}
                                </Badge>
                                {documentosVinculados.length > 0 && (
                                  <div className="text-xs text-gray-500 max-w-[200px] truncate" title={documentosVinculados.map(d => d.arquivo).join(', ')}>
                                    {documentosVinculados.map(d => d.numero).join(', ')}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <Badge variant="secondary">Disponível</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-gray-600">
                              {atividade.status_planejamento === 'planejada' ? 'Planejada' : 'Disponível'}
                            </Badge>
                          </TableCell>
                          <TableCell>{atividade.etapa}</TableCell>
                          <TableCell>{atividade.tempo}h</TableCell>
                          <TableCell className="font-semibold">{(atividade.tempo * numFolhas).toFixed(1)}h</TableCell>
                          <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => {
                              console.log("🎯 Clicou no botão Planejar para:", atividade);
                              handlePlanejarDiretamente(atividade);
                            }}
                            className="bg-purple-600 text-white hover:bg-purple-700"
                          >
                            <Calendar className="w-3 h-3 mr-1" />
                            Planejar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}