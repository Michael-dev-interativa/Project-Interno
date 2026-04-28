
import { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, addDays, differenceInDays, parseISO, startOfDay } from "date-fns";

// Helper function to parse ISO date strings into Date objects, handling potential invalid inputs
const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  const parsedDate = parseISO(dateString);
  // Check if parsedDate is a valid Date object.
  // parseISO returns Invalid Date for invalid strings.
  if (isNaN(parsedDate.getTime())) {
    return null;
  }
  return parsedDate;
};

export default function PrevisaoEntregaModal({ isOpen, onClose, planejamentos, execucoes, cargaDiaria }) {
  const dadosPrevisao = useMemo(() => {
    if (!planejamentos || planejamentos.length === 0) {
      return [];
    }

    // Calcular o tempo total executado para cada analitico
    const tempoExecutadoMap = execucoes.reduce((acc, exec) => {
      if (exec.analitico_id) {
        acc[exec.analitico_id] = (acc[exec.analitico_id] || 0) + (Number(exec.tempo_total) || 0);
      }
      return acc;
    }, {});

    // Calcular a previsão para cada atividade
    const previsoes = planejamentos.map(plano => {
      const tempoPlanejado = plano.tempo_planejado || 0;
      const tempoExecutado = tempoExecutadoMap[plano.analitico_id] || 0;
      const tempoRestante = Math.max(0, tempoPlanejado - tempoExecutado);

      // Calcular a data de previsão
      let previsaoTermino = null;
      if (plano.status === 'concluido') {
        // Se concluído, a previsão é a data da última execução
        const execsDoPlano = execucoes.filter(e => e.analitico_id === plano.analitico_id);
        if (execsDoPlano.length > 0) {
          // Sort to find the latest execution date
          const ultimaExecucao = execsDoPlano.sort((a, b) => {
            const dateA = parseLocalDate(a.termino || a.inicio);
            const dateB = parseLocalDate(b.termino || b.inicio);
            // Sort in descending order to get the latest date first
            return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
          })[0];
          previsaoTermino = ultimaExecucao.termino ? parseLocalDate(ultimaExecucao.termino) : (ultimaExecucao.inicio ? parseLocalDate(ultimaExecucao.inicio) : new Date());
        } else {
          previsaoTermino = new Date(); // Fallback para hoje se não houver execução
        }
      } else if (tempoRestante > 0) {
        let horasAcumuladas = 0;
        let dataAtual = startOfDay(new Date()); // Começa a contar a partir de hoje

        // Loop para encontrar a data de término
        // Limite de segurança para evitar loops infinitos (e.g., 2 anos)
        for (let i = 0; i < 365 * 2; i++) {
          const diaKey = format(dataAtual, 'yyyy-MM-dd');
          
          // Usa a carga horária real do calendário, se disponível.
          // Fallback para 8 horas em dias úteis se a cargaDiaria não estiver definida ou for 0.
          const horasTrabalhaveisNoDia = cargaDiaria?.[diaKey] !== undefined ? cargaDiaria[diaKey] : (dataAtual.getDay() > 0 && dataAtual.getDay() < 6 ? 8 : 0);
          
          if (horasTrabalhaveisNoDia > 0) {
            horasAcumuladas += horasTrabalhaveisNoDia;
          }
          
          // Se as horas acumuladas são suficientes para completar o trabalho
          if (horasAcumuladas >= tempoRestante) {
            previsaoTermino = dataAtual;
            break; // Sai do loop
          }
          
          // Passa para o próximo dia
          dataAtual = addDays(dataAtual, 1);
        }
        
        // Se após 2 anos ainda não encontrou data, define como null para indicar erro
        if (!previsaoTermino) {
        }

      } else {
        // Se não há tempo restante e não está concluído, a previsão é hoje
        previsaoTermino = new Date();
      }

      const terminoPlanejado = plano.termino_planejado ? parseLocalDate(plano.termino_planejado) : null;
      let status = 'No prazo';
      let diasAtraso = 0;

      if (terminoPlanejado && previsaoTermino) {
        // Ignora a hora para a comparação de dias
        const previsaoSemHora = startOfDay(previsaoTermino);
        const planejadoSemHora = startOfDay(terminoPlanejado);
        
        diasAtraso = differenceInDays(previsaoSemHora, planejadoSemHora);

        if (plano.status === 'concluido') {
            status = 'Concluído';
        } else if (diasAtraso > 0) {
          status = `Atrasado (${diasAtraso}d)`;
        }
      } else if (plano.status === 'concluido') {
          status = 'Concluído';
      }

      return {
        id: plano.id,
        nome: plano.descritivo || plano.atividade?.atividade || 'Atividade sem nome',
        terminoPlanejado: terminoPlanejado,
        previsaoTermino: previsaoTermino,
        status: status,
      };
    });

    return previsoes;
  }, [planejamentos, execucoes, cargaDiaria]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            Previsão de Entrega das Atividades
          </DialogTitle>
          <DialogDescription>
            Análise comparativa entre o término planejado e a previsão de término calculada com base no progresso atual.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Atividade</TableHead>
                <TableHead>Término Planejado</TableHead>
                <TableHead>Previsão de Término</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dadosPrevisao.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.nome}</TableCell>
                  <TableCell>{item.terminoPlanejado ? format(item.terminoPlanejado, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                  <TableCell>{item.previsaoTermino ? format(item.previsaoTermino, 'dd/MM/yyyy') : 'Calculando...'}</TableCell>
                  <TableCell>
                    <Badge variant={item.status.startsWith('Atrasado') ? 'destructive' : item.status === 'Concluído' ? 'default' : 'outline'}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
