import db from '../db/connection';
import { formatCents } from '../utils/money';

import type { SettlementRow } from '../types/models';
import type { Knex } from 'knex';

/**
 * settlements veri erisim katmani.
 *
 * Diger modeller gibi iki kural burada da gecerli:
 *
 * 1. **Silinmis grubun odeme kaydi hicbir sorgudan donmez.** Grup soft delete
 *    ile silindiginde (1.4) satirlar yerinde kalir; okuma sorgulari `groups`
 *    ile join yapip `deleted_at IS NULL` sartini tasir.
 * 2. **Durum degisikligi tek atomik UPDATE'tir.** `resolve` mevcut durumu
 *    `WHERE status = 'pending'` ile sarta baglar; boylece ayni anda gelen iki
 *    onay isteginden yalnizca biri kaydi degistirebilir (bkz. `resolve`).
 *
 * Tutarlar DB'ye NUMERIC(10,2) yazilir, uygulamada kurus dolasir; cevrim bu
 * dosyanin sinirinda (`formatCents`).
 */

export interface CreateSettlementInput {
  group_id: string;
  from_user: string;
  to_user: string;
  amount_cents: number;
}

/** Netlestirmeye giren minimal gorunum: yalnizca onaylanmis kayitlar. */
export interface ConfirmedSettlement {
  id: string;
  from_user: string;
  to_user: string;
  amount: string;
}

export interface SettlementCounts {
  pending: number;
  confirmed: number;
  rejected: number;
}

/* -------------------------------------------------------------- yardimcilar */

/** Canli gruba ait odeme kayitlari icin temel sorgu. */
const aliveSettlements = (trx?: Knex.Transaction): Knex.QueryBuilder =>
  (trx ?? db)('settlements')
    .join('groups', 'groups.id', 'settlements.group_id')
    .whereNull('groups.deleted_at');

/* ------------------------------------------------------------------ okuma */

const findById = async (settlementId: string): Promise<SettlementRow | undefined> =>
  aliveSettlements().where('settlements.id', settlementId).select('settlements.*').first();

/**
 * Ayni cift arasindaki bekleyen kayit. Kismi unique index bunu DB seviyesinde
 * zaten engelliyor; bu sorgu 500 yerine anlamli bir 409 dondurebilmek icin.
 */
const findPendingBetween = async (
  groupId: string,
  fromUser: string,
  toUser: string
): Promise<SettlementRow | undefined> =>
  aliveSettlements()
    .where({
      'settlements.group_id': groupId,
      'settlements.from_user': fromUser,
      'settlements.to_user': toUser,
      'settlements.status': 'pending',
    })
    .select('settlements.*')
    .first();

/**
 * Bakiye hesabina girecek kayitlar. **Yalnizca `confirmed`** — bu filtre
 * 1.7'nin en kritik satiri: `pending` ya da `rejected` bir kaydin buradan
 * donmesi, onaylanmamis bir odemenin bakiyeyi degistirmesi demek olurdu.
 */
const listConfirmed = async (groupId: string): Promise<ConfirmedSettlement[]> =>
  aliveSettlements()
    .where({ 'settlements.group_id': groupId, 'settlements.status': 'confirmed' })
    .orderBy('settlements.confirmed_at', 'asc')
    .select(
      'settlements.id',
      'settlements.from_user',
      'settlements.to_user',
      'settlements.amount'
    ) as unknown as Promise<ConfirmedSettlement[]>;

/** Durum dagilimi — arayuz "3 bekleyen odeme var" diyebilsin. */
const countByStatus = async (groupId: string): Promise<SettlementCounts> => {
  const rows = (await aliveSettlements()
    .where('settlements.group_id', groupId)
    .groupBy('settlements.status')
    .select('settlements.status')
    .count('settlements.id as count')) as unknown as { status: string; count: string }[];

  const counts: SettlementCounts = { pending: 0, confirmed: 0, rejected: 0 };

  for (const row of rows) {
    // pg surucusu COUNT'u string dondurur; API'de sayi bekleniyor.
    counts[row.status as keyof SettlementCounts] = Number(row.count);
  }

  return counts;
};

/* ------------------------------------------------------------------ yazma */

/**
 * Yeni kayit **her zaman** `pending` olusur; durum istemciden alinmaz.
 * Alinsaydi borclu kendi odemesini dogrudan `confirmed` yazip alacaklinin
 * onayini atlardi — yani iki tarafli onay modeli tek satirla delinirdi.
 */
const create = async (input: CreateSettlementInput): Promise<SettlementRow> => {
  const [settlement] = await db('settlements')
    .insert({
      group_id: input.group_id,
      from_user: input.from_user,
      to_user: input.to_user,
      amount: formatCents(input.amount_cents),
      status: 'pending',
    })
    .returning('*');

  return settlement;
};

/**
 * Bekleyen kaydi onaylar ya da reddeder.
 *
 * `WHERE status = 'pending'` sarti yaris koruyucusudur: alacakli ayni kaydi iki
 * sekmeden ayni anda onaylayip reddederse ikinci UPDATE hicbir satir bulamaz ve
 * `undefined` doner — cagiran katman bunu 409'a cevirir. Sart olmasaydi son
 * yazan kazanir, `confirmed_at` ve `rejected_at` ikisi birden dolabilirdi
 * (CHECK bunu da yakalardi, ama 500 uretirdi).
 */
const resolve = async (
  settlementId: string,
  status: 'confirmed' | 'rejected'
): Promise<SettlementRow | undefined> => {
  const now = new Date();

  const [settlement] = await db('settlements')
    .where({ id: settlementId, status: 'pending' })
    .update({
      status,
      confirmed_at: status === 'confirmed' ? now : null,
      rejected_at: status === 'rejected' ? now : null,
    })
    .returning('*');

  return settlement;
};

export default {
  findById,
  findPendingBetween,
  listConfirmed,
  countByStatus,
  create,
  resolve,
};
