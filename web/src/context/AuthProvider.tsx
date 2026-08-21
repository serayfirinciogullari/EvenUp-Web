import { useCallback, useEffect, useMemo, useState } from 'react';

import authApi from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import { clearToken, readToken, writeToken } from '../api/tokenStorage';
import { AuthContext } from './AuthContext';

import type { LoginInput, RegisterInput } from '../api/auth';
import type { AuthContextValue, AuthStatus } from './AuthContext';
import type { User } from '../types/models';
import type { ReactNode } from 'react';

/** Oturum durumunun tek kaynagi. Tip ve context nesnesi: `AuthContext.ts`. */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  // Token yoksa dogrulanacak bir sey de yok: dogrudan anonymous baslariz ve
  // gereksiz bir /auth/me istegi atmayiz.
  const [status, setStatus] = useState<AuthStatus>(() => (readToken() ? 'loading' : 'anonymous'));

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  /**
   * 401 gelince oturumu dusur. Bu, `client.ts` icindeki interceptor'un React
   * agacina baglandigi tek nokta; interceptor'un kendisi React'i bilmez.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  /**
   * Acilista token'i sunucuya dogrulat. Token'in suresi dolmus ya da kullanici
   * devre disi birakilmis olabilir; ikisini de yalnizca backend bilir.
   */
  useEffect(() => {
    if (!readToken()) {
      return;
    }

    let cancelled = false;

    authApi
      .getMe()
      .then((me) => {
        if (!cancelled) {
          setUser(me);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        // 401 ise interceptor token'i zaten temizledi; diger hatalarda da
        // oturumu acik saymak yanlis olur.
        if (!cancelled) {
          clearToken();
          setUser(null);
          setStatus('anonymous');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuthResult = useCallback((result: { user: User; token: string }) => {
    writeToken(result.token);
    setUser(result.user);
    setStatus('authenticated');
    return result.user;
  }, []);

  const login = useCallback(
    async (input: LoginInput) => applyAuthResult(await authApi.login(input)),
    [applyAuthResult]
  );

  const register = useCallback(
    async (input: RegisterInput) => applyAuthResult(await authApi.register(input)),
    [applyAuthResult]
  );

  /**
   * Profil degistikten sonra (2.6) kullaniciyi sunucudan geri okur.
   *
   * Token'a dokunulmuyor: degisen sey kullanici **kaydi**, oturum degil.
   * Hata bilerek yutulmuyor — cagiran ekran "kaydedildi" demeden once bu
   * cagrinin basarili oldugunu bilmeli.
   */
  const refreshUser = useCallback(async () => {
    const me = await authApi.getMe();
    setUser(me);
    setStatus('authenticated');
    return me;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      applySession: applyAuthResult,
      refreshUser,
    }),
    [user, status, login, register, logout, applyAuthResult, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
