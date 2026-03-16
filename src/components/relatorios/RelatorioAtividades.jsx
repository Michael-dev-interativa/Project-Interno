import React, { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { isActivityOverdue as isOverdue } from '../utils/DateCalculator';

export default function RelatorioAtividades({ planejamentos, execucoes = [] }) {

    const toHoursNumber = (value) => {
        if (value === null || value === undefined || value === '') return 0;
        const normalized = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
        return Number.isFinite(normalized) ? normalized : 0;
    };

    const getStatusInfo = (plano) => {
        const isAtrasado = !plano.isQuickActivity && isOverdue(plano);
        if (isAtrasado) {
            return { text: "Atrasado", color: "bg-red-100 text-red-800" };
        }

        const status = plano.isQuickActivity ? (plano.status === 'concluido' ? 'concluido' : 'em_andamento') : plano.status;

        switch (status) {
            case 'concluido':
                return { text: "Concluído", color: "bg-green-100 text-green-800" };
            case 'em_andamento':
                return { text: "Em Andamento", color: "bg-blue-100 text-blue-800" };
            case 'pausado':
                return { text: "Pausado", color: "bg-yellow-100 text-yellow-800" };
            case 'nao_iniciado':
            default:
                return { text: "Não Iniciado", color: "bg-gray-100 text-gray-800" };
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        try {
            return format(parseISO(`${dateString.split('T')[0]}T00:00:00`), 'dd/MM/yyyy');
        } catch {
            return "Data inválida";
        }
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return "N/A";
        try {
            return format(parseISO(dateString), 'dd/MM/yyyy HH:mm');
        } catch {
            return "Data inválida";
        }
    };

    // Agrupa execuções por planejamento para exibir múltiplas linhas
    const detailedRows = useMemo(() => {
        const rows = [];

        planejamentos.forEach(plano => {
            const execsDoPlano = execucoes.filter(e => e.planejamento_id === plano.id);

            if (execsDoPlano.length > 0) {
                // Para cada execução, cria uma linha
                execsDoPlano.forEach((exec, index) => {
                    rows.push({
                        ...plano,
                        execucao: exec,
                        isMultiple: execsDoPlano.length > 1,
                        execNumber: index + 1,
                        totalExecs: execsDoPlano.length,
                        isFirstExec: index === 0
                    });
                });
            } else {
                // Se não tem execução, mostra apenas o planejamento
                rows.push({
                    ...plano,
                    execucao: null,
                    isMultiple: false,
                    isFirstExec: true
                });
            }
        });

        // Ordenar por data/hora de início
        rows.sort((a, b) => {
            const dataA = a.execucao?.inicio || a.inicio_planejado;
            const dataB = b.execucao?.inicio || b.inicio_planejado;

            if (!dataA) return 1;
            if (!dataB) return -1;

            return new Date(dataA) - new Date(dataB);
        });

        return rows;
    }, [planejamentos, execucoes]);

    if (!planejamentos || planejamentos.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500">
                <p>Nenhuma atividade encontrada com os filtros selecionados.</p>
            </div>
        );
    }

    return (
        <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader className="bg-gray-50">
                        <TableRow>
                            <TableHead className="min-w-[120px]">Usuário</TableHead>
                            <TableHead className="min-w-[150px]">Empreendimento</TableHead>
                            <TableHead className="min-w-[200px]">Documento/Atividades</TableHead>
                            <TableHead className="min-w-[130px]">Horário Início</TableHead>
                            <TableHead className="min-w-[130px]">Horário Fim</TableHead>
                            <TableHead className="min-w-[100px]">Ação</TableHead>
                            <TableHead className="text-center min-w-[100px]">Tempo Gasto</TableHead>
                            <TableHead className="text-center min-w-[120px]">Status Atual</TableHead>
                            <TableHead className="text-center min-w-[100px]">Tempo Total</TableHead>
                            <TableHead className="min-w-[200px]">Observação</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {detailedRows.map((row, idx) => {
                            const statusInfo = getStatusInfo(row);
                            const exec = row.execucao;

                            return (
                                <TableRow key={`${row.id}-${idx}`} className={exec ? 'bg-blue-50/30' : ''}>
                                    {/* Usuário */}
                                    <TableCell className="font-medium">
                                        {row.executor?.full_name || row.executor?.nome || row.executor_principal || 'N/A'}
                                    </TableCell>

                                    {/* Empreendimento */}
                                    <TableCell>{row.empreendimento?.nome || 'N/A'}</TableCell>

                                    {/* Documento/Atividades */}
                                    <TableCell>
                                        <div className="space-y-1">
                                            <div className="font-medium text-sm">
                                                {row.descritivo || row.atividade?.atividade || 'N/A'}
                                            </div>
                                            {row.documento?.numero && (
                                                <div className="text-xs text-gray-500">
                                                    Folha: {row.documento.numero}
                                                </div>
                                            )}
                                            {row.isQuickActivity && (
                                                <Badge variant="outline" className="text-xs">Rápida</Badge>
                                            )}
                                            {row.isMultiple && (
                                                <div className="text-xs text-blue-600 font-medium">
                                                    Execução {row.execNumber}/{row.totalExecs}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Horário Início */}
                                    <TableCell>
                                        {exec ? formatDateTime(exec.inicio) : formatDate(row.inicio_real)}
                                    </TableCell>

                                    {/* Horário Fim */}
                                    <TableCell>
                                        {exec
                                            ? (exec.termino ? formatDateTime(exec.termino) : 'Em andamento')
                                            : (row.termino_real ? formatDate(row.termino_real) : 'N/A')}
                                    </TableCell>

                                    {/* Ação */}
                                    <TableCell>
                                        {exec ? (
                                            <Badge variant="outline" className="text-xs">
                                                {exec.status === 'Finalizado' ? 'Finalizado' :
                                                    exec.status === 'Em andamento' ? 'Em Progresso' :
                                                        exec.status === 'Paralisado' ? 'Pausado' : exec.status}
                                            </Badge>
                                        ) : (
                                            <span className="text-gray-400 text-sm">-</span>
                                        )}
                                    </TableCell>

                                    {/* Tempo Gasto (da execução) */}
                                    <TableCell className="text-center font-mono">
                                        {exec ? `${toHoursNumber(exec.tempo_total).toFixed(1)}h` : '-'}
                                    </TableCell>

                                    {/* Status Atual */}
                                    <TableCell className="text-center">
                                        {exec ? (
                                            <Badge className={
                                                exec.status === 'Finalizado' ? 'bg-green-100 text-green-800' :
                                                    exec.status === 'Em andamento' ? 'bg-blue-100 text-blue-800' :
                                                        exec.status === 'Paralisado' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-gray-100 text-gray-800'
                                            }>
                                                {exec.status === 'Finalizado' ? 'Concluído' :
                                                    exec.status === 'Em andamento' ? 'Em Andamento' :
                                                        exec.status === 'Paralisado' ? 'Pausado' : exec.status}
                                            </Badge>
                                        ) : (
                                            <Badge className={statusInfo.color}>{statusInfo.text}</Badge>
                                        )}
                                    </TableCell>

                                    {/* Tempo Total (acumulado do planejamento) */}
                                    <TableCell className="text-center font-mono font-semibold">
                                        {row.isFirstExec ? `${toHoursNumber(row.tempo_executado).toFixed(1)}h` : '-'}
                                    </TableCell>

                                    {/* Observação */}
                                    <TableCell className="text-sm text-gray-600 max-w-[200px] truncate" title={exec?.observacao || row.observacao || ''}>
                                        {exec?.observacao || row.observacao || '-'}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}