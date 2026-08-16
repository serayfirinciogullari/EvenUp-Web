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

/** Netlestirmeye beslenecek minimal harcama gorunumu (bkz. `listForNetting`). */
export interface NettingExpense {
  id: string;
  paid_by: string;
  amount: string;
}

export interface NettingShare {
  expense_id: string;
  user_id: string;
  share_amount: string;
}

export interface NettingData {
  expenses: NettingExpense[];
  shares: NettingShare[];
}

/** Coklu grup okumasinda satirin hangi gruba ait oldugu da lazim. */
export interface NettingExpenseOfGroup extends NettingExpense {
  group_id: string;
}

export interface GroupedNettingData {
  expenses: NettingExpenseOfGroup[];
  shares: NettingShare[];
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

/**
 * Bakiye hesabi icin grubun **tum** canli harcamalari ve paylari.
 *
 * Neden sayfalanmiyor: netlestirme kismi veriyle calisamaz. Bir sayfa harcama
 * ile hesaplanan bakiye "kim kime ne kadar borclu" sorusuna yanlis cevap verir;
 * tanim geregi butun gecmise bakmak gerekir.
 *
 * Doner alan adlari `netting.service`'in bekledigi bicimde (snake_case), yani
 * cikti donusum yapilmadan dogrudan `calculateNetBalances`'a verilebilir.
 */
const listForNetting = async (groupId: string): Promise<NettingData> => {
  const expenses = (await aliveExpenses()
    .where('expenses.group_id', groupId)
    .select('expenses.id', 'expenses.paid_by', 'expenses.amount')) as unknown as NettingExpense[];

  const shares = (await db('expense_shares')
    .whereIn(
      'expense_id',
      expenses.map((expense) => expense.id)
    )
    .select('expense_id', 'user_id', 'share_amount')) as unknown as NettingShare[];

  return { expenses, shares };
};

/**
 * `listForNetting`in **coklu grup** hali: kac grup verilirse verilsin toplam
 * iki sorgu atar (harcamalar + paylar), grup basina degil.
 *
 * NEDEN AYRI BIR FONKSIYON — DONGUDE `listForNetting` DEGIL
 * ---------------------------------------------------------
 * Home ozeti (docs/decisions/home-summary.md) kullanicinin **tum** gruplarinin
 * bakiyesini birden istiyor. `listForNetting`i N kez cagirmak 2N sorgu demekti;
 * 10 gruplu bir kullanicida her Home acilisinda 20 gidis-donus. Sorgu sayisi
 * grup sayisindan bagimsiz olmali — `attachShares`taki (1.5) ilkenin aynisi.
 *
 * Paylar gruba gore degil **harcamaya** gore filtreleniyor: bir pay satiri
 * zaten tek bir harcamaya bagli, harcama da tek bir gruba. Cagiran taraf
 * `expense_id -> group_id` esleme ile bellekte gruplayabilir.
 */
const listForNettingByGroups = async (groupIds: readonly string[]): Promise<GroupedNettingData> => {
  // Bos liste ile sorguya cikmak gereksiz: `WHERE ... IN ()` hicbir sey donmez.
  if (groupIds.length === 0) {
    return { expenses: [], shares: [] };
  }

  const expenses = (await aliveExpenses()
    .whereIn('expenses.group_id', groupIds as string[])
    .select(
      'expenses.id',
      'expenses.group_id',
      'expenses.paid_by',
      'expenses.amount'
    )) as unknown as NettingExpenseOfGroup[];

  const shares = (await db('expense_shares')
    .whereIn(
      'expense_id',
      expenses.map((expense) => expense.id)
    )
    .select('expense_id', 'user_id', 'share_amount')) as unknown as NettingShare[];

  return { expenses, shares };
};

/**
 * Kullanicinin **odedigi** harcamalarin belirli bir tarih araliktaki toplami —
 * grup ayrimi olmadan, tek sorguda.
 *
 * Aralik `[from, to)`: ust sinir disarida. Ay sonunu `<= ayin son gunu` diye
 * yazmak, gunun 00:00'dan sonraki kayitlarini disarida birakirdi; "sonraki ayin
 * 1'inden kucuk" demek bu sinif hatalari tamamen ortadan kaldiriyor.
 *
 * Toplam SQL'de aliniyor: `amount` NUMERIC, PostgreSQL'in SUM'i de tam ondalik.
 * Satirlari cekip JS'te toplamak float dunyasina girmek olurdu (bkz. 1.5).
 * Donen deger NUMERIC metni; hic satir yoksa SUM `NULL` verir, `'0'`a cevriliyor.
 */
const sumPaidByUserBetween = async (userId: string, from: Date, to: Date): Promise<string> => {
  const [row] = (await aliveExpenses()
    .where('expenses.paid_by', userId)
    .where('expenses.created_at', '>=', from)
    .where('expenses.created_at', '<', to)
    .sum('expenses.amount as total')) as unknown as { total: string | null }[];

  return row?.total ?? '0';
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
  listForNetting,
  listForNettingByGroups,
  sumPaidByUserBetween,
  create,
  update,
  softDelete,
};
