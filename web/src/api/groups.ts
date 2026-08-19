import api from './client';

import type {
  BalanceResult,
  Group,
  GroupDetail,
  GroupSummary,
  InviteResult,
  JoinResult,
  NicknameResult,
} from '../types/models';

/**
 * Grup uc noktalari. Bilesenler axios'u dogrudan cagirmaz; adres ve govde
 * bicimi tek yerde durur (`api/auth.ts` ile ayni desen).
 */

export interface CreateGroupInput {
  name: string;
  description?: string;
}

/** `PUT /groups/:id` govdesi — kismi: yalnizca gonderilen alan degisir
 *  (bkz. src/services/group.service.ts -> updateGroup). */
export interface UpdateGroupInput {
  name?: string;
  description?: string;
}

/** `GET /groups` — yalnizca kullanicinin uyesi oldugu gruplar; filtre sorguda. */
export const listGroups = async (): Promise<GroupSummary[]> => {
  const { data } = await api.get<{ groups: GroupSummary[] }>('/groups');
  return data.groups;
};

/** `POST /groups` — olusturan otomatik `owner` olur. */
export const createGroup = async (input: CreateGroupInput): Promise<Group> => {
  const { data } = await api.post<{ group: Group }>('/groups', input);
  return data.group;
};

/**
 * `POST /groups/:id/invite` — yalnizca owner cagirabilir (uye 403 alir).
 *
 * Govde bos gonderiliyor: backend'in varsayilani **mevcut aktif daveti aynen
 * dondurmek**, yeni kod uretmek degil. `rotate: true` gondermek, sohbette
 * paylasilmis linki oldururdu — bu ekrandaki "linki kopyala" aksiyonunun
 * amaci o degil (bkz. docs/decisions/1.4.md).
 */
export const createInvite = async (groupId: string): Promise<InviteResult> => {
  const { data } = await api.post<InviteResult>(`/groups/${groupId}/invite`, {});
  return data;
};

/**
 * `POST /groups/join/:inviteCode` — davet koduyla gruba katilir.
 *
 * Govde bos: kimlik `Authorization` header'inda, kod adreste. Uc nokta
 * kimlik dogrulamasi istiyor; bu yuzden cagiran ekran (`pages/JoinPage`)
 * once oturumun acik olmasini saglar.
 *
 * Gecersiz, suresi dolmus, kotasi dolmus ve silinmis grubun kodu **ayni 404'u**
 * doner (backend bilincli olarak ayirmiyor, bkz. group.service.joinByCode).
 * Yani arayuz de bu durumlari ayirt etmeye calismaz; backend'in mesajini
 * gosterir.
 */
export const joinGroup = async (inviteCode: string): Promise<JoinResult> => {
  const { data } = await api.post<JoinResult>(
    `/groups/join/${encodeURIComponent(inviteCode)}`,
    {}
  );
  return data;
};

/**
 * `GET /groups/:id` — grup + istekte bulunanin rolu + uye listesi.
 *
 * Uye listesi grup detay ekraninin cekirdegi: "kim odedi" dropdown'i, bolusme
 * satirlari ve bakiye cumleleri hep bu listeden besleniyor.
 */
export const getGroup = async (groupId: string): Promise<GroupDetail> => {
  const { data } = await api.get<GroupDetail>(`/groups/${groupId}`);
  return data;
};

/** `GET /groups/:id/balances` — netlestirilmis bakiyeler + transfer onerileri. */
export const getGroupBalances = async (groupId: string): Promise<BalanceResult> => {
  const { data } = await api.get<BalanceResult>(`/groups/${groupId}/balances`);
  return data;
};

/**
 * `PUT /groups/:id/members/:userId/nickname` — takma isim atar ya da kaldirir.
 *
 * `null` (ya da bos metin) **kaldirir**; ayri bir silme cagrisi yok. Arayuzde
 * takma isim tek bir metin kutusu ve kutuyu bosaltmak "kaldir" demek — iki ayri
 * fonksiyon, bilesende "bos mu, degil mi" dallanmasi demek olurdu.
 *
 * Owner sarti yok: kullanici yalnizca **kendi gordugu** etiketi degistiriyor.
 */
export const setMemberNickname = async (
  groupId: string,
  userId: string,
  nickname: string | null
): Promise<NicknameResult> => {
  const { data } = await api.put<NicknameResult>(
    `/groups/${groupId}/members/${userId}/nickname`,
    { nickname }
  );
  return data;
};

/**
 * `PUT /groups/:id` — grup adini/aciklamasini gunceller. Yalnizca owner
 * cagirabilir (uye 403 alir). Kismi: yalnizca gonderilen alan degisir.
 */
export const updateGroup = async (
  groupId: string,
  input: UpdateGroupInput
): Promise<Group> => {
  const { data } = await api.put<{ group: Group }>(`/groups/${groupId}`, input);
  return data.group;
};

/**
 * `DELETE /groups/:id` — grubu siler (soft delete). Yalnizca owner cagirabilir.
 * Gerceklestiren tarafta geri donus yolu yok: onay diyalogu cagiran ekranin isi.
 */
export const deleteGroup = async (groupId: string): Promise<Group> => {
  const { data } = await api.delete<{ group: Group }>(`/groups/${groupId}`);
  return data.group;
};

/**
 * `DELETE /groups/:id/members/:userId` — uyeyi gruptan cikarir. Yalnizca owner
 * cagirabilir; owner kendini cikaramaz (backend 400 doner, bkz. group.service).
 */
export const removeMember = async (
  groupId: string,
  userId: string
): Promise<{ removed_user_id: string }> => {
  const { data } = await api.delete<{ removed_user_id: string }>(
    `/groups/${groupId}/members/${userId}`
  );
  return data;
};

export default {
  listGroups,
  createGroup,
  getGroup,
  createInvite,
  joinGroup,
  getGroupBalances,
  setMemberNickname,
  updateGroup,
  deleteGroup,
  removeMember,
};
