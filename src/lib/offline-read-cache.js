import { offlineDb } from '@/lib/offline-db';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24;

function stableSerialize(value) {
  if (!value) return '';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${key}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return String(value);
}

export function buildReadCacheKey(entity, operation, params) {
  return `${entity}::${operation}::${stableSerialize(params)}`;
}

export async function setReadCache(cacheKey, entity, data) {
  const now = Date.now();
  await offlineDb.readCache.put({
    cacheKey,
    entity,
    data,
    updatedAt: now
  });
}

export async function getReadCache(cacheKey, ttlMs = DEFAULT_TTL_MS) {
  const row = await offlineDb.readCache.get(cacheKey);
  if (!row) return null;

  const isExpired = Date.now() - row.updatedAt > ttlMs;
  if (isExpired) return null;

  return row.data;
}
