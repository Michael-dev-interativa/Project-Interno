import React from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, Edit2, CheckCircle, FileX, XCircle, MoreHorizontal, Loader2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/**Componente compacto para renderizar uma linha da tabela de atividades */
export default function AnaliticoTableRow({
  ativ,
  grupo,
  key,
  isExpanded,
  toggleExpansion,
  selectedIds,
  atividadesSelecionadasParaExcluir,
  isSavingExecutor,
  isDeletingMultiple,
  isDeletingActivity,
  onSelectItem,
  onSelectExcluir,
  onOpenEtapaModal,
  onDelete,
  onExcluirAtividade,
  onOpenExcluirDeFolhasModal,
  onConcluirEmTodasFolhas,
  onConcluindo,
  onOpenModal,
  hasCheckboxColumn,
  usuarios,
  isConcluindo
}) {
  const genericAtividadeIdToExclude = ativ.base_atividade_id || ativ.id;
  const isDeleting = isDeletingActivity[genericAtividadeIdToExclude];

  if (ativ.isEditable) {
    return (
      <TableRow key={key} className="hover:bg-gray-50">
        <TableCell>
          <Checkbox
            checked={selectedIds.has(ativ.uniqueId)}
            onCheckedChange={() => onSelectItem(ativ.uniqueId)}
            disabled={isDeletingMultiple}
          />
        </TableCell>
        <TableCell>
          {grupo.folhas.length > 0 && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => toggleExpansion(key)}
              className="h-8 w-8"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </TableCell>
        <TableCell className="font-medium">
          <div>{String(ativ.atividade || '')}</div>
          {ativ.subdisciplina && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{ativ.subdisciplina}</span>}
        </TableCell>
        <TableCell><Badge variant="outline">{grupo.folhas.length} {grupo.folhas.length === 1 ? 'folha' : 'folhas'}</Badge></TableCell>
        <TableCell colSpan="5"></TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={isDeleting || isDeletingMultiple}>
                {isDeleting || isDeletingMultiple ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreHorizontal className="w-4 h-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => onOpenModal(ativ)}>
                Edit Atividade
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(ativ.id)} className="text-red-600">
                Excluir Atividade de Projeto
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  }

  // Não-editável (catálogo)
  return (
    <>
      <TableRow key={key} className="hover:bg-gray-50">
        <TableCell>
          <Checkbox
            checked={atividadesSelecionadasParaExcluir.has(ativ.base_atividade_id || ativ.id)}
            onCheckedChange={(checked) => onSelectExcluir(genericAtividadeIdToExclude, checked)}
          />
        </TableCell>
        <TableCell>
          {grupo.folhas.length > 0 && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => toggleExpansion(key)}
              className="h-8 w-8"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </TableCell>
        <TableCell className="font-medium text-sm">
          <div>{String(ativ.atividade || '')}</div>
          {ativ.subdisciplina && <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{ativ.subdisciplina}</span>}
        </TableCell>
        <TableCell><Badge variant="outline">{grupo.folhas.length} {grupo.folhas.length === 1 ? 'folha' : 'folhas'}</Badge></TableCell>
        <TableCell colSpan="6"></TableCell>
        <TableCell className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <Button 
              size="icon" 
              onClick={() => onOpenExcluirDeFolhasModal(ativ)}
              variant="outline"
              className="border-orange-500 text-orange-600 hover:bg-orange-50"
              disabled={isDeleting}
              title="Excluir de Folhas Específicas"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileX className="w-4 h-4" />}
            </Button>
            <Button 
              size="icon" 
              onClick={() => onExcluirAtividade(ativ)}
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50"
              disabled={isDeleting}
              title="Excluir de Todas as Folhas"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}