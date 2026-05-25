// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { Atividade, Documento, PlanejamentoAtividade } from '@/entities/all';

const ETAPA_TEMPO_MAP = {
  'Concepção': 'tempo_concepcao',
  'Planejamento': 'tempo_planejamento',
  'Estudo Preliminar': 'tempo_estudo_preliminar',
  'Ante-Projeto': 'tempo_ante_projeto',
  'Projeto Básico': 'tempo_projeto_basico',
  'Projeto Executivo': 'tempo_projeto_executivo',
  'Liberado para Obra': 'tempo_liberado_obra',
};

const STATUS_LABELS = {
  nao_iniciado: 'Não Iniciado',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  concluido_com_atraso: 'Concluído c/ Atraso',
  atrasado: 'Atrasado',
  atrasado_nao_iniciado: 'Atrasado (Não Iniciado)',
  atrasado_em_andamento: 'Atrasado (Em Andamento)',
  pausado: 'Pausado',
  planejado: 'Planejada',
  nao_planejado: 'Não Planejada',
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
  planejado: 'bg-blue-50 text-blue-600 border-blue-200',
  nao_planejado: 'bg-purple-50 text-purple-600 border-purple-200',
};

const PLAN_PRIORITY = { em_andamento: 3, nao_iniciado: 2, atrasado: 2, concluido: 1, concluido_com_atraso: 0 };

export default function AtividadesFolhaModal({ isOpen, onClose, planejamentoDocumento: plano, executorMap }) {
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

        // Fetch the actual Documento record to get subdisciplinas/disciplinas
        // (plano.documento embedded object may not have these fields)
        let docRecord = plano.documento || {};
        if (docId) {
          try {
            const fetched = await Documento.get(docId);
            if (fetched) docRecord = { ...docRecord, ...fetched };
          } catch (_) {}
        }

        const subdisciplinas = Array.isArray(docRecord.subdisciplinas) && docRecord.subdisciplinas.length > 0
          ? docRecord.subdisciplinas
          : docRecord.subdisciplina ? [docRecord.subdisciplina] : [];
        const disciplinas = Array.isArray(docRecord.disciplinas) && docRecord.disciplinas.length > 0
          ? docRecord.disciplinas
          : docRecord.disciplina ? [docRecord.disciplina] : [];

        // Replicar lógica do DocumentoItem: Atividade.list() + filtro client-side
        // (Atividade.filter server-side não garante filtro por subdisciplina corretamente)
        let allActivities = [];
        if (subdisciplinas.length > 0 && disciplinas.length > 0) {
          try {
            const todasAtividades = await Atividade.list();
            allActivities = todasAtividades.filter(a =>
              !a.empreendimento_id &&
              a.tempo !== -999 &&
              (!etapaFiltro || a.etapa === etapaFiltro) &&
              disciplinas.includes(a.disciplina) &&
              subdisciplinas.includes(a.subdisciplina)
            );
          } catch (_) {}
        }

        if (allActivities.length === 0) {
          setDebugInfo({ docId, etapaFiltro, subdisciplinas, disciplinas, docNome: docRecord.numero || docRecord.arquivo });
          setRows([]);
          return;
        }

        // Get activity-level plan status from cached PlanejamentoAtividade
        const allPlanos = await PlanejamentoAtividade.list();
        const planosDoDoc = docId ? allPlanos.filter(p => String(p.documento_id) === docId) : [];

        const planByAtiv = {};
        planosDoDoc.forEach(p => {
          if (!p.atividade_id) return;
          const key = String(p.atividade_id);
          if (!planByAtiv[key]) { planByAtiv[key] = p; return; }
          if ((PLAN_PRIORITY[p.status] ?? -1) > (PLAN_PRIORITY[planByAtiv[key].status] ?? -1)) planByAtiv[key] = p;
        });

        const tempoField = etapaFiltro ? ETAPA_TEMPO_MAP[etapaFiltro] : null;

        const result = allActivities.map(ativ => {
          const plan = planByAtiv[String(ativ.id)];
          const executor = plan?.executor_principal ? executorMap?.[plan.executor_principal] : null;
          const tempoPlanejado = (tempoField && ativ[tempoField])
            ? Number(ativ[tempoField])
            : (plan?.tempo_planejado || ativ.tempo || 0);

          return {
            key: String(ativ.id),
            nome: ativ.atividade || ativ.descritivo || `Atividade #${ativ.id}`,
            subdisciplina: ativ.subdisciplina || null,
            tempoPlanejado,
            tempoExecutado: plan?.tempo_executado != null ? Number(plan.tempo_executado) : null,
            status: plan ? (plan.status || 'nao_iniciado') : 'planejado',
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
            <div className="text-center py-10 text-gray-500 text-sm space-y-2">
              <p>Nenhuma atividade encontrada para esta folha na etapa <strong>{etapa}</strong>.</p>
              {debugInfo && (
                <div className="text-left bg-gray-50 border border-gray-200 rounded p-3 text-xs text-gray-500 space-y-1">
                  <p><strong>Documento ID:</strong> {debugInfo.docId || '(vazio)'}</p>
                  <p><strong>Etapa buscada:</strong> {debugInfo.etapaFiltro || '(nenhuma)'}</p>
                  <p><strong>Subdisciplinas:</strong> {(debugInfo.subdisciplinas || []).join(', ') || '(nenhuma)'}</p>
                  <p><strong>Disciplinas:</strong> {(debugInfo.disciplinas || []).join(', ') || '(nenhuma)'}</p>
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
