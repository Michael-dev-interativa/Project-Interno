// @ts-nocheck
import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default function AtividadesProjetoFilters({
  searchTerm,
  onSearchChange,
  etapaFilter,
  onEtapaChange,
  disciplinaFilter,
  onDisciplinaChange,
  subdisciplinaFilter,
  onSubdisciplinaChange,
  disciplinas = [],
  atividades = [],
  onClearFilters
}) {
  const etapas = ['Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra', 'Concepção', 'Planejamento'];

  // Get unique subdisciplinas based on selected disciplina
  const subdisciplinasDisponiveis = React.useMemo(() => {
    if (!disciplinaFilter) return [];
    const subdisciplinas = new Set(
      (atividades || [])
        .filter(a => a.disciplina === disciplinaFilter && a.subdisciplina)
        .map(a => a.subdisciplina)
    );
    return Array.from(subdisciplinas).sort();
  }, [disciplinaFilter, atividades]);

  const hasActiveFilters = searchTerm || etapaFilter || disciplinaFilter || subdisciplinaFilter;

  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">Filtros Avançados</h3>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="text-xs h-7 px-2 py-1 rounded hover:bg-gray-200"
          >
            <X className="w-3 h-3 mr-1 inline" />
            Limpar filtros
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Busca por Nome */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Nome da Atividade</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 text-sm rounded border border-gray-300 px-2"
            placeholder="Digite o nome"
          />
        </div>

        {/* Filtro Etapa */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Etapa</label>
          <Select value={etapaFilter} onValueChange={onEtapaChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todas as etapas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas as etapas</SelectItem>
              {etapas.map(etapa => (
                <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro Disciplina */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Disciplina</label>
          <Select value={disciplinaFilter} onValueChange={onDisciplinaChange}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Todas as disciplinas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas as disciplinas</SelectItem>
              {(disciplinas || []).map(d => (
                <SelectItem key={d.id} value={d.nome}>{d.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Filtro Subdisciplina */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Subdisciplina</label>
          <Select value={subdisciplinaFilter} onValueChange={onSubdisciplinaChange}>
            <SelectTrigger className="h-8 text-sm" disabled={!disciplinaFilter}>
              <SelectValue placeholder={disciplinaFilter ? "Todas as subdisciplinas" : "Selecione disciplina"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>Todas as subdisciplinas</SelectItem>
              {subdisciplinasDisponiveis.map(sub => (
                <SelectItem key={sub} value={sub}>{sub}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="text-xs text-gray-600 pt-2 border-t">
          Filtros ativos: {[
            searchTerm && `Nome: "${searchTerm}"`,
            etapaFilter && `Etapa: ${etapaFilter}`,
            disciplinaFilter && `Disciplina: ${disciplinaFilter}`,
            subdisciplinaFilter && `Subdisciplina: ${subdisciplinaFilter}`
          ].filter(Boolean).join(' • ')}
        </div>
      )}
    </div>
  );
}