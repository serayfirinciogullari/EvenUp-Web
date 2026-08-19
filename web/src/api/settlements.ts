import api from './client';

import type {
  PendingApproval,
  Settlement,
  SettlementListResult,
  SettlementStatus,
} from '../types/models';

/**
 * Odeme (settlement) uc noktalari.
 *
 * Adreslerdeki bolunme backend'in iki tarafli onay modelini yansitiyor
 * (docs/decisions/1.7.md):
 *
 *   POST /groups/:id/settlements   -> kaydi **borclu** acar   ("odedim")
 *   PUT  /settlements/:id/confirm  -> **alacakli** onaylar    ("aldim")
 *   PUT  /settlements/:id/reject   -> **alacakli** reddeder   ("almadim")
 *
 * Yani ayni kaydin iki ayri sahibi var; bu yuzden olusturma grup altinda,
 * sonuclandirma kaydin kendi adresi altinda duruyor.
 */

export interface CreateSettlementInput {
  /** Odemeyi alan (alacakli). Borclu her zaman istegi yapan kisidir. */
  toUserId: string;
  /** NUMERIC metni ("100.00"). */
  amount: string;
}

export interface ListSettlementsQuery {
  status?: SettlementStatus;
  page?: number;
  limit?: number;
}

/** `GET /groups/:id/settlements` — iki tarafin adiyla birlikte, sayfalanmis. */
export const listSettlements = async (
  groupId: string,
  query: ListSettlementsQuery = {}
): Promise<SettlementListResult> => {
  const { data } = await api.get<SettlementListResult>(`/groups/${groupId}/settlements`, {
    params: query,
  });
  return data;
};

/**
 * `POST /groups/:id/settlements` — kayit **her zaman** `pending` baslar.
 *
 * `status` govdeye konmuyor; konsa da backend yok sayardi. Borclunun kendi
 * odemesini dogrudan `confirmed` yazabilmesi, iki tarafli onay modelini tek
 * satirla delerdi.
 */
export const createSettlement = async (
  groupId: string,
  input: CreateSettlementInput
): Promise<Settlement> => {
  const { data } = await api.post<{ settlement: Settlement }>(
    `/groups/${groupId}/settlements`,
    input
  );
  return data.settlement;
};

/**
 * `GET /settlements/pending` — **onayimi bekleyen** odemeler, tum gruplarda.
 *
 * `listSettlements`ten iki farki var: grup bazli degil kullanici bazli ve
 * yalnizca istegi yapanin **alacakli** oldugu kayitlari doner. Aktivite
 * ekranindaki ust banner'in kaynagi; oradaki "Onayla / Itiraz et" butonlari
 * backend'de zaten yalnizca alacakliya acik (`ONLY_CREDITOR`).
 */
export const listPendingApprovals = async (): Promise<PendingApproval[]> => {
  const { data } = await api.get<{ settlements: PendingApproval[] }>('/settlements/pending');
  return data.settlements;
};

/** `PUT /settlements/:id/confirm` — yalnizca alacakli cagirabilir (aksi 403). */
export const confirmSettlement = async (settlementId: string): Promise<Settlement> => {
  const { data } = await api.put<{ settlement: Settlement }>(
    `/settlements/${settlementId}/confirm`
  );
  return data.settlement;
};

/** `PUT /settlements/:id/reject` — yalnizca alacakli cagirabilir (aksi 403). */
export const rejectSettlement = async (settlementId: string): Promise<Settlement> => {
  const { data } = await api.put<{ settlement: Settlement }>(`/settlements/${settlementId}/reject`);
  return data.settlement;
};

export default {
  listSettlements,
  listPendingApprovals,
  createSettlement,
  confirmSettlement,
  rejectSettlement,
};
