import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const statusOptions = [
  { value: 'todos', label: 'Todos os Status' },
  { value: 'ativo', label: 'Ativo' },
  { value: 'em_planejamento', label: 'Em Planejamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'pausado', label: 'Pausado' }
];

const statusColors = {
  ativo: 'bg-green-100 text-green-800',
  em_planejamento: 'bg-yellow-100 text-yellow-800',
  concluido: 'bg-blue-100 text-blue-800',
  pausado: 'bg-gray-100 text-gray-800'
};

export default function EmpreendimentoFilters({ 
  filters, 
  onFiltersChange, 
  totalCount, 
  filteredCount 
}) {
  const hasActiveFilters = filters.search || filters.status !== 'todos';
  const isFiltered = filteredCount !== totalCount;

  const clearFilters = () => {
    onFiltersChange({
      status: 'todos',
      search: ''
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
        {/* Busca */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar empreendimentos..."
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="pl-10"
          />
        </div>

        {/* Status */}
        <div className="w-full md:w-48">
          <Select 
            value={filters.status} 
            onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button variant="ghost" onClick={clearFilters} size="sm">
            <X className="w-4 h-4 mr-1" />
            Limpar
          </Button>
        )}
      </div>

      {/* Results Info */}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600">
            {isFiltered ? (
              <>
                Mostrando <strong>{filteredCount}</strong> de <strong>{totalCount}</strong> empreendimentos
              </>
            ) : (
              <>
                Total: <strong>{totalCount}</strong> empreendimentos
              </>
            )}
          </span>
        </div>

        {/* Active Filters */}
        {filters.search && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Search className="w-3 h-3" />
            "{filters.search}"
            <button 
              onClick={() => onFiltersChange({ ...filters, search: '' })}
              className="ml-1 hover:text-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        )}

        {filters.status !== 'todos' && (
          <Badge 
            className={`flex items-center gap-1 ${statusColors[filters.status] || 'bg-gray-100 text-gray-800'}`}
          >
            Status: {statusOptions.find(opt => opt.value === filters.status)?.label}
            <button 
              onClick={() => onFiltersChange({ ...filters, status: 'todos' })}
              className="ml-1 hover:text-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        )}
      </div>
    </div>
  );
}