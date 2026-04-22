const crypto = require('crypto');

const SESSION_SECRET = process.env.AUTH_SECRET || process.env.JWT_SECRET || 'project-oficial-local-auth';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const ALLOWED_PROFILES = new Set(['admin', 'direcao', 'lider', 'gestao', 'coordenador', 'apoio', 'consultor', 'user']);

function normalizeProfile(raw) {
  const value = String(raw || '').trim().toLowerCase();
  const aliases = {
    administrador: 'admin',
    colaborador: 'user',
    usuario: 'user',
    direção: 'direcao',
    líder: 'lider',
    gestão: 'gestao',
  };

  const normalized = aliases[value] || value;
  if (!normalized) return 'user';
  return ALLOWED_PROFILES.has(normalized) ? normalized : 'user';
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(value) {
  const normalized = String(value)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPayload(payload) {
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function toPublicUser(user) {
  if (!user) return null;

  const profile = normalizeProfile(user.role || user.perfil);
  const role = profile === 'admin' ? 'admin' : 'user';

  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    nome: user.name || null,
    full_name: user.name || null,
    role,
    perfil: profile,
    datas_indisponiveis: Array.isArray(user.datas_indisponiveis) ? user.datas_indisponiveis : [],
    usuarios_permitidos_visualizar: Array.isArray(user.usuarios_permitidos_visualizar) ? user.usuarios_permitidos_visualizar : [],
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function hashPassword(password) {
  const normalizedPassword = String(password || '').trim();
  if (!normalizedPassword) {
    throw new Error('Senha inválida');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(normalizedPassword, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  const normalizedPassword = String(password || '');
  const persistedValue = String(storedHash || '');

  if (!normalizedPassword || !persistedValue) return false;

  if (persistedValue.startsWith('scrypt$')) {
    const [, salt, hash] = persistedValue.split('$');
    if (!salt || !hash) return false;

    const derived = crypto.scryptSync(normalizedPassword, salt, 64);
    const persistedBuffer = Buffer.from(hash, 'hex');

    if (derived.length !== persistedBuffer.length) return false;
    return crypto.timingSafeEqual(derived, persistedBuffer);
  }

  return persistedValue === normalizedPassword;
}

function createSessionToken(user) {
  const payload = base64UrlEncode(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Date.now() + SESSION_TTL_MS,
  }));

  return `${payload}.${signPayload(payload)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (!decoded?.sub || !decoded?.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch (error) {
    return null;
  }
}

module.exports = {
  normalizeProfile,
  createSessionToken,
  hashPassword,
  toPublicUser,
  verifyPassword,
  verifySessionToken,
};