import { offlineDb } from '@/lib/offline-db';

export const queueStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  FAILED: 'failed',
  DONE: 'done'
};

export async function enqueueOfflineMutation({
  entity,
  operation,
  payload,
  endpoint,
  method,
  headers
}) {
  const now = Date.now();

  return offlineDb.syncQueue.add({
    entity,
    operation,
    payload,
    endpoint,
    method,
    headers,
    status: queueStatus.PENDING,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    retryAt: now
  });
}

export async function getPendingOfflineMutations(limit = 50) {
  return offlineDb.syncQueue
    .where('status')
    .equals(queueStatus.PENDING)
    .limit(limit)
    .toArray();
}

export async function markOfflineMutationProcessing(id) {
  return offlineDb.syncQueue.update(id, {
    status: queueStatus.PROCESSING,
    updatedAt: Date.now()
  });
}

export async function markOfflineMutationDone(id) {
  return offlineDb.syncQueue.update(id, {
    status: queueStatus.DONE,
    updatedAt: Date.now()
  });
}

export async function markOfflineMutationFailed(id, attempts = 1, retryInMs = 10000) {
  return offlineDb.syncQueue.update(id, {
    status: queueStatus.FAILED,
    attempts,
    retryAt: Date.now() + retryInMs,
    updatedAt: Date.now()
  });
}

export async function removeOfflineMutation(id) {
  return offlineDb.syncQueue.delete(id);
}

export async function getOfflineQueueStats() {
  const [pending, processing, failed, done] = await Promise.all([
    offlineDb.syncQueue.where('status').equals(queueStatus.PENDING).count(),
    offlineDb.syncQueue.where('status').equals(queueStatus.PROCESSING).count(),
    offlineDb.syncQueue.where('status').equals(queueStatus.FAILED).count(),
    offlineDb.syncQueue.where('status').equals(queueStatus.DONE).count()
  ]);

  return { pending, processing, failed, done, total: pending + processing + failed + done };
}
