import Dexie from 'dexie';

/**
 * @typedef {object} SyncQueueRow
 * @property {number} [id]
 * @property {string} [entity]
 * @property {string} [operation]
 * @property {string} [status]
 * @property {number} [createdAt]
 * @property {number} [retryAt]
 * @property {number} [updatedAt]
 * @property {number} [attempts]
 * @property {string} [endpoint]
 * @property {string} [method]
 * @property {Record<string, string>} [headers]
 * @property {any} [payload]
 */

/**
 * @typedef {object} KeyValueRow
 * @property {string} key
 * @property {any} [value]
 * @property {number} [updatedAt]
 */

/**
 * @typedef {object} ReadCacheRow
 * @property {string} cacheKey
 * @property {string} [entity]
 * @property {any} [data]
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Dexie & {
 *   syncQueue: import('dexie').Table<SyncQueueRow, number>,
 *   keyValue: import('dexie').Table<KeyValueRow, string>,
 *   readCache: import('dexie').Table<ReadCacheRow, string>
 * }} OfflineDb
 */

/** @type {OfflineDb} */
export const offlineDb = /** @type {OfflineDb} */ (new Dexie('project_oficial_offline'));

offlineDb.version(1).stores({
  syncQueue: '++id,entity,operation,status,createdAt,retryAt',
  keyValue: '&key,updatedAt'
});

offlineDb.version(2).stores({
  syncQueue: '++id,entity,operation,status,createdAt,retryAt',
  keyValue: '&key,updatedAt',
  readCache: '&cacheKey,entity,updatedAt'
});
