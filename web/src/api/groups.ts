import api from './client';

import type { BalanceResult, Group, GroupSummary, InviteResult } from '../types/models';

/**
 * Grup uc noktalari. Bilesenler axios'u dogrudan cagirmaz; adres ve govde
 * bicimi tek yerde durur (`api/auth.ts` ile ayni desen).
 */

export interface CreateGroupInput {
  name: string;
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

/** `GET /groups/:id/balances` — netlestirilmis bakiyeler + transfer onerileri. */
export const getGroupBalances = async (groupId: string): Promise<BalanceResult> => {
  const { data } = await api.get<BalanceResult>(`/groups/${groupId}/balances`);
  return data;
};

export default { listGroups, createGroup, createInvite, getGroupBalances };
