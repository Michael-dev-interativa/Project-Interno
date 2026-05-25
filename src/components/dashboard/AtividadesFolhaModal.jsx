// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { PlanejamentoAtividade } from '@/entities/all';

const STATUS_LABELS = {
  nao_iniciado: 'Não Iniciado',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  concluido_com_atraso: 'Concluído c/ Atraso',
  atrasado: 'Atrasado',
  atrasado_nao_iniciado: 'Atrasado (Não Iniciado)',
  atrasado_em_andamento: 'Atrasado (Em Andamento)',
  pausado: 'Pausado',
};

const STATUS_COLORS = {
  concluido: 'bg-green-100 text-green-700 border-green-200',
  concluido_com_atraso: 'bg-orange-100 text-orange-700 border-orange-200',
  em_andamento: 'bg-blue-100 text-blue-700 border-blue-200',
  atrasado: 'bg-red-100 text-red-700 border-red-200',
  atrasado_nao_iniciado: 'bg-red-100 text-red-700 border-red-200',
  atrasado_em_andamento: 'bg-red-100 text-red-700 border-red-200',
  pausado: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  nao_iniciado: 'bg-gray-100 text-gray-600 border-gray-200',
};

export default function AtividadesFolhaModal({ isOpen, onClose, planejamentoDocumento: plano, executorMap, allPlanejamentos }) {
  const [atividades, setAtividades] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !plano) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const etapaFiltro = plano.etapa;
        const documentoId = plano.documento_id;
        const result = [];
        const seen = new Set();

        const add = (items) => {
          if (!Array.isArray(items)) return;
          items.forEach(a => {
            if (!seen.has(a.id)) { seen.add(a.id); result.push(a); }
          });
        };

        // From allPlanejamentos already loaded in memory
        if (allPlanejamentos?.length) {
          add(allPlanejamentos.filter(p =>
            p.tipo_planejamento !== 'documento' && documentoId && p.documento_id === documentoId
          ));
        }

        // From API by documento_id
        if (documentoId) {
          try {
            add(await PlanejamentoAtividade.filter({ documento_id: documentoId }));
          } catch (_) {}
        }

        const filtered = etapaFiltro ? result.filter(a => a.etapa === etapaFiltro) : result;
        setAtividades(filtered);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [isOpen, plano?.id]);

  const etapa = plano?.etapa || 'Sem Etapa';
  const docDisplay = plano?.documento?.numero || plano?.documento?.arquivo || plano?.descritivo || 'Documento';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atividades da Folha</DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-medium">{docDisplay}</span> — Etapa:{' '}
            <span className="font-medium text-indigo-600">{etapa}</span>
          </p>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mr-2" />
              <span className="text-gray-500 text-sm">Carregando atividades...</span>
            </div>
          ) : atividades.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              Nenhuma atividade encontrada para esta folha na etapa <strong>{etapa}</strong>.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-2">{atividades.length} atividade(s) encontrada(s)</p>
              {atividades.map((atividade) => {
                const status = atividade.status || 'nao_iniciado';
                const executor = executorMap?.[atividade.executor_principal];
                const nome = atividade.atividade?.atividade || atividade.descritivo || atividade.titulo || 'Atividade';

                return (
                  <div key={atividade.id} className="p-3 border border-gray-200 rounded-lg bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-800 truncate" title={nome}>{nome}</p>
                        {atividade.subdisciplina && (
                          <p className="text-xs text-blue-600 mt-0.5">{atividade.subdisciplina}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                          {atividade.tempo_planejado != null && (
                            <span>Planejado: <strong>{Number(atividade.tempo_planejado).toFixed(1)}h</strong></span>
                          )}
                          {Number(atividade.tempo_executado) > 0 && (
                            <span>Executado: <strong>{Number(atividade.tempo_executado).toFixed(1)}h</strong></span>
                          )}
                          {executor && (
                            <span>Executor: <strong>{executor.nome || executor.email}</strong></span>
                          )}
                        </div>
                      </div>
                      <Badge className={`text-xs shrink-0 border ${STATUS_COLORS[status] || STATUS_COLORS.nao_iniciado}`}>
                        {STATUS_LABELS[status] || status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
