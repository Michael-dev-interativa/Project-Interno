// @ts-nocheck
import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronRight, Calendar, CheckCircle2 } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from 'date-fns';

export default function AnaliticoFolhaRow({
  folha,
  isConcluindo,
  planejamentos,
  preTempoByDocumentoId,
  handleToggleFolhaConcluida,
  atividadesSelecionadasParaExcluir,
  setAtividadesSelecionadasParaExcluir,
  hasCheckboxColumn,
  showExcluirCheckbox = true,
}) {
  const folhaChave = `${folha.source_documento_id}-${folha.base_atividade_id}`;
  const isFolhaConcluindo = isConcluindo[folhaChave];
  const isFolhaConcluida = folha.status === 'Concluída';

  return (
    <TableRow className="bg-blue-50/50">
      {hasCheckboxColumn && <TableCell></TableCell>}
      <TableCell className="pl-12">
        <ChevronRight className="w-3 h-3 text-gray-400 inline mr-1" />
      </TableCell>
      <TableCell className="text-sm text-gray-600">
        <div className="whitespace-nowrap">{folha.source_documento_numero} - {folha.source_documento_arquivo}</div>
        {folha.etapa && <span className="text-xs text-gray-400">{folha.etapa}</span>}
      </TableCell>
      <TableCell>
        {isFolhaConcluida
          ? <Badge className="bg-blue-600 text-white font-semibold flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3" />Concluída</Badge>
          : folha.status === 'Planejada'
            ? <Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3" />Planejada</Badge>
            : <Badge variant="outline" className="text-xs text-gray-600">{folha.status}</Badge>
        }
      </TableCell>
      <TableCell>
        {(folha.status === 'Planejada' || isFolhaConcluida) ? (
          (() => {
            const planejamento = planejamentos?.find(p =>
              p.documento_id === folha.source_documento_id &&
              p.atividade_id === folha.base_atividade_id
            );
            if (planejamento?.inicio_planejado && planejamento?.termino_planejado) {
              return (
                <div className="flex items-center gap-1 text-gray-600 text-xs">
                  <Calendar className="w-3 h-3" />
                  <span>{format(parseISO(planejamento.inicio_planejado), 'dd/MM')} - {format(parseISO(planejamento.termino_planejado), 'dd/MM')}</span>
                </div>
              );
            }
            return null;
          })()
        ) : null}
      </TableCell>
      <TableCell className="text-sm">
        {(() => {
          const baseTempo = folha.tempo ? Number(folha.tempo) : 0;
          const preTempo = preTempoByDocumentoId.get(String(folha.source_documento_id)) || 0;
          if (baseTempo === 0 && preTempo === 0) return '-';
          if (preTempo === 0) return `${baseTempo.toFixed(1)}h`;
          return (
            <div>
              <span>{(baseTempo + preTempo).toFixed(1)}h</span>
              <div className="text-xs text-orange-500">+{preTempo.toFixed(1)}h PRE</div>
            </div>
          );
        })()}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {isFolhaConcluindo ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          ) : (
            <Checkbox
              checked={isFolhaConcluida}
              disabled={isFolhaConcluindo}
              onCheckedChange={(checked) => handleToggleFolhaConcluida(folha, checked)}
              title={isFolhaConcluida ? 'Desfazer conclusão' : 'Marcar como concluída'}
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        {showExcluirCheckbox ? (
          <Checkbox
            checked={atividadesSelecionadasParaExcluir.has(folha.base_atividade_id || folha.id)}
            onCheckedChange={(checked) => {
              setAtividadesSelecionadasParaExcluir(prev => {
                const newSet = new Set(prev);
                const id = folha.base_atividade_id || folha.id;
                if (checked) newSet.add(id);
                else newSet.delete(id);
                return newSet;
              });
            }}
          />
        ) : null}
      </TableCell>
    </TableRow>
  );
}
