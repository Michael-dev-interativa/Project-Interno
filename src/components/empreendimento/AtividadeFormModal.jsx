import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Atividade, Documento } from '@/entities/all';
import { Loader2 } from 'lucide-react';

export default function AtividadeFormModal({ isOpen, onClose, empreendimentoId, disciplinas, atividade, onSuccess }) {
  const [formData, setFormData] = useState({
    etapa: '',
    disciplina: '',
    atividade: '',
    tempo: '',
    empreendimento_id: empreendimentoId,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allAtividades, setAllAtividades] = useState([]);
  const [selectedSubdisciplinas, setSelectedSubdisciplinas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [selectedDocumentoIds, setSelectedDocumentoIds] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ativs, docs] = await Promise.all([
          Atividade.list(),
          Documento.filter({ empreendimento_id: empreendimentoId })
        ]);
        setAllAtividades(ativs || []);
        setDocumentos(docs || []);
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      }
    };
    
    if (isOpen) {
      loadData();
    }
  }, [isOpen, empreendimentoId]);

  useEffect(() => {
    if (isOpen) {
      if (atividade) {
        // Definir disciplina primeiro
        const disciplinaInicial = atividade.disciplina || '';
        
        setFormData({
          etapa: atividade.etapa || '',
          disciplina: disciplinaInicial,
          atividade: atividade.atividade || '',
          tempo: atividade.tempo?.toString() || '',
          empreendimento_id: empreendimentoId,
        });
        
        // Inicializar subdisciplinas selecionadas
        if (atividade.subdisciplinas && Array.isArray(atividade.subdisciplinas)) {
          setSelectedSubdisciplinas(atividade.subdisciplinas);
        } else if (atividade.subdisciplina) {
          setSelectedSubdisciplinas([atividade.subdisciplina]);
        } else {
          setSelectedSubdisciplinas([]);
        }
        
        // Pré-selecionar documentos/folhas se fornecidas
        if (atividade.documento_ids && Array.isArray(atividade.documento_ids)) {
          setSelectedDocumentoIds(atividade.documento_ids);
        } else if (atividade.documento_id) {
          setSelectedDocumentoIds([atividade.documento_id]);
        } else {
          setSelectedDocumentoIds([]);
        }
      } else {
        // Reset form for new entry
        setFormData({
          etapa: '',
          disciplina: '',
          atividade: '',
          tempo: '',
          empreendimento_id: empreendimentoId,
        });
        setSelectedSubdisciplinas([]);
        setSelectedDocumentoIds([]);
      }
    }
  }, [atividade, empreendimentoId, isOpen]);

  // Garantir que as folhas pré-selecionadas fiquem marcadas após documentos carregarem
  useEffect(() => {
    if (atividade?.documento_ids && documentos.length > 0) {
      setSelectedDocumentoIds(atividade.documento_ids);
    }
  }, [documentos, atividade?.documento_ids]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Limpar subdisciplinas quando mudar a disciplina
    if (name === 'disciplina') {
      setSelectedSubdisciplinas([]);
    }
  };

  const etapasDisponiveis = useMemo(() => {
    const etapasSet = new Set();
    allAtividades.forEach(ativ => {
      if (ativ.etapa) {
        etapasSet.add(ativ.etapa);
      }
    });
    return Array.from(etapasSet).sort();
  }, [allAtividades]);

  const subdisciplinasDisponiveis = useMemo(() => {
    if (!formData.disciplina) return [];
    
    const subdisciplinasSet = new Set();
    allAtividades.forEach(ativ => {
      if (ativ.disciplina === formData.disciplina && ativ.subdisciplina) {
        subdisciplinasSet.add(ativ.subdisciplina);
      }
    });
    
    return Array.from(subdisciplinasSet).sort();
  }, [formData.disciplina, allAtividades]);

  const documentosFiltrados = useMemo(() => {
    if (!formData.disciplina) return documentos;
    
    return documentos.filter(doc => {
      // Filtrar por disciplina principal
      if (doc.disciplina === formData.disciplina) return true;
      
      // Filtrar por disciplinas array (se existir)
      if (doc.disciplinas && Array.isArray(doc.disciplinas)) {
        return doc.disciplinas.includes(formData.disciplina);
      }
      
      return false;
    });
  }, [documentos, formData.disciplina]);

  const handleToggleSubdisciplina = (subdisciplina) => {
    setSelectedSubdisciplinas(prev => {
      if (prev.includes(subdisciplina)) {
        return prev.filter(s => s !== subdisciplina);
      } else {
        return [...prev, subdisciplina];
      }
    });
  };

  const handleToggleDocumento = (documentoId) => {
    setSelectedDocumentoIds(prev => {
      if (prev.includes(documentoId)) {
        return prev.filter(id => id !== documentoId);
      } else {
        return [...prev, documentoId];
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.disciplina) {
      alert("Por favor, selecione uma disciplina.");
      return;
    }
    
    if (selectedSubdisciplinas.length === 0) {
      alert("Por favor, selecione pelo menos uma subdisciplina.");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (atividade && atividade.id) {
        // Edição - atualiza apenas uma atividade
        const dataToSave = {
          ...formData,
          subdisciplina: selectedSubdisciplinas[0],
          tempo: formData.tempo ? Number(formData.tempo) : null,
          documento_ids: selectedDocumentoIds.length > 0 ? selectedDocumentoIds : [],
          documento_id: selectedDocumentoIds[0] || null, // Manter por compatibilidade
        };
        await Atividade.update(atividade.id, dataToSave);
      } else {
        // Criação - criar uma atividade por subdisciplina com múltiplas folhas
        const createPromises = [];

        // Criar uma atividade para cada subdisciplina
        selectedSubdisciplinas.forEach(subdisciplina => {
          const dataToSave = {
            ...formData,
            subdisciplina: subdisciplina,
            tempo: formData.tempo ? Number(formData.tempo) : null,
            documento_ids: selectedDocumentoIds.length > 0 ? selectedDocumentoIds : [],
            documento_id: selectedDocumentoIds[0] || null, // Compatibilidade
          };
          createPromises.push(Atividade.create(dataToSave));
        });
        
        await Promise.all(createPromises);
      }
      onSuccess();
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      alert("Não foi possível salvar a atividade. Verifique o console para mais detalhes.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{atividade ? 'Editar Atividade' : 'Nova Atividade no Empreendimento'}</DialogTitle>
          <DialogDescription>
            Preencha os detalhes da atividade específica para este projeto.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="py-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto flex-1 pr-1">
          <div className="space-y-2">
            <Label htmlFor="atividade">Descrição da Atividade</Label>
            <Input id="atividade" name="atividade" value={formData.atividade} onChange={handleChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="etapa">Etapa</Label>
            <Select name="etapa" value={formData.etapa} onValueChange={(v) => handleSelectChange('etapa', v)} required>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {etapasDisponiveis.map(etapa => <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="disciplina">Disciplina</Label>
            <Select name="disciplina" value={formData.disciplina} onValueChange={(v) => handleSelectChange('disciplina', v)} required>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {disciplinas.map(d => <SelectItem key={d.id} value={d.nome}>{d.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          {formData.disciplina && subdisciplinasDisponiveis.length > 0 && (
            <div className="space-y-2 md:col-span-2">
              <Label>Subdisciplina</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 border rounded-md max-h-48 overflow-y-auto">
                {subdisciplinasDisponiveis.map(subdisciplina => (
                  <div key={subdisciplina} className="flex items-center space-x-2 min-w-0">
                    <Checkbox
                      id={`subdisciplina-${subdisciplina}`}
                      checked={selectedSubdisciplinas.includes(subdisciplina)}
                      onCheckedChange={() => handleToggleSubdisciplina(subdisciplina)}
                      className="flex-shrink-0"
                    />
                    <label
                      htmlFor={`subdisciplina-${subdisciplina}`}
                      className="text-sm cursor-pointer truncate"
                    >
                      {subdisciplina}
                    </label>
                  </div>
                ))}
              </div>
              {selectedSubdisciplinas.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {selectedSubdisciplinas.length} subdisciplina(s) selecionada(s)
                  {!atividade && selectedSubdisciplinas.length > 1 && ": será criada uma atividade para cada subdisciplina"}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
           <Label htmlFor="tempo">Tempo Padrão (horas)</Label>
           <Input id="tempo" name="tempo" type="number" step="0.1" value={formData.tempo} onChange={handleChange} />
          </div>

          <div className="space-y-2 md:col-span-2">
           <Label htmlFor="folha">Folhas (Opcional)</Label>
           <div className="grid grid-cols-1 gap-2 p-4 border rounded-md max-h-64 overflow-y-auto bg-gray-50">
             {documentosFiltrados.length > 0 ? documentosFiltrados.map(doc => (
               <div key={doc.id} className="flex items-start space-x-2">
                 <Checkbox
                   id={`documento-${doc.id}`}
                   checked={selectedDocumentoIds.includes(doc.id)}
                   onCheckedChange={() => handleToggleDocumento(doc.id)}
                   className="flex-shrink-0 mt-1"
                 />
                 <label
                   htmlFor={`documento-${doc.id}`}
                   className="text-sm cursor-pointer break-words flex-1"
                 >
                   {doc.numero} - {doc.arquivo}
                 </label>
               </div>
             )) : (
               <p className="text-sm text-gray-500 text-center py-2">
                 {formData.disciplina ? 'Nenhuma folha encontrada para esta disciplina' : 'Nenhuma folha cadastrada'}
               </p>
             )}
           </div>
           <p className="text-xs text-gray-500">
             {selectedDocumentoIds.length === 0 
                  ? 'Se nenhuma folha for selecionada, a atividade ficará vinculada apenas ao empreendimento.'
                  : `${selectedDocumentoIds.length} folha(s) selecionada(s). ${selectedSubdisciplinas.length > 0 ? `Será criada ${selectedSubdisciplinas.length} atividade(s) com múltiplas folhas.` : ''}`
                }
           </p>
          </div>
        </form>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar Atividade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}