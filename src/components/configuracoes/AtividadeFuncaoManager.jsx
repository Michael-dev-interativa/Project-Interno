// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { AtividadeFuncao, Usuario, PlanejamentoAtividade } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { PlusCircle, Edit, Trash2, Loader2, PackageOpen, Calendar as CalendarIcon, Bell, ChevronRight, ChevronDown, CalendarCheck } from 'lucide-react';
import { retryWithBackoff } from '../utils/apiUtils';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { format, addDays, addMonths, startOfDay, isBefore, parseISO } from 'date-fns';
import { distribuirHorasPorDias, isWorkingDay } from '../utils/DateCalculator';

const DIAS_DA_SEMANA = [
  { value: 1, label: 'S' },
  { value: 2, label: 'T' },
  { value: 3, label: 'Q' },
  { value: 4, label: 'Q' },
  { value: 5, label: 'S' },
  { value: 6, label: 'S' },
  { value: 0, label: 'D' }
];

export default function AtividadeFuncaoManager() {
  const [atividadesFuncao, setAtividadesFuncao] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [funcoesExpandidas, setFuncoesExpandidas] = useState(new Set());

  // Estados do diálogo de planejamento
  const [showPlanejamentoDialog, setShowPlanejamentoDialog] = useState(false);
  const [planejandoFuncao, setPlanejandoFuncao] = useState('');
  const [planejamentoUsuario, setPlanejamentoUsuario] = useState('');
  const [planejamentoInicio, setPlanejamentoInicio] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [planejamentoFim, setPlanejamentoFim] = useState(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [isPlanejando, setIsPlanejando] = useState(false);
  const [planejamentoStatus, setPlanejamentoStatus] = useState({ message: '', error: false });

  const [formData, setFormData] = useState({
    funcao: '',
    nome: '',
    frequencia: 'semanal',
    tempo_estimado: 1,
    dias_semana: [1, 2, 3, 4, 5],
    dia_mes: 1,
  });

  const loadAtividadesFuncao = useCallback(async () => {
    setIsLoading(true);
    try {
      const [data, usuariosData] = await Promise.all([
        retryWithBackoff(() => AtividadeFuncao.list('-created_date'), 3, 1000, 'loadAtividadesFuncao'),
        retryWithBackoff(() => Usuario.list(), 3, 1000, 'loadUsuarios'),
      ]);

      const dataOrdenada = (data || []).sort((a, b) =>
        (a.funcao || '').toLowerCase().localeCompare((b.funcao || '').toLowerCase(), 'pt-BR')
      );

      setAtividadesFuncao(dataOrdenada);
      setUsuarios(
        (usuariosData || []).sort((a, b) =>
          (a.nome || a.full_name || a.email || '').localeCompare(
            (b.nome || b.full_name || b.email || ''), 'pt-BR', { sensitivity: 'base' }
          )
        )
      );
      setError(null);
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      setError("Não foi possível carregar os dados.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAtividadesFuncao();
  }, [loadAtividadesFuncao]);

  useEffect(() => {
    if (formData.frequencia === 'diaria') {
      setFormData(prev => ({ ...prev, dias_semana: [1, 2, 3, 4, 5] }));
    }
  }, [formData.frequencia]);

  const handleDiaSemanaToggle = (dia) => {
    if (formData.frequencia === 'diaria') return;
    setFormData(prev => {
      const dias = prev.dias_semana.includes(dia)
        ? prev.dias_semana.filter(d => d !== dia)
        : [...prev.dias_semana, dia];
      return { ...prev, dias_semana: dias };
    });
  };

  const handleAddNew = () => {
    setEditingAtividade(null);
    setFormData({ funcao: '', nome: '', frequencia: 'semanal', tempo_estimado: 1, dias_semana: [1, 2, 3, 4, 5], dia_mes: 1 });
    setShowForm(true);
  };

  const handleEdit = (atividade) => {
    setEditingAtividade(atividade);
    setFormData({ ...atividade, dias_semana: atividade.dias_semana || [1, 2, 3, 4, 5], dia_mes: atividade.dia_mes || 1 });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir este modelo de atividade?")) return;
    try {
      await retryWithBackoff(() => AtividadeFuncao.delete(id), 3, 1000, 'deleteAtividadeFuncao');
      loadAtividadesFuncao();
    } catch (err) {
      console.error("Erro ao excluir:", err);
      alert("Falha ao excluir o modelo.");
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.funcao || !formData.nome || !formData.tempo_estimado) {
      alert("Por favor, preencha Função, Atividade e Tempo Estimado.");
      return;
    }
    setIsSaving(true);
    try {
      const dataToSave = { ...formData, tempo_estimado: Number(formData.tempo_estimado), dia_mes: Number(formData.dia_mes) };
      if (editingAtividade) {
        await retryWithBackoff(() => AtividadeFuncao.update(editingAtividade.id, dataToSave), 3, 1000, 'updateAtividadeFuncao');
      } else {
        await retryWithBackoff(() => AtividadeFuncao.create(dataToSave), 3, 1000, 'createAtividadeFuncao');
      }
      setShowForm(false);
      loadAtividadesFuncao();
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Falha ao salvar o modelo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAbrirPlanejamento = (funcao, e) => {
    e.stopPropagation();
    setPlanejandoFuncao(funcao);
    setPlanejamentoUsuario('');
    setPlanejamentoInicio(format(new Date(), 'yyyy-MM-dd'));
    setPlanejamentoFim(format(addMonths(new Date(), 1), 'yyyy-MM-dd'));
    setPlanejamentoStatus({ message: '', error: false });
    setShowPlanejamentoDialog(true);
  };

  const executarPlanejamento = async () => {
    if (!planejamentoUsuario || !planejamentoInicio || !planejamentoFim) {
      alert("Selecione o usuário, data de início e data de fim.");
      return;
    }

    const dataInicio = startOfDay(parseISO(planejamentoInicio));
    const dataFim = startOfDay(parseISO(planejamentoFim));

    if (!isBefore(dataInicio, dataFim)) {
      alert("A data de início deve ser anterior à data de fim.");
      return;
    }

    const atividadesParaFuncao = atividadesFuncao.filter(
      af => af.funcao === planejandoFuncao && af.frequencia !== 'ocasional'
    );

    if (atividadesParaFuncao.length === 0) {
      alert("Nenhuma atividade agendável encontrada para esta função.");
      return;
    }

    setIsPlanejando(true);
    setPlanejamentoStatus({ message: 'Buscando carga de trabalho...', error: false });

    try {
      const planejamentosExistentes = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({ executor_principal: planejamentoUsuario }),
        3, 1500, 'loadCargaExecutor'
      );

      let cargaDiaria = {};
      (planejamentosExistentes || []).forEach(p => {
        if (p.horas_por_dia) {
          Object.entries(p.horas_por_dia).forEach(([data, horas]) => {
            cargaDiaria[data] = (cargaDiaria[data] || 0) + Number(horas || 0);
          });
        }
      });

      let totalCriados = 0;
      let dataAtual = dataInicio;

      while (isBefore(dataAtual, dataFim)) {
        const diaDaSemana = dataAtual.getDay();

        for (const modelo of atividadesParaFuncao) {
          let deveCriar = false;
          const diasModelo = modelo.dias_semana || [];

          switch (modelo.frequencia) {
            case 'diaria':
              deveCriar = diasModelo.includes(diaDaSemana);
              break;
            case 'semanal':
              deveCriar = diasModelo.includes(diaDaSemana);
              break;
            case 'quinzenal': {
              const semanaDoMes = Math.floor((dataAtual.getDate() - 1) / 7);
              deveCriar = diasModelo.includes(diaDaSemana) && semanaDoMes % 2 === 0;
              break;
            }
            case 'mensal':
              deveCriar = dataAtual.getDate() === modelo.dia_mes;
              break;
            default:
              deveCriar = false;
          }

          if (deveCriar && isWorkingDay(dataAtual)) {
            setPlanejamentoStatus({
              message: `Planejando "${modelo.nome}" em ${format(dataAtual, 'dd/MM/yyyy')}...`,
              error: false
            });

            const { distribuicao, dataTermino, cargaAtualizada } = distribuirHorasPorDias(
              dataAtual, modelo.tempo_estimado, 8, cargaDiaria, false
            );

            if (Object.keys(distribuicao).length > 0) {
              const inicio = Object.keys(distribuicao).sort()[0];
              const fim = dataTermino ? format(dataTermino, 'yyyy-MM-dd') : inicio;

              await PlanejamentoAtividade.create({
                descritivo: modelo.nome,
                base_descritivo: modelo.nome,
                executor_principal: planejamentoUsuario,
                executores: [planejamentoUsuario],
                tempo_planejado: modelo.tempo_estimado,
                inicio_planejado: inicio,
                termino_planejado: fim,
                horas_por_dia: distribuicao,
                status: 'nao_iniciado',
              });

              cargaDiaria = cargaAtualizada;
              totalCriados++;
            }
          }
        }

        dataAtual = addDays(dataAtual, 1);
      }

      setPlanejamentoStatus({ message: `Concluído! ${totalCriados} planejamento(s) criado(s).`, error: false });
      setTimeout(() => setShowPlanejamentoDialog(false), 2000);
    } catch (err) {
      console.error("Erro ao executar planejamento:", err);
      setPlanejamentoStatus({ message: 'Erro ao criar planejamentos. Tente novamente.', error: true });
    } finally {
      setIsPlanejando(false);
    }
  };

  const formatFrequencia = (atividade) => {
    const { frequencia, dias_semana, dia_mes } = atividade;
    const diasMap = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };
    switch (frequencia) {
      case 'diaria': return 'Diariamente (Seg-Sex)';
      case 'semanal':
      case 'quinzenal': {
        const diasStr = [...dias_semana].sort().map(d => diasMap[d]).join(', ') || 'Nenhum dia';
        return `${frequencia.charAt(0).toUpperCase() + frequencia.slice(1)} (${diasStr})`;
      }
      case 'mensal': return `Todo dia ${dia_mes}`;
      case 'ocasional': return 'Ocasional (Notifica sexta-feira)';
      default: return 'N/A';
    }
  };

  const toggleFuncao = (funcao) => {
    setFuncoesExpandidas(prev => {
      const next = new Set(prev);
      if (next.has(funcao)) next.delete(funcao);
      else next.add(funcao);
      return next;
    });
  };

  const atividadesPorFuncao = atividadesFuncao.reduce((acc, item) => {
    const funcao = item.funcao || 'Sem Função';
    if (!acc[funcao]) acc[funcao] = [];
    acc[funcao].push(item);
    return acc;
  }, {});

  const funcoesOrdenadas = Object.keys(atividadesPorFuncao).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );

  const usuarioSelecionadoNome = usuarios.find(u => u.email === planejamentoUsuario);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Modelos de Atividade por Função</CardTitle>
        <Button onClick={handleAddNew}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Adicionar Modelo
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : error ? (
          <div className="text-center text-red-500">{error}</div>
        ) : atividadesFuncao.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <PackageOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium">Nenhum modelo encontrado</h3>
            <p className="text-sm">Comece adicionando modelos de atividade para automatizar planejamentos.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {funcoesOrdenadas.map((funcao) => {
              const itens = atividadesPorFuncao[funcao];
              const expandida = funcoesExpandidas.has(funcao);
              const temAgendaveis = itens.some(i => i.frequencia !== 'ocasional');
              return (
                <div key={funcao} className="border rounded-lg overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => toggleFuncao(funcao)}
                  >
                    <div className="flex items-center gap-2">
                      {expandida
                        ? <ChevronDown className="w-4 h-4 text-gray-500" />
                        : <ChevronRight className="w-4 h-4 text-gray-500" />
                      }
                      <span className="font-semibold text-gray-800">{funcao}</span>
                      <span className="text-xs text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">
                        {itens.length} {itens.length === 1 ? 'atividade' : 'atividades'}
                      </span>
                    </div>
                    {temAgendaveis && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleAbrirPlanejamento(funcao, e)}
                        className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        <CalendarCheck className="w-4 h-4" />
                        Planejar
                      </Button>
                    )}
                  </div>

                  {expandida && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Atividade</TableHead>
                          <TableHead>Frequência</TableHead>
                          <TableHead>Tempo Estimado</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {item.frequencia === 'ocasional' && (
                                  <Bell className="w-4 h-4 text-amber-500" title="Atividade Ocasional" />
                                )}
                                {item.nome}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.frequencia === 'ocasional' ? (
                                <Badge className="bg-amber-100 text-amber-800">{formatFrequencia(item)}</Badge>
                              ) : (
                                formatFrequencia(item)
                              )}
                            </TableCell>
                            <TableCell>{item.tempo_estimado}h</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Dialog: Planejar por Função */}
      <Dialog open={showPlanejamentoDialog} onOpenChange={setShowPlanejamentoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-blue-600" />
              Planejar — {planejandoFuncao}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Usuário</Label>
              <Select value={planejamentoUsuario} onValueChange={setPlanejamentoUsuario} disabled={isPlanejando}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o usuário" />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map(u => (
                    <SelectItem key={u.id} value={u.email}>
                      {u.nome || u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Data de Início</Label>
                <Input
                  type="date"
                  value={planejamentoInicio}
                  onChange={e => setPlanejamentoInicio(e.target.value)}
                  disabled={isPlanejando}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de Fim</Label>
                <Input
                  type="date"
                  value={planejamentoFim}
                  onChange={e => setPlanejamentoFim(e.target.value)}
                  disabled={isPlanejando}
                />
              </div>
            </div>

            {planejamentoUsuario && planejamentoInicio && planejamentoFim && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                Serão criados planejamentos para{' '}
                <strong>{usuarioSelecionadoNome?.nome || usuarioSelecionadoNome?.full_name || planejamentoUsuario}</strong>{' '}
                de{' '}
                <strong>{format(parseISO(planejamentoInicio), 'dd/MM/yyyy')}</strong>{' '}
                até{' '}
                <strong>{format(parseISO(planejamentoFim), 'dd/MM/yyyy')}</strong>{' '}
                com base nas atividades da função <strong>{planejandoFuncao}</strong>.
              </div>
            )}

            {planejamentoStatus.message && (
              <div className={`p-3 rounded-lg text-sm font-medium ${
                planejamentoStatus.error
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-green-50 border border-green-200 text-green-800'
              }`}>
                {isPlanejando && <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />}
                {planejamentoStatus.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPlanejamentoDialog(false)} disabled={isPlanejando}>
              Cancelar
            </Button>
            <Button
              onClick={executarPlanejamento}
              disabled={isPlanejando || !planejamentoUsuario || !planejamentoInicio || !planejamentoFim}
            >
              {isPlanejando
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Planejando...</>
                : <><CalendarCheck className="mr-2 h-4 w-4" />Criar Planejamento</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar/Editar Modelo */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAtividade ? 'Editar' : 'Adicionar'} Modelo de Atividade</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="funcao">Função (Cargo)</Label>
                <Input id="funcao" value={formData.funcao} onChange={(e) => setFormData(prev => ({...prev, funcao: e.target.value}))} placeholder="Ex: Projetista" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nome">Atividade</Label>
                <Input id="nome" value={formData.nome} onChange={(e) => setFormData(prev => ({...prev, nome: e.target.value}))} placeholder="Ex: Reunião de alinhamento semanal" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="frequencia">Frequência</Label>
                  <Select value={formData.frequencia} onValueChange={(value) => setFormData(prev => ({...prev, frequencia: value}))}>
                    <SelectTrigger id="frequencia"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diaria">Diária</SelectItem>
                      <SelectItem value="semanal">Semanal</SelectItem>
                      <SelectItem value="quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="mensal">Mensal</SelectItem>
                      <SelectItem value="ocasional">
                        <div className="flex items-center gap-2">
                          <Bell className="w-4 h-4 text-amber-500" />
                          Ocasional
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempo_estimado">Tempo Estimado (horas)</Label>
                  <Input id="tempo_estimado" type="number" min="0.1" step="0.1" value={formData.tempo_estimado} onChange={(e) => setFormData(prev => ({...prev, tempo_estimado: e.target.value}))} />
                </div>
              </div>

              {formData.frequencia === 'ocasional' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Bell className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Atividade Ocasional</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Usuários com esta função receberão uma notificação toda sexta-feira perguntando em qual dia querem agendar esta atividade.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {['semanal', 'quinzenal', 'diaria'].includes(formData.frequencia) && (
                <div className="space-y-2">
                  <Label>Dias da Semana</Label>
                  <div className="flex gap-2">
                    {DIAS_DA_SEMANA.map(dia => (
                      <Button
                        key={dia.value}
                        type="button"
                        variant={formData.dias_semana.includes(dia.value) ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => handleDiaSemanaToggle(dia.value)}
                        className={`h-8 w-8 rounded-full ${formData.frequencia === 'diaria' ? 'cursor-not-allowed opacity-50' : ''}`}
                        title={dia.label}
                      >
                        {dia.label}
                      </Button>
                    ))}
                  </div>
                  {formData.frequencia === 'diaria' && (
                    <p className="text-xs text-gray-500">A frequência diária sempre inclui de Segunda a Sexta.</p>
                  )}
                </div>
              )}

              {formData.frequencia === 'mensal' && (
                <div className="space-y-2">
                  <Label htmlFor="dia_mes">Dia do Mês</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        <span>Dia {formData.dia_mes} de cada mês</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={new Date(new Date().getFullYear(), new Date().getMonth(), formData.dia_mes)}
                        onSelect={(date) => {
                          if (date) setFormData(prev => ({...prev, dia_mes: date.getDate()}));
                        }}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={isSaving}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
