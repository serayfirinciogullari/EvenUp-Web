import db from '../db/connection';
import { formatCents } from '../utils/money';

import type { ExpenseRow, ExpenseSplitType } from '../types/models';
import type { Knex } from 'knex';

/**
 * expenses / expense_shares veri erisim katmani.
 *
 * `group.model` ile ayni iki kural gecerli:
 *
 * 1. **Silinmis harcama hicbir sorgudan donmez.** Soft delete kullanildigi icin
 *    `deleted_at IS NULL` filtresini unutmak, silinmis bir harcamayi bakiyeye
 *    geri sokar. Bu yuzden harcama okuyan her sorgu buradan gecer; servis
 *    katmani dogrudan `db('expenses')` cagirmaz. Ayni sebeple paylar da her
 *    zaman canli harcama uzerinden okunur (`expense_shares` satirlari silinen
 *    harcamada yerinde durur, sadece gorunmez olur).
 * 2. **Harcama ve paylari tek transaction'da yazilir.** Yarim kalirsa paylarin
 *    toplami harcamaya esit olmaz — bolusturmenin tum garantisi bu esitlikte.
 *
 * Tutarlar DB'ye NUMERIC(10,2) olarak yazilir, uygulamada kurus olarak
 * dolasir. Cevrim bu dosyanin sinirinda yapilir (`formatCents`).
 */

/** Bir paya ait satir + kullanici adi (arayuz "kim ne kadar" gosterebilsin). */
export interface ExpenseShareView {
  user_id: string;
  name: string;
  share_amount: string;
}

/** Harcama + odeyen/giren adlari + paylar. API'nin dondugu tam gorunum. */
export interface ExpenseWithShares extends ExpenseRow {
  payer_name: string;
  creator_name: string;
  shares: ExpenseShareView[];
}

export interface CreateExpenseInput {
  group_id: string;
  paid_by: string;
  created_by: string;
  amount_cents: number;
  description: string;
  category: string;
  split_type: ExpenseSplitType;
  shares: readonly { userId: string; cents: number }[];
}

export interface UpdateExpenseInput {
  paid_by?: string;
  amount_cents?: number;
  description?: string;
  category?: string;
  split_type?: ExpenseSplitType;
  /** Verilirse mevcut paylarin **tamami** silinip yerine bunlar yazilir. */
  shares?: readonly { userId: string; cents: number }[];
}

export interface Page {
  limit: number;
  offset: number;
}

export interface ExpensePage {
  expenses: ExpenseWithShares[];
  total: number;
}

/* -------------------------------------------------------------- yardimcilar */

/** Canli harcamalar icin temel sorgu. Silinmis grubun harcamasi da gelmez. */
const aliveExpenses = (trx?: Knex.Transaction): Knex.QueryBuilder =>
  (trx ?? db)('expenses')
    .join('groups', 'groups.id', 'expenses.group_id')
    .whereNull('expenses.deleted_at')
    .whereNull('groups.deleted_at');

const shareRowsFor = async (expenseIds: readonly string[]): Promise<ExpenseShareView[]> => {
  if (expenseIds.length === 0) {
    return [];
  }

  return db('expense_shares as es')
    .join('users as u', 'u.id', 'es.user_id')
    .whereIn('es.expense_id', expenseIds as string[])
    .orderBy('u.name', 'asc')
    .select('es.expense_id', 'es.user_id', 'u.name', 'es.share_amount') as unknown as Promise<
    (ExpenseShareView & { expense_id: string })[]
  >;
};

/** Harcama satirlarini paylariyla birlestirir (N+1 yerine tek ek sorgu). */
const attachShares = async (
  rows: (ExpenseRow & { payer_name: string; creator_name: string })[]
): Promise<ExpenseWithShares[]> => {
  const shares = (await shareRowsFor(rows.map((row) => row.id))) as (ExpenseShareView & {
    expense_id: string;
  })[];

  const byExpense = new Map<string, ExpenseShareView[]>();
  for (const { expense_id: expenseId, ...share } of shares) {
    const list = byExpense.get(expenseId) ?? [];
    list.push(share);
    byExpense.set(expenseId, list);
  }

  return rows.map((row) => ({ ...row, shares: byExpense.get(row.id) ?? [] }));
};

const toShareRows = (
  expenseId: string,
  shares: readonly { userId: string; cents: number }[]
): { expense_id: string; user_id: string; share_amount: string }[] =>
  shares.map((share) => ({
    expense_id: expenseId,
    user_id: share.userId,
    share_amount: formatCents(share.cents),
  }));

/* ------------------------------------------------------------------ okuma */

/** Canli harcama satiri. Silinmis harcama/grup icin `undefined`. */
const findById = async (expenseId: string): Promise<ExpenseRow | undefined> =>
  aliveExpenses().where('expenses.id', expenseId).select('expenses.*').first();

const findWithShares = async (expenseId: string): Promise<ExpenseWithShares | undefined> => {
  const row = await aliveExpenses()
    .join('users as payer', 'payer.id', 'expenses.paid_by')
    .join('users as creator', 'creator.id', 'expenses.created_by')
    .where('expenses.id', expenseId)
    .select('expenses.*', 'payer.name as payer_name', 'creator.name as creator_name')
    .first();

  if (!row) {
    return undefined;
  }

  const [withShares] = await attachShares([row]);
  return withShares;
};

/**
 * Grubun harcamalari — sayfalanmis. Toplam sayi ayni filtreyle ayrica sorulur;
 * arayuzun "kac sayfa var" sorusunu yanitlayabilmesi icin gerekli.
 *
 * Siralama `created_at DESC, id DESC`: sadece created_at ile siralamak ayni
 * anda eklenen iki harcamada sirayi belirsiz birakir ve ayni satir iki farkli
 * sayfada gorunebilir. `id` tie-break'i sirayi kesinlestirir.
 */
const listByGroup = async (groupId: string, page: Page): Promise<ExpensePage> => {
  const rows = await aliveExpenses()
    .join('users as payer', 'payer.id', 'expenses.paid_by')
    .join('users as creator', 'creator.id', 'expenses.created_by')
    .where('expenses.group_id', groupId)
    .orderBy([
      { column: 'expenses.created_at', order: 'desc' },
      { column: 'expenses.id', order: 'desc' },
    ])
    .limit(page.limit)
    .offset(page.offset)
    .select('expenses.*', 'payer.name as payer_name', 'creator.name as creator_name');

  const [{ count }] = await aliveExpenses()
    .where('expenses.group_id', groupId)
    .count<{ count: string }[]>('expenses.id as count');

  return {
    expenses: await attachShares(rows),
    // pg surucusu COUNT'u string dondurur; API'de sayi bekleniyor.
    total: Number(count),
  };
};

/* ------------------------------------------------------------------ yazma */

/**
 * Harcamayi ve paylarini tek transaction'da yazar.
 * Ayri ayri yazilsaydi ikinci INSERT patladiginda paysiz — yani bakiyeyi
 * sessizce bozan — bir harcama satiri kalirdi.
 */
const create = async (input: CreateExpenseInput): Promise<ExpenseWithShares> => {
  const expense = await db.transaction(async (trx) => {
    const [created] = await trx('expenses')
      .insert({
        group_id: input.group_id,
        paid_by: input.paid_by,
        created_by: input.created_by,
        amount: formatCents(input.amount_cents),
        description: input.description,
        category: input.category,
        split_type: input.split_type,
      })
      .returning('*');

    await trx('expense_shares').insert(toShareRows(created.id, input.shares));

    return created;
  });

  const detail = await findWithShares(expense.id);

  if (!detail) {
    throw new Error(`Olusturulan harcama okunamadi: ${expense.id}`);
  }

  return detail;
};

/**
 * Harcamayi gunceller; `shares` verilmisse paylarin tamamini degistirir.
 *
 * Paylar tek tek guncellenmez, silinip yeniden yazilir: katilimci listesi de
 * degisebiliyor (biri cikar, biri girer) ve "eskiyi guncelle + yeniyi ekle +
 * ayrilani sil" uc adiminin yarisi calisirsa toplam tutmaz. Silme+ekleme tek
 * adimda ayni sonucu verir.
 */
const update = async (
  expenseId: string,
  input: UpdateExpenseInput
): Promise<ExpenseWithShares | undefined> => {
  const updated = await db.transaction(async (trx) => {
    const patch: Record<string, unknown> = { updated_at: new Date() };

    if (input.paid_by !== undefined) patch.paid_by = input.paid_by;
    if (input.description !== undefined) patch.description = input.description;
    if (input.category !== undefined) patch.category = input.category;
    if (input.split_type !== undefined) patch.split_type = input.split_type;
    if (input.amount_cents !== undefined) patch.amount = formatCents(input.amount_cents);

    const [expense] = await trx('expenses')
      .where({ id: expenseId })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*');

    if (!expense) {
      return undefined;
    }

    if (input.shares) {
      await trx('expense_shares').where({ expense_id: expenseId }).del();
      await trx('expense_shares').insert(toShareRows(expenseId, input.shares));
    }

    return expense;
  });

  return updated ? findWithShares(updated.id) : undefined;
};

/**
 * Soft delete: harcama satiri durur, `deleted_at` doldurulur.
 * `expense_shares` satirlarina **dokunulmaz** — silinmeleri gerekmiyor, cunku
 * paylar yalnizca canli harcama uzerinden okunuyor. Boylece yanlislikla
 * silinen bir harcamayi geri almak tek UPDATE; paylar silinseydi bolusturme
 * bilgisi geri donusu olmadan giderdi. Gerekce docs/decisions/1.5.md icinde.
 */
const softDelete = async (expenseId: string): Promise<ExpenseRow | undefined> => {
  const [deleted] = await db('expenses')
    .where({ id: expenseId })
    .whereNull('deleted_at')
    .update({ deleted_at: new Date(), updated_at: new Date() })
    .returning('*');

  return deleted;
};

export default {
  findById,
  findWithShares,
  listByGroup,
  create,
  update,
  softDelete,
};
