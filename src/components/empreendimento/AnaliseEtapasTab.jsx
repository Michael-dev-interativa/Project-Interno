import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function AnaliseEtapasTab({ planejamentos = [] }) {

    const dadosEtapas = useMemo(() => {
        const etapas = {};

        // Processar todos os planejamentos
        (planejamentos || []).forEach(planejamento => {
            if (!etapas[planejamento.etapa]) {
                etapas[planejamento.etapa] = {
                    tempoPrevisto: 0,
                    tempoExecutado: 0,
                    documentos: new Set()
                };
            }

            etapas[planejamento.etapa].tempoPrevisto += (planejamento.tempo_planejado || 0);
            etapas[planejamento.etapa].tempoExecutado += (planejamento.tempo_executado || 0);

            // Adicionar à contagem de documentos apenas se houver um ID de documento
            if (planejamento.documento_id) {
                etapas[planejamento.etapa].documentos.add(planejamento.documento_id);
            }
        });

        // Ordenar e formatar
        return Object.entries(etapas)
            .map(([nome, dados]) => ({
                nome,
                ...dados,
                documentosContagem: dados.documentos.size,
                progresso: dados.tempoPrevisto > 0 ? (dados.tempoExecutado / dados.tempoPrevisto) * 100 : 0
            }))
            .sort((a, b) => a.nome.localeCompare(b.nome));

    }, [planejamentos]);
    
    const formatarTempo = (horas) => `${(horas || 0).toFixed(1)}h`;

    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-green-600" />
                    Análise por Etapas do Projeto
                </CardTitle>
                <p className="text-gray-500 text-sm">
                    Resumo do progresso e tempo investido em cada etapa do empreendimento.
                </p>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Etapa</TableHead>
                            <TableHead>Documentos Envolvidos</TableHead>
                            <TableHead>Tempo Previsto</TableHead>
                            <TableHead>Tempo Executado</TableHead>
                            <TableHead className="w-[200px]">Progresso</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {dadosEtapas.map(etapa => (
                            <TableRow key={etapa.nome}>
                                <TableCell className="font-medium">{etapa.nome}</TableCell>
                                <TableCell>
                                  {etapa.nome === 'Concepção' || etapa.nome === 'Planejamento' 
                                    ? <span className="text-gray-500">N/A</span> 
                                    : etapa.documentosContagem}
                                </TableCell>
                                <TableCell>{formatarTempo(etapa.tempoPrevisto)}</TableCell>
                                <TableCell>{formatarTempo(etapa.tempoExecutado)}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Progress value={etapa.progresso > 100 ? 100 : etapa.progresso} />
                                        <span>{Math.round(etapa.progresso)}%</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                         {dadosEtapas.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-gray-500 py-6">
                                    Nenhum dado de etapa para analisar.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}