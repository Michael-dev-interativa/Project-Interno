import { useState, useEffect } from 'react';
import { Usuario } from '@/entities/all';

/**
 * Hook para buscar e gerenciar o perfil correto do usuário da entidade Usuario
 * @param {Object} user - Objeto do usuário autenticado (from User.me())
 * @returns {Object} { userProfile, isLoadingProfile, nivelUsuario, hasPermission, isAdmin }
 */
export const useUserProfile = (user) => {
  const [userProfile, setUserProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.email) {
        setUserProfile(null);
        setIsLoadingProfile(false);
        return;
      }
      
      try {
        const usuarios = await Usuario.filter({ email: user.email }, null, 1);
        if (usuarios && usuarios.length > 0) {
          setUserProfile(usuarios[0]);
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        setUserProfile(null);
      } finally {
        setIsLoadingProfile(false);
      }
    };
    
    loadUserProfile();
  }, [user?.email]);

  // **HIERARQUIA DE PERMISSÕES**
  const perfisHierarquia = {
    'direcao': 6,
    'gestao': 5,
    'lider': 4,
    'coordenador': 3,
    'apoio': 2,
    'user': 1
  };

  // Usar perfil da entidade Usuario, se disponível, senão usar do User (fallback)
  const perfilAtual = userProfile?.perfil || user?.perfil || 'user';
  const nivelUsuario = perfisHierarquia[perfilAtual] || 1;
  const isAdmin = user?.role === 'admin';

  const hasPermission = (nivelMinimo) => {
    return isAdmin || nivelUsuario >= perfisHierarquia[nivelMinimo];
  };

  return {
    userProfile,
    isLoadingProfile,
    perfilAtual,
    nivelUsuario,
    hasPermission,
    isAdmin,
    isColaborador: nivelUsuario === 1 && !isAdmin,
    isGestao: perfilAtual === 'gestao',
    isCoordenador: perfilAtual === 'coordenador'
  };
};