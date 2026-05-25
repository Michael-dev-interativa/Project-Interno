// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Analitico, Atividade } from '@/entities/all';

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
  nao_planejado: 'bg-purple-50 text-purple-600 border-purple-200',
};

export default function AtividadesFolhaModal({ isOpen, onClose, planejamentoDocumento: plano, executorMap, allPlanejamentos }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !plano) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const documentoId = String(plano.documento_id || '');
        const etapaFiltro = plano.etapa;

        // 1. Fetch all Analitico records for this document
        const analiticos = await Analitico.filter({ documento_id: documentoId });

        // 2. Filter by stage
        const filtrados = etapaFiltro
          ? analiticos.filter(a => a.etapa === etapaFiltro)
          : analiticos;

        if (filtrados.length === 0) { setRows([]); return; }

        // 3. Resolve activity names from Atividade entity (bulk)
        const atividadeIds = [...new Set(filtrados.map(a => a.atividade_id).filter(Boolean))];
        let atividadesMap = {};
        if (atividadeIds.length > 0) {
          try {
            const atividadesData = await Atividade.filter({ id: { $in: atividadeIds } });
            atividadesData.forEach(a => { atividadesMap[String(a.id)] = a; });
          } catch (_) {}
        }

        // 4. Cross with allPlanejamentos to get planning status per analitico
        const analiticoIdSet = new Set(filtrados.map(a => String(a.id)));
        const planejamentosDoDoc = (allPlanejamentos || []).filter(p =>
          p.tipo_planejamento !== 'documento' &&
          p.analitico_id && analiticoIdSet.has(String(p.analitico_id))
        );

        // Build map: analitico_id → best planejamento (prefer em_andamento > nao_iniciado > concluido)
        const planMap = {};
        planejamentosDoDoc.forEach(p => {
          const key = String(p.analitico_id);
          if (!planMap[key]) { planMap[key] = p; return; }
          // prefer active over finished
          const priority = { em_andamento: 3, nao_iniciado: 2, concluido: 1, concluido_com_atraso: 0 };
          if ((priority[p.status] ?? -1) > (priority[planMap[key].status] ?? -1)) planMap[key] = p;
        });

        // 5. Build display rows
        const result = filtrados.map(analitico => {
          const ativ = atividadesMap[String(analitico.atividade_id)];
          const plan = planMap[String(analitico.id)];
          const executor = plan?.executor_principal ? executorMap?.[plan.executor_principal] : null;
          return {
            key: analitico.id,
            nome: ativ?.atividade || analitico.descritivo || `Atividade #${analitico.atividade_id}`,
            subdisciplina: ativ?.subdisciplina || null,
            tempoPlanejado: analitico.tempo_real || 0,
            tempoExecutado: plan ? (Number(plan.tempo_executado) || 0) : null,
            status: plan ? (plan.status || 'nao_iniciado') : 'nao_planejado',
            executor,
          };
        });

        setRows(result);
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
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              Nenhuma atividade encontrada para esta folha na etapa <strong>{etapa}</strong>.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-2">{rows.length} atividade(s) encontrada(s)</p>
              {rows.map((row) => (
                <div key={row.key} className="p-3 border border-gray-200 rounded-lg bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate" title={row.nome}>{row.nome}</p>
                      {row.subdisciplina && (
                        <p className="text-xs text-blue-600 mt-0.5">{row.subdisciplina}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                        {row.tempoPlanejado > 0 && (
                          <span>Planejado: <strong>{Number(row.tempoPlanejado).toFixed(1)}h</strong></span>
                        )}
                        {row.tempoExecutado !== null && row.tempoExecutado > 0 && (
                          <span>Executado: <strong>{Number(row.tempoExecutado).toFixed(1)}h</strong></span>
                        )}
                        {row.executor && (
                          <span>Executor: <strong>{row.executor.nome || row.executor.email}</strong></span>
                        )}
                      </div>
                    </div>
                    <Badge className={`text-xs shrink-0 border ${STATUS_COLORS[row.status] || STATUS_COLORS.nao_iniciado}`}>
                      {STATUS_LABELS[row.status] || row.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
