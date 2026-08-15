import api from './client';

import type {
  AdminGroupListResult,
  AdminStats,
  AdminUserListResult,
  SetUserActiveResult,
} from '../types/models';

/**
 * Admin uc noktalari.
 *
 * BU DOSYADA NE YOK
 * -----------------
 * Grup **icerigine** dokunan hicbir cagri yok ve olamaz: backend'de boyle bir
 * admin ucu tanimli degil. `/admin/groups` yalnizca ad, uye sayisi ve tarih
 * doner; harcama listesi icin `/groups/:id/expenses` uc noktasi var ama o
 * **uyelik** ister (`requireMembership`) — admin rolu oraya bir kapi acmaz.
 *
 * Yani "admin harcama/grup icerigine mudahale etmez" ilkesi burada bir yorum
 * degil, cagirilabilecek bir fonksiyonun yoklugu. Gerekce: docs/decisions/1.8.md
 * ve docs/decisions/2.5.md.
 */

export interface ListUsersQuery {
  /** E-posta ya da isim icinde aranir (backend ILIKE, LIKE kacisi orada). */
  search?: string;
  status?: 'active' | 'inactive';
  role?: 'admin' | 'user';
  page?: number;
  limit?: number;
}

export interface ListGroupsQuery {
  search?: string;
  page?: number;
  limit?: number;
}

/** `GET /admin/users?search=&status=&role=&page=&limit=` */
export const listUsers = async (query: ListUsersQuery = {}): Promise<AdminUserListResult> => {
  const { data } = await api.get<AdminUserListResult>('/admin/users', { params: query });
  return data;
};

/**
 * `PUT /admin/users/:id/disable`
 *
 * Kullanici silinmez, pasiflestirilir: silmek harcama gecmisini ve dolayisiyla
 * baskalarinin bakiyelerini bozardi (bkz. 01_users migration'indaki not).
 * Admin kendi hesabini kapatamaz — backend 400 doner.
 */
export const disableUser = async (userId: string): Promise<SetUserActiveResult> => {
  const { data } = await api.put<SetUserActiveResult>(`/admin/users/${userId}/disable`);
  return data;
};

/** `PUT /admin/users/:id/enable` — geri alma yolu; kilitlenme uretmez. */
export const enableUser = async (userId: string): Promise<SetUserActiveResult> => {
  const { data } = await api.put<SetUserActiveResult>(`/admin/users/${userId}/enable`);
  return data;
};

/** `GET /admin/groups` — **yalnizca ust veri** (ad, uye sayisi, tarih). */
export const listGroups = async (query: ListGroupsQuery = {}): Promise<AdminGroupListResult> => {
  const { data } = await api.get<AdminGroupListResult>('/admin/groups', { params: query });
  return data;
};

/** `GET /admin/stats` — yalnizca toplamlar + 7/30 gun trendi. */
export const getStats = async (): Promise<AdminStats> => {
  const { data } = await api.get<AdminStats>('/admin/stats');
  return data;
};

export default { listUsers, disableUser, enableUser, listGroups, getStats };
