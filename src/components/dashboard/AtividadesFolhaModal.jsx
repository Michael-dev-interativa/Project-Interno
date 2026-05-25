// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Analitico, Atividade, PlanejamentoAtividade } from '@/entities/all';

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

const PLAN_PRIORITY = { em_andamento: 3, nao_iniciado: 2, atrasado: 2, concluido: 1, concluido_com_atraso: 0 };

export default function AtividadesFolhaModal({ isOpen, onClose, planejamentoDocumento: plano, executorMap, allPlanejamentos }) {
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    if (!isOpen || !plano) return;

    const load = async () => {
      setIsLoading(true);
      setDebugInfo(null);
      try {
        const docId = String(plano.documento_id || '');
        const etapaFiltro = plano.etapa || null;

        // Strategy 1: use PlanejamentoAtividade.list() (cached from CalendarioPlanejamento)
        // This is already in memory from when the calendar loaded.
        const allPlanos = await PlanejamentoAtividade.list();
        const planosDoDoc = allPlanos.filter(p => String(p.documento_id) === docId);

        if (planosDoDoc.length > 0) {
          // Fetch the Analitico records referenced by these plans (to get etapa + tempo_real)
          const analiticoIds = [...new Set(planosDoDoc.map(p => p.analitico_id).filter(Boolean).map(String))];
          let analiticoMap = {};
          if (analiticoIds.length > 0) {
            try {
              const analiticos = await Analitico.filter({ id: { $in: analiticoIds } });
              analiticos.forEach(a => { analiticoMap[String(a.id)] = a; });
            } catch (_) {}
          }

          // Filter by etapa (compare against the Analitico's etapa)
          const filtrados = etapaFiltro
            ? planosDoDoc.filter(p => {
                const a = analiticoMap[String(p.analitico_id)];
                // If Analitico not found or has no etapa, fallback to plan's own etapa field
                const etapaReal = a?.etapa || p.etapa || null;
                return etapaReal === etapaFiltro;
              })
            : planosDoDoc;

          if (filtrados.length === 0) {
            // Debug: show what etapas were found
            const etapasEncontradas = [...new Set(
              planosDoDoc.map(p => analiticoMap[String(p.analitico_id)]?.etapa || p.etapa || '(sem etapa)'))
            ];
            setDebugInfo({ docId, etapaFiltro, totalPlanos: planosDoDoc.length, etapasEncontradas });
            setRows([]);
            return;
          }

          // Bulk-fetch atividade names
          const atividadeIds = [...new Set(filtrados.map(p => p.atividade_id).filter(Boolean).map(String))];
          let atividadesMap = {};
          if (atividadeIds.length > 0) {
            try {
              const atividadesData = await Atividade.filter({ id: { $in: atividadeIds } });
              atividadesData.forEach(a => { atividadesMap[String(a.id)] = a; });
            } catch (_) {}
          }

          // Group by analitico_id, pick best status plan per analitico
          const bestPlanByAnalitico = {};
          filtrados.forEach(p => {
            const key = p.analitico_id ? String(p.analitico_id) : `plan-${p.id}`;
            if (!bestPlanByAnalitico[key]) { bestPlanByAnalitico[key] = p; return; }
            const prev = bestPlanByAnalitico[key];
            if ((PLAN_PRIORITY[p.status] ?? -1) > (PLAN_PRIORITY[prev.status] ?? -1)) {
              bestPlanByAnalitico[key] = p;
            }
          });

          const result = Object.values(bestPlanByAnalitico).map(plan => {
            const ativ = atividadesMap[String(plan.atividade_id)];
            const analitico = analiticoMap[String(plan.analitico_id)];
            const executor = plan.executor_principal ? executorMap?.[plan.executor_principal] : null;
            return {
              key: String(plan.id),
              nome: ativ?.atividade || plan.descritivo || analitico?.descritivo || `Atividade #${plan.atividade_id}`,
              subdisciplina: ativ?.subdisciplina || null,
              tempoPlanejado: analitico?.tempo_real || plan.tempo_planejado || 0,
              tempoExecutado: plan.tempo_executado != null ? Number(plan.tempo_executado) : null,
              status: plan.status || 'nao_iniciado',
              executor,
            };
          });

          setRows(result);
          return;
        }

        // Strategy 2: fallback — fetch Analitico directly by documento_id
        if (docId) {
          const analiticos = await Analitico.filter({ documento_id: docId });
          const filtrados = etapaFiltro
            ? analiticos.filter(a => a.etapa === etapaFiltro)
            : analiticos;

          if (filtrados.length === 0) {
            setDebugInfo({ docId, etapaFiltro, totalAnaliticos: analiticos.length, strategy: 'analitico' });
            setRows([]);
            return;
          }

          const atividadeIds = [...new Set(filtrados.map(a => a.atividade_id).filter(Boolean))];
          let atividadesMap = {};
          if (atividadeIds.length > 0) {
            try {
              const atividadesData = await Atividade.filter({ id: { $in: atividadeIds } });
              atividadesData.forEach(a => { atividadesMap[String(a.id)] = a; });
            } catch (_) {}
          }

          // Cross with allPlanejamentos for status
          const analiticoIdSet = new Set(filtrados.map(a => String(a.id)));
          const planosVinculados = (allPlanejamentos || []).filter(p =>
            p.tipo_planejamento !== 'documento' && p.analitico_id && analiticoIdSet.has(String(p.analitico_id))
          );
          const planMap = {};
          planosVinculados.forEach(p => {
            const key = String(p.analitico_id);
            if (!planMap[key]) { planMap[key] = p; return; }
            if ((PLAN_PRIORITY[p.status] ?? -1) > (PLAN_PRIORITY[planMap[key].status] ?? -1)) planMap[key] = p;
          });

          const result = filtrados.map(analitico => {
            const ativ = atividadesMap[String(analitico.atividade_id)];
            const plan = planMap[String(analitico.id)];
            const executor = plan?.executor_principal ? executorMap?.[plan.executor_principal] : null;
            return {
              key: String(analitico.id),
              nome: ativ?.atividade || analitico.descritivo || `Atividade #${analitico.atividade_id}`,
              subdisciplina: ativ?.subdisciplina || null,
              tempoPlanejado: analitico.tempo_real || 0,
              tempoExecutado: plan ? (Number(plan.tempo_executado) || 0) : null,
              status: plan ? (plan.status || 'nao_iniciado') : 'nao_planejado',
              executor,
            };
          });

          setRows(result);
          return;
        }

        setDebugInfo({ docId, etapaFiltro, msg: 'documento_id ausente no planejamento' });
        setRows([]);
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
            <div className="text-center py-10 text-gray-500 text-sm space-y-2">
              <p>Nenhuma atividade encontrada para esta folha na etapa <strong>{etapa}</strong>.</p>
              {debugInfo && (
                <div className="text-left bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-500 space-y-1">
                  <p><strong>Documento ID:</strong> {debugInfo.docId || '(vazio)'}</p>
                  <p><strong>Etapa buscada:</strong> {debugInfo.etapaFiltro || '(nenhuma)'}</p>
                  {debugInfo.totalPlanos !== undefined && (
                    <p><strong>Planejamentos do documento:</strong> {debugInfo.totalPlanos}</p>
                  )}
                  {debugInfo.etapasEncontradas && (
                    <p><strong>Etapas encontradas:</strong> {debugInfo.etapasEncontradas.join(', ')}</p>
                  )}
                  {debugInfo.totalAnaliticos !== undefined && (
                    <p><strong>Analíticos do documento:</strong> {debugInfo.totalAnaliticos}</p>
                  )}
                  {debugInfo.msg && <p><strong>Info:</strong> {debugInfo.msg}</p>}
                </div>
              )}
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
