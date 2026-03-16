import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function RelatorioCargaHoraria({ execucoes, usuarios }) {

    const toHoursNumber = (value) => {
        if (value === null || value === undefined || value === '') return 0;
        const normalized = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
        return Number.isFinite(normalized) ? normalized : 0;
    };

    const dataAgrupada = useMemo(() => {
        if (!execucoes || execucoes.length === 0) return [];

        const usuariosMap = usuarios.reduce((acc, u) => ({ ...acc, [u.email]: u.full_name || u.nome }), {});

        const grouped = execucoes.reduce((acc, exec) => {
            const dataKey = format(parseISO(exec.inicio), 'yyyy-MM-dd');
            const userKey = exec.usuario;
            const groupKey = `${userKey}-${dataKey}`;

            if (!acc[groupKey]) {
                acc[groupKey] = {
                    usuarioEmail: userKey,
                    usuarioNome: usuariosMap[userKey] || userKey,
                    data: dataKey,
                    horasTrabalhadas: 0,
                };
            }
            acc[groupKey].horasTrabalhadas += toHoursNumber(exec.tempo_total);
            return acc;
        }, {});

        // Converte para array e ordena por data (mais recente primeiro) e depois por nome de usuário
        return Object.values(grouped).sort((a, b) => {
            if (a.data > b.data) return -1;
            if (a.data < b.data) return 1;
            if (a.usuarioNome > b.usuarioNome) return 1;
            if (a.usuarioNome < b.usuarioNome) return -1;
            return 0;
        });

    }, [execucoes, usuarios]);

    const formatDataDisplay = (dateString) => {
        return format(parseISO(dateString), "dd/MM/yyyy ' ('EEEE')'", { locale: ptBR });
    };

    const metaDiaria = 8.0;

    if (!execucoes || execucoes.length === 0) {
        return (
            <div className="text-center py-10 text-gray-500">
                <p>Nenhuma execução encontrada com os filtros selecionados.</p>
            </div>
        );
    }

    return (
        <div className="border rounded-lg overflow-hidden">
            <Table>
                <TableHeader className="bg-gray-50">
                    <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-center">Horas Trabalhadas</TableHead>
                        <TableHead className="text-center">Meta</TableHead>
                        <TableHead className="text-center">Saldo</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {dataAgrupada.map((item, index) => {
                        const horasTrabalhadas = toHoursNumber(item.horasTrabalhadas);
                        const saldo = horasTrabalhadas - metaDiaria;
                        const saldoAbs = Math.abs(saldo);
                        const horas = Math.floor(saldoAbs);
                        const minutos = Math.round((saldoAbs - horas) * 60);

                        let saldoFormatado = `${saldo > 0 ? '+' : '-'}${horas.toString().padStart(2, '0')}h${minutos.toString().padStart(2, '0')}m`;
                        if (horasTrabalhadas.toFixed(1) === metaDiaria.toFixed(1)) {
                            saldoFormatado = 'OK';
                        }

                        return (
                            <TableRow key={index}>
                                <TableCell className="font-medium">{item.usuarioNome}</TableCell>
                                <TableCell>{formatDataDisplay(item.data)}</TableCell>
                                <TableCell className="text-center font-bold text-lg text-blue-600">
                                    {horasTrabalhadas.toFixed(1)}h
                                </TableCell>
                                <TableCell className="text-center text-gray-500">
                                    {metaDiaria.toFixed(1)}h
                                </TableCell>
                                <TableCell className="text-center">
                                    <Badge
                                        variant={saldo >= 0 ? "default" : "destructive"}
                                        className={`font-semibold ${saldo >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                                    >
                                        {saldoFormatado}
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}