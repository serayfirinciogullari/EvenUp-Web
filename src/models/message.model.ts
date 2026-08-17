import db from '../db/connection';

import type { GroupMessageRow, GroupMessageType } from '../types/models';

/**
 * group_messages veri erisim katmani.
 *
 * `group.model` / `expense.model` ile ayni iki kural gecerli:
 *
 * 1. **Silinmis mesaj hicbir feed sorgusundan donmez.** "Geri al" soft delete
 *    ile calisir (satir durur, `deleted_at` dolar). Feed okuyan sorgu bu yuzden
 *    her zaman `deleted_at IS NULL` filtreler; servis dogrudan `db('group_messages')`
 *    cagirmaz.
 * 2. **expense_created satirinin harcama ozeti tek sorguda gelir.** Feed'i
 *    okuyan arayuz ayrica `GET /expenses/:id` cagirmak zorunda kalmasin diye
 *    tutar/aciklama JOIN ile eklenir (bkz. `listByGroup`). Silinmis harcamaya
 *    LEFT JOIN yapilir; harcama olusturma mesajinin kendisi de silinen harcamada
 *    zaten `deleted_at` ile isaretlendigi icin (1) bu satiri feed'den zaten
 *    dusurur — JOIN'deki `deleted_at IS NULL` ikinci savunma hatti.
 *
 * Satirin turu ile dolu kolon arasindaki tutarlilik migration 13'teki CHECK ile
 * DB'de zorlaniyor; buradaki insert yardimcilari o sekle uyan govdeler uretir.
 */

/** expense_created satirinda feed'e gomulen harcama ozeti. */
export interface FeedExpenseSummary {
  id: string;
  amount: string;
  description: string;
  category: string;
  paid_by: string;
  /** "Geri al" butonunu kimin gorecegini arayuz buna gore secer (1.5 kurali). */
  created_by: string;
}

/** Feed satiri: `GroupMessageRow`'un disariya acilan hali (deleted_at yok) +
 *  expense_created satirlarinda harcama ozeti (digerlerinde `null`). */
export interface GroupMessageView {
  id: string;
  group_id: string;
  sender_id: string | null;
  type: GroupMessageType;
  content: string | null;
  expense_id: string | null;
  receipt_draft_id: string | null;
  created_at: Date;
  expense: FeedExpenseSummary | null;
}

export interface Page {
  limit: number;
  offset: number;
}

export interface MessagePage {
  messages: GroupMessageView[];
  total: number;
}

/* ----------------------------------------------------------------- yazma */

/**
 * user_text: kullanicinin yazdigi ham metin. `content` zorunlu, referans yok.
 */
const insertUserText = async (input: {
  group_id: string;
  sender_id: string;
  content: string;
}): Promise<GroupMessageRow> => {
  const [row] = await db('group_messages')
    .insert({
      group_id: input.group_id,
      sender_id: input.sender_id,
      type: 'user_text',
      content: input.content,
    })
    .returning('*');

  return row;
};

/**
 * ai_clarification: AI'in "harcamayi olusturamadim, sunu netlestir" sorusu.
 * `sender_id` NULL (insan gondermedi), `content` soru metni.
 */
const insertAiClarification = async (input: {
  group_id: string;
  content: string;
}): Promise<GroupMessageRow> => {
  const [row] = await db('group_messages')
    .insert({
      group_id: input.group_id,
      sender_id: null,
      type: 'ai_clarification',
      content: input.content,
    })
    .returning('*');

  return row;
};

/**
 * expense_created: bir harcama olustugunda feed'e dusen referans satiri.
 * `sender_id` harcamayi **giren** kisi (chat'te mesaji atan, formda ekleyen).
 *
 * Bu fonksiyon expenses'in olusturuldugu **tek ortak yerden** cagrilir
 * (expense.service.createExpense), boylece harcama ister chat ister form ister
 * fis onayindan gelsin ayni feed satirini uretir. Gerekce:
 * docs/decisions/grup-detay-sohbet.md
 */
const insertExpenseCreated = async (input: {
  group_id: string;
  sender_id: string;
  expense_id: string;
}): Promise<GroupMessageRow> => {
  const [row] = await db('group_messages')
    .insert({
      group_id: input.group_id,
      sender_id: input.sender_id,
      type: 'expense_created',
      expense_id: input.expense_id,
    })
    .returning('*');

  return row;
};

/**
 * receipt_draft_ref: bir fis taslagi olustugunda feed'e dusen "fis yuklendi,
 * duzenleniyor..." referansi.
 *
 * 3.5.2 (fis akisi) HENUZ BAGLI DEGIL — bu yardimci simdiden yazildi ki o
 * migration/servis geldiginde yalnizca cagirmasi yetsin, feed semasi degismesin.
 */
const insertReceiptDraftRef = async (input: {
  group_id: string;
  sender_id: string;
  receipt_draft_id: string;
}): Promise<GroupMessageRow> => {
  const [row] = await db('group_messages')
    .insert({
      group_id: input.group_id,
      sender_id: input.sender_id,
      type: 'receipt_draft_ref',
      receipt_draft_id: input.receipt_draft_id,
    })
    .returning('*');

  return row;
};

/**
 * Bir harcamanin `expense_created` mesaj(lar)ini soft delete eder.
 * DELETE /expenses/:id bu harcamayi silince feed'deki karti da kaldirmak icin
 * (bkz. expense.service.deleteExpense). Donen sayi 0 ise ilgili mesaj yoktu —
 * cagiran taraf icin hata degil.
 */
const softDeleteByExpenseId = async (expenseId: string): Promise<number> =>
  db('group_messages')
    .where({ expense_id: expenseId, type: 'expense_created' })
    .whereNull('deleted_at')
    .update({ deleted_at: new Date() });

/* ----------------------------------------------------------------- okuma */

/** Canli `expense_created` mesajini harcama ID'sinden bulur (POST cevabinda
 *  yeni eklenen feed satirini dondurebilmek icin). */
const findExpenseCreatedByExpenseId = async (
  expenseId: string
): Promise<GroupMessageRow | undefined> =>
  db('group_messages')
    .where({ expense_id: expenseId, type: 'expense_created' })
    .whereNull('deleted_at')
    .orderBy('created_at', 'desc')
    .first();

/** pg surucusu NUMERIC/COUNT'u string dondurur; bu satir tipi o ham hali yansitir. */
interface RawFeedRow {
  id: string;
  group_id: string;
  sender_id: string | null;
  type: GroupMessageType;
  content: string | null;
  expense_id: string | null;
  receipt_draft_id: string | null;
  created_at: Date;
  expense_amount: string | null;
  expense_description: string | null;
  expense_category: string | null;
  expense_paid_by: string | null;
  expense_created_by: string | null;
}

const toView = (row: RawFeedRow): GroupMessageView => ({
  id: row.id,
  group_id: row.group_id,
  sender_id: row.sender_id,
  type: row.type,
  content: row.content,
  expense_id: row.expense_id,
  receipt_draft_id: row.receipt_draft_id,
  created_at: row.created_at,
  expense:
    row.type === 'expense_created' && row.expense_amount !== null
      ? {
          id: row.expense_id as string,
          amount: row.expense_amount,
          description: row.expense_description as string,
          category: row.expense_category as string,
          paid_by: row.expense_paid_by as string,
          created_by: row.expense_created_by as string,
        }
      : null,
});

/**
 * Grubun feed'i — sayfalanmis, en yeni ustte (created_at DESC, id DESC).
 *
 * Siralama expense.model.listByGroup ile ayni gerekce: yalnizca created_at ile
 * siralamak ayni anda eklenen iki satirda sirayi belirsiz birakir ve ayni satir
 * iki farkli sayfada gorunebilir; `id` tie-break sirayi kesinlestirir. Arayuz
 * sayfayi kronolojik gostermek icin ters cevirir (sohbet en altta en yeni).
 *
 * expense_created satirlarina **canli** harcama LEFT JOIN edilir; boylece feed
 * tutar/aciklamayi tasir ve arayuz ayrica /expenses/:id cagirmaz.
 */
const listByGroup = async (groupId: string, page: Page): Promise<MessagePage> => {
  const rows = (await db('group_messages as gm')
    .leftJoin('expenses as e', function joinAliveExpense() {
      this.on('e.id', '=', 'gm.expense_id').andOnNull('e.deleted_at');
    })
    .where('gm.group_id', groupId)
    .whereNull('gm.deleted_at')
    .orderBy([
      { column: 'gm.created_at', order: 'desc' },
      { column: 'gm.id', order: 'desc' },
    ])
    .limit(page.limit)
    .offset(page.offset)
    .select(
      'gm.id',
      'gm.group_id',
      'gm.sender_id',
      'gm.type',
      'gm.content',
      'gm.expense_id',
      'gm.receipt_draft_id',
      'gm.created_at',
      'e.amount as expense_amount',
      'e.description as expense_description',
      'e.category as expense_category',
      'e.paid_by as expense_paid_by',
      'e.created_by as expense_created_by'
    )) as unknown as RawFeedRow[];

  const [{ count }] = await db('group_messages')
    .where({ group_id: groupId })
    .whereNull('deleted_at')
    .count<{ count: string }[]>('id as count');

  return {
    messages: rows.map(toView),
    total: Number(count),
  };
};

export default {
  insertUserText,
  insertAiClarification,
  insertExpenseCreated,
  insertReceiptDraftRef,
  softDeleteByExpenseId,
  findExpenseCreatedByExpenseId,
  listByGroup,
};
