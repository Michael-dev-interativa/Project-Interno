// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlanejamentoAtividade, PlanejamentoDocumento } from '@/entities/all';
import { Loader2, Calendar as CalendarIcon, FileText } from 'lucide-react';
import { retryWithBackoff } from '../utils/apiUtils';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getNextWorkingDay, distribuirHorasPorDias } from '../utils/DateCalculator';

export default function PlanejamentoFolhaUnicaModal({
  isOpen,
  onClose,
  folha,
  atividade,
  usuarios,
  empreendimentoId,
  onSuccess,
}) {
  const [executor, setExecutor] = useState('');
  const [tempoPlanejado, setTempoPlanejado] = useState('');
  const [dataInicio, setDataInicio] = useState(null);
  const [metodoData, setMetodoData] = useState('agenda');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && folha) {
      setExecutor('');
      setTempoPlanejado(String(folha.tempo || ''));
      setDataInicio(null);
      setMetodoData('agenda');
    }
  }, [isOpen, folha]);

  const usuariosAtivos = useMemo(() => {
    return (usuarios || [])
      .filter(u => u.status === 'ativo')
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }, [usuarios]);

  const calcularDistribuicao = async (executorEmail, horas, startDate) => {
    try {
      const [planosAtividade, planosDocumento] = await Promise.all([
        retryWithBackoff(
          () => PlanejamentoAtividade.filter({ executor_principal: executorEmail, status: { $ne: 'concluido' } }),
          3, 1000, 'buscarCargaAtividade'
        ).catch(() => []),
        retryWithBackoff(
          () => PlanejamentoDocumento.filter({ executor_principal: executorEmail, status: { $ne: 'concluido' } }),
          3, 1000, 'buscarCargaDocumento'
        ).catch(() => []),
      ]);

      const cargaDiaria = {};
      const hoje = new Date();
      const hojeMidnight = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

      [...(planosAtividade || []), ...(planosDocumento || [])].forEach(plano => {
        if (plano.horas_por_dia && typeof plano.horas_por_dia === 'object') {
          Object.entries(plano.horas_por_dia).forEach(([data, h]) => {
            const dataObj = parseISO(data);
            if (isValid(dataObj) && dataObj >= hojeMidnight) {
              const key = format(dataObj, 'yyyy-MM-dd');
              cargaDiaria[key] = (cargaDiaria[key] || 0) + (Number(h) || 0);
            }
          });
        }
      });

      const inicio = startDate || getNextWorkingDay(new Date());
      const resultado = distribuirHorasPorDias(inicio, horas, 8, cargaDiaria, !!startDate);
      const dias = Object.keys(resultado.distribuicao).sort();

      return {
        dataInicio: dias[0],
        dataTermino: format(resultado.dataTermino, 'yyyy-MM-dd'),
        horasPorDia: resultado.distribuicao,
      };
    } catch {
      const dia = format(getNextWorkingDay(new Date()), 'yyyy-MM-dd');
      return { dataInicio: dia, dataTermino: dia, horasPorDia: { [dia]: horas } };
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const horas = parseFloat(tempoPlanejado);
    if (!horas || horas <= 0) {
      alert('Insira um tempo válido maior que zero.');
      return;
    }
    if (!executor) {
      alert('Selecione um executor.');
      return;
    }
    if (metodoData === 'manual' && !dataInicio) {
      alert('Selecione a data de início.');
      return;
    }

    setIsLoading(true);
    try {
      const atividadeId = folha.base_atividade_id;
      const docId = folha.source_documento_id;

      const calculo = await calcularDistribuicao(executor, horas, metodoData === 'manual' ? dataInicio : null);

      const planejamentosExistentes = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({
          empreendimento_id: empreendimentoId,
          atividade_id: atividadeId,
          documento_id: docId,
        }),
        3, 500, `checkPlanoFolha-${docId}`
      );

      const payload = {
        empreendimento_id: empreendimentoId,
        atividade_id: atividadeId,
        documento_id: docId,
        etapa: folha.etapa,
        descritivo: folha.atividade,
        tempo_planejado: horas,
        executor_principal: executor,
        executores: [executor],
        status: 'nao_iniciado',
        inicio_planejado: calculo.dataInicio,
        termino_planejado: calculo.dataTermino,
        horas_por_dia: calculo.horasPorDia,
      };

      if (planejamentosExistentes.length > 0) {
        await retryWithBackoff(
          () => PlanejamentoAtividade.update(planejamentosExistentes[0].id, payload),
          3, 500, `updatePlanoFolha-${planejamentosExistentes[0].id}`
        );
      } else {
        await retryWithBackoff(
          () => PlanejamentoAtividade.create(payload),
          3, 500, `createPlanoFolha-${docId}`
        );
      }

      if (onSuccess) onSuccess();
    } catch (err) {
      alert('Erro ao planejar folha: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!folha) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-purple-600" />
            Planejar Folha
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <FileText className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold text-blue-800">{folha.source_documento_numero}</div>
                {folha.source_documento_arquivo && (
                  <div className="text-blue-600 text-xs mt-0.5">{folha.source_documento_arquivo}</div>
                )}
                {folha.atividade && (
                  <div className="text-gray-600 text-xs mt-1">{String(folha.atividade)}</div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="tempo">Tempo planejado (horas)</Label>
              <Input
                id="tempo"
                type="number"
                step="0.1"
                min="0.1"
                value={tempoPlanejado}
                onChange={e => setTempoPlanejado(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="executor">Executor</Label>
              <Select value={executor} onValueChange={setExecutor} required>
                <SelectTrigger id="executor">
                  <SelectValue placeholder="Selecione o executor" />
                </SelectTrigger>
                <SelectContent>
                  {usuariosAtivos.map(u => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.nome || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="metodo">Método de data</Label>
              <Select value={metodoData} onValueChange={setMetodoData}>
                <SelectTrigger id="metodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agenda">Automático — próxima data disponível</SelectItem>
                  <SelectItem value="manual">Manual — definir data específica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {metodoData === 'manual' && (
              <div>
                <Label>Data de início</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" type="button" className="w-full justify-start">
                      <CalendarIcon className="w-4 h-4 mr-2" />
                      {dataInicio
                        ? format(dataInicio, 'dd/MM/yyyy', { locale: ptBR })
                        : 'Selecione a data'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataInicio}
                      onSelect={setDataInicio}
                      locale={ptBR}
                      disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-purple-600 hover:bg-purple-700">
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Planejando...</>
              ) : (
                'Planejar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
