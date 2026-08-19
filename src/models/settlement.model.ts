import db from '../db/connection';
import { formatCents } from '../utils/money';

import type { SettlementRow, SettlementStatus } from '../types/models';
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

/** Coklu grup okumasinda satirin hangi gruba ait oldugu da lazim. */
export interface ConfirmedSettlementOfGroup extends ConfirmedSettlement {
  group_id: string;
}

export interface SettlementCounts {
  pending: number;
  confirmed: number;
  rejected: number;
}

/**
 * Listeye konulan gorunum: kayit + iki tarafin adi.
 *
 * Adlar neden burada join'leniyor: arayuz "Ali sana 100 TL odedigini soyluyor"
 * cumlesini kurabilmek icin isim ister. Adlari istemcide uye listesinden
 * eslestirmek de mumkundu ama **gruptan cikarilmis** bir uyenin kaydi o listede
 * bulunmaz ve cumle "undefined sana ... odedi" olurdu. `users` tablosundan
 * okunan ad, uyelikten bagimsiz olarak her zaman var.
 */
export interface SettlementView extends SettlementRow {
  from_name: string;
  to_name: string;
}

export interface SettlementPage {
  settlements: SettlementView[];
  total: number;
}

/**
 * Onay bekleyen bir odemenin banner'da gosterilecek hali.
 *
 * `SettlementView`ten dar: `to_*` alanlari yok cunku alacakli her zaman istegi
 * yapan kisi, `status` yok cunku tanimi geregi `pending`, `confirmed_at` ve
 * `rejected_at` yok cunku ikisi de NULL. Grup adi ise **var** — bu liste
 * gruplar arasi ve kullanicinin "hangi grupta?" sorusunu yanitlamasi gerekiyor.
 */
export interface PendingApprovalView {
  id: string;
  group_id: string;
  group_name: string;
  from_user: string;
  from_name: string;
  amount: string;
  created_at: Date;
}

export interface SettlementFilter {
  /** Verilmezse butun durumlar doner. */
  status?: SettlementStatus;
  limit: number;
  offset: number;
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

/**
 * Grubun odeme kayitlari — sayfalanmis, iki tarafin adiyla.
 *
 * `listConfirmed`'dan ayri duruyor ve **ayri kalmali**: o fonksiyon bakiye
 * hesabini besler ve `confirmed` filtresi orada bir is kurali (1.7). Burasi
 * ise arayuzun okudugu liste; `status` filtresi cagirandan gelir. Ikisini tek
 * fonksiyonda birlestirmek, bakiye hesabinin filtresini bir parametreye
 * dusurur ve o parametre bir gun yanlis gecilirse `pending` bir odeme sessizce
 * bakiyeye girerdi.
 *
 * Siralama `created_at DESC, id DESC`: harcama listesiyle ayni gerekce — sadece
 * created_at ile siralamak ayni anda acilan iki kaydin sirasini belirsiz birakir
 * ve ayni satir iki sayfada gorunebilir.
 */
const listByGroup = async (groupId: string, filter: SettlementFilter): Promise<SettlementPage> => {
  const scoped = (): Knex.QueryBuilder => {
    const query = aliveSettlements().where('settlements.group_id', groupId);

    if (filter.status) {
      query.where('settlements.status', filter.status);
    }

    return query;
  };

  const settlements = (await scoped()
    .join('users as sender', 'sender.id', 'settlements.from_user')
    .join('users as receiver', 'receiver.id', 'settlements.to_user')
    .orderBy([
      { column: 'settlements.created_at', order: 'desc' },
      { column: 'settlements.id', order: 'desc' },
    ])
    .limit(filter.limit)
    .offset(filter.offset)
    .select(
      'settlements.*',
      'sender.name as from_name',
      'receiver.name as to_name'
    )) as unknown as SettlementView[];

  const [{ count }] = await scoped().count<{ count: string }[]>('settlements.id as count');

  // pg surucusu COUNT'u string dondurur; API'de sayi bekleniyor.
  return { settlements, total: Number(count) };
};

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

/**
 * `listConfirmed`in **coklu grup** hali: kac grup verilirse verilsin tek sorgu.
 * Gerekcesi `expenseModel.listForNettingByGroups` ile ayni — Home ozetinde
 * sorgu sayisi grup sayisiyla birlikte buyumemeli.
 *
 * `confirmed` filtresi burada da bir **is kurali**, parametre degil: bekleyen
 * bir odemenin bakiyeye girmesi 1.7'nin ihlali olurdu.
 */
const listConfirmedByGroups = async (
  groupIds: readonly string[]
): Promise<ConfirmedSettlementOfGroup[]> => {
  if (groupIds.length === 0) {
    return [];
  }

  return aliveSettlements()
    .whereIn('settlements.group_id', groupIds as string[])
    .where('settlements.status', 'confirmed')
    .orderBy('settlements.confirmed_at', 'asc')
    .select(
      'settlements.id',
      'settlements.group_id',
      'settlements.from_user',
      'settlements.to_user',
      'settlements.amount'
    ) as unknown as Promise<ConfirmedSettlementOfGroup[]>;
};

/**
 * Kullaniciyi **ilgilendiren** bekleyen odeme sayisi: odemeyi o baslatmis
 * (`from_user`) ya da onayi ondan bekleniyor (`to_user`). Grup ayrimi yok.
 *
 * `countByStatus` ile karistirilmamali: o, tek bir grubun durum dagilimini
 * verir ve kullanicidan bagimsizdir. Burasi tersi — kullanici bazli, grup
 * bagimsiz. Ayni fonksiyonda birlestirmek iki opsiyonel parametre ve "hangisi
 * verilirse ne olur" tablosu demekti.
 */
const countPendingForUser = async (userId: string): Promise<number> => {
  const [{ count }] = await aliveSettlements()
    .where('settlements.status', 'pending')
    .where((builder) =>
      builder.where('settlements.from_user', userId).orWhere('settlements.to_user', userId)
    )
    .count<{ count: string }[]>('settlements.id as count');

  // pg surucusu COUNT'u string dondurur; API'de sayi bekleniyor.
  return Number(count);
};

/**
 * Kullanicinin **onayini bekleyen** odemeler — tum gruplarda, tek sorguda.
 *
 * `countPendingForUser` ile karistirilmamali: o, kullaniciyi *ilgilendiren*
 * bekleyen kayitlari sayar ve iki yonu de (`from_user` ya da `to_user`) icerir,
 * cunku sidebar rozeti "senin dosyanda bekleyen bir sey var" demek istiyor.
 * Burasi tek yon: **yalnizca `to_user`**. Sebep davranissal — bu listeyle bir
 * "Onayla / Itiraz et" kutusu ciziliyor ve o iki aksiyon backend'de yalnizca
 * alacakliya ait (`ONLY_CREDITOR`). Borclunun kendi bildirdigi odeme de listeye
 * girseydi, kullaniciya kendi tiklayamayacagi bir buton gosterilirdi.
 *
 * Sayfalama yok: bu liste tanimi geregi kisa (bir cift arasinda ayni anda tek
 * bir bekleyen kayit olabilir — kismi unique index) ve tamami ekranin en ustunde
 * gosteriliyor. Ust sinir yine de var (`limit`), cunku "kisa olmali" bir varsayim;
 * cok gruplu bir kullanicida listenin sinirsiz buyumesi ekrani ele gecirirdi.
 */
const listPendingForCreditor = async (
  userId: string,
  limit: number
): Promise<PendingApprovalView[]> =>
  aliveSettlements()
    .join('users as sender', 'sender.id', 'settlements.from_user')
    .where('settlements.status', 'pending')
    .where('settlements.to_user', userId)
    // En eski once: bekleyen bir onay ne kadar uzun beklediyse o kadar acil.
    .orderBy([
      { column: 'settlements.created_at', order: 'asc' },
      { column: 'settlements.id', order: 'asc' },
    ])
    .limit(limit)
    .select(
      'settlements.id',
      'settlements.group_id',
      'groups.name as group_name',
      'settlements.from_user',
      'sender.name as from_name',
      'settlements.amount',
      'settlements.created_at'
    ) as unknown as Promise<PendingApprovalView[]>;

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
  listByGroup,
  listConfirmed,
  listConfirmedByGroups,
  countByStatus,
  countPendingForUser,
  listPendingForCreditor,
  create,
  resolve,
};
