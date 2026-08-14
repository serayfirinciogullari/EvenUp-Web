import { useContext } from 'react';

import { AuthContext } from '../context/AuthContext';

import type { AuthContextValue } from '../context/AuthContext';

/**
 * Oturum durumuna erisim. Provider disinda cagrilirsa sessizce `null` donmek
 * yerine hata firlatir: aksi halde "kullanici neden hep null?" seklinde
 * teshisi zor bir hataya donusurdu.
 */
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth yalnizca <AuthProvider> icinde kullanilabilir');
  }

  return context;
};

export default useAuth;
