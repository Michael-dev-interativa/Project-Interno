
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input"; // New import for priority input
import { Users, X, Link } from "lucide-react"; // Added Link icon for predecessor
import { format } from "date-fns";

// New imports for DateCalculator functions
import { calcularDataInicioPorPredecessora, distribuirHorasPorDias, getNextWorkingDay } from '../utils/DateCalculator';

export default function PlanejamentoForm({
  isOpen,
  onClose,
  documento, // The document object to plan activities for
  empreendimentoId,
  usuarios, // All available users
  planejamentos, // All existing planejamentos for calculating daily loads
  predecessorDocuments = [], // List of documents that can be predecessors
  onSave // Callback after successful planning
}) {
  // State variables for the new planning logic
  const [executor, setExecutor] = useState(""); // For single executor mode
  const [executores, setExecutores] = useState([]); // For multiple executors mode
  const [multiplosExecutores, setMultiplosExecutores] = useState(false); // Toggle for executor mode
  const [dataInicio, setDataInicio] = useState(new Date()); // User-selected start date (if not using predecessor)
  const [usarPredecessora, setUsarPredecessora] = useState(false);
  const [documentoPredecessor, setDocumentoPredecessor] = useState(""); // ID of the selected predecessor document
  const [prioridade, setPrioridade] = useState(1); // Default priority
  const [isSubmitting, setIsSubmitting] = useState(false);

  // executorPrincipal state is still useful for the UI,
  // and for selecting the reference executor for predecessor calculation
  const [executorPrincipal, setExecutorPrincipal] = useState("");

  useEffect(() => {
    if (isOpen) {
      // Reset all states when dialog opens
      setExecutor("");
      setExecutores([]);
      setMultiplosExecutores(false);
      setDataInicio(new Date());
      setUsarPredecessora(false);
      setDocumentoPredecessor("");
      setPrioridade(1);
      setExecutorPrincipal("");

      // Optional: If you want to pre-fill based on existing document configuration
      if (documento?.multiplos_executores) {
          setMultiplosExecutores(true);
      } else if (documento?.executor_principal) {
          setExecutor(documento.executor_principal);
          setExecutorPrincipal(documento.executor_principal);
      }
    }
  }, [isOpen, documento]); // Dependency on 'documento' to potentially pre-fill

  // Effect to manage executorPrincipal based on selected executores in multi-mode
  useEffect(() => {
    if (multiplosExecutores) {
      if (executores.length > 0 && !executores.includes(executorPrincipal)) {
        // If principal is not in selected, pick the first one as a default
        setExecutorPrincipal(executores[0]);
      } else if (executores.length === 0) {
        setExecutorPrincipal("");
      }
    } else {
      // If single executor mode, principal is the selected executor
      setExecutorPrincipal(executor);
    }
  }, [multiplosExecutores, executor, executores, executorPrincipal]);


  const handleExecutorToggle = (userEmail, checked) => {
    if (checked) {
      setExecutores(prev => {
        const newExecs = [...prev, userEmail];
        // If it's the first executor added, set as principal
        if (prev.length === 0) {
          setExecutorPrincipal(userEmail);
        }
        return newExecs;
      });
    } else {
      setExecutores(prev => {
        const filteredExecs = prev.filter(email => email !== userEmail);
        // If the principal was removed, choose another or clear
        if (executorPrincipal === userEmail) {
          setExecutorPrincipal(filteredExecs.length > 0 ? filteredExecs[0] : "");
        }
        return filteredExecs;
      });
    }
  };

  const handleExecutorPrincipalChange = (userEmail) => {
    setExecutorPrincipal(userEmail);
    // Ensure the principal is also in the list of selected executores
    if (!executores.includes(userEmail)) {
      setExecutores(prev => [...prev, userEmail]);
    }
  };

  const removeExecutor = (userEmail) => {
    handleExecutorToggle(userEmail, false);
  };

  const handleSubmit = async () => {
    if (!documento) {
      alert('Erro: Documento não encontrado.');
      return;
    }

    let executoresSelecionados = [];
    if (multiplosExecutores) {
      executoresSelecionados = executores;
    } else {
      if (executor) {
        executoresSelecionados = [executor];
      }
    }

    if (executoresSelecionados.length === 0) {
      alert('Por favor, selecione pelo menos um executor.');
      return;
    }

    if (!usarPredecessora && !dataInicio) {
      alert('Por favor, selecione a data de início ou use um documento predecessor.');
      return;
    }

    if (usarPredecessora && !documentoPredecessor) {
      alert('Por favor, selecione um documento predecessor.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Dynamically import entities to reduce initial bundle size
      const { Analitico, PlanejamentoAtividade, Documento } = await import('@/entities/all');

      // Fetch all analytical activities for the current document
      const analiticosDoDocumento = await Analitico.filter({ documento_id: documento.id });

      if (analiticosDoDocumento.length === 0) {
        alert('Este documento não possui atividades analíticas criadas. Verifique se as atividades foram aplicadas corretamente ao documento.');
        setIsSubmitting(false);
        return;
      }

      // Build current daily workload for all selected executors based on existing plans
      const cargaDiariaPorExecutor = {};
      for (const executorEmail of executoresSelecionados) {
        const planejamentosDoExecutor = planejamentos.filter(p =>
          p.executores.includes(executorEmail) && // Check if executor is among the planned executores for this plan item
          p.status !== 'concluido' &&
          p.status !== 'cancelado'
        );

        const cargaDiaria = {};
        planejamentosDoExecutor.forEach(p => {
          if (p.horas_por_dia && typeof p.horas_por_dia === 'object') {
            Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
              cargaDiaria[data] = (cargaDiaria[data] || 0) + (Number(horas) || 0);
            });
          }
        });
        cargaDiariaPorExecutor[executorEmail] = cargaDiaria;
      }

      // Calculate the actual start date for the first analytical activity
      let finalDataInicio;
      if (usarPredecessora && documentoPredecessor) {
        const principalForPredecessor = executorPrincipal || executoresSelecionados[0]; // Use selected principal or first executor
        const cargaPrincipalExecutor = cargaDiariaPorExecutor[principalForPredecessor] || {};

        const predecessorDoc = predecessorDocuments.find(doc => doc.id === documentoPredecessor);
        if (!predecessorDoc) {
          alert("Documento predecessor selecionado não foi encontrado na lista.");
          setIsSubmitting(false);
          return;
        }

        finalDataInicio = calcularDataInicioPorPredecessora(
          predecessorDoc,
          planejamentos,
          cargaPrincipalExecutor,
          8 // Assuming 8 working hours per day
        );

        console.log(`📅 Data de início calculada por predecessora para ${documento.numero}: ${format(finalDataInicio, 'dd/MM/yyyy')}`);
      } else {
        finalDataInicio = new Date(dataInicio);
      }

      // Ensure finalDataInicio is a valid Date object
      if (isNaN(finalDataInicio.getTime())) {
          alert("Data de início inválida. Verifique a seleção da data ou do predecessor.");
          setIsSubmitting(false);
          return;
      }

      const novosPlanejamentos = [];
      let dataAtualParaAnalitico = new Date(finalDataInicio); // This date will advance for subsequent analiticos

      // Sort analiticos to ensure consistent planning order (e.g., by ID or a specific 'order' field)
      analiticosDoDocumento.sort((a, b) => a.id.localeCompare(b.id));

      for (const analitico of analiticosDoDocumento) {
        const tempoReal = analitico.tempo_real || 0;

        if (tempoReal <= 0) {
          console.warn(`Analítico ${analitico.id} possui tempo real <= 0, pulando planejamento.`);
          continue;
        }

        let maxTerminoForCurrentAnalitico = 0; // Tracks the latest end date among all executors for this *current analitico*

        for (const executorEmail of executoresSelecionados) {
          // Pass a COPY of the executor's current load for the distribution calculation.
          // This allows `distribuirHorasPorDias` to modify its internal copy without affecting
          // the shared `cargaDiariaPorExecutor` during the current analitico's planning for other executors.
          const cargaExecutorCopia = { ...cargaDiariaPorExecutor[executorEmail] };

          const { distribuicao, dataTermino } = distribuirHorasPorDias(
            dataAtualParaAnalitico, // Start date for this specific analitico
            tempoReal,
            8, // Max daily hours for an executor
            cargaExecutorCopia // The existing load for this executor
          );

          if (Object.keys(distribuicao).length === 0) {
            console.warn(`Não foi possível distribuir horas para executor ${executorEmail} no analítico ${analitico.id}. Pode haver sobrecarga ou data de início inviável.`);
            continue; // Skip planning this analitico for this executor
          }

          const inicioPlanejado = Object.keys(distribuicao).sort()[0];
          const terminoPlanejado = Object.keys(distribuicao).sort().reverse()[0];

          if (new Date(terminoPlanejado).getTime() > maxTerminoForCurrentAnalitico) {
              maxTerminoForCurrentAnalitico = new Date(terminoPlanejado).getTime();
          }

          const planejamento = {
            documento_id: documento.id,
            analitico_id: analitico.id,
            empreendimento_id: empreendimentoId,
            executores: executoresSelecionados, // All selected executors for this planning session on the document
            executor_principal: executorEmail, // The specific executor this plan item is tied to (for load tracking)
            predecessora_id: usarPredecessora ? documentoPredecessor : null,
            tempo_planejado: tempoReal,
            inicio_planejado: inicioPlanejado, // Formatted date string
            termino_planejado: terminoPlanejado, // Formatted date string
            status: 'nao_iniciado',
            prioridade: prioridade || 1,
            horas_por_dia: distribuicao,
          };

          novosPlanejamentos.push(planejamento);

          // IMPORTANT: Update the main `cargaDiariaPorExecutor` map for this executor
          // This ensures that when the *next analitico* is planned, or if this executor
          // is involved in another analitico, their load reflects the newly assigned hours.
          Object.entries(distribuicao).forEach(([data, horas]) => {
            cargaDiariaPorExecutor[executorEmail][data] =
              (cargaDiariaPorExecutor[executorEmail][data] || 0) + horas;
          });
        }

        // Advance `dataAtualParaAnalitico` for the next analitico in the document.
        // This only happens if we are NOT using a predecessor and there are multiple analiticos.
        // It ensures sequential planning for analiticos within the same document when not linked to a predecessor.
        if (!usarPredecessora && analiticosDoDocumento.length > 1 && maxTerminoForCurrentAnalitico > 0) {
            dataAtualParaAnalitico = getNextWorkingDay(new Date(maxTerminoForCurrentAnalitico));
        }
      }

      // Save all generated planning records
      for (const planejamento of novosPlanejamentos) {
        await PlanejamentoAtividade.create(planejamento);
      }

      console.log(`✅ ${novosPlanejamentos.length} planejamentos criados para o documento ${documento.numero}`);

      // Update the main Document object with overall planning information
      const documentOverallStartDate = novosPlanejamentos.length > 0 ?
        new Date(Math.min(...novosPlanejamentos.map(p => new Date(p.inicio_planejado).getTime()))) : null;
      const documentOverallEndDate = novosPlanejamentos.length > 0 ?
        new Date(Math.max(...novosPlanejamentos.map(p => new Date(p.termino_planejado).getTime()))) : null;

      await Documento.update(documento.id, {
        multiplos_executores: multiplosExecutores,
        executor_principal: multiplosExecutores ? null : executor, // Only set if single executor mode
        inicio_planejado: documentOverallStartDate ? format(documentOverallStartDate, 'yyyy-MM-dd') : null,
        termino_planejado: documentOverallEndDate ? format(documentOverallEndDate, 'yyyy-MM-dd') : null,
      });

      onSave(); // Call the success callback passed from parent
    } catch (error) {
      console.error('Erro ao criar planejamento:', error);
      alert(`Erro ao salvar planejamento: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to get executor's name for display
  const getExecutorName = (email) => {
    const user = usuarios.find(u => u.email === email);
    return user?.nome || email;
  }

  // Basic estimation for summary display (does not account for daily loads, just total hours / total capacity)
  const estimatedEndDate = () => {
    if (!dataInicio || !documento || !documento.tempo_total_analitico) return null;
    if (selectedExecutorsCount === 0) return null;

    const tempoTotal = documento.tempo_total_analitico || 0;
    const hoursPerDayPerExecutor = 8; // Assuming 8 hours/day max capacity

    // Total days needed assuming full capacity and ignoring existing load, just for estimation
    const totalWorkingDaysNeeded = tempoTotal / (selectedExecutorsCount * hoursPerDayPerExecutor);

    let futureDate = new Date(dataInicio);
    let daysAdded = 0;
    while (daysAdded < Math.ceil(totalWorkingDaysNeeded)) {
      futureDate.setDate(futureDate.getDate() + 1);
      // Skip weekends (0 is Sunday, 6 is Saturday)
      if (futureDate.getDay() !== 0 && futureDate.getDay() !== 6) {
        daysAdded++;
      }
    }
    return futureDate;
  };

  const totalTempoAnalitico = documento?.tempo_total_analitico || 0;
  const selectedExecutorsCount = multiplosExecutores ? executores.length : (executor ? 1 : 0);
  const totalHoursPerExecutor = selectedExecutorsCount > 0 ? totalTempoAnalitico / selectedExecutorsCount : 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Planejar Documento: {documento?.numero || "N/A"}
          </DialogTitle>
          <DialogDescription>
            Defina os parâmetros de planejamento para as atividades deste documento.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Document Information */}
          <div className="p-4 rounded-md bg-gray-50 border">
            <p className="font-semibold text-gray-800">Documento: {documento?.numero || "N/A"}</p>
            <p className="text-sm text-gray-500">Descrição: {documento?.descricao || "N/A"}</p>
            <p className="text-sm text-gray-500">Total de Horas Analíticas: {totalTempoAnalitico}h</p>
          </div>

          {/* Toggle for Multiple Executors */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="multiplos-executores"
              checked={multiplosExecutores}
              onCheckedChange={setMultiplosExecutores}
            />
            <Label htmlFor="multiplos-executores">Atribuir a múltiplos executores</Label>
          </div>

          {/* Executor Selection */}
          {!multiplosExecutores ? (
            <div className="space-y-2">
              <Label htmlFor="executor">Executor Único</Label>
              <Select value={executor} onValueChange={setExecutor}>
                <SelectTrigger id="executor">
                  <SelectValue placeholder="Selecione um executor" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map(user => (
                    <SelectItem key={user.email} value={user.email}>
                      {user.nome || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="text-base font-medium">Selecionar Executores</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                {usuarios.map(user => (
                  <div key={user.email} className="flex items-center space-x-3">
                    <Checkbox
                      id={`executor-${user.email}`}
                      checked={executores.includes(user.email)}
                      onCheckedChange={(checked) => handleExecutorToggle(user.email, checked)}
                    />
                    <label
                      htmlFor={`executor-${user.email}`}
                      className="flex-1 text-sm font-medium cursor-pointer"
                    >
                      {user.nome || user.email}
                    </label>
                  </div>
                ))}
              </div>

              {/* Selected Executors Display */}
              {executores.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Executores Selecionados:</Label>
                  <div className="flex flex-wrap gap-2">
                    {executores.map(email => {
                      const user = usuarios.find(u => u.email === email);
                      return (
                        <Badge
                          key={email}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          {user?.nome || email}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-red-100"
                            onClick={() => removeExecutor(email)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Principal Executor for Multiple Select (used for predecessor calculation reference) */}
              {executores.length > 1 && (
                <div className="space-y-2">
                  <Label htmlFor="executor-principal-multi">Executor Principal para Cálculo</Label>
                  <Select value={executorPrincipal} onValueChange={handleExecutorPrincipalChange}>
                    <SelectTrigger id="executor-principal-multi">
                      <SelectValue placeholder="Escolha o principal para cálculo" />
                    </SelectTrigger>
                    <SelectContent>
                      {executores.map(email => {
                        const user = usuarios.find(u => u.email === email);
                        return (
                          <SelectItem key={email} value={email}>
                            {user?.nome || email}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Este executor será usado como referência para o cálculo da data de início em predecessoras.</p>
                </div>
              )}
            </div>
          )}

          {/* Priority Input */}
          <div className="space-y-2">
            <Label htmlFor="prioridade">Prioridade</Label>
            <Input
              id="prioridade"
              type="number"
              value={prioridade}
              onChange={(e) => setPrioridade(Number(e.target.value))}
              min="1"
            />
          </div>

          {/* Predecessor Selection */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="usar-predecessora"
                checked={usarPredecessora}
                onCheckedChange={setUsarPredecessora}
              />
              <Label htmlFor="usar-predecessora" className="flex items-center gap-1">
                <Link className="h-4 w-4" />
                Usar documento predecessor
              </Label>
            </div>
            {usarPredecessora && (
              <Select value={documentoPredecessor} onValueChange={setDocumentoPredecessor}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o documento predecessor" />
                </SelectTrigger>
                <SelectContent>
                  {predecessorDocuments.map(doc => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.numero} - {doc.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Calendar for Start Date (if not using predecessor) */}
          {!usarPredecessora && (
            <div className="space-y-2 flex flex-col items-center">
              <Label>Data de Início (se não usar predecessora)</Label>
              <Calendar
                mode="single"
                selected={dataInicio}
                onSelect={setDataInicio}
                className="rounded-md border"
              />
            </div>
          )}

          {/* Planning Summary */}
          {selectedExecutorsCount > 0 && totalTempoAnalitico > 0 && (
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Resumo do Planejamento:</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• {selectedExecutorsCount} executor{selectedExecutorsCount > 1 ? 'es' : ''} selecionado{selectedExecutorsCount > 1 ? 's' : ''}</li>
                <li>• Tempo Total do Documento: {totalTempoAnalitico}h</li>
                {selectedExecutorsCount > 0 && (
                  <li>• Tempo por Executor (aprox.): {totalHoursPerExecutor.toFixed(1)}h</li>
                )}
                <li>• Executor(es) Definido(s): {multiplosExecutores ? executores.map(getExecutorName).join(', ') : (executor ? getExecutorName(executor) : 'N/A')}</li>
                {multiplosExecutores && executorPrincipal && (
                  <li>• Executor Principal para cálculo: {getExecutorName(executorPrincipal)}</li>
                )}
                <li>• Prioridade: {prioridade}</li>
                {usarPredecessora ? (
                  <li>• Início baseado em predecessor: {predecessorDocuments.find(d => d.id === documentoPredecessor)?.numero || "N/A"}</li>
                ) : (
                  <li>• Início Planejado (inicial): {dataInicio ? format(dataInicio, "dd/MM/yyyy") : "N/A"}</li>
                )}
                <li>• Término Estimado: {estimatedEndDate() ? format(estimatedEndDate(), "dd/MM/yyyy") : "Calculando..."}</li>
                <li className="text-xs text-blue-700 mt-2">
                    <p><i>Nota: O término exato será calculado considerando a carga de trabalho atual dos executores e pode variar.</i></p>
                </li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || selectedExecutorsCount === 0 || (!usarPredecessora && !dataInicio) || (usarPredecessora && !documentoPredecessor)}
          >
            {isSubmitting ? "Planejando..." : "Confirmar Planejamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
