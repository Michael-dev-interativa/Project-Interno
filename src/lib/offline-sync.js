import { offlineDb } from '@/lib/offline-db';
import {
  getPendingOfflineMutations,
  markOfflineMutationProcessing,
  markOfflineMutationDone,
  markOfflineMutationFailed,
  queueStatus
} from '@/lib/offline-queue';

// Identifies browser fetch network failures (distinct from HTTP errors)
export function isNetworkError(err) {
  return (
    err instanceof TypeError &&
    (err.message.toLowerCase().includes('fetch') ||
      err.message.toLowerCase().includes('network') ||
      err.message.toLowerCase().includes('failed to fetch'))
  );
}

// Process all pending/retryable items in the queue. Returns { synced, failed }.
export async function processSyncQueue() {
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  // Re-queue failed items that are past their retry delay
  const now = Date.now();
  const failedRetryable = await offlineDb.syncQueue
    .where('status')
    .equals(queueStatus.FAILED)
    .filter(item => item.retryAt <= now)
    .toArray();

  for (const item of failedRetryable) {
    await offlineDb.syncQueue.update(item.id, { status: queueStatus.PENDING });
  }

  const pending = await getPendingOfflineMutations(50);
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    await markOfflineMutationProcessing(item.id);
    try {
      const opts = {
        method: item.method,
        headers: { 'Content-Type': 'application/json', ...(item.headers || {}) }
      };
      if (item.payload && item.method !== 'DELETE') {
        opts.body = JSON.stringify(item.payload);
      }
      const res = await fetch(item.endpoint, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await markOfflineMutationDone(item.id);
      synced++;
    } catch (err) {
      const attempts = (item.attempts || 0) + 1;
      // Exponential backoff capped at 60s
      const backoffMs = Math.min(60_000, 5_000 * Math.pow(2, attempts - 1));
      await markOfflineMutationFailed(item.id, attempts, backoffMs);
      failed++;
    }
  }

  // Purge DONE entries older than 1 hour to keep IndexedDB clean
  const oneHourAgo = now - 60 * 60 * 1_000;
  await offlineDb.syncQueue
    .where('status')
    .equals(queueStatus.DONE)
    .filter(item => item.updatedAt < oneHourAgo)
    .delete();

  return { synced, failed };
}

// Callback refs so the badge can subscribe to sync lifecycle events
let _onSyncStart = null;
let _onSyncEnd = null;
let _registered = false;

export function setOnlineSyncCallbacks({ onStart, onEnd }) {
  _onSyncStart = onStart;
  _onSyncEnd = onEnd;
}

export function startOnlineSyncListener() {
  if (_registered || typeof window === 'undefined') return;
  _registered = true;

  window.addEventListener('online', async () => {
    _onSyncStart?.();
    const result = await processSyncQueue();
    _onSyncEnd?.(result);
  });
}
