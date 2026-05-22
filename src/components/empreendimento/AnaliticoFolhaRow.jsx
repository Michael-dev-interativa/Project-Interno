// @ts-nocheck
import React, { useState, useCallback, useMemo, useTransition, useRef } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, CheckCircle2, CheckCircle, Loader2, Calendar, CalendarPlus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { PlanejamentoAtividade, Atividade } from '@/entities/all';
import { retryWithBackoff } from '../utils/apiUtils';
import PlanejamentoFolhaUnicaModal from './PlanejamentoFolhaUnicaModal';

function AnaliticoFolhaRow({
  folha,
  hasCheckboxColumn,
  planejamentos,
  empreendimentoId,
  onConcluirFolha,
  usuarios,
  atividade,
  folhasSelecionadas = new Set(),
  setFolhasSelecionadas = () => {},
}) {
  const [isConc, setIsConc] = useState(false);
  const [showPlanejamentoModal, setShowPlanejamentoModal] = useState(false);
  const [, startTransition] = useTransition();

  const isConcluida = folha.status === 'Concluída';
  const isSelected = folhasSelecionadas.has(folha.source_documento_id);

  // Optimistic local state so the checkbox responds instantly without waiting
  // for the expensive AnaliticoRenderContent re-render to complete.
  const [localChecked, setLocalChecked] = useState(isSelected);
  const prevIsSelectedRef = useRef(isSelected);
  if (prevIsSelectedRef.current !== isSelected) {
    prevIsSelectedRef.current = isSelected;
    if (localChecked !== isSelected) setLocalChecked(isSelected);
  }

  const plano = useMemo(() =>
    planejamentos?.find(p =>
      p.documento_id === folha.source_documento_id &&
      p.atividade_id === folha.base_atividade_id
    ),
    [planejamentos, folha.source_documento_id, folha.base_atividade_id]
  );

  const executorNome = useMemo(() => {
    if (!plano?.executor_principal) return null;
    return (usuarios || []).find(u => u.email === plano.executor_principal)?.nome || plano.executor_principal;
  }, [plano?.executor_principal, usuarios]);

  const handleToggleSelecao = useCallback((checked) => {
    setLocalChecked(checked); // instant visual feedback
    startTransition(() => {
      setFolhasSelecionadas(prev => {
        const newSet = new Set(prev);
        if (checked) newSet.add(folha.source_documento_id);
        else newSet.delete(folha.source_documento_id);
        return newSet;
      });
    });
  }, [folha.source_documento_id, setFolhasSelecionadas]);

  const handleToggleConclusao = useCallback(async () => {
    setIsConc(true);
    try {
      const _isConcluida = folha.status === 'Concluída';
      const hoje = format(new Date(), 'yyyy-MM-dd');
      const atividadeId = folha.base_atividade_id || folha.id;
      const docId = folha.source_documento_id;

      const planos = await retryWithBackoff(
        () => PlanejamentoAtividade.filter({
          empreendimento_id: empreendimentoId,
          atividade_id: atividadeId,
          documento_id: docId,
        }),
        3, 500, `getPlanoFolha-${docId}-${atividadeId}`
      );

      if (_isConcluida) {
        if (planos.length > 0) {
          await retryWithBackoff(
            () => PlanejamentoAtividade.update(planos[0].id, { status: 'nao_iniciado', termino_real: null }),
            3, 500, `reverterFolha-${planos[0].id}`
          );
        }
        const marcadores = await retryWithBackoff(
          () => Atividade.filter({ empreendimento_id: empreendimentoId, id_atividade: atividadeId, documento_id: docId, tempo: 0 }),
          3, 500, `getMarcadorConclusao-${docId}-${atividadeId}`
        );
        for (const m of marcadores) {
          await retryWithBackoff(() => Atividade.delete(m.id), 3, 500, `deleteMarcadorConclusao-${m.id}`);
        }
      } else {
        if (planos.length > 0) {
          await retryWithBackoff(
            () => PlanejamentoAtividade.update(planos[0].id, { status: 'concluido', termino_real: hoje }),
            3, 500, `concluirFolha-${planos[0].id}`
          );
        } else {
          await retryWithBackoff(
            () => PlanejamentoAtividade.create({
              empreendimento_id: empreendimentoId,
              atividade_id: atividadeId,
              documento_id: docId,
              etapa: folha.etapa,
              descritivo: folha.atividade,
              tempo_planejado: folha.tempo || 0,
              status: 'concluido',
              termino_real: hoje,
              horas_por_dia: {},
            }),
            3, 500, `createConcluirFolha-${docId}-${atividadeId}`
          );
        }
        const marcadoresExistentes = await retryWithBackoff(
          () => Atividade.filter({ empreendimento_id: empreendimentoId, id_atividade: atividadeId, documento_id: docId, tempo: 0 }),
          3, 500, `checkMarcadorConclusao-${docId}-${atividadeId}`
        );
        if (!marcadoresExistentes || marcadoresExistentes.length === 0) {
          await retryWithBackoff(
            () => Atividade.create({
              etapa: folha.etapa,
              disciplina: folha.disciplina,
              subdisciplina: folha.subdisciplina,
              atividade: `(Concluída na folha ${folha.source_documento_numero || docId}) ${String(folha.atividade || '')}`,
              empreendimento_id: empreendimentoId,
              id_atividade: atividadeId,
              documento_id: docId,
              tempo: 0,
            }),
            3, 500, `createMarcadorConclusao-${docId}-${atividadeId}`
          );
        }
      }

      if (onConcluirFolha) onConcluirFolha();
    } catch (err) {
      alert('Erro ao atualizar status da folha: ' + err.message);
    } finally {
      setIsConc(false);
    }
  }, [folha, empreendimentoId, onConcluirFolha]);

  const handleOpenModal = useCallback(() => setShowPlanejamentoModal(true), []);
  const handleCloseModal = useCallback(() => setShowPlanejamentoModal(false), []);
  const handleModalSuccess = useCallback(() => {
    setShowPlanejamentoModal(false);
    if (onConcluirFolha) onConcluirFolha();
  }, [onConcluirFolha]);

  return (
    <>
      <TableRow className={isConcluida ? 'bg-blue-50/80' : 'bg-blue-50/30'}>
        {/* col 1 — alignment with selectedIds column (only when it exists) */}
        {hasCheckboxColumn && <TableCell />}
        {/* col 2 — folha selection checkbox (always shown) */}
        <TableCell>
          <Checkbox checked={localChecked} onCheckedChange={handleToggleSelecao} />
        </TableCell>
        {/* col 3 — expand/indent column */}
        <TableCell className="pl-8">
          <ChevronRight className="w-3 h-3 text-gray-400" />
        </TableCell>
        {/* col 4 — document info (Atividade column) */}
        <TableCell className="text-sm text-gray-600">
          <span className="font-medium text-blue-700">{folha.source_documento_numero}</span>
          {folha.source_documento_arquivo && <span className="ml-1">— {folha.source_documento_arquivo}</span>}
        </TableCell>
        {/* col 5 — Status */}
        <TableCell>
          {isConcluida
            ? <Badge className="bg-blue-600 text-white font-semibold flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3" />Concluída</Badge>
            : folha.status === 'Planejada'
              ? <Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3" />Planejada</Badge>
              : <Badge variant="outline" className="text-xs text-gray-600">{folha.status}</Badge>
          }
        </TableCell>
        {/* col 6 — Executor column: executor name + etapa + planned dates */}
        <TableCell>
          <div className="flex flex-col gap-0.5">
            {executorNome ? (
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <span className="text-xs font-medium text-green-800 truncate max-w-[120px]">{executorNome}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">{folha.etapa || '-'}</span>
            )}
            {(folha.status === 'Planejada' || isConcluida) && plano?.inicio_planejado && plano?.termino_planejado && (
              <div className="flex items-center gap-1 text-gray-500 text-xs">
                <Calendar className="w-3 h-3" />
                <span>{format(parseISO(plano.inicio_planejado), 'dd/MM')} – {format(parseISO(plano.termino_planejado), 'dd/MM')}</span>
              </div>
            )}
          </div>
        </TableCell>
        {/* col 7 — Horas */}
        <TableCell className="text-sm text-gray-600">
          {folha.tempo ? `${Number(folha.tempo).toFixed(1)}h` : '-'}
        </TableCell>
        {/* col 8 — Ações */}
        <TableCell>
          <div className="flex items-center gap-1">
            {folha.status !== 'Planejada' && !isConcluida && (
              <Button
                size="icon"
                variant="outline"
                onClick={handleOpenModal}
                title="Planejar esta folha"
                className="border-purple-400 text-purple-600 hover:bg-purple-50 h-7 w-7"
              >
                <CalendarPlus className="w-3 h-3" />
              </Button>
            )}
            <Button
              size="icon"
              variant="outline"
              onClick={handleToggleConclusao}
              disabled={isConc}
              title={isConcluida ? 'Reverter conclusão desta folha' : 'Concluir esta folha'}
              className={isConcluida
                ? 'border-blue-500 text-blue-600 hover:bg-blue-50 h-7 w-7'
                : 'border-gray-300 text-gray-400 hover:border-green-500 hover:text-green-600 h-7 w-7'
              }
            >
              {isConc ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            </Button>
          </div>
        </TableCell>
        {/* col 9 — dropdown alignment (empty for folha rows) */}
        <TableCell />
      </TableRow>
      {showPlanejamentoModal && (
        <PlanejamentoFolhaUnicaModal
          isOpen={showPlanejamentoModal}
          onClose={handleCloseModal}
          folha={folha}
          atividade={atividade}
          usuarios={usuarios || []}
          empreendimentoId={empreendimentoId}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
}

export default React.memo(AnaliticoFolhaRow, (prev, next) => {
  // For folhasSelecionadas (a Set), only re-render if THIS row's selection changed
  if (
    prev.folhasSelecionadas.has(prev.folha.source_documento_id) !==
    next.folhasSelecionadas.has(next.folha.source_documento_id)
  ) return false;
  // Field-level comparison for folha — object identity is always unstable across renders
  if (prev.folha.source_documento_id !== next.folha.source_documento_id) return false;
  if (prev.folha.base_atividade_id !== next.folha.base_atividade_id) return false;
  if (prev.folha.status !== next.folha.status) return false;
  if (prev.folha.tempo !== next.folha.tempo) return false;
  if (prev.folha.etapa !== next.folha.etapa) return false;
  if (prev.folha.source_documento_numero !== next.folha.source_documento_numero) return false;
  if (prev.folha.source_documento_arquivo !== next.folha.source_documento_arquivo) return false;
  // Re-render when data that affects the visual output changes
  if (prev.planejamentos !== next.planejamentos) return false;
  if (prev.usuarios !== next.usuarios) return false;
  if (prev.hasCheckboxColumn !== next.hasCheckboxColumn) return false;
  if (prev.empreendimentoId !== next.empreendimentoId) return false;
  return true;
});
