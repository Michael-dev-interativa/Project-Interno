// @ts-nocheck
import React, { memo, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Upload, X, File, ZoomIn, CalendarPlus, Link, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS = {
  "Em andamento": "bg-yellow-300 text-yellow-900",
  "Pendente": "bg-red-400 text-white",
  "Concluído": "bg-green-500 text-white",
  "Cancelado": "bg-gray-400 text-white"
};

const STATUS_TRIGGER_COLORS = {
  "Em andamento": "bg-yellow-100 border-yellow-400 text-yellow-900",
  "Pendente": "bg-red-100 border-red-400 text-red-900",
  "Concluído": "bg-green-100 border-green-500 text-green-900",
  "Cancelado": "bg-gray-100 border-gray-400 text-gray-700"
};

const PREItemRow = memo(function PREItemRow({
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
}) {
  const etapasBase = ['Estudo Preliminar', 'Ante-Projeto', 'Projeto Básico', 'Projeto Executivo', 'Liberado para Obra', 'Concepção', 'Planejamento'];
  const etapasDisponiveis = empreendimento?.etapas?.length > 0
    ? [...new Set([...empreendimento.etapas, ...etapasBase])]
    : etapasBase;
  const isEven = index % 2 === 0;
  const mainBg = isEven ? 'bg-gray-50' : 'bg-gray-200';
  const sideBg = isEven ? 'bg-white' : 'bg-gray-100';
  const rowBg = isEven ? 'bg-white' : 'bg-gray-100';
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  const documentosVinculados = item.documentos_vinculados || [];

  const toggleDocumento = (docId) => {
    const current = item.documentos_vinculados || [];
    const updated = current.includes(docId)
      ? current.filter(id => id !== docId)
      : [...current, docId];
    onUpdate(item.id, 'documentos_vinculados', updated);
  };

  const docsFiltrados = (documentos || []).filter(doc => {
    if (!docSearch) return true;
    const q = docSearch.toLowerCase();
    return (doc.numero || '').toLowerCase().includes(q) ||
      (doc.arquivo || '').toLowerCase().includes(q) ||
      (doc.descritivo || '').toLowerCase().includes(q);
  });

  return (
    <div className={`flex gap-4 border border-gray-300 rounded-lg overflow-hidden shadow-sm ${rowBg}`}>
      {/* Container Principal (80%) */}
      <div className={`w-4/5 p-4 space-y-4 border-r border-gray-200 ${mainBg}`}>
        {/* De, Disciplina e Assunto */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">De</label>
            <Textarea
              value={item.de}
              onChange={(e) => onUpdate(item.id, 'de', e.target.value)}
              className="w-full text-sm bg-white border-gray-300 print:border-none print:bg-transparent resize-none"
              rows={3}
              disabled={readOnly}
              placeholder="De quem..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Disciplina</label>
            <Textarea
              value={item.descritiva}
              onChange={(e) => onUpdate(item.id, 'descritiva', e.target.value)}
              className="w-full text-sm bg-white border-gray-300 print:border-none print:bg-transparent resize-none"
              rows={3}
              disabled={readOnly}
              placeholder="Disciplina..."
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Assunto</label>
            <Textarea
              value={item.assunto}
              onChange={(e) => onUpdate(item.id, 'assunto', e.target.value)}
              className="w-full text-sm bg-white border-gray-300 print:border-none print:bg-transparent resize-none"
              rows={3}
              disabled={readOnly}
              placeholder="Assunto..."
            />
          </div>
        </div>

        {/* Comentário */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Comentário</label>
          <Textarea
            value={item.comentario}
            onChange={(e) => onUpdate(item.id, 'comentario', e.target.value)}
            className="w-full text-sm bg-white border-gray-300 print:border-none print:bg-transparent resize-y"
            rows={4}
            disabled={readOnly}
            placeholder="Comentários adicionais..."
          />
        </div>

        {/* Documentos Vinculados */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Documentos Vinculados</label>
          {!readOnly && (
            <div className="mb-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-left justify-between text-sm"
                onClick={() => setShowDocSelector(v => !v)}
              >
                <span className="flex items-center gap-2">
                  <Link className="w-3 h-3" />
                  {documentosVinculados.length > 0 ? `${documentosVinculados.length} documento(s) vinculado(s)` : 'Vincular documentos...'}
                </span>
                {showDocSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </Button>
              {showDocSelector && (
                <div className="border border-gray-300 rounded-md mt-1 bg-white shadow-sm max-h-48 overflow-y-auto">
                  <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
                    <Input
                      value={docSearch}
                      onChange={e => setDocSearch(e.target.value)}
                      placeholder="Buscar documento..."
                      className="h-7 text-xs"
                    />
                  </div>
                  {docsFiltrados.length === 0 ? (
                    <p className="text-xs text-gray-400 p-3 text-center">Nenhum documento encontrado</p>
                  ) : (
                    docsFiltrados.map(doc => {
                      const isSelected = documentosVinculados.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-blue-50 text-xs border-b border-gray-100 last:border-0 ${isSelected ? 'bg-blue-50' : ''}`}
                          onClick={() => toggleDocumento(doc.id)}
                        >
                          <input type="checkbox" checked={isSelected} onChange={() => {}} className="w-3 h-3 flex-shrink-0" />
                          <span className="font-mono font-medium text-gray-700 shrink-0">{doc.numero}</span>
                          {doc.arquivo && <span className="text-gray-600 shrink-0">{doc.arquivo}</span>}
                          {doc.descritivo && <span className="text-gray-500 truncate">{doc.descritivo}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
          {documentosVinculados.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {documentosVinculados.map(docId => {
                const doc = (documentos || []).find(d => d.id === docId);
                return (
                  <Badge key={docId} variant="outline" className="text-xs bg-blue-50 border-blue-300 text-blue-700 flex items-center gap-1">
                    {doc ? (doc.numero || doc.arquivo) : docId}
                    {!readOnly && (
                      <button onClick={() => toggleDocumento(docId)} className="ml-1 hover:text-red-500">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>

        {/* Resposta */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Resposta</label>
          <Textarea
            value={item.resposta}
            onChange={(e) => onUpdate(item.id, 'resposta', e.target.value)}
            className="w-full text-sm bg-white border-gray-300 print:border-none print:bg-transparent resize-y"
            rows={3}
            placeholder="Resposta/Resolução..."
          />
        </div>

        {/* Imagens */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-2 uppercase tracking-wide">Imagens</label>
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => document.getElementById(`file-input-${item.id}`).click()}
                >
                  <Upload className="w-3 h-3 mr-2" />
                  Anexar Imagem ou PDF
                </Button>
                <div
                  className="flex-1 border border-dashed border-gray-300 rounded text-xs text-gray-400 flex items-center justify-center px-2 py-1 cursor-pointer hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                  title="Clique aqui e cole com Ctrl+V"
                  tabIndex={0}
                  onPaste={(e) => {
                    const clipItems = e.clipboardData?.items;
                    if (!clipItems) return;
                    for (const clipItem of clipItems) {
                      if (clipItem.type.startsWith('image/')) {
                        const file = clipItem.getAsFile();
                        if (file) onUploadImage(item.id, file);
                        break;
                      }
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.focus(); }}
                >
                  Ctrl+V para colar
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(item.imagens || []).map((imgUrl, idx) => (
                <div key={idx} className="relative group flex-shrink-0">
                  {imgUrl.toLowerCase().endsWith('.pdf') ? (
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
      <div className={`w-1/5 p-4 space-y-4 flex flex-col min-h-0 ${sideBg}`}>
        {/* Item */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Item</label>
          {readOnly ? (
            <div className="text-sm font-medium p-2 bg-gray-50 rounded">{item.item}</div>
          ) : (
            <Input
              value={item.item}
              onChange={(e) => onUpdate(item.id, 'item', e.target.value)}
              className="h-9 text-sm text-center font-medium print:border-none print:bg-transparent"
            />
          )}
        </div>

        {/* Data */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Data</label>
          {readOnly ? (
            <div className="text-sm p-2 bg-gray-50 rounded">{item.data ? format(new Date(item.data), 'dd/MM/yyyy') : ''}</div>
          ) : (
            <Input
              type="date"
              value={item.data ? item.data.toString().substring(0, 10) : ''}
              onChange={(e) => onUpdate(item.id, 'data', e.target.value)}
              className="h-9 text-sm print:border-none print:bg-transparent"
            />
          )}
        </div>

        {/* Etapa */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Etapa</label>
          {readOnly ? (
            <div className="text-sm p-2 bg-gray-50 rounded">{item.etapa_adicional || '-'}</div>
          ) : (
            <Select
              value={item.etapa_adicional || ''}
              onValueChange={(value) => onUpdate(item.id, 'etapa_adicional', value || null)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Sem etapa..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Sem etapa</SelectItem>
                {etapasDisponiveis.map(e => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Localização */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Localização</label>
          <Textarea
            value={item.localizacao}
            onChange={(e) => onUpdate(item.id, 'localizacao', e.target.value)}
            className="w-full text-sm print:border-none print:bg-transparent resize-none"
            rows={3}
            disabled={readOnly}
            placeholder="Localização..."
          />
        </div>

        {/* Tempo */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Tempo (horas)</label>
          <Input
            type="number"
            min="0"
            step="0.5"
            value={item.tempo_atendimento !== null && item.tempo_atendimento !== undefined ? String(Number(item.tempo_atendimento)) : ''}
            onChange={(e) => onUpdate(item.id, 'tempo_atendimento', e.target.value ? parseFloat(e.target.value) : null)}
            className="h-9 text-sm print:border-none print:bg-transparent"
            disabled={readOnly}
            placeholder="0.0"
          />
        </div>

        {/* Status */}
        <div>
          <label className="text-xs font-bold text-gray-700 block mb-1 uppercase tracking-wide">Status</label>
          {readOnly ? (
            <div className={`text-sm p-2 rounded text-center font-semibold ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-700'}`}>
              {item.status || 'Sem status'}
            </div>
          ) : (
            <Select
              value={item.status}
              onValueChange={(value) => onUpdate(item.id, 'status', value)}
            >
              <SelectTrigger className={`h-9 text-sm font-semibold print:border-none print:bg-transparent ${STATUS_TRIGGER_COLORS[item.status] || 'bg-gray-50'}`}>
                <SelectValue placeholder="Sem status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Sem status</SelectItem>
                <SelectItem value="Em andamento">Em andamento</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Concluído">Concluído</SelectItem>
                <SelectItem value="Cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
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
});

export default PREItemRow;