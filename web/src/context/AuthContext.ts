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
  /**
   * Kullaniciyi **sunucudan** yeniden okur (`GET /auth/me`) ve context'i
   * tazeler (2.6).
   *
   * Neden bir `setUser` degil: profil guncellendikten sonra ekranda gorunen
   * ismin kaynagi yerel state olsaydi, "kaydedildi" yazisi yalnizca istegin
   * hata vermedigini gosterirdi. Burada gosterilen deger sunucudan **geri
   * okunan** degerdir; yani ekrandaki ad, F5'ten sonra gorulecek adin ta
   * kendisi.
   */
  refreshUser: () => Promise<User>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
