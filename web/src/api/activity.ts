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

export default { listActivity };
