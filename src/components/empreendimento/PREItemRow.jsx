// @ts-nocheck
import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Upload, X, File, ZoomIn, CalendarPlus, FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";

const STATUS_COLORS = {
  "Em andamento": "bg-yellow-200",
  "Pendente": "bg-red-300",
  "Concluído": "bg-green-200",
  "Cancelado": "bg-red-200"
};

export default function PREItemRow({
  item,
  index,
  readOnly,
  empreendimento,
  documentos,
  onUpdate,
  onDelete,
  onUploadImage,
  onRemoveImage,
  onOpenLightbox,
  onPlanejar,
  onRemoveExecutor,
  onBlurSave,
}) {
  return (
    <div className={`flex gap-4 rounded-lg overflow-hidden ${index % 2 === 0 ? 'bg-white border border-gray-300' : 'bg-gray-100 border border-gray-300'}`}>
      {/* Container Principal (80%) */}
      <div className="w-4/5 p-4 space-y-4 border-r border-gray-300">
        {/* De, Disciplina e Assunto - lado a lado */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">De</label>
            <Textarea
              value={item.de || ''}
              onChange={(e) => onUpdate(item.id, 'de', e.target.value)}
              className="w-full text-sm print:border-none print:bg-transparent resize-none"
              rows={3}
              disabled={readOnly}
              placeholder="De quem..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Disciplina</label>
            <Textarea
              value={item.descritiva || ''}
              onChange={(e) => onUpdate(item.id, 'descritiva', e.target.value)}
              className="w-full text-sm print:border-none print:bg-transparent resize-none"
              rows={3}
              disabled={readOnly}
              placeholder="Disciplina..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Assunto</label>
            <Textarea
              value={item.assunto || ''}
              onChange={(e) => onUpdate(item.id, 'assunto', e.target.value)}
              className="w-full text-sm print:border-none print:bg-transparent resize-none"
              rows={3}
              disabled={readOnly}
              placeholder="Assunto..."
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Comentário</label>
          <Textarea
            value={item.comentario || ''}
            onChange={(e) => onUpdate(item.id, 'comentario', e.target.value)}
            className="w-full text-sm print:border-none print:bg-transparent resize-y"
            rows={4}
            disabled={readOnly}
            placeholder="Comentários adicionais..."
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Resposta</label>
          <Textarea
            value={item.resposta || ''}
            onChange={(e) => onUpdate(item.id, 'resposta', e.target.value)}
            className="w-full text-sm print:border-none print:bg-transparent resize-y"
            rows={3}
            placeholder="Resposta/Resolução..."
          />
        </div>

        {/* Imagens */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Imagens</label>
          <div className="space-y-2">
            <div className="no-print">
              <input
                type="file"
                id={`file-input-${item.id}`}
                accept="image/*,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadImage(item.id, file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => document.getElementById(`file-input-${item.id}`).click()}
              >
                <Upload className="w-3 h-3 mr-2" />
                Anexar Imagem ou PDF
              </Button>
              <div
                contentEditable
                suppressContentEditableWarning
                className="mt-1 border-2 border-dashed border-gray-300 rounded p-2 text-center text-xs text-gray-400 cursor-pointer hover:border-blue-400 hover:text-blue-400 transition-colors focus:outline-none focus:border-blue-400 focus:text-blue-400"
                onKeyDown={(e) => { if (!e.ctrlKey && !e.metaKey) e.preventDefault(); }}
                onPaste={(e) => {
                  e.preventDefault();
                  const clipItems = e.clipboardData?.items;
                  if (!clipItems) return;
                  for (const clipItem of clipItems) {
                    if (clipItem.type.startsWith('image/')) {
                      const rawFile = clipItem.getAsFile();
                      if (!rawFile) break;
                      const objectUrl = URL.createObjectURL(rawFile);
                      const img = new Image();
                      img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        canvas.getContext('2d').drawImage(img, 0, 0);
                        canvas.toBlob((blob) => {
                          if (!blob) return;
                          const pngFile = new window.File([blob], `print_${Date.now()}.png`, { type: 'image/png' });
                          onUploadImage(item.id, pngFile);
                          URL.revokeObjectURL(objectUrl);
                        }, 'image/png');
                      };
                      img.src = objectUrl;
                      break;
                    }
                  }
                }}
              >
                Clique aqui e cole (Ctrl+V) para adicionar print
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(item.imagens || []).filter(Boolean).map((imgUrl, idx) => (
                <div key={idx} className="relative group flex-shrink-0">
                  {imgUrl.toLowerCase().endsWith('.pdf') || imgUrl.startsWith('data:application/pdf') ? (
                    <a
                      href={imgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-32 h-32 rounded border cursor-pointer hover:opacity-80 transition-all flex flex-col items-center justify-center bg-gray-50 text-xs font-medium text-blue-600 hover:bg-blue-50"
                    >
                      <File className="w-6 h-6 mb-1" />
                      PDF
                    </a>
                  ) : (
                    <img
                      src={imgUrl}
                      alt={`Imagem ${idx + 1}`}
                      className="w-32 h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition-all"
                      onClick={() => onOpenLightbox(imgUrl)}
                      title="Clique para ampliar"
                    />
                  )}
                  {!imgUrl.toLowerCase().endsWith('.pdf') && (
                    <button
                      type="button"
                      onClick={() => onOpenLightbox(imgUrl)}
                      className="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                      title="Ampliar imagem"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveImage(item.id, imgUrl)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Container Secundário (20%) */}
      <div className="w-1/5 p-4 space-y-4 flex flex-col min-h-0">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Item</label>
          {readOnly ? (
            <div className="text-sm font-medium p-2 bg-gray-50 rounded">{item.item}</div>
          ) : (
            <Input
              value={item.item || ''}
              onChange={(e) => onUpdate(item.id, 'item', e.target.value)}
              className="h-9 text-sm text-center font-medium print:border-none print:bg-transparent"
            />
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Data</label>
          {readOnly ? (
            <div className="text-sm p-2 bg-gray-50 rounded">{item.data ? format(new Date(item.data + 'T00:00:00'), 'dd/MM/yyyy') : ''}</div>
          ) : (
            <Input
              type="date"
              value={item.data ? item.data.toString().substring(0, 10) : ''}
              onChange={(e) => onUpdate(item.id, 'data', e.target.value)}
              className="h-9 text-sm print:border-none print:bg-transparent"
            />
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Localização</label>
          <Textarea
            value={item.localizacao || ''}
            onChange={(e) => onUpdate(item.id, 'localizacao', e.target.value)}
            className="w-full text-sm print:border-none print:bg-transparent resize-none"
            rows={3}
            disabled={readOnly}
            placeholder="Localização..."
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Tempo (horas)</label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={item.tempo_atendimento !== null && item.tempo_atendimento !== undefined ? String(Number(item.tempo_atendimento)) : ''}
            onChange={(e) => onUpdate(item.id, 'tempo_atendimento', e.target.value !== '' ? parseFloat(e.target.value) : null)}
            onBlur={() => onBlurSave?.()}
            className="h-9 text-sm print:border-none print:bg-transparent"
            disabled={readOnly}
            placeholder="0.0"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
          {readOnly ? (
            <div className={`text-sm p-2 rounded text-center font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100'}`}>
              {item.status || 'Sem status'}
            </div>
          ) : (
            <Select
              value={item.status || ''}
              onValueChange={(value) => onUpdate(item.id, 'status', value)}
            >
              <SelectTrigger className={`h-9 text-sm print:border-none print:bg-transparent ${STATUS_COLORS[item.status] || ''}`}>
                <SelectValue placeholder="Sem status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Em andamento">Em andamento</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Documentos Vinculados */}
        <div className="no-print">
          <label className="text-xs font-semibold text-gray-600 block mb-1">Docs. Vinculados</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-xs justify-start h-8">
                <FileText className="w-3 h-3 mr-1 flex-shrink-0" />
                <span className="truncate">
                  {(item.documentos_vinculados || []).length > 0
                    ? `${(item.documentos_vinculados || []).length} doc(s)`
                    : 'Vincular...'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <p className="text-xs font-semibold text-gray-500 mb-2">Selecionar documentos</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {(documentos || []).length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">Nenhum documento cadastrado</p>
                ) : (
                  (documentos || []).map(doc => {
                    const isChecked = (item.documentos_vinculados || []).includes(doc.id);
                    return (
                      <label key={doc.id} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                        <input
                          type="checkbox"
                          className="mt-0.5 flex-shrink-0"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = item.documentos_vinculados || [];
                            const newDocs = e.target.checked
                              ? [...current, doc.id]
                              : current.filter(id => id !== doc.id);
                            onUpdate(item.id, 'documentos_vinculados', newDocs);
                          }}
                        />
                        <span className="leading-tight">{doc.numero ? `${doc.numero} - ` : ''}{doc.arquivo}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
          {(item.documentos_vinculados || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(item.documentos_vinculados || []).slice(0, 2).map(docId => {
                const doc = (documentos || []).find(d => d.id === docId);
                return doc ? (
                  <Badge key={docId} variant="outline" className="text-xs px-1 py-0 max-w-full">
                    <span className="truncate max-w-[90px] block">{doc.numero || (doc.arquivo || '').substring(0, 12)}</span>
                  </Badge>
                ) : null;
              })}
              {(item.documentos_vinculados || []).length > 2 && (
                <Badge variant="outline" className="text-xs px-1 py-0">+{(item.documentos_vinculados || []).length - 2}</Badge>
              )}
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="pt-4 no-print space-y-2">
          {item.planejamento_executor ? (
            <div className="space-y-1">
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 space-y-1">
                {empreendimento?.num_proposta && (
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">OS {empreendimento.num_proposta}</p>
                )}
                <p className="text-xs text-green-800 leading-snug line-clamp-3">
                  {[`Item ${item.item}`, item.de || null, item.assunto || item.descritiva || null].filter(Boolean).join(' - ')}
                </p>
                <div className="flex items-center gap-1 pt-1 border-t border-green-200">
                  <CalendarPlus className="w-3 h-3 flex-shrink-0 text-green-600" />
                  <span className="truncate font-medium text-xs text-green-700">{item.planejamento_executor_nome || item.planejamento_executor}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
                onClick={() => onRemoveExecutor(item)}
              >
                <X className="w-3 h-3 mr-1" />
                Remover executor
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
              onClick={() => onPlanejar(item)}
            >
              <CalendarPlus className="w-4 h-4 mr-2" />
              Planejar
            </Button>
          )}
          {!readOnly && (
            <Button
              variant="ghost"
              className="w-full text-red-500 hover:text-red-700 hover:bg-red-50"
              onClick={() => onDelete(item.id)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
