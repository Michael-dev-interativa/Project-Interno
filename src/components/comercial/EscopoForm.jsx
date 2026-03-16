import React, { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function EscopoForm({ formData, setFormData }) {
  const [disciplinasDisponiveis, setDisciplinasDisponiveis] = useState([]);

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
    .filter(d => formData.disciplinas?.includes(d.nome))
    .flatMap(d => d.codisciplinas || []);

  const toggleDisciplina = (disciplinaNome) => {
    const novasDisciplinas = formData.disciplinas?.includes(disciplinaNome)
      ? formData.disciplinas.filter(d => d !== disciplinaNome)
      : [...(formData.disciplinas || []), disciplinaNome];
    
    const disciplinasObj = disciplinasDisponiveis.filter(d => novasDisciplinas.includes(d.nome));
    const codisciplinasValidas = disciplinasObj.flatMap(d => d.codisciplinas || []);
    const novasCodisciplinas = (formData.codisciplinas || []).filter(c => codisciplinasValidas.includes(c));
    
    setFormData({ ...formData, disciplinas: novasDisciplinas, codisciplinas: novasCodisciplinas });
  };

  const toggleCodisciplina = (codisciplina) => {
    const novasCodisciplinas = formData.codisciplinas?.includes(codisciplina)
      ? formData.codisciplinas.filter(c => c !== codisciplina)
      : [...(formData.codisciplinas || []), codisciplina];
    
    setFormData({ ...formData, codisciplinas: novasCodisciplinas });
  };

  const toggleParceiro = (parceiro) => {
    const novosParceiros = formData.parceiros?.includes(parceiro)
      ? formData.parceiros.filter(p => p !== parceiro)
      : [...(formData.parceiros || []), parceiro];
    
    setFormData({ ...formData, parceiros: novosParceiros });
  };

  const adicionarPavimento = () => {
    const novosPavimentos = [
      ...(formData.pavimentos || []),
      { pavimento: '', metragem: 0, repeticao: 1 }
    ];
    setFormData({ ...formData, pavimentos: novosPavimentos });
  };

  const removerPavimento = (index) => {
    const novosPavimentos = formData.pavimentos.filter((_, i) => i !== index);
    setFormData({ ...formData, pavimentos: novosPavimentos });
  };

  const atualizarPavimento = (index, campo, valor) => {
    const novosPavimentos = [...formData.pavimentos];
    novosPavimentos[index] = {
      ...novosPavimentos[index],
      [campo]: campo === 'pavimento' ? valor : Number(valor)
    };
    setFormData({ ...formData, pavimentos: novosPavimentos });
  };

  const parceirosOpcoes = [
    "Arquitetura", "Estrutura", "Paisagismo", "Ar condicionado",
    "Pressurização de escada", "Decoração", "Luminotécnica", "Automação",
    "Segurança", "Acústica", "Cozinha", "Vedação", "Irrigação",
    "Piscina", "Aquecimento Solar", "Fotovoltaico", "Consultores"
  ];

  return (
    <div className="space-y-6 border-t pt-4">
      <div className="bg-blue-50 p-3 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-1">Escopo da Proposta</h3>
        <p className="text-sm text-blue-700">Defina os detalhes técnicos e estruturais do projeto</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="tipo_obra">Tipo de Obra</Label>
          <Select 
            value={formData.tipo_obra || ''} 
            onValueChange={(value) => setFormData({...formData, tipo_obra: value})}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Construção">Construção</SelectItem>
              <SelectItem value="Reforma">Reforma</SelectItem>
              <SelectItem value="Ampliação">Ampliação</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="utilizacao">Utilização</Label>
          <Select 
            value={formData.utilizacao || ''} 
            onValueChange={(value) => setFormData({...formData, utilizacao: value})}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Mono Usuário">Mono Usuário</SelectItem>
              <SelectItem value="Multi Usuário">Multi Usuário</SelectItem>
              <SelectItem value="Uso Multiplo">Uso Multiplo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Parceiros</Label>
        <div className="border rounded-md p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-2">
          {parceirosOpcoes.map((parceiro) => (
            <div key={parceiro} className="flex items-center space-x-2">
              <Checkbox
                id={`parceiro-${parceiro}`}
                checked={formData.parceiros?.includes(parceiro)}
                onCheckedChange={() => toggleParceiro(parceiro)}
              />
              <label
                htmlFor={`parceiro-${parceiro}`}
                className="text-sm font-medium leading-none cursor-pointer"
              >
                {parceiro}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Disciplinas</Label>
        <div className="border rounded-md p-3 max-h-48 overflow-y-auto grid grid-cols-2 gap-2">
          {disciplinasDisponiveis.map((disciplina) => (
            <div key={disciplina.id} className="flex items-center space-x-2">
              <Checkbox
                id={`disciplina-${disciplina.id}`}
                checked={formData.disciplinas?.includes(disciplina.nome)}
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

      {formData.disciplinas?.length > 0 && (
        <div className="space-y-3">
          <Label>Codisciplinas por Disciplina</Label>
          {disciplinasDisponiveis
            .filter(d => formData.disciplinas?.includes(d.nome))
            .map((disciplina) => (
              <div key={disciplina.id} className="border rounded-md">
                <div className="bg-gray-50 px-3 py-2 border-b">
                  <span className="font-semibold text-sm">{disciplina.nome}</span>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                  {disciplina.codisciplinas?.length === 0 || !disciplina.codisciplinas ? (
                    <p className="text-sm text-gray-500 col-span-2">Nenhuma codisciplina disponível</p>
                  ) : (
                    disciplina.codisciplinas.map((codisciplina, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <Checkbox
                          id={`codisciplina-${disciplina.id}-${idx}`}
                          checked={formData.codisciplinas?.includes(codisciplina)}
                          onCheckedChange={() => toggleCodisciplina(codisciplina)}
                        />
                        <label
                          htmlFor={`codisciplina-${disciplina.id}-${idx}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {codisciplina}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Pavimentos</Label>
          <Button 
            type="button" 
            size="sm" 
            variant="outline"
            onClick={adicionarPavimento}
          >
            <Plus className="w-4 h-4 mr-1" />
            Adicionar Pavimento
          </Button>
        </div>
        
        <div className="space-y-2">
          {formData.pavimentos?.length === 0 || !formData.pavimentos ? (
            <p className="text-sm text-gray-500 border rounded-md p-3 text-center">
              Nenhum pavimento adicionado
            </p>
          ) : (
            formData.pavimentos.map((pav, idx) => (
              <div key={idx} className="border rounded-md p-3 grid grid-cols-4 gap-2 items-end">
                <div className="col-span-2">
                  <Label className="text-xs">Pavimento</Label>
                  <Input
                    placeholder="Ex: Térreo, 1º Andar"
                    value={pav.pavimento}
                    onChange={(e) => atualizarPavimento(idx, 'pavimento', e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Metragem (m²)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={pav.metragem}
                    onChange={(e) => atualizarPavimento(idx, 'metragem', e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs">Repetição</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="1"
                      value={pav.repeticao}
                      onChange={(e) => atualizarPavimento(idx, 'repeticao', e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => removerPavimento(idx)}
                    className="mt-5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}