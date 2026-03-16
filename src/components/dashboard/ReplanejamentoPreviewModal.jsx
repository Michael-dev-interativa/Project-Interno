import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { format, parseISO } from 'date-fns';
import { RefreshCw } from 'lucide-react';

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
        return format(date, 'dd/MM/yy');
    } catch {
        return 'Inválido';
    }
};

export default function ReplanejamentoPreviewModal({ isOpen, onClose, proposedChanges, onConfirm, isLoading }) {
    const totalAtividades = proposedChanges.length;

    // NOVO: Calcular total de horas
    const totalHoras = useMemo(() => {
        return proposedChanges.reduce((acc, change) => acc + (change.tempo_planejado || 0), 0);
    }, [proposedChanges]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Pré-visualização do Replanejamento</DialogTitle>
                    <DialogDescription>
                        Revise as mudanças propostas. As atividades atrasadas e futuras serão reorganizadas em cascata. O planejamento original será mantido.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="my-4">
                    {/* MODIFICADO: Mensagem de resumo com total de horas */}
                    <p className="text-center text-gray-700 bg-gray-100 p-2 rounded-md font-medium">
                        <strong>{totalAtividades} atividades</strong> ({totalHoras.toFixed(1)}h) serão reagendadas.
                    </p>
                </div>

                <div className="flex-1 overflow-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Atividade</th>
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Executor</th>
                                {/* NOVA COLUNA */}
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horas</th>
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Início Original</th>
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Término Original</th>
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Novo Início</th>
                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Novo Término</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {proposedChanges.map((change) => (
                                <tr key={change.id}>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-800">{change.descritivo}</td>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">{change.executor_principal}</td>
                                    {/* NOVA CÉLULA */}
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                                        {change.tempo_planejado ? `${change.tempo_planejado.toFixed(1)}h` : 'N/A'}
                                    </td>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(change.inicio_planejado)}</td>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(change.termino_planejado)}</td>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-green-600 bg-green-50 font-semibold">{formatDate(change.novo_inicio)}</td>
                                    <td className="px-3 py-4 whitespace-nowrap text-sm text-green-600 bg-green-50 font-semibold">{formatDate(change.novo_termino)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={onConfirm} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                        {isLoading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar e Aplicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}