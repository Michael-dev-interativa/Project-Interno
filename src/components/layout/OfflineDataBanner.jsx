import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { offlineDb } from '@/lib/offline-db';
import { runOfflineWarmup, CRITICAL_ENTITIES } from '@/lib/offline-warmup';

const STALE_THRESHOLD_MS = 1000 * 60 * 60 * 6;

/** @param {number} timestamp */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'nunca';
  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min atrás`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h atrás`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d atrás`;
}

export default function OfflineDataBanner() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const cacheRows = useLiveQuery(() => offlineDb.readCache.toArray(), [], []);

  const { staleCount, lastUpdatedAt } = useMemo(() => {
    const now = Date.now();
    let stale = 0;
    let latest = 0;

    for (const row of cacheRows || []) {
      if (!row?.updatedAt || !row?.entity) continue;
      // Ignorar entradas que não são de módulos críticos (entradas órfãs de versões antigas)
      if (!CRITICAL_ENTITIES.has(row.entity)) continue;
      latest = Math.max(latest, row.updatedAt);
      if (now - row.updatedAt > STALE_THRESHOLD_MS) stale++;
    }

    return { staleCount: stale, lastUpdatedAt: latest || 0 };
  }, [cacheRows]);

  const handleRefresh = async () => {
    if (refreshing || !isOnline) return;
    setRefreshing(true);
    setRefreshMessage('');

    try {
      const result = await runOfflineWarmup({ force: true });
      if (result.skipped) {
        setRefreshMessage('Atualização ignorada (sem conexão).');
      } else {
        setRefreshMessage(`Atualizado: ${result.warmed} módulos, falhas: ${result.failed}.`);
      }
    } catch (error) {
      setRefreshMessage('Falha ao atualizar dados offline.');
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMessage(''), 6000);
    }
  };

  if (!isOnline && !lastUpdatedAt) {
    return (
      <div className="mx-6 mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex items-center gap-2">
        <WifiOff className="h-4 w-4" />
        <span>Sem conexão e sem cache local disponível.</span>
      </div>
    );
  }

  if (isOnline && staleCount === 0 && !refreshMessage) return null;

  const bannerClass = !isOnline
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : staleCount > 0
      ? 'border-orange-300 bg-orange-50 text-orange-900'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  return (
    <div className={`mx-6 mt-4 rounded-md border px-3 py-2 text-xs ${bannerClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        {!isOnline ? <WifiOff className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        <span>
          {!isOnline
            ? `Modo offline ativo. Última atualização: ${formatTimeAgo(lastUpdatedAt)}.`
            : staleCount > 0
              ? `Dados possivelmente desatualizados em ${staleCount} módulo(s). Última atualização: ${formatTimeAgo(lastUpdatedAt)}.`
              : 'Dados offline atualizados com sucesso.'}
        </span>
        {isOnline && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded border border-current px-2 py-1 text-[11px] font-medium hover:opacity-90 disabled:opacity-60"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Atualizando...' : 'Atualizar agora'}
          </button>
        )}
      </div>
      {refreshMessage && <p className="mt-1 opacity-90">{refreshMessage}</p>}
    </div>
  );
}
