import { createContext } from 'react';

import type { LoginInput, RegisterInput } from '../api/auth';
import type { User } from '../types/models';

/**
 * Oturum context'inin **tipi ve nesnesi**. Saglayici (`AuthProvider`) ayri
 * dosyada: bir dosya hem bilesen hem bilesen olmayan sey export ederse
 * React Fast Refresh calismaz (her degisiklikte tum sayfa yenilenir).
 *
 * UC DURUM, IKI DEGIL
 * -------------------
 * `status` bilincli olarak uc degerli: `loading | authenticated | anonymous`.
 * Yalnizca "kullanici var mi yok mu" tutsaydik, elinde gecerli token olan biri
 * /groups sayfasini yenilediginde ilk render'da kullanici henuz yuklenmemis
 * olacagi icin **login'e atilirdi**. `loading` durumu bu yanlis yonlendirmeyi
 * engeller: guard'lar karar vermeden once beklerler.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** Yalnizca arayuzu sadelestirmek icin; gercek yetki backend'de. */
  isAdmin: boolean;
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
