import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Usuario } from '@/entities/all';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@base44/sdk/dist/utils/axios-client';

const AuthContext = createContext();
const LOCAL_AUTH_TOKEN_KEY = 'project_auth_token';
const LOCAL_AUTH_USER_KEY = 'project_auth_user';
const ALLOWED_PROFILES = new Set(['admin', 'direcao', 'lider', 'gestao', 'coordenador', 'apoio', 'consultor', 'user']);

const isLocalAuthMode = !appParams.serverUrl || !appParams.appId;

function saveLocalSession(token, user) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_AUTH_TOKEN_KEY, token);
  window.localStorage.setItem(LOCAL_AUTH_USER_KEY, JSON.stringify(user));
}

function clearLocalSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCAL_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LOCAL_AUTH_USER_KEY);
}

function getLocalToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(LOCAL_AUTH_TOKEN_KEY);
}

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
  return ALLOWED_PROFILES.has(normalized) ? normalized : 'user';
}

async function fetchLocalAuth(path, options = {}) {
  const envApiUrl = (import.meta?.env?.VITE_API_URL || import.meta?.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const endpoints = envApiUrl
    ? [`${envApiUrl}/api`]
    : ['/api', 'http://localhost:4000/api'];
  let lastError = null;

  for (const base of endpoints) {
    try {
      const response = await fetch(`${base}${path}`, options);
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Falha ao conectar na API de autenticação.');
}

async function loadUserEntityByEmail(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;

  try {
    const usuarios = await Usuario.filter({ email: normalizedEmail });
    if (Array.isArray(usuarios) && usuarios.length > 0) {
      return usuarios[0];
    }
  } catch (error) {
  }

  return null;
}

function mergeSessionUser(baseUser, entityUser) {
  if (!entityUser) return baseUser;

  const isFixedAdmin = baseUser?.is_fixed_admin === true;
  const profileFromEntity = normalizeProfile(entityUser.perfil || entityUser.role);
  const profileFromBase = normalizeProfile(baseUser?.perfil || baseUser?.role);
  const finalProfile = isFixedAdmin ? profileFromBase : profileFromEntity;
  const finalRole = finalProfile === 'admin' ? 'admin' : 'user';

  return {
    ...baseUser,
    ...entityUser,
    id: entityUser.id ?? baseUser?.id,
    email: entityUser.email || baseUser?.email,
    nome: entityUser.nome || entityUser.name || baseUser?.nome || baseUser?.name || baseUser?.full_name || null,
    name: entityUser.name || entityUser.nome || baseUser?.name || baseUser?.nome || baseUser?.full_name || null,
    full_name: entityUser.nome || entityUser.name || baseUser?.full_name || baseUser?.name || baseUser?.nome || null,
    perfil: finalProfile,
    role: finalRole,
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    if (isLocalAuthMode) {
      return checkLocalAuth();
    }

    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `${appParams.serverUrl}/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });

      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);

        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        console.error('App state check failed:', appError);

        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: appError.message
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: appError.message || 'Failed to load app'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkLocalAuth = async () => {
    try {
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(true);
      setAuthError(null);

      const token = getLocalToken();
      if (!token) {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        return;
      }

      const response = await fetchLocalAuth('/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        clearLocalSession();
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        return;
      }

      const currentUser = await response.json();
      const entityUser = await loadUserEntityByEmail(currentUser?.email);
      const mergedUser = mergeSessionUser(currentUser, entityUser);

      if (!ALLOWED_PROFILES.has(normalizeProfile(mergedUser?.perfil || mergedUser?.role))) {
        clearLocalSession();
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        setAuthError({ type: 'invalid_profile', message: 'Perfil de acesso inválido.' });
        return;
      }

      saveLocalSession(token, mergedUser);
      setUser(mergedUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('Local auth check failed:', error);
      clearLocalSession();
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);

      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const login = async (email, password) => {
    if (!isLocalAuthMode) {
      navigateToLogin();
      return null;
    }

    const response = await fetchLocalAuth('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    let payload = null;
    let rawBody = '';
    try {
      rawBody = await response.text();
      payload = rawBody ? JSON.parse(rawBody) : null;
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(payload?.error || rawBody || `Falha no login (HTTP ${response.status}).`);
    }

    if (!payload?.user) {
      throw new Error(payload?.error || 'Usuário ou senha inválidos, ou usuário não cadastrado.');
    }

    const entityUser = await loadUserEntityByEmail(payload.user.email);
    const mergedUser = mergeSessionUser(payload.user, entityUser);

    if (String(mergedUser?.status || '').toLowerCase() === 'inativo') {
      throw new Error('Seu usuário está inativo. Procure um administrador.');
    }

    if (!ALLOWED_PROFILES.has(normalizeProfile(mergedUser?.perfil || mergedUser?.role))) {
      throw new Error('Perfil de acesso inválido. Procure um administrador.');
    }

    saveLocalSession(payload.token, mergedUser);
    setUser(mergedUser);
    setIsAuthenticated(true);
    setAuthError(null);
    return mergedUser;
  };

  const logout = (shouldRedirect = true) => {
    if (isLocalAuthMode) {
      clearLocalSession();
      setUser(null);
      setIsAuthenticated(false);

      if (shouldRedirect && typeof window !== 'undefined') {
        window.location.assign('/login');
      }
      return;
    }

    setUser(null);
    setIsAuthenticated(false);

    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    if (isLocalAuthMode) {
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
      return;
    }

    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    logout,
    login,
    navigateToLogin,
    checkAppState,
    authMode: isLocalAuthMode ? 'local' : 'base44',
  }), [user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings, authError, appPublicSettings]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
