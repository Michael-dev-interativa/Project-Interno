import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { offlineDb } from '@/lib/offline-db';
import { queueStatus } from '@/lib/offline-queue';
import { setOnlineSyncCallbacks, processSyncQueue } from '@/lib/offline-sync';

export default function NetworkStatusBadge() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);

  // Live count of pending/failed items from IndexedDB
  const pendingCount = useLiveQuery(
    () =>
      offlineDb.syncQueue
        .where('status')
        .anyOf([queueStatus.PENDING, queueStatus.PROCESSING, queueStatus.FAILED])
        .count(),
    [],
    0
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setLastSyncResult(null);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Wire sync lifecycle callbacks into the global listener
  useEffect(() => {
    setOnlineSyncCallbacks({
      onStart: () => { setSyncing(true); setLastSyncResult(null); },
      onEnd: (result) => { setSyncing(false); setLastSyncResult(result); }
    });
  }, []);

  // Manual retry button handler
  const handleManualSync = async () => {
    if (!isOnline || syncing) return;
    setSyncing(true);
    setLastSyncResult(null);
    const result = await processSyncQueue();
    setSyncing(false);
    setLastSyncResult(result);
  };

  // Don't render when online and nothing pending/syncing
  if (isOnline && pendingCount === 0 && !syncing && !lastSyncResult) return null;

  const baseClasses = 'fixed right-4 top-4 z-[80] flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium shadow-sm border transition-all duration-300';

  if (!isOnline) {
    return (
      <div className={`${baseClasses} border-amber-300 bg-amber-50 text-amber-800`} aria-live="polite">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span>Offline{pendingCount > 0 ? ` · ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : ''}</span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div className={`${baseClasses} border-blue-200 bg-blue-50 text-blue-700`} aria-live="polite">
        <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
        <span>Sincronizando…</span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        className={`${baseClasses} border-amber-300 bg-amber-50 text-amber-800 cursor-pointer hover:bg-amber-100`}
        onClick={handleManualSync}
        title="Clique para tentar sincronizar agora"
        aria-live="polite"
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{pendingCount} pendente{pendingCount > 1 ? 's' : ''}</span>
        <RefreshCw className="h-3 w-3 shrink-0 opacity-60" />
      </div>
    );
  }

  if (lastSyncResult) {
    return (
      <div className={`${baseClasses} border-emerald-200 bg-emerald-50 text-emerald-700`} aria-live="polite">
        <Wifi className="h-4 w-4 shrink-0" />
        <span>Sincronizado · {lastSyncResult.synced} enviado{lastSyncResult.synced !== 1 ? 's' : ''}</span>
      </div>
    );
  }

  return null;
}
