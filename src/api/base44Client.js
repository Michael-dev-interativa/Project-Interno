// @ts-nocheck
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import * as LocalEntities from '@/entities/all';

const { appId, serverUrl, token, functionsVersion } = appParams;

// If Base44 config is present, create real client. Otherwise provide a
// lightweight fallback to avoid runtime requests to `null` URLs during dev.
let base44;
if (appId && serverUrl) {
  base44 = createClient({
    appId,
    serverUrl,
    token,
    functionsVersion,
    requiresAuth: false
  });
} else {
  // Fallback shim: expose `entities`, `auth`, `integrations` with minimal API
  const apiOrigin = (import.meta?.env?.VITE_API_BASE_URL || (import.meta?.env?.DEV ? 'http://localhost:4000' : '')).replace(/\/$/, '');
  const LOCAL_AUTH_TOKEN_KEY = 'project_auth_token';
  const LOCAL_AUTH_USER_KEY = 'project_auth_user';

  // Helper to convert PascalCase/CamelCase to snake_case path
  const toSnake = (name) => name
    .replace(/([A-Z]+)/g, '_$1')
    .replace(/^_/, '')
    .replace(/__+/g, '_')
    .toLowerCase();

  const makeEntityClient = (path) => {
    const base = `${apiOrigin}/api/${path}`;
    const q = (obj) => {
      if (!obj) return '';
      return '?' + Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    };
    return {
      list: async (sort = null, limit = 100, offset = 0) => {
        const params = {};
        if (sort) params.sort = sort;
        if (limit) params.limit = limit;
        if (offset) params.offset = offset;
        const res = await fetch(base + q(params));
        return res.ok ? res.json() : Promise.reject(new Error(await res.text()));
      },
      filter: async (params) => {
        const res = await fetch(base + q(params));
        return res.ok ? res.json() : Promise.reject(new Error(await res.text()));
      },
      get: async (id) => {
        const res = await fetch(`${base}/${id}`);
        return res.ok ? res.json() : null;
      },
      create: async (data) => {
        const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.ok ? res.json() : Promise.reject(new Error(await res.text()));
      },
      update: async (id, data) => {
        const res = await fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        return res.ok ? res.json() : Promise.reject(new Error(await res.text()));
      },
      delete: async (id) => {
        const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const errText = await res.text();
          return Promise.reject(new Error(errText || `HTTP ${res.status}`));
        }
        // No content (204) or empty body - return null
        if (res.status === 204) return null;
        const txt = await res.text();
        if (!txt) return null;
        try { return JSON.parse(txt); } catch (e) { return txt; }
      },
      bulkCreate: async (items) => Promise.all((items || []).map(i => makeEntityClient(path).create(i)))
    };
  };

  const entitiesProxy = new Proxy({ ...LocalEntities }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      const snake = toSnake(prop);
      // return a generated client for this entity name
      return makeEntityClient(snake);
    }
  });

  base44 = {
    // map local entity shims via proxy
    entities: entitiesProxy,
    // minimal auth surface used by the app
    auth: {
      me: async () => {
        try {
          const item = window.localStorage.getItem(LOCAL_AUTH_USER_KEY);
          return item ? JSON.parse(item) : null;
        } catch (e) {
          return null;
        }
      },
      logout: () => {
        try {
          window.localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
          window.localStorage.removeItem(LOCAL_AUTH_USER_KEY);
        } catch (e) {
          // noop
        }
      },
      redirectToLogin: () => {
        if (typeof window !== 'undefined') {
          window.location.assign('/login');
        }
      }
    },
    // minimal integrations shim to avoid errors (UploadFile returns empty url)
    integrations: {
      Core: {
        UploadFile: async ({ file } = { file: null }) => ({ file_url: '' }),
        InvokeLLM: async () => { throw new Error('InvokeLLM not configured in dev'); },
        SendEmail: async () => { throw new Error('SendEmail not configured in dev'); },
        SendSMS: async () => { throw new Error('SendSMS not configured in dev'); }
      }
    },
    appLogs: {
      logUserInApp: async () => { /* no-op */ }
    }
  };
}

export { base44 };
