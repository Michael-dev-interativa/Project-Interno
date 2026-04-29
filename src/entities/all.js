// Cliente simples que mapeia chamadas de entidade para o servidor local (/api)
const PROD_BACKEND = 'https://project-interno-rati.onrender.com';
const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : PROD_BACKEND)).replace(/\/$/, '');
const LOCAL_AUTH_TOKEN_KEY = 'project_auth_token';
const LOCAL_AUTH_USER_KEY = 'project_auth_user';

function qs(obj) {
  if (!obj) return '';
  const parts = Object.entries(obj).map(([k, v]) => {
    let value = v;
    if (value === undefined || value === null) return null;
    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value);
      } catch (e) {
        value = String(value);
      }
    }
    return `${encodeURIComponent(k)}=${encodeURIComponent(value)}`;
  }).filter(Boolean);
  return parts.length ? `?${parts.join('&')}` : '';
}

function createEntity(path) {
  const base = `${API_BASE}/api/${path}`;
  return {
    list: async (sort = null, limit = 5000, offset = 0) => {
      const q = {};
      if (sort) q.sort = sort;
      if (limit) q.limit = limit;
      if (offset) q.offset = offset;
      const res = await fetch(base + qs(q));
      // Try to safely parse JSON; if response is HTML (e.g., dev server 404 page), return empty list
      try {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok) {
          const text = await res.text();
          return Promise.reject(new Error(text));
        }
        if (contentType.includes('application/json')) {
          return await res.json();
        }
        const text = await res.text();
        if (text.trim().startsWith('<')) return [];
        return JSON.parse(text);
      } catch (e) {
        return [];
      }
    },
    get: async (id) => {
      const res = await fetch(`${base}/${id}`);
      try {
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return await res.json();
        const text = await res.text();
        if (text.trim().startsWith('<')) return null;
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    },
    create: async (data) => {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      try {
        if (!res.ok) {
          const text = await res.text();
          return Promise.reject(new Error(text));
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return await res.json();
        const text = await res.text();
        if (text.trim().startsWith('<')) return null;
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    },
    update: async (id, data) => {
      const res = await fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      try {
        if (!res.ok) {
          const text = await res.text();
          return Promise.reject(new Error(text));
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return await res.json();
        const text = await res.text();
        if (text.trim().startsWith('<')) return null;
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    },
    delete: async (id) => {
      const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
      try {
        if (!res.ok) {
          const text = await res.text();
          return Promise.reject(new Error(text));
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return await res.json();
        const text = await res.text();
        if (text.trim().startsWith('<')) return null;
        return JSON.parse(text);
      } catch (e) {
        return null;
      }
    },
    filter: async (params) => {
      const res = await fetch(base + qs(params));
      try {
        if (!res.ok) {
          const text = await res.text();
          return Promise.reject(new Error(text));
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return await res.json();
        const text = await res.text();
        if (text.trim().startsWith('<')) return [];
        return JSON.parse(text);
      } catch (e) {
        return [];
      }
    }
  };
}

// Exportar entidades utilizadas pela aplicação
export const Empreendimento = createEntity('empreendimentos');
export const Documento = createEntity('documentos');
export const Usuario = createEntity('users');
export const User = Usuario; // alias

// Provide `me()` helper for compatibility with code that expects `User.me()`
User.me = async () => {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_AUTH_TOKEN_KEY) : null;
  try {
    const res = await fetch(`${API_BASE}/api/users/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.ok) {
      const body = await res.json();
      if (body) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(body));
        }
        return body;
      }
    }
  } catch (e) {
    // ignore
  }
  try {
    const item = window.localStorage.getItem(LOCAL_AUTH_USER_KEY);
    return item ? JSON.parse(item) : null;
  } catch (e) {
    return null;
  }
};
export const Analitico = createEntity('analiticos');
export const Atividade = createEntity('atividades');
export const PlanejamentoAtividade = createEntity('planejamentos');
export const Execucao = createEntity('execucoes');
export const PlanejamentoDocumento = createEntity('planejamento_documentos');
export const Pavimento = createEntity('pavimentos');
export const AtaReuniao = createEntity('atas_reuniao');
export const NotificacaoAtividade = createEntity('notificacoes');
export const AtividadeFuncao = createEntity('atividade-funcoes');
export const SobraUsuario = createEntity('sobras');
export const AlteracaoEtapa = createEntity('alteracoes');
export const OSManual = createEntity('os');
export const AlocacaoEquipe = createEntity('alocacao_equipe');
export const Proposta = createEntity('propostas');
export const Orcamento = createEntity('orcamentos');
export const Comercial = createEntity('comerciais');
export const Pavimentos = Pavimento;
export const Equipe = createEntity('equipes');
export const Disciplina = createEntity('disciplinas');
export const ItemPRE = createEntity('itempre');
export const ChecklistPlanejamento = createEntity('checklists');
export const ChecklistItem = createEntity('checklist_items');
export const AtividadeGenerica = createEntity('atividades_genericas');
export const DataCadastro = createEntity('data_cadastro');
// Compatibilidade: algumas páginas importam `AtividadesDoProjeto`
// que representa uma visão/filtragem das atividades por empreendimento.
export const AtividadesDoProjeto = createEntity('atividades');

// Default export for compatibility
export default {
  Empreendimento,
  Documento,
  Usuario,
  User,
  Analitico,
  Atividade,
  PlanejamentoAtividade,
  AlocacaoEquipe,
  PlanejamentoDocumento,
  Execucao
};
