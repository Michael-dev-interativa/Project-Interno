import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Usuario, PlanejamentoAtividade } from '@/entities/all';
import { distribuirHorasPorDias } from '../utils/DateCalculator';
import { format, addDays } from 'date-fns';
import { retryWithBackoff } from '../utils/apiUtils';

export default function AplicarAtividadeModal({ isOpen, onClose, empreendimentoId, onApply, atividadesDisponiveis }) {
    const [atividadesSelecionadas, setAtividadesSelecionadas] = useState([]);
    const [executorEmail, setExecutorEmail] = useState('');
    const [usuarios, setUsuarios] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchUsuarios = async () => {
            const users = await Usuario.list();
            setUsuarios(users.filter(u => u.status === 'ativo').sort((a, b) => (a.nome || '').localeCompare(b.nome || '')));
        };
        if (isOpen) {
            fetchUsuarios();
            setAtividadesSelecionadas([]);
            setExecutorEmail('');
        }
    }, [isOpen]);

    const handleConfirm = async () => {
        if (!executorEmail || atividadesSelecionadas.length === 0) {
            alert('Por favor, selecione as atividades e um executor.');
            return;
        }

        setIsSubmitting(true);
        try {

            // 1. Buscar a carga de trabalho existente do executor
            const planejamentosExistentes = await retryWithBackoff(() => PlanejamentoAtividade.filter({ executor_principal: executorEmail }), 3, 1000);
            const cargaDiaria = {};
            planejamentosExistentes.forEach(p => {
                if (p.horas_por_dia && typeof p.horas_por_dia === 'object') {
                    for (const [date, hours] of Object.entries(p.horas_por_dia)) {
                        cargaDiaria[date] = (cargaDiaria[date] || 0) + parseFloat(hours);
                    }
                }
            });

            // 2. Preparar os novos planejamentos sequencialmente
            const novosPlanejamentos = [];
            let dataReferencia = new Date(); // Inicia a partir de hoje

            const atividadesParaPlanejar = atividadesDisponiveis.filter(a => atividadesSelecionadas.includes(a.id));

            for (const atividade of atividadesParaPlanejar) {
                const tempoTotal = parseFloat(atividade.tempo) || 0;
                if (tempoTotal <= 0) continue;

                // A função distribuirHorasPorDias MUTATES o objeto cargaDiaria,
                // então a cada chamada ela já considera as horas alocadas anteriormente no loop.
                const { distribuicao, dataTermino } = distribuirHorasPorDias(
                    dataReferencia,
                    tempoTotal,
                    8, // Limite diário de 8 horas
                    cargaDiaria, // Passa o objeto de carga que será atualizado a cada iteração
                    false // Não respeitar data manual, encontrar a próxima vaga
                );

                const inicioPlanejado = Object.keys(distribuicao).sort()[0];

                if (!inicioPlanejado) {
                    continue;
                }

                novosPlanejamentos.push({
                    empreendimento_id: empreendimentoId,
                    atividade_id: atividade.id,
                    descritivo: String(atividade.atividade || ''),
                    etapa: atividade.etapa,
                    tempo_planejado: tempoTotal,
                    executor_principal: executorEmail,
                    status: 'nao_iniciado',
                    horas_por_dia: distribuicao,
                    inicio_planejado: inicioPlanejado,
                    termino_planejado: format(dataTermino, 'yyyy-MM-dd'),
                });

                // A próxima atividade começará a ser procurada a partir do dia seguinte ao término da atual.
                dataReferencia = addDays(dataTermino, 1);
            }
            

            // 3. Criar todos os novos planejamentos em lote
            if (novosPlanejamentos.length > 0) {
                await retryWithBackoff(() => PlanejamentoAtividade.bulkCreate(novosPlanejamentos), 3, 2000);
            }

            onApply();
            onClose();

        } catch (error) {
            console.error("Erro ao aplicar atividades:", error);
            alert("Ocorreu um erro ao criar os planejamentos. Verifique o console para mais detalhes.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSelectAtividade = (id) => {
        setAtividadesSelecionadas(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    if (!isOpen) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Aplicar Atividades ao Projeto</DialogTitle>
                </DialogHeader>
                <div className="py-4 space-y-6">
                    <div className="space-y-2">
                        <Label>Selecione as Atividades</Label>
                        <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1">
                            {atividadesDisponiveis.map(atividade => (
                                <div
                                    key={atividade.id}
                                    onClick={() => handleSelectAtividade(atividade.id)}
                                    className={`p-2 rounded-md cursor-pointer flex justify-between items-center ${
                                        atividadesSelecionadas.includes(atividade.id)
                                            ? 'bg-blue-100 border-blue-300'
                                            : 'hover:bg-gray-100'
                                    }`}
                                >
                                    <span>{atividade.etapa} - {String(atividade.atividade || '')}</span>
                                    <span className="text-sm font-mono text-gray-600">{atividade.tempo}h</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="executor-select">Selecione o Executor</Label>
                        <Select value={executorEmail} onValueChange={setExecutorEmail}>
                            <SelectTrigger id="executor-select">
                                <SelectValue placeholder="Escolha um executor..." />
                            </SelectTrigger>
                            <SelectContent>
                                {usuarios.map(user => (
                                    <SelectItem key={user.id} value={user.email}>
                                        {user.nome || user.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={isSubmitting || !executorEmail || atividadesSelecionadas.length === 0}>
                        {isSubmitting ? 'Aplicando...' : 'Aplicar Atividades'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}