import React, { useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { isActivityOverdue as isOverdue } from '../utils/DateCalculator';

function ResumoCard({ icon: Icon, title, value, color, unit }) {
    return (
        <Card className={`border-l-4 ${color}`}>
            <CardContent className="p-4 flex items-center gap-4">
                <Icon className="w-8 h-8 text-gray-500" />
                <div>
                    <p className="text-sm text-gray-600">{title}</p>
                    <p className="text-2xl font-bold">
                        {value}
                        {unit && <span className="text-lg font-normal ml-1">{unit}</span>}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

export default function RelatorioResumo({ planejamentos, execucoes = [] }) {
    const resumo = useMemo(() => {
        if (!planejamentos) return { totalAtividades: 0, totalHoras: 0, totalAtrasadas: 0, totalConcluidas: 0 };

        const totalHoras = execucoes.reduce((acc, e) => acc + (Number(e.tempo_total) || 0), 0);
        const totalAtrasadas = planejamentos.filter(p => isOverdue(p)).length;
        const totalConcluidas = planejamentos.filter(p => p.status === 'concluido').length;

        return {
            totalAtividades: planejamentos.length,
            totalHoras: totalHoras.toFixed(1),
            totalAtrasadas,
            totalConcluidas,
        };
    }, [planejamentos, execucoes]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
            <ResumoCard
                icon={Users}
                title="Total de Atividades"
                value={resumo.totalAtividades}
                color="border-blue-500"
            />
            <ResumoCard
                icon={Clock}
                title="Horas Executadas"
                value={resumo.totalHoras}
                unit="h"
                color="border-purple-500"
            />
            <ResumoCard
                icon={AlertTriangle}
                title="Atividades Atrasadas"
                value={resumo.totalAtrasadas}
                color="border-red-500"
            />
            <ResumoCard
                icon={CheckCircle2}
                title="Atividades Concluídas"
                value={resumo.totalConcluidas}
                color="border-green-500"
            />
        </div>
    );
}