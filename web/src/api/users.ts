import api from './client';

import type { User } from '../types/models';

/**
 * Kullanicinin **kendi** hesabina dokunan uc noktalar (2.6).
 *
 * `api/auth.ts` ile ayri: orasi oturumla ilgili (giris, kayit, "bu token
 * kimin?"), burasi kullanici kaydiyla. Ayrim backend'deki router bolumuyle
 * birebir ayni (`/auth/*` vs `/users/*`).
 *
 * Bu dosyada bir kullanici ID'si **hicbir yerde** gecmiyor ve gecemez: hedef
 * her zaman token'in sahibi. "Baskasinin profilini guncelle" diye bir cagri
 * yazilamiyor cunku backend'de boyle bir uc nokta tanimli degil.
 */

export interface UpdateProfileInput {
  name: string;
  /** `null` -> takma adi kaldir. Bos string degil: PUT tam durumu tasir. */
  handle: string | null;
  /** `null` -> fotografi kaldir. Doluysa `data:image/...;base64,...`. */
  avatar: string | null;
}

export interface ChangePasswordInput {
  /** Oturum acik olsa bile isteniyor — gerekcesi docs/decisions/2.6.md. */
  currentPassword: string;
  newPassword: string;
}

/** PUT /users/me -> guncellenmis kullanici. */
export const updateProfile = async (input: UpdateProfileInput): Promise<User> => {
  const { data } = await api.put<{ user: User }>('/users/me', input);
  return data.user;
};

/**
 * PUT /users/me/password
 *
 * Donen deger yok: sifre degisikliginin ekranda tazelenecek bir karsiligi yok.
 * Mevcut sifre yanlissa backend **400** doner (401 degil) ve hata
 * `details.currentPassword` alaninda gelir; boylece mesaj dogru alanin altina
 * konabiliyor ve merkezi 401 yakalayicisi oturumu dusurmuyor (bkz. client.ts).
 */
export const changePassword = async (input: ChangePasswordInput): Promise<void> => {
  await api.put('/users/me/password', input);
};

export default { updateProfile, changePassword };
