import db from '../db/connection';

import type { Knex } from 'knex';

/**
 * Aktivite akisinin veri erisim katmani.
 *
 * NEDEN YENI BIR "OLAYLAR" TABLOSU YOK
 * ------------------------------------
 * Akisin gosterdigi bes olayin dordu zaten kayitli: harcama eklendi, odeme
 * bildirildi, onaylandi, reddedildi. Her biri var olan bir satirin bir tarih
 * kolonu. Bunlari ayrica bir `activity_events` tablosuna yazmak iki maliyet
 * getirirdi:
 *
 *   1. **Gecmis bos baslardi.** Tablo yalnizca yazildigi andan sonrasini bilir;
 *      akis, uygulamanin bugune kadarki tum gecmisini gostermek yerine bos bir
 *      ekranla acilirdi.
 *   2. **Ikinci bir dogruluk kaynagi.** Bir harcama eklenip olay satiri
 *      yazilmazsa (ya da tersi) iki tablo birbirini yalanlardi. Turetilen bir
 *      gorunumde bu sinif hata tanimsiz.
 *
 * Bu yuzden akis bir **sorgu**, bir tablo degil: bes ayri SELECT `UNION ALL` ile
 * birlestirilip zaman sirasina diziliyor. Tek istisna duzenleme olayi — o
 * gercekten kayitli degildi ve `expense_edits` (migration 15) tam olarak o
 * bosluk icin acildi.
 *
 * N+1 YOK — SORGU SAYISI SABIT
 * ----------------------------
 * Kullanicinin kac grubu olursa olsun toplam **uc** sorgu calisir:
 *   1. uyelik + grup adlari (`group.model.listMembershipNames`, cagiran katmanda)
 *   2. olaylarin sayfasi (bu dosya — birlesim tek ifade)
 *   3. toplam olay sayisi (sayfalama icin, ayni birlesim uzerinde COUNT)
 * Aktor ve karsi taraf adlari birlesimin **disinda**, tek bir join ile
 * ekleniyor; her dalda ayri ayri `users` join'i yapmak ayni isi bes kez
 * yaptirirdi.
 */

/** Akistaki olay turleri. Arayuzdeki uc harfli rozetler bunlara eslenir. */
export type ActivityKind =
  | 'expense_created'
  | 'expense_edited'
  | 'settlement_created'
  | 'settlement_confirmed'
  | 'settlement_rejected';

/**
 * Birlesimden donen ham satir.
 *
 * `previous_*` alanlari yalnizca `expense_edited` icin dolu; `counterparty_*`
 * yalnizca odeme olaylarinda (harcamanin karsi tarafi yoktur). Tutarlar her
 * zaman NUMERIC metni — projedeki her para alaninda oldugu gibi (bkz. 1.5).
 */
export interface ActivityRow {
  kind: ActivityKind;
  occurred_at: Date;
  group_id: string;
  actor_id: string;
  actor_name: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  amount: string;
  previous_amount: string | null;
  description: string | null;
  previous_description: string | null;
  /** Kaynak satirin kendi ID'si. `kind` ile birlikte olayi tekil tanimlar:
   *  ayni odeme kaydi hem "bildirildi" hem "onaylandi" olayi uretebilir. */
  event_id: string;
}

export interface ActivityPage {
  events: ActivityRow[];
  total: number;
}

export interface Page {
  limit: number;
  offset: number;
}

/* -------------------------------------------------------------- yardimcilar */

/**
 * Birlesimin kolon sirasi — **tek dogruluk kaynagi**.
 *
 * `UNION ALL` kolonlari isimle degil **konumla** eslestirir ve kolon adlarini
 * ilk daldan alir. Yani bir dalda siranin kaymasi hata vermez; sessizce yanlis
 * veri dondurur (aktor kimligi tutar kolonuna duser gibi). Her dal bu diziyi
 * uretmek zorunda oldugu icin sira tek yerde tanimli.
 *
 * NULL'lar bilerek cast'li: tipsiz bir NULL ilk dalda gorunurse PostgreSQL
 * kolonun tipini belirleyemez ve birlesim "could not determine data type" ile
 * duser. `description` her dalda `text`e cast ediliyor — `expenses.description`
 * varchar(255), odeme dallarinda ise NULL; cast olmadan tipler ayrisirdi.
 */
const selectShape = (parts: {
  kind: ActivityKind;
  occurredAt: string;
  groupId: string;
  actorId: string;
  counterpartyId: string;
  amount: string;
  previousAmount: string;
  description: string;
  previousDescription: string;
  eventId: string;
}): Knex.Raw[] => [
  db.raw(`'${parts.kind}'::text as kind`),
  db.raw(`${parts.occurredAt} as occurred_at`),
  db.raw(`${parts.groupId} as group_id`),
  db.raw(`${parts.actorId} as actor_id`),
  db.raw(`${parts.counterpartyId} as counterparty_id`),
  db.raw(`${parts.amount} as amount`),
  db.raw(`${parts.previousAmount} as previous_amount`),
  db.raw(`${parts.description} as description`),
  db.raw(`${parts.previousDescription} as previous_description`),
  db.raw(`${parts.eventId} as event_id`),
];

const NO_UUID = 'CAST(NULL AS uuid)';
const NO_AMOUNT = 'CAST(NULL AS numeric(10,2))';
const NO_TEXT = 'CAST(NULL AS text)';

/**
 * Harcama eklendi. Silinmis harcama ve silinmis grup disarida: akis, bakiyeye
 * girmeyen bir satiri gecmis olarak gostermemeli.
 */
const expenseCreatedBranch = (groupIds: readonly string[]): Knex.QueryBuilder =>
  db('expenses as e')
    .join('groups as g', 'g.id', 'e.group_id')
    .whereNull('e.deleted_at')
    .whereNull('g.deleted_at')
    .whereIn('e.group_id', groupIds as string[])
    .select(
      selectShape({
        kind: 'expense_created',
        occurredAt: 'e.created_at',
        groupId: 'e.group_id',
        actorId: 'e.created_by',
        counterpartyId: NO_UUID,
        amount: 'e.amount',
        previousAmount: NO_AMOUNT,
        description: 'e.description::text',
        previousDescription: NO_TEXT,
        eventId: 'e.id',
      })
    );

/**
 * Harcama duzenlendi. Tek dal `expenses`ten degil `expense_edits`ten okuyor:
 * bir harcama bircok kez duzenlenmis olabilir ve her biri ayri bir olay.
 * `expenses` join'i yalnizca silinmis harcama/grup filtresi ve `group_id` icin.
 */
const expenseEditedBranch = (groupIds: readonly string[]): Knex.QueryBuilder =>
  db('expense_edits as ed')
    .join('expenses as e', 'e.id', 'ed.expense_id')
    .join('groups as g', 'g.id', 'e.group_id')
    .whereNull('e.deleted_at')
    .whereNull('g.deleted_at')
    .whereIn('e.group_id', groupIds as string[])
    .select(
      selectShape({
        kind: 'expense_edited',
        occurredAt: 'ed.created_at',
        groupId: 'e.group_id',
        actorId: 'ed.edited_by',
        counterpartyId: NO_UUID,
        amount: 'ed.new_amount',
        previousAmount: 'ed.previous_amount',
        description: 'ed.new_description::text',
        previousDescription: 'ed.previous_description::text',
        eventId: 'ed.id',
      })
    );

/**
 * Odeme dallari ortak govde. Uc olayin tek farki hangi tarih kolonuna baktigi
 * ve **aktorun kim oldugu**: kaydi borclu acar (`from_user`), sonuclandirmayi
 * alacakli yapar (`to_user`). Karsi taraf her zaman digeri.
 */
const settlementBranch = (
  groupIds: readonly string[],
  config: {
    kind: ActivityKind;
    occurredAt: string;
    actorId: string;
    counterpartyId: string;
    scope: (query: Knex.QueryBuilder) => void;
  }
): Knex.QueryBuilder => {
  const query = db('settlements as s')
    .join('groups as g', 'g.id', 's.group_id')
    .whereNull('g.deleted_at')
    .whereIn('s.group_id', groupIds as string[]);

  config.scope(query);

  return query.select(
    selectShape({
      kind: config.kind,
      occurredAt: config.occurredAt,
      groupId: 's.group_id',
      actorId: config.actorId,
      counterpartyId: config.counterpartyId,
      amount: 's.amount',
      previousAmount: NO_AMOUNT,
      // Odemenin aciklamasi yok; satirdaki cumle iki taraf ve tutardan kuruluyor.
      description: NO_TEXT,
      previousDescription: NO_TEXT,
      eventId: 's.id',
    })
  );
};

/**
 * Birlesimi kurar. Cagiran taraf bunu bir alt sorgu olarak kullanir; siralama
 * ve LIMIT **disarida** uygulanir — birlesimin bir dalina takilan ORDER BY
 * yalnizca o dali sirlar ve sayfalama sessizce yanlis olurdu.
 */
const eventsUnion = (groupIds: readonly string[]): Knex.QueryBuilder => {
  const [first, ...rest] = [
    expenseCreatedBranch(groupIds),
    expenseEditedBranch(groupIds),
    settlementBranch(groupIds, {
      kind: 'settlement_created',
      occurredAt: 's.created_at',
      actorId: 's.from_user',
      counterpartyId: 's.to_user',
      scope: () => {
        // Her kayit bir "odedim" bildirimiyle basladigi icin durum filtresi yok:
        // reddedilmis bir odeme de bir zamanlar bildirilmisti ve akista kalmali.
      },
    }),
    settlementBranch(groupIds, {
      kind: 'settlement_confirmed',
      occurredAt: 's.confirmed_at',
      actorId: 's.to_user',
      counterpartyId: 's.from_user',
      scope: (query) => {
        query.where('s.status', 'confirmed').whereNotNull('s.confirmed_at');
      },
    }),
    settlementBranch(groupIds, {
      kind: 'settlement_rejected',
      occurredAt: 's.rejected_at',
      actorId: 's.to_user',
      counterpartyId: 's.from_user',
      scope: (query) => {
        query.where('s.status', 'rejected').whereNotNull('s.rejected_at');
      },
    }),
  ];

  return first.unionAll(rest, true);
};

/* ------------------------------------------------------------------ okuma */

/**
 * Verilen gruplardaki olaylarin bir sayfasi, en yeniden eskiye.
 *
 * Siralama uc anahtarli ve **toplam**: `occurred_at` esit olan iki olay (ayni
 * saniyede eklenmis iki harcama) `event_id` ile, ayni kaydin iki farkli olayi
 * da `kind` ile ayrisir. Tek anahtarla siralamak, harcama listesindekiyle ayni
 * sorunu uretirdi: belirsiz sira -> ayni satirin iki sayfada gorunmesi
 * (bkz. expense.model.listByGroup).
 */
const listForGroups = async (
  groupIds: readonly string[],
  page: Page
): Promise<ActivityPage> => {
  // `WHERE ... IN ()` hicbir sey donmez; hicbir gruba uye olmayan kullanici
  // icin bes dalli birlesimi bosuna kurmanin anlami yok.
  if (groupIds.length === 0) {
    return { events: [], total: 0 };
  }

  const events = (await db
    .from(eventsUnion(groupIds).as('events'))
    // Aktor her olayda var (NOT NULL kolonlardan geliyor) -> inner join.
    .join('users as actor', 'actor.id', 'events.actor_id')
    // Karsi taraf yalnizca odeme olaylarinda -> left join; harcama satirlarinda
    // inner join butun harcamalari akistan silerdi.
    .leftJoin('users as counterparty', 'counterparty.id', 'events.counterparty_id')
    .orderBy([
      { column: 'events.occurred_at', order: 'desc' },
      { column: 'events.event_id', order: 'desc' },
      { column: 'events.kind', order: 'desc' },
    ])
    .limit(page.limit)
    .offset(page.offset)
    .select(
      'events.*',
      'actor.name as actor_name',
      'counterparty.name as counterparty_name'
    )) as unknown as ActivityRow[];

  const [{ count }] = (await db
    .from(eventsUnion(groupIds).as('events'))
    // Sayimda ad join'leri yok: kac olay oldugu adlardan bagimsiz.
    .count('* as count')) as unknown as { count: string }[];

  // pg surucusu COUNT'u string dondurur; API'de sayi bekleniyor.
  return { events, total: Number(count) };
};

export default { listForGroups };
