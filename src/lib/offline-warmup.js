import { buildReadCacheKey, setReadCache } from '@/lib/offline-read-cache';
import { offlineDb } from '@/lib/offline-db';

const LOCAL_AUTH_TOKEN_KEY = 'project_auth_token';
const WARMUP_LAST_SUCCESS_KEY = 'offline_warmup_last_success_at';
const WARMUP_COOLDOWN_MS = 1000 * 60 * 15;

export const CRITICAL_ENDPOINTS = [
  { entity: 'empreendimentos', path: '/api/empreendimentos', listParams: { limit: 200, offset: 0 } },
  { entity: 'users', path: '/api/users', listParams: { limit: 200, offset: 0 } },
  { entity: 'planejamentos', path: '/api/planejamentos', listParams: { limit: 300, offset: 0 } },
  { entity: 'atividades', path: '/api/atividades', listParams: { limit: 300, offset: 0 } },
  { entity: 'documentos', path: '/api/documentos', listParams: { limit: 300, offset: 0 } },
  { entity: 'notificacoes', path: '/api/notificacoes', listParams: { limit: 200, offset: 0 } },
  { entity: 'comerciais', path: '/api/comerciais', listParams: { limit: 200, offset: 0 } }
];

export const CRITICAL_ENTITIES = new Set(CRITICAL_ENDPOINTS.map(e => e.entity));

let running = false;
let listenerRegistered = false;

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) qs.set(key, String(value));
  });
  const out = qs.toString();
  return out ? `?${out}` : '';
}

function getAuthHeaders() {
  if (typeof window === 'undefined') return {};
  const token = window.localStorage.getItem(LOCAL_AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function shouldSkipWarmup() {
  if (typeof window === 'undefined') return true;
  const raw = window.localStorage.getItem(WARMUP_LAST_SUCCESS_KEY);
  if (!raw) return false;
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < WARMUP_COOLDOWN_MS;
}

async function fetchAndCacheEndpoint(definition) {
  const query = buildQuery(definition.listParams);
  const url = `${definition.path}${query}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    }
  });

  if (!response.ok) {
    throw new Error(`Warmup failed for ${definition.entity}: HTTP ${response.status}`);
  }

  const data = await response.json();
  const cacheKey = buildReadCacheKey(definition.entity, 'list', definition.listParams);
  await setReadCache(cacheKey, definition.entity, data);
  return data;
}

export async function runOfflineWarmup({ force = false } = {}) {
  if (typeof window === 'undefined') return { warmed: 0, failed: 0, skipped: true };
  if (!navigator.onLine) return { warmed: 0, failed: 0, skipped: true };
  if (running) return { warmed: 0, failed: 0, skipped: true };
  if (!force && shouldSkipWarmup()) return { warmed: 0, failed: 0, skipped: true };

  running = true;
  let warmed = 0;
  let failed = 0;

  try {
    // Remover entradas órfãs do cache (entidades fora dos endpoints críticos)
    const allRows = await offlineDb.readCache.toArray();
    const orphanKeys = allRows
      .filter(row => row.entity && !CRITICAL_ENTITIES.has(row.entity))
      .map(row => row.cacheKey);
    if (orphanKeys.length > 0) {
      await offlineDb.readCache.bulkDelete(orphanKeys);
    }

    const results = await Promise.allSettled(CRITICAL_ENDPOINTS.map(fetchAndCacheEndpoint));
    results.forEach(result => {
      if (result.status === 'fulfilled') warmed++;
      else failed++;
    });

    if (warmed > 0) {
      window.localStorage.setItem(WARMUP_LAST_SUCCESS_KEY, String(Date.now()));
    }

    return { warmed, failed, skipped: false };
  } finally {
    running = false;
  }
}

export function startOfflineWarmup() {
  if (typeof window === 'undefined') return;

  if (!listenerRegistered) {
    window.addEventListener('online', () => {
      runOfflineWarmup({ force: false }).catch(() => {});
    });
    listenerRegistered = true;
  }

  runOfflineWarmup({ force: false }).catch(() => {});
}
