import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ComercialForm({ empreendimento, onClose, onSubmit, onSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [disciplinasDisponiveis, setDisciplinasDisponiveis] = useState([]);
  const [formData, setFormData] = useState({
    nome: empreendimento?.nome || "",
    cliente: empreendimento?.cliente || "",
    endereco: empreendimento?.endereco || "",
    status: empreendimento?.status || "em_planejamento",
    foto_url: empreendimento?.foto_url || "",
    disciplinas: empreendimento?.disciplinas || [],
    codisciplinas: empreendimento?.codisciplinas || []
  });

  useEffect(() => {
    loadDisciplinas();
  }, []);

  const loadDisciplinas = async () => {
    try {
      const disciplinas = await base44.entities.Disciplina.list();
      setDisciplinasDisponiveis(disciplinas);
    } catch (error) {
      console.error("Erro ao carregar disciplinas:", error);
    }
  };

  const codisciplinasDisponiveis = disciplinasDisponiveis
    .filter(d => formData.disciplinas.includes(d.nome))
    .flatMap(d => d.codisciplinas || []);

  const toggleDisciplina = (disciplinaNome) => {
    const novasDisciplinas = formData.disciplinas.includes(disciplinaNome)
      ? formData.disciplinas.filter(d => d !== disciplinaNome)
      : [...formData.disciplinas, disciplinaNome];
    
    // Remover codisciplinas que não pertencem mais às disciplinas selecionadas
    const disciplinasObj = disciplinasDisponiveis.filter(d => novasDisciplinas.includes(d.nome));
    const codisciplinasValidas = disciplinasObj.flatMap(d => d.codisciplinas || []);
    const novasCodisciplinas = formData.codisciplinas.filter(c => codisciplinasValidas.includes(c));
    
    setFormData({ ...formData, disciplinas: novasDisciplinas, codisciplinas: novasCodisciplinas });
  };

  const toggleCodisciplina = (codisciplina) => {
    const novasCodisciplinas = formData.codisciplinas.includes(codisciplina)
      ? formData.codisciplinas.filter(c => c !== codisciplina)
      : [...formData.codisciplinas, codisciplina];
    
    setFormData({ ...formData, codisciplinas: novasCodisciplinas });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.nome || !formData.cliente) {
      alert("Preencha os campos obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Erro ao salvar:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {empreendimento ? "Editar Empreendimento" : "Novo Empreendimento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome do Empreendimento *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Nome do empreendimento"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cliente">Cliente *</Label>
            <Input
              id="cliente"
              value={formData.cliente}
              onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
              placeholder="Nome do cliente"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="endereco">Endereço</Label>
            <Input
              id="endereco"
              value={formData.endereco}
              onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
              placeholder="Endereço do empreendimento"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="em_planejamento">Em Planejamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="pausado">Pausado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="foto_url">URL da Imagem</Label>
            <Input
              id="foto_url"
              value={formData.foto_url}
              onChange={(e) => setFormData({ ...formData, foto_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="space-y-2">
            <Label>Disciplinas</Label>
            <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
              {disciplinasDisponiveis.map((disciplina) => (
                <div key={disciplina.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`disciplina-${disciplina.id}`}
                    checked={formData.disciplinas.includes(disciplina.nome)}
                    onCheckedChange={() => toggleDisciplina(disciplina.nome)}
                  />
                  <label
                    htmlFor={`disciplina-${disciplina.id}`}
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    {disciplina.nome}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {formData.disciplinas.length > 0 && (
            <div className="space-y-2">
              <Label>Codisciplinas</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {codisciplinasDisponiveis.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma codisciplina disponível para as disciplinas selecionadas</p>
                ) : (
                  codisciplinasDisponiveis.map((codisciplina, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <Checkbox
                        id={`codisciplina-${idx}`}
                        checked={formData.codisciplinas.includes(codisciplina)}
                        onCheckedChange={() => toggleCodisciplina(codisciplina)}
                      />
                      <label
                        htmlFor={`codisciplina-${idx}`}
                        className="text-sm font-medium leading-none cursor-pointer"
                      >
                        {codisciplina}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-purple-600 hover:bg-purple-700">
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {empreendimento ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}