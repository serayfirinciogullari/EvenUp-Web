import db from '../db/connection';
import { PUBLIC_USER_COLUMNS } from './user.model';

import type { PublicUser } from './user.model';
import type { PageParams } from '../utils/pagination';
import type { Knex } from 'knex';

/**
 * Admin panelinin veri erisim katmani.
 *
 * GIZLILIK SINIRI — BU DOSYANIN ASIL ISI
 * --------------------------------------
 * "Admin harcama/grup icerigine mudahale etmez" karari **burada**, sorgu
 * seviyesinde uygulanir; response'u kirpmakla degil. Somut kural:
 *
 *   - `listGroupMeta` `expenses` ve `expense_shares` tablolarina **hic
 *     dokunmaz**. Sadece `groups` + `group_members` okunur. Yani grup listesine
 *     ileride yeni bir alan eklense bile oradan harcama verisi cikamaz:
 *     sorguda o tablolar yok.
 *   - `collectStats` `expenses` tablosunu yalnizca **COUNT/SUM** icin okur ve
 *     sonucu tek satirlik toplamdir. `GROUP BY group_id` bilincli olarak yok:
 *     grup basina hacim, "hangi ev ne kadar harciyor" demek olurdu.
 *   - Hicbir sorgu `description`, `category`, `amount` ya da `share_amount`
 *     kolonunu satir bazinda SELECT etmez.
 *
 * Gerekce ve iki katmanin (sorgu / serialization) karsilastirmasi:
 * docs/decisions/1.8.md
 */

export interface AdminUserFilters extends PageParams {
  /** E-posta ya da isim icinde aranir. Bos ise filtre uygulanmaz. */
  search?: string;
  /** Yalnizca aktif ya da yalnizca pasif kullanicilar. */
  isActive?: boolean;
  role?: 'admin' | 'user';
}

export interface AdminUserPage {
  users: PublicUser[];
  total: number;
}

/** Grup listesinde donen **tek** gorunum: yalnizca ust veri. */
export interface GroupMetaView {
  id: string;
  name: string;
  created_at: Date;
  member_count: number;
}

export interface GroupMetaPage {
  groups: GroupMetaView[];
  total: number;
}

export interface PeriodStats {
  new_users: number;
  new_groups: number;
  expense_count: number;
  expense_volume: string;
}

export interface AdminStats {
  users: { total: number; active: number; inactive: number };
  groups: { active: number; deleted: number };
  expenses: { count: number; volume: string };
  settlements: { confirmed_count: number; confirmed_volume: string };
  trends: { last_7_days: PeriodStats; last_30_days: PeriodStats };
}

/* -------------------------------------------------------------- yardimcilar */

/**
 * LIKE desenindeki ozel karakterleri kacisla korur.
 *
 * Kacilmasaydi `%` iceren bir arama terimi joker olarak yorumlanirdi: tek
 * basina `%` yazan bir istek filtreyi tamamen etkisiz kilar, `_` ise herhangi
 * bir karakterle eslesirdi. Guvenlik acigi degil ama sessiz bir yanlis sonuc.
 * PostgreSQL'de LIKE'in varsayilan kacis karakteri ters bolu.
 */
const escapeLike = (term: string): string => term.replace(/[\\%_]/g, (char) => `\\${char}`);

/** pg surucusu COUNT'u string dondurur; API'de sayi bekleniyor. */
const toCount = (value: unknown): number => Number(value ?? 0);

/* ------------------------------------------------------------- kullanicilar */

/** Filtreleri tasiyan taban sorgu. Sayim ve sayfa icin ayri ayri kurulur. */
const usersQuery = (filters: AdminUserFilters): Knex.QueryBuilder => {
  const query = db('users');

  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`;
    // E-posta VEYA isim; parantez icinde gruplanir ki diger filtrelerle
    // AND iliskisi bozulmasin.
    query.where((builder) => builder.whereILike('email', pattern).orWhereILike('name', pattern));
  }

  if (filters.isActive !== undefined) {
    query.where('is_active', filters.isActive);
  }

  if (filters.role) {
    query.where('role', filters.role);
  }

  return query;
};

/**
 * Kullanici listesi — `password_hash` buraya da giremez: sutunlar
 * `PUBLIC_USER_COLUMNS`'tan geliyor (1.3'te kurulan tek liste).
 *
 * Siralama `created_at DESC, id DESC`: yalnizca tarihe gore siralamak ayni anda
 * kaydolan iki kullanicida sirayi belirsiz birakir ve ayni satir iki sayfada
 * gorunebilirdi.
 */
const listUsers = async (filters: AdminUserFilters): Promise<AdminUserPage> => {
  const users = (await usersQuery(filters)
    .select([...PUBLIC_USER_COLUMNS])
    .orderBy([
      { column: 'created_at', order: 'desc' },
      { column: 'id', order: 'desc' },
    ])
    .limit(filters.limit)
    .offset(filters.offset)) as unknown as PublicUser[];

  const [{ count }] = (await usersQuery(filters).count('id as count')) as unknown as {
    count: string;
  }[];

  return { users, total: toCount(count) };
};

/* -------------------------------------------------------------- gruplar */

const groupsQuery = (search?: string): Knex.QueryBuilder => {
  const query = db('groups').whereNull('groups.deleted_at');

  if (search) {
    query.whereILike('groups.name', `%${escapeLike(search)}%`);
  }

  return query;
};

/**
 * Grup **ust verisi**: ad, olusturulma tarihi, uye sayisi. Baska hicbir sey.
 *
 * Sorgu yalnizca `groups` ve `group_members` tablolarina dokunur; `expenses`
 * ve `expense_shares` bu dosyanin bu fonksiyonunda hic gecmez. Uye sayisi bile
 * `group_members` uzerinden COUNT — kimlerin uye oldugu donmez.
 *
 * `description` de bilincli olarak disarida: kullanicinin yazdigi serbest
 * metin, grup icerigi sayilir (bkz. docs/decisions/1.8.md).
 */
const listGroupMeta = async (page: PageParams, search?: string): Promise<GroupMetaPage> => {
  const rows = (await groupsQuery(search)
    .leftJoin('group_members', 'group_members.group_id', 'groups.id')
    .groupBy('groups.id')
    .select('groups.id', 'groups.name', 'groups.created_at')
    .count('group_members.id as member_count')
    .orderBy([
      { column: 'groups.created_at', order: 'desc' },
      { column: 'groups.id', order: 'desc' },
    ])
    .limit(page.limit)
    .offset(page.offset)) as unknown as (Omit<GroupMetaView, 'member_count'> & {
    member_count: string;
  })[];

  const [{ count }] = (await groupsQuery(search).count('groups.id as count')) as unknown as {
    count: string;
  }[];

  return {
    groups: rows.map((row) => ({ ...row, member_count: toCount(row.member_count) })),
    total: toCount(count),
  };
};

/* ------------------------------------------------------------ istatistik */

/**
 * Belirli bir gun araligi icin toplamlar. `days` sayisi koddan gelir,
 * kullanicidan degil — dogrudan interval'e gomulmesi bu yuzden guvenli.
 */
const periodStats = async (days: number): Promise<PeriodStats> => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [users, groups, expenses] = await Promise.all([
    db('users').where('created_at', '>=', since).count('id as count').first(),
    db('groups')
      .whereNull('deleted_at')
      .where('created_at', '>=', since)
      .count('id as count')
      .first(),
    db('expenses')
      .join('groups', 'groups.id', 'expenses.group_id')
      .whereNull('expenses.deleted_at')
      .whereNull('groups.deleted_at')
      .where('expenses.created_at', '>=', since)
      .select(
        db.raw('COUNT(expenses.id) as count'),
        db.raw('COALESCE(SUM(expenses.amount), 0)::numeric(12,2)::text as volume')
      )
      .first(),
  ]);

  const expenseTotals = expenses as unknown as { count?: string; volume?: string } | undefined;

  return {
    new_users: toCount((users as unknown as { count?: string } | undefined)?.count),
    new_groups: toCount((groups as unknown as { count?: string } | undefined)?.count),
    expense_count: toCount(expenseTotals?.count),
    expense_volume: expenseTotals?.volume ?? '0',
  };
};

/**
 * Panel ozeti. **Tamami toplam** — hicbir sorgu satir dondurmez.
 *
 * `expenses` ve `settlements` tablolari yalnizca COUNT/SUM icin okunur ve
 * sonuc tek satirdir. `GROUP BY group_id` bilincli olarak yok: grup basina
 * hacim, admin'e "hangi ev ne kadar harciyor" bilgisini verirdi.
 */
const collectStats = async (): Promise<AdminStats> => {
  const [userRow, groupRow, expenseRow, settlementRow, last7, last30] = await Promise.all([
    db('users')
      .select(
        db.raw('COUNT(id) as total'),
        db.raw('COUNT(id) FILTER (WHERE is_active) as active'),
        db.raw('COUNT(id) FILTER (WHERE NOT is_active) as inactive')
      )
      .first(),
    db('groups')
      .select(
        db.raw('COUNT(id) FILTER (WHERE deleted_at IS NULL) as active'),
        db.raw('COUNT(id) FILTER (WHERE deleted_at IS NOT NULL) as deleted')
      )
      .first(),
    db('expenses')
      .join('groups', 'groups.id', 'expenses.group_id')
      .whereNull('expenses.deleted_at')
      .whereNull('groups.deleted_at')
      .select(
        db.raw('COUNT(expenses.id) as count'),
        db.raw('COALESCE(SUM(expenses.amount), 0)::numeric(12,2)::text as volume')
      )
      .first(),
    db('settlements')
      .join('groups', 'groups.id', 'settlements.group_id')
      .whereNull('groups.deleted_at')
      .where('settlements.status', 'confirmed')
      .select(
        db.raw('COUNT(settlements.id) as count'),
        db.raw('COALESCE(SUM(settlements.amount), 0)::numeric(12,2)::text as volume')
      )
      .first(),
    periodStats(7),
    periodStats(30),
  ]);

  const users = userRow as unknown as
    { total?: string; active?: string; inactive?: string } | undefined;
  const groups = groupRow as unknown as { active?: string; deleted?: string } | undefined;
  const expenses = expenseRow as unknown as { count?: string; volume?: string } | undefined;
  const settlements = settlementRow as unknown as { count?: string; volume?: string } | undefined;

  return {
    users: {
      total: toCount(users?.total),
      active: toCount(users?.active),
      inactive: toCount(users?.inactive),
    },
    groups: { active: toCount(groups?.active), deleted: toCount(groups?.deleted) },
    expenses: { count: toCount(expenses?.count), volume: expenses?.volume ?? '0' },
    settlements: {
      confirmed_count: toCount(settlements?.count),
      confirmed_volume: settlements?.volume ?? '0',
    },
    trends: { last_7_days: last7, last_30_days: last30 },
  };
};

export default { listUsers, listGroupMeta, collectStats };
