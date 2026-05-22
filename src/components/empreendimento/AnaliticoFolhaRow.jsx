// @ts-nocheck
import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronRight, Calendar, CheckCircle2, Users2 } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  usuarios = [],
  handleSaveFolhaExecutor,
  datasInicioFolha = {},
  setDatasInicioFolha,
  isSavingFolhaExecutor = {},
}) {
  const folhaChave = `${folha.source_documento_id}-${folha.base_atividade_id}`;
  const isFolhaConcluindo = isConcluindo[folhaChave];
  const isFolhaConcluida = folha.status === 'Concluída';
  const isFolhaPlanejada = folha.status === 'Planejada';
  const isSaving = isSavingFolhaExecutor[folhaChave];
  const dataInicioSelecionada = datasInicioFolha[folhaChave];

  const planejamento = planejamentos?.find(p =>
    p.documento_id === folha.source_documento_id &&
    p.atividade_id === folha.base_atividade_id
  );

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
          : isFolhaPlanejada
            ? <Badge className="bg-green-600 text-white font-semibold shadow-md flex items-center gap-1 w-fit text-xs"><CheckCircle2 className="w-3 h-3" />Planejada</Badge>
            : <Badge variant="outline" className="text-xs text-gray-600">{folha.status}</Badge>
        }
      </TableCell>

      {/* Executor / Datas */}
      <TableCell>
        {(isFolhaPlanejada || isFolhaConcluida) ? (
          planejamento?.inicio_planejado && planejamento?.termino_planejado ? (
            <div className="flex items-center gap-1 text-gray-600 text-xs">
              <Calendar className="w-3 h-3" />
              <span>{format(parseISO(planejamento.inicio_planejado), 'dd/MM')} - {format(parseISO(planejamento.termino_planejado), 'dd/MM')}</span>
            </div>
          ) : null
        ) : isSaving ? (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            Planejando...
          </div>
        ) : (
          <div className="flex gap-1 items-center">
            <Select
              onValueChange={(value) => handleSaveFolhaExecutor(folha, value, dataInicioSelecionada)}
              disabled={isSaving}
            >
              <SelectTrigger className="w-full text-xs h-7 border-blue-400 text-blue-600 hover:bg-blue-50 min-w-[140px]">
                <Users2 className="w-3 h-3 mr-1 shrink-0" />
                <SelectValue placeholder="Planejar folha" />
              </SelectTrigger>
              <SelectContent>
                {usuarios
                  .filter(u => u.status === 'ativo')
                  .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
                  .map(u => (
                    <SelectItem key={u.email} value={u.email} className="text-xs">
                      {u.nome || u.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={`h-7 w-7 shrink-0 ${dataInicioSelecionada ? 'border-green-500 text-green-600' : ''}`}
                  disabled={isSaving}
                  title="Selecionar data de início"
                >
                  <Calendar className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dataInicioSelecionada}
                  onSelect={(date) => setDatasInicioFolha(prev => ({ ...prev, [folhaChave]: date }))}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  locale={ptBR}
                />
                {dataInicioSelecionada && (
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDatasInicioFolha(prev => ({ ...prev, [folhaChave]: null }))}
                      className="w-full text-xs"
                    >
                      Limpar Data
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        )}
        {dataInicioSelecionada && !isFolhaPlanejada && !isFolhaConcluida && !isSaving && (
          <div className="flex items-center gap-1 text-blue-600 text-xs mt-1">
            <Calendar className="w-3 h-3" />
            <span>Início: {format(dataInicioSelecionada, 'dd/MM/yyyy')}</span>
          </div>
        )}
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
