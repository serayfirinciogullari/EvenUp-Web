import api from './client';

import type { ActivityListResult } from '../types/models';

/**
 * Aktivite akisi uc noktasi.
 *
 * `api/summary.ts` ile ayni ailede: hicbir gruba ait degil, kullanicinin tum
 * gruplari uzerinden toplu. Aradaki fark ozetin bir **an**i, akisin bir
 * **gecmisi** anlatmasi — bu yuzden burada sayfalama var.
 *
 * Adreste kullanici ID'si yok ve olamaz: hedef her zaman token'in sahibi.
 */

export interface ListActivityQuery {
  page?: number;
  limit?: number;
}

/** `GET /activity` — en yeniden eskiye, sayfalanmis. */
export const listActivity = async (
  query: ListActivityQuery = {}
): Promise<ActivityListResult> => {
  const { data } = await api.get<ActivityListResult>('/activity', { params: query });
  return data;
};

/**
 * `POST /users/me/activity-seen` — "aktivite akisini simdi gordum" isareti.
 * Govde yok: "simdi" tek anlamli deger. Aktivite sayfasi feed'i her
 * yukledi ginde bunu cagirir; sidebar rozetindeki okunmamis kismi boylece
 * sayfa yenilenmeden sifirlanir (bkz. docs/decisions/aktivite-okunma-sayaci.md).
 *
 * `/users/me/*` altinda ama burada duruyor: aktivite akisinin okunma durumu,
 * `listActivity` ile ayni verinin iki farkli sorusu — bu dosyanin ailesi.
 */
export const markActivitySeen = async (): Promise<void> => {
  await api.post('/users/me/activity-seen');
};

export default { listActivity, markActivitySeen };
