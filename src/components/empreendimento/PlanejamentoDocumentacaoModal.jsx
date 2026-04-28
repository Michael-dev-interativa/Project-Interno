
import { useState, useEffect, useMemo } from 'react';
import { PlanejamentoAtividade } from '@/entities/all';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, X } from "lucide-react";
import { format, isValid } from "date-fns";
import { retryWithExtendedBackoff } from '../utils/apiUtils';
import { distribuirHorasPorDias, getNextWorkingDay } from '../utils/DateCalculator';
import { ETAPAS_ORDER } from '../utils/PredecessoraValidator';

export default function PlanejamentoDocumentacaoModal({
  isOpen,
  onClose,
  empreendimentoId,
  atividades: todasAtividades,
  planejamentos: todosPlanejamentos,
  usuarios,
  onSave,
}) {
  const [selectedAtividades, setSelectedAtividades] = useState(new Set());
  const [executorPrincipal, setExecutorPrincipal] = useState('');
  const [metodoCalculo, setMetodoCalculo] = useState('agenda');
  const [dataManual, setDataManual] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { atividadesAgrupadas, planejamentosExistentesMap } = useMemo(() => {
    const planejamentosMap = new Map();
    (todosPlanejamentos || []).forEach(p => {
      if (p.atividade_id) {
        planejamentosMap.set(p.atividade_id, p);
      }
    });

    const grouped = (todasAtividades || []).reduce((acc, ativ) => {
      const etapa = ativ.etapa || 'Sem Etapa';
      if (!acc[etapa]) {
        acc[etapa] = [];
      }
      acc[etapa].push(ativ);
      return acc;
    }, {});

    const sortedGroupKeys = Object.keys(grouped).sort((a, b) => {
      const indexA = ETAPAS_ORDER.indexOf(a);
      const indexB = ETAPAS_ORDER.indexOf(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return {
      atividadesAgrupadas: sortedGroupKeys.map(key => ({
        etapa: key,
        atividades: grouped[key]
      })),
      planejamentosExistentesMap: planejamentosMap,
    };
  }, [todasAtividades, todosPlanejamentos]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedAtividades(new Set());
      setExecutorPrincipal('');
      setMetodoCalculo('agenda');
      setDataManual('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSelectAtividade = (id) => {
    setSelectedAtividades(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectGrupo = (atividadesDoGrupo, marcar) => {
    setSelectedAtividades(prev => {
      const newSet = new Set(prev);
      atividadesDoGrupo.forEach(ativ => {
        if (!planejamentosExistentesMap.has(ativ.id)) {
          if (marcar) {
            newSet.add(ativ.id);
          } else {
            newSet.delete(ativ.id);
          }
        }
      });
      return newSet;
    });
  };

  const handleSelectTodasNaoPlanejadas = () => {
    const newSet = new Set();
    atividadesAgrupadas.forEach(grupo => {
      grupo.atividades.forEach(ativ => {
        if (!planejamentosExistentesMap.has(ativ.id)) {
          newSet.add(ativ.id);
        }
      });
    });
    setSelectedAtividades(newSet);
  };

  const handleLimparSelecao = () => setSelectedAtividades(new Set());

  const handleSubmit = async () => {
    if (!executorPrincipal) {
      alert("Selecione um Executor Principal.");
      return;
    }
    if (selectedAtividades.size === 0) {
      alert("Selecione pelo menos uma atividade.");
      return;
    }
    if (metodoCalculo === 'manual' && (!dataManual || !isValid(new Date(dataManual)))) {
      alert("Selecione uma data de início válida.");
      return;
    }
    
    setIsSubmitting(true);

    try {

      const atividadesParaPlanejar = todasAtividades
        .filter(ativ => selectedAtividades.has(ativ.id))
        .sort((a, b) => {
          const indexA = ETAPAS_ORDER.indexOf(a.etapa);
          const indexB = ETAPAS_ORDER.indexOf(b.etapa);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        });

      const agendaExecutor = await retryWithExtendedBackoff(() => 
        PlanejamentoAtividade.filter({ executor_principal: executorPrincipal }), `getAgenda-${executorPrincipal}`
      );
      
      // Initialize `cargaDiariaAtual` (formerly `cargaDiaria`) for explicit accumulation
      let cargaDiariaAtual = {};
      agendaExecutor.forEach(planejamento => {
        if (planejamento.horas_por_dia && typeof planejamento.horas_por_dia === 'object') {
          Object.entries(planejamento.horas_por_dia).forEach(([data, horas]) => {
            const horasNum = Number(horas) || 0;
            if (horasNum > 0) {
              cargaDiariaAtual[data] = (cargaDiariaAtual[data] || 0) + horasNum;
            }
          });
        }
      });

      let dataInicioSequencia;
      if (metodoCalculo === 'manual') {
        dataInicioSequencia = new Date(`${dataManual}T00:00:00`);
      } else {
        const datasComCarga = Object.keys(cargaDiariaAtual)
          .filter(data => cargaDiariaAtual[data] > 0)
          .map(data => new Date(`${data}T00:00:00`))
          .sort((a, b) => b.getTime() - a.getTime());

        if (datasComCarga.length > 0) {
          const ultimaDataComCarga = datasComCarga[0];
          dataInicioSequencia = ultimaDataComCarga;
        } else {
          dataInicioSequencia = new Date();
        }
      }
      
      const hoje = new Date();
      const hojeFormatado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      if (dataInicioSequencia < hojeFormatado) {
        dataInicioSequencia = hojeFormatado;
      }
      dataInicioSequencia = getNextWorkingDay(dataInicioSequencia); // Ensure start on a working day


      const novosPlanejamentos = [];

      for (const atividade of atividadesParaPlanejar) {
        const horasAtividadeOriginal = Number(atividade.tempo) || 0;

        if (horasAtividadeOriginal <= 0) {
          continue;
        }


        // CRITICAL: Call `distribuirHorasPorDias` with the current accumulated load
        // and explicitly pass `false` for `considerWorkingDaysOnly` as per outline.
        // It's assumed that `distribuirHorasPorDias` returns the distribution without mutating `cargaDiariaAtual`
        const resultado = distribuirHorasPorDias(
          dataInicioSequencia,
          horasAtividadeOriginal,
          8, // Assuming a daily capacity of 8 hours
          cargaDiariaAtual, // Pass the current accumulated load
          false // Explicitly setting considerWorkingDaysOnly to false
        );
        
        if (!resultado || !resultado.distribuicao || Object.keys(resultado.distribuicao).length === 0) {
          console.error(`❌ Falha na distribuição da atividade: ${atividade.atividade}`);
          continue;
        }

        const { distribuicao, dataTermino } = resultado;


        // CRITICAL: Update the accumulated `cargaDiariaAtual` with the hours distributed for the current activity.
        // This ensures subsequent activities are planned against an up-to-date schedule.
        for (const [date, hours] of Object.entries(distribuicao)) {
          cargaDiariaAtual[date] = (cargaDiariaAtual[date] || 0) + hours;
        }

        const planejamento = {
          atividade_id: atividade.id,
          empreendimento_id: empreendimentoId,
          etapa: atividade.etapa,
          descritivo: atividade.atividade,
          executores: [executorPrincipal],
          executor_principal: executorPrincipal,
          tempo_planejado: horasAtividadeOriginal,
          horas_por_dia: distribuicao,
          inicio_planejado: Object.keys(distribuicao).sort()[0],
          termino_planejado: format(dataTermino, 'yyyy-MM-dd'),
          status: 'nao_iniciado',
          prioridade: 1
        };

        novosPlanejamentos.push(planejamento);
        
        // The next activity will start from the next working day after the current one's completion.
        dataInicioSequencia = getNextWorkingDay(dataTermino);
      }
      
      if (novosPlanejamentos.length === 0) {
        throw new Error('Nenhum planejamento foi gerado. Verifique as atividades selecionadas.');
      }

      
      for (const planejamento of novosPlanejamentos) {
        await retryWithExtendedBackoff(() => PlanejamentoAtividade.create(planejamento), `createPlanejamento-${planejamento.atividade_id}`);
      }


      const totalHorasPlanejadas = novosPlanejamentos.reduce((total, p) => total + p.tempo_planejado, 0);
      alert(`✅ ${novosPlanejamentos.length} atividades de documentação planejadas!\n\nTotal de horas: ${totalHorasPlanejadas.toFixed(1)}h`);
      
      onSave();
      onClose();

    } catch (error) {
      console.error("❌ Erro ao planejar atividades de documentação:", error);
      alert(`Erro ao planejar atividades: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalHorasSelecionadas = useMemo(() => {
    let total = 0;
    selectedAtividades.forEach(id => {
      const ativ = todasAtividades.find(a => a.id === id);
      if (ativ) total += ativ.tempo || 0;
    });
    return total;
  }, [selectedAtividades, todasAtividades]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Planejar Atividades de Documentação</DialogTitle>
          <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold flex items-center gap-2"><Users className="w-4 h-4"/> Ações em Massa</Label>
                <Select value={executorPrincipal} onValueChange={setExecutorPrincipal}>
                  <SelectTrigger><SelectValue placeholder="Selecione um executor principal" /></SelectTrigger>
                  <SelectContent>
                    {usuarios.map(u => <SelectItem key={u.id} value={u.email}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <Label className="font-semibold">Método de Cálculo da Data de Início</Label>
                <RadioGroup value={metodoCalculo} onValueChange={setMetodoCalculo} className="mt-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="agenda" id="r_agenda" />
                    <Label htmlFor="r_agenda">Agenda do Executor (prioriza preenchimento de agenda)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="r_manual" />
                    <Label htmlFor="r_manual">Data Manual</Label>
                  </div>
                </RadioGroup>
                {metodoCalculo === 'manual' && (
                  <Input type="date" value={dataManual} onChange={e => setDataManual(e.target.value)} className="mt-2" />
                )}
              </div>
              <div className="flex justify-between items-center text-sm">
                <span>Selecionadas: {selectedAtividades.size} atividades ({totalHorasSelecionadas.toFixed(1)}h)</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectTodasNaoPlanejadas}>Todas Não Planejadas</Button>
                  <Button variant="outline" size="sm" onClick={handleLimparSelecao}>Limpar</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {atividadesAgrupadas.map(({ etapa, atividades }) => (
            <div key={etapa}>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">{etapa} ({atividades.length} atividades)</h3>
                <Button variant="link" size="sm" onClick={() => handleSelectGrupo(atividades, false)}>Desmarcar Todas</Button>
              </div>
              <div className="space-y-2">
                {atividades.map(ativ => {
                  const isPlanejada = planejamentosExistentesMap.has(ativ.id);
                  return (
                    <Card key={ativ.id} className={`p-3 ${isPlanejada ? 'bg-gray-100' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={selectedAtividades.has(ativ.id)}
                            onCheckedChange={() => handleSelectAtividade(ativ.id)}
                            disabled={isPlanejada}
                          />
                          <div>
                            <p className="font-medium">{ativ.atividade}</p>
                            <span className="text-sm text-blue-600 font-semibold">{ativ.tempo.toFixed(1)}h</span>
                          </div>
                        </div>
                        <Badge variant={isPlanejada ? 'secondary' : 'outline'} className={isPlanejada ? '' : 'text-blue-600 border-blue-600'}>
                          {isPlanejada ? 'Planejada' : 'Disponível'}
                        </Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
            Atribuir Executor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
