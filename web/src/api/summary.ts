import api from './client';

import type { HomeSummary } from '../types/models';

/**
 * Home ekraninin ozet ucu.
 *
 * `api/groups.ts`ten ayri bir dosya: bu uc **hicbir gruba ait degil**, tum
 * gruplar uzerinden toplu bir ozet donuyor (backend tarafinda ayni gerekceyle
 * `/users/me` altinda duruyor — bkz. docs/decisions/home-summary.md).
 * `api/users.ts`e de konmadi; orasi hesap **yazma** islemleri (profil, sifre),
 * burasi salt okuma bir gorunum.
 *
 * Bu dosyada da bir kullanici ID'si gecmiyor ve gecemez: hedef her zaman
 * token'in sahibi.
 */

/** `GET /users/me/home-summary` — cevap `{ summary }` sarmalayicisi icinde gelir. */
export const getHomeSummary = async (): Promise<HomeSummary> => {
  const { data } = await api.get<{ summary: HomeSummary }>('/users/me/home-summary');
  return data.summary;
};

export default { getHomeSummary };
