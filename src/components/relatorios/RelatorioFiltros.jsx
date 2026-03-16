import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { format } from 'date-fns';
import { ptBR } from "date-fns/locale";

export default function RelatorioFiltros({ filters, onFilterChange, empreendimentos, usuarios }) {
    const handleDateChange = (field, value) => {
        onFilterChange({ ...filters, [field]: value });
    };

    const handleSelectChange = (field, value) => {
        onFilterChange({ ...filters, [field]: value });
    };

    const statusOptions = [
        { value: 'all', label: 'Todos os Status' },
        { value: 'nao_iniciado', label: 'Não Iniciado' },
        { value: 'em_andamento', label: 'Em Andamento' },
        { value: 'concluido', label: 'Concluído' },
        { value: 'pausado', label: 'Pausado' },
        { value: 'atrasado', label: 'Atrasado' },
    ];

    // **NOVO**: Ordenar usuários por nome
    const usuariosOrdenados = useMemo(() => {
        return [...usuarios].sort((a, b) => {
            const nomeA = a.full_name || a.nome || a.email || '';
            const nomeB = b.full_name || b.nome || b.email || '';
            return nomeA.localeCompare(nomeB, 'pt-BR', { sensitivity: 'base' });
        });
    }, [usuarios]);

    return (
        <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-100 rounded-lg">
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant={"outline"}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dataInicio ? format(filters.dataInicio, "PPP", { locale: ptBR }) : <span>Data de Início</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={filters.dataInicio}
                        onSelect={(date) => handleDateChange('dataInicio', date)}
                        initialFocus
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant={"outline"}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dataFim ? format(filters.dataFim, "PPP", { locale: ptBR }) : <span>Data de Fim</span>}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={filters.dataFim}
                        onSelect={(date) => handleDateChange('dataFim', date)}
                        initialFocus
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>

            <Select value={filters.usuario} onValueChange={(value) => handleSelectChange('usuario', value)}>
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por usuário" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Usuários</SelectItem>
                    {usuariosOrdenados.map(user => (
                        <SelectItem key={user.id} value={user.email}>{user.full_name || user.nome || user.email}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={filters.empreendimento} onValueChange={(value) => handleSelectChange('empreendimento', value)}>
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por empreendimento" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os Empreendimentos</SelectItem>
                    {empreendimentos.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>{emp.nome}</SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(value) => handleSelectChange('status', value)}>
                <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                    {statusOptions.map(option => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}